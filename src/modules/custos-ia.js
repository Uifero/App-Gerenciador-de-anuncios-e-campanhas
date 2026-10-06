// Seção "Custos de IA" de Configurações: por tarefa e por mês, chamadas pela assinatura x reserva (API), o custo real
// das chamadas da reserva e quanto teria custado se tudo fosse pela API. Dados: gcc_uso_api (lib/custos-ia.js).
import { db, COL } from '../core/storage.js';
import { TAREFAS_IA } from '../lib/constantes.js';
import { relatorioCustos } from '../lib/custos-ia.js';
import { PRECOS_MODELOS, PRECOS_CONFERIDOS_EM, FONTE_PRECOS, PRECO_BUSCA_WEB } from '../lib/precos-ia.js';
import { COL_USO_RESUMO, usd } from './custo.js';
import { esc } from '../core/ui.js';

const n = (x) => Number(x || 0).toLocaleString('pt-BR');
const nomeTarefa = (t) => TAREFAS_IA[t]?.[0] || t;

export function custosHtml(rel) {
  const t = rel.total;
  const linhaT = (x) => `<tr class="border-t border-slate-100" data-custo-tarefa="${esc(x.tarefa)}"><td class="py-1.5">${esc(nomeTarefa(x.tarefa))}</td><td>${esc(x.nomeModelo)}</td>
    <td class="text-right">${n(x.chamadas)}</td><td class="text-right" data-assinatura>${n(x.assinatura)}</td><td class="text-right" data-reserva>${n(x.reserva)}</td>
    <td class="text-right">${n(x.mediaEntrada)}</td><td class="text-right">${n(x.mediaSaida)}</td><td class="text-right">${usd(x.custoPorChamada)}</td>
    <td class="text-right font-medium" data-custo-real>${usd(x.custoReal)}</td><td class="text-right" data-custo-se-api>${usd(x.custoSeApi)}</td></tr>`;
  const linhaM = (x) => `<tr class="border-t border-slate-100" data-custo-mes="${esc(x.mes)}"><td class="py-1.5">${esc(x.mes)}${rel.mesesSemDetalhe.includes(x.mes) ? ' <span class="text-xs text-slate-400">(fechado, sem detalhe)</span>' : ''}</td>
    <td class="text-right">${n(x.chamadas)}</td><td class="text-right">${n(x.assinatura)}</td><td class="text-right">${n(x.reserva)}</td><td class="text-right font-medium">${usd(x.custoReal)}</td><td class="text-right">${usd(x.custoSeApi)}</td></tr>`;
  return `<h3 class="font-semibold"><i class="fa-solid fa-coins mr-1 text-slate-400"></i>Custos de IA</h3>
    <p class="caption">Cada chamada de IA fica registrada. A assinatura do Claude não cobra por token (custo real 0); a reserva (API) é cobrada. "Se fosse pela API" mostra quanto custaria se todas as chamadas tivessem ido pela API.</p>
    <div class="mt-3 grid gap-2 sm:grid-cols-4 text-sm" data-totais-custo>
      <div class="rounded bg-slate-50 p-2"><p class="text-xs text-slate-500">Chamadas</p><p class="text-lg font-semibold">${n(t.chamadas)}</p></div>
      <div class="rounded bg-slate-50 p-2"><p class="text-xs text-slate-500">Assinatura / reserva</p><p class="text-lg font-semibold" data-total-provedores>${n(t.assinatura)} / ${n(t.reserva)}</p></div>
      <div class="rounded bg-slate-50 p-2"><p class="text-xs text-slate-500">Custo real (reserva)</p><p class="text-lg font-semibold" data-total-real>${usd(t.custoReal)}</p></div>
      <div class="rounded bg-slate-50 p-2"><p class="text-xs text-slate-500">Se tudo fosse pela API</p><p class="text-lg font-semibold" data-total-se-api>${usd(t.custoSeApi)}</p></div></div>
    ${rel.porTarefa.length ? `<h4 class="mt-4 text-sm font-semibold">Por tarefa</h4><div class="overflow-x-auto"><table class="w-full text-sm" data-tabela-tarefas><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-1">Tarefa</th><th>Modelo</th><th class="text-right">Chamadas</th><th class="text-right">Assinatura</th><th class="text-right">Reserva</th><th class="text-right">Entrada média</th><th class="text-right">Saída média</th><th class="text-right">Por chamada (API)</th><th class="text-right">Custo real</th><th class="text-right">Se fosse API</th></tr></thead><tbody>${rel.porTarefa.map(linhaT).join('')}</tbody></table></div>
      <h4 class="mt-4 text-sm font-semibold">Por mês</h4><div class="overflow-x-auto"><table class="w-full text-sm" data-tabela-meses><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-1">Mês</th><th class="text-right">Chamadas</th><th class="text-right">Assinatura</th><th class="text-right">Reserva</th><th class="text-right">Custo real</th><th class="text-right">Se fosse API</th></tr></thead><tbody>${rel.porMes.map(linhaM).join('')}</tbody></table></div>`
      : '<p class="hint mt-3">Nenhuma chamada de IA registrada ainda.</p>'}
    <details class="mt-3 text-xs text-slate-600"><summary class="cursor-pointer">Tabela de preços usada (US$ por 1 milhão de tokens, conferida em ${esc(PRECOS_CONFERIDOS_EM)})</summary>
      <p class="mt-1">${PRECOS_MODELOS.map((p) => `${esc(p.nome)}: entrada ${p.entrada}, saída ${p.saida}, leitura de cache ${(p.entrada * p.leitura).toFixed(2)}`).join(' · ')} · busca web US$ ${PRECO_BUSCA_WEB * 1000} por 1.000. Fonte: ${esc(FONTE_PRECOS)}. Para atualizar: src/lib/precos-ia.js.</p>
      ${rel.mesesSemDetalhe.length ? `<p class="mt-1">Meses fechados antes desta versão (${esc(rel.mesesSemDetalhe.join(', '))}) guardaram só o total: entram no "Por mês", sem divisão por tarefa nem por provedor.</p>` : ''}</details>`;
}

export async function montarCustos(el) {
  try {
    const [regs, resumos] = await Promise.all([db.listar(COL.usoApi), db.listar(COL_USO_RESUMO).catch(() => [])]);
    el.innerHTML = custosHtml(relatorioCustos(regs, resumos));
  } catch (e) { el.innerHTML = `<p class="hint text-rose-600">Não consegui carregar os custos de IA (${esc(e.message)}).</p>`; }
}
