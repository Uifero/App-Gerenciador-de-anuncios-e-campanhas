// Medidas de cada lugar do site (banner, produto, Clientes reais, Sobre, Galeria) por plataforma/tema, ponto focal das
// fotos e a conta do recorte. Regras puras, sem tela: a prévia (CSS) e o .zip (canvas) usam a MESMA conta, então o
// recorte baixado é o mesmo que o operador viu.
//  - Ponto focal (material.foco = { x, y }, de 0 a 1; padrão: centro): o recorte desliza sobre a foto na proporção do
//    foco (x = foco.x * sobra). Com isso o ponto escolhido fica SEMPRE dentro do recorte, em qualquer proporção, e o CSS
//    equivalente é só `object-position: foco.x% foco.y%` (vale para qualquer tamanho de tela).
//  - Medidas: só o que é recomendação conhecida da plataforma; no resto, padrão do app, dito como tal em `fonte`.

export const LUGARES = [['banner', 'Banner'], ['produto', 'Produto'], ['clientes', 'Clientes reais'], ['sobre', 'Sobre a loja'], ['galeria', 'Galeria']];
export const nomeLugar = (k) => (LUGARES.find(([l]) => l === k) || [, k])[1];

const PADRAO = 'padrão do app (sem medida oficial conhecida)';
const BASE = {
  banner: { desktop: [1920, 800], mobile: [1080, 1350], fonte: PADRAO },
  produto: { desktop: [1200, 1200], mobile: null, fonte: PADRAO },
  clientes: { desktop: [1080, 1350], mobile: null, fonte: PADRAO },
  sobre: { desktop: [1600, 1000], mobile: [1080, 1080], fonte: PADRAO },
  galeria: { desktop: [1080, 1080], mobile: null, fonte: PADRAO },
};
// Recomendações das plataformas. Onde a plataforma não publica um número fixo (varia com o tema/layout), fica o padrão
// do app e a fonte diz para conferir no editor do tema.
const PLATAFORMAS = {
  shopify: {
    banner: { desktop: [2400, 1000], mobile: [1080, 1350], fonte: 'Shopify: proporção 2,4:1 usada em slideshow/banner de imagem (guias de temas; 3840×1600 na versão grande) e 4:5 no celular; confira no editor do tema' },
    produto: { desktop: [2048, 2048], mobile: null, fonte: 'Shopify: 2048×2048 (quadrado), recomendação da Shopify para fotos de produto' },
  },
  nuvemshop: {
    banner: { desktop: [1920, 800], mobile: [1080, 1350], fonte: 'Nuvemshop: a medida muda com o layout (o editor mostra a de cada um) e a Nuvemshop aceita imagem separada para celular; aqui, padrão do app' },
    produto: { desktop: [1024, 1024], mobile: null, fonte: 'Nuvemshop: quadrado, padrão do app (1024×1024); confira no layout' },
  },
};
const TEMAS = {
  dawn: { banner: { nota: 'Dawn: a seção "Apresentação de slides"/"Banner de imagem" usa a mesma imagem no celular (recortada pelo tema); use a versão "-mobile" só se o tema tiver campo de imagem para celular.' } },
  horizon: { banner: { nota: 'Horizon: confira no editor se o slide tem campo de imagem para celular; se não tiver, use só a versão "-desktop".' } },
};

/** Medidas de cada lugar para a plataforma/tema: { banner: { desktop: { l, a }, mobile: { l, a } | null, fonte, nota? }, ... }. */
export function medidasDe(plataforma = null, tema = '') {
  const t = String(tema || '').toLowerCase();
  const out = {};
  for (const [k] of LUGARES) {
    const m = { ...BASE[k], ...(PLATAFORMAS[plataforma]?.[k] || {}), ...(plataforma === 'shopify' ? TEMAS[t]?.[k] || {} : {}) };
    out[k] = { desktop: { l: m.desktop[0], a: m.desktop[1] }, mobile: m.mobile ? { l: m.mobile[0], a: m.mobile[1] } : null, fonte: m.fonte, ...(m.nota ? { nota: m.nota } : {}) };
  }
  return out;
}
export const proporcao = (m) => (m ? m.l / m.a : 1);
/** "1920×800" */
export const textoMedida = (m) => (m ? `${m.l}×${m.a}` : '');

// ---------- ponto focal ----------
const n01 = (v, padrao = 0.5) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : padrao; };
export const normalizarFoco = (f) => ({ x: Math.round(n01(f?.x) * 1000) / 1000, y: Math.round(n01(f?.y) * 1000) / 1000 });
export const focoDe = (m) => normalizarFoco(m?.foco);
/** CSS equivalente ao recorte: "30% 20%". */
export const posicaoCss = (foco) => { const f = normalizarFoco(foco); return `${+(f.x * 100).toFixed(1)}% ${+(f.y * 100).toFixed(1)}%`; };
/** Foto em pé (mais alta que larga, com folga de 10%)? Sem medidas conhecidas, não. */
export const ehVertical = (m) => Number(m?.altura) > 0 && Number(m?.largura) > 0 && Number(m.altura) > Number(m.largura) * 1.1;

/**
 * Pedaço da foto (largura `w`, altura `h`) que vai para um quadro de proporção `alvo` (largura/altura), mantendo o foco
 * dentro: { x, y, w, h } em pixels da foto. "Preencher" (cover). O foco fica na mesma fração do recorte que da sobra.
 */
export function recorte(w, h, alvo, foco) {
  const f = normalizarFoco(foco);
  let cw = w, ch = w / alvo;
  if (ch > h) { ch = h; cw = h * alvo; }
  return { x: f.x * (w - cw), y: f.y * (h - ch), w: cw, h: ch };
}
/** "Mostrar inteira" (contain): onde a foto inteira fica dentro do quadro L×A (o resto é fundo branco). */
export function encaixe(w, h, L, A) {
  const e = Math.min(L / w, A / h);
  const dw = w * e, dh = h * e;
  return { x: (L - dw) / 2, y: (A - dh) / 2, w: dw, h: dh };
}
/** Fatias lado a lado de "Juntar fotos": n fotos num quadro L×A (larguras inteiras que somam L). */
export function fatias(n, L, A) {
  const out = []; let x = 0;
  for (let i = 0; i < n; i++) { const w = Math.round((L * (i + 1)) / n) - x; out.push({ x, y: 0, w, h: A }); x += w; }
  return out;
}

// ---------- arquivos do .zip "Imagens por lugar" ----------
const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const pastaSegura = (s) => sem(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
const foto = (x) => ({ url: x.url, foco: normalizarFoco(x.foco), codigo: x.codigo || '', nome: x.nome || '' });
const versoes = (med) => [['desktop', med.desktop], ...(med.mobile ? [['mobile', med.mobile]] : [])];

/**
 * Plano do .zip: cada foto já no tamanho de cada lugar e aparelho. `d` = dadosDoPacote (slides do banner, produtos,
 * provas, sobre, galeria e `medidas`). Cada arquivo: { caminho, l, a, ajuste: 'cover'|'contain', fotos: [{ url, foco,
 * codigo, nome }], lugar, dispositivo, posicao, url } — `fotos` com 2 ou 3 itens = "Juntar fotos" (lado a lado).
 * Nada aqui mexe no original: o recorte é feito numa cópia, na hora de baixar.
 */
export function planoArquivos(d) {
  const med = d.medidas || medidasDe(d.plataforma, d.tema);
  const out = [];
  const add = (pasta, base, lugar, posicao, fotos, ajuste = 'cover', extra = {}) => {
    const vs = versoes(med[lugar]);
    for (const [disp, m] of vs) {
      const nomeDisp = disp && med[lugar].mobile ? `-${disp}` : '';
      out.push({ caminho: `${pasta}/${base}-${posicao}${nomeDisp}.jpg`, l: m.l, a: m.a, ajuste, fotos: fotos.map(foto), lugar, dispositivo: disp || 'desktop', posicao, url: fotos[0]?.url || '', ...extra });
    }
  };
  // Sites de antes (sem slides calculados): a imagem única do banner vira o slide 1.
  const slides = d.visual?.slides || (d.visual?.banner?.url ? [{ fotos: [d.visual.banner] }] : []);
  slides.forEach((s, i) => { const fs = (s.fotos || []).filter((x) => x?.url); if (fs.length) add('banner', 'banner', 'banner', i + 1, fs); });
  const usadas = new Set();
  (d.produtos || []).forEach((p, k) => {
    let pasta = `produtos/${pastaSegura(p.nome)}`; while (usadas.has(pasta)) pasta += '-2'; usadas.add(pasta);
    (p.arquivos || []).filter((x) => x?.url).forEach((x, i) => add(pasta, 'produto', 'produto', i + 1, [x], d.visual?.ajusteFotos === 'contain' ? 'contain' : 'cover', { produto: k }));
  });
  // Print de cliente nunca é cortado (cortaria o texto): vai inteiro no quadro. Foto de pessoa: recorte com o foco.
  (d.provas || []).filter((x) => x?.url).forEach((x, i) => add('clientes-reais', 'cliente', 'clientes', i + 1, [{ ...x, nome: x.nome || 'print' }], x.foto ? 'cover' : 'contain'));
  (d.sobreImagens || []).filter((x) => x?.url).forEach((x, i) => add('sobre', 'sobre', 'sobre', i + 1, [x]));
  (d.galeria || []).filter((x) => x?.url).forEach((x, i) => add('galeria', 'galeria', 'galeria', i + 1, [x]));
  return out;
}
