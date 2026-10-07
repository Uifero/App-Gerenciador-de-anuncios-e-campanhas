// Aba Resultados: cartão "WhatsApp x Site" (Insights por destino): custo por venda e ROAS dos dois destinos, por
// produto, por oferta e no nicho (agregado de outros clientes do mesmo nicho, sem nomes; com menos de 2 outros
// clientes, "dados insuficientes no nicho"). Venda do WhatsApp vem só do registro manual (o Meta não vê).
import { db, COL } from '../core/storage.js';
import { compararDestinos, compararPorGrupo } from '../lib/destinos.js';
import { resultadosDoNicho, mesmoNicho } from '../lib/fontes-analise.js';
import { produtoDoResultado, ofertaDoResultado } from '../lib/conexoes.js';
import { esc } from '../core/ui.js';

const r$ = (v) => (v == null ? '—' : `R$ ${Number(v).toFixed(2).replace('.', ',')}`);
const x = (v) => (v == null ? '—' : `${String(Number(v).toFixed(2)).replace('.', ',')}x`);
const celula = (a) => (a.insuficiente ? '<span class="text-slate-500">dados insuficientes no nicho</span>' : a.registros ? `${r$(a.custoVenda)} · ROAS ${x(a.roas)}${a.custoConversa != null ? ` · ${r$(a.custoConversa)}/conversa` : ''}${a.destino === 'whatsapp' && !a.temVendas ? ' <span class="text-amber-700">(sem vendas anotadas)</span>' : ''}` : '<span class="text-slate-400">sem registro</span>');

function tabela(titulo, linhas, attr) {
  if (!linhas.length) return '';
  return `<div><h5 class="text-xs font-semibold uppercase text-slate-500">${titulo}</h5><table class="mt-1 w-full text-sm" ${attr}><thead class="text-left text-xs text-slate-500"><tr><th class="py-1"></th><th>WhatsApp (custo/venda · ROAS)</th><th>Site (custo/venda · ROAS)</th></tr></thead><tbody>
    ${linhas.map((l) => `<tr class="border-t border-slate-100"><td class="py-1 pr-2">${esc(l.nome)}</td><td>${celula(l.whatsapp)}</td><td>${celula(l.site)}</td></tr>`).join('')}</tbody></table></div>`;
}

/** HTML do cartão (lê os clientes do mesmo nicho só para o agregado). */
export async function cartaoWhatsSite(cliente, resultados, { criativos = [], produtos = [] } = {}) {
  if (!resultados.some((r) => r.destino === 'whatsapp')) {
    return `<details class="card mb-5" data-whats-site><summary class="cursor-pointer text-sm font-medium text-slate-600"><i class="fa-brands fa-whatsapp mr-1 text-emerald-600"></i> WhatsApp x Site</summary>
      <p class="hint mt-2">Nenhum resultado de WhatsApp registrado ainda. Registre com o destino "WhatsApp" (conversas e vendas fechadas na conversa) ou envie os prints na aba Campanhas para comparar com o site.</p></details>`;
  }
  const geral = compararDestinos(resultados);
  let nicho = { suficiente: false, mensagem: 'dados insuficientes no nicho' };
  try {
    const clientes = await db.listar(COL.clientes);
    const doNicho = clientes.filter((c) => c.id !== cliente.id && mesmoNicho(c, cliente));
    const rs = (await Promise.all(doNicho.map((c) => db.listar(COL.resultados, { clienteId: c.id })))).flat();
    nicho = resultadosDoNicho({ cliente, clientes, resultados: rs });
  } catch (e) { console.warn('[whats x site] nicho:', e); }
  const porProduto = compararPorGrupo(resultados, (r) => produtoDoResultado(r, criativos, produtos));
  const porOferta = compararPorGrupo(resultados, (r) => ({ id: ofertaDoResultado(r), nome: ofertaDoResultado(r) }));
  return `<details class="card mb-5" data-whats-site open><summary class="cursor-pointer text-sm font-medium text-slate-600"><i class="fa-brands fa-whatsapp mr-1 text-emerald-600"></i> WhatsApp x Site <span class="tag tag-info">sem custo de IA</span></summary>
    <p class="hint mt-2">Custo por venda e ROAS de cada destino (todo o período registrado; a comparação do mesmo período fica na aba Campanhas). Venda do WhatsApp = a que você anotou (o Meta não vê venda fechada na conversa).</p>
    <div class="mt-2 grid gap-4 md:grid-cols-2">
      ${tabela('Geral', [{ nome: 'Todos os resultados', whatsapp: geral.whatsapp, site: geral.site }], 'data-whats-site-geral')}
      ${tabela('Por produto', porProduto, 'data-whats-site-produto')}
      ${tabela('Por oferta', porOferta, 'data-whats-site-oferta')}
      <div data-whats-site-nicho><h5 class="text-xs font-semibold uppercase text-slate-500">Mesmo nicho (${esc(cliente.nicho || '?')})</h5>
        ${nicho.suficiente ? `<p class="text-xs text-slate-500">Agregado de ${nicho.clientes} outros clientes (${esc(nicho.rotulo)}), sem identificar quem.</p>${tabela('', [{ nome: 'Nicho', whatsapp: nicho.porDestino.whatsapp, site: nicho.porDestino.site }], '')}`
          : `<p class="text-sm text-slate-600">${esc(nicho.mensagem || 'dados insuficientes no nicho')}${nicho.clientes === 1 ? ' (só 1 outro cliente neste nicho: números não são mostrados para não expor esse cliente)' : ''}.</p>`}</div></div>
    ${geral.mensagem ? `<p class="mt-2 text-sm text-amber-800">${esc(geral.mensagem)}</p>` : ''}</details>`;
}
