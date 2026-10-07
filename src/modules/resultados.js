// Aba Resultados: registro manual de métricas por criativo. Alimenta o contexto da IA ("o que já performou bem")
// e, com a atribuição de versão abaixo, o motor de Insights (insights.js).
import { db, COL } from '../core/storage.js';
import { esc, $, on, montar, cabecalho, vazio, tag, dataBR, moeda, toast, ocupado, lerForm, num, confirmar } from '../core/ui.js';
import { cartaoInsights, ligarExplicacaoIA } from './insights.js';
import { lerRoas, lerCtr, lerCpa, NIVEL_TAG } from '../lib/leitura-metricas.js';
import { filtrarResultados, agruparResultados, produtoDoResultado, ofertaDoResultado } from '../lib/conexoes.js';
import { nomeCriativo } from '../lib/exclusao.js';
import { metricasResultado, periodoDe, textoPeriodo } from '../lib/destinos.js';
import { cartaoWhatsSite } from './comparacao-destinos.js';
import { modal } from '../core/ui.js';

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

const filtrosPorCliente = new Map(); // filtro de produto/oferta escolhido (sobrevive ao redesenho da aba)
export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [todosResultados, criativos, campanhas, produtos] = await Promise.all([
    db.listar(COL.resultados, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }), db.listar(COL.campanhas, { clienteId: cliente.id }).then((l) => l.filter((c) => c.status !== 'rascunho')),
    db.listar(COL.produtos, { clienteId: cliente.id }).catch(() => []),
  ]);
  // Filtros por produto (o do criativo, lido agora) e por oferta (a que estava ativa quando o resultado foi registrado).
  const filtroSalvo = filtrosPorCliente.get(cliente.id) || { produtoId: null, oferta: null };
  const resultados = filtrarResultados(todosResultados, { ...filtroSalvo, criativos, produtos });
  const opcoesProduto = [...new Map(todosResultados.map((r) => { const x = produtoDoResultado(r, criativos, produtos); return [x.id, x.nome]; })).entries()];
  const opcoesOferta = [...new Set(todosResultados.map(ofertaDoResultado))];
  const tabelaGrupo = (titulo, grupos, attr) => (grupos.length ? `<div><h4 class="mb-1 text-sm font-semibold">${titulo}</h4><table class="w-full text-sm" ${attr}><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-1">${titulo.split(' ')[1] || ''}</th><th>Resultados</th><th>Gasto</th><th>ROAS médio</th><th>CPA médio</th></tr></thead><tbody>
    ${grupos.map((g) => `<tr class="border-t border-slate-100"><td class="py-1">${esc(g.nome)}</td><td>${g.amostras}</td><td>${moeda(g.gasto)}</td><td>${g.roasMedio != null ? fmt(g.roasMedio.toFixed(2), 'x') : '—'}</td><td>${g.cpaMedio != null ? moeda(g.cpaMedio) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '');
  const hoje = new Date().toISOString().slice(0, 10);
  const metas = cliente.metas || {};
  // Frase curta dizendo o que o número significa (ROAS primeiro; se não houver, CTR).
  const leitura = (r) => { const l = lerRoas(r.roas, metas.roas); const c = lerCtr(r.ctr); return l ? esc('ROAS: ' + l.texto) : c ? esc('CTR: ' + c.texto) : '—'; };

  root.innerHTML = `${cabecalho('Resultados', 'Copie aqui os números de cada criativo. O app diz se cada número está bom ou ruim, encontra o que mais funcionou (Insights) e a IA usa isso para sugerir criativos parecidos.')}
    ${todosResultados.length ? `<div class="card mb-5" data-filtros-insights><div class="flex flex-wrap items-end gap-3">
      <label class="text-sm">Produto<select class="input mt-0.5" data-filtro-produto><option value="__">Todos</option>${opcoesProduto.map(([id, nome]) => `<option value="${esc(id)}" ${filtroSalvo.produtoId === id ? 'selected' : ''}>${esc(nome)}</option>`).join('')}</select></label>
      <label class="text-sm">Oferta<select class="input mt-0.5" data-filtro-oferta><option value="__">Todas</option>${opcoesOferta.map((o) => `<option value="${esc(o)}" ${filtroSalvo.oferta === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <p class="hint">${resultados.length} de ${todosResultados.length} resultado(s). Insights e tabela abaixo seguem o filtro.</p></div>
      <div class="mt-3 grid gap-4 md:grid-cols-2">${tabelaGrupo('Por produto', agruparResultados(resultados, 'produto', { criativos, produtos }), 'data-insights-produto')}${tabelaGrupo('Por oferta', agruparResultados(resultados, 'oferta', { criativos, produtos }), 'data-insights-oferta')}</div>
      <p class="hint mt-2">O produto vem do criativo (lido agora da aba Produtos). A oferta é a que estava ativa no perfil de marca quando o resultado foi registrado.</p></div>` : ''}
    <div id="insights"></div><div id="whats-site"></div>
    ${`<form id="f" class="card mb-5 space-y-3">
      <div class="grid gap-3 sm:grid-cols-3"><div><label class="label">Criativo</label><select class="input" name="criativoId">${criativos.filter((c) => !c.arquivado).map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}<option value="">Sem criativo específico (campanha inteira)</option></select></div>
        <div><label class="label">Campanha (opcional)</label><select class="input" name="campanhaId"><option value="">—</option>${campanhas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
        <div><label class="label">Destino</label><select class="input" name="destino" data-destino-resultado><option value="site">Site (compra na loja)</option><option value="whatsapp">WhatsApp (venda na conversa)</option></select></div></div>
      <div class="hidden grid gap-3 rounded-lg bg-emerald-50 p-2 sm:grid-cols-4" data-campos-whats>
        <div><label class="label">Conversas iniciadas</label><input class="input" type="number" min="0" step="1" name="conversas"><p class="hint">coluna "Conversas por mensagem iniciadas"</p></div>
        <div><label class="label">Custo por conversa</label><p class="mt-2 text-sm font-semibold" data-custo-conversa>—</p><p class="hint">calculado: gasto ÷ conversas</p></div>
        <div><label class="label">Vendas fechadas na conversa</label><input class="input" type="number" min="0" step="1" name="vendasConversa"><p class="hint">o Meta não vê: anote aqui</p></div>
        <div><label class="label">Faturamento dessas vendas (R$)</label><input class="input" type="number" min="0" step="0.01" name="faturamentoConversa"></div></div>
      <p class="caption">Onde achar: no Gerenciador de Anúncios do Meta, colunas "Valor usado", "CTR (taxa de cliques no link)", "Custo por resultado" e "ROAS de compras". Preencha só o que tiver. Tem o print? Envie na aba Campanhas, em "Prints de resultado": a IA lê e você confere.</p>
      <div class="grid gap-3 sm:grid-cols-5">
        <div><label class="label">Gasto (R$)</label><input class="input" type="number" step="0.01" min="0" name="gasto"><p class="hint">quanto foi investido</p></div>
        <div><label class="label">CTR (%)</label><input class="input" type="number" step="0.01" min="0" name="ctr"><p class="hint">% que clicou (média ~1%)</p></div>
        <div><label class="label">CPA (R$)</label><input class="input" type="number" step="0.01" min="0" name="cpa"><p class="hint">custo de cada venda</p></div>
        <div><label class="label">ROAS</label><input class="input" type="number" step="0.01" min="0" name="roas"><p class="hint">vendas ÷ gasto (bom: 3x+)</p></div>
        <div><label class="label">Data</label><input class="input" type="date" name="data" value="${hoje}"></div></div>
      <p class="hint">O ângulo/framework é atribuído automaticamente à versão do criativo que estava ativa nessa data (não necessariamente a atual).</p>
      <button class="btn-primary" type="submit"><i class="fa-solid fa-plus"></i> Registrar resultado</button></form>`}
    ${resultados.length ? `<div class="card overflow-x-auto p-0"><table class="w-full text-sm"><thead class="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
      <th class="p-3">Criativo</th><th>Data</th><th>Gasto</th><th>CTR</th><th>CPA</th><th>ROAS</th><th>O que significa</th><th></th></tr></thead><tbody>
      ${resultados.map((r) => { const m = metricasResultado(r), whats = m.destino === 'whatsapp', p = periodoDe(r);
        return `<tr class="border-t border-slate-100" data-resultado="${r.id}"><td class="p-3"><b>${esc(r.criativoId ? nomeCriativo(r.criativoId, criativos, r.criativoNome) : r.campanhaNome || r.nomeNoPrint || 'Campanha inteira')}</b> ${tag(whats ? 'WhatsApp' : 'Site', whats ? 'tag-ok' : 'tag-info')}${r.origem === 'print' ? tag('do print') : ''} ${r.angulo ? tag(r.angulo) : ''}${r.versaoCriativo ? tag(`v${r.versaoCriativo}`, 'tag-info') : ''}</td>
        <td>${p && p.inicio !== p.fim ? esc(textoPeriodo(p)) : dataBR(r.data)}</td><td>${moeda(r.gasto)}</td><td>${celula(fmt(r.ctr, '%'), lerCtr(r.ctr))}</td><td>${whats ? (m.custoVenda != null ? moeda(m.custoVenda) : '—') : celula(moeda(r.cpa), lerCpa(r.cpa, metas.cpa))}</td><td>${whats ? (m.roas != null ? fmt(m.roas.toFixed(2), 'x') : '—') : celula(fmt(r.roas, 'x'), lerRoas(r.roas, metas.roas))}</td>
        <td class="max-w-56 py-2 pr-2 text-xs text-slate-500">${whats ? `${m.conversas != null ? `${m.conversas} conversa(s) a ${moeda(m.custoConversa)}` : 'sem conversas anotadas'}${m.vendas != null ? ` · ${m.vendas} venda(s)${m.taxaConversao != null ? ` (${fmt(m.taxaConversao, '%')} das conversas)` : ''}` : ` · <button type="button" class="text-indigo-600 underline" data-anotar-vendas="${r.id}">anotar vendas</button>`}` : leitura(r)}</td>
        <td><button class="text-rose-500" data-apagar="${r.id}" aria-label="Apagar"><i class="fa-solid fa-trash"></i></button></td></tr>`; }).join('')}</tbody></table></div>
      <p class="hint mt-2">Cores: verde = bom, amarelo = atenção, vermelho = ruim. ${metas.roas || metas.cpa ? 'Comparado com a meta deste cliente.' : 'Sem meta cadastrada: comparado com referências gerais de mercado (cadastre a meta de CPA/ROAS em "Editar" no topo do cliente).'}</p>`
      : '<p class="caption">Nenhum resultado registrado ainda.</p>'}`;

  cartaoInsights(cliente, resultados).then((html) => {
    if (!root.isConnected) return;
    $('#insights', root).innerHTML = html;
    ligarExplicacaoIA($('#insights', root), cliente, resultados);
  });
  cartaoWhatsSite(cliente, resultados, { criativos, produtos }).then((html) => { if (root.isConnected) $('#whats-site', root).innerHTML = html; }).catch((e) => console.warn('[whats x site]', e));
  // WhatsApp: mostra os campos de conversa/venda e o custo por conversa calculado na hora.
  const formRes = $('#f', root);
  const atualizarWhats = () => {
    if (!formRes) return;
    const whats = formRes.elements.destino.value === 'whatsapp';
    $('[data-campos-whats]', formRes).classList.toggle('hidden', !whats);
    for (const k of ['cpa', 'roas']) formRes.elements[k].closest('div').classList.toggle('hidden', whats); // no WhatsApp, custo por venda e ROAS saem das vendas anotadas
    const g = num(formRes.elements.gasto.value), c = num(formRes.elements.conversas.value);
    $('[data-custo-conversa]', formRes).textContent = g && c ? moeda(g / c) : '—';
  };
  on(root, 'change', '[data-destino-resultado]', atualizarWhats);
  on(root, 'input', '#f [name=gasto], #f [name=conversas]', atualizarWhats);
  // Venda fechada na conversa anotada depois (ex.: resultado vindo do print, que não mostra essas vendas).
  on(root, 'click', '[data-anotar-vendas]', (b) => {
    const r = todosResultados.find((x) => x.id === b.dataset.anotarVendas); if (!r) return;
    const m = modal('Anotar vendas do WhatsApp', `<form class="space-y-3" data-form-vendas><p class="caption">O Meta não vê a venda fechada na conversa. Anote quantas vendas saíram destas ${esc(r.conversas ?? '?')} conversa(s) e quanto elas faturaram.</p>
      <div class="grid gap-3 sm:grid-cols-2"><div><label class="label">Vendas fechadas na conversa</label><input class="input" type="number" min="0" step="1" name="vendasConversa" required></div>
      <div><label class="label">Faturamento dessas vendas (R$)</label><input class="input" type="number" min="0" step="0.01" name="faturamentoConversa"></div></div>
      <button class="btn-primary" type="submit">Salvar</button></form>`);
    on(m.el, 'submit', '[data-form-vendas]', async (f2, ev) => {
      ev.preventDefault(); const v = lerForm(f2);
      await ocupado(f2.querySelector('button'), async () => {
        await db.atualizar(COL.resultados, r.id, { vendasConversa: num(v.vendasConversa), faturamentoConversa: num(v.faturamentoConversa) });
        m.fechar(); toast('Vendas do WhatsApp anotadas.'); recarregar();
      });
    });
  });

  on(root, 'submit', '#f', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    const cr = criativos.find((c) => c.id === v.criativoId) || null; // "Sem criativo específico": resultado da campanha inteira
    const whats = v.destino === 'whatsapp';
    if ([v.gasto, v.ctr, v.cpa, v.roas, ...(whats ? [v.conversas, v.vendasConversa] : [])].every((x) => x === '' || x == null)) return toast('Preencha ao menos uma métrica.', 'erro');
    await ocupado(f.querySelector('button'), async () => {
      // Atribuição temporal: pega ângulo/framework/gatilho/formato da versão do criativo que estava ativa na
      // data do resultado (não do estado atual dele, que pode já ter mudado).
      const versao = versaoAtivaEm(cr, v.data);
      await db.criar(COL.resultados, {
        clienteId: cliente.id, criativoId: cr?.id || null, criativoNome: cr?.nome || '', campanhaId: v.campanhaId || null,
        campanhaNome: campanhas.find((c) => c.id === v.campanhaId)?.nome || '',
        angulo: versao?.angulo ?? cr?.angulo ?? '', framework: versao?.framework ?? cr?.framework ?? '',
        formato: versao?.formato ?? cr?.formato ?? '', gatilho: versao?.gatilho ?? cr?.gatilho ?? '', versaoCriativo: versao?.n ?? null,
        gasto: num(v.gasto), ctr: num(v.ctr), cpa: whats ? null : num(v.cpa), roas: whats ? null : num(v.roas), data: v.data,
        destino: whats ? 'whatsapp' : 'site',
        ...(whats ? { conversas: num(v.conversas), vendasConversa: num(v.vendasConversa), faturamentoConversa: num(v.faturamentoConversa) } : {}),
        oferta: String(cliente.marca?.ofertaAtiva || '').trim() || null, // a oferta que estava no ar nesta data (fato do dia)
      });
      toast('Resultado registrado.'); recarregar();
    });
  });
  on(root, 'change', '[data-filtro-produto], [data-filtro-oferta]', () => {
    const pv = $('[data-filtro-produto]', root).value, ov = $('[data-filtro-oferta]', root).value;
    filtrosPorCliente.set(cliente.id, { produtoId: pv === '__' ? null : pv, oferta: ov === '__' ? null : ov }); recarregar();
  });
  on(root, 'click', '[data-apagar]', async (b) => {
    if (!(await confirmar('Apagar este registro?', 'Apagar'))) return;
    await db.remover(COL.resultados, b.dataset.apagar); recarregar();
  });
});
