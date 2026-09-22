// Configurações globais (coleção gcc_configuracoes, documento único "global").
import { db, COL } from '../core/storage.js';
import { CONFIG_PADRAO, TAREFAS_IA } from '../lib/constantes.js';
import { cabecalho, lerForm, num, toast, on, ocupado, esc } from '../core/ui.js';

const ID = 'global';
let cache = null;

export async function obterConfig() {
  if (cache) return cache;
  const d = await db.obter(COL.config, ID);
  cache = { ...CONFIG_PADRAO, ...(d || {}), cortes: { ...CONFIG_PADRAO.cortes, ...(d?.cortes || {}) } };
  return cache;
}

/** Classifica o sinal de uma referência pelos dias no ar: 'forte' | 'moderado' | 'fraco' | null (sem dado). */
export function classificarSinal(dias, cfg) {
  if (dias == null || isNaN(dias)) return null;
  if (dias >= cfg.cortes.forte) return 'forte';
  if (dias >= cfg.cortes.moderado) return 'moderado';
  return 'fraco';
}

export async function view(el) {
  const c = await obterConfig();
  el.innerHTML = `${cabecalho('Configurações', 'Ajustes que valem para todos os clientes.')}
  <form class="card max-w-xl space-y-4" id="f">
    <div><label class="label">Dias mínimos no ar para considerar uma referência de mercado</label>
      <input class="input" type="number" min="1" name="dias" value="${c.diasMinimosReferencia}">
      <p class="hint">Anúncio que fica muito tempo ativo costuma estar dando resultado. Padrão: 15.</p></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="label">Sinal "moderado" a partir de (dias)</label><input class="input" type="number" min="1" name="moderado" value="${c.cortes.moderado}"></div>
      <div><label class="label">Sinal "forte" a partir de (dias)</label><input class="input" type="number" min="1" name="forte" value="${c.cortes.forte}"></div>
    </div>
    <div><label class="label">Alerta de fadiga de criativo após (dias em uso)</label>
      <input class="input" type="number" min="1" name="fadiga" value="${c.diasFadiga}">
      <p class="hint">Avisa nas campanhas quando um criativo está no ar há mais tempo que isso. Padrão: 14.</p></div>
    <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Semáforo e "hora de escalar" (opções avançadas)</summary>
      <div class="mt-3 space-y-3">
        <div><label class="label">Janela do semáforo (dias)</label><input class="input" type="number" min="1" name="diasSemaforo" value="${c.diasSemaforo}">
          <p class="hint">O semáforo compara a meta com os resultados desses últimos dias. Padrão: 7.</p></div>
        <div><label class="label">Dias na meta para sugerir "hora de escalar"</label><input class="input" type="number" min="1" name="diasEscalar" value="${c.diasEscalar}">
          <p class="hint">Um criativo em uso que bate a meta por este período seguido gera o alerta. Padrão: 7.</p></div>
        <div><label class="label">Dias sem resposta do cliente para alertar</label><input class="input" type="number" min="1" name="diasAprovacaoPendente" value="${esc(c.diasAprovacaoPendente)}">
          <p class="hint">Criativo enviado para aprovação e sem resposta do cliente por este tempo entra na Central de Alertas. Padrão: 5.</p></div>
        <div><label class="label">Dias sem decisão para alertar</label><input class="input" type="number" min="1" name="diasCriativoSemDecisao" value="${esc(c.diasCriativoSemDecisao)}">
          <p class="hint">Criativo em rascunho (nunca enviado) por este tempo entra na Central de Alertas. Padrão: 10.</p></div></div></details>
    <details class="rounded-lg border border-slate-200 p-3" open><summary class="cursor-pointer text-sm font-medium text-slate-600">Custos e limites de IA</summary>
      <div class="mt-3 space-y-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="label">Orçamento mensal de IA (US$)</label><input class="input" type="number" step="0.01" min="0" name="orcamentoIa" value="${esc(c.orcamentoIaMensalUsd)}" placeholder="Sem limite">
            <p class="hint">Ao chegar em 80% aparece um aviso no início. Ao passar do limite, cada geração pede sua confirmação. Para limitar um cliente específico, use o campo no cadastro dele.</p></div>
          <div><label class="label">Cotação do dólar (R$)</label><input class="input" type="number" step="0.01" min="0" name="cotacao" value="${esc(c.cotacaoUsd)}">
            <p class="hint">Só para mostrar o equivalente em R$ (estimativa).</p></div>
          <div><label class="label">Variações por geração de criativo</label><input class="input" type="number" min="1" max="5" name="variacoes" value="${esc(c.variacoesPadrao)}">
            <p class="hint">Padrão da tela de criativos (1 a 5). Menos variações = menos custo. Dá para mudar em cada geração.</p></div>
          <div><label class="label">Reaproveitar buscas de mercado dos últimos (dias)</label><input class="input" type="number" min="0" name="reuso" value="${esc(c.diasReutilizarBusca)}">
            <p class="hint">Se já houver referências salvas do nicho nesse período, o app oferece usá-las antes de gastar numa nova busca. 0 desliga.</p></div></div>
        <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Limite de tokens de saída por tipo de operação (avançado)</summary>
          <p class="hint mb-2">Limita o tamanho máximo da resposta de cada operação. Deixe em branco para usar o padrão. Se uma resposta vier cortada, aumente o limite.</p>
          <div class="grid gap-2 sm:grid-cols-2">${Object.entries(TAREFAS_IA).map(([k, [nome, , padrao, modelo]]) => `<label class="text-sm"><span class="block text-slate-600">${esc(nome)} <span class="tag">${modelo}</span></span>
            <input class="input" type="number" min="256" max="32000" name="lim_${k}" value="${esc(c.limitesTokens?.[k])}" placeholder="padrão ${padrao}"></label>`).join('')}</div></details>
      </div></details>
    <button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar configurações</button>
  </form>`;
  on(el, 'submit', '#f', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    const dados = {
      diasMinimosReferencia: num(v.dias) || 15,
      cortes: { moderado: num(v.moderado) || 15, forte: num(v.forte) || 30 },
      diasFadiga: num(v.fadiga) || 14,
      diasSemaforo: num(v.diasSemaforo) || 7,
      diasEscalar: num(v.diasEscalar) || 7,
      diasAprovacaoPendente: num(v.diasAprovacaoPendente) || 5,
      diasCriativoSemDecisao: num(v.diasCriativoSemDecisao) || 10,
      orcamentoIaMensalUsd: num(v.orcamentoIa) > 0 ? num(v.orcamentoIa) : null,
      cotacaoUsd: num(v.cotacao) > 0 ? num(v.cotacao) : 5.5,
      variacoesPadrao: Math.min(5, Math.max(1, Math.round(num(v.variacoes) || 4))),
      diasReutilizarBusca: num(v.reuso) >= 0 ? num(v.reuso) : 30,
      limitesTokens: Object.fromEntries(Object.keys(TAREFAS_IA).map((k) => [k, num(v['lim_' + k])]).filter(([, n]) => n > 0)),
    };
    if (dados.cortes.forte < dados.cortes.moderado) return toast('O corte "forte" deve ser maior ou igual ao "moderado".', 'erro');
    await ocupado(f.querySelector('button'), async () => {
      if (await db.obter(COL.config, ID)) await db.atualizar(COL.config, ID, dados);
      else await db.criar(COL.config, dados, ID);
      cache = null;
      toast('Configurações salvas.');
    });
  });
}
