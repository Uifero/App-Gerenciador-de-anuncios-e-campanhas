// Proxy da API da Anthropic para o Gerenciador de Criativos e Campanhas.
// Motivo: a chave da Anthropic NUNCA pode ir para o navegador. O frontend envia o
// ID token do Firebase; aqui validamos o token e só então chamamos a Claude.
import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 8787);
const IS_PROD = process.env.NODE_ENV === 'production';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
// Atalho de teste local: jamais habilitado em produção.
const AUTH_BYPASS = !IS_PROD && process.env.DEV_AUTH_BYPASS === '1';

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

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/saude', (_req, res) => {
  res.json({ ok: true, modelo: MODEL, chaveConfigurada: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post('/api/claude', exigirLogin, limitar, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ erro: 'IA indisponível: ANTHROPIC_API_KEY não configurada no servidor. Use a opção manual.' });
  }
  const { system, messages, maxTokens, webSearch, effort } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ erro: 'messages é obrigatório.' });
  if (typeof system !== 'undefined' && typeof system !== 'string') return res.status(400).json({ erro: 'system inválido.' });

  const client = new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
  const params = {
    model: MODEL,
    max_tokens: Math.min(Number(maxTokens) || 8000, 32000),
    system: system || undefined,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
    thinking: { type: 'adaptive' },
    output_config: { effort: ['low', 'medium', 'high'].includes(effort) ? effort : 'medium' },
  };
  if (webSearch) {
    params.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: Math.min(Number(webSearch.maxUses) || 5, 10) }];
  }

  try {
    let texto = '';
    const fontes = [];
    let usage = null;
    // Busca web pode devolver pause_turn; continuamos o turno algumas vezes.
    for (let i = 0; i < 4; i++) {
      const msg = await client.messages.stream(params).finalMessage();
      usage = msg.usage;
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
      if (msg.stop_reason === 'max_tokens') return res.status(502).json({ erro: 'Resposta cortada por tamanho. Peça menos itens por vez.', parcial: texto });
      break;
    }
    res.json({ texto, fontes, modelo: MODEL, usage });
  } catch (e) {
    const status = e?.status && e.status >= 400 && e.status < 600 ? e.status : 502;
    console.error('[claude]', status, e?.message);
    res.status(status).json({ erro: status === 429 ? 'Limite da API da Anthropic atingido. Tente em instantes.' : 'Falha ao chamar a IA: ' + (e?.message || 'erro desconhecido') });
  }
});

// Em produção, serve o build do Vite no mesmo processo.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (IS_PROD && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}  modelo=${MODEL}  auth-bypass=${AUTH_BYPASS}`));
