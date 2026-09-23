// Aba Relatório: resumo do cliente em PDF (client-side com jsPDF).
import { db, COL } from '../core/storage.js';
import { criarPdf } from '../lib/pdf.js';
import { STATUS_CRIATIVO } from '../lib/constantes.js';
import { slug } from '../lib/csv.js';
import { $, on, montar, cabecalho, tag, dataBR, moeda, toast, ocupado, esc } from '../core/ui.js';
import { lerRoas, lerCtr, lerCpa, NIVEL_TAG, ROTULO_NIVEL } from '../lib/leitura-metricas.js';

const media = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const stat = (v, suf = '') => (v == null ? '—' : v.toFixed(2).replace('.', ',') + suf);
const nomeStatus = (v) => (STATUS_CRIATIVO.find(([k]) => k === v) || [, v])[1];

export async function coletar(cliente) {
  const f = { clienteId: cliente.id };
  const [criativos, campanhas, resultados, referencias, produtos, sites] = await Promise.all([
    db.listar(COL.criativos, f), db.listar(COL.campanhas, f), db.listar(COL.resultados, f), db.listar(COL.referencias, f), db.listar(COL.produtos, f), db.listar(COL.sites, f),
  ]);
  const gasto = resultados.reduce((s, r) => s + (r.gasto || 0), 0);
  const melhor = [...resultados].filter((r) => r.roas).sort((a, b) => b.roas - a.roas)[0];
  return {
    criativos, campanhas, resultados, referencias, produtos, site: sites[0], gasto, melhor,
    ctr: media(resultados.filter((r) => r.ctr != null).map((r) => r.ctr)), cpa: media(resultados.filter((r) => r.cpa != null).map((r) => r.cpa)),
    roas: media(resultados.filter((r) => r.roas != null).map((r) => r.roas)),
  };
}

export const view = (el, cliente) => montar(el, async (root) => {
  const d = await coletar(cliente);
  root.innerHTML = `${cabecalho('Relatório', 'Resumo do cliente em PDF: criativos, campanhas, resultados e entregas.',
    '<button class="btn-primary" data-pdf><i class="fa-solid fa-file-pdf"></i> Baixar relatório em PDF</button>')}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${[['Criativos', d.criativos.length], ['Em uso', d.criativos.filter((c) => c.status === 'em_uso').length], ['Campanhas', d.campanhas.length], ['Gasto registrado', moeda(d.gasto)],
        ['CTR médio', stat(d.ctr, '%'), lerCtr(d.ctr)], ['CPA médio', d.cpa == null ? '—' : moeda(d.cpa), lerCpa(d.cpa, cliente.metas?.cpa)], ['ROAS médio', stat(d.roas, 'x'), lerRoas(d.roas, cliente.metas?.roas)], ['Referências', d.referencias.length]]
        .map(([k, v, l]) => `<div class="card"><p class="caption">${k}</p><p class="text-xl font-bold">${v}</p>
          ${l ? `<p class="mt-1 text-xs">${l.nivel ? tag(ROTULO_NIVEL[l.nivel], NIVEL_TAG[l.nivel]) + ' ' : ''}<span class="text-slate-500">${esc(l.texto)}</span></p>` : ''}</div>`).join('')}</div>
    <p class="caption mt-4">O PDF inclui esses números, o perfil de marca, a lista de criativos e campanhas e o status da loja.</p>`;

  on(root, 'click', '[data-pdf]', async (b) => {
    await ocupado(b, async () => {
      const m = cliente.marca || {};
      const pdf = await criarPdf(`Relatório — ${cliente.nome}`, `${cliente.nicho} · ${cliente.estagio === 'rodando' ? 'cliente rodando' : 'cliente novo'} · emitido em ${dataBR(new Date().toISOString())}`);
      pdf.secao('Resumo').lista([`Criativos: ${d.criativos.length} (${d.criativos.filter((c) => c.status === 'em_uso').length} em uso, ${d.criativos.filter((c) => c.status === 'aprovado').length} aprovados)`,
        `Campanhas: ${d.campanhas.length}`, `Gasto registrado: ${moeda(d.gasto)}`, `CTR médio: ${stat(d.ctr, '%')} · CPA médio: ${d.cpa == null ? '—' : moeda(d.cpa)} · ROAS médio: ${stat(d.roas, 'x')}`,
        d.melhor ? `Melhor ROAS: "${d.melhor.criativoNome}" (${stat(d.melhor.roas, 'x')})` : 'Melhor ROAS: ainda sem dados', `Referências salvas: ${d.referencias.length} · Produtos: ${d.produtos.length}`]);
      pdf.secao('Perfil de marca').texto(`Tom de voz: ${m.tomDeVoz || '—'}`).texto(`Diferencial: ${m.usp || '—'}`).texto(`Idioma: ${m.idioma || 'pt-BR'}`);
      pdf.secao('Criativos');
      d.criativos.length ? pdf.lista(d.criativos.map((c) => `[${nomeStatus(c.status)}] ${c.nome} — "${c.hook}" (${c.framework || 'livre'}${c.arquivoUrl ? '' : ', sem arquivo'})`)) : pdf.texto('Nenhum criativo.');
      pdf.secao('Campanhas');
      d.campanhas.length ? pdf.lista(d.campanhas.map((c) => `${c.nome} — ${c.status}, ${moeda(c.orcamentoDiario)}/dia, ${(c.criativos || []).length} criativo(s)`)) : pdf.texto('Nenhuma campanha.');
      pdf.secao('Resultados');
      d.resultados.length ? pdf.lista(d.resultados.slice(0, 40).map((r) => `${dataBR(r.data)} · ${r.criativoNome}: gasto ${moeda(r.gasto)}, CTR ${r.ctr ?? '—'}%, CPA ${r.cpa == null ? '—' : moeda(r.cpa)}, ROAS ${r.roas ?? '—'}x`)) : pdf.texto('Sem resultados registrados.');
      if (d.site) pdf.secao('Site / Loja').texto(`Modo: ${d.site.modo === 'custom' ? 'personalizado' : 'pacote de plataforma (' + (d.site.plataforma || '') + ')'} · status: ${d.site.status} · manual v${d.site.versaoManual || 0}${d.site.linkPublicado ? ' · ' + d.site.linkPublicado : ''}`);
      pdf.salvar(`relatorio-${slug(cliente.nome)}.pdf`); toast('Relatório gerado.');
    });
  });
});
