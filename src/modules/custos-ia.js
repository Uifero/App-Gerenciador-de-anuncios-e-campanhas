// Seção "Custos de IA" de Configurações: por tarefa, por chamada e por mês, "Pago por" Assinatura x API, o que foi pago
// na API e quanto as chamadas da assinatura custariam pela API (só informação). Dados: gcc_uso_api (lib/custos-ia.js).
import { db, COL } from '../core/storage.js';
import { TAREFAS_IA } from '../lib/constantes.js';
import { relatorioCustos, chamadasRecentes } from '../lib/custos-ia.js';
import { PRECOS_MODELOS, PRECOS_CONFERIDOS_EM, FONTE_PRECOS, PRECO_BUSCA_WEB } from '../lib/precos-ia.js';
import { COL_USO_RESUMO, usd } from './custo.js';
import { esc } from '../core/ui.js';

const n = (x) => Number(x || 0).toLocaleString('pt-BR');
const nomeTarefa = (t) => TAREFAS_IA[t]?.[0] || t;

/** "Pago por" de uma linha agregada: "Assinatura 52 · API 3" (e "não registrado N" nos registros antigos). */
const pagoPorAgregado = (x) => [x.assinatura && `Assinatura ${n(x.assinatura)}`, x.reserva && `API ${n(x.reserva)}`, x.naoRegistrado && `não registrado ${n(x.naoRegistrado)}`].filter(Boolean).join(' · ') || '—';
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function custosHtml(rel, recentes = []) {
  const t = rel.total;
  const linhaT = (x) => `<tr class="border-t border-slate-100" data-custo-tarefa="${esc(x.tarefa)}"><td class="py-1.5">${esc(nomeTarefa(x.tarefa))}</td><td>${esc(x.nomeModelo)}</td>
    <td class="text-right">${n(x.chamadas)}</td><td class="whitespace-nowrap" data-pago-por-tarefa>${esc(pagoPorAgregado(x))}</td>
    <td class="text-right">${n(x.mediaEntrada)}</td><td class="text-right">${n(x.mediaSaida)}</td>
    <td class="text-right font-medium" data-custo-real>${usd(x.custoReal)}</td><td class="text-right text-slate-500" data-custo-assinatura-se-api>${usd(x.custoAssinaturaSeApi)}</td></tr>`;
  const linhaM = (x) => `<tr class="border-t border-slate-100" data-custo-mes="${esc(x.mes)}"><td class="py-1.5">${esc(x.mes)}${rel.mesesSemDetalhe.includes(x.mes) ? ' <span class="text-xs text-slate-500">(fechado, sem detalhe)</span>' : ''}</td>
    <td class="text-right">${n(x.chamadas)}</td><td class="whitespace-nowrap">${esc(pagoPorAgregado(x))}</td><td class="text-right font-medium">${usd(x.custoReal)}</td><td class="text-right text-slate-500">${usd(x.custoAssinaturaSeApi)}</td></tr>`;
  const linhaC = (c) => `<tr class="border-t border-slate-100" data-chamada="${esc(c.pagoPor)}"><td class="py-1.5 whitespace-nowrap">${esc(quando(c.data))}</td>
    <td>${esc(nomeTarefa(c.tarefa))}${c.cliente ? ` <span class="text-xs text-slate-500">· ${esc(c.cliente)}</span>` : ''}</td>
    <td><span class="tag ${c.pagoPor === 'api' ? 'tag-warn' : c.pagoPor === 'assinatura' ? 'tag-info' : ''}" data-pago-por-chamada>${esc(c.rotulo)}</span></td>
    <td class="text-right font-medium whitespace-nowrap">${usd(c.custo)}${c.custariaApi != null ? `<br><span class="text-xs font-normal text-slate-500">custaria ${usd(c.custariaApi)} pela API</span>` : ''}</td></tr>`;
  return `<h3 class="font-semibold"><i class="fa-solid fa-coins mr-1 text-slate-400" aria-hidden="true"></i>Custos de IA</h3>
    <p class="caption">Toda IA do app vai pela assinatura do Claude (US$ 0,00 por chamada). A chave de API só entra com a sua permissão (Configurações > "Usar API quando a assinatura acabar") e é cobrada. "Pela assinatura (estimado)" é só informação: quanto essas chamadas custariam se fossem pela API.</p>
    <div class="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-totais-custo>
      <div class="rounded bg-slate-50 p-2"><p class="text-xs text-slate-500">Chamadas</p><p class="text-lg font-semibold">${n(t.chamadas)}</p></div>
      <div class="rounded bg-slate-50 p-2"><p class="text-xs text-slate-500">Pago por: Assinatura / API</p><p class="text-lg font-semibold" data-total-provedores>${n(t.assinatura)} / ${n(t.reserva)}</p></div>
      <div class="rounded bg-slate-50 p-2"><p class="text-xs text-slate-500">Pago na API</p><p class="text-lg font-semibold" data-total-real>${usd(t.custoReal)}</p></div>
      <div class="rounded bg-slate-50 p-2"><p class="text-xs text-slate-500">Pela assinatura (estimado)</p><p class="text-lg font-semibold" data-total-assinatura-se-api>${usd(t.custoAssinaturaSeApi)}</p><p class="text-xs text-slate-500">pago: US$ 0,00</p></div></div>
    ${t.naoRegistrado ? `<p class="hint mt-2" data-nao-registrado>${n(t.naoRegistrado)} chamada(s) antiga(s) sem o provedor gravado aparecem como "não registrado" (${usd(t.custoNaoRegistrado)} registrado na época). O histórico não foi reescrito.</p>` : ''}
    ${rel.porTarefa.length ? `<h4 class="mt-4 text-sm font-semibold">Por tarefa</h4><div class="overflow-x-auto"><table class="w-full text-sm [&_td]:px-2 [&_th]:px-2 [&_th]:whitespace-nowrap" data-tabela-tarefas><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-1">Tarefa</th><th>Modelo</th><th class="text-right">Chamadas</th><th>Pago por</th><th class="text-right">Entrada média</th><th class="text-right">Saída média</th><th class="text-right">Pago na API</th><th class="text-right">Assinatura: custaria pela API</th></tr></thead><tbody>${rel.porTarefa.map(linhaT).join('')}</tbody></table></div>
      ${recentes.length ? `<h4 class="mt-4 text-sm font-semibold">Chamadas recentes</h4><div class="overflow-x-auto"><table class="w-full text-sm [&_td]:px-2 [&_th]:px-2 [&_th]:whitespace-nowrap" data-tabela-chamadas><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-1">Quando</th><th>Tarefa</th><th>Pago por</th><th class="text-right">Custo</th></tr></thead><tbody>${recentes.map(linhaC).join('')}</tbody></table></div>` : ''}
      <h4 class="mt-4 text-sm font-semibold">Por mês</h4><div class="overflow-x-auto"><table class="w-full text-sm [&_td]:px-2 [&_th]:px-2 [&_th]:whitespace-nowrap" data-tabela-meses><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-1">Mês</th><th class="text-right">Chamadas</th><th>Pago por</th><th class="text-right">Pago na API</th><th class="text-right">Assinatura: custaria pela API</th></tr></thead><tbody>${rel.porMes.map(linhaM).join('')}</tbody></table></div>`
      : '<p class="hint mt-3">Nenhuma chamada de IA registrada ainda.</p>'}
    <details class="mt-3 text-xs text-slate-600"><summary class="cursor-pointer">Tabela de preços usada (US$ por 1 milhão de tokens, conferida em ${esc(PRECOS_CONFERIDOS_EM)})</summary>
      <p class="mt-1">${PRECOS_MODELOS.map((p) => `${esc(p.nome)}: entrada ${p.entrada}, saída ${p.saida}, leitura de cache ${(p.entrada * p.leitura).toFixed(2)}`).join(' · ')} · busca web US$ ${PRECO_BUSCA_WEB * 1000} por 1.000. Fonte: ${esc(FONTE_PRECOS)}. Para atualizar: src/lib/precos-ia.js.</p>
      ${rel.mesesSemDetalhe.length ? `<p class="mt-1">Meses fechados antes desta versão (${esc(rel.mesesSemDetalhe.join(', '))}) guardaram só o total: entram no "Por mês", sem divisão por tarefa nem por provedor.</p>` : ''}</details>`;
}

export async function montarCustos(el) {
  try {
    const [regs, resumos] = await Promise.all([db.listar(COL.usoApi), db.listar(COL_USO_RESUMO).catch(() => [])]);
    el.innerHTML = custosHtml(relatorioCustos(regs, resumos), chamadasRecentes(regs));
  } catch (e) { el.innerHTML = `<p class="hint text-rose-600">Não consegui carregar os custos de IA (${esc(e.message)}).</p>`; }
}
