// Geração de imagem por IA com VÁRIOS provedores em rodízio: usa o primeiro que tiver cota e, se ele falhar ou acabar a cota, passa ao próximo.
// Cada provedor só entra se as chaves dele estiverem no .env. Só os provedores listados em IMAGEM_PROVEDORES são usados, nessa ordem.
// O contador diário (por provedor, em UTC) fica em server/.uso-imagens.json. As cotas gratuitas mudam com frequência: confira nos sites deles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARQUIVO_PADRAO = path.join(path.dirname(fileURLToPath(import.meta.url)), '.uso-imagens.json');
const PAUSA_APOS_ERRO_MS = 10 * 60_000;

/** Dimensões por formato. O FLUX pede múltiplos de 16. */
const TAMANHOS = { '4:5': [1024, 1280], '9:16': [864, 1536], '1:1': [1024, 1024] };

const bytesParaB64 = (buf) => Buffer.from(buf).toString('base64');
/** Descobre o tipo da imagem pelos primeiros bytes (os provedores nem sempre informam). */
function mimeDe(b64) {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

class ErroProvedor extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}
async function json(r, nome) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroProvedor(`${nome}: ${j.error?.message || j.errors?.[0]?.message || j.error || `HTTP ${r.status}`}`, r.status);
  return j;
}
const sinal = () => AbortSignal.timeout(90_000);

export const PROVEDORES = {
  cloudflare: {
    rotulo: 'Cloudflare Workers AI (FLUX schnell)', limiteDia: 150,
    configurado: (e) => Boolean(e.CLOUDFLARE_ACCOUNT_ID && e.CLOUDFLARE_API_TOKEN),
    async gerar({ prompt }, e, f) {
      // Este modelo devolve imagem quadrada; os templates recortam para o formato do anúncio.
      const r = await f(`https://api.cloudflare.com/client/v4/accounts/${e.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.CLOUDFLARE_API_TOKEN}` },
        body: JSON.stringify({ prompt, steps: 6 }), signal: sinal(),
      });
      const b64 = (await json(r, 'Cloudflare')).result?.image;
      if (!b64) throw new ErroProvedor('Cloudflare: resposta sem imagem.');
      return b64;
    },
  },
  together: {
    rotulo: 'Together AI (FLUX schnell)', limiteDia: 100,
    configurado: (e) => Boolean(e.TOGETHER_API_KEY),
    async gerar({ prompt, tamanho }, e, f) {
      const r = await f('https://api.together.xyz/v1/images/generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.TOGETHER_API_KEY}` },
        body: JSON.stringify({ model: e.TOGETHER_MODELO || 'black-forest-labs/FLUX.1-schnell-Free', prompt, width: tamanho[0], height: tamanho[1], steps: 4, n: 1, response_format: 'b64_json' }),
        signal: sinal(),
      });
      const b64 = (await json(r, 'Together')).data?.[0]?.b64_json;
      if (!b64) throw new ErroProvedor('Together: resposta sem imagem.');
      return b64;
    },
  },
  huggingface: {
    rotulo: 'Hugging Face (FLUX schnell)', limiteDia: 20,
    configurado: (e) => Boolean(e.HUGGINGFACE_TOKEN),
    async gerar({ prompt, tamanho }, e, f) {
      const r = await f(`https://router.huggingface.co/hf-inference/models/${e.HUGGINGFACE_MODELO || 'black-forest-labs/FLUX.1-schnell'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.HUGGINGFACE_TOKEN}`, Accept: 'image/png' },
        body: JSON.stringify({ inputs: prompt, parameters: { width: tamanho[0], height: tamanho[1] } }), signal: sinal(),
      });
      if (!r.ok) throw new ErroProvedor(`Hugging Face: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`, r.status);
      return bytesParaB64(await r.arrayBuffer());
    },
  },
  // PAGO. Nunca entra sozinho: só se você listar "openai" em IMAGEM_PROVEDORES.
  openai: {
    rotulo: 'OpenAI (pago)', limiteDia: 10,
    configurado: (e) => Boolean(e.OPENAI_API_KEY),
    async gerar({ prompt, formato }, e, f) {
      const r = await f('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: e.IMAGEM_MODELO || 'gpt-image-1', prompt, size: formato === '1:1' ? '1024x1024' : '1024x1536', n: 1 }), signal: sinal(),
      });
      const b64 = (await json(r, 'OpenAI')).data?.[0]?.b64_json;
      if (!b64) throw new ErroProvedor('OpenAI: resposta sem imagem.');
      return b64;
    },
  },
};

const ordem = (e) => String(e.IMAGEM_PROVEDORES || 'cloudflare,together,huggingface').split(',').map((s) => s.trim()).filter((s) => PROVEDORES[s]);
const limiteDe = (id, e) => {
  const bruto = e[`${id.toUpperCase()}_LIMITE_DIA`];
  const n = bruto === undefined || bruto === '' ? NaN : Number(bruto);
  return Number.isFinite(n) && n >= 0 ? n : PROVEDORES[id].limiteDia;
};

// ---- contador diário (arquivo) e pausas (memória) ----
const pausados = new Map();
/** Zera as pausas por erro (usado nos testes). */
export const reiniciarPausas = () => pausados.clear();
const utc = () => new Date().toISOString().slice(0, 10);
function lerUso(arquivo, hoje) {
  try { const j = JSON.parse(fs.readFileSync(arquivo, 'utf8')); if (j.data === hoje) return j; } catch { /* sem arquivo ou dia antigo */ }
  return { data: hoje, contagem: {} };
}
function gravarUso(arquivo, uso) { try { fs.writeFileSync(arquivo, JSON.stringify(uso)); } catch { /* sem disco: o contador só vale até reiniciar */ } }

/** Situação de cada provedor listado: configurado?, usado hoje, limite, pausa. */
export function statusImagens({ env = process.env, arquivo = ARQUIVO_PADRAO, hoje = utc, agora = Date.now } = {}) {
  const uso = lerUso(arquivo, hoje());
  return ordem(env).map((id) => ({
    id, rotulo: PROVEDORES[id].rotulo, configurado: PROVEDORES[id].configurado(env),
    usadoHoje: uso.contagem[id] || 0, limiteDia: limiteDe(id, env), pausado: (pausados.get(id) || 0) > agora(),
  }));
}

/**
 * Gera UMA imagem. Tenta os provedores na ordem; pula os sem chave, sem cota do dia ou em pausa; em falha passa ao próximo.
 * Devolve { imagem (data URL), provedor, rotulo, tentativas: [erros dos que falharam] }.
 */
export async function gerarImagem({ prompt, formato = '4:5' }, { env = process.env, fetchImpl = fetch, arquivo = ARQUIVO_PADRAO, hoje = utc, agora = Date.now } = {}) {
  const tamanho = TAMANHOS[formato] || TAMANHOS['4:5'];
  const uso = lerUso(arquivo, hoje());
  const falhas = [];
  for (const id of ordem(env)) {
    const p = PROVEDORES[id];
    if (!p.configurado(env)) continue;
    if ((uso.contagem[id] || 0) >= limiteDe(id, env)) { falhas.push(`${p.rotulo}: limite diário do app atingido`); continue; }
    if ((pausados.get(id) || 0) > agora()) { falhas.push(`${p.rotulo}: em pausa após erro`); continue; }
    try {
      const b64 = await p.gerar({ prompt, formato, tamanho }, env, fetchImpl);
      uso.contagem[id] = (uso.contagem[id] || 0) + 1; gravarUso(arquivo, uso);
      return { imagem: `data:${mimeDe(b64)};base64,${b64}`, provedor: id, rotulo: p.rotulo, tentativas: falhas };
    } catch (e) {
      falhas.push(e.message || `${p.rotulo}: falhou`);
      // Cota/pagamento/limite de taxa/erro do servidor: deixa este provedor de lado por um tempo e tenta o próximo.
      if ([401, 402, 403, 429].includes(e.status) || e.status >= 500 || e.name === 'TimeoutError') pausados.set(id, agora() + PAUSA_APOS_ERRO_MS);
    }
  }
  const nenhum = !ordem(env).some((id) => PROVEDORES[id].configurado(env));
  const err = new Error(nenhum
    ? 'Nenhum gerador de imagem configurado. Crie uma conta gratuita (Cloudflare, Together ou Hugging Face) e coloque a chave no .env do servidor — veja o README.'
    : 'Todos os geradores falharam ou estão sem cota hoje: ' + falhas.join(' | '));
  err.status = nenhum ? 503 : 502;
  throw err;
}
