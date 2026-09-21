// Foto -> vídeo com IA (imagem para vídeo). Provedor: Pixazo (modelo LTX gratuito na fase de prévia; limites e regras podem mudar: confira em pixazo.ai).
// A Pixazo só aceita a imagem por URL pública. Por isso a foto é enviada a uma hospedagem TEMPORÁRIA anônima (litterbox.catbox.moe, apaga em 1 hora)
// e só então enviada ao gerador. Não use fotos que o cliente não autorizou a enviar a terceiros.
// Fluxo assíncrono: envia o pedido, consulta o status até concluir e devolve os bytes do MP4.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARQUIVO_PADRAO = path.join(path.dirname(fileURLToPath(import.meta.url)), '.uso-videos.json');
const BASE = 'https://gateway.pixazo.ai';
const ESPERA_MAX_MS = 240_000, INTERVALO_MS = 5_000;
/** Tamanhos por formato (múltiplos de 32, exigência dos modelos LTX). */
const TAMANHOS = { '9:16': [704, 1280], '4:5': [896, 1120], '1:1': [768, 768] };

class ErroVideo extends Error { constructor(msg, status) { super(msg); this.status = status; } }

export const configurado = (env = process.env) => Boolean(env.PIXAZO_API_KEY);
export const limiteDia = (env = process.env) => { const n = Number(env.VIDEO_LIMITE_DIA); return env.VIDEO_LIMITE_DIA !== undefined && env.VIDEO_LIMITE_DIA !== '' && Number.isFinite(n) && n >= 0 ? n : 10; };

const utc = () => new Date().toISOString().slice(0, 10);
function lerUso(arquivo, hoje) {
  try { const j = JSON.parse(fs.readFileSync(arquivo, 'utf8')); if (j.data === hoje) return j; } catch { /* sem arquivo ou dia antigo */ }
  return { data: hoje, total: 0 };
}
const gravarUso = (arquivo, uso) => { try { fs.writeFileSync(arquivo, JSON.stringify(uso)); } catch { /* sem disco: só vale até reiniciar */ } };

export function statusVideo({ env = process.env, arquivo = ARQUIVO_PADRAO, hoje = utc } = {}) {
  return { configurado: configurado(env), usadoHoje: lerUso(arquivo, hoje()).total, limiteDia: limiteDia(env), provedor: 'Pixazo (LTX)' };
}

/** "data:image/jpeg;base64,..." -> { bytes, mime } (só imagens, até 12 MB). */
export function lerDataUrl(url) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(url || ''));
  if (!m) throw new ErroVideo('Imagem inválida (use JPG, PNG ou WebP).', 400);
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > 12 * 1024 * 1024) throw new ErroVideo('Imagem grande demais (máx. 12 MB).', 400);
  return { bytes, mime: m[1] };
}

async function hospedar({ bytes, mime }, f) {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload'); fd.append('time', '1h');
  fd.append('fileToUpload', new Blob([bytes], { type: mime }), mime === 'image/png' ? 'foto.png' : 'foto.jpg');
  const r = await f('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: fd, signal: AbortSignal.timeout(60_000) });
  const url = (await r.text()).trim();
  if (!r.ok || !/^https:\/\//.test(url)) throw new ErroVideo('Não consegui hospedar a foto temporariamente: ' + url.slice(0, 120), 502);
  return url;
}

const urlDoVideo = (j) => {
  const m = j?.output?.media_url ?? j?.output?.video_url ?? j?.video?.url;
  const x = Array.isArray(m) ? m[0] : m;
  return typeof x === 'string' ? x : x?.url;
};

/**
 * Gera um clipe (~5 s) animando a foto. Devolve { video: Buffer (MP4), provedor }.
 * `esperar(ms)` existe para os testes não esperarem de verdade.
 */
export async function animarImagem({ imagem, prompt, formato = '9:16' }, { env = process.env, fetchImpl = fetch, arquivo = ARQUIVO_PADRAO, hoje = utc, esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)), agora = Date.now } = {}) {
  if (!configurado(env)) throw new ErroVideo('Vídeo por IA não configurado: crie uma conta gratuita em pixazo.ai e coloque PIXAZO_API_KEY no .env do servidor (veja o README).', 503);
  const uso = lerUso(arquivo, hoje());
  if (uso.total >= limiteDia(env)) throw new ErroVideo(`Limite diário de vídeos do app atingido (${uso.total}/${limiteDia(env)}). Ajuste VIDEO_LIMITE_DIA no .env se quiser.`, 429);
  const foto = lerDataUrl(imagem);
  const cabecalho = { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': env.PIXAZO_API_KEY };
  const urlImagem = await hospedar(foto, fetchImpl);
  const [width, height] = TAMANHOS[formato] || TAMANHOS['9:16'];
  const corpo = { prompt: String(prompt || 'The camera slowly pushes in, subtle natural movement, realistic').slice(0, 1500), image_url: urlImagem };

  // Primeiro com o tamanho do formato; se o modelo recusar o tamanho (400/422), repete sem ele (usa o padrão do modelo).
  const enviar = (extra) => fetchImpl(`${BASE}/ltx-video/v1/image-to-video`, { method: 'POST', headers: cabecalho, body: JSON.stringify({ ...corpo, ...extra }), signal: AbortSignal.timeout(60_000) });
  let r = await enviar({ width, height });
  if ([400, 422].includes(r.status)) r = await enviar({});
  const inicio = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroVideo(`Pixazo: ${inicio.message || inicio.error?.message || inicio.error || `HTTP ${r.status}`}`, r.status === 401 || r.status === 403 ? 502 : r.status);

  let resultado = inicio;
  const t0 = agora();
  const consulta = inicio.polling_url || (inicio.request_id ? `${BASE}/v2/requests/status/${inicio.request_id}` : null);
  while (!urlDoVideo(resultado)) {
    const st = String(resultado.status || '').toUpperCase();
    if (st === 'FAILED' || st === 'ERROR') throw new ErroVideo('Pixazo: a geração falhou' + (resultado.error ? ': ' + (resultado.error.message || resultado.error) : '.'), 502);
    if (!consulta) throw new ErroVideo('Pixazo: resposta sem identificador do pedido.', 502);
    if (agora() - t0 > ESPERA_MAX_MS) throw new ErroVideo('A geração do vídeo demorou mais de 4 minutos. Tente de novo mais tarde.', 504);
    await esperar(INTERVALO_MS);
    const s = await fetchImpl(consulta, { headers: cabecalho, signal: AbortSignal.timeout(30_000) });
    resultado = await s.json().catch(() => ({}));
    if (!s.ok) throw new ErroVideo(`Pixazo (consulta): ${resultado.message || `HTTP ${s.status}`}`, 502);
  }
  const v = await fetchImpl(urlDoVideo(resultado), { signal: AbortSignal.timeout(120_000) });
  if (!v.ok) throw new ErroVideo(`Não consegui baixar o vídeo pronto (HTTP ${v.status}).`, 502);
  const video = Buffer.from(await v.arrayBuffer());
  uso.total += 1; gravarUso(arquivo, uso);
  return { video, provedor: 'Pixazo (LTX)' };
}
