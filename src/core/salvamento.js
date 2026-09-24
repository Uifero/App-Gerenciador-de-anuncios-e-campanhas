// Ajustes de "sensação de uso" ligados a salvar (não mudam o que nenhuma tela faz):
//  1) Aviso antes de perder texto não salvo. Só vigia os campos marcados com `data-aviso-sair` (no próprio campo ou no
//     <form>): roteiro/copy do criativo, briefing e diagnóstico. De propósito NÃO vigia todo campo de texto do app —
//     rascunhos de sessão (ex.: cenas do Estúdio) nunca são "salvos" e o aviso apareceria à toa.
//     Um campo conta como pendente quando a pessoa digitou nele e o valor ficou diferente do original. Deixa de contar
//     quando: o formulário dele foi enviado e o app salvou (evento 'gcc:salvou' do storage.js) ou a IA respondeu
//     ('gcc:ia-ok', ex.: o briefing virou variações); o campo sumiu da tela (a tela foi redesenhada depois de salvar);
//     ou a pessoa confirmou que quer sair.
//  2) Selo discreto "Salvo às HH:MM" no canto, depois de cada gravação feita pelo usuário (some sozinho).

const editados = new Set();
let formEnviado = null, enviadoEm = 0;
const JANELA_ENVIO_MS = 5 * 60_000; // salvar/IA até 5 min depois do envio do formulário ainda conta como "salvou este formulário"

/** Algum campo vigiado tem texto digitado e ainda não salvo? */
export function temAlteracaoPendente() {
  for (const el of [...editados]) if (!el.isConnected || el.value === el.defaultValue) editados.delete(el);
  return editados.size > 0;
}

/** Esquece as alterações pendentes (todas, ou só as que estão dentro de `dentro`). */
export function limparPendentes(dentro = null) {
  for (const el of [...editados]) if (!dentro || dentro.contains(el)) editados.delete(el);
}

export const MENSAGEM_SAIR = 'Você tem alterações não salvas. Sair mesmo assim?';

/** Pergunta (confirmação nativa do navegador) antes de trocar de tela. true = pode seguir. */
export function podeSair(confirmar = (m) => window.confirm(m)) {
  if (!temAlteracaoPendente()) return true;
  if (!confirmar(MENSAGEM_SAIR)) return false;
  limparPendentes();
  return true;
}

/** Hora no formato do selo: "14:05". */
export const horaCurta = (d = new Date()) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

let selo = null, timerSelo = 0;
function mostrarSalvo() {
  if (!selo) {
    selo = document.createElement('div');
    selo.className = 'pointer-events-none fixed bottom-4 left-4 z-[100] rounded-full bg-[#1e293b]/90 px-3 py-1 text-xs text-white shadow transition-opacity duration-500 opacity-0';
    selo.setAttribute('role', 'status'); selo.setAttribute('aria-live', 'polite'); selo.dataset.salvoEm = '';
    document.body.appendChild(selo);
  }
  selo.innerHTML = `<i class="fa-solid fa-check mr-1 text-emerald-300"></i>Salvo às ${horaCurta()}`;
  selo.style.opacity = '1';
  clearTimeout(timerSelo);
  timerSelo = setTimeout(() => { selo.style.opacity = '0'; }, 2500);
}

/** Liga tudo uma vez (main.js). */
export function ligarSalvamento() {
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.matches?.('input, textarea') || !el.closest('[data-aviso-sair]')) return;
    editados.add(el);
  }, true);
  document.addEventListener('submit', (e) => { formEnviado = e.target; enviadoEm = Date.now(); }, true);
  const concluiu = () => {
    if (formEnviado && Date.now() - enviadoEm < JANELA_ENVIO_MS) limparPendentes(formEnviado);
    formEnviado = null;
  };
  window.addEventListener('gcc:salvou', () => { concluiu(); mostrarSalvo(); });
  window.addEventListener('gcc:ia-ok', concluiu);
  // Fechar/recarregar a aba com texto pendente: o navegador mostra a própria confirmação (o texto dela é fixo do navegador).
  window.addEventListener('beforeunload', (e) => {
    if (!temAlteracaoPendente()) return;
    e.preventDefault(); e.returnValue = '';
  });
}
