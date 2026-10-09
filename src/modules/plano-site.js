// "Analisar meu pedido" (passo 3), "Conferência do pedido" (passo 4) e as tarefas de loja do plano (passo 6).
// Regras em lib/plano-site.js; aqui só a tela e a gravação. O plano mora no site (site.planos, os 10 últimos); nada
// é aplicado antes de "Aplicar o plano" (quem aplica é sites.js, pelas mesmas regras de sempre).
import { analisarPedidoSite, conferirPedidoIa, sugerirVersoesTexto } from '../core/ia.js';
import { emailAtual } from '../core/auth.js';
import {
  ehItemTexto, pendenciasParte, alegacoesDe, numerosDe, textoEscolhido, escolherVersao, definirFonte, confirmarAlegacao,
  receberTextoCompleto, mesclarSugestoes, contadorTexto, LIMITE_TEXTO_SITE, AVISO_SITE_SAUDE, VERSOES, FONTES_NUMERO, DESTINOS_TEXTO,
  alegacoesMantidas, nomeFonte,
} from '../lib/textos-site.js';
import {
  normalizarPlano, responderPergunta, diferencaPlanos, itensAceitos, TIPOS_PEDIDO, STATUS_ITEM, ONDE, RESULTADO,
  ondeFunciona, contagemConferencia, conferirPorCodigo, itensFaltando, secoesDoModo, tarefasDaLoja,
} from '../lib/plano-site.js';
import { esc, $, on, toast, ocupado, mostrarResultado, modal, dataBR } from '../core/ui.js';

export const MAX_PLANOS = 10;
const quando = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return dataBR(iso); } };
const COR_STATUS = { pronto: 'tag-ok', pergunta: 'tag-warn', impossivel: 'tag-bad' };
const COR_ONDE = { ambos: 'tag-ok', previa: 'tag-info', loja: 'tag-warn' };
const COR_RES = { atendido: 'tag-ok', parcial: 'tag-warn', nao: 'tag-bad' };

/** Plano mostrado no passo 3 (o último analisado) e o plano aplicado (o que vale na geração e na conferência). */
export const planoAtual = (site) => (site?.planos || [])[0] || null;
export const planoAplicado = (site) => (site?.planos || []).find((p) => p.id === site?.planoAplicado) || null;
export const planoPorId = (site, id) => (site?.planos || []).find((p) => p.id === id) || null;
/** O texto mudou desde a análise? (aí o botão sugere analisar de novo) */
export const textoMudou = (cliente, plano) => {
  const p = cliente?.preferenciasSite || {};
  return Boolean(plano) && (String(p.texto || '').trim() !== plano.base?.texto || String(p.gostei || '').trim() !== plano.base?.gostei);
};

// ---------- HTML ----------
// ---------- textos do operador (três versões por frase) ----------
const contadorHtml = (texto, attrs = '') => { const c = contadorTexto(texto); return `<p class="mt-1 text-xs ${c.perto ? 'font-medium text-amber-800' : 'text-slate-500'}" aria-live="polite" ${attrs}>${esc(c.rotulo)}${c.perto ? ' · perto do limite: encurte se puder' : ''}</p>`; };
function opcaoVersao(p, k, { saude, rotulo, extra = '' }) {
  const texto = p[k], vazio = !texto;
  const aviso = !vazio && saude && alegacoesDe({ ...p, escolha: k }, { saude }).length;
  return `<label class="flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-lg border p-2 text-sm ${p.escolha === k ? 'border-indigo-500 ring-2 ring-indigo-500' : 'border-slate-200'} ${vazio ? 'bg-slate-50' : ''}" data-opcao-versao="${k}">
    <span class="flex items-center gap-2 font-semibold"><input type="radio" name="versao-${esc(p.id)}" value="${k}" data-versao="${esc(p.id)}" ${p.escolha === k ? 'checked' : ''} ${vazio ? 'disabled' : ''}> ${esc(rotulo)}</span>
    <span class="whitespace-pre-wrap ${vazio ? 'text-xs text-slate-600' : ''}">${vazio ? 'Sem esta versão agora: use "Sugerir de novo".' : esc(texto)}</span>
    ${aviso ? '<span class="tag tag-warn self-start" data-tag-alegacao>alegação de efeito: aviso</span>' : ''}${extra}</label>`;
}
function parteHtml(p, k, { saude, leitura }) {
  if (leitura) return `<li class="text-sm" data-parte="${esc(p.id)}"><b>${esc(VERSOES[p.escolha] || VERSOES.original)}:</b> ${esc(textoEscolhido(p))}${p.fonte ? ` <span class="text-xs text-slate-600">(fonte: ${esc(nomeFonte(p.fonte))})</span>` : ''}${p.confirmado ? ` <span class="text-xs text-amber-800">(alegação mantida por ${esc(p.confirmado.por)} em ${esc(quando(p.confirmado.em))})</span>` : ''}</li>`;
  const pend = pendenciasParte(p, { saude });
  const alegacoes = alegacoesDe(p, { saude });
  const nums = numerosDe(textoEscolhido(p));
  const grupo = `fonte-${p.id}`;
  return `<li class="rounded-lg border border-slate-200 p-2" data-parte="${esc(p.id)}" data-pendencias="${esc(pend.join(' '))}">
    <fieldset><legend class="text-xs font-semibold text-slate-600">Texto ${k + 1}</legend>
    <div class="mt-1 grid gap-2 sm:grid-cols-3">${opcaoVersao(p, 'original', { saude, rotulo: VERSOES.original })}${opcaoVersao(p, 'melhorada', { saude, rotulo: VERSOES.melhorada })}${opcaoVersao(p, 'segura', { saude, rotulo: VERSOES.segura, extra: p.segura ? '<span class="tag tag-ok self-start">também pode ser usada nos anúncios</span>' : '' })}</div>
    <label class="mt-2 flex min-h-[44px] items-center gap-2 text-sm"><input type="radio" name="versao-${esc(p.id)}" value="manual" data-versao="${esc(p.id)}" ${p.escolha === 'manual' ? 'checked' : ''}> ${VERSOES.manual}</label>
    ${p.escolha === 'manual' ? `<label class="sr-only" for="manual-${esc(p.id)}">Seu texto editado à mão</label><textarea id="manual-${esc(p.id)}" class="input" rows="2" maxlength="600" data-manual="${esc(p.id)}">${esc(p.manual || p.original)}</textarea>` : ''}</fieldset>
    ${(p.descartes || []).map((d) => `<p class="mt-1 text-xs text-slate-600"><i class="fa-solid fa-filter"></i> ${esc(d)}</p>`).join('')}
    ${nums.length ? `<div class="mt-2 rounded border ${pend.includes('fonte') ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50/40'} p-2 text-sm" data-pede-fonte role="group" aria-label="Fonte do número">
      <p class="font-medium">Número: ${nums.map((n) => `"${esc(n)}"`).join(', ')}. De onde vem? ${pend.includes('fonte') ? '<span class="text-amber-800">(sem fonte, este item fica pendente; a IA nunca inventa número)</span>' : ''}</p>
      <div class="mt-1 flex flex-wrap gap-x-4">${Object.entries(FONTES_NUMERO).map(([v, r]) => `<label class="flex min-h-[44px] items-center gap-2"><input type="radio" name="${esc(grupo)}" value="${v}" data-fonte="${esc(p.id)}" ${p.fonte?.tipo === v ? 'checked' : ''}> ${esc(r)}</label>`).join('')}</div>
      ${p.fonte?.tipo === 'outro' ? `<label class="text-xs" for="outro-${esc(p.id)}">Qual fonte?</label><input id="outro-${esc(p.id)}" class="input mt-1" maxlength="200" data-fonte-outro="${esc(p.id)}" value="${esc(p.fonte.outro || '')}" placeholder="Ex.: planilha de pedidos de 2025">` : ''}</div>` : ''}
    ${alegacoes.length ? `<div class="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-aviso-alegacao>
      <p><i class="fa-solid fa-triangle-exclamation"></i> ${esc(AVISO_SITE_SAUDE)}</p><p class="mt-1 text-xs">Trecho: ${alegacoes.map((a) => `"${esc(a)}"`).join(', ')}</p>
      <label class="mt-1 flex min-h-[44px] items-center gap-2 font-medium"><input type="checkbox" data-confirmar="${esc(p.id)}" ${p.confirmado?.texto === textoEscolhido(p) ? 'checked' : ''}> Entendi e quero manter no site</label></div>` : ''}</li>`;
}
function textosItemHtml(x, { saude, leitura }) {
  if (!ehItemTexto(x)) return '';
  const destino = DESTINOS_TEXTO[x.params?.destino] || DESTINOS_TEXTO.secao;
  return `<div class="mt-2" data-textos-item="${esc(x.id)}">
    <p class="text-xs text-slate-600"><b>Onde vai:</b> ${esc(destino)}${x.params?.titulo ? ` "${esc(x.params.titulo)}"` : ''}. ${leitura ? '' : 'Escolha a versão de cada texto; o padrão é o seu. Nada muda antes de "Aplicar o plano".'}</p>
    ${x.partes.length ? `<ol class="mt-1 space-y-2">${x.partes.map((p, k) => parteHtml(p, k, { saude, leitura })).join('')}</ol>` : ''}
    ${!leitura && x.pedeTexto ? `<div class="mt-2 rounded bg-amber-50 p-2" data-texto-completo-area><label class="text-xs font-semibold text-amber-800" for="completo-${esc(x.id)}">Você me manda o texto completo? (um texto por linha)</label>
      <textarea id="completo-${esc(x.id)}" class="input mt-1" rows="5" maxlength="${LIMITE_TEXTO_SITE}" data-texto-completo="${esc(x.id)}">${esc(x.textoCompleto || '')}</textarea>${contadorHtml(x.textoCompleto || '', `data-contador-item="${esc(x.id)}"`)}
      <button type="button" class="btn-primary btn-sm mt-1 min-h-[44px]" data-usar-texto-completo="${esc(x.id)}"><i class="fa-solid fa-check"></i> Usar este texto</button></div>` : ''}
    ${!leitura && x.partes.length ? `<button type="button" class="btn-ia btn-sm mt-2 min-h-[44px]" data-sugerir-de-novo="${esc(x.id)}"><i class="fa-solid fa-wand-magic-sparkles"></i> Sugerir de novo</button>` : ''}</div>`;
}

function itemHtml(x, { leitura = false, saude = false } = {}) {
  const pode = x.status === 'pronto';
  return `<li class="rounded-lg border ${x.aceito && pode ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'} p-2 text-sm" data-item-plano="${esc(x.id)}" data-status-item="${x.status}">
    <div class="flex items-start gap-2">${leitura ? '' : `<input type="checkbox" class="mt-1" data-aceitar-item="${esc(x.id)}" ${x.aceito && pode ? 'checked' : ''} ${pode ? '' : 'disabled'} aria-label="Aceitar este item">`}
      <div class="min-w-0 flex-1">
        <p class="flex flex-wrap items-center gap-1"><span class="tag ${COR_STATUS[x.status]}">${esc(STATUS_ITEM[x.status])}</span>${x.sugestao ? '<span class="tag tag-info">sugestão</span>' : ''}<span class="tag ${COR_ONDE[x.onde?.tipo] || ''}" data-onde="${esc(x.onde?.tipo || '')}">${esc(ONDE[x.onde?.tipo] || '')}</span><span class="text-xs text-slate-500">${esc(TIPOS_PEDIDO[x.tipo] || '')}</span></p>
        ${x.pedido ? `<p class="mt-1 text-slate-600"><i class="fa-solid fa-quote-left text-slate-300"></i> ${esc(x.pedido)}</p>` : ''}
        ${x.como ? `<p class="mt-0.5"><b>Como fica:</b> ${esc(x.como)}</p>` : ''}
        ${x.sugestao && x.motivo ? `<p class="text-xs text-slate-600"><b>Por quê:</b> ${esc(x.motivo)}</p>` : ''}
        ${x.status !== 'impossivel' && (x.onde?.oque || x.onde?.caminho) ? `<p class="mt-0.5 text-xs text-slate-600" data-caminho-item><i class="fa-solid fa-location-arrow"></i> ${esc(x.onde.oque || '')}${x.onde.caminho ? `: <b>${esc(x.onde.caminho)}</b>` : ''}</p>` : ''}
        ${x.aviso ? `<p class="mt-0.5 text-xs text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(x.aviso)}</p>` : ''}
        ${x.status === 'impossivel' ? `<p class="mt-0.5 text-xs text-rose-700" data-motivo-item>${esc(x.motivo || 'Não dá para fazer neste modelo.')}</p>${x.alternativa ? `<p class="text-xs text-slate-700"><b>Mais próximo possível:</b> ${esc(x.alternativa)}</p>` : ''}` : ''}
        ${textosItemHtml(x, { saude, leitura })}
        ${x.status === 'pergunta' && x.pergunta && !leitura ? `<div class="mt-1 rounded bg-amber-50 p-2" data-pergunta-item><p class="text-xs font-semibold text-amber-800">${esc(x.pergunta.texto)}</p>
          <div class="mt-1 flex flex-wrap gap-1">${x.pergunta.opcoes.map((o, i) => `<button type="button" class="btn-ghost btn-sm" data-responder="${esc(x.id)}" data-opcao="${i}">${esc(o.texto)}</button>`).join('')}</div></div>` : ''}
        ${x.resposta ? `<p class="text-xs text-emerald-800" data-resposta-item><i class="fa-solid fa-reply"></i> Sua resposta: ${esc(x.resposta)}</p>` : ''}</div></div></li>`;
}

function diferencaHtml(dif) {
  if (!dif) return '';
  if (dif.igual) return '<p class="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600" data-diferenca-plano>Igual ao plano anterior.</p>';
  return `<div class="mt-2 rounded border border-indigo-200 bg-indigo-50/50 p-2 text-xs" data-diferenca-plano><p class="font-semibold">O que mudou desde o plano anterior</p>
    ${dif.novos.map((x) => `<p class="text-emerald-800">+ Novo: ${esc(x.pedido || TIPOS_PEDIDO[x.tipo])}</p>`).join('')}
    ${dif.mudados.map((m) => `<p class="text-amber-800">~ Mudou: ${esc(m.item.pedido || TIPOS_PEDIDO[m.item.tipo])} (${esc(m.dif.join('; '))})</p>`).join('')}
    ${dif.removidos.map((x) => `<p class="text-rose-700">− Saiu: ${esc(x.pedido || TIPOS_PEDIDO[x.tipo])}</p>`).join('')}</div>`;
}

/** Plano completo (passo 3, editável; ou só leitura em "Ver plano desta versão"). */
export function planoHtml(plano, { leitura = false, aplicado = false, saude = false } = {}) {
  if (!plano) return '';
  const aceitos = itensAceitos(plano).length;
  return `<div class="mt-3 rounded-lg border-2 border-violet-200 bg-white p-3" data-plano="${esc(plano.id)}">
    <div class="flex flex-wrap items-center justify-between gap-2"><h4 class="font-semibold"><i class="fa-solid fa-list-check text-violet-600"></i> Plano ${plano.n ? `#${plano.n}` : ''} <span class="text-xs font-normal text-slate-500">· analisado em ${esc(quando(plano.criadoEm))}${plano.aplicadoEm ? ` · aplicado em ${esc(quando(plano.aplicadoEm))}${plano.versao ? ` (v${plano.versao})` : ''}` : ''}</span></h4>
      ${aplicado ? '<span class="tag tag-ok">aplicado</span>' : ''}</div>
    ${plano.resumo ? `<p class="caption">${esc(plano.resumo)}</p>` : ''}
    ${leitura ? '' : '<p class="hint">Marque o que você aceita e responda as perguntas. Nada muda no site antes de "Aplicar o plano".</p>'}
    ${diferencaHtml(plano.diferenca)}
    <ul class="mt-2 space-y-2" data-itens-plano>${plano.itens.map((x) => itemHtml(x, { leitura, saude })).join('') || '<li class="hint">A IA não achou pedidos no texto.</li>'}</ul>
    ${plano.sugestoes.length ? `<p class="mt-3 text-sm font-semibold"><i class="fa-solid fa-lightbulb text-amber-500"></i> Sugestões para ficar mais profissional</p><p class="hint !mt-0">Ideias da IA pelo nicho e pela referência. Nenhuma entra sem você marcar.</p>
      <ul class="mt-1 space-y-2" data-sugestoes-plano>${plano.sugestoes.map((x) => itemHtml(x, { leitura, saude })).join('')}</ul>` : ''}
    ${plano.conferencia ? conferenciaListaHtml(plano, plano.conferencia) : ''}
    ${leitura ? '' : `<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><button type="button" class="btn-primary" data-aplicar-plano ${aceitos ? '' : 'disabled'}><i class="fa-solid fa-check-double"></i> Aplicar o plano (${aceitos} item(ns))</button>
      <span class="hint">Aplica a estrutura (fotos, seções, frete, pagamento…) e gera os textos com os itens marcados como obrigatórios. A escolha feita em "Usar em" continua valendo.</span></div>`}</div>`;
}

/** Bloco do passo 3, logo abaixo de "Como eu quero o site" e "O que eu gostei nesse site". */
export function blocoAnaliseHtml(cliente, site, { saude = false } = {}) {
  const p = planoAtual(site);
  const mudou = textoMudou(cliente, p);
  return `<div class="card mt-4 border-violet-200" data-analise-pedido data-ancora="plano"><div class="flex flex-wrap items-center justify-between gap-2">
      <div><h3 class="font-semibold"><i class="fa-solid fa-magnifying-glass-chart text-violet-600"></i> Analisar meu pedido</h3>
      <p class="caption">A IA lê o que você escreveu (e a referência), e mostra item a item como vai ficar e onde funciona, ANTES de mudar qualquer coisa.</p></div>
      <button type="button" class="btn-ia" data-analisar-pedido><i class="fa-solid fa-wand-magic-sparkles"></i> ${p ? 'Analisar de novo' : 'Analisar meu pedido'}</button></div>
    ${mudou ? '<p class="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800" data-texto-mudou><i class="fa-solid fa-pen"></i> Você mudou o texto depois desta análise: clique em "Analisar de novo" para ver o que muda.</p>' : ''}
    <div data-plano-area>${planoHtml(p, { aplicado: p && site?.planoAplicado === p.id, saude })}</div></div>`;
}

// ---------- análise ----------
/**
 * Liga o bloco. ctx: { cliente, site (getter), salvarSite, produtos, materiais, plataforma, tema, modo, saude, aplicar(plano, botao) }.
 */
export function ligarAnalise(alvo, ctx) {
  const contexto = () => ({ materiais: ctx.materiais, produtos: ctx.produtos, modo: ctx.modo, plataforma: ctx.plataforma, tema: ctx.tema, saude: !!ctx.saude });
  const salvarPlano = async (plano) => {
    const lista = (ctx.site?.planos || []).map((p) => (p.id === plano.id ? plano : p));
    await ctx.salvarSite({ planos: lista });
  };
  const redesenhar = () => {
    const area = $('[data-plano-area]', alvo); const p = planoAtual(ctx.site);
    if (area) area.innerHTML = planoHtml(p, { aplicado: p && ctx.site?.planoAplicado === p.id, saude: !!ctx.saude });
  };
  // Muda um item de texto do plano atual, grava, redesenha e deixa a frase mexida à vista.
  const mudarItem = async (itemId, f, parteId = null) => {
    const p = planoAtual(ctx.site); if (!p) return;
    const muda = (x) => (x.id === itemId ? f(x) : x);
    await salvarPlano({ ...p, itens: p.itens.map(muda), sugestoes: p.sugestoes.map(muda) });
    redesenhar();
    const alvoEl = (parteId && $(`[data-parte="${parteId}"]`, alvo)) || $(`[data-item-plano="${itemId}"]`, alvo);
    alvoEl?.scrollIntoView?.({ block: 'nearest' });
    return alvoEl;
  };
  const itemDaParte = (parteId) => [...(planoAtual(ctx.site)?.itens || []), ...(planoAtual(ctx.site)?.sugestoes || [])].find((x) => (x.partes || []).some((q) => q.id === parteId));
  const c2 = () => ({ saude: !!ctx.saude });
  on(alvo, 'change', '[data-versao]', async (r) => {
    const it = itemDaParte(r.dataset.versao); if (!it) return;
    const el = await mudarItem(it.id, (x) => escolherVersao(x, r.dataset.versao, r.value, c2()), r.dataset.versao);
    if (r.value === 'manual') $(`[data-manual="${r.dataset.versao}"]`, alvo)?.focus();
    else if (el) mostrarResultado(el, `Escolhido: ${VERSOES[r.value]}.`);
  });
  on(alvo, 'change', '[data-manual]', async (t) => {
    const it = itemDaParte(t.dataset.manual); if (!it) return;
    const el = await mudarItem(it.id, (x) => escolherVersao(x, t.dataset.manual, 'manual', { ...c2(), manual: t.value }), t.dataset.manual);
    if (el) mostrarResultado(el, 'Seu texto editado foi guardado no plano.');
  });
  on(alvo, 'change', '[data-fonte]', async (r) => {
    const it = itemDaParte(r.dataset.fonte); if (!it) return;
    const el = await mudarItem(it.id, (x) => definirFonte(x, r.dataset.fonte, { tipo: r.value, outro: '' }, c2()), r.dataset.fonte);
    if (r.value === 'outro') $(`[data-fonte-outro="${r.dataset.fonte}"]`, alvo)?.focus();
    else if (el) mostrarResultado(el, `Fonte guardada: ${FONTES_NUMERO[r.value]}.`);
  });
  on(alvo, 'change', '[data-fonte-outro]', async (t) => {
    const it = itemDaParte(t.dataset.fonteOutro); if (!it) return;
    const el = await mudarItem(it.id, (x) => definirFonte(x, t.dataset.fonteOutro, { tipo: 'outro', outro: t.value }, c2()), t.dataset.fonteOutro);
    if (el) mostrarResultado(el, t.value.trim() ? 'Fonte guardada.' : 'Escreva qual é a fonte do número.');
  });
  on(alvo, 'change', '[data-confirmar]', async (c) => {
    const it = itemDaParte(c.dataset.confirmar); if (!it) return;
    const el = await mudarItem(it.id, (x) => confirmarAlegacao(x, c.dataset.confirmar, { marcado: c.checked, por: emailAtual() }, c2()), c.dataset.confirmar);
    if (el) mostrarResultado(el, c.checked ? 'Alegação mantida no site (fica registrado quem e quando).' : 'Confirmação retirada: este texto fica pendente.');
  });
  on(alvo, 'input', '[data-texto-completo]', (t) => {
    const cont = $(`[data-contador-item="${t.dataset.textoCompleto}"]`, alvo); if (!cont) return;
    const c = contadorTexto(t.value); cont.textContent = `${c.rotulo}${c.perto ? ' · perto do limite: encurte se puder' : ''}`;
    cont.className = `mt-1 text-xs ${c.perto ? 'font-medium text-amber-800' : 'text-slate-500'}`;
  });
  on(alvo, 'click', '[data-usar-texto-completo]', (b) => ocupado(b, async () => {
    const id = b.dataset.usarTextoCompleto; const campo = $(`[data-texto-completo="${id}"]`, alvo);
    if (!campo?.value.trim()) throw new Error('Cole o texto completo no campo antes de usar.');
    const el = await mudarItem(id, (x) => receberTextoCompleto(x, campo.value, c2()));
    if (el) mostrarResultado(el, 'Texto completo guardado no plano (um texto por linha). Use "Sugerir de novo" para ver a versão melhorada e a segura.');
  }));
  on(alvo, 'click', '[data-sugerir-de-novo]', (b) => ocupado(b, async () => {
    const id = b.dataset.sugerirDeNovo;
    const it = [...(planoAtual(ctx.site)?.itens || []), ...(planoAtual(ctx.site)?.sugestoes || [])].find((x) => x.id === id); if (!it) return;
    const sugeridas = await sugerirVersoesTexto({ cliente: ctx.cliente, item: it, produtos: ctx.produtos });
    if (!sugeridas.length) throw new Error('A IA não devolveu sugestões agora. Tente de novo ou use "Editar à mão".');
    const el = await mudarItem(id, (x) => mesclarSugestoes(x, sugeridas, c2()));
    if (el) mostrarResultado(el, 'Novas versões sugeridas só para este item. Seu texto continua escolhido até você trocar.');
  }));
  on(alvo, 'click', '[data-analisar-pedido]', (b) => ocupado(b, async () => {
    const texto = String(ctx.cliente.preferenciasSite?.texto || '').trim();
    if (!texto && !String(ctx.cliente.preferenciasSite?.gostei || '').trim()) throw new Error('Escreva em "Como eu quero o site" o que você quer antes de analisar.');
    const bruto = await analisarPedidoSite({ cliente: ctx.cliente, produtos: ctx.produtos, materiais: ctx.materiais, plataforma: ctx.plataforma, tema: ctx.tema, modo: ctx.modo, secoes: secoesDoModo(ctx.modo) });
    const anterior = planoAtual(ctx.site);
    const novo = {
      id: `pl${Date.now().toString(36)}`, n: ((ctx.site?.planos || []).reduce((m, p) => Math.max(m, p.n || 0), 0)) + 1, criadoEm: new Date().toISOString(),
      base: { texto, gostei: String(ctx.cliente.preferenciasSite?.gostei || '').trim() }, plataforma: ctx.plataforma, tema: ctx.tema || '', modo: ctx.modo,
      ...normalizarPlano(bruto, contexto()),
    };
    if (anterior) novo.diferenca = diferencaPlanos(anterior, novo);
    await ctx.salvarSite({ planos: [novo, ...(ctx.site?.planos || [])].slice(0, MAX_PLANOS) });
    redesenhar(); $('[data-texto-mudou]', alvo)?.remove();
    b.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analisar de novo';
    const area = $('[data-plano]', alvo);
    mostrarResultado(area, `Plano pronto: ${novo.itens.length} item(ns)${novo.sugestoes.length ? ` e ${novo.sugestoes.length} sugestão(ões)` : ''}. Marque o que aceita e clique em "Aplicar o plano".`);
  }));
  on(alvo, 'change', '[data-aceitar-item]', async (c) => {
    const p = planoAtual(ctx.site); if (!p) return;
    const id = c.dataset.aceitarItem;
    const muda = (x) => (x.id === id ? { ...x, aceito: c.checked } : x);
    await salvarPlano({ ...p, itens: p.itens.map(muda), sugestoes: p.sugestoes.map(muda) });
    redesenhar();
  });
  on(alvo, 'click', '[data-responder]', async (b) => {
    const p = planoAtual(ctx.site); if (!p) return;
    const id = b.dataset.responder, i = Number(b.dataset.opcao);
    await salvarPlano({ ...p, itens: p.itens.map((x) => (x.id === id ? responderPergunta(x, i, contexto()) : x)) });
    redesenhar();
    const li = $(`[data-item-plano="${id}"]`, alvo); if (li) mostrarResultado(li, 'Resposta registrada: o item foi atualizado.');
  });
  on(alvo, 'click', '[data-aplicar-plano]', (b) => ocupado(b, () => ctx.aplicar(planoAtual(ctx.site), b)));
}

// ---------- conferência ----------
function conferenciaListaHtml(plano, conf) {
  const itens = [...plano.itens, ...plano.sugestoes].filter((x) => conf.resultados?.[x.id]);
  return `<ul class="mt-2 space-y-1 text-sm" data-lista-conferencia>${itens.map((x) => { const r = conf.resultados[x.id]; return `<li class="flex flex-wrap items-start gap-2 rounded bg-slate-50 px-2 py-1" data-conferido="${esc(x.id)}" data-resultado="${r.status}">
    <span class="tag ${COR_RES[r.status]}">${esc(RESULTADO[r.status])}</span><span class="min-w-0 flex-1"><b>${esc(x.pedido || TIPOS_PEDIDO[x.tipo])}</b>: ${esc(r.motivo || '')}${r.por === 'ia' ? ' <span class="text-xs text-slate-400">(conferido pela IA)</span>' : ''}</span></li>`; }).join('')}</ul>`;
}

/** Painel do passo 4: o plano aplicado conferido no estado atual do site. */
export function conferenciaHtml(site) {
  const p = planoAplicado(site); if (!p) return '';
  const conf = site.conferencia?.planoId === p.id ? site.conferencia : null;
  const c = contagemConferencia(conf?.resultados);
  const faltam = conf ? itensFaltando(itensAceitos(p), conf.resultados).length : 0;
  return `<div class="mt-4 rounded-lg border-2 ${faltam ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-300 bg-emerald-50/40'} p-3" data-conferencia data-ancora="conferencia">
    <div class="flex flex-wrap items-center justify-between gap-2"><h4 class="font-semibold"><i class="fa-solid fa-clipboard-check"></i> Conferência do pedido <span class="text-xs font-normal text-slate-500">(plano #${p.n || ''}${conf?.versao ? `, conferido na v${conf.versao}` : ''}${conf?.em ? ` em ${esc(quando(conf.em))}` : ''})</span></h4>
      <div class="flex flex-wrap gap-2">${faltam ? `<button type="button" class="btn-primary btn-sm" data-corrigir-faltou><i class="fa-solid fa-screwdriver-wrench"></i> Corrigir o que faltou (${faltam})</button>` : ''}
        <button type="button" class="btn-ghost btn-sm" data-conferir-de-novo><i class="fa-solid fa-rotate"></i> Conferir de novo</button>
        <button type="button" class="btn-ghost btn-sm" data-ver-plano="${esc(p.id)}"><i class="fa-solid fa-list-check"></i> Ver plano desta versão</button></div></div>
    ${conf ? `<p class="mt-1 text-sm" data-contagem-conferencia><b>${c.atendido}</b> atendido(s) · <b>${c.parcial}</b> parcial(is) · <b>${c.nao}</b> não atendido(s)</p>${conferenciaListaHtml(p, conf)}${conf.notas?.length ? conf.notas.map((n) => `<p class="mt-1 text-xs text-amber-800" data-nota-conferencia><i class="fa-solid fa-circle-info"></i> ${esc(n)}</p>`).join('') : ''}`
    : '<p class="hint mt-1">Ainda não conferido.</p>'}</div>`;
}

/** Resumo em texto do que o site mostra, para a IA conferir os itens de texto/estilo. */
export function estadoParaConferir(site, modo) {
  if (modo === 'custom') {
    const c = site?.conteudo || {};
    return [`Banner: "${c.heroTitulo || ''}" / "${c.heroSubtitulo || ''}" [${c.heroCta || ''}]`, `História: ${String(c.storytelling || '').slice(0, 900)}`,
      `FAQ: ${(c.faq || []).map((f) => f.p).join(' | ')}`, `Cores: ${site?.config?.corPrimaria || '#4f46e5'} / ${site?.config?.corFundo || '#ffffff'}`].join('\n');
  }
  const p = site?.pacote || {};
  return [`Banners: ${(p.banners || []).map((b) => `"${b.titulo}" / "${b.subtitulo}" [${b.cta}]`).join(' | ')}`, `Sobre: ${String(p.textosPagina?.sobre || '').slice(0, 900)}`,
    `FAQ: ${(p.textosPagina?.faq || []).map((f) => f.p).join(' | ')}`, `Estilo do tema: ${p.briefingTema?.estilo || ''}; paleta ${(p.briefingTema?.paletaSugerida || []).join(', ')}`,
    `Descrições: ${(p.descricoesProdutos || []).map((d) => `${d.nome}: ${String(d.descricao || '').slice(0, 300)}`).join(' | ')}`].join('\n');
}
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };

/**
 * Confere o plano aplicado no estado atual: primeiro pelo código; o que sobra (texto, estilo) vai para a IA barata, só
 * se o texto do site mudou desde a última conferência (senão reaproveita). Grava em site.conferencia, no plano e na
 * versão atual. ctx: { cliente, site, salvarSite, modo, materiais, produtos (com as fotos de "Usar em") }.
 */
export async function conferirPlano(ctx, { usarIa = true } = {}) {
  const site = ctx.site; const p = planoAplicado(site); if (!p) return null;
  const itens = itensAceitos(p);
  const { resultados, paraIa } = conferirPorCodigo(itens, { modo: ctx.modo, site, materiais: ctx.materiais, produtos: ctx.produtos });
  const notas = [];
  let chaveIa = null;
  if (paraIa.length) {
    const estado = estadoParaConferir(site, ctx.modo);
    const chave = hash(`${paraIa.join(',')}|${estado}`);
    const antes = site.conferencia?.planoId === p.id && site.conferencia?.chaveIa === chave ? site.conferencia.resultados : null;
    // Reaproveita só o que a IA já conferiu neste mesmo texto; o que ficou pendente (IA falhou) vai de novo.
    const daIa = antes ? Object.fromEntries(paraIa.filter((id) => antes[id]?.por === 'ia').map((id) => [id, antes[id]])) : {};
    const faltam = paraIa.filter((id) => !daIa[id]);
    if (faltam.length && usarIa) {
      try { Object.assign(daIa, await conferirPedidoIa({ cliente: ctx.cliente, itens: itens.filter((x) => faltam.includes(x.id)).map((x) => ({ id: x.id, pedido: x.pedido, como: x.como })), estado })); }
      catch (e) { notas.push(`A parte de texto não foi conferida agora (${e.message}). Clique em "Conferir de novo".`); }
    }
    Object.assign(resultados, daIa);
    for (const id of paraIa) if (!resultados[id]) resultados[id] = { status: 'parcial', motivo: 'não conferido (precisa da IA)', por: 'pendente' };
    chaveIa = chave;
  }
  const versao = Math.max(0, ...(site.versoesAjuste || []).filter((v) => v.modo === ctx.modo).map((v) => v.n));
  const conferencia = { planoId: p.id, em: new Date().toISOString(), versao: versao || null, resultados, notas, ...(chaveIa ? { chaveIa } : {}) };
  // A conferência fica no site (painel do passo 4), no plano e na versão atual ("Ver plano desta versão").
  const planos = (site.planos || []).map((x) => (x.id === p.id ? { ...x, conferencia } : x));
  const versoesAjuste = (site.versoesAjuste || []).map((v) => (v.n === versao && v.modo === ctx.modo ? { ...v, planoId: p.id, conferencia: { em: conferencia.em, resultados } } : v));
  await ctx.salvarSite({ conferencia, planos, ...(versao ? { versoesAjuste } : {}) });
  return conferencia;
}

/** Janela "Ver plano desta versão" (só leitura, com a conferência guardada nessa versão). */
export function abrirPlanoDaVersao(site, planoId, versao = null, { saude = false } = {}) {
  const p = planoPorId(site, planoId);
  if (!p) { toast('Esse plano não está mais guardado (o app guarda os 10 últimos).', 'info'); return; }
  const v = versao ? (site.versoesAjuste || []).find((x) => x.n === versao) : null;
  const conf = v?.conferencia ? { ...v.conferencia } : p.conferencia;
  modal(`Plano #${p.n || ''}${versao ? ` — versão v${versao}` : ''}`, `<div data-plano-versao>${planoHtml({ ...p, conferencia: conf || null }, { leitura: true, aplicado: site.planoAplicado === p.id, saude })}</div>`, { largo: true });
}

// ---------- passo 6 ----------
/** Tarefas de loja do plano aplicado, com o caminho da plataforma/tema ATUAIS (trocar Horizon/Dawn muda o caminho). */
export function tarefasLojaHtml(site, plataforma, tema) {
  const p = planoAplicado(site); if (!p) return '';
  const atual = { ...p, itens: p.itens.map((x) => ({ ...x, onde: x.tipo === 'outro' ? x.onde : ondeFunciona(x.tipo, x.params, plataforma, tema) })), sugestoes: p.sugestoes.map((x) => ({ ...x, onde: x.tipo === 'outro' ? x.onde : ondeFunciona(x.tipo, x.params, plataforma, tema) })) };
  const tarefas = tarefasDaLoja(atual);
  if (!tarefas.length) return '';
  return `<div class="card mt-4 border-amber-300" data-tarefas-plano><h3 class="font-semibold"><i class="fa-solid fa-list-check text-amber-600"></i> Configurar na loja (pedidos do plano #${p.n || ''})</h3>
    <p class="caption">Estes pedidos aparecem na prévia, mas a loja de verdade só fica igual depois de configurar. Onde diz "confira no editor do tema", o nome exato muda com o tema.</p>
    <ol class="mt-2 list-decimal space-y-2 pl-5 text-sm">${tarefas.map((t) => `<li data-tarefa-loja="${esc(t.tipo)}"><b>${esc(t.titulo)}</b> — ${esc(t.oque)}<br><span class="text-xs text-slate-600"><i class="fa-solid fa-location-arrow"></i> <span data-caminho-tarefa>${esc(t.caminho)}</span></span></li>`).join('')}</ol></div>`;
}

/** Passo 6: alegações de efeito e números com fonte que o operador manteve no site, para revisar antes de publicar. */
export function alegacoesSiteHtml(site, modo) {
  const lista = alegacoesMantidas(site, modo);
  if (!lista.length) return '';
  return `<div class="card mt-4 border-amber-300" data-alegacoes-site><h3 class="font-semibold"><i class="fa-solid fa-triangle-exclamation text-amber-600"></i> Revise antes de publicar: textos do site com alegação ou número</h3>
    <p class="caption">${esc(AVISO_SITE_SAUDE)}</p>
    <ul class="mt-2 space-y-2 text-sm">${lista.map((l) => `<li class="rounded border border-slate-200 p-2" data-alegacao-mantida><p>"${esc(l.texto)}" <span class="text-xs text-slate-500">(${esc(l.titulo || 'Destaques')} · ${esc(VERSOES[l.versao] || VERSOES.original)})</span></p>
      ${(l.alegacao || []).length ? `<p class="text-xs text-amber-800">Alegação: ${l.alegacao.map((a) => `"${esc(a)}"`).join(', ')}${l.confirmado ? ` · mantida por ${esc(l.confirmado.por)} em ${esc(quando(l.confirmado.em))}` : ''}</p>` : ''}
      ${l.fonte ? `<p class="text-xs text-slate-600">Fonte do número: ${esc(nomeFonte(l.fonte))}</p>` : ''}
      ${l.segura ? `<p class="text-xs text-emerald-800">Versão segura (para anúncios): "${esc(l.segura)}"</p>` : ''}</li>`).join('')}</ul></div>`;
}
