// "Anexar print" do "Ajustar este site": a imagem é reduzida no navegador (até ~1600 px, JPEG) antes de subir, e o
// operador pode marcar nela (círculo, seta, desenho livre; uma cor; Desfazer). A imagem MARCADA é a que vai para a IA
// e para gcc/<cliente>/ajustes/ (só imagem, até 5 MB pelas regras do Storage). O print nunca entra no link de aprovação.
import { esc, $, on, modal } from '../core/ui.js';

export const MAX_PRINTS = 3;
const LADO = 1600, QUALIDADE = 0.85, COR = '#e11d48';

const carregar = (src) => new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('Não consegui abrir essa imagem.')); i.src = src; });

/** Arquivo (galeria, câmera ou Ctrl+V) -> { id, dataUrl, base, w, h } em JPEG de até 1600 px no lado maior. */
export async function comprimirPrint(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('O print precisa ser uma imagem (JPG, PNG ou WebP).');
  const url = URL.createObjectURL(file);
  try {
    const img = await carregar(url);
    const e = Math.min(1, LADO / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', QUALIDADE);
    return { id: `pr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, dataUrl, base: dataUrl, w: c.width, h: c.height, marcas: [] };
  } finally { URL.revokeObjectURL(url); }
}
/** Tokens que a imagem custa para a IA (regra da Anthropic: largura × altura / 750). */
export const tokensDoPrint = (p) => Math.round((p.w * p.h) / 750);
export const base64De = (dataUrl) => String(dataUrl).slice(String(dataUrl).indexOf(',') + 1);
export async function blobDe(dataUrl) { return (await fetch(dataUrl)).blob(); }

function desenhar(g, img, marcas, larg) {
  g.drawImage(img, 0, 0);
  g.strokeStyle = COR; g.fillStyle = COR; g.lineWidth = larg; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const m of marcas) {
    const [a, b] = [m.pontos[0], m.pontos[m.pontos.length - 1]];
    if (!a) continue;
    g.beginPath();
    if (m.tipo === 'circulo') { g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(4, Math.abs(b.x - a.x) / 2), Math.max(4, Math.abs(b.y - a.y) / 2), 0, 0, Math.PI * 2); g.stroke(); }
    else if (m.tipo === 'seta') {
      g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      const ang = Math.atan2(b.y - a.y, b.x - a.x), t = larg * 5;
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - t * Math.cos(ang - 0.45), b.y - t * Math.sin(ang - 0.45)); g.lineTo(b.x - t * Math.cos(ang + 0.45), b.y - t * Math.sin(ang + 0.45)); g.closePath(); g.fill();
    } else { m.pontos.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
  }
}

/** Abre a marcação sobre o print. Devolve o print com a imagem marcada (ou null se cancelar). */
export async function marcarPrint(print) {
  const img = await carregar(print.base);
  const larg = Math.max(3, Math.round(Math.max(img.width, img.height) / 220));
  let ferramenta = 'circulo', marcas = [...(print.marcas || [])], atual = null;
  const FERR = [['circulo', 'regular fa-circle', 'Círculo'], ['seta', 'solid fa-arrow-right-long', 'Seta'], ['livre', 'solid fa-pen', 'Desenhar']];
  return new Promise((resolver) => {
    let resolvido = false;
    const fim = (v) => { if (!resolvido) { resolvido = true; resolver(v); } };
    // a barra de resultado (fixa, por cima de tudo) cobriria o "Pronto" no celular: sai ao abrir a marcação
    document.querySelectorAll('[data-status-resultado]').forEach((e) => e.remove());
    const m = modal('Marcar no print', `<div data-marcacao>
      <p class="caption">Marque o que quer mudar: o app manda a imagem marcada junto com o seu texto.</p>
      <div class="mt-2 flex flex-wrap gap-2" role="group" aria-label="Ferramenta">${FERR.map(([k, ic, rot]) => `<button type="button" class="btn-ghost btn-sm min-h-[44px]" data-ferramenta="${k}" aria-pressed="${k === ferramenta}"><i class="fa-${ic}" aria-hidden="true"></i> ${rot}</button>`).join('')}
        <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-desfazer-marca><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Desfazer</button></div>
      <div class="mt-2 max-h-[60vh] overflow-auto rounded border border-slate-200 bg-slate-100"><canvas class="block h-auto w-full" style="touch-action:none" data-canvas-print aria-label="Print para marcar"></canvas></div>
      <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn-primary min-h-[44px]" data-marcas-prontas><i class="fa-solid fa-check"></i> Pronto</button>
        <button type="button" class="btn-ghost min-h-[44px]" data-marcas-cancelar>Cancelar</button></div></div>`);
    const c = $('[data-canvas-print]', m.el); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    const redesenhar = () => desenhar(g, img, atual ? [...marcas, atual] : marcas, larg);
    redesenhar();
    const ponto = (ev) => { const r = c.getBoundingClientRect(); return { x: ((ev.clientX - r.left) / r.width) * c.width, y: ((ev.clientY - r.top) / r.height) * c.height }; };
    c.addEventListener('pointerdown', (ev) => { ev.preventDefault(); c.setPointerCapture?.(ev.pointerId); atual = { tipo: ferramenta, pontos: [ponto(ev)] }; });
    c.addEventListener('pointermove', (ev) => { if (!atual) return; const p = ponto(ev); if (ferramenta === 'livre') atual.pontos.push(p); else atual.pontos[1] = p; redesenhar(); });
    const soltar = () => { if (atual && atual.pontos.length > 1) marcas.push(atual); atual = null; redesenhar(); };
    c.addEventListener('pointerup', soltar); c.addEventListener('pointercancel', soltar);
    on(m.el, 'click', '[data-ferramenta]', (b) => { ferramenta = b.dataset.ferramenta; m.el.querySelectorAll('[data-ferramenta]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    on(m.el, 'click', '[data-desfazer-marca]', () => { marcas.pop(); redesenhar(); });
    on(m.el, 'click', '[data-marcas-cancelar]', () => { m.fechar(); fim(null); });
    on(m.el, 'click', '[data-marcas-prontas]', () => { desenhar(g, img, marcas, larg); const dataUrl = c.toDataURL('image/jpeg', QUALIDADE); m.fechar(); fim({ ...print, dataUrl, marcas }); });
  });
}

/** Miniaturas dos prints ainda não enviados (com "Marcar" e "Tirar"). */
export function printsPendentesHtml(lista = []) {
  if (!lista.length) return '';
  return `<ul class="mt-2 flex flex-wrap gap-2" data-prints-pendentes>${lista.map((p, i) => `<li class="flex items-center gap-2 rounded border border-slate-200 bg-white p-1" data-print-pendente="${i}">
    <img src="${esc(p.dataUrl)}" alt="Print ${i + 1}${p.marcas?.length ? ' (marcado)' : ''}" class="h-14 w-14 rounded object-cover">
    <span class="flex flex-col gap-1"><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-marcar-print="${i}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${p.marcas?.length ? `Marcado (${p.marcas.length})` : 'Marcar'}</button>
      <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-tirar-print="${i}" aria-label="Tirar o print ${i + 1}">Tirar</button></span></li>`).join('')}</ul>`;
}
