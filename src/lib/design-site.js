// Sistema visual por cliente (Frente 1 da fase de qualidade): par de fontes de uma lista curta de fontes web que servem
// para loja, paleta contida (a cor da marca só como destaque, neutros no resto), escala de espaço e arredondamento.
// Puro (sem banco nem tela). Fica guardado no site (site.design = { par, coresLogo, escolhidoEm }); o resto é derivado
// sempre da fonte (nicho, tom de voz, estética, logo, cores escolhidas). O operador troca o par entre 3 opções no passo 4.
// Usado pela prévia de loja (lib/pacote-loja.js) e pelo site personalizado (lib/sitegen.js), para cada cliente ter cara
// própria em vez do mesmo molde com outra cor.
import { textoSobre, corLegivel, contraste } from './contraste.js';

/**
 * Pares de fontes (Google Fonts, todas com acentos do português). `nichos`/`tons`: palavras que puxam o par para o topo.
 * raio = arredondamento (px) de botões, fotos e caixas; arejado = seções com mais espaço; escala = razão da escala de títulos.
 */
export const PARES_FONTES = [
  { id: 'tecnico', nome: 'Técnico', titulo: 'Archivo', texto: 'IBM Plex Sans', pesoTitulo: 700, pesos: { titulo: '600;700', texto: '400;500;600' }, raio: 6, arejado: false, escala: 1.25, serifa: false,
    nichos: /suplement|fitness|academ|esport|treino|eletr[oô]n|tecnolog|ferrament|automot|nutri/, tons: /t[eé]cnic|diret|s[eé]ri|confi[aá]ve|cient|objetiv/ },
  { id: 'editorial', nome: 'Editorial', titulo: 'Bodoni Moda', texto: 'Jost', pesoTitulo: 500, pesos: { titulo: '500;700', texto: '400;500;600' }, raio: 0, arejado: true, escala: 1.333, serifa: true,
    nichos: /moda|roupa|vestu[aá]r|vestido|bolsa|acess[oó]ri|cal[cç]ad|sapat|lingerie|biqu[ií]n/, tons: /premium|sofistic|elegan|chique|luxo|minimal/ },
  { id: 'natural', nome: 'Natural', titulo: 'Fraunces', texto: 'Nunito Sans', pesoTitulo: 600, pesos: { titulo: '600;700', texto: '400;600;700' }, raio: 14, arejado: true, escala: 1.25, serifa: true,
    nichos: /cosm[eé]t|beleza|pele|skin|cabelo|natural|org[aâ]nic|caf[eé]|aliment|ch[aá]s?\b|vela|aroma|sabonete/, tons: /acolhe|leve|natural|calm|suave|cuidad/ },
  { id: 'suave', nome: 'Suave', titulo: 'DM Serif Display', texto: 'DM Sans', pesoTitulo: 400, pesos: { titulo: '400', texto: '400;500;700' }, raio: 10, arejado: true, escala: 1.25, serifa: true,
    nichos: /infantil|beb[eê]|crian[cç]a|pet|cachorr|gato|decora|presente|papelaria|casa/, tons: /carinh|afetiv|delicad|divert|fofo|alegr/ },
  { id: 'urbano', nome: 'Urbano', titulo: 'Bricolage Grotesque', texto: 'Figtree', pesoTitulo: 700, pesos: { titulo: '600;800', texto: '400;500;600' }, raio: 8, arejado: false, escala: 1.333, serifa: false,
    nichos: /streetwear|t[eê]nis|skate|surf|gamer|bon[eé]|camiseta|jovem|fitness/, tons: /descontra|jovem|ousad|irreverent|energ|despojad/ },
  { id: 'classico', nome: 'Clássico', titulo: 'Libre Baskerville', texto: 'Karla', pesoTitulo: 700, pesos: { titulo: '400;700', texto: '400;500;700' }, raio: 2, arejado: true, escala: 1.25, serifa: true,
    nichos: /joia|semijoia|rel[oó]gio|vinho|perfum|couro|artesan|caf[eé] especial/, tons: /tradicion|cl[aá]ssic|premium|artesan|atemporal/ },
];
export const ORDEM_PADRAO_PARES = ['tecnico', 'natural', 'editorial', 'suave', 'urbano', 'classico'];
export const parPorId = (id) => PARES_FONTES.find((p) => p.id === id) || null;

const HEX6 = /^#[0-9a-f]{6}$/i;
/** Cor padrão antiga do site personalizado (roxo/azul do formulário): não conta como escolha da marca. */
export const COR_PADRAO_ANTIGA = '#4f46e5';
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** As 3 opções de par de fontes para o cliente, da que mais combina para a menos (nicho pesa 2, tom de voz 1). */
export function opcoesDePar(cliente = {}) {
  const m = cliente.marca || {};
  const nicho = norm([cliente.nicho, cliente.subnicho, m.negocio].filter(Boolean).join(' '));
  const tom = norm([m.tomDeVoz, m.estetica].filter(Boolean).join(' '));
  const pontos = (p) => (p.nichos.test(nicho) ? 2 : 0) + (p.tons.test(tom) ? 1 : 0);
  return [...PARES_FONTES].sort((a, b) => pontos(b) - pontos(a) || ORDEM_PADRAO_PARES.indexOf(a.id) - ORDEM_PADRAO_PARES.indexOf(b.id)).slice(0, 3).map((p) => p.id);
}

// ---------- cores ----------
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** Mistura a cor `a` com `b` (t = quanto de `b`, 0 a 1). */
export const misturar = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
/** Matiz (0-360) e saturação (0-1) de uma cor hex. */
export function matiz(h) {
  const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return { h: 0, s: 0, l: (mx + mn) / 2 };
  const l = (mx + mn) / 2, s = d / (1 - Math.abs(2 * l - 1));
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (hh * 60 + 360) % 360, s, l };
}
/** Roxo/azul de "padrão de IA" (matiz 225-290, saturado). */
export const ehRoxoAzul = (h) => { if (!HEX6.test(h || '')) return false; const x = matiz(h); return x.h >= 225 && x.h <= 290 && x.s > 0.35; };
/** Hex escritos no texto de estética do perfil ("paleta #0f5132 e #f5f5f0"). */
export const hexDoTexto = (t) => (String(t || '').match(/#[0-9a-f]{6}\b/gi) || []).map((x) => x.toLowerCase());

/**
 * Cor dominante de uma imagem (dados RGBA de um canvas pequeno): a mais frequente entre as cores com saturação, ignorando
 * transparente, quase branco e quase preto (fundo do logo). Sem cor viva, devolve a escura mais frequente. null se vazio.
 */
export function corDominante(dados) {
  const contagem = new Map(), escuras = new Map();
  for (let i = 0; i + 3 < (dados?.length || 0); i += 4) {
    if (dados[i + 3] < 200) continue;
    const c = [dados[i], dados[i + 1], dados[i + 2]].map((v) => Math.round(v / 24) * 24);
    const h = hex(c), { s, l } = matiz(h);
    if (l > 0.93) continue;
    if (l < 0.12 || s < 0.18) { escuras.set(h, (escuras.get(h) || 0) + 1); continue; }
    contagem.set(h, (contagem.get(h) || 0) + 1);
  }
  const maior = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return maior(contagem) || maior(escuras);
}

/**
 * De onde vem a cor de destaque, nesta ordem: escolha do operador (cor do site personalizado diferente da padrão antiga),
 * hex escrito na estética do perfil, cor do logo, paleta da IA, e por último um grafite neutro. Devolve { cor, fonte }.
 */
export function corDaMarca({ cliente = {}, site = {}, coresLogo = [] } = {}) {
  const manual = site?.config?.corPrimaria;
  if (site?.modo === 'custom' && HEX6.test(manual || '') && manual.toLowerCase() !== COR_PADRAO_ANTIGA) return { cor: manual.toLowerCase(), fonte: 'escolhida' };
  const est = hexDoTexto(cliente?.marca?.estetica)[0];
  if (est) return { cor: est, fonte: 'perfil' };
  const logo = (coresLogo || []).find((h) => HEX6.test(h || ''));
  if (logo) return { cor: logo.toLowerCase(), fonte: 'logo' };
  const ia = (site?.pacote?.briefingTema?.paletaSugerida || []).find((h) => HEX6.test(h || ''));
  if (ia) return { cor: ia.toLowerCase(), fonte: 'ia' };
  return { cor: '#2b2b2b', fonte: 'neutra' };
}

/**
 * Sistema visual completo do site: { par (objeto), opcoes [3 ids], cores {acento, sobreAcento, acentoTexto, texto, suave,
 * fundo, borda}, fonteCor, raio, espaco {secao, secaoCel, gap}, tipo {h1, h2, h3, corpo}, fontesUrl }.
 * `design` = o guardado no site (só a escolha do par e as cores do logo lidas uma vez).
 */
export function designDoSite({ cliente = {}, site = {}, design = site?.design } = {}) {
  const opcoes = opcoesDePar(cliente);
  const par = parPorId(design?.par) || parPorId(opcoes[0]);
  const { cor, fonte } = corDaMarca({ cliente, site, coresLogo: design?.coresLogo });
  const fundo = '#ffffff';
  const texto = misturar(cor, '#17181a', 0.88); // quase preto puxado de leve para a cor da marca
  const cores = {
    acento: cor, sobreAcento: textoSobre(cor), acentoTexto: corLegivel(cor, fundo), texto, fundo,
    suave: misturar(cor, '#ffffff', 0.94), borda: misturar(texto, '#ffffff', 0.86), apagado: misturar(texto, '#ffffff', 0.35),
  };
  if (contraste(cores.apagado, fundo) < 4.5) cores.apagado = corLegivel(cores.apagado, fundo);
  const base = 16, r = par.escala;
  const tipo = { corpo: base, h3: Math.round(base * r), h2: Math.round(base * r * r * r), h1: Math.round(base * r ** 5) };
  const espaco = par.arejado ? { secao: 88, secaoCel: 56, gap: 28 } : { secao: 64, secaoCel: 44, gap: 20 };
  return { par, opcoes, cores, fonteCor: fonte, raio: par.raio, espaco, tipo, fontesUrl: urlFontes(par) };
}

/** Folha do Google Fonts do par (só as famílias e pesos usados; display=swap: o texto aparece mesmo sem a fonte). */
export function urlFontes(par) {
  const fam = (nome, pesos) => `family=${nome.replace(/ /g, '+')}:wght@${pesos}`;
  return `https://fonts.googleapis.com/css2?${fam(par.titulo, par.pesos.titulo)}&${fam(par.texto, par.pesos.texto)}&display=swap`;
}

/** Texto curto do par para o operador e para o "O que colocar na plataforma". */
export const textoPar = (par) => `${par.titulo} nos títulos e ${par.texto} no texto`;

/** Variáveis CSS do design (as duas prévias usam os mesmos nomes). */
export function cssVariaveis(d) {
  const c = d.cores, serifa = d.par.serifa ? 'Georgia,serif' : 'system-ui,sans-serif';
  return `:root{--acento:${c.acento};--sobre-acento:${c.sobreAcento};--acento-texto:${c.acentoTexto};--txt:${c.texto};--fundo:${c.fundo};--suave:${c.suave};--borda:${c.borda};--apagado:${c.apagado};`
    + `--raio:${d.raio}px;--raio-g:${Math.round(d.raio * 1.5)}px;--secao:${d.espaco.secao}px;--secao-cel:${d.espaco.secaoCel}px;--gap:${d.espaco.gap}px;`
    + `--f-titulo:"${d.par.titulo}",${serifa};--f-texto:"${d.par.texto}",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--peso-titulo:${d.par.pesoTitulo};`
    + `--h1:${d.tipo.h1}px;--h2:${d.tipo.h2}px;--h3:${d.tipo.h3}px}`;
}
