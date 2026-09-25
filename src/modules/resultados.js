// Aba Resultados: registro manual de métricas por criativo. Alimenta o contexto da IA ("o que já performou bem")
// e, com a atribuição de versão abaixo, o motor de Insights (insights.js).
import { db, COL } from '../core/storage.js';
import { esc, $, on, montar, cabecalho, vazio, tag, dataBR, moeda, toast, ocupado, lerForm, num, confirmar } from '../core/ui.js';
import { cartaoInsights, ligarExplicacaoIA } from './insights.js';
import { lerRoas, lerCtr, lerCpa, NIVEL_TAG } from '../lib/leitura-metricas.js';

const fmt = (v, suf = '') => (v == null ? '—' : String(v).replace('.', ',') + suf);
/** Valor pintado de verde/amarelo/vermelho conforme a leitura (bom/atenção/ruim); sem leitura, só o valor. */
const celula = (texto, l) => (l?.nivel ? `<span class="tag ${NIVEL_TAG[l.nivel]}" title="${esc(l.texto)}">${texto}</span>` : texto);

/**
 * Um criativo pode ser editado (nova versão) depois de já estar rodando — sem saber QUAL versão estava no ar na
 * data do resultado, a IA atribuiria a performance ao ângulo/framework/copy errado (da versão atual, não da que
 * rodou de fato). Esta função devolve a versão do histórico que estava ativa numa data: a última cujo "quando" é
 * anterior ou igual ao fim daquele dia (se nenhuma, usa a mais antiga — o resultado é anterior à 1ª versão salva).
 * Puramente local, sem IA: só compara datas do histórico já existente.
 */
export function versaoAtivaEm(criativo, dataISO) {
  const versoes = [...(criativo?.versoes || [])].sort((a, b) => a.n - b.n);
  if (!versoes.length || !dataISO) return null;
  const alvo = new Date(String(dataISO).slice(0, 10) + 'T23:59:59.999Z').getTime();
  if (!Number.isFinite(alvo)) return null;
  const candidatas = versoes.filter((v) => new Date(v.quando).getTime() <= alvo);
  return candidatas.length ? candidatas[candidatas.length - 1] : versoes[0];
}

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [resultados, criativos, campanhas] = await Promise.all([
    db.listar(COL.resultados, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }), db.listar(COL.campanhas, { clienteId: cliente.id }).then((l) => l.filter((c) => c.status !== 'rascunho')),
  ]);
  const hoje = new Date().toISOString().slice(0, 10);
  const metas = cliente.metas || {};
  // Frase curta dizendo o que o número significa (ROAS primeiro; se não houver, CTR).
  const leitura = (r) => { const l = lerRoas(r.roas, metas.roas); const c = lerCtr(r.ctr); return l ? esc('ROAS: ' + l.texto) : c ? esc('CTR: ' + c.texto) : '—'; };

  root.innerHTML = `${cabecalho('Resultados', 'Copie aqui os números de cada criativo. O app diz se cada número está bom ou ruim, encontra o que mais funcionou (Insights) e a IA usa isso para sugerir criativos parecidos.')}
    <div id="insights"></div>
    ${criativos.length ? `<form id="f" class="card mb-5 space-y-3">
      <div class="grid gap-3 sm:grid-cols-2"><div><label class="label">Criativo *</label><select class="input" name="criativoId">${criativos.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
        <div><label class="label">Campanha (opcional)</label><select class="input" name="campanhaId"><option value="">—</option>${campanhas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div></div>
      <p class="caption">Onde achar: no Gerenciador de Anúncios do Meta, colunas "Valor usado", "CTR (taxa de cliques no link)", "Custo por resultado" e "ROAS de compras". Preencha só o que tiver.</p>
      <div class="grid gap-3 sm:grid-cols-5">
        <div><label class="label">Gasto (R$)</label><input class="input" type="number" step="0.01" min="0" name="gasto"><p class="hint">quanto foi investido</p></div>
        <div><label class="label">CTR (%)</label><input class="input" type="number" step="0.01" min="0" name="ctr"><p class="hint">% que clicou (média ~1%)</p></div>
        <div><label class="label">CPA (R$)</label><input class="input" type="number" step="0.01" min="0" name="cpa"><p class="hint">custo de cada venda</p></div>
        <div><label class="label">ROAS</label><input class="input" type="number" step="0.01" min="0" name="roas"><p class="hint">vendas ÷ gasto (bom: 3x+)</p></div>
        <div><label class="label">Data</label><input class="input" type="date" name="data" value="${hoje}"></div></div>
      <p class="hint">O ângulo/framework é atribuído automaticamente à versão do criativo que estava ativa nessa data (não necessariamente a atual).</p>
      <button class="btn-primary" type="submit"><i class="fa-solid fa-plus"></i> Registrar resultado</button></form>`
      : vazio('chart-line', 'Crie um criativo primeiro', 'Os resultados são registrados por criativo.')}
    ${resultados.length ? `<div class="card overflow-x-auto p-0"><table class="w-full text-sm"><thead class="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
      <th class="p-3">Criativo</th><th>Data</th><th>Gasto</th><th>CTR</th><th>CPA</th><th>ROAS</th><th>O que significa</th><th></th></tr></thead><tbody>
      ${resultados.map((r) => `<tr class="border-t border-slate-100"><td class="p-3"><b>${esc(r.criativoNome)}</b> ${r.angulo ? tag(r.angulo) : ''}${r.versaoCriativo ? tag(`v${r.versaoCriativo}`, 'tag-info') : ''}</td>
        <td>${dataBR(r.data)}</td><td>${moeda(r.gasto)}</td><td>${celula(fmt(r.ctr, '%'), lerCtr(r.ctr))}</td><td>${celula(moeda(r.cpa), lerCpa(r.cpa, metas.cpa))}</td><td>${celula(fmt(r.roas, 'x'), lerRoas(r.roas, metas.roas))}</td>
        <td class="max-w-56 py-2 pr-2 text-xs text-slate-500">${leitura(r)}</td>
        <td><button class="text-rose-500" data-apagar="${r.id}" aria-label="Apagar"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>
      <p class="hint mt-2">Cores: verde = bom, amarelo = atenção, vermelho = ruim. ${metas.roas || metas.cpa ? 'Comparado com a meta deste cliente.' : 'Sem meta cadastrada: comparado com referências gerais de mercado (cadastre a meta de CPA/ROAS em "Editar" no topo do cliente).'}</p>`
      : criativos.length ? '<p class="caption">Nenhum resultado registrado ainda.</p>' : ''}`;

  cartaoInsights(cliente, resultados).then((html) => {
    if (!root.isConnected) return;
    $('#insights', root).innerHTML = html;
    ligarExplicacaoIA($('#insights', root), cliente, resultados);
  });

  on(root, 'submit', '#f', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    const cr = criativos.find((c) => c.id === v.criativoId);
    if ([v.gasto, v.ctr, v.cpa, v.roas].every((x) => x === '')) return toast('Preencha ao menos uma métrica.', 'erro');
    await ocupado(f.querySelector('button'), async () => {
      // Atribuição temporal: pega ângulo/framework/gatilho/formato da versão do criativo que estava ativa na
      // data do resultado (não do estado atual dele, que pode já ter mudado).
      const versao = versaoAtivaEm(cr, v.data);
      await db.criar(COL.resultados, {
        clienteId: cliente.id, criativoId: cr.id, criativoNome: cr.nome, campanhaId: v.campanhaId || null,
        angulo: versao?.angulo ?? cr.angulo ?? '', framework: versao?.framework ?? cr.framework ?? '',
        formato: versao?.formato ?? cr.formato ?? '', gatilho: versao?.gatilho ?? cr.gatilho ?? '', versaoCriativo: versao?.n ?? null,
        gasto: num(v.gasto), ctr: num(v.ctr), cpa: num(v.cpa), roas: num(v.roas), data: v.data,
      });
      toast('Resultado registrado.'); recarregar();
    });
  });
  on(root, 'click', '[data-apagar]', async (b) => {
    if (!(await confirmar('Apagar este registro?', 'Apagar'))) return;
    await db.remover(COL.resultados, b.dataset.apagar); recarregar();
  });
});
