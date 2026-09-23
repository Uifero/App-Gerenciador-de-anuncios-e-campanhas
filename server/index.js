// Proxy da API da Anthropic para o Gerenciador de Criativos e Campanhas.
// Motivo: a chave da Anthropic NUNCA pode ir para o navegador. O frontend envia o
// ID token do Firebase; aqui validamos o token e só então chamamos a Claude.
// Também decide o modelo de cada tarefa (barato x completo), aplica prompt caching ao perfil de marca
// e devolve o consumo de tokens + custo estimado para o app registrar em "gcc_uso_api".
import { gerarImagem, statusImagens } from './imagens.js';
import { animarImagem, statusVideo } from './videos.js';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import Anthropic from '@anthropic-ai/sdk';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8787);
const IS_PROD = process.env.NODE_ENV === 'production';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
// Atalho de teste local: jamais habilitado em produção.
const AUTH_BYPASS = !IS_PROD && process.env.DEV_AUTH_BYPASS === '1';

// ---------- provedor de IA ----------
// IA_PROVEDOR=auto (padrão): usa SEMPRE primeiro a assinatura do Claude (CLI `claude -p`, sem custo por token) e só recorre à API da
// Anthropic quando não der para usar a assinatura (CLI ausente/sem login, limite da assinatura atingido, erro) E houver ANTHROPIC_API_KEY.
// Num servidor sem o Claude logado a CLI falha uma vez e fica em pausa por alguns minutos (as chamadas vão direto para a API).
// 'cli' = só assinatura | 'api' = só API. Atenção: a assinatura é pessoal e as chamadas são seriais (máx. 2) e mais lentas que a API.
const PEDIDO = (process.env.IA_PROVEDOR || 'auto').toLowerCase();
const PROVEDOR = PEDIDO === 'api' ? 'api' : 'cli';
const CLI_BIN = process.env.IA_CLI_BIN || 'claude';
let cliPausadaAte = 0; // circuit breaker: depois de uma falha da CLI, não tenta de novo por um tempo
const cliDisponivel = () => PROVEDOR === 'cli' && Date.now() >= cliPausadaAte;

// ---------- modelos e tarefas ----------
// Haiku: tarefas curtas e simples. Sonnet: tarefas que exigem raciocínio (criativo completo, mercado, site).
const MODELO_LEVE = process.env.ANTHROPIC_MODEL_LEVE || 'claude-haiku-4-5';
const MODELO_COMPLEXO = process.env.ANTHROPIC_MODEL_COMPLEXO || 'claude-sonnet-5';

/** max = limite padrão de tokens de saída (o app pode sobrescrever por tarefa em Configurações). */
export const TAREFAS = {
  hooks:       { modelo: MODELO_LEVE,     max: 2000 },
  refino:      { modelo: MODELO_LEVE,     max: 3000 },
  checklist:   { modelo: MODELO_LEVE,     max: 1200 },
  imagem:      { modelo: MODELO_LEVE,     max: 1800 },
  criativos:   { modelo: MODELO_COMPLEXO, max: 8000,  effort: 'medium' },
  campanha:    { modelo: MODELO_COMPLEXO, max: 5000,  effort: 'medium' },
  referencias: { modelo: MODELO_COMPLEXO, max: 10000, effort: 'medium', web: true },
  analise:     { modelo: MODELO_COMPLEXO, max: 2500,  effort: 'low' },
  site:        { modelo: MODELO_COMPLEXO, max: 6000,  effort: 'low' },
  pacote:      { modelo: MODELO_COMPLEXO, max: 8000,  effort: 'low' },
  playbook:    { modelo: MODELO_COMPLEXO, max: 4000,  effort: 'low' },
  insights:    { modelo: MODELO_COMPLEXO, max: 3000,  effort: 'low' },
  diagnostico: { modelo: MODELO_COMPLEXO, max: 4000,  effort: 'medium' },
};

// Preço por 1M de tokens (US$), tabela de referência de 2026-06 — é ESTIMATIVA, confira em anthropic.com/pricing.
const PRECOS = { haiku: { entrada: 1, saida: 5 }, sonnet: { entrada: 2, saida: 10 }, opus: { entrada: 5, saida: 25 } };
const PRECO_BUSCA_WEB = 0.01; // US$ por busca web (10 US$ / 1000)
const familia = (m) => (/haiku/.test(m) ? 'haiku' : /opus/.test(m) ? 'opus' : 'sonnet');

/** Custo estimado em US$. Cache: leitura = 0,1x da entrada; escrita (5 min) = 1,25x. */
export function calcularCusto(modelo, u) {
  const p = PRECOS[familia(modelo)];
  const M = 1e6;
  return (u.entrada * p.entrada + u.cacheEscrita * p.entrada * 1.25 + u.cacheLeitura * p.entrada * 0.1 + u.saida * p.saida) / M + (u.buscasWeb || 0) * PRECO_BUSCA_WEB;
}

/** Parâmetros que dependem do modelo: só o Sonnet/Opus aceitam thinking adaptativo e effort (o Haiku 4.5 rejeita). */
export function paramsDoModelo(modelo, tarefa) {
  if (familia(modelo) === 'haiku') return {};
  return { thinking: { type: 'adaptive' }, output_config: { effort: tarefa.effort || 'medium' } };
}

// ---------- auth ----------
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

async function verificarToken(token) {
  if (AUTH_BYPASS && token === 'demo') return { email: 'demo@local' };
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });
  if (!payload.sub) throw new Error('token sem sub');
  if (ADMIN_EMAIL && String(payload.email || '').toLowerCase() !== ADMIN_EMAIL) {
    throw new Error('usuário não autorizado');
  }
  return payload;
}

async function exigirLogin(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ erro: 'Não autenticado.' });
  try {
    req.usuario = await verificarToken(m[1]);
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre novamente.' });
  }
}

// Limite simples por usuário para conter gasto acidental (30 chamadas/min).
const janela = new Map();
function limitar(req, res, next) {
  const chave = req.usuario?.sub || req.usuario?.email || 'x';
  const agora = Date.now();
  const lista = (janela.get(chave) || []).filter((t) => agora - t < 60_000);
  if (lista.length >= 30) return res.status(429).json({ erro: 'Muitas chamadas de IA em pouco tempo. Aguarde um minuto.' });
  lista.push(agora);
  janela.set(chave, lista);
  next();
}

/** Fila simples: no máximo 2 chamadas da CLI ao mesmo tempo (cada uma é um processo do Claude Code). */
let ativos = 0; const espera = [];
const vez = () => new Promise((ok) => { const t = () => { ativos++; ok(); }; ativos < 2 ? t() : espera.push(t); });
const liberar = () => { ativos--; espera.shift()?.(); };

/** Chama `claude -p` sem shell (o prompt vai por stdin; nenhum argumento vem do usuário) e converte a saída para o formato da API. */
async function viaCli({ tarefa, t, estavel, system, messages, webSearch }) {
  const prompt = [
    estavel, system,
    messages.map((m) => (messages.length > 1 ? (m.role === 'assistant' ? 'ASSISTENTE: ' : 'USUÁRIO: ') : '') + m.content).join('\n\n'),
  ].filter(Boolean).join('\n\n---\n\n');
  const busca = Boolean(webSearch && t.web);
  const args = ['-p', '--model', familia(t.modelo) === 'haiku' ? 'haiku' : 'sonnet', '--output-format', 'json', '--no-session-persistence',
    '--system-prompt', 'Você é um assistente que segue exatamente o formato de saída pedido pelo usuário. Não use ferramentas além das liberadas.',
    ...(busca ? ['--tools', 'WebSearch', '--allowedTools', 'WebSearch'] : ['--tools', ''])];
  const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_BASE_URL; delete env.ANTHROPIC_AUTH_TOKEN; // usa o login da assinatura
  await vez();
  try {
    const saida = await new Promise((ok, falha) => {
      const p = spawn(CLI_BIN, args, { cwd: os.tmpdir(), env, windowsHide: true });
      let out = '', err = '';
      const timer = setTimeout(() => { p.kill(); falha(new Error('A CLI do Claude demorou demais (3 min).')); }, 180_000);
      p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
      p.on('error', (e) => { clearTimeout(timer); falha(new Error('Não consegui executar a CLI "claude": ' + e.message)); });
      p.on('close', () => { clearTimeout(timer); ok({ out, err }); });
      p.stdin.end(prompt);
    });
    let j; try { j = JSON.parse(saida.out); } catch { throw new Error('Resposta inesperada da CLI do Claude: ' + (saida.err || saida.out).slice(0, 200)); }
    if (j.is_error) throw new Error('A CLI do Claude devolveu erro: ' + String(j.result || '').slice(0, 200));
    const u = j.usage || {};
    // Na assinatura não há cobrança por token: registramos os tokens e custo 0 (o app marca o provedor como "cli").
    return { texto: j.result || '', fontes: [], modelo: t.modelo, provedor: 'cli', uso: {
      entrada: u.input_tokens || 0, saida: u.output_tokens || 0, cacheEscrita: u.cache_creation_input_tokens || 0, cacheLeitura: u.cache_read_input_tokens || 0,
      buscasWeb: u.server_tool_use?.web_search_requests || 0, custoUsd: 0, modelo: t.modelo, provedor: 'cli',
    } };
  } finally { liberar(); }
}

const app = express();
app.disable('x-powered-by');
// Cabeçalhos de segurança básicos (helmet). CSP fica desligada por enquanto: o app serve um <script> inline
// (detecção de tema em index.html) e o navegador fala direto com domínios do Firebase/Google — uma política
// restritiva quebraria login e leitura de dados. Ativar com um allowlist dedicado é trabalho futuro deliberado,
// não um esquecimento. As demais proteções do helmet (X-Frame-Options, X-Content-Type-Options, HSTS, etc.)
// ficam ativas com os padrões da lib.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false, crossOriginEmbedderPolicy: false }));
// /api/video recebe a foto em base64 (até ~12 MB); as demais rotas ficam em 1 MB.
const jsonPadrao = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.path === '/api/video' ? next() : jsonPadrao(req, res, next)));

app.get('/api/saude', (_req, res) => {
  res.json({ ok: true, provedor: cliDisponivel() ? 'cli' : 'api', preferido: PROVEDOR, modelos: { leve: MODELO_LEVE, complexo: MODELO_COMPLEXO }, chaveConfigurada: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// Imagem por IA com vários provedores gratuitos em rodízio (ver server/imagens.js). Só o admin logado; teto de 60 por hora por usuário.
const imagensPorUsuario = new Map();
app.get('/api/imagem/status', exigirLogin, (_req, res) => res.json({ provedores: statusImagens() }));
app.post('/api/imagem', exigirLogin, async (req, res) => {
  const { prompt, formato } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1500) return res.status(400).json({ erro: 'Descrição da imagem inválida (até 1500 caracteres).' });
  const quem = req.usuario?.sub || req.usuario?.email || 'x', agora = Date.now();
  const recentes = (imagensPorUsuario.get(quem) || []).filter((t) => agora - t < 3_600_000);
  if (recentes.length >= 60) return res.status(429).json({ erro: 'Limite de 60 imagens por hora atingido.' });
  recentes.push(agora); imagensPorUsuario.set(quem, recentes);
  try { res.json(await gerarImagem({ prompt: prompt.trim(), formato })); }
  catch (e) { console.error('[imagem]', e?.message); res.status(e.status || 502).json({ erro: e.message || 'Falha ao gerar a imagem.' }); }
});

// Foto -> vídeo com IA (Pixazo/LTX, gratuito na prévia). Só o admin logado; teto de 20 por hora por usuário.
const videosPorUsuario = new Map();
app.get('/api/video/status', exigirLogin, (_req, res) => res.json(statusVideo()));
app.post('/api/video', exigirLogin, express.json({ limit: '14mb' }), async (req, res) => {
  const { imagem, prompt, formato } = req.body || {};
  const quem = req.usuario?.sub || req.usuario?.email || 'x', agora = Date.now();
  const recentes = (videosPorUsuario.get(quem) || []).filter((t) => agora - t < 3_600_000);
  if (recentes.length >= 20) return res.status(429).json({ erro: 'Limite de 20 vídeos por hora atingido.' });
  recentes.push(agora); videosPorUsuario.set(quem, recentes);
  try { const r = await animarImagem({ imagem, prompt, formato }); res.set('Content-Type', 'video/mp4').set('X-Provedor', encodeURIComponent(r.provedor)).send(r.video); }
  catch (e) { console.error('[video]', e?.message); res.status(e.status || 502).json({ erro: e.message || 'Falha ao gerar o vídeo.' }); }
});

app.post('/api/claude', exigirLogin, limitar, async (req, res) => {
  if (!cliDisponivel() && !process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ erro: 'IA indisponível: ANTHROPIC_API_KEY não configurada no servidor. Use a opção manual.' });
  }
  const { tarefa, estavel, system, messages, maxTokens, webSearch } = req.body || {};
  const t = TAREFAS[tarefa];
  if (!t) return res.status(400).json({ erro: 'Tipo de tarefa de IA desconhecido.' });
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ erro: 'messages é obrigatório.' });
  for (const campo of [estavel, system]) if (typeof campo !== 'undefined' && typeof campo !== 'string') return res.status(400).json({ erro: 'Campo de sistema inválido.' });

  if (cliDisponivel()) {
    try { return res.json(await viaCli({ tarefa, t, estavel, system, messages, webSearch })); }
    catch (e) {
      console.error('[cli]', tarefa, e?.message);
      // Ausente/sem login: pausa longa. Limite de uso ou outro erro: pausa curta.
      cliPausadaAte = Date.now() + (/ENOENT|não consegui executar/i.test(e?.message || '') ? 30 : 5) * 60_000;
      if (!process.env.ANTHROPIC_API_KEY) return res.status(502).json({ erro: (e?.message || 'Falha ao chamar a CLI do Claude.') + ' (sem ANTHROPIC_API_KEY para usar como reserva)' });
      console.warn('[api] assinatura indisponível; usando a API da Anthropic (CLI em pausa).');
    }
  }

  // Prompt caching: o que é estável por cliente (regras + perfil de marca) vai PRIMEIRO e é marcado para cache;
  // o que muda a cada chamada (instrução da tarefa, referências, resultados) vem depois do ponto de cache.
  // O cache só existe dentro do mesmo modelo, e a API ignora o cache se o trecho for menor que o mínimo do modelo.
  const blocos = [];
  if (estavel) blocos.push({ type: 'text', text: estavel, cache_control: { type: 'ephemeral' } });
  if (system) blocos.push({ type: 'text', text: system });

  const limite = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.min(Math.max(Number(maxTokens), 256), 32000) : t.max;
  const params = {
    model: t.modelo,
    max_tokens: limite,
    system: blocos.length ? blocos : undefined,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
    ...paramsDoModelo(t.modelo, t),
  };
  // Busca web só para a tarefa de mercado (é a única que precisa e a que mais custa).
  if (webSearch && t.web) {
    params.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: Math.min(Number(webSearch.maxUses) || 5, 10) }];
  }

  const client = new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
  try {
    let texto = '';
    const fontes = [];
    const uso = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0, buscasWeb: 0 };
    // Busca web pode devolver pause_turn; continuamos o turno algumas vezes e SOMAMOS o consumo de todas as voltas.
    for (let i = 0; i < 4; i++) {
      const msg = await client.messages.stream(params).finalMessage();
      const u = msg.usage || {};
      uso.entrada += u.input_tokens || 0;
      uso.saida += u.output_tokens || 0;
      uso.cacheEscrita += u.cache_creation_input_tokens || 0;
      uso.cacheLeitura += u.cache_read_input_tokens || 0;
      uso.buscasWeb += u.server_tool_use?.web_search_requests || 0;
      for (const b of msg.content) {
        if (b.type === 'text') {
          texto += b.text;
          for (const c of b.citations || []) if (c.url) fontes.push({ url: c.url, titulo: c.title || '' });
        }
      }
      if (msg.stop_reason === 'pause_turn') {
        params.messages = [...params.messages, { role: 'assistant', content: msg.content }];
        continue;
      }
      if (msg.stop_reason === 'refusal') return res.status(422).json({ erro: 'A IA recusou este pedido. Reformule ou use a opção manual.' });
      if (msg.stop_reason === 'max_tokens') {
        return res.status(502).json({ erro: 'A resposta foi cortada pelo limite de tokens desta tarefa. Aumente o limite em Configurações ou peça menos itens.', parcial: texto, uso: { ...uso, custoUsd: calcularCusto(t.modelo, uso), modelo: t.modelo } });
      }
      break;
    }
    res.json({ texto, fontes, modelo: t.modelo, uso: { ...uso, custoUsd: calcularCusto(t.modelo, uso), modelo: t.modelo } });
  } catch (e) {
    const status = e?.status && e.status >= 400 && e.status < 600 ? e.status : 502;
    console.error('[claude]', tarefa, status, e?.message);
    res.status(status).json({ erro: status === 429 ? 'Limite da API da Anthropic atingido. Tente em instantes.' : 'Falha ao chamar a IA: ' + (e?.message || 'erro desconhecido') });
  }
});

// Em produção, serve o build do Vite no mesmo processo.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (IS_PROD && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Só sobe o servidor quando executado diretamente (permite importar TAREFAS/calcularCusto em testes).
// Sob o PM2, argv[1] é o ProcessContainerFork.js do PM2; o script real vem em pm_exec_path.
const principal = process.env.pm_exec_path || process.argv[1];
if (principal && path.resolve(principal) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}  provedor=${PROVEDOR === 'cli' ? 'assinatura (API como reserva)' : 'API'}  leve=${MODELO_LEVE}  complexo=${MODELO_COMPLEXO}  auth-bypass=${AUTH_BYPASS}`));
}
