// Estúdio de peças: transforma o texto do criativo em imagem (PNG) e vídeo (MP4/WebM) direto no navegador.
// Sem servidor e sem custo por peça: usa <canvas> (imagem) e canvas + MediaRecorder (vídeo).
// A parte de roteiro (extrairCenas) é pura e testável; o resto só roda no navegador.

export const FORMATOS_IMAGEM = [
  ['1080x1080', 'Feed quadrado 1:1 (1080×1080)'], ['1080x1350', 'Feed 4:5 (1080×1350)'], ['1080x1920', 'Stories/Reels 9:16 (1080×1920)'],
];
export const TEMPLATES = [['destaque', 'Foto em tela cheia'], ['cartao', 'Foto + painel de cor'], ['colagem', 'Colagem (2 a 4 fotos)'], ['texto', 'Só texto (sem foto)']];

const FONTE = '"Segoe UI", Inter, Roboto, Arial, sans-serif';
/** Duração máxima dos vídeos do estúdio (criativos de tráfego). */
export const LIMITE_VIDEO_S = 30;
const DURACAO_MAX_S = LIMITE_VIDEO_S;

// ---------------- roteiro -> cenas ----------------
const limpar = (s) => String(s || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();

/** Quebra um texto em pedaços de até `max` caracteres, respeitando o fim das frases. */
export function partirTexto(t, max = 90) {
  const frases = t.match(/[^.!?…]+[.!?…]*/g)?.map((s) => s.trim()).filter(Boolean) || [t];
  const out = []; let atual = '';
  for (const f of frases) {
    if ((atual + ' ' + f).trim().length <= max) atual = (atual + ' ' + f).trim();
    else { if (atual) out.push(atual); atual = f; }
  }
  if (atual) out.push(atual);
  return out;
}

/** "0-3s" -> 3; "10-18s" -> 8; sem número -> 3. Limitado entre 1,5 e 12 s. */
function duracaoDe(txt) {
  const n = (v) => Number(String(v).replace(',', '.'));
  const m = String(txt || '').match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|a|até)\s*(\d+(?:[.,]\d+)?)/i);
  const d = m ? n(m[2]) - n(m[1]) : 3;
  return Math.min(12, Math.max(1.5, d > 0 ? d : 3));
}

/**
 * Lê o roteiro ("Cena 1 (0-3s): ... Voz: "..." / Texto na tela: ...") e devolve a linha do tempo do vídeo:
 * [{ texto, dur, tipo: 'cena' | 'cta' }]. Legenda da cena = "Texto na tela" > "Voz" > (vazia: só a imagem).
 * Sem cenas no texto, usa hook + frases da copy. Termina sempre com o CTA. Total limitado a 30 s.
 */
export function extrairCenas({ hook = '', copy = '', cta = '' }) {
  const cenas = [];
  const texto = String(copy || '');
  const marcas = [...texto.matchAll(/Cena\s*\d+\s*(?:\(([^)]*)\))?\s*[:\-–]/gi)];
  marcas.forEach((m, i) => {
    const corpo = texto.slice(m.index + m[0].length, i + 1 < marcas.length ? marcas[i + 1].index : undefined);
    const dur = duracaoDe(m[1]);
    const tela = corpo.match(/Texto\s+na\s+tela\s*:\s*([\s\S]*?)(?=\bVoz\s*:|$)/i)?.[1];
    const voz = corpo.match(/\bVoz\s*:\s*([\s\S]*)$/i)?.[1];
    const legenda = limpar(tela) || limpar(voz);
    const pedacos = legenda ? partirTexto(legenda) : [''];
    pedacos.forEach((p) => cenas.push({ texto: p, dur: Math.max(1.5, dur / pedacos.length), tipo: 'cena' }));
  });
  if (!cenas.length) {
    if (limpar(hook)) cenas.push({ texto: limpar(hook), dur: 3, tipo: 'cena' });
    partirTexto(limpar(copy)).filter(Boolean).slice(0, 6).forEach((p) => cenas.push({ texto: p, dur: Math.min(5, Math.max(2, p.length / 14)), tipo: 'cena' }));
  }
  if (limpar(cta)) cenas.push({ texto: limpar(cta), dur: 3, tipo: 'cta' });
  let total = 0;
  return cenas.filter((c) => { total += c.dur; return total <= DURACAO_MAX_S; });
}

// ---------------- utilidades de desenho ----------------
const hexRgb = (h) => {
  const m = /^#?([\da-f]{6})$/i.exec(h || '') || /^#?([\da-f]{6})$/i.exec('4f46e5');
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminancia = (hex) => { const [r, g, b] = hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const escurecer = (hex, f) => `rgb(${hexRgb(hex).map((v) => Math.round(v * f)).join(',')})`;
const tintaSobre = (hex) => (luminancia(hex) > 0.6 ? '#111827' : '#ffffff');

function retanguloArredondado(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const dimensoes = (m) => (m.tipo === 'video' ? [m.el.videoWidth, m.el.videoHeight] : [m.el.naturalWidth, m.el.naturalHeight]);

/** Preenche a área (x,y,w,h) com a mídia, cortando as sobras (como object-fit: cover). `zoom` > 1 aproxima. */
function cobrir(ctx, m, x, y, w, h, zoom = 1) {
  const [mw, mh] = dimensoes(m);
  if (!mw || !mh) return;
  const esc = Math.max(w / mw, h / mh) * zoom;
  const dw = mw * esc, dh = mh * esc;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(m.el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function quebrar(ctx, texto, largura) {
  const linhas = []; let atual = '';
  for (const p of String(texto).split(/\s+/).filter(Boolean)) {
    const t = atual ? atual + ' ' + p : p;
    if (ctx.measureText(t).width <= largura || !atual) atual = t; else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Maior tamanho de fonte (entre tamMax e tamMin) em que o texto cabe em largura × alturaMax. */
function ajustar(ctx, texto, largura, alturaMax, tamMax, tamMin, peso = 800) {
  let s = Math.round(tamMax);
  for (; s > tamMin; s -= 4) {
    ctx.font = `${peso} ${s}px ${FONTE}`;
    if (quebrar(ctx, texto, largura).length * s * 1.18 <= alturaMax) break;
  }
  ctx.font = `${peso} ${s}px ${FONTE}`;
  return { s, linhas: quebrar(ctx, texto, largura) };
}

/** Desenha um bloco de texto. ancora: 'base' (y = borda de baixo), 'topo' (y = borda de cima) ou 'centro'. Devolve { topo, base }. */
function blocoTexto(ctx, { texto, x, y, largura, alturaMax, tamMax, tamMin, cor = '#fff', alinhar = 'left', ancora = 'base', alpha = 1, dy = 0 }) {
  if (!texto) return { topo: y, base: y };
  const { s, linhas } = ajustar(ctx, texto, largura, alturaMax, tamMax, tamMin);
  const alt = linhas.length * s * 1.18;
  const topo = (ancora === 'base' ? y - alt : ancora === 'centro' ? y - alt / 2 : y) + dy;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.fillStyle = cor; ctx.textAlign = alinhar; ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = s * 0.16; ctx.shadowOffsetY = s * 0.04;
  const px = alinhar === 'center' ? x + largura / 2 : x;
  linhas.forEach((l, i) => ctx.fillText(l, px, topo + i * s * 1.18 + s * 0.06));
  ctx.restore();
  return { topo, base: topo + alt };
}

/** Botão "pílula" com o CTA. Devolve a altura ocupada. `x` é a borda esquerda (ou o centro se centro=true). */
function pilula(ctx, { texto, x, yBase, tam, fundo, tinta, centro = false, alpha = 1, larguraMax }) {
  if (!texto) return 0;
  ctx.save();
  ctx.font = `800 ${tam}px ${FONTE}`;
  const padX = tam * 1.1, padY = tam * 0.62;
  const w = Math.min(larguraMax, ctx.measureText(texto).width + padX * 2), h = tam + padY * 2;
  const px = centro ? x - w / 2 : x, py = yBase - h;
  ctx.globalAlpha = alpha; ctx.fillStyle = fundo;
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = tam * 0.5; ctx.shadowOffsetY = tam * 0.15;
  retanguloArredondado(ctx, px, py, w, h, h / 2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.fillStyle = tinta; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, px + w / 2, py + h / 2 + tam * 0.04, w - padX);
  ctx.restore();
  return h;
}

function logotipo(ctx, logo, x, y, maxW, maxH) {
  if (!logo) return;
  const esc = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 12;
  ctx.drawImage(logo, x, y, logo.naturalWidth * esc, logo.naturalHeight * esc); ctx.restore();
}

/** Grade de 2 a 4 fotos dentro da área (x,y,w,h), com um respiro fino entre elas. */
function grade(ctx, fotos, x, y, w, h) {
  const n = Math.min(4, fotos.length), g = Math.round(w * 0.012);
  const celulas = n === 2 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]
    : n === 3 ? [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]]
      : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
  celulas.forEach(([cx, cy, cw, ch], i) => cobrir(ctx, fotos[i], x + cx * w + g / 2, y + cy * h + g / 2, cw * w - g, ch * h - g));
}

const zonaSegura = (w, h) => (h / w > 1.5 ? { topo: 0.12, base: 0.2 } : { topo: 0.05, base: 0.06 });

// ---------------- foto (PNG) ----------------
/**
 * Desenha a peça estática no ctx (w × h).
 * opts: { template, hook, cta, midia ({tipo:'imagem',el} ou null), midias (fotos da colagem), cor, corTexto, logo (HTMLImageElement|null) }
 */
export function desenharPeca(ctx, w, h, { template = 'destaque', hook = '', cta = '', midia = null, midias = [], cor = '#4f46e5', corTexto = '#ffffff', logo = null }) {
  const zs = zonaSegura(w, h), mx = w * 0.08, larg = w - mx * 2;
  const tamCta = w * 0.04, corPilula = cor, tintaPilula = tintaSobre(cor);
  ctx.clearRect(0, 0, w, h);

  if (template === 'cartao' || template === 'colagem') {
    const hImg = h * (template === 'colagem' ? 0.6 : 0.56);
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    if (template === 'colagem' && midias.length >= 2) grade(ctx, midias, 0, 0, w, hImg);
    else if (midia) cobrir(ctx, midia, 0, 0, w, hImg);
    else { const g = ctx.createLinearGradient(0, 0, w, hImg); g.addColorStop(0, escurecer(cor, 0.85)); g.addColorStop(1, escurecer(cor, 0.5)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, hImg); }
    const tinta = tintaSobre(cor);
    const yCta = h - h * zs.base;
    const hp = pilula(ctx, { texto: cta, x: mx, yBase: yCta, tam: tamCta, fundo: tinta, tinta: cor, larguraMax: larg });
    blocoTexto(ctx, { texto: hook, x: mx, y: hImg + h * 0.035, largura: larg, alturaMax: yCta - hp - hImg - h * 0.07, tamMax: w * 0.075, tamMin: w * 0.04, cor: tinta, ancora: 'topo' });
    logotipo(ctx, logo, mx, h * zs.topo, w * 0.22, h * 0.06);
    return;
  }

  if (template === 'texto' || !midia) {
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h); g.addColorStop(0, cor); g.addColorStop(1, escurecer(cor, 0.45));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const yCta = h - h * zs.base - h * 0.03;
    const hp = pilula(ctx, { texto: cta, x: w / 2, yBase: yCta, tam: tamCta, fundo: tintaSobre(cor), tinta: cor, centro: true, larguraMax: larg });
    blocoTexto(ctx, { texto: hook, x: mx, y: (h * zs.topo + yCta - hp) / 2 + h * 0.03, largura: larg, alturaMax: (yCta - hp - h * zs.topo) * 0.85, tamMax: w * 0.11, tamMin: w * 0.05, cor: corTexto, alinhar: 'center', ancora: 'centro' });
    logotipo(ctx, logo, mx, h * zs.topo, w * 0.22, h * 0.06);
    return;
  }

  // destaque: foto em tela cheia + degradê + hook embaixo + botão
  cobrir(ctx, midia, 0, 0, w, h);
  const g = ctx.createLinearGradient(0, h * 0.35, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.82)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const yCta = h - h * zs.base;
  const hp = pilula(ctx, { texto: cta, x: mx, yBase: yCta, tam: tamCta, fundo: corPilula, tinta: tintaPilula, larguraMax: larg });
  blocoTexto(ctx, { texto: hook, x: mx, y: yCta - hp - h * 0.03, largura: larg, alturaMax: h * 0.34, tamMax: w * 0.085, tamMin: w * 0.04, cor: corTexto, ancora: 'base' });
  logotipo(ctx, logo, mx, h * zs.topo, w * 0.22, h * 0.06);
}

export function canvasParaPng(canvas) {
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui gerar o PNG.'))), 'image/png'));
}

// ---------------- vídeo ----------------
/** Carrega um arquivo local (imagem ou vídeo) como mídia utilizável no canvas. */
export function carregarMidia(file) {
  const url = URL.createObjectURL(file);
  const video = file.type.startsWith('video/');
  return new Promise((ok, falha) => {
    const el = video ? document.createElement('video') : new Image();
    if (video) { el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'auto'; }
    el[video ? 'onloadeddata' : 'onload'] = () => ok({ tipo: video ? 'video' : 'imagem', el, url, nome: file.name, arquivo: file });
    el.onerror = () => { URL.revokeObjectURL(url); falha(new Error(`Não consegui abrir "${file.name}". Use JPG, PNG, WebP ou MP4.`)); };
    el.src = url;
  });
}

export function carregarImagemUrl(url) {
  return new Promise((ok, falha) => { const el = new Image(); el.onload = () => ok({ tipo: 'imagem', el, url, nome: 'imagem-ia' }); el.onerror = () => falha(new Error('Imagem inválida.')); el.src = url; });
}

/** Melhor formato de vídeo que este navegador grava. MP4 é o que o Meta/TikTok aceitam; WebM é reserva. */
export function formatoDeVideo() {
  if (typeof MediaRecorder === 'undefined') return null;
  const lista = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = lista.find((m) => MediaRecorder.isTypeSupported(m));
  return mime ? { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}

/** Imagem ou vídeo que uma cena usa: o escolhido nela (cena.midia) ou, sem escolha, os materiais em rodízio. */
export const midiaDaCena = (cena, i, midias) => cena.midia || (midias.length ? midias[i % midias.length] : null);

/** Reabre o vídeo em um elemento novo: um <video> só pode ser ligado uma vez ao áudio, e cada gravação precisa do seu. */
async function clonarVideo(m) {
  const el = document.createElement('video');
  el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'auto';
  await new Promise((ok, falha) => { el.onloadeddata = ok; el.onerror = () => falha(new Error(`Não consegui reabrir o vídeo "${m.nome}".`)); el.src = m.url; });
  return { ...m, el };
}

/**
 * Grava o vídeo em tempo real (um vídeo de 24 s leva ~24 s; a aba precisa ficar visível).
 * Cada cena: { texto, dur, tipo, midia?, inicio? (s, onde começa no vídeo de origem), vel? (velocidade, 1 = normal), som? (usar o áudio original) }.
 * opts: { cenas, midias[], cor, corTexto, logo, musica (File|null), largura, altura, aoProgresso(0..1), sinal (AbortSignal) }
 * Devolve { blob, ext, mime, duracao }.
 */
export async function gravarVideo({ cenas, midias = [], cor = '#4f46e5', corTexto = '#ffffff', logo = null, musica = null, largura = 1080, altura = 1920, aoProgresso = () => {}, sinal }) {
  const fmt = formatoDeVideo();
  if (!fmt) throw new Error('Este navegador não grava vídeo. Use o Chrome ou o Edge atualizado.');
  if (!cenas.length) throw new Error('Não há cenas para gravar.');
  const canvas = document.createElement('canvas'); canvas.width = largura; canvas.height = altura;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const total = cenas.reduce((s, c) => s + c.dur, 0);
  const inicios = cenas.map((_, i) => cenas.slice(0, i).reduce((s, c) => s + c.dur, 0));

  // Vídeos de origem: um clone por gravação (ver clonarVideo).
  const clones = new Map();
  for (const [i, c] of cenas.entries()) {
    const m = midiaDaCena(c, i, midias);
    if (m?.tipo === 'video' && !clones.has(m)) clones.set(m, await clonarVideo(m));
  }
  const resolver = (c, i) => { const m = midiaDaCena(c, i, midias); return m?.tipo === 'video' ? clones.get(m) : m; };
  const comSom = new Set(cenas.map((c, i) => (c.som ? resolver(c, i) : null)).filter((m) => m?.tipo === 'video').map((m) => m.el));

  let audio = null;
  if (musica || comSom.size) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const destino = ac.createMediaStreamDestination();
      audio = { ac, src: null, ganhos: new Map() };
      if (musica) {
        const buf = await ac.decodeAudioData(await musica.arrayBuffer());
        audio.src = ac.createBufferSource(); audio.src.buffer = buf; audio.src.loop = true;
        const ganho = ac.createGain(); ganho.gain.value = comSom.size ? 0.22 : 0.55; // música mais baixa quando há voz do vídeo
        audio.src.connect(ganho); ganho.connect(destino);
      }
      for (const el of comSom) {
        el.muted = false;
        const g = ac.createGain(); g.gain.value = 0;
        ac.createMediaElementSource(el).connect(g); g.connect(destino);
        audio.ganhos.set(el, g);
      }
      destino.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch (e) { ac.close(); throw new Error(musica && !comSom.size ? 'Não consegui ler a música. Use um MP3 ou WAV.' : 'Não consegui preparar o áudio: ' + (e.message || e)); }
  }

  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 8_000_000 });
  const pedacos = [];
  rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
  const parou = new Promise((ok) => { rec.onstop = ok; });

  const zs = zonaSegura(largura, altura);
  let cenaAnterior = -1, videoAtual = null;
  const desenhar = (t) => {
    let i = cenas.length - 1;
    while (i > 0 && t < inicios[i]) i--;
    const cena = cenas[i], p = Math.min(1, Math.max(0, (t - inicios[i]) / cena.dur)), tLocal = t - inicios[i];
    const midia = resolver(cena, i);
    if (i !== cenaAnterior) {
      cenaAnterior = i;
      if (videoAtual && videoAtual !== midia?.el) videoAtual.pause();
      videoAtual = midia?.tipo === 'video' ? midia.el : null;
      if (videoAtual) { videoAtual.currentTime = Number(cena.inicio) || 0; videoAtual.playbackRate = Number(cena.vel) || 1; videoAtual.play().catch(() => {}); }
      audio?.ganhos.forEach((g, el) => { g.gain.value = cena.som && el === videoAtual ? 1 : 0; });
    }
    ctx.fillStyle = cor; ctx.fillRect(0, 0, largura, altura);
    if (midia) cobrir(ctx, midia, 0, 0, largura, altura, midia.tipo === 'imagem' ? 1 + 0.07 * p : 1);
    else {
      const g = ctx.createLinearGradient(0, 0, largura * 0.4, altura); g.addColorStop(0, cor); g.addColorStop(1, escurecer(cor, 0.45));
      ctx.fillStyle = g; ctx.fillRect(0, 0, largura, altura);
    }
    const gr = ctx.createLinearGradient(0, altura * 0.3, 0, altura);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, cena.tipo === 'cta' ? 'rgba(0,0,0,.7)' : 'rgba(0,0,0,.6)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, largura, altura);

    const aparece = Math.min(1, tLocal / 0.3), mx = largura * 0.08;
    if (cena.tipo === 'cta') {
      pilula(ctx, { texto: cena.texto, x: largura / 2, yBase: altura * 0.62, tam: largura * 0.058, fundo: cor, tinta: tintaSobre(cor), centro: true, alpha: aparece, larguraMax: largura - mx * 2 });
    } else {
      blocoTexto(ctx, { texto: cena.texto, x: mx, y: altura * 0.66, largura: largura - mx * 2, alturaMax: altura * 0.3, tamMax: largura * 0.085, tamMin: largura * 0.045, cor: corTexto, alinhar: 'center', ancora: 'base', alpha: aparece, dy: (1 - aparece) * altura * 0.02 });
    }
    logotipo(ctx, logo, mx, altura * zs.topo, largura * 0.22, altura * 0.06);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(0, 0, largura * (t / total), 8); // barra de progresso do vídeo
  };

  desenhar(0);
  rec.start(500);
  if (audio) { audio.ac.resume(); audio.src?.start(); }
  const t0 = performance.now();
  await new Promise((fim) => {
    // requestAnimationFrame dá 30+ quadros/s, mas o navegador o pausa em aba oculta; o relógio de reserva garante que a gravação
    // sempre termina (nesse caso o vídeo sai com poucos quadros por segundo, por isso a tela pede para manter a aba visível).
    let feito = false, reserva = 0;
    const encerrar = () => { if (!feito) { feito = true; clearInterval(reserva); fim(); } };
    const passo = () => {
      if (feito) return false;
      if (sinal?.aborted) { encerrar(); return false; }
      const t = (performance.now() - t0) / 1000;
      if (t >= total) { encerrar(); return false; }
      desenhar(t); aoProgresso(t / total);
      return true;
    };
    const quadro = () => { if (passo()) requestAnimationFrame(quadro); };
    reserva = setInterval(passo, 250);
    requestAnimationFrame(quadro);
  });
  const cancelado = sinal?.aborted;
  if (rec.state !== 'inactive') rec.stop();
  await parou;
  clones.forEach((m) => { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); });
  if (audio) { try { audio.src?.stop(); } catch { /* já parou */ } audio.ac.close(); }
  stream.getTracks().forEach((tr) => tr.stop());
  if (cancelado) throw new Error('Gravação cancelada.');
  aoProgresso(1);
  return { blob: new Blob(pedacos, { type: fmt.mime.split(';')[0] }), ext: fmt.ext, mime: fmt.mime, duracao: total };
}
