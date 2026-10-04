// Envio do logo do cliente, o mesmo componente em três lugares: pergunta 9, passo 2 de "Montar site" e
// Estúdio (etapa Materiais / botão "Logo do cliente" na aba Criativos). Usa salvarLogo (lib/materiais.js): o arquivo
// vai original, um logo atual por cliente, e trocar pede confirmação.
import { salvarLogo, validarLogo, ACEITA_LOGO } from '../lib/materiais.js';
import { esc, $, on, campoArquivo, toast, ocupado, confirmar, modal } from '../core/ui.js';

// Fundo xadrez: deixa ver se o PNG/SVG tem transparência de verdade.
const XADREZ = 'background:repeating-conic-gradient(#cbd5e1 0% 25%,#ffffff 0% 50%) 50%/14px 14px';

export function logoHtml(cliente) {
  const l = cliente.logoArquivo;
  return `<div data-logo-cliente>${l ? `<div class="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
      <span class="flex h-16 w-28 shrink-0 items-center justify-center rounded border border-slate-200 p-1" style="${XADREZ}" title="Fundo xadrez: onde aparece o xadrez, o logo é transparente"><img src="${esc(l.url)}" alt="Logo do cliente" class="max-h-full max-w-full object-contain" data-logo-img></span>
      <div class="min-w-0 flex-1 text-sm"><p class="font-medium text-emerald-800"><i class="fa-solid fa-circle-check"></i> Logo salvo</p><p class="truncate">${esc(l.nome || 'logo')}</p>
        ${l.tipo === 'image/jpeg' ? '<p class="hint !mt-0">JPG não tem transparência. PNG com fundo transparente fica melhor.</p>' : ''}</div>
      <label class="btn-ghost btn-sm upload-btn"><input type="file" class="sr-only" accept="${ACEITA_LOGO}" data-logo-arquivo><i class="fa-solid fa-arrow-rotate-right"></i> Trocar logo</label></div>`
    : campoArquivo({ attrs: 'data-logo-arquivo', accept: ACEITA_LOGO, icone: 'copyright', texto: 'Enviar logo (PNG)', destaque: false, removivel: false,
      dica: 'PNG com fundo transparente fica melhor; também aceita SVG e JPG. O arquivo é guardado como veio (sem compressão) e vai para o site e para as peças do Estúdio.' })}</div>`;
}

/** Liga o envio dentro de `alvo` (que contém logoHtml). `aoMudar(cliente)` roda depois de salvar. */
export function ligarLogo(alvo, cliente, aoMudar = () => {}) {
  on(alvo, 'change', '[data-logo-arquivo]', (inp) => ocupado(inp, async () => {
    const f = inp.files?.[0]; if (!f) return;
    try {
      let aviso;
      try { ({ aviso } = validarLogo(f)); } catch (e) { return toast(e.message, 'erro'); }
      if (cliente.logoArquivo && !(await confirmar(`Trocar o logo atual ("${cliente.logoArquivo.nome || 'logo'}") por "${f.name}"? O anterior é apagado.`, 'Trocar logo'))) return;
      await salvarLogo(cliente, f);
      toast(aviso ? `Logo salvo. ${aviso}` : 'Logo salvo.', aviso ? 'info' : undefined);
      aoMudar(cliente);
    } finally {
      // Sempre volta ao estado real (salvo, cancelado ou recusado), nunca fica "arquivo escolhido" sem ter salvo.
      const caixa = $('[data-logo-cliente]', alvo); if (caixa) caixa.outerHTML = logoHtml(cliente);
    }
  }));
}

/** Janela "Logo do cliente" (aba Criativos), sem precisar abrir um criativo. */
export function abrirLogoCliente(cliente, aoMudar) {
  const m = modal(`Logo — ${cliente.nome}`, `<p class="caption mb-2">O logo atual do cliente. Ele vai para o site gerado e aparece nas peças do Estúdio.</p><div data-alvo-logo>${logoHtml(cliente)}</div>`);
  ligarLogo($('[data-alvo-logo]', m.el), cliente, aoMudar);
}
