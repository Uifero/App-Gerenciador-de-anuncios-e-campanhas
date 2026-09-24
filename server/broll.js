// B-roll: busca de vídeos e fotos de banco GRATUITO (Pexels e Pixabay) para o Estúdio.
// As chaves (PEXELS_API_KEY, PIXABAY_API_KEY) ficam só aqui no servidor; o navegador nunca as vê.
// Duas funções: `buscarBroll` (pesquisa nos dois bancos e devolve uma lista única, intercalada) e `baixarBroll`
// (repassa os bytes do arquivo escolhido — o navegador não baixa direto do banco porque uma imagem de outro domínio
// "suja" o canvas do Estúdio e impediria gerar o PNG/vídeo). O download só aceita endereços dos próprios bancos.

class ErroBroll extends Error { constructor(msg, status) { super(msg); this.status = status; } }

export const POR_PAGINA = 12;
const TAMANHO_MAX = 80 * 1024 * 1024; // 80 MB por arquivo baixado
/** Domínios de onde o download é permitido (evita usar o servidor como proxy aberto). */
const HOSTS_PERMITIDOS = [/^images\.pexels\.com$/, /^videos\.pexels\.com$/, /^(player\.)?vimeo\.com$/, /(^|\.)vimeocdn\.com$/, /^(cdn\.)?pixabay\.com$/];

export const statusBroll = (env = process.env) => ({ pexels: Boolean(env.PEXELS_API_KEY), pixabay: Boolean(env.PIXABAY_API_KEY) });

/** Intercala as listas (a1, b1, a2, b2…) para os dois bancos aparecerem misturados na grade. */
export function intercalar(a, b) {
  const r = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) r.push(a[i]); if (b[i]) r.push(b[i]); }
  return r;
}

/** Do vídeo do Pexels, escolhe o arquivo MP4 mais próximo de 1080 px no lado menor (bom para 9:16 sem ser gigante). */
export function melhorArquivoPexels(arquivos = []) {
  const mp4 = arquivos.filter((f) => f.link && (f.file_type || '').includes('mp4') && f.width && f.height);
  if (!mp4.length) return null;
  const menor = (f) => Math.min(f.width, f.height);
  return [...mp4].sort((x, y) => Math.abs(menor(x) - 1080) - Math.abs(menor(y) - 1080) || menor(x) - menor(y))[0];
}

export function normalizarPexels(j, tipo) {
  if (tipo === 'video') {
    return (j.videos || []).map((v) => {
      const f = melhorArquivoPexels(v.video_files);
      return f && {
        id: `pexels-v-${v.id}`, fonte: 'Pexels', tipo: 'video', miniatura: v.image, url: f.link, largura: f.width, altura: f.height,
        duracao: v.duration || null, autor: v.user?.name || '', pagina: v.url || '',
      };
    }).filter(Boolean);
  }
  return (j.photos || []).map((p) => ({
    id: `pexels-f-${p.id}`, fonte: 'Pexels', tipo: 'foto', miniatura: p.src?.medium || p.src?.small, url: p.src?.large2x || p.src?.original,
    largura: p.width, altura: p.height, duracao: null, autor: p.photographer || '', pagina: p.url || '',
  })).filter((x) => x.url && x.miniatura);
}

export function normalizarPixabay(j, tipo) {
  if (tipo === 'video') {
    return (j.hits || []).map((h) => {
      // "small" costuma ser ~1080p (o "medium" do Pixabay já vem em 1440p/2560 px, pesado para o navegador).
      const f = [h.videos?.small, h.videos?.medium, h.videos?.tiny].find((x) => x?.url);
      if (!f?.url) return null;
      return {
        id: `pixabay-v-${h.id}`, fonte: 'Pixabay', tipo: 'video', miniatura: f.thumbnail || h.videos?.tiny?.thumbnail || '', url: f.url,
        largura: f.width, altura: f.height, duracao: h.duration || null, autor: h.user || '', pagina: h.pageURL || '',
      };
    }).filter((x) => x && x.miniatura);
  }
  return (j.hits || []).map((h) => ({
    id: `pixabay-f-${h.id}`, fonte: 'Pixabay', tipo: 'foto', miniatura: h.webformatURL, url: h.largeImageURL || h.webformatURL,
    largura: h.imageWidth, altura: h.imageHeight, duracao: null, autor: h.user || '', pagina: h.pageURL || '',
  })).filter((x) => x.url && x.miniatura);
}

async function pedirJson(url, opcoes, f) {
  let r;
  try { r = await f(url, { ...opcoes, signal: AbortSignal.timeout(15_000) }); } catch { throw new ErroBroll('O banco de imagens não respondeu. Tente de novo.', 502); }
  if (r.status === 401 || r.status === 403) throw new ErroBroll('Chave recusada pelo banco de imagens. Confira a chave no .env.', 502);
  if (r.status === 429) throw new ErroBroll('Limite de buscas do banco de imagens atingido. Aguarde alguns minutos.', 429);
  if (!r.ok) throw new ErroBroll(`O banco de imagens devolveu erro ${r.status}.`, 502);
  return r.json();
}

async function buscarPexels({ termo, tipo, pagina, orientacao }, env, f) {
  const base = tipo === 'video' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search';
  const q = new URLSearchParams({ query: termo, per_page: String(POR_PAGINA), page: String(pagina), locale: 'pt-BR' });
  if (orientacao) q.set('orientation', orientacao);
  return normalizarPexels(await pedirJson(`${base}?${q}`, { headers: { Authorization: env.PEXELS_API_KEY } }, f), tipo);
}

async function buscarPixabay({ termo, tipo, pagina, orientacao }, env, f) {
  const base = tipo === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/';
  const q = new URLSearchParams({ key: env.PIXABAY_API_KEY, q: termo.slice(0, 100), per_page: String(POR_PAGINA), page: String(pagina), lang: 'pt', safesearch: 'true' });
  if (tipo !== 'video') { q.set('image_type', 'photo'); if (orientacao === 'portrait') q.set('orientation', 'vertical'); if (orientacao === 'landscape') q.set('orientation', 'horizontal'); }
  return normalizarPixabay(await pedirJson(`${base}?${q}`, {}, f), tipo);
}

/**
 * Busca nos bancos configurados. `fonte`: 'todos' | 'pexels' | 'pixabay'; `tipo`: 'video' | 'foto'.
 * Se um banco falhar e o outro responder, devolve o que veio e explica o problema em `avisos`.
 */
export async function buscarBroll({ termo, tipo = 'video', fonte = 'todos', pagina = 1, orientacao = '' }, { env = process.env, fetch: f = fetch } = {}) {
  termo = String(termo || '').trim();
  if (!termo || termo.length > 100) throw new ErroBroll('Digite o que procurar (até 100 caracteres).', 400);
  if (!['video', 'foto'].includes(tipo)) throw new ErroBroll('Tipo inválido.', 400);
  if (!['', 'portrait', 'landscape', 'square'].includes(orientacao)) orientacao = '';
  pagina = Math.min(20, Math.max(1, Math.floor(Number(pagina)) || 1));
  const st = statusBroll(env);
  if (!st.pexels && !st.pixabay) throw new ErroBroll('Configure as chaves gratuitas do Pexels/Pixabay para usar.', 503);
  const usar = { pexels: st.pexels && fonte !== 'pixabay', pixabay: st.pixabay && fonte !== 'pexels' };
  if (!usar.pexels && !usar.pixabay) throw new ErroBroll(`A chave do ${fonte === 'pexels' ? 'Pexels' : 'Pixabay'} não está configurada.`, 503);
  const p = { termo, tipo, pagina, orientacao };
  const [a, b] = await Promise.allSettled([
    usar.pexels ? buscarPexels(p, env, f) : Promise.resolve([]),
    usar.pixabay ? buscarPixabay(p, env, f) : Promise.resolve([]),
  ]);
  const avisos = [[a, 'Pexels'], [b, 'Pixabay']].filter(([x]) => x.status === 'rejected').map(([x, n]) => `${n}: ${x.reason?.message || 'falhou'}`);
  if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
  return { itens: intercalar(a.value || [], b.value || []), avisos, fontes: usar };
}

export function urlPermitida(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && HOSTS_PERMITIDOS.some((re) => re.test(u.hostname)); } catch { return false; }
}

/** Baixa um arquivo escolhido na busca (só dos domínios dos bancos) e devolve { bytes, tipo }. */
export async function baixarBroll(url, { fetch: f = fetch } = {}) {
  if (!urlPermitida(url)) throw new ErroBroll('Endereço de arquivo não permitido.', 400);
  let r;
  try { r = await f(url, { signal: AbortSignal.timeout(90_000), headers: { 'User-Agent': 'GerenciadorCriativos/1.0' } }); } catch { throw new ErroBroll('Não consegui baixar o arquivo do banco. Tente outro.', 502); }
  if (!r.ok || !urlPermitida(r.url || url)) throw new ErroBroll(`O banco recusou o download (erro ${r.status}).`, 502);
  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^(image|video)\//.test(tipo)) throw new ErroBroll('O arquivo baixado não é imagem nem vídeo.', 502);
  if (Number(r.headers.get('content-length')) > TAMANHO_MAX) throw new ErroBroll('Arquivo grande demais (máx. 80 MB). Escolha outro.', 413);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > TAMANHO_MAX) throw new ErroBroll('Arquivo grande demais (máx. 80 MB). Escolha outro.', 413);
  return { bytes, tipo };
}
