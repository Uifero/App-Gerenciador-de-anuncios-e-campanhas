// Proxy da API da Anthropic para o Gerenciador de Criativos e Campanhas.
// Motivo: a chave da Anthropic NUNCA pode ir para o navegador. O frontend envia o
// ID token do Firebase; aqui validamos o token e só então chamamos a Claude.
// Também decide o modelo de cada tarefa (barato x completo), aplica prompt caching ao perfil de marca
// e devolve o consumo de tokens + custo estimado para o app registrar em "gcc_uso_api".
import { gerarImagem, statusImagens } from './imagens.js';
import { animarImagem, statusVideo } from './videos.js';
import { buscarBroll, baixarBroll, statusBroll } from './broll.js';
import { lerSite, baixarImagemSite } from './leitura-site.js';
import { METODOLOGIA_VORTEX } from './referencias/metodologia-vortex.js';
import { REFERENCIA_TRAFEGO } from './referencias/trafego.js';
import { REFERENCIA_COPY } from './referencias/copy.js';
import { REFERENCIA_OFERTA } from './referencias/oferta.js';
import { REFERENCIA_GANCHOS } from './referencias/ganchos.js';
import { calcularCusto } from '../src/lib/precos-ia.js';
import { lerLimite, mensagemLimite } from './limite-ia.js';
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
// Limite da assinatura: a CLI fica em pausa até a hora em que o limite volta (ou 1 h, se a mensagem não disser).
const processosCli = new Set(); // chamadas da CLI em andamento ({ parar })
let limiteVolta = null;
const erroLimite = (l) => Object.assign(new Error(mensagemLimite(l?.volta)), { limite: true, volta: l?.volta || null });
function avisarLimite(l) {
  const ate = l.volta ? l.volta.getTime() : Date.now() + 60 * 60_000;
  if (!(limiteVolta && Date.now() < limiteVolta.getTime())) { // primeira vez neste limite
    limiteVolta = l.volta || new Date(ate);
    cliPausadaAte = Math.max(cliPausadaAte, ate);
    console.warn('[cli] limite da assinatura atingido; CLI em pausa até', limiteVolta.toISOString());
  }
  for (const c of [...processosCli]) c.parar(erroLimite(l)); // as outras chamadas param agora e vão para a reserva
}

// ---------- modelos e tarefas ----------
// Haiku: tarefas curtas e simples. Sonnet: tarefas que exigem raciocínio (criativo completo, mercado, site).
const MODELO_LEVE = process.env.ANTHROPIC_MODEL_LEVE || 'claude-haiku-4-5';
const MODELO_COMPLEXO = process.env.ANTHROPIC_MODEL_COMPLEXO || 'claude-sonnet-5';

/**
 * max = limite padrão de tokens de saída (o app pode sobrescrever por tarefa em Configurações).
 * semRaciocinio = na CLI da assinatura, roda o modelo leve sem raciocínio interno (MAX_THINKING_TOKENS=0). Só onde foi
 * MEDIDO que a qualidade não cai (2026-09-30). Ficaram COM raciocínio, de propósito: hooks (sem ele inventava promessa de
 * saúde), refino (inventava prazo/número), narracao (falas não cabiam no tempo da cena), faq (inventava garantia de
 * segurança) e leitura_respostas (deixou de ler uma resposta). Na API, o Haiku já roda sem raciocínio.
 * metodologia = acrescenta a referência opcional server/referencias/metodologia-vortex.js ao contexto estável da tarefa.
 * trafego = acrescenta a referência opcional server/referencias/trafego.js (critérios de gestão de tráfego) ao contexto estável.
 * copy = acrescenta a referência opcional server/referencias/copy.js (critérios de copy para anúncio) ao contexto estável.
 * oferta = acrescenta a referência opcional server/referencias/oferta.js (critérios de oferta) ao contexto estável.
 * ganchos = acrescenta a biblioteca de modelos de gancho de abertura (server/referencias/ganchos.js) ao contexto estável.
 */
export const TAREFAS = {
  hooks:       { modelo: MODELO_LEVE,     max: 2000, copy: true, ganchos: true },
  refino:      { modelo: MODELO_LEVE,     max: 3000, copy: true },
  checklist:   { modelo: MODELO_LEVE,     max: 1200, semRaciocinio: true }, // medido: 31 s -> 8 s, mesma avaliação
  imagem:      { modelo: MODELO_LEVE,     max: 1800, semRaciocinio: true }, // "Sugerir prompts": 35 s -> 16 s, prompts equivalentes
  criativos:   { modelo: MODELO_COMPLEXO, max: 8000,  effort: 'medium', metodologia: true, copy: true, ganchos: true },
  campanha:    { modelo: MODELO_COMPLEXO, max: 7000,  effort: 'medium', metodologia: true, trafego: true },
  discussao_campanha: { modelo: MODELO_COMPLEXO, max: 7000, effort: 'medium', metodologia: true, trafego: true }, // chat do rascunho de campanha
  referencias: { modelo: MODELO_COMPLEXO, max: 10000, effort: 'medium', web: true },
  analise:     { modelo: MODELO_COMPLEXO, max: 2500,  effort: 'low' },
  site:        { modelo: MODELO_COMPLEXO, max: 6000,  effort: 'low', metodologia: true, oferta: true },
  pacote:      { modelo: MODELO_COMPLEXO, max: 8000,  effort: 'low' },
  playbook:    { modelo: MODELO_COMPLEXO, max: 4000,  effort: 'low' },
  insights:    { modelo: MODELO_COMPLEXO, max: 3000,  effort: 'low', trafego: true },
  diagnostico: { modelo: MODELO_COMPLEXO, max: 8000,  effort: 'medium', imagens: true, web: true, trafego: true }, // busca web: benchmarks e práticas do nicho
  narracao:    { modelo: MODELO_LEVE,     max: 2500 },
  faq:         { modelo: MODELO_LEVE,     max: 2500 }, // FAQ do site a partir das objeções
  leitura_site: { modelo: MODELO_COMPLEXO, max: 4000, effort: 'low' },            // interpreta o texto extraído do site do cliente
  leitura_web:  { modelo: MODELO_COMPLEXO, max: 4000, effort: 'low', web: true }, // site do cliente que bloqueia leitura direta (busca web)
  leitura_prints: { modelo: MODELO_COMPLEXO, max: 4000, effort: 'low', imagens: true }, // prints do Instagram do cliente
  leitura_provas: { modelo: MODELO_COMPLEXO, max: 4000, effort: 'low', imagens: true }, // prints de prova social (avaliações, WhatsApp)
  modelo_prompt: { modelo: MODELO_LEVE,     max: 1500, semRaciocinio: true }, // "Modelos de Prompt": preenche os marcadores com os dados do cliente
  ajuste_site: { modelo: MODELO_LEVE,     max: 3000, semRaciocinio: true },  // "Ajustar este site": pedido pontual (texto, ordem, cor); 8 s -> 6 s, mesmas operações
  ajuste_site_amplo: { modelo: MODELO_COMPLEXO, max: 5000, effort: 'low' }, // "Ajustar este site": pedido amplo (várias seções / reescrever)
  plano_site:  { modelo: MODELO_COMPLEXO, max: 6000, effort: 'low' },       // "Analisar meu pedido": plano item a item ANTES de aplicar (sem imagem: o print da referência já vem lido em texto)
  conferencia_site: { modelo: MODELO_LEVE, max: 1500 },                     // "Conferência do pedido": só os itens que o código não consegue conferir (texto, estilo)
  leitura_respostas: { modelo: MODELO_LEVE, max: 6000 },                   // associa a resposta colada do cliente às 18 perguntas
  leitura_produtos:  { modelo: MODELO_COMPLEXO, max: 6000, effort: 'low' }, // lista de produtos da resposta do cliente
  reparo:      { modelo: MODELO_LEVE,     max: 12000, semRaciocinio: true }, // corrige JSON inválido de outra resposta (sem refazer a tarefa); 8 s -> 5 s, resultado idêntico
  // "Sobre como esse cliente anuncia", "Analisar e recomendar", prints de resultado e plano WhatsApp x Site (Frentes 1 a 5).
  extracao_anuncio: { modelo: MODELO_LEVE, max: 1200 },                     // campos estruturados a partir do texto livre do operador (só preenche o vazio)
  palavras_nicho:   { modelo: MODELO_LEVE, max: 600 },                      // palavras-chave da Biblioteca de Anúncios do nicho (o operador edita)
  pesquisa_nicho:   { modelo: MODELO_COMPLEXO, max: 4000, effort: 'low', web: true }, // UMA pesquisa web por análise (nicho + destino + Brasil + ano), com cache de 7 dias no app
  resumo_documento: { modelo: MODELO_COMPLEXO, max: 2500, effort: 'low' },  // documento de referência resumido UMA vez (não é relido a cada análise)
  recomendacao_anuncio: { modelo: MODELO_COMPLEXO, max: 8000, effort: 'medium', metodologia: true, trafego: true, oferta: true }, // "Analisar e recomendar" (sem busca: usa a pesquisa em cache)
  leitura_resultados: { modelo: MODELO_COMPLEXO, max: 5000, effort: 'low', imagens: true }, // prints do Gerenciador de Anúncios -> números para revisão (nunca dado pessoal)
  otimizacao_anuncio: { modelo: MODELO_COMPLEXO, max: 6000, effort: 'medium', metodologia: true, trafego: true, oferta: true }, // "Plano de otimização" WhatsApp x Site
  // "Especialistas" (src/lib/especialistas.js): consulta a um especialista num MÉTODO sobre um item do cliente; só aconselha.
  especialista_trafego: { modelo: MODELO_COMPLEXO, max: 4000, effort: 'medium', trafego: true },
  especialista_copy:    { modelo: MODELO_COMPLEXO, max: 4000, effort: 'medium', metodologia: true, copy: true },
  especialista_oferta:  { modelo: MODELO_COMPLEXO, max: 4000, effort: 'medium', oferta: true },
};

/** Contexto estável da tarefa + as referências opcionais ligadas nela (`metodologia`, `trafego`, `copy`, `ganchos`, `oferta`), nessa ordem. */
export const comMetodologia = (t, estavel) => {
  const refs = [t?.metodologia && METODOLOGIA_VORTEX, t?.trafego && REFERENCIA_TRAFEGO, t?.copy && REFERENCIA_COPY, t?.ganchos && REFERENCIA_GANCHOS, t?.oferta && REFERENCIA_OFERTA].filter(Boolean);
  return refs.length ? [estavel, ...refs].filter(Boolean).join('\n\n') : estavel;
};

// ---------- imagens anexadas (só tarefas com `imagens: true`, hoje o diagnóstico) ----------
export const MAX_IMAGENS = 6;
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BASE64 = 5 * 1024 * 1024; // ~3,7 MB de imagem por arquivo (o front já reduz para ~1568 px)

/** Confere as imagens vindas do navegador: [{ media_type, data (base64 puro) }]. Devolve a lista limpa ou lança Error com a mensagem para o usuário. */
export function validarImagens(imagens) {
  if (imagens == null) return [];
  if (!Array.isArray(imagens)) throw new Error('Imagens em formato inválido.');
  if (imagens.length > MAX_IMAGENS) throw new Error(`Envie no máximo ${MAX_IMAGENS} imagens por análise.`);
  return imagens.map((im, i) => {
    if (!im || !TIPOS_IMAGEM.includes(im.media_type)) throw new Error(`Imagem ${i + 1}: use JPG, PNG, WebP ou GIF.`);
    if (typeof im.data !== 'string' || !im.data || im.data.length > MAX_BASE64 || !/^[A-Za-z0-9+/]+=*$/.test(im.data)) throw new Error(`Imagem ${i + 1} inválida ou grande demais.`);
    return { media_type: im.media_type, data: im.data };
  });
}

/** Blocos de conteúdo no formato da API (as imagens vêm antes do texto, como a documentação recomenda). */
export const blocosComImagens = (texto, imagens) => [
  ...imagens.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
  { type: 'text', text: String(texto) },
];

/**
 * Lê a saída da CLI. Com --output-format json vem um objeto só; com stream-json (usado quando há imagem, porque só a
 * entrada stream-json aceita blocos de imagem) vem uma linha JSON por evento e o que interessa é a de type "result".
 */
export function lerSaidaCli(out, stream) {
  if (!stream) return JSON.parse(out);
  const r = String(out).split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((l) => l?.type === 'result');
  if (!r) throw new Error('sem linha de resultado');
  return r;
}

// Preços: um arquivo só (src/lib/precos-ia.js), o mesmo que a página "Custos de IA" usa.
export { calcularCusto };
const familia = (m) => (/haiku/.test(m) ? 'haiku' : /opus/.test(m) ? 'opus' : 'sonnet');

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
async function viaCli({ tarefa, t, estavel, system, messages, webSearch, imagens = [] }) {
  const prompt = [
    estavel, system,
    messages.map((m) => (messages.length > 1 ? (m.role === 'assistant' ? 'ASSISTENTE: ' : 'USUÁRIO: ') : '') + m.content).join('\n\n'),
  ].filter(Boolean).join('\n\n---\n\n');
  const busca = Boolean(webSearch && t.web);
  const args = ['-p', '--model', familia(t.modelo) === 'haiku' ? 'haiku' : 'sonnet', '--output-format', 'json', '--no-session-persistence',
    '--system-prompt', 'Você é um assistente que segue exatamente o formato de saída pedido pelo usuário. Não use ferramentas além das liberadas.',
    ...(busca ? ['--tools', 'WebSearch', '--allowedTools', 'WebSearch'] : ['--tools', ''])];
  // Com imagem: a CLI só aceita blocos de imagem pela entrada stream-json (que exige saída stream-json + --verbose).
  // As imagens vão direto ao modelo; nenhuma ferramenta de leitura de arquivo é liberada.
  const stream = imagens.length > 0;
  if (stream) args.splice(args.indexOf('json'), 1, 'stream-json', '--input-format', 'stream-json', '--verbose');
  const entrada = stream ? JSON.stringify({ type: 'user', message: { role: 'user', content: blocosComImagens(prompt, imagens) } }) + '\n' : prompt;
  const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_BASE_URL; delete env.ANTHROPIC_AUTH_TOKEN; // usa o login da assinatura
  // Tarefa de preencher campo curto: sem raciocínio interno (com ele, o modelo leve gastava ~3 mil tokens e ~30 s num JSON de 3 linhas).
  if (t.semRaciocinio) env.MAX_THINKING_TOKENS = '0';
  await vez();
  try {
    if (!cliDisponivel()) throw limiteVolta && Date.now() < limiteVolta.getTime() ? erroLimite({ volta: limiteVolta }) : new Error('A CLI do Claude ficou em pausa enquanto esta chamada esperava.'); // ex.: o limite apareceu enquanto esperava a vez
    const saida = await new Promise((ok, falha) => {
      // IA_CLI_BIN pode ser um script Node (.js/.mjs), útil para simular a CLI em teste local.
      const p = /\.m?js$/i.test(CLI_BIN) ? spawn(process.execPath, [CLI_BIN, ...args], { cwd: os.tmpdir(), env, windowsHide: true })
        : spawn(CLI_BIN, args, { cwd: os.tmpdir(), env, windowsHide: true });
      let out = '', err = '', fim = false;
      // Busca na web (mercado) costuma levar 2 a 3 min: ganha 5 min. As demais, 3 min.
      const limiteMs = busca ? 300_000 : 180_000;
      const parar = (e) => { if (fim) return; fim = true; clearTimeout(timer); processosCli.delete(controle); try { p.kill(); } catch { /* já saiu */ } falha(e); };
      const controle = { parar };
      processosCli.add(controle);
      const timer = setTimeout(() => parar(new Error(`A CLI do Claude demorou demais (${limiteMs / 60_000} min).`)), limiteMs);
      // Aviso de limite da assinatura: para esta chamada e as outras em andamento na hora (sem esperar os 3 minutos).
      const conferir = () => { const l = lerLimite(`${err}\n${out.slice(-2000)}`); if (l) avisarLimite(l); };
      p.stdout.on('data', (d) => { out += d; conferir(); }); p.stderr.on('data', (d) => { err += d; conferir(); });
      p.on('error', (e) => parar(new Error('Não consegui executar a CLI "claude": ' + e.message)));
      p.on('close', () => { if (fim) return; fim = true; clearTimeout(timer); processosCli.delete(controle); ok({ out, err }); });
      p.stdin.end(entrada);
    });
    let j; try { j = lerSaidaCli(saida.out, stream); } catch { const l = lerLimite(saida.err || saida.out); if (l) throw erroLimite(l); throw new Error('Resposta inesperada da CLI do Claude: ' + (saida.err || saida.out).slice(0, 200)); }
    if (j.is_error) { const l = lerLimite(j.result); if (l) { avisarLimite(l); throw erroLimite(l); } throw new Error('A CLI do Claude devolveu erro: ' + String(j.result || '').slice(0, 200)); }
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
// /api/claude aceita até MAX_IMAGENS imagens anexadas (diagnóstico com prints); por isso tem um limite próprio maior.
app.use((req, res, next) => (req.path === '/api/video' || req.path === '/api/claude' ? next() : jsonPadrao(req, res, next)));

app.get('/api/saude', (_req, res) => {
  res.json({ ok: true, provedor: cliDisponivel() ? 'cli' : 'api', preferido: PROVEDOR, modelos: { leve: MODELO_LEVE, complexo: MODELO_COMPLEXO }, chaveConfigurada: Boolean(process.env.ANTHROPIC_API_KEY),
    ...(limiteVolta && Date.now() < limiteVolta.getTime() ? { limiteAte: limiteVolta.toISOString() } : {}) });
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

// B-roll: busca em bancos gratuitos (Pexels/Pixabay; ver server/broll.js). As chaves ficam só aqui.
// Teto de 120 buscas e 60 downloads por hora por usuário (os bancos limitam ~200 buscas/hora por chave).
const brollPorUsuario = new Map();
const tetoBroll = (req, res, tipo, max) => {
  const chave = `${req.usuario?.sub || req.usuario?.email || 'x'}:${tipo}`, agora = Date.now();
  const recentes = (brollPorUsuario.get(chave) || []).filter((t) => agora - t < 3_600_000);
  if (recentes.length >= max) { res.status(429).json({ erro: tipo === 'busca' || tipo === 'download' ? `Limite de ${max} ${tipo === 'busca' ? 'buscas' : 'downloads'} de B-roll por hora atingido.` : `Limite de ${max} (${tipo}) por hora atingido. Tente mais tarde.` }); return false; }
  recentes.push(agora); brollPorUsuario.set(chave, recentes); return true;
};
app.get('/api/broll/status', exigirLogin, (_req, res) => res.json(statusBroll()));
app.get('/api/broll', exigirLogin, async (req, res) => {
  if (!tetoBroll(req, res, 'busca', 120)) return;
  const { termo, tipo, fonte, pagina, orientacao } = req.query;
  try { res.json(await buscarBroll({ termo, tipo, fonte, pagina, orientacao })); }
  catch (e) { console.error('[broll]', e?.message); res.status(e.status || 502).json({ erro: e.message || 'Falha na busca de B-roll.' }); }
});
app.post('/api/broll/arquivo', exigirLogin, async (req, res) => {
  if (!tetoBroll(req, res, 'download', 60)) return;
  try { const r = await baixarBroll(String(req.body?.url || '')); res.set('Content-Type', r.tipo).send(r.bytes); }
  catch (e) { console.error('[broll/arquivo]', e?.message); res.status(e.status || 502).json({ erro: e.message || 'Falha ao baixar o arquivo.' }); }
});

// Leitura do site PRÓPRIO do cliente (pergunta 0 da aba Site/Loja; ver server/leitura-site.js). 30 leituras e 120 fotos/hora.
app.post('/api/leitura-site', exigirLogin, async (req, res) => {
  if (!tetoBroll(req, res, 'leitura', 30)) return;
  try { res.json(await lerSite(String(req.body?.url || ''))); }
  catch (e) { console.error('[leitura-site]', e?.message); res.status(e.status || 502).json({ erro: e.message || 'Não consegui ler o site.' }); }
});
app.post('/api/leitura-site/imagem', exigirLogin, async (req, res) => {
  if (!tetoBroll(req, res, 'foto do site', 120)) return;
  try { const r = await baixarImagemSite(String(req.body?.url || ''), String(req.body?.site || '')); res.set('Content-Type', r.tipo).send(r.bytes); }
  catch (e) { console.error('[leitura-site/imagem]', e?.message); res.status(e.status || 502).json({ erro: e.message || 'Não consegui baixar a foto.' }); }
});

// Pedido de IA. Para o navegador nunca perder a resposta (o proxy na frente do app, ex.: nginx, corta conexões
// paradas por mais de ~60 s, e a CLI pode levar 3 min), o front manda `assincrono: true`: a rota responde na hora com
// um id de trabalho e o navegador consulta GET /api/claude/trabalho/:id a cada ~2 s (cada consulta é curta). Sem
// `assincrono`, responde no fim, como antes (clientes antigos durante uma atualização).
const trabalhos = new Map(); // id -> { dono, inicio, pronto, status, corpo }
const LIMPAR_TRABALHO_MS = 15 * 60_000;
setInterval(() => { const agora = Date.now(); for (const [id, t] of trabalhos) if (agora - t.inicio > LIMPAR_TRABALHO_MS) trabalhos.delete(id); }, 60_000).unref?.();

app.post('/api/claude', exigirLogin, limitar, express.json({ limit: '16mb' }), async (req, res) => {
  if (!req.body?.assincrono) { const r = await responderClaude(req); return res.status(r.status).json(r.corpo); }
  const id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const t = { dono: req.usuario?.sub || req.usuario?.email || 'x', inicio: Date.now(), pronto: false, status: 0, corpo: null, etapa: 'na fila' };
  trabalhos.set(id, t);
  responderClaude(req, t).then((r) => Object.assign(t, r, { pronto: true }))
    .catch((e) => Object.assign(t, { pronto: true, status: 500, corpo: { erro: 'Falha inesperada no servidor de IA: ' + (e?.message || 'erro') } }));
  res.status(202).json({ trabalho: id });
});
app.get('/api/claude/trabalho/:id', exigirLogin, (req, res) => {
  const t = trabalhos.get(req.params.id);
  if (!t || t.dono !== (req.usuario?.sub || req.usuario?.email || 'x')) return res.status(404).json({ erro: 'Esse pedido de IA não existe mais no servidor (o servidor pode ter reiniciado). Tente de novo.' });
  if (!t.pronto) return res.json({ pronto: false, segundos: Math.round((Date.now() - t.inicio) / 1000), etapa: t.etapa });
  trabalhos.delete(req.params.id);
  res.json({ pronto: true, status: t.status, corpo: t.corpo });
});

/** Faz a chamada (assinatura primeiro; reserva pela API) e devolve { status, corpo }. `t` recebe a etapa atual. */
async function responderClaude(req, t = {}) {
  const r = (status, corpo) => ({ status, corpo });
  if (!cliDisponivel() && !process.env.ANTHROPIC_API_KEY) {
    if (limiteVolta && Date.now() < limiteVolta.getTime()) return r(503, { erro: mensagemLimite(limiteVolta), limite: true, provedor: 'cli' });
    return r(503, { erro: 'IA indisponível: ANTHROPIC_API_KEY não configurada no servidor. Use a opção manual.' });
  }
  const { tarefa, system, messages, maxTokens, webSearch } = req.body || {};
  const tf = TAREFAS[tarefa];
  if (!tf) return r(400, { erro: 'Tipo de tarefa de IA desconhecido.' });
  if (!Array.isArray(messages) || !messages.length) return r(400, { erro: 'messages é obrigatório.' });
  for (const campo of [req.body.estavel, system]) if (typeof campo !== 'undefined' && typeof campo !== 'string') return r(400, { erro: 'Campo de sistema inválido.' });
  const estavel = comMetodologia(tf, req.body.estavel);
  let imagens;
  try { imagens = validarImagens(req.body?.imagens); } catch (e) { return r(400, { erro: e.message }); }
  if (imagens.length && !tf.imagens) return r(400, { erro: 'Esta tarefa não aceita imagens.' });
  // Sem imagem, o corpo continua limitado a 1 MB como as demais rotas (o limite maior é só para os anexos).
  if (!imagens.length && Number(req.headers['content-length'] || 0) > 1024 * 1024) return r(413, { erro: 'Pedido grande demais.' });

  let porLimite = null; // a assinatura acabou nesta chamada (ou já estava em pausa pelo limite)
  if (cliDisponivel()) {
    t.etapa = 'assinatura';
    try { return r(200, await viaCli({ tarefa, t: tf, estavel, system, messages, webSearch, imagens })); }
    catch (e) {
      console.error('[cli]', tarefa, e?.message);
      if (e?.limite) porLimite = e;
      // Sem ANTHROPIC_API_KEY não há reserva: pausar a CLI só derrubaria TODA a IA por minutos por causa de uma
      // falha pontual (ex.: uma busca web lenta). Nesse caso devolve o erro desta chamada e a próxima tenta de novo.
      if (!process.env.ANTHROPIC_API_KEY) return porLimite ? r(503, { erro: porLimite.message, limite: true, provedor: 'cli' }) : r(502, { erro: (e?.message || 'Falha ao chamar a CLI do Claude.') + ' Tente de novo em instantes ou use a opção manual.' });
      // Com reserva: ausente/sem login = pausa longa; limite = até a hora em que volta (avisarLimite); outro erro = pausa curta.
      if (!porLimite) cliPausadaAte = Date.now() + (/ENOENT|não consegui executar/i.test(e?.message || '') ? 30 : 5) * 60_000;
      console.warn('[api] assinatura indisponível; usando a reserva (API da Anthropic).');
    }
  } else if (limiteVolta && Date.now() < limiteVolta.getTime()) porLimite = erroLimite({ volta: limiteVolta });
  t.etapa = 'reserva';

  // Prompt caching: o que é estável por cliente (regras + perfil de marca) vai PRIMEIRO e é marcado para cache;
  // o que muda a cada chamada (instrução da tarefa, referências, resultados) vem depois do ponto de cache.
  // O cache só existe dentro do mesmo modelo, e a API ignora o cache se o trecho for menor que o mínimo do modelo.
  const blocos = [];
  if (estavel) blocos.push({ type: 'text', text: estavel, cache_control: { type: 'ephemeral' } });
  if (system) blocos.push({ type: 'text', text: system });

  const limite = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.min(Math.max(Number(maxTokens), 256), 32000) : tf.max;
  const params = {
    model: tf.modelo,
    max_tokens: limite,
    system: blocos.length ? blocos : undefined,
    // As imagens (se houver) entram na última mensagem do usuário, junto com o texto do pedido.
    messages: messages.map((m, i) => ({ role: m.role === 'assistant' ? 'assistant' : 'user',
      content: imagens.length && i === messages.length - 1 ? blocosComImagens(m.content, imagens) : String(m.content) })),
    ...paramsDoModelo(tf.modelo, tf),
  };
  // Busca web só nas tarefas marcadas com web: true (mercado, leitura de site pela busca, diagnóstico).
  if (webSearch && tf.web) {
    params.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: Math.min(Number(webSearch.maxUses) || 5, 10) }];
  }

  const client = new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
  const uso = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0, buscasWeb: 0 };
  const comCusto = () => ({ ...uso, custoUsd: calcularCusto(tf.modelo, uso), modelo: tf.modelo, provedor: 'api' });
  try {
    let texto = '';
    const fontes = [];
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
      if (msg.stop_reason === 'refusal') return r(422, { erro: 'A IA recusou este pedido. Reformule ou use a opção manual.', provedor: 'api', uso: comCusto() });
      if (msg.stop_reason === 'max_tokens') {
        return r(502, { erro: 'A resposta foi cortada pelo limite de tokens desta tarefa. Aumente o limite em Configurações ou peça menos itens.', parcial: texto, provedor: 'api', uso: comCusto() });
      }
      break;
    }
    return r(200, { texto, fontes, modelo: tf.modelo, provedor: 'api', uso: comCusto() });
  } catch (e) {
    const status = e?.status && e.status >= 400 && e.status < 600 ? e.status : 502;
    console.error('[claude]', tarefa, status, e?.message); // só a mensagem do erro: a chave nunca vai para o log
    // A assinatura acabou E a reserva falhou: o operador precisa saber quando volta, em português.
    if (porLimite) return r(503, { erro: `${porLimite.message} A reserva (API) também não respondeu agora.`, limite: true, provedor: 'api', uso: uso.entrada ? comCusto() : undefined });
    return r(status, { erro: status === 429 ? 'Limite da API da Anthropic atingido. Tente em instantes.' : 'Falha ao chamar a IA: ' + (e?.message || 'erro desconhecido'), provedor: 'api' });
  }
}

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
