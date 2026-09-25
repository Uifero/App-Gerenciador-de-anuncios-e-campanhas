// Leitura do site PRÓPRIO do cliente (pergunta 0 da aba Site/Loja): o servidor baixa a página informada e extrai,
// sem IA e sem adivinhar, o que está escrito nela — título, descrição, textos, produtos estruturados (JSON-LD de
// produto e, em loja Shopify, o /products.json público) e fotos. A IA só interpreta esse texto depois (core/ia.js).
// Instagram NÃO passa por aqui: a plataforma bloqueia acesso automatizado; ele usa a busca web (melhor esforço).
//
// Segurança (o servidor busca um endereço digitado): só http/https nas portas padrão, só IP público (o nome é
// resolvido e cada redirecionamento é conferido de novo), tempo e tamanho limitados, e só usuário logado chama.
import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';
import { tipoLink } from '../src/lib/leitura.js';

export { tipoLink };

export class ErroLeitura extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

const MAX_HTML = 3 * 1024 * 1024;     // 3 MB por página
const MAX_IMAGEM = 10 * 1024 * 1024;  // 10 MB por foto
const MAX_TEXTO = 12000;              // texto visível enviado à IA
const MAX_IMAGENS = 24;
const UA = 'Mozilla/5.0 (compatible; GerenciadorCriativos/1.0; leitura do site do proprio cliente)';

// Classificação do link (site x Instagram) é a mesma do navegador: src/lib/leitura.js.

// ---------- rede: só endereços públicos ----------
export function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return ipPrivado(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

/** Confere protocolo, porta e se o nome aponta só para IP público. Lança ErroLeitura se não. */
export async function conferirUrlPublica(url, { lookup = dnsLookup } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new ErroLeitura('Link inválido.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ErroLeitura('Use um link http ou https.');
  if (u.port && !['80', '443'].includes(u.port)) throw new ErroLeitura('Só links em portas padrão (80/443).');
  if (u.username || u.password) throw new ErroLeitura('Link com usuário/senha não é aceito.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new ErroLeitura('Esse endereço não é público.');
  let ends;
  if (net.isIP(host)) ends = [{ address: host }];
  else { try { ends = await lookup(host, { all: true }); } catch { throw new ErroLeitura('Não encontrei esse site (o endereço existe?).', 422); } }
  if (!ends.length || ends.some((e) => ipPrivado(e.address))) throw new ErroLeitura('Esse endereço não é público.');
  return u;
}

/** GET seguindo até 4 redirecionamentos, cada um conferido. Devolve a Response final (corpo ainda não lido). */
async function buscar(url, { fetch: f = fetch, lookup, timeout = 15_000, aceitar = '' } = {}) {
  let atual = url;
  for (let i = 0; i < 5; i++) {
    await conferirUrlPublica(atual, { lookup });
    let r;
    try { r = await f(atual, { redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': UA, Accept: aceitar || '*/*', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' } }); }
    catch { throw new ErroLeitura('O site não respondeu a tempo.', 502); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { atual = new URL(r.headers.get('location'), atual).toString(); continue; }
    return { r, url: atual };
  }
  throw new ErroLeitura('O site redireciona demais.', 502);
}

async function lerCorpo(r, max) {
  if (Number(r.headers.get('content-length')) > max) throw new ErroLeitura('Arquivo grande demais.', 413);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > max) throw new ErroLeitura('Arquivo grande demais.', 413);
  return buf;
}
function decodificar(buf, tipo) {
  const cs = (/charset=([\w-]+)/i.exec(tipo || '') || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString('latin1')) || [])[1];
  try { return new TextDecoder(cs && /^(iso-8859-1|latin1|windows-1252)$/i.test(cs) ? 'latin1' : 'utf-8').decode(buf); } catch { return buf.toString('utf8'); }
}

// ---------- extração (pura, testada) ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', reg: '®', copy: '©', trade: '™', bull: '•', middot: '·' };
const decodificarUmaVez = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
/** Duas passadas: muitos sites escapam duas vezes (&amp;ndash;). */
export const decodificarEntidades = (s) => decodificarUmaVez(decodificarUmaVez(s));
const limpar = (s) => decodificarEntidades(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const atributos = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((m) => [m[1].toLowerCase(), decodificarEntidades(m[3] ?? m[4] ?? m[5] ?? '')]));
const absoluta = (src, base) => { try { const u = new URL(src, base); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null; } catch { return null; } };
const preco = (v) => { const n = Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

/** Produtos do JSON-LD (schema.org Product, dentro de @graph / ItemList também). */
export function produtosJsonLd(html, base) {
  const out = [];
  const visitar = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visitar);
    const tipos = [].concat(n['@type'] || []);
    if (tipos.includes('Product') && n.name) {
      const ofertas = [].concat(n.offers || []).flatMap((o) => [].concat(o?.offers || o));
      const img = [].concat(n.image || []).map((i) => absoluta(typeof i === 'string' ? i : i?.url, base)).filter(Boolean);
      out.push({ nome: limpar(n.name).slice(0, 120), descricao: limpar(n.description).slice(0, 600), preco: ofertas.map((o) => preco(o?.price ?? o?.lowPrice)).find(Boolean) ?? null, imagens: img.slice(0, 4), fonte: 'jsonld' });
    }
    ['@graph', 'itemListElement', 'item', 'mainEntity'].forEach((k) => visitar(n[k]));
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visitar(JSON.parse(m[1].trim())); } catch { /* JSON-LD quebrado: ignora esse bloco */ }
  }
  return out;
}

/** Tudo que dá para tirar de uma página sem IA. */
export function extrairPagina(html, base) {
  const metas = {};
  for (const m of html.matchAll(/<meta\s[^>]*>/gi)) {
    const a = atributos(m[0]); const k = (a.property || a.name || '').toLowerCase();
    if (k && a.content && !metas[k]) metas[k] = a.content.trim();
  }
  const titulo = limpar((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]).slice(0, 200);
  const corpo = html.replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const texto = limpar(corpo.replace(/<\/(p|div|li|h\d|section|article|br|tr)>/gi, '\n')).slice(0, MAX_TEXTO);
  const imagens = [];
  const addImg = (src, alt = '') => {
    const u = absoluta(src, base);
    if (!u || /\.svg(\?|$)|\.gif(\?|$)|sprite|favicon|pixel|spacer|placeholder|facebook\.com\/tr/i.test(u)) return;
    if (/logo|icon|ícone|bandeira|selo/i.test(`${u} ${alt}`)) return;
    if (!imagens.some((x) => x.url === u)) imagens.push({ url: u, alt: limpar(alt).slice(0, 120) });
  };
  if (metas['og:image']) addImg(metas['og:image'], metas['og:title'] || titulo);
  const produtos = produtosJsonLd(html, base);
  produtos.forEach((p) => p.imagens.forEach((u) => addImg(u, p.nome)));
  for (const m of html.matchAll(/<img\s[^>]*>/gi)) {
    const a = atributos(m[0]);
    const larg = Number(a.width); if (larg && larg < 120) continue;
    addImg(a['data-src'] || a.src || (a.srcset || a['data-srcset'] || '').split(',').pop()?.trim().split(/\s+/)[0], a.alt);
  }
  const host = (() => { try { return new URL(base).hostname; } catch { return ''; } })();
  const linksProduto = [...new Set([...html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)].map((m) => absoluta(decodificarEntidades(m[1]), base))
    .filter((u) => u && new URL(u).hostname === host && /\/(products?|produtos?)\/[^/?]+/i.test(new URL(u).pathname)))].slice(0, 4);
  return {
    titulo, descricao: metas['og:description'] || metas.description || '', nomeSite: metas['og:site_name'] || '',
    texto, produtos, imagens: imagens.slice(0, MAX_IMAGENS), linksProduto,
    shopify: /cdn\.shopify\.com|Shopify\.shop|myshopify\.com/i.test(html),
  };
}

/** /products.json público de lojas Shopify -> mesma forma dos produtos do JSON-LD. */
export function produtosShopify(json, base) {
  return (json?.products || []).slice(0, 20).map((p) => ({
    nome: limpar(p.title).slice(0, 120), descricao: limpar(p.body_html).slice(0, 600), preco: preco(p.variants?.[0]?.price),
    imagens: (p.images || []).map((i) => absoluta(i.src, base)).filter(Boolean).slice(0, 4), fonte: 'shopify',
  })).filter((p) => p.nome && !NAO_PRODUTO.test(p.nome));
}
/** Itens técnicos que lojas Shopify cadastram como produto (seguro de envio, vale-presente…). */
const NAO_PRODUTO = /coverage|shipping protection|route package|gift ?card|cart[aã]o[- ]presente|vale[- ]presente|seguro (de|do) envio|frete/i;

const chaveNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function juntarProdutos(...listas) {
  const out = [];
  for (const p of listas.flat()) if (p?.nome && !out.some((x) => chaveNome(x.nome) === chaveNome(p.nome))) out.push(p);
  return out.slice(0, 20);
}

/** Lê o site: página informada + até 4 páginas de produto + /products.json se for Shopify. */
export async function lerSite(entrada, opts = {}) {
  const link = tipoLink(entrada);
  if (!link || link.tipo !== 'site') throw new ErroLeitura('Informe o link do site (ex.: https://www.lojadocliente.com.br).');
  const { r, url } = await buscar(link.url, { ...opts, aceitar: 'text/html,application/xhtml+xml' });
  if (r.status === 401 || r.status === 403 || r.status === 429 || r.status === 503) throw new ErroLeitura(`O site bloqueou a leitura automática (erro ${r.status}).`, 424);
  if (!r.ok) throw new ErroLeitura(`O site respondeu com erro ${r.status}.`, 424);
  const tipo = r.headers.get('content-type') || '';
  if (!/html/i.test(tipo)) throw new ErroLeitura('Esse link não é uma página de site.', 422);
  const html = decodificar(await lerCorpo(r, MAX_HTML), tipo);
  const pag = extrairPagina(html, url);
  const extras = await Promise.allSettled(pag.linksProduto.map(async (u) => {
    const x = await buscar(u, { ...opts, timeout: 10_000, aceitar: 'text/html' });
    return x.r.ok ? produtosJsonLd(decodificar(await lerCorpo(x.r, MAX_HTML), x.r.headers.get('content-type')), x.url) : [];
  }));
  let shop = [];
  if (pag.shopify) {
    try {
      const x = await buscar(new URL('/products.json?limit=20', url).toString(), { ...opts, timeout: 10_000, aceitar: 'application/json' });
      if (x.r.ok) shop = produtosShopify(JSON.parse((await lerCorpo(x.r, MAX_HTML)).toString('utf8')), url);
    } catch { /* loja sem /products.json público: segue só com a página */ }
  }
  const produtos = juntarProdutos(shop, pag.produtos, extras.flatMap((e) => (e.status === 'fulfilled' ? e.value : [])));
  const imagens = [...pag.imagens];
  for (const p of produtos) for (const u of p.imagens) if (imagens.length < MAX_IMAGENS && !imagens.some((i) => i.url === u)) imagens.push({ url: u, alt: p.nome });
  return { tipo: 'site', url, titulo: pag.titulo, descricao: pag.descricao, nomeSite: pag.nomeSite, texto: pag.texto, produtos, imagens };
}

// ---------- fotos do site -> Materiais do cliente ----------
const SUFIXOS_2 = /\.(com|net|org|gov|edu|art|blog|ind|adv|eco|arq|med|nom|tur)\.(br|ar|mx|co|pt|uk|au)$|\.co\.uk$/;
export function dominioBase(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  const partes = h.split('.');
  return partes.slice(SUFIXOS_2.test(h) ? -3 : -2).join('.');
}
/** CDNs de plataformas de loja onde as fotos do próprio site costumam ficar hospedadas. */
const CDNS_LOJA = [/(^|\.)cdn\.shopify\.com$/, /(^|\.)myshopify\.com$/, /(^|\.)mitiendanube\.com$/, /(^|\.)nuvemshop\.com\.br$/, /(^|\.)tiendanube\.com$/,
  /(^|\.)wixstatic\.com$/, /(^|\.)vtexassets\.com$/, /(^|\.)vteximg\.com\.br$/, /(^|\.)awsli\.com\.br$/, /(^|\.)tcdn\.com\.br$/, /(^|\.)squarespace-cdn\.com$/, /^i\d\.wp\.com$/, /(^|\.)cloudfront\.net$/];
/** A foto é do próprio site (mesmo domínio) ou do CDN da plataforma da loja? Evita usar o servidor como proxy aberto. */
export function imagemDoSite(urlImagem, urlSite) {
  try {
    const i = new URL(urlImagem), s = new URL(urlSite);
    if (!['http:', 'https:'].includes(i.protocol)) return false;
    return dominioBase(i.hostname) === dominioBase(s.hostname) || CDNS_LOJA.some((re) => re.test(i.hostname));
  } catch { return false; }
}

export async function baixarImagemSite(urlImagem, urlSite, opts = {}) {
  if (!imagemDoSite(urlImagem, urlSite)) throw new ErroLeitura('Essa foto não é do site do cliente.');
  const { r, url } = await buscar(urlImagem, { ...opts, timeout: 20_000, aceitar: 'image/*' });
  if (!r.ok || !imagemDoSite(url, urlSite)) throw new ErroLeitura(`Não consegui baixar a foto (erro ${r.status}).`, 502);
  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp|avif)$/.test(tipo)) throw new ErroLeitura('O arquivo não é uma foto (JPG, PNG, WebP).', 422);
  return { bytes: await lerCorpo(r, MAX_IMAGEM), tipo };
}
