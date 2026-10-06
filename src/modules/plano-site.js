// "Analisar meu pedido" (passo 3), "Conferência do pedido" (passo 4) e as tarefas de loja do plano (passo 6).
// Regras em lib/plano-site.js; aqui só a tela e a gravação. O plano mora no site (site.planos, os 10 últimos); nada
// é aplicado antes de "Aplicar o plano" (quem aplica é sites.js, pelas mesmas regras de sempre).
import { analisarPedidoSite, conferirPedidoIa } from '../core/ia.js';
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
function itemHtml(x, { leitura = false } = {}) {
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
        ${x.status === 'pergunta' && x.pergunta && !leitura ? `<div class="mt-1 rounded bg-amber-50 p-2" data-pergunta-item><p class="text-xs font-semibold text-amber-900">${esc(x.pergunta.texto)}</p>
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
export function planoHtml(plano, { leitura = false, aplicado = false } = {}) {
  if (!plano) return '';
  const aceitos = itensAceitos(plano).length;
  return `<div class="mt-3 rounded-lg border-2 border-violet-200 bg-white p-3" data-plano="${esc(plano.id)}">
    <div class="flex flex-wrap items-center justify-between gap-2"><h4 class="font-semibold"><i class="fa-solid fa-list-check text-violet-600"></i> Plano ${plano.n ? `#${plano.n}` : ''} <span class="text-xs font-normal text-slate-500">· analisado em ${esc(quando(plano.criadoEm))}${plano.aplicadoEm ? ` · aplicado em ${esc(quando(plano.aplicadoEm))}${plano.versao ? ` (v${plano.versao})` : ''}` : ''}</span></h4>
      ${aplicado ? '<span class="tag tag-ok">aplicado</span>' : ''}</div>
    ${plano.resumo ? `<p class="caption">${esc(plano.resumo)}</p>` : ''}
    ${leitura ? '' : '<p class="hint">Marque o que você aceita e responda as perguntas. Nada muda no site antes de "Aplicar o plano".</p>'}
    ${diferencaHtml(plano.diferenca)}
    <ul class="mt-2 space-y-2" data-itens-plano>${plano.itens.map((x) => itemHtml(x, { leitura })).join('') || '<li class="hint">A IA não achou pedidos no texto.</li>'}</ul>
    ${plano.sugestoes.length ? `<p class="mt-3 text-sm font-semibold"><i class="fa-solid fa-lightbulb text-amber-500"></i> Sugestões para ficar mais profissional</p><p class="hint !mt-0">Ideias da IA pelo nicho e pela referência. Nenhuma entra sem você marcar.</p>
      <ul class="mt-1 space-y-2" data-sugestoes-plano>${plano.sugestoes.map((x) => itemHtml(x, { leitura })).join('')}</ul>` : ''}
    ${plano.conferencia ? conferenciaListaHtml(plano, plano.conferencia) : ''}
    ${leitura ? '' : `<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><button type="button" class="btn-primary" data-aplicar-plano ${aceitos ? '' : 'disabled'}><i class="fa-solid fa-check-double"></i> Aplicar o plano (${aceitos} item(ns))</button>
      <span class="hint">Aplica a estrutura (fotos, seções, frete, pagamento…) e gera os textos com os itens marcados como obrigatórios. A escolha feita em "Usar em" continua valendo.</span></div>`}</div>`;
}

/** Bloco do passo 3, logo abaixo de "Como eu quero o site" e "O que eu gostei nesse site". */
export function blocoAnaliseHtml(cliente, site) {
  const p = planoAtual(site);
  const mudou = textoMudou(cliente, p);
  return `<div class="card mt-4 border-violet-200" data-analise-pedido data-ancora="plano"><div class="flex flex-wrap items-center justify-between gap-2">
      <div><h3 class="font-semibold"><i class="fa-solid fa-magnifying-glass-chart text-violet-600"></i> Analisar meu pedido</h3>
      <p class="caption">A IA lê o que você escreveu (e a referência), e mostra item a item como vai ficar e onde funciona, ANTES de mudar qualquer coisa.</p></div>
      <button type="button" class="btn-ia" data-analisar-pedido><i class="fa-solid fa-wand-magic-sparkles"></i> ${p ? 'Analisar de novo' : 'Analisar meu pedido'}</button></div>
    ${mudou ? '<p class="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800" data-texto-mudou><i class="fa-solid fa-pen"></i> Você mudou o texto depois desta análise: clique em "Analisar de novo" para ver o que muda.</p>' : ''}
    <div data-plano-area>${planoHtml(p, { aplicado: p && site?.planoAplicado === p.id })}</div></div>`;
}

// ---------- análise ----------
/**
 * Liga o bloco. ctx: { cliente, site (getter), salvarSite, produtos, materiais, plataforma, tema, modo, aplicar(plano, botao) }.
 */
export function ligarAnalise(alvo, ctx) {
  const contexto = () => ({ materiais: ctx.materiais, produtos: ctx.produtos, modo: ctx.modo, plataforma: ctx.plataforma, tema: ctx.tema });
  const salvarPlano = async (plano) => {
    const lista = (ctx.site?.planos || []).map((p) => (p.id === plano.id ? plano : p));
    await ctx.salvarSite({ planos: lista });
  };
  const redesenhar = () => {
    const area = $('[data-plano-area]', alvo); const p = planoAtual(ctx.site);
    if (area) area.innerHTML = planoHtml(p, { aplicado: p && ctx.site?.planoAplicado === p.id });
  };
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
export function abrirPlanoDaVersao(site, planoId, versao = null) {
  const p = planoPorId(site, planoId);
  if (!p) { toast('Esse plano não está mais guardado (o app guarda os 10 últimos).', 'info'); return; }
  const v = versao ? (site.versoesAjuste || []).find((x) => x.n === versao) : null;
  const conf = v?.conferencia ? { ...v.conferencia } : p.conferencia;
  modal(`Plano #${p.n || ''}${versao ? ` — versão v${versao}` : ''}`, `<div data-plano-versao>${planoHtml({ ...p, conferencia: conf || null }, { leitura: true, aplicado: site.planoAplicado === p.id })}</div>`, { largo: true });
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
