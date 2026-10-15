// "Biblioteca de animações" (criativos): animações feitas por CÓDIGO (motion graphics), desenhadas num <canvas> com as
// fotos reais do cliente, as cores e as fontes do sistema visual dele, e gravadas no navegador em MP4 (9:16 e 4:5) ou GIF.
// Nunca gera cena filmada nem pessoa: só move fotos que o cliente enviou, texto e formas. Prova de cliente só a real,
// na cópia borrada (lib/visual-site.js printsDoCliente).
// Puro aqui: os presets, o preenchimento sem IA a partir da ideia e do produto (planoInicial), a conferência dos textos
// (saúde, colchete do modelo de gancho, duração), o lugar de cada texto (sempre dentro da zona segura do Instagram) e
// o desenho de um quadro no tempo t (desenharQuadro, recebe o contexto 2D). A gravação fica em lib/animacoes-render.js.
import { zonaSegura } from './formatos-instagram.js';
import { extrairCenas, partirTexto } from './estudio.js';
import { alertaSaude, ehProdutoSaude } from './saude.js';
import { temColchete } from './ganchos.js';

const txt = (v) => String(v ?? '').trim();
const norm = (s) => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const brl = (n) => `R$ ${Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export const DURACAO_MAX = 20;      // segundos de uma animação (Reels curto)
export const DURACAO_MAX_GIF = 6;   // GIF é curto: Stories
export const MAX_CENAS = 8;
export const PALAVRAS_POR_TELA = 8; // poucas palavras por tela (leitura no celular, sem som)

/**
 * Presets. estilo: 'organico' (parece post) | 'anuncio' (motion graphic de vitrine). fotos: de onde vêm as imagens.
 * gif: true = pensado para GIF curto. politica: 'antes_depois' = só onde a política do Meta permite.
 */
export const PRESETS = [
  { id: 'zoom_legenda', nome: 'Foto com zoom lento + legenda falada', estilo: 'organico', fotos: 'produto', descricao: 'A foto do produto aproxima devagar enquanto a legenda acompanha a fala, frase por frase.' },
  { id: 'itens', nome: 'Ingredientes ou benefícios um por um', estilo: 'anuncio', fotos: 'produto', descricao: 'Os itens cadastrados no produto (composição ou benefícios) entram um de cada vez sobre a foto.' },
  { id: 'oferta_final', nome: 'Oferta, preço e frete no final', estilo: 'anuncio', fotos: 'produto', descricao: 'Fala curta sobre a foto e, no fim, o preço e o frete cadastrados aparecem.' },
  { id: 'carrossel', nome: 'Carrossel de fotos', estilo: 'organico', fotos: 'produto_ou_clientes', descricao: 'Fotos do produto ou prints reais de clientes (cópia borrada) passando, com uma legenda curta em cada.' },
  { id: 'kinetic', nome: 'Texto em ritmo de fala', estilo: 'organico', fotos: 'produto', descricao: 'Poucas palavras por vez, no ritmo de quem fala, sobre a foto ou o vídeo do cliente.' },
  { id: 'antes_depois', nome: 'Antes e depois', estilo: 'anuncio', fotos: 'duas', politica: 'antes_depois', descricao: 'Uma linha passa de um lado ao outro revelando a segunda foto. Só onde a política do Meta permite.' },
  { id: 'gif_preco', nome: 'GIF curto de preço e frete (Stories)', estilo: 'anuncio', fotos: 'produto', gif: true, descricao: 'Loop de 3 segundos com o preço e o frete cadastrados, para Stories.' },
];
export const presetPorId = (id) => PRESETS.find((p) => p.id === id) || null;
export const ESTILO_NOME = { organico: 'estilo orgânico', anuncio: 'estilo anúncio' };

// Antes e depois: proibido em saúde (REGRA_SAUDE) e em cosméticos/beleza (política do Meta para atributos e resultado).
const RE_BELEZA = /cosm[eé]t|beleza|pele|skin|cabelo|est[eé]tic|maquiag|depila|clareament/;
/** Motivo pelo qual o preset não pode ser usado com este cliente ('' = pode). */
export function motivoPreset(presetId, { cliente = {}, produtos = [], fotos = 0 } = {}) {
  const p = presetPorId(presetId); if (!p) return 'animação desconhecida';
  if (p.politica === 'antes_depois') {
    if (RE_BELEZA.test(norm(`${cliente.nicho} ${cliente.marca?.negocio}`))) return 'Antes e depois é proibido em cosmético e beleza (política do Meta): use outra animação';
    if (fotos < 2) return 'Precisa de duas fotos reais (antes e depois) nos Materiais do cliente';
  }
  return '';
}

/** Itens do produto (composição ou benefícios cadastrados), um por linha ou separados por vírgula/ponto e vírgula. */
export function itensDoProduto(produto = {}) {
  const fonte = txt(produto.formula) || txt(produto.beneficios);
  return fonte.split(/\n|;|,(?![^(]*\))/).map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 5);
}
/** Frete cadastrado (frete grátis do site ou a oferta ativa do perfil que fala de frete). Nunca inventado. */
export function freteDe({ cliente = {}, recursos = null } = {}) {
  if (recursos?.freteGratis?.valor) return `Frete grátis acima de ${brl(recursos.freteGratis.valor)}`;
  const o = txt(cliente.marca?.ofertaAtiva);
  return /frete/i.test(o) ? o.slice(0, 60) : '';
}
/** Preço do produto como está na aba Produtos: { de, por } (de só quando há promocional menor). */
export function precoDe(produto = {}) {
  const p = Number(produto.preco) || 0, q = Number(produto.precoPromocional) || 0;
  if (!p && !q) return null;
  return q && p && q < p ? { de: brl(p), por: brl(q) } : { de: '', por: brl(p || q) };
}

const durFala = (t) => Math.min(5, Math.max(1.4, Math.round((txt(t).split(/\s+/).filter(Boolean).length * 0.38 + 0.6) * 10) / 10));
/** Corta um texto em telas curtas (até PALAVRAS_POR_TELA palavras). */
export function telasDe(texto, max = 6) {
  const out = [];
  // Primeiro pelas pausas da fala (ponto, vírgula); depois em grupos do mesmo tamanho, sem deixar palavra sozinha.
  for (const trecho of txt(texto).replace(/[“”"]/g, '').split(/(?<=[.,;!?…])\s+/).filter(Boolean)) {
    const p = trecho.split(/\s+/).filter(Boolean), n = Math.ceil(p.length / max), tam = Math.ceil(p.length / n);
    for (let i = 0; i < p.length; i += tam) out.push(p.slice(i, i + tam).join(' '));
  }
  return out;
}
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Preenchimento SEM IA (caminho manual e base para a IA): o plano da animação a partir da ideia/criativo e do produto.
 * Plano = { preset, formato, cenas: [{ texto, dur, tipo: 'fala'|'item'|'oferta'|'cta'|'antes'|'depois', foto }], preco, frete, avisos }.
 */
export function planoInicial(presetId, { criativo = {}, produto = {}, cliente = {}, recursos = null, formato = '1080x1920', nFotos = 1 } = {}) {
  const p = presetPorId(presetId) || PRESETS[0];
  const base = extrairCenas({ hook: criativo.hook, copy: criativo.copy, cta: criativo.cta }).filter((c) => txt(c.texto));
  const falas = base.filter((c) => c.tipo !== 'cta').map((c) => c.texto);
  const cta = txt(criativo.cta);
  const preco = precoDe(produto), frete = freteDe({ cliente, recursos });
  const foto = (i) => (nFotos ? i % nFotos : null);
  const avisos = [];
  let cenas = [];
  const fala = (t, i) => ({ texto: t, dur: durFala(t), tipo: 'fala', foto: foto(i) });
  if (p.id === 'zoom_legenda') cenas = falas.flatMap((f) => partirTexto(f, 48)).slice(0, 6).map(fala);
  if (p.id === 'kinetic') cenas = falas.slice(0, 3).flatMap((f) => telasDe(f, 4)).slice(0, 7).map((t) => ({ texto: t, dur: r1(Math.max(0.9, durFala(t) * 0.75)), tipo: 'fala', foto: 0 }));
  if (p.id === 'carrossel') {
    const frases = falas.flatMap((f) => partirTexto(f, 40)), n = Math.max(2, Math.min(6, nFotos || 2));
    cenas = Array.from({ length: n }, (_, i) => ({ texto: frases[i] || '', dur: 2.2, tipo: 'fala', foto: foto(i) }));
  }
  if (p.id === 'itens') {
    const itens = itensDoProduto(produto);
    if (!itens.length) avisos.push('O produto não tem composição nem benefícios cadastrados: preencha na aba Produtos (o app não inventa itens).');
    cenas = [...(falas[0] ? [{ ...fala(telasDe(falas[0], 7)[0], 0) }] : []), ...itens.map((t) => ({ texto: t, dur: 1.6, tipo: 'item', foto: 0 }))];
  }
  if (p.id === 'oferta_final' || p.id === 'gif_preco') {
    if (!preco) avisos.push('O produto está sem preço: cadastre na aba Produtos.');
    if (p.id === 'oferta_final') cenas = falas.slice(0, 2).map((t, i) => fala(telasDe(t, 7)[0], i));
    cenas.push({ texto: txt(produto.nome), dur: p.id === 'gif_preco' ? 3 : 3.5, tipo: 'oferta', foto: 0 });
  }
  if (p.id === 'antes_depois') cenas = [{ texto: 'Antes', dur: 2, tipo: 'antes', foto: 0 }, { texto: 'Depois', dur: 2.5, tipo: 'depois', foto: 1 }];
  if (cta && !p.gif) cenas.push({ texto: cta, dur: 2.5, tipo: 'cta', foto: foto(cenas.length) });
  return ajustarDuracao({ preset: p.id, formato: p.gif ? '1080x1920' : formato, cenas: cenas.slice(0, MAX_CENAS), preco, frete, avisos });
}

/** Mantém o total dentro do limite (GIF ou vídeo) e cada cena entre 0,8 e 6 s. */
export function ajustarDuracao(plano) {
  const lim = presetPorId(plano.preset)?.gif ? DURACAO_MAX_GIF : DURACAO_MAX;
  const cenas = (plano.cenas || []).map((c) => ({ ...c, dur: Math.min(6, Math.max(0.8, Number(c.dur) || 2)) }));
  let total = cenas.reduce((s, c) => s + c.dur, 0);
  if (total > lim) { const f = lim / total; cenas.forEach((c) => { c.dur = Math.max(0.8, Math.floor(c.dur * f * 10) / 10); }); total = cenas.reduce((s, c) => s + c.dur, 0); }
  return { ...plano, cenas, duracao: Math.round(total * 10) / 10 };
}

/** Os textos que aparecem na tela (cenas + preço + frete), para as conferências. */
export const textosDoPlano = (plano = {}) => [...(plano.cenas || []).map((c) => c.texto), plano.preco?.por, plano.frete].filter(Boolean).join(' \n ');

/**
 * Conferência antes de gravar: colchete do modelo de gancho e política do preset bloqueiam. Alegação de saúde não
 * bloqueia (decisão do operador): vira `alerta` (lib/saude.js alertaSaude) para a nota amarela depois de gravar.
 * Avisos (não bloqueiam): muitas palavras numa tela, preço riscado, antes e depois em produto de saúde.
 * Devolve { bloqueio, avisos, alerta }.
 */
export function conferirPlano(plano = {}, { cliente = {}, produtos = [], nFotos = 0 } = {}) {
  const texto = textosDoPlano(plano);
  const alerta = alertaSaude(texto, cliente);
  const pol = motivoPreset(plano.preset, { cliente, produtos, fotos: nFotos || 2 });
  const bloqueio = pol ? pol : temColchete(texto) ? 'Não dá para gravar: sobrou colchete do modelo de gancho; escreva no lugar o texto do produto' : '';
  const avisos = [...(plano.avisos || [])];
  if (presetPorId(plano.preset)?.politica === 'antes_depois' && ehProdutoSaude(cliente, produtos)) avisos.push('Antes e depois em produto de saúde: o Meta pode reprovar o anúncio. Risco alto; reprovações repetidas podem restringir a conta de anúncios.');
  if (alerta) avisos.push(alerta.nota);
  const longas = (plano.cenas || []).filter((c) => txt(c.texto).split(/\s+/).filter(Boolean).length > PALAVRAS_POR_TELA && c.tipo !== 'item');
  if (longas.length) avisos.push(`${longas.length} tela(s) com mais de ${PALAVRAS_POR_TELA} palavras: no celular, ninguém lê. Divida a fala em duas cenas.`);
  if (plano.duracao > (presetPorId(plano.preset)?.gif ? DURACAO_MAX_GIF : DURACAO_MAX)) avisos.push('Duração acima do limite: o app encurta as cenas ao gravar.');
  return { bloqueio, avisos, alerta };
}

/** Plano da IA -> plano conferido: só os campos de texto e tempo; preço e frete continuam os do cadastro (nunca da IA). */
export function normalizarPlanoIa(d = {}, base = {}) {
  const tipos = ['fala', 'item', 'oferta', 'cta', 'antes', 'depois'];
  const cenas = (Array.isArray(d?.cenas) ? d.cenas : []).map((c, i) => ({
    // Valor em R$ ou % escrito pela IA sai: o preço aparece pelo cadastro, no quadro da oferta.
    texto: txt(c?.texto).replace(/R\$\s?[\d.,]+|\d+\s?%/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, 90),
    dur: Number(c?.dur) || 2, tipo: tipos.includes(c?.tipo) ? c.tipo : 'fala', foto: Number.isInteger(c?.foto) ? c.foto : base.cenas?.[i]?.foto ?? 0,
  })).filter((c) => c.texto || c.tipo === 'oferta').slice(0, MAX_CENAS);
  if (!cenas.length) return base;
  // A cena de oferta é do app (preço/frete do cadastro): se a base tem, ela continua.
  const ofertaBase = (base.cenas || []).find((c) => c.tipo === 'oferta');
  if (ofertaBase && !cenas.some((c) => c.tipo === 'oferta')) cenas.splice(Math.max(0, cenas.length - (cenas.at(-1)?.tipo === 'cta' ? 1 : 0)), 0, ofertaBase);
  return ajustarDuracao({ ...base, cenas, preenchidoPor: 'ia' });
}

// ---------------- lugares (zona segura) ----------------
/**
 * Onde fica cada texto (px). Tudo dentro da zona segura do Instagram (lib/formatos-instagram.js): legenda na parte de
 * baixo da zona (acima da faixa da legenda do Reels), oferta no meio, CTA embaixo da legenda. Puro: os testes conferem.
 */
export function layoutAnimacao(w, h) {
  const z = zonaSegura(w, h), m = Math.round(w * 0.02);
  const x = z.x + m, larg = z.w - m * 2;
  const legenda = { nome: 'legenda', x, y: z.y + z.h * 0.58, w: larg, h: z.h * 0.24 };
  const cta = { nome: 'cta', x, y: z.y + z.h * 0.84, w: larg, h: z.h * 0.14 };
  const oferta = { nome: 'oferta', x, y: z.y + z.h * 0.30, w: larg, h: z.h * 0.42 };
  const titulo = { nome: 'titulo', x, y: z.y + z.h * 0.04, w: larg, h: z.h * 0.18 };
  const itens = { nome: 'itens', x, y: z.y + z.h * 0.24, w: larg, h: z.h * 0.58 };
  const centro = { nome: 'centro', x, y: z.y + z.h * 0.30, w: larg, h: z.h * 0.40 };
  return { zona: z, legenda, cta, oferta, titulo, itens, centro, caixas: [legenda, cta, oferta, titulo, itens, centro] };
}

// ---------------- desenho de um quadro ----------------
/** Em que cena o tempo t cai: { i, cena, t0, p (0-1 dentro da cena) }. */
export function cenaNoTempo(plano, t) {
  const cenas = plano.cenas || []; let t0 = 0;
  for (let i = 0; i < cenas.length; i++) { if (t < t0 + cenas[i].dur || i === cenas.length - 1) return { i, cena: cenas[i], t0, p: Math.min(1, Math.max(0, (t - t0) / cenas[i].dur)) }; t0 += cenas[i].dur; }
  return { i: 0, cena: null, t0: 0, p: 0 };
}
const facil = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3; // ease-out

function cobrir(ctx, img, x, y, w, h, zoom = 1, px = 0.5, py = 0.5) {
  const iw = img?.naturalWidth || img?.videoWidth || img?.width, ih = img?.naturalHeight || img?.videoHeight || img?.height;
  if (!iw || !ih) return false;
  const e = Math.max(w / iw, h / ih) * zoom, dw = iw * e, dh = ih * e;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - dw) * px, y + (h - dh) * py, dw, dh); ctx.restore();
  return true;
}
function quebrar(ctx, texto, largura) {
  const out = []; let l = '';
  for (const p of txt(texto).split(/\s+/).filter(Boolean)) { const t = l ? `${l} ${p}` : p; if (ctx.measureText(t).width <= largura || !l) l = t; else { out.push(l); l = p; } }
  if (l) out.push(l);
  return out;
}
/** Texto no maior tamanho que cabe na caixa. alinhar 'left'|'center'; ancora 'base'|'centro'|'topo'. */
function texto(ctx, s, caixa, { fonte, peso = 700, tamMax, cor = '#fff', alinhar = 'center', ancora = 'centro', alpha = 1, dy = 0, sombra = true, escala = 1, tarja = false }) {
  if (!txt(s)) return;
  let tam = Math.round(tamMax), linhas;
  for (; tam > 14; tam -= 2) { ctx.font = `${peso} ${tam}px ${fonte}`; linhas = quebrar(ctx, s, caixa.w); if (linhas.length * tam * 1.16 <= caixa.h) break; }
  ctx.font = `${peso} ${tam}px ${fonte}`; linhas = quebrar(ctx, s, caixa.w);
  const alt = linhas.length * tam * 1.16;
  const topo = (ancora === 'base' ? caixa.y + caixa.h - alt : ancora === 'topo' ? caixa.y : caixa.y + (caixa.h - alt) / 2) + dy;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = cor; ctx.textAlign = alinhar; ctx.textBaseline = 'top';
  if (escala !== 1) { const cx = caixa.x + caixa.w / 2, cy = topo + alt / 2; ctx.translate(cx, cy); ctx.scale(escala, escala); ctx.translate(-cx, -cy); }
  if (sombra) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = tam * 0.18; ctx.shadowOffsetY = tam * 0.05; }
  const x = alinhar === 'center' ? caixa.x + caixa.w / 2 : caixa.x;
  // Tarja: fundo escuro atrás de cada linha, como a legenda de um post (lê sobre qualquer foto).
  if (tarja) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = 'rgba(0,0,0,.6)'; const pad = tam * 0.28; linhas.forEach((l, i) => { const lw = ctx.measureText(l).width, lx = alinhar === 'center' ? x - lw / 2 : x; caixaArredondada(ctx, lx - pad, topo + i * tam * 1.16 - pad * 0.45, lw + pad * 2, tam * 1.16 + pad * 0.5, pad * 0.8); ctx.fill(); }); ctx.restore(); }
  linhas.forEach((l, i) => ctx.fillText(l, x, topo + i * tam * 1.16));
  ctx.restore();
}
function caixaArredondada(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/**
 * Desenha o quadro do tempo t (s). rec = { fotos: [imagem], cor (destaque), sobreCor, fonteTitulo, fonteTexto, raio }.
 * Sem foto, fundo na cor de destaque escurecida (nunca gradiente roxo). Legendas gravadas na imagem, sempre na zona segura.
 */
export function desenharQuadro(ctx, w, h, t, plano, rec = {}) {
  const L = layoutAnimacao(w, h), { i, cena, p } = cenaNoTempo(plano, t);
  const fotos = rec.fotos || [], cor = rec.cor || '#2b2b2b', sobre = rec.sobreCor || '#fff';
  const fT = rec.fonteTitulo || 'system-ui, sans-serif', fX = rec.fonteTexto || 'system-ui, sans-serif';
  const foto = (k) => fotos.length ? fotos[((k ?? 0) % fotos.length + fotos.length) % fotos.length] : null;
  const total = plano.duracao || (plano.cenas || []).reduce((s, c) => s + c.dur, 0) || 1;
  ctx.save();
  ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
  const preset = plano.preset;
  // Fundo
  if (preset === 'antes_depois' && fotos.length >= 2) {
    const corte = cena?.tipo === 'depois' ? w * (1 - facil(p)) : w;
    cobrir(ctx, foto(1), 0, 0, w, h); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, corte, h); ctx.clip(); cobrir(ctx, foto(0), 0, 0, w, h); ctx.restore();
    if (cena?.tipo === 'depois') { ctx.fillStyle = '#fff'; ctx.fillRect(corte - 3, 0, 6, h); }
  } else if (preset === 'carrossel') {
    const atual = foto(cena?.foto ?? i), ant = foto((plano.cenas[i - 1]?.foto) ?? i - 1);
    const tr = Math.min(1, p * (cena?.dur || 2) / 0.45);
    if (i > 0 && tr < 1 && ant) cobrir(ctx, ant, 0, 0, w, h, 1.02);
    ctx.save(); ctx.globalAlpha = i > 0 ? facil(tr) : 1; cobrir(ctx, atual, 0, 0, w, h, 1.02 + 0.03 * p); ctx.restore();
  } else {
    // Zoom lento contínuo pelo vídeo todo (Ken Burns), com pan leve.
    const g = Math.min(1, t / total), f = foto(cena?.foto ?? 0);
    if (f) cobrir(ctx, f, 0, 0, w, h, preset === 'zoom_legenda' ? 1.04 + 0.14 * g : 1.03 + 0.05 * g, 0.5 + 0.06 * Math.sin(g * Math.PI), 0.45);
  }
  // Véu escuro embaixo para a legenda ler sobre qualquer foto.
  const veu = ctx.createLinearGradient(0, h * 0.35, 0, h); veu.addColorStop(0, 'rgba(0,0,0,0)'); veu.addColorStop(1, 'rgba(0,0,0,.62)');
  ctx.fillStyle = veu; ctx.fillRect(0, 0, w, h);
  const entra = facil(Math.min(1, p * (cena?.dur || 2) / 0.35));
  const tamLeg = w * 0.075;
  if (cena) {
    if (preset === 'kinetic' && cena.tipo === 'fala') {
      texto(ctx, cena.texto, L.centro, { fonte: fT, peso: 800, tamMax: w * 0.12, escala: 0.86 + 0.14 * entra, alpha: entra });
    } else if (preset === 'itens') {
      const itens = plano.cenas.filter((c) => c.tipo === 'item'), titulo = plano.cenas.find((c) => c.tipo === 'fala');
      if (titulo) texto(ctx, titulo.texto, L.titulo, { fonte: fT, peso: 800, tamMax: w * 0.075, ancora: 'topo', alinhar: 'left' });
      const k = cena.tipo === 'item' ? itens.indexOf(cena) : cena.tipo === 'cta' ? itens.length - 1 : -1;
      const alt = L.itens.h / Math.max(5, itens.length);
      itens.forEach((it, j) => {
        if (j > k) return;
        const a = j === k && cena.tipo === 'item' ? entra : 1, y = L.itens.y + j * alt;
        ctx.save(); ctx.globalAlpha = a * 0.9; ctx.fillStyle = cor; caixaArredondada(ctx, L.itens.x - (1 - a) * w * 0.1, y + alt * 0.1, L.itens.w, alt * 0.8, rec.raio ?? 12); ctx.fill(); ctx.restore();
        texto(ctx, it.texto, { x: L.itens.x + w * 0.04 - (1 - a) * w * 0.1, y: y + alt * 0.1, w: L.itens.w - w * 0.08, h: alt * 0.8 }, { fonte: fX, peso: 700, tamMax: w * 0.05, cor: sobre, alinhar: 'left', alpha: a, sombra: false });
      });
    } else if (cena.tipo === 'oferta') {
      const a = entra, s = 0.9 + 0.1 * a, o = L.oferta;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.scale(s, s); ctx.translate(-(o.x + o.w / 2), -(o.y + o.h / 2));
      ctx.fillStyle = 'rgba(255,255,255,.94)'; caixaArredondada(ctx, o.x, o.y, o.w, o.h, rec.raio ?? 16); ctx.fill(); ctx.restore();
      const pulso = preset === 'gif_preco' ? 1 + 0.04 * Math.sin(t * Math.PI * 2 / 1.5) : 1;
      texto(ctx, cena.texto, { x: o.x + o.w * 0.06, y: o.y + o.h * 0.06, w: o.w * 0.88, h: o.h * 0.22 }, { fonte: fT, peso: 700, tamMax: w * 0.06, cor: '#17181a', alpha: a, sombra: false });
      if (plano.preco?.de) texto(ctx, `de ${plano.preco.de}`, { x: o.x, y: o.y + o.h * 0.3, w: o.w, h: o.h * 0.12 }, { fonte: fX, peso: 500, tamMax: w * 0.04, cor: '#5b5b5b', alpha: a, sombra: false });
      if (plano.preco?.por) texto(ctx, plano.preco.por, { x: o.x, y: o.y + o.h * 0.42, w: o.w, h: o.h * 0.26 }, { fonte: fT, peso: 800, tamMax: w * 0.13, cor, alpha: a, sombra: false, escala: pulso });
      if (plano.frete) texto(ctx, plano.frete, { x: o.x + o.w * 0.06, y: o.y + o.h * 0.72, w: o.w * 0.88, h: o.h * 0.22 }, { fonte: fX, peso: 600, tamMax: w * 0.042, cor: '#17181a', alpha: a, sombra: false });
    } else if (cena.tipo === 'cta') {
      const c = L.cta; ctx.save(); ctx.globalAlpha = entra; ctx.font = `800 ${Math.round(w * 0.05)}px ${fX}`;
      const larg = Math.min(c.w, ctx.measureText(cena.texto).width + w * 0.12), alt = c.h * 0.7, x = c.x + (c.w - larg) / 2, y = c.y + (c.h - alt) / 2 + (1 - entra) * 20;
      ctx.fillStyle = cor; caixaArredondada(ctx, x, y, larg, alt, rec.raio ?? alt / 2); ctx.fill(); ctx.restore();
      texto(ctx, cena.texto, { x, y: y + alt * 0.1, w: larg, h: alt * 0.8 }, { fonte: fX, peso: 800, tamMax: w * 0.05, cor: sobre, alpha: entra, sombra: false });
    } else if (cena.tipo === 'antes' || cena.tipo === 'depois') {
      texto(ctx, cena.texto, L.titulo, { fonte: fT, peso: 800, tamMax: w * 0.08, ancora: 'topo', alpha: entra });
    } else {
      texto(ctx, cena.texto, L.legenda, { fonte: fX, peso: 800, tamMax: tamLeg, ancora: 'base', alpha: entra, dy: (1 - entra) * h * 0.012, tarja: true, sombra: false });
    }
  }
  ctx.restore();
}
