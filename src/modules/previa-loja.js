// Moldura da prévia do pacote (lib/pacote-loja.js): alterna desktop/celular e mostra a legenda fixa. O iframe usa
// sandbox VAZIO (nenhum script roda, origem isolada do painel); a navegação da prévia é só por âncora.
import { LEGENDA_PREVIA_PACOTE } from '../lib/pacote-loja.js';
import { $, $$, on } from '../core/ui.js';

export const previaLojaHtml = () => `<div data-previa-loja>
  <div class="mb-2 flex flex-wrap items-center gap-2"><span class="text-sm font-medium">Ver como:</span>
    <button type="button" class="btn-primary btn-sm" data-largura="desktop"><i class="fa-solid fa-desktop"></i> Computador</button>
    <button type="button" class="btn-ghost btn-sm" data-largura="mobile"><i class="fa-solid fa-mobile-screen"></i> Celular</button></div>
  <p class="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800" data-legenda-previa><i class="fa-solid fa-circle-info"></i> ${LEGENDA_PREVIA_PACOTE}</p>
  <div class="flex justify-center rounded-lg bg-slate-100 p-2"><iframe title="Prévia da loja" sandbox="" referrerpolicy="no-referrer" class="h-[75vh] w-full rounded border border-slate-200 bg-white transition-all" data-iframe-loja></iframe></div></div>`;

/** Liga a moldura que está dentro de `alvo` e carrega o documento da prévia. */
export function ligarPreviaLoja(alvo, documentoHtml) {
  const caixa = $('[data-previa-loja]', alvo); if (!caixa) return;
  const ifr = $('[data-iframe-loja]', caixa);
  ifr.srcdoc = documentoHtml;
  on(caixa, 'click', '[data-largura]', (b) => {
    const celular = b.dataset.largura === 'mobile';
    ifr.style.maxWidth = celular ? '390px' : '';
    $$('[data-largura]', caixa).forEach((x) => { x.className = `${x === b ? 'btn-primary' : 'btn-ghost'} btn-sm`; });
  });
}
