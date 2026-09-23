// Diagnóstico de campanha já rodando (clientes com estágio "rodando"): cruza o que o gestor informa sobre o que
// já está no ar com os padrões do motor de Insights (deste cliente e de clientes do mesmo nicho) e as
// referências de mercado salvas de sinal forte, pra apontar o que manter e o que mudar. Guarda um histórico
// simples (data + o que foi analisado) numa coleção nova (gcc_diagnosticos — já coberta pela regra genérica do
// Firestore "gcc_*", sem precisar mexer em firestore.rules).
import { db, COL } from '../core/storage.js';
import { padroesLocais, padroesPorNicho } from './insights.js';
import { diagnosticarCampanha } from '../core/ia.js';
import { PLATAFORMAS_ANUNCIO } from '../lib/constantes.js';
import { $, esc, on, modal, toast, ocupado, opcoes, dataBR, lerForm, num } from '../core/ui.js';

const COL_DIAGNOSTICOS = 'gcc_diagnosticos';

/** "Sem IA": só os dados informados lado a lado com os padrões já detectados — nenhuma interpretação em texto. */
export function resumoSemIA({ dados, locais, nicho, referenciasFortes }) {
  const linha = (rotulo, l) => (l.length ? `${rotulo}: ` + l.slice(0, 4).map((g) => `${g.valor} (ROAS ${g.roasMedio?.toFixed(2) ?? 'n/d'}x, CPA ${g.cpaMedio?.toFixed(2) ?? 'n/d'}, ${g.amostras}x)`).join('; ') : null);
  return {
    dadosInformados: dados,
    padroesDoCliente: ['angulo', 'framework', 'formato'].map((c) => linha(c, locais[c] || [])).filter(Boolean),
    padroesDoNicho: ['angulo', 'framework', 'formato'].map((c) => linha(c, nicho?.[c] || [])).filter(Boolean),
    referenciasFortes: referenciasFortes.map((r) => `${r.titulo || 'referência'} (ângulo ${r.analise?.angulo || 'n/d'})`),
  };
}

function htmlResultadoIA(r) {
  const bloco = (titulo, itens, classe) => (itens?.length ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500">${titulo}</h5>
    <ul class="mt-1 space-y-1 text-sm">${itens.map((it) => `<li class="rounded-lg ${classe} p-2">${esc(it.texto)}${it.prioridade ? ` <span class="tag ${it.prioridade === 'alta' ? 'tag-bad' : it.prioridade === 'media' ? 'tag-warn' : ''}">${esc(it.prioridade)}</span>` : ''}<br><span class="hint">Origem: ${esc(it.origem || 'n/d')}</span></li>`).join('')}</ul></div>` : '');
  return bloco('O que provavelmente está funcionando', r.funcionandoBem, 'bg-emerald-50') +
    bloco('Possível desperdício / oportunidade', r.desperdicio, 'bg-amber-50') +
    bloco('Recomendações', r.recomendacoes, 'bg-indigo-50');
}
function htmlResultadoManual(r) {
  const lista = (titulo, itens) => (itens.length ? `<div class="mt-2"><h5 class="text-xs font-semibold uppercase text-slate-500">${titulo}</h5><ul class="mt-1 list-disc pl-5 text-sm">${itens.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '');
  return lista('Padrões deste cliente', r.padroesDoCliente) + lista('Padrões de clientes do mesmo nicho', r.padroesDoNicho) + lista('Referências de mercado de sinal forte', r.referenciasFortes)
    + (!r.padroesDoCliente.length && !r.padroesDoNicho.length ? '<p class="hint mt-2">Ainda não há padrões suficientes (mínimo 2 amostras por ângulo/framework/formato) — registre mais resultados.</p>' : '');
}

export async function abrirDiagnostico(cliente) {
  const [referencias, resultados, historico] = await Promise.all([
    db.listar(COL.referencias, { clienteId: cliente.id }), db.listar(COL.resultados, { clienteId: cliente.id }), db.listar(COL_DIAGNOSTICOS, { clienteId: cliente.id }),
  ]);
  const referenciasFortes = referencias.filter((r) => r.sinal === 'forte');
  const locais = padroesLocais(resultados);
  const h = cliente.historico || {};

  const m = modal(`Diagnosticar campanha — ${cliente.nome}`, `<div id="diag"></div>`, { largo: true });
  const raiz = $('#diag', m.el);
  raiz.innerHTML = `
    <p class="hint mb-3">Descreva o que já está no ar hoje. Os campos já vêm preenchidos com o que está cadastrado no perfil do cliente — ajuste para refletir o estado mais atual.</p>
    <form id="fd" class="grid gap-3 sm:grid-cols-2">
      <div><label class="label">Plataforma</label><select class="input" name="plataforma">${opcoes(PLATAFORMAS_ANUNCIO, 'meta')}</select></div>
      <div><label class="label">Orçamento diário atual (R$)</label><input class="input" type="number" step="0.01" name="orcamentoDiario" value="${esc(h.orcamentoDiario)}"></div>
      <div><label class="label">CPA atual (R$)</label><input class="input" type="number" step="0.01" name="cpaAtual" value="${esc(h.cpaMedio)}"></div>
      <div><label class="label">ROAS atual</label><input class="input" type="number" step="0.01" name="roasAtual"></div>
      <div class="sm:col-span-2"><label class="label">Público(s) atual(is)</label><input class="input" name="publicos" value="${esc(h.publicos)}"></div>
      <div class="sm:col-span-2"><label class="label">Criativos que já estão rodando (ângulo, formato, há quanto tempo)</label><textarea class="input" rows="2" name="criativosRodando" placeholder="Ex.: 2 criativos de vídeo, ângulo dor, no ar há 3 semanas"></textarea></div>
      <div class="sm:col-span-2"><label class="label">Ofertas/promoções ativas</label><input class="input" name="ofertas" placeholder="Ex.: frete grátis acima de R$ 150"></div>
      <div class="sm:col-span-2 flex flex-wrap gap-2">
        <button class="btn-ia" type="submit" data-modo="ia"><i class="fa-solid fa-wand-magic-sparkles"></i> Diagnosticar com IA</button>
        <button class="btn-ghost" type="submit" data-modo="manual" title="Mostra os dados e padrões lado a lado, sem interpretação por texto">Ver dados sem IA</button>
      </div>
    </form>
    <div id="resultado-diag" class="mt-3"></div>
    <details class="mt-4 rounded-lg border border-slate-200 p-3"><summary id="resumo-historico" class="cursor-pointer text-sm font-medium text-slate-600">Histórico de diagnósticos (${historico.length})</summary>
      <div id="historico-diag" class="mt-2 space-y-1"></div></details>`;

  const form = $('#fd', raiz), resultadoEl = $('#resultado-diag', raiz);
  // Recria a lista/contagem do histórico (chamado no início e de novo depois de cada diagnóstico salvo, senão o
  // "Histórico de diagnósticos (N)" e a lista ficam desatualizados até o modal ser fechado e reaberto).
  const desenharHistorico = () => {
    $('#resumo-historico', raiz).textContent = `Histórico de diagnósticos (${historico.length})`;
    $('#historico-diag', raiz).innerHTML = historico.length
      ? historico.slice().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map((d) => `<button type="button" class="btn-ghost btn-sm w-full text-left" data-ver-diag="${d.id}">${dataBR(d.criadoEm)} · ${d.origem === 'ia' ? 'com IA' : 'sem IA'}</button>`).join('')
      : '<p class="hint">Nenhum diagnóstico salvo ainda.</p>';
  };
  desenharHistorico();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter; const v = lerForm(form);
    const dados = { plataforma: v.plataforma, orcamentoDiario: num(v.orcamentoDiario), cpaAtual: num(v.cpaAtual), roasAtual: num(v.roasAtual), publicos: v.publicos, criativosRodando: v.criativosRodando, ofertas: v.ofertas };
    await ocupado(btn, async () => {
      const nicho = await padroesPorNicho(cliente.nicho, cliente.id).catch(() => ({ padroes: null }));
      let resultado, origem;
      if (btn.dataset.modo === 'ia') {
        resultado = await diagnosticarCampanha({ cliente, dados, padroesLocais: locais, padroesNicho: nicho.padroes, referenciasFortes });
        resultadoEl.innerHTML = htmlResultadoIA(resultado);
        origem = 'ia';
      } else {
        resultado = resumoSemIA({ dados, locais, nicho: nicho.padroes, referenciasFortes });
        resultadoEl.innerHTML = htmlResultadoManual(resultado);
        origem = 'manual';
      }
      const salvo = await db.criar(COL_DIAGNOSTICOS, { clienteId: cliente.id, origem, dados, resultado });
      historico.push(salvo);
      desenharHistorico();
      toast('Diagnóstico salvo no histórico deste cliente.');
    });
  });

  on(raiz, 'click', '[data-ver-diag]', (b) => {
    const d = historico.find((x) => x.id === b.dataset.verDiag); if (!d) return;
    resultadoEl.innerHTML = `<p class="hint mb-2">Diagnóstico de ${dataBR(d.criadoEm)}${d.origem === 'manual' ? ' (sem IA)' : ''}:</p>` + (d.origem === 'ia' ? htmlResultadoIA(d.resultado) : htmlResultadoManual(d.resultado));
    resultadoEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
