// Busca de exemplos de mercado no primeiro uso do cliente e o convite discreto para buscar de novo depois.
//  - 1º uso: logo após cadastrar um cliente (com nicho e com a aba Referências no escopo), a busca roda sozinha na
//    tela do cliente e os resultados abrem na MESMA janela de revisão da busca manual (referencias.js). Assim que a
//    busca volta — salvando ou não alguma referência — o cliente fica com `buscaMercadoFeita: true`.
//  - Depois disso nunca roda sozinha: ao entrar na aba Referências ou ao gerar o primeiro criativo/campanha da
//    sessão, aparece um aviso "Buscar novos exemplos de mercado agora?" (sim / dispensar), uma vez por sessão.
// O custo entra em gcc_uso_api como qualquer busca (mesma função buscarReferencias -> chamarClaude).
import { ESCOPO_PADRAO } from '../lib/constantes.js';
import { esc } from '../core/ui.js';

const CHAVE_INICIAL = 'gcc_busca_inicial';        // id do cliente recém-cadastrado (a tela do cliente consome)
const CHAVE_BUSCAR_AGORA = 'gcc_buscar_agora';    // "Sim, buscar" no aviso: a aba Referências abre e já busca
const chavePergunta = (id) => `gcc_pergunta_busca_${id}`;
const emAndamento = new Set();                    // clientes com a busca inicial rodando agora

const lerSessao = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const gravarSessao = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* sem storage */ } };

const temReferencias = (c) => Boolean((c?.escopo || ESCOPO_PADRAO).referencias);

/** A busca automática só vale para cliente novo (campo false, nunca undefined), com nicho e com a aba Referências. */
export function deveBuscarAutomatico(c) {
  return c?.buscaMercadoFeita === false && Boolean(String(c.nicho || '').trim()) && temReferencias(c);
}

/** Pode mostrar o aviso "Buscar agora?": aba Referências no escopo, ainda não perguntado nesta sessão, busca inicial não rodando. */
export function podePerguntar(c, jaPerguntado = Boolean(lerSessao(chavePergunta(c?.id)))) {
  return Boolean(c?.id) && temReferencias(c) && !jaPerguntado && !emAndamento.has(c.id);
}

export const marcarPerguntado = (id) => gravarSessao(chavePergunta(id), '1');
export const pedirBuscaInicial = (id) => gravarSessao(CHAVE_INICIAL, id);
/** true (uma única vez) se este cliente acabou de ser cadastrado e a tela dele deve disparar a busca inicial. */
export function consumirBuscaInicial(id) { const ok = lerSessao(CHAVE_INICIAL) === id; if (ok) gravarSessao(CHAVE_INICIAL, null); return ok; }
export function consumirPedidoBusca(id) { const ok = lerSessao(CHAVE_BUSCAR_AGORA) === id; if (ok) gravarSessao(CHAVE_BUSCAR_AGORA, null); return ok; }
export const iniciouBusca = (id) => emAndamento.add(id);
export const terminouBusca = (id) => emAndamento.delete(id);
export const buscaEmAndamento = (id) => emAndamento.has(id);

/**
 * Aviso flutuante e discreto (canto da tela, não bloqueia nada) depois de gerar um criativo ou criar uma campanha.
 * "Sim, buscar" leva à aba Referências e já dispara a busca (com a mesma oferta de reaproveitar buscas recentes).
 */
export function perguntarBuscaMercado(cliente) {
  if (!podePerguntar(cliente)) return;
  marcarPerguntado(cliente.id);
  const caixa = document.createElement('div');
  caixa.className = 'fixed bottom-4 right-4 z-[60] w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-indigo-200 bg-white p-3 text-sm shadow-xl';
  caixa.setAttribute('role', 'status'); caixa.dataset.avisoBusca = '';
  caixa.innerHTML = `<p class="font-semibold"><i class="fa-solid fa-magnifying-glass mr-1 text-indigo-500"></i>Buscar novos exemplos de mercado agora?</p>
    <p class="hint">A IA pesquisa na web anúncios que estão dando certo no nicho "${esc(cliente.nicho || '')}" para você revisar e salvar em Referências. Usa IA (entra no custo do cliente).</p>
    <div class="mt-2 flex justify-end gap-2"><button class="btn-ghost btn-sm" data-dispensar>Dispensar</button><button class="btn-primary btn-sm" data-sim>Sim, buscar</button></div>`;
  const sair = () => { caixa.remove(); window.removeEventListener('hashchange', sair); };
  caixa.querySelector('[data-dispensar]').addEventListener('click', sair);
  caixa.querySelector('[data-sim]').addEventListener('click', () => {
    gravarSessao(CHAVE_BUSCAR_AGORA, cliente.id);
    const destino = `#/c/${cliente.id}/referencias`;
    sair();
    if (location.hash === destino) window.dispatchEvent(new Event('hashchange')); else location.hash = destino;
  });
  window.addEventListener('hashchange', sair); // trocou de tela: o aviso não fica pendurado
  document.body.appendChild(caixa);
}
