// Moldura da prévia do pacote (lib/pacote-loja.js): alterna desktop/celular e mostra a legenda fixa. O iframe usa
// sandbox VAZIO (nenhum script roda, origem isolada do painel); a navegação da prévia é só por âncora.
// No celular a moldura não tem margem: a loja ocupa a largura toda, como no aparelho do cliente.
import { LEGENDA_PREVIA_PACOTE } from '../lib/pacote-loja.js';
import { $, $$, on, modal } from '../core/ui.js';

/** `telaCheia` = botão "Abrir em tela cheia" (no painel; a página pública já é a tela do cliente). */
export const previaLojaHtml = ({ telaCheia = false } = {}) => `<div data-previa-loja>
  <div class="mb-2 flex flex-wrap items-center gap-2"><span class="text-sm font-medium">Ver como:</span>
    <button type="button" class="btn-primary btn-sm" data-largura="desktop"><i class="fa-solid fa-desktop"></i> Computador</button>
    <button type="button" class="btn-ghost btn-sm" data-largura="mobile"><i class="fa-solid fa-mobile-screen"></i> Celular</button>
    ${telaCheia ? '<button type="button" class="btn-ghost btn-sm" data-tela-cheia title="A prévia ocupa a tela inteira; no celular, fica na largura real do aparelho"><i class="fa-solid fa-expand"></i> Abrir em tela cheia</button>' : ''}</div>
  <p class="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800" data-legenda-previa><i class="fa-solid fa-circle-info"></i> ${LEGENDA_PREVIA_PACOTE}</p>
  <div class="-mx-4 flex justify-center bg-slate-100 sm:mx-0 sm:rounded-lg sm:p-2"><iframe title="Prévia da loja" sandbox="" referrerpolicy="no-referrer" class="h-[75vh] w-full border-slate-200 bg-white transition-all sm:rounded sm:border" data-iframe-loja></iframe></div></div>`;

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
  // Tela cheia: a mesma janela do app (Esc e trocar de tela fecham), sem margem; respeita o "Ver como".
  on(caixa, 'click', '[data-tela-cheia]', () => {
    const m = modal('Prévia da loja', `<iframe title="Prévia da loja em tela cheia" sandbox="" referrerpolicy="no-referrer" class="h-full w-full bg-white" style="max-width:${ifr.style.maxWidth || 'none'}" data-iframe-tela-cheia></iframe>`);
    m.el.className = 'fixed inset-0 z-50 flex bg-black/40';
    const janela = m.el.firstElementChild;
    janela.className = 'flex h-full w-full flex-col bg-white';
    janela.firstElementChild.className = 'flex items-center justify-between border-b border-slate-200 px-4 py-2';
    $('[data-corpo]', janela).className = 'flex min-h-0 flex-1 justify-center bg-slate-100';
    $('[data-iframe-tela-cheia]', janela).srcdoc = ifr.srcdoc; // o atual (ajustes rápidos trocam a prévia na hora)
    $('[data-fechar]', janela)?.focus();
  });
}
