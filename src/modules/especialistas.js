// "Especialistas" (botão no cabeçalho do cliente, atalho no detalhe do criativo e, no fluxo "Criar criativos", em cada
// ideia e em cada peça da Galeria): consultar um especialista do app num MÉTODO sobre um item real deste cliente. Com IA:
// diagnóstico + ações por prioridade, guardado em COL.analises (tipo 'especialista'; os históricos de recomendação/
// otimização filtram por tipo). Sem IA: o checklist do método. O especialista não muda nada sozinho: cada ação tem
// "Aplicar" (modules/aplicar-especialista.js), que só salva depois do clique do operador.
import { db, COL } from '../core/storage.js';
import { consultarEspecialista } from '../core/ia.js';
import { analisesDoTipo } from '../lib/analises.js';
import { ESPECIALISTAS, ALVOS, especialistaPorId, contextoDoAlvo, normalizarConsulta } from '../lib/especialistas.js';
import { resumoAplicacoes } from '../lib/aplicar-especialista.js';
import { ehProdutoSaude } from '../lib/saude.js';
import { ligarAplicacao } from './aplicar-especialista.js';
import { esc, $, on, modal, ocupado, toast, tag, iaNota, dataBR, mostrarResultado } from '../core/ui.js';

const TAG_AVALIACAO = { ok: ['ok', 'tag-ok'], ajustar: ['ajustar', 'tag-warn'], falta_dado: ['falta de dado', ''] };

/** Itens do cliente que cada tipo de alvo oferece: [{ valor, tipo, id, nome }]. */
function itensDoAlvo(tipo, dados) {
  if (tipo === 'criativo') return dados.criativos.filter((c) => !c.arquivado).map((c) => ({ valor: `criativo:${c.id}`, tipo, id: c.id, nome: c.nome || 'Criativo' }));
  if (tipo === 'peca') return (dados.pecas || []).map((p) => ({ valor: `peca:${p.id}`, tipo, id: p.id, nome: `${p.criativoNome || 'Peça'} · ${p.formatoNome || ''}${p.tipo === 'video' ? ' (vídeo)' : ''}` }));
  if (tipo === 'campanha') return dados.campanhas.map((c) => ({ valor: `campanha:${c.id}`, tipo, id: c.id, nome: `${c.nome || 'Campanha'}${c.status === 'rascunho' ? ' (rascunho)' : ''}` }));
  return [{ valor: `${tipo}:`, tipo, id: null, nome: ALVOS[tipo] }];
}

const NENHUM = { criativo: 'Nenhum criativo ainda', campanha: 'Nenhuma campanha ainda', peca: 'Nenhuma peça na Galeria ainda' };
function opcoesAlvo(esp, dados, escolhido) {
  return esp.alvos.map((tipo) => {
    const itens = itensDoAlvo(tipo, dados);
    if (['criativo', 'campanha', 'peca'].includes(tipo)) {
      return `<optgroup label="${esc(ALVOS[tipo])}">${itens.length ? itens.map((i) => `<option value="${esc(i.valor)}" ${i.valor === escolhido ? 'selected' : ''}>${esc(i.nome)}</option>`).join('') : `<option value="" disabled>${NENHUM[tipo]}</option>`}</optgroup>`;
    }
    return `<option value="${esc(itens[0].valor)}" ${itens[0].valor === escolhido ? 'selected' : ''}>${esc(itens[0].nome)}</option>`;
  }).join('');
}

/** Card do resultado (IA ou consulta guardada). Cada ação tem um lugar para o "Aplicar" (ligarAplicacao). */
function cardResultado(esp, alvo, r, quando = null) {
  const lst = (titulo, itens) => (itens.length ? `<h4 class="mt-3 text-sm font-semibold">${titulo}</h4><ul class="ml-5 list-disc text-sm">${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  return `<div class="card mt-4 space-y-2" data-resultado-especialista tabindex="-1">
    <p class="font-semibold"><i class="fa-solid fa-${esc(esp.icone)} mr-1 text-indigo-500" aria-hidden="true"></i>${esc(esp.nome)} · ${esc(alvo?.nome || ALVOS[alvo?.tipo] || '')}${quando ? ` <span class="caption">(${dataBR(quando)})</span>` : ''}</p>
    ${iaNota('Diagnóstico da IA com os dados deste cliente. Nada muda sozinho: use "Aplicar" em cada ação e confira "Atual × Com a mudança" antes de salvar.')}
    ${r.resumo ? `<p class="text-sm">${esc(r.resumo)}</p>` : ''}
    ${r.avisos.length ? `<div class="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-avisos-especialista><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${r.avisos.map(esc).join('<br>')}</div>` : ''}
    ${r.pontos.length ? `<h4 class="mt-3 text-sm font-semibold">Pontos avaliados</h4><ul class="space-y-1 text-sm">${r.pontos.map((p) => `<li>${tag(...(TAG_AVALIACAO[p.avaliacao] || TAG_AVALIACAO.ajustar))} <b>${esc(p.ponto)}</b>${p.porque ? `: ${esc(p.porque)}` : ''}</li>`).join('')}</ul>` : ''}
    ${r.acoes.length ? `<h4 class="mt-3 text-sm font-semibold">O que fazer, por prioridade</h4><ol class="space-y-2 text-sm" data-acoes-especialista>${r.acoes.map((a, i) => `<li class="rounded-lg border border-slate-200 p-2" data-acao="${i}">
        <p><span class="font-semibold">${i + 1}.</span> <b>${esc(a.acao)}</b>${a.porque ? ` <span class="text-slate-600">— ${esc(a.porque)}</span>` : ''}</p>
        <div class="mt-1" data-aplicar-slot="${i}"></div><div data-proposta="${i}"></div></li>`).join('')}</ol>
      <div class="flex flex-wrap items-center gap-2" data-aplicar-lote></div>` : ''}
    ${lst('Falta saber', r.perguntas)}
    <p class="hint">${esc(esp.origem.charAt(0).toUpperCase() + esp.origem.slice(1))}; o especialista segue as regras do app (não inventa dado e respeita a política do Meta).</p></div>`;
}

// Em cliente de saúde, o checklist de qualquer método ganha a regra do Meta (a mesma da REGRA_SAUDE).
export const ITEM_SAUDE = 'Produto de saúde: o texto não promete efeito no corpo (metabolismo, energia, disposição, queima de gordura, apetite) nem fala da condição de quem assiste ("sem energia", "seu corpo pede")? Composição real, rotina e experiência de uso podem.';

function cardChecklist(esp, alvo, saude = false) {
  const itens = saude ? [...esp.checklist, ITEM_SAUDE] : esp.checklist;
  return `<div class="card mt-4" data-checklist-especialista tabindex="-1">
    <p class="font-semibold"><i class="fa-solid fa-list-check mr-1 text-slate-400" aria-hidden="true"></i>Checklist: ${esc(esp.nome)}${alvo ? ` · ${esc(alvo.nome)}` : ''}</p>
    <p class="caption mb-2">Sem IA: responda você mesmo, olhando o item escolhido. Nada é guardado.</p>
    <ul class="space-y-1 text-sm">${itens.map((q, i) => `<li><label class="flex min-h-[44px] items-start gap-2 py-1"><input type="checkbox" class="mt-1 h-5 w-5 shrink-0" name="ck${i}"> <span>${esc(q)}</span></label></li>`).join('')}</ul></div>`;
}

/** Dados do cliente que a consulta e o "Aplicar" usam (lidos da fonte). */
export async function dadosEspecialistas(cliente) {
  const f = { clienteId: cliente.id };
  const [criativos, campanhas, produtos, resultados, analises, pecas] = await Promise.all([
    db.listar(COL.criativos, f).catch(() => []), db.listar(COL.campanhas, f).catch(() => []), db.listar(COL.produtos, f).catch(() => []),
    db.listar(COL.resultados, f).catch(() => []), db.listar(COL.analises, f).catch(() => []), db.listar(COL.pecas, f).catch(() => []),
  ]);
  return { criativos, campanhas, produtos, resultados, analises, pecas };
}

/**
 * Monta a consulta dentro de `raiz` (janela ou painel no fluxo). `alvoInicial` = { tipo, id }. `aoMudar` é chamado
 * depois de uma aplicação (nova versão, tarefa, peça) para quem está em volta se redesenhar.
 */
export async function montarEspecialistas(raiz, cliente, { alvoInicial = null, dados = null, aoMudar = () => {}, compacto = false } = {}) {
  raiz.innerHTML = '<p class="caption"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</p>';
  const d = dados || await dadosEspecialistas(cliente);
  const { criativos, campanhas, produtos, resultados } = d;
  const historico = analisesDoTipo(d.analises || [], 'especialista');
  const opcoesEsp = alvoInicial ? ESPECIALISTAS.filter((e) => e.alvos.includes(alvoInicial.tipo)) : ESPECIALISTAS;
  let esp = opcoesEsp[0] || ESPECIALISTAS[0];
  let alvoValor = alvoInicial ? `${alvoInicial.tipo}:${alvoInicial.id || ''}` : '';
  const uid = Math.random().toString(36).slice(2, 7);

  const alvoAtual = () => {
    const v = $('[name=alvo]', raiz)?.value || '';
    const [tipo, id] = v.split(':');
    if (!tipo) return null;
    return itensDoAlvo(tipo, d).find((i) => i.valor === v) || { tipo, id: id || null, nome: ALVOS[tipo] };
  };
  const desenharHistorico = () => {
    $('[data-titulo-historico]', raiz).textContent = `Histórico de consultas (${historico.length})`;
    $('[data-historico-especialistas]', raiz).innerHTML = historico.length
      ? historico.slice(0, 10).map((a) => { const r = resumoAplicacoes(a); return `<li><button type="button" class="btn-ghost btn-sm min-h-[44px] w-full !justify-start text-left" data-ver-consulta="${esc(a.id)}">${dataBR(a.criadoEm)} · ${esc(especialistaPorId(a.especialistaId)?.nome || 'Especialista')} · ${esc(a.alvo?.nome || '')}${r ? ` <span class="tag tag-info" data-status-aplicacoes>${esc(r)}</span>` : ''}</button></li>`; }).join('')
      : '<li class="hint">Nenhuma consulta ainda.</li>';
  };

  raiz.innerHTML = `<form class="space-y-4" data-form-especialista>
    <fieldset><legend class="label">Especialista</legend>
      <div class="mt-1 grid gap-2 sm:grid-cols-2">${opcoesEsp.map((e) => `<label class="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500" data-card-especialista="${e.id}">
        <input type="radio" name="especialista" value="${e.id}" class="mt-1 h-4 w-4 shrink-0" ${e.id === esp.id ? 'checked' : ''}>
        <span><span class="block text-sm font-semibold"><i class="fa-solid fa-${e.icone} mr-1 text-indigo-500" aria-hidden="true"></i>${esc(e.nome)}</span>
          <span class="block text-xs text-slate-600">${esc(e.quando)}</span>
          ${compacto ? '' : `<span class="hidden text-xs text-slate-600 sm:block">Método: ${esc(e.metodo)}</span>`}</span></label>`).join('')}</div></fieldset>
    <div><label class="label" for="esp-alvo-${uid}">O que analisar</label><select class="input" id="esp-alvo-${uid}" name="alvo" data-alvo-especialista></select></div>
    <div><label class="label" for="esp-pergunta-${uid}">Sua pergunta (opcional)</label><textarea class="input" id="esp-pergunta-${uid}" name="pergunta" rows="2" maxlength="600" placeholder="Ex.: o gancho segura nos 3 primeiros segundos?"></textarea></div>
    <div class="flex flex-wrap gap-2"><button class="btn-ia" type="submit" data-consultar-especialista><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Consultar com IA</button>
      <button class="btn-ghost" type="button" data-checklist-sem-ia><i class="fa-solid fa-list-check" aria-hidden="true"></i> Ver checklist (sem IA)</button></div>
  </form>
  <div data-saida-especialista aria-live="polite"></div>
  <details class="mt-4" data-historico-consultas><summary class="cursor-pointer text-sm text-slate-600" data-titulo-historico></summary><ul class="mt-1 space-y-1" data-historico-especialistas></ul></details>`;

  const desenharAlvos = () => {
    const sel = $('[name=alvo]', raiz);
    sel.innerHTML = opcoesAlvo(esp, d, alvoValor);
    if (!sel.value || sel.selectedOptions[0]?.disabled) sel.value = [...sel.options].find((o) => !o.disabled)?.value || '';
  };
  desenharAlvos(); desenharHistorico();
  const saida = $('[data-saida-especialista]', raiz);
  const mostrarConsulta = (consulta, e, quando) => {
    saida.innerHTML = cardResultado(e, consulta.alvo, consulta.resultado, quando);
    ligarAplicacao($('[data-resultado-especialista]', saida), { cliente, consulta, especialista: e, dados: d, aoMudar: () => { desenharHistorico(); aoMudar(); } });
  };

  on(raiz, 'change', '[name=especialista]', (r) => { esp = especialistaPorId(r.value) || esp; alvoValor = $('[name=alvo]', raiz).value; desenharAlvos(); saida.innerHTML = ''; });
  on(raiz, 'change', '[name=alvo]', (s) => { alvoValor = s.value; });
  on(raiz, 'click', '[data-checklist-sem-ia]', () => {
    saida.innerHTML = cardChecklist(esp, alvoAtual(), ehProdutoSaude(cliente));
    mostrarResultado($('[data-checklist-especialista]', saida), 'Checklist abaixo.');
  });
  on(raiz, 'submit', '[data-form-especialista]', async (form, ev) => {
    ev.preventDefault();
    const alvo = alvoAtual();
    const pergunta = form.elements.pergunta.value.trim();
    if (!alvo) return toast('Escolha o que analisar (crie antes um criativo, peça ou campanha, se a lista estiver vazia).', 'erro');
    if (alvo.tipo === 'livre' && !pergunta) return toast('Escreva sua pergunta: em "Pergunta livre" o especialista responde a ela.', 'erro');
    await ocupado(form.querySelector('[data-consultar-especialista]'), async () => {
      const peca = alvo.tipo === 'peca' ? (d.pecas || []).find((p) => p.id === alvo.id) : null;
      const item = alvo.tipo === 'criativo' ? criativos.find((c) => c.id === alvo.id) : alvo.tipo === 'campanha' ? campanhas.find((c) => c.id === alvo.id) : peca;
      const criativo = peca ? criativos.find((c) => c.id === peca.criativoId) || null : null;
      const contexto = contextoDoAlvo({ tipo: alvo.tipo, item, cliente, produtos, resultados, criativo });
      const resultado = await consultarEspecialista({ cliente, especialista: esp, alvo: { tipo: alvo.tipo, rotulo: ALVOS[alvo.tipo] }, contexto, pergunta });
      if (!resultado.resumo && !resultado.acoes.length && !resultado.pontos.length) throw new Error('A IA não devolveu o diagnóstico. Tente de novo ou use "Ver checklist (sem IA)".');
      const alvoSalvo = { tipo: alvo.tipo, id: alvo.id || null, nome: alvo.nome, ...(peca ? { criativoId: peca.criativoId } : {}) };
      const salvo = await db.criar(COL.analises, { clienteId: cliente.id, tipo: 'especialista', especialistaId: esp.id, alvo: alvoSalvo, pergunta, origem: 'ia', resultado, aplicacoes: {} });
      historico.unshift(salvo); desenharHistorico();
      mostrarConsulta(salvo, esp);
      mostrarResultado($('[data-resultado-especialista]', saida), `Pronto: diagnóstico de ${esp.nome} abaixo.`);
    });
  });
  on(raiz, 'click', '[data-ver-consulta]', (b) => {
    const a = historico.find((x) => x.id === b.dataset.verConsulta); if (!a) return;
    const e = especialistaPorId(a.especialistaId) || esp;
    a.resultado = normalizarConsulta(a.resultado); // o mesmo objeto do histórico recebe o status das aplicações
    mostrarConsulta(a, e, a.criadoEm);
    mostrarResultado($('[data-resultado-especialista]', saida), 'Consulta guardada aberta abaixo.');
  });
}

/** Abre a janela. `alvoInicial` = { tipo, id } (ex.: o criativo aberto). */
export async function abrirEspecialistas(cliente, { alvoInicial = null, aoMudar = () => {}, aoFechar = null } = {}) {
  const m = modal(`Especialistas — ${cliente.nome}`, '<div data-esp></div>', { largo: true, aoFechar });
  await montarEspecialistas($('[data-esp]', m.el), cliente, { alvoInicial, aoMudar });
  return m;
}
