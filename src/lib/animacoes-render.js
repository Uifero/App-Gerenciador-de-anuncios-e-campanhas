// Gravação das animações da biblioteca (lib/animacoes.js) no navegador, sem servidor:
//  - MP4: canvas + MediaRecorder em tempo real (como o vídeo do Estúdio); o que sair em WebM vira MP4 H.264 ao guardar
//    na Galeria (modules/pecas.js salvarPeca, compressão para ~5 Mbps);
//  - GIF: quadros desenhados um a um (sem depender do relógio da aba) e montados pelo ffmpeg.wasm com paleta própria.
// Também carrega as fontes do sistema visual do cliente e as fotos (as mesmas da prévia ao vivo).
import { desenharQuadro, DURACAO_MAX_GIF } from './animacoes.js';
import { formatoDeVideo, desenharGuiaZona } from './estudio.js';
import { gifDeQuadros } from './video.js';

/** Carrega o par de fontes do cliente (Google Fonts) na página. Sem rede, segue com a fonte do sistema. */
export async function carregarFontes(design) {
  if (typeof document === 'undefined' || !design?.fontesUrl) return;
  if (!document.querySelector(`link[data-fontes-anim="${design.par.id}"]`)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = design.fontesUrl; l.dataset.fontesAnim = design.par.id;
    document.head.appendChild(l);
  }
  try { await Promise.race([Promise.all([document.fonts.load(`700 40px "${design.par.titulo}"`), document.fonts.load(`700 40px "${design.par.texto}"`)]), new Promise((ok) => setTimeout(ok, 4000))]); } catch { /* fica a fonte do sistema */ }
}

/** Fotos para o canvas (sem "contaminar" o canvas: crossOrigin anônimo; a que não abrir fica de fora). */
export async function carregarFotos(urls = []) {
  const um = (u) => new Promise((ok) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = u; });
  return (await Promise.all(urls.filter(Boolean).slice(0, 8).map(um))).filter(Boolean);
}

/** Recursos de desenho a partir do sistema visual do cliente (lib/design-site.js). */
export const recursosDe = (design, fotos) => ({
  fotos, cor: design.cores.acento, sobreCor: design.cores.sobreAcento, raio: Math.max(8, design.raio * 2),
  fonteTitulo: `"${design.par.titulo}", ${design.par.serifa ? 'Georgia, serif' : 'system-ui, sans-serif'}`, fonteTexto: `"${design.par.texto}", system-ui, sans-serif`,
});

/**
 * Prévia ao vivo num canvas, em loop. `obter()` devolve { plano, rec, guia } a cada quadro (o editor muda o texto e a
 * prévia acompanha). guia = desenha a zona segura do Instagram por cima (só na tela, nunca no arquivo). pausado = quadro parado.
 * Com "menos movimento" pedido no aparelho, a prévia fica num quadro parado (a gravação não muda). Devolve parar().
 */
export function tocarPrevia(canvas, obter) {
  const ctx = canvas.getContext('2d'); let vivo = true; const t0 = performance.now();
  const passo = () => {
    if (!vivo || !canvas.isConnected) return;
    const { plano, rec, guia, pausado } = obter();
    const parado = pausado || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = parado ? Math.min(2, (plano.duracao || 1) * 0.5) : ((performance.now() - t0) / 1000) % Math.max(0.5, plano.duracao || 1);
    desenharQuadro(ctx, canvas.width, canvas.height, t, plano, rec);
    if (guia) desenharGuiaZona(ctx, canvas.width, canvas.height);
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  return () => { vivo = false; };
}

/** Grava o MP4 (ou WebM, conforme o navegador) em tempo real. Devolve { blob, ext, mime, duracao, segundos }. */
export async function gravarMp4({ plano, rec, largura = 1080, altura = 1920, aoProgresso = () => {}, sinal }) {
  const fmt = formatoDeVideo();
  if (!fmt) throw new Error('Este navegador não grava vídeo. Use o Chrome ou o Edge atualizado.');
  const canvas = document.createElement('canvas'); canvas.width = largura; canvas.height = altura;
  const ctx = canvas.getContext('2d'); const total = plano.duracao;
  const stream = canvas.captureStream(30);
  const rec2 = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 8_000_000 });
  const pedacos = []; rec2.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
  const parou = new Promise((ok) => { rec2.onstop = ok; });
  desenharQuadro(ctx, largura, altura, 0, plano, rec);
  const inicio = performance.now(); rec2.start(500);
  await new Promise((fim) => {
    // rAF dá os quadros; o relógio de reserva garante o fim mesmo com a aba em segundo plano.
    let feito = false; const acabar = () => { if (!feito) { feito = true; clearInterval(reserva); fim(); } };
    const passo = () => { if (feito) return false; if (sinal?.aborted) { acabar(); return false; } const t = (performance.now() - inicio) / 1000; if (t >= total) { acabar(); return false; } desenharQuadro(ctx, largura, altura, t, plano, rec); aoProgresso(t / total); return true; };
    const quadro = () => { if (passo()) requestAnimationFrame(quadro); };
    const reserva = setInterval(passo, 250); requestAnimationFrame(quadro);
  });
  if (rec2.state !== 'inactive') rec2.stop();
  await parou; stream.getTracks().forEach((t) => t.stop());
  if (sinal?.aborted) throw new Error('Gravação cancelada.');
  aoProgresso(1);
  return { blob: new Blob(pedacos, { type: fmt.mime.split(';')[0] }), ext: fmt.ext, mime: fmt.mime, duracao: total, segundos: (performance.now() - inicio) / 1000 };
}

/** Grava o GIF quadro a quadro (largura 540 px, 12 quadros/s, até DURACAO_MAX_GIF s). Devolve { blob, duracao, quadros }. */
export async function gravarGif({ plano, rec, largura = 540, altura = 960, fps = 12, aoProgresso = () => {} }) {
  const total = Math.min(plano.duracao, DURACAO_MAX_GIF), n = Math.max(2, Math.round(total * fps));
  const canvas = document.createElement('canvas'); canvas.width = largura; canvas.height = altura;
  const ctx = canvas.getContext('2d'); const quadros = [];
  for (let k = 0; k < n; k++) {
    desenharQuadro(ctx, largura, altura, (k / fps), plano, rec);
    const b = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
    quadros.push(new Uint8Array(await b.arrayBuffer()));
    aoProgresso(0.5 * (k + 1) / n);
  }
  const blob = await gifDeQuadros({ quadros, fps, aoProgresso: (p) => aoProgresso(0.5 + 0.5 * p) });
  return { blob, duracao: total, quadros: n };
}
