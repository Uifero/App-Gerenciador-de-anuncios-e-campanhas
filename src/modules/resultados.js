// Aba Resultados: registro manual de métricas por criativo. Alimenta o contexto da IA ("o que já performou bem").
import { db, COL } from '../core/storage.js';
import { esc, $, on, montar, cabecalho, vazio, tag, dataBR, moeda, toast, ocupado, lerForm, num, confirmar } from '../core/ui.js';

const fmt = (v, suf = '') => (v == null ? '—' : String(v).replace('.', ',') + suf);

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [resultados, criativos, campanhas] = await Promise.all([
    db.listar(COL.resultados, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }), db.listar(COL.campanhas, { clienteId: cliente.id }),
  ]);
  const hoje = new Date().toISOString().slice(0, 10);

  root.innerHTML = `${cabecalho('Resultados', 'Anote o desempenho de cada criativo. A IA usa isso para sugerir criativos parecidos com o que funcionou.')}
    ${criativos.length ? `<form id="f" class="card mb-5 space-y-3">
      <div class="grid gap-3 sm:grid-cols-2"><div><label class="label">Criativo *</label><select class="input" name="criativoId">${criativos.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
        <div><label class="label">Campanha (opcional)</label><select class="input" name="campanhaId"><option value="">—</option>${campanhas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div></div>
      <div class="grid gap-3 sm:grid-cols-5">
        <div><label class="label">Gasto (R$)</label><input class="input" type="number" step="0.01" min="0" name="gasto"></div>
        <div><label class="label">CTR (%)</label><input class="input" type="number" step="0.01" min="0" name="ctr"></div>
        <div><label class="label">CPA (R$)</label><input class="input" type="number" step="0.01" min="0" name="cpa"></div>
        <div><label class="label">ROAS</label><input class="input" type="number" step="0.01" min="0" name="roas"></div>
        <div><label class="label">Data</label><input class="input" type="date" name="data" value="${hoje}"></div></div>
      <button class="btn-primary" type="submit"><i class="fa-solid fa-plus"></i> Registrar resultado</button></form>`
      : vazio('chart-line', 'Crie um criativo primeiro', 'Os resultados são registrados por criativo.')}
    ${resultados.length ? `<div class="card overflow-x-auto p-0"><table class="w-full text-sm"><thead class="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
      <th class="p-3">Criativo</th><th>Data</th><th>Gasto</th><th>CTR</th><th>CPA</th><th>ROAS</th><th></th></tr></thead><tbody>
      ${resultados.map((r) => `<tr class="border-t border-slate-100"><td class="p-3"><b>${esc(r.criativoNome)}</b> ${r.angulo ? tag(r.angulo) : ''}</td>
        <td>${dataBR(r.data)}</td><td>${moeda(r.gasto)}</td><td>${fmt(r.ctr, '%')}</td><td>${moeda(r.cpa)}</td><td>${fmt(r.roas, 'x')}</td>
        <td><button class="text-rose-500" data-apagar="${r.id}" aria-label="Apagar"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`
      : criativos.length ? '<p class="caption">Nenhum resultado registrado ainda.</p>' : ''}`;

  on(root, 'submit', '#f', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    const cr = criativos.find((c) => c.id === v.criativoId);
    if ([v.gasto, v.ctr, v.cpa, v.roas].every((x) => x === '')) return toast('Preencha ao menos uma métrica.', 'erro');
    await ocupado(f.querySelector('button'), async () => {
      await db.criar(COL.resultados, {
        clienteId: cliente.id, criativoId: cr.id, criativoNome: cr.nome, angulo: cr.angulo || '', campanhaId: v.campanhaId || null,
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
