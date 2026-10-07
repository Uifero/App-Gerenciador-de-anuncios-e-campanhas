// Aba Campanhas, topo: "Sobre como esse cliente anuncia" (Frente 1) e "Analisar e recomendar" (Frentes 2 e 5), mais as
// tarefas aceitas. O texto e os campos ficam em cliente.comoAnuncia (uma fonte só, lida por criativos, campanhas e
// diagnóstico via core/ia.js contextoCliente). Nada é aplicado sem o operador aceitar item por item.
import { db, COL } from '../core/storage.js';
import { extrairCamposAnuncio, sugerirPalavrasBiblioteca } from '../core/ia.js';
import {
  comoAnunciaDe, preencherVazios, normalizarCamposAnuncio, CAMPOS_ANUNCIO, DESTINOS, ATENDIMENTO, LEGENDA_TEXTO, AVISO_AUTO, avisosDestino, sugerirNicho,
  urlBibliotecaAnuncios, palavrasPadrao, limparPalavras, isoDoCliente, numeroBR,
} from '../lib/anuncio.js';
import { aplicarAceitos, VALOR_OPCAO } from '../lib/recomendacao.js';
import { analisarERecomendar, pesquisaEmCache, obterPesquisa, carregarContexto, montarFontes } from './analise-anuncio.js';
import { itemHtml, fontesUsadasHtml } from './itens-analise.js';
import { montarPrintsResultado } from './prints-resultado.js';
import { esc, $, on, toast, ocupado, opcoes, dataBR, tag, mostrarResultado, confirmar } from '../core/ui.js';

const temDitado = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const fmtNum = (v) => (v == null ? '' : String(v));

async function salvarComo(cliente, patch) {
  const comoAnuncia = { ...comoAnunciaDe(cliente), ...patch, atualizadoEm: new Date().toISOString() };
  await db.atualizar(COL.clientes, cliente.id, { comoAnuncia }, { silencioso: true });
  cliente.comoAnuncia = comoAnuncia;
}

// ---------- Frente 1 ----------
function comoAnunciaHtml(cliente, produtos) {
  const a = comoAnunciaDe(cliente);
  const auto = (k) => (a.auto?.[k] ? `<span class="tag tag-warn font-normal" data-auto="${k}">${AVISO_AUTO}</span> <button type="button" class="text-xs text-indigo-700 underline" data-confirmar-campo="${k}">confirmar</button>` : '');
  const sug = sugerirNicho(cliente, produtos);
  const vazio = !String(a.texto || '').trim();
  return `<details class="card mb-5 border-indigo-200" data-como-anuncia ${vazio || !cliente.nicho ? 'open' : ''}>
    <summary class="cursor-pointer font-semibold"><i class="fa-solid fa-comment-dots text-indigo-500"></i> Sobre como esse cliente anuncia ${a.destino ? tag(DESTINOS.find(([k]) => k === a.destino)[1], 'tag-info') : tag('destino não informado', 'tag-warn')}</summary>
    <div class="mt-3 space-y-3">
      <div class="rounded-lg border ${cliente.nicho ? 'border-slate-200' : 'border-amber-300 bg-amber-50'} p-2 text-sm" data-nicho-bloco>
        ${cliente.nicho ? `<p><b>Nicho:</b> ${esc(cliente.nicho)} <span class="hint !mt-0">(muda em Editar)</span></p>`
          : `<p class="font-semibold text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i> Falta o nicho. As análises só comparam com o mesmo nicho.</p>
            <div class="mt-1 flex flex-wrap gap-2"><input class="input !w-auto flex-1" data-nicho-input value="${esc(sug)}" placeholder="Ex.: Moda feminina"><button type="button" class="btn-primary btn-sm" data-salvar-nicho>Confirmar nicho</button></div>
            ${sug ? `<p class="hint">Sugerido pelo perfil/produtos: "${esc(sug)}". Confirme ou edite.</p>` : ''}`}
        <div class="mt-2 grid gap-2 sm:grid-cols-2"><label class="text-sm">Subnicho <span class="text-slate-500">(opcional)</span><input class="input mt-0.5" data-subnicho value="${esc(cliente.subnicho || '')}" placeholder="Ex.: moda feminina plus size"></label>
          <label class="text-sm">Nichos vizinhos <span class="text-slate-500">(opcional, separados por vírgula)</span><input class="input mt-0.5" data-vizinhos value="${esc(cliente.nichosVizinhos || '')}" placeholder="Só usados com rótulo, quando o nicho não tiver dado"></label></div></div>
      <div><div class="flex flex-wrap items-center justify-between gap-2"><label class="label !mb-0" for="como-texto">Conte do seu jeito</label>${temDitado() ? '<button type="button" class="btn-ghost btn-sm" data-ditar-como title="Falar em vez de digitar (o navegador transcreve)"><i class="fa-solid fa-microphone"></i> Ditar</button>' : ''}</div>
        <p class="hint !mt-0">${esc(LEGENDA_TEXTO)}</p>
        <textarea id="como-texto" class="input mt-1" rows="4" maxlength="3000" data-como-texto data-aviso-sair>${esc(a.texto)}</textarea>
        <div class="mt-1 flex flex-wrap items-center gap-2"><button type="button" class="btn-primary btn-sm" data-salvar-texto>Salvar texto</button>
          <button type="button" class="btn-ia btn-sm" data-extrair title="A IA lê o texto e preenche SÓ os campos vazios abaixo"><i class="fa-solid fa-wand-magic-sparkles"></i> Preencher os campos pelo texto</button>
          <span class="hint !mt-0" data-como-status>${a.atualizadoEm ? `Salvo em ${dataBR(a.atualizadoEm)}. Lido por criativos, campanhas e diagnóstico.` : 'Lido por criativos, campanhas e diagnóstico (um lugar só).'}</span></div></div>
      <div class="grid gap-3 sm:grid-cols-3" data-campos-como>
        <label class="text-sm">Destino de venda ${auto('destino')}<select class="input mt-0.5" data-campo="destino"><option value="">—</option>${opcoes(DESTINOS, a.destino)}</select></label>
        <label class="text-sm">Ticket médio (R$) ${auto('ticketMedio')}<input class="input mt-0.5" type="number" step="0.01" min="0" data-campo="ticketMedio" value="${esc(fmtNum(a.ticketMedio))}"></label>
        <label class="text-sm">Margem (%) <span class="text-slate-500">(opcional)</span> ${auto('margem')}<input class="input mt-0.5" type="number" step="0.1" min="0" max="99" data-campo="margem" value="${esc(fmtNum(a.margem))}"></label>
        <label class="text-sm">Verba mensal (R$) ${auto('verbaMensal')}<input class="input mt-0.5" type="number" step="1" min="0" data-campo="verbaMensal" value="${esc(fmtNum(a.verbaMensal))}"></label>
        <label class="text-sm">Atendimento no WhatsApp ${auto('atendimento')}<select class="input mt-0.5" data-campo="atendimento"><option value="">—</option>${opcoes(ATENDIMENTO, a.atendimento)}</select></label>
        <label class="text-sm">Quem atende ${auto('quemAtende')}<input class="input mt-0.5" data-campo="quemAtende" value="${esc(a.quemAtende)}" placeholder="Ex.: a dona, 1 vendedora"></label></div>
      <p class="hint">Campos com "${AVISO_AUTO}" vieram do texto pela IA: confira, edite ou clique em confirmar. A IA nunca muda um campo que você preencheu.</p></div></details>`;
}

// ---------- Frente 2 ----------
function perguntaHtml(p) {
  return `<li class="rounded border border-amber-300 bg-amber-50 p-2 text-sm" data-pergunta="${esc(p.id)}"><p class="font-medium">${esc(p.texto)}</p>
    <div class="mt-1 flex flex-wrap gap-1">${p.campo === 'registrar' ? '<a class="btn-primary btn-sm" data-ir-resultados>Registrar na aba Resultados</a>'
      : p.opcoes.map((o) => `<button type="button" class="btn-ghost btn-sm" data-responder="${esc(p.id)}" data-campo-resp="${esc(p.campo)}" data-valor="${esc(o)}">${esc(o)}</button>`).join('')}
    ${p.livre ? `<input class="input !w-40 !py-1 text-sm" data-livre="${esc(p.id)}" placeholder="ou digite"><button type="button" class="btn-primary btn-sm" data-responder-livre="${esc(p.id)}" data-campo-resp="${esc(p.campo)}">OK</button>` : ''}</div></li>`;
}

function recomendacaoHtml(a, { aplicados = [] } = {}) {
  const r = a.resultado || {};
  return `<div class="mt-3 rounded-lg border border-violet-200 bg-violet-50/30 p-3" data-recomendacao="${esc(a.id)}">
    <p class="text-xs text-slate-500">Análise de ${dataBR(a.criadoEm)} · ${a.origem === 'ia' ? 'com IA' : 'sem IA (regras do app)'}</p>
    ${r.resumo ? `<p class="mt-1 font-medium">${esc(r.resumo)}</p>` : ''}
    ${(r.diferencas || []).length || (r.mudancas || []).length ? `<div class="mt-2 rounded border border-sky-300 bg-sky-50 p-2 text-sm" data-o-que-mudou><p class="font-semibold"><i class="fa-solid fa-code-compare"></i> O que mudou desde a análise anterior</p>
      <ul class="ml-4 list-disc">${(r.diferencas || []).map((d) => `<li><b>${esc(d.campo)}:</b> ${esc(d.antes)} → ${esc(d.depois)}</li>`).join('')}${(r.mudancas || []).map((m) => `<li>${esc(m.oque)}${m.porque ? ` — <i>por quê:</i> ${esc(m.porque)}` : ''}</li>`).join('')}</ul></div>` : ''}
    ${(r.avisos || []).length ? `<ul class="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-avisos-analise>${r.avisos.map((x) => `<li data-aviso="${esc(x.id)}"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(x.texto)}</li>`).join('')}</ul>` : ''}
    ${(r.conflitos || []).length ? `<div class="mt-2 text-sm" data-conflitos><b>Quando as fontes discordaram:</b><ul class="ml-4 list-disc">${r.conflitos.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
    ${(r.perguntas || []).length ? `<div class="mt-2"><p class="text-sm font-semibold">Precisa de resposta</p><ul class="mt-1 space-y-1" data-perguntas-analise>${r.perguntas.map(perguntaHtml).join('')}</ul></div>` : ''}
    <ul class="mt-3 space-y-2">${(r.itens || []).map((it) => itemHtml(it, { jaAplicado: aplicados.includes(it.id) })).join('') || '<li class="hint">Nenhum item recomendado.</li>'}</ul>
    ${fontesUsadasHtml(r.fontesUsadas)}
    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-violet-200 pt-3"><button type="button" class="btn-primary" data-aplicar-aceitos="${esc(a.id)}"><i class="fa-solid fa-check"></i> Aplicar os itens aceitos</button>
      <span class="hint !mt-0">Estrutura aceita vira <b>rascunho de campanha</b> (abaixo); criativo aceito vira <b>brief</b> na aba Criativos (gera só quando você clicar); métrica e escala viram tarefa. Item não marcado não muda nada.</span></div></div>`;
}

function analisarHtml(cliente, { avisos, perguntas, pesquisa, ultima }) {
  const a = comoAnunciaDe(cliente);
  const palavras = a.palavrasBiblioteca?.length ? a.palavrasBiblioteca : palavrasPadrao(cliente);
  const fontesPesq = pesquisa ? [...(pesquisa.resultado?.praticas || []), ...(pesquisa.resultado?.benchmarks || [])] : [];
  return `<section class="card mb-5 border-violet-200" data-analisar-recomendar>
    <h3 class="font-semibold"><i class="fa-solid fa-chess-knight text-violet-600"></i> Analisar e recomendar</h3>
    <p class="caption mt-1">A IA lê o que você contou, produtos, oferta, Pixel e loja, criativos, resultados, documentos de referência, a pesquisa do nicho e os anúncios do nicho, e recomenda destino, estrutura, criativos, métricas e escala. Cada item diz por quê, de onde veio e o resultado esperado. Nada é aplicado sem você aceitar.</p>
    ${avisos.length ? `<ul class="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-avisos-destino>${avisos.map((x) => `<li data-aviso="${esc(x.id)}"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(x.texto)}</li>`).join('')}</ul>` : ''}
    ${perguntas.length ? `<div class="mt-2"><p class="text-sm font-semibold">Antes de analisar (precisa de resposta)</p><ul class="mt-1 space-y-1" data-perguntas>${perguntas.map(perguntaHtml).join('')}</ul></div>` : ''}
    <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn-ia" data-analisar ${cliente.nicho ? '' : 'disabled title="Confirme o nicho antes"'}><i class="fa-solid fa-wand-magic-sparkles"></i> Analisar e recomendar</button>
      <button type="button" class="btn-ghost" data-analisar-sem-ia title="Só regras e contas do app com os dados do cliente, na hora">Ver recomendação sem IA</button></div>
    <p class="hint">Com IA: 1 pesquisa web do nicho (guardada por 7 dias) + 1 análise, de 1 a 4 min. ${ultima ? `Última análise em ${dataBR(ultima.criadoEm)}: rode de novo depois de registrar resultados para ver o que mudou.` : ''}</p>
    <div class="mt-3 grid gap-3 md:grid-cols-2">
      <div class="rounded-lg border border-slate-200 p-2 text-sm" data-pesquisa-nicho><p class="font-semibold"><i class="fa-solid fa-globe"></i> Pesquisa web do nicho</p>
        ${pesquisa ? `<p class="text-xs">Feita em ${dataBR(pesquisa.pesquisadoEm)} (${esc(pesquisa.nicho)}${pesquisa.subnicho ? ` · ${esc(pesquisa.subnicho)}` : ''} · ${esc(DESTINOS.find(([k]) => k === pesquisa.destino)?.[1] || 'WhatsApp e site')}) · ${pesquisa.valida ? 'vale até 7 dias' : '<b>vencida</b>: a próxima análise pesquisa de novo'}${pesquisa.resultado?.noNicho === false ? ' · <span class="text-amber-800">sem dado específico do nicho</span>' : ''}</p>
          ${fontesPesq.length ? `<ul class="ml-4 mt-1 list-disc text-xs" data-fontes-pesquisa>${fontesPesq.map((x) => `<li><a class="text-indigo-600 underline" href="${esc(x.fonte.url)}" target="_blank" rel="noopener noreferrer">${esc(x.fonte.site)}</a> (${esc(x.fonte.data || 'sem data')})${x.fonte.desatualizada === true ? ' <span class="tag tag-warn">mais de 12 meses: pode estar desatualizada</span>' : ''}</li>`).join('')}</ul>` : '<p class="hint">Nenhuma fonte útil encontrada.</p>'}`
          : '<p class="hint">Ainda não pesquisado para este nicho e destino.</p>'}
        <button type="button" class="btn-ghost btn-sm mt-1" data-pesquisar-de-novo title="Faz uma busca nova agora (custa uma busca web)"><i class="fa-solid fa-rotate"></i> Pesquisar de novo</button></div>
      <div class="rounded-lg border border-slate-200 p-2 text-sm" data-biblioteca-nicho><p class="font-semibold"><i class="fa-brands fa-meta"></i> Anúncios do nicho (Biblioteca de Anúncios)</p>
        <p class="hint !mt-0">O app abre a Biblioteca filtrada (país ${esc(isoDoCliente(cliente))}, só anúncios ativos, palavras do nicho). Tire print dos anúncios que estão há mais tempo no ar e salve em <b>Referências → Cadastrar anúncio que encontrei</b> (com os dias no ar): a análise usa os do mesmo nicho.</p>
        <label class="mt-1 block text-xs">Palavras-chave (separe por vírgula)<input class="input mt-0.5" data-palavras value="${esc(palavras.join(', '))}"></label>
        <div class="mt-1 flex flex-wrap gap-2"><a class="btn-primary btn-sm" data-abrir-biblioteca href="${esc(urlBibliotecaAnuncios({ palavras, pais: isoDoCliente(cliente) }))}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-up-right-from-square"></i> Abrir Biblioteca de Anúncios do nicho</a>
          <button type="button" class="btn-ia btn-sm" data-sugerir-palavras><i class="fa-solid fa-wand-magic-sparkles"></i> Sugerir palavras (IA)</button>
          <a class="btn-ghost btn-sm" href="#/c/${esc(cliente.id)}/referencias">Ir para Referências</a></div></div></div>
    <div data-resultado-recomendacao></div>
    <details class="mt-3" data-historico-analises><summary class="cursor-pointer text-sm text-slate-600">Histórico de análises</summary><div class="mt-1 space-y-1" data-lista-analises></div></details></section>`;
}

function tarefasHtml(tarefas) {
  const abertas = tarefas.filter((t) => t.status !== 'feita' && t.tipo !== 'brief_criativo');
  const briefs = tarefas.filter((t) => t.status !== 'feita' && t.tipo === 'brief_criativo');
  if (!abertas.length && !briefs.length) return '<div data-tarefas-anuncio></div>';
  const area = { whatsapp: 'WhatsApp', site: 'Site', campanha: 'Campanha', criativo: 'Criativo' };
  return `<section class="card mb-5" data-tarefas-anuncio><h3 class="font-semibold"><i class="fa-solid fa-list-check text-emerald-600"></i> Tarefas aceitas</h3>
    ${abertas.length ? `<ul class="mt-2 space-y-1">${abertas.map((t) => `<li class="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-200 p-2 text-sm" data-tarefa="${esc(t.id)}"><div class="min-w-0"><p>${tag(area[t.area] || t.area, t.area === 'site' ? 'tag-info' : '')} <b>${esc(t.titulo)}</b>${t.passoSite ? ` <span class="hint !mt-0">(também no "Montar site", passo ${esc(t.passoSite)})</span>` : ''}</p>${t.texto ? `<p class="text-xs text-slate-600">${esc(t.texto)}</p>` : ''}${t.medir ? `<p class="text-xs">Medir: ${esc(t.medir)}</p>` : ''}</div>
      <button type="button" class="btn-ghost btn-sm" data-tarefa-feita="${esc(t.id)}"><i class="fa-solid fa-check"></i> Feito</button></li>`).join('')}</ul>` : ''}
    ${briefs.length ? `<p class="mt-2 text-sm">${briefs.length} brief(s) de criativo esperando na aba <a class="text-indigo-600 underline" href="#/c/${esc(briefs[0].clienteId)}/criativos">Criativos</a> (gera só quando você clicar).</p>` : ''}</section>`;
}

/**
 * Monta a área no topo da aba Campanhas. `aoMudar` redesenha a aba (ex.: rascunho criado pela recomendação).
 */
export async function montarAreaAnuncio(alvo, { cliente, produtos = [], aoMudar = () => {} }) {
  // Nó novo a cada desenho: os ouvintes do desenho anterior saem junto (senão cada clique rodaria duas vezes).
  const el = document.createElement('div');
  const [ctx, pesquisa, tarefas] = await Promise.all([carregarContexto(cliente), pesquisaEmCache(cliente), db.listar(COL.tarefas, { clienteId: cliente.id }).catch(() => [])]);
  const fontes = montarFontes(ctx);
  const analises = ctx.analises.filter((a) => a.tipo === 'recomendacao').sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  const ultima = analises[0] || null;
  alvo.replaceChildren(el);
  el.innerHTML = comoAnunciaHtml(cliente, produtos) + analisarHtml(cliente, { avisos: fontes.avisos, perguntas: fontes.perguntas, pesquisa, ultima }) + tarefasHtml(tarefas) + '<div data-prints-resultado></div>';
  montarPrintsResultado($('[data-prints-resultado]', el), { cliente, aoMudar: () => redesenhar() });
  const redesenhar = () => montarAreaAnuncio(alvo, { cliente, produtos, aoMudar });
  const alvoRec = () => $('[data-resultado-recomendacao]', el);
  const aplicadosDe = (a) => a?.aceitos || [];
  const mostrarAnalise = (a) => { alvoRec().innerHTML = recomendacaoHtml(a, { aplicados: aplicadosDe(a) }); };
  const desenharHistorico = () => { $('[data-lista-analises]', el).innerHTML = analises.length ? analises.map((a) => `<button type="button" class="btn-ghost btn-sm w-full text-left" data-ver-analise="${esc(a.id)}">${dataBR(a.criadoEm)} · ${a.origem === 'ia' ? 'com IA' : 'sem IA'}${(a.aceitos || []).length ? ` · ${a.aceitos.length} item(ns) aplicado(s)` : ''}</button>`).join('') : '<p class="hint">Nenhuma análise ainda.</p>'; };
  if (ultima) mostrarAnalise(ultima);
  desenharHistorico();

  // ----- Frente 1: texto, ditado, campos e nicho -----
  const status = (t) => { const s = $('[data-como-status]', el); if (s) s.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600"></i> ${esc(t)}`; };
  on(el, 'click', '[data-salvar-texto]', (b) => ocupado(b, async () => { await salvarComo(cliente, { texto: $('[data-como-texto]', el).value.trim() }); $('[data-como-texto]', el).defaultValue = $('[data-como-texto]', el).value; status('Texto salvo. Vale para criativos, campanhas e diagnóstico.'); toast('Texto salvo.'); }));
  on(el, 'change', '[data-como-texto]', async (t) => { await salvarComo(cliente, { texto: t.value.trim() }); t.defaultValue = t.value; status('Texto salvo.'); });
  on(el, 'click', '[data-extrair]', (b) => ocupado(b, async () => {
    const texto = $('[data-como-texto]', el).value.trim();
    if (!texto) throw new Error('Escreva (ou dite) como o cliente anuncia antes de preencher os campos.');
    await salvarComo(cliente, { texto });
    const sugeridos = await extrairCamposAnuncio({ cliente, texto });
    const { patch, preenchidos } = preencherVazios(comoAnunciaDe(cliente), sugeridos);
    if (preenchidos.length) await salvarComo(cliente, patch);
    await redesenhar();
    const caixa = $('[data-campos-como]', el);
    mostrarResultado(caixa, preenchidos.length ? `Preenchidos pelo texto: ${preenchidos.map((k) => CAMPOS_ANUNCIO.find(([c]) => c === k)?.[1] || 'Quem atende').join(', ')}. Confira e confirme.` : 'Nenhum campo vazio pôde ser preenchido pelo texto (os já preenchidos não mudam).');
  }));
  on(el, 'change', '[data-campo]', async (i) => {
    const k = i.dataset.campo;
    const v = ['ticketMedio', 'margem', 'verbaMensal'].includes(k) ? numeroBR(i.value) : i.value.trim();
    const norm = k === 'quemAtende' ? v : normalizarCamposAnuncio({ [k]: v })[k];
    const auto = { ...(comoAnunciaDe(cliente).auto || {}) }; delete auto[k]; // editar = confirmar
    await salvarComo(cliente, { [k]: norm ?? null, auto });
    $(`[data-auto="${k}"]`, el)?.parentElement?.querySelector('[data-confirmar-campo]')?.remove(); $(`[data-auto="${k}"]`, el)?.remove();
    toast('Campo salvo.');
  });
  on(el, 'click', '[data-confirmar-campo]', async (b) => { const auto = { ...(comoAnunciaDe(cliente).auto || {}) }; delete auto[b.dataset.confirmarCampo]; await salvarComo(cliente, { auto }); $(`[data-auto="${b.dataset.confirmarCampo}"]`, el)?.remove(); b.remove(); toast('Confirmado.'); });
  on(el, 'click', '[data-salvar-nicho]', (b) => ocupado(b, async () => {
    const v = $('[data-nicho-input]', el).value.trim();
    if (!v) throw new Error('Escreva o nicho.');
    await db.atualizar(COL.clientes, cliente.id, { nicho: v }); cliente.nicho = v;
    toast('Nicho confirmado.'); aoMudar();
  }));
  on(el, 'change', '[data-subnicho], [data-vizinhos]', async (i) => {
    const campo = i.matches('[data-subnicho]') ? 'subnicho' : 'nichosVizinhos';
    await db.atualizar(COL.clientes, cliente.id, { [campo]: i.value.trim() }, { silencioso: true }); cliente[campo] = i.value.trim();
    toast(campo === 'subnicho' ? 'Subnicho salvo.' : 'Nichos vizinhos salvos.');
  });
  on(el, 'click', '[data-ditar-como]', (b) => {
    const campo = $('[data-como-texto]', el); const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!campo || !R) return;
    if (b._rec) { b._rec.stop(); return; }
    const rec = new R(); rec.lang = 'pt-BR'; rec.interimResults = false; rec.continuous = true; b._rec = rec;
    rec.onresult = (ev) => { const novo = [...ev.results].slice(ev.resultIndex).map((r) => r[0].transcript).join(' ').trim(); if (novo) campo.value = `${campo.value.trim()} ${novo}`.trim(); };
    rec.onend = () => { b._rec = null; b.innerHTML = '<i class="fa-solid fa-microphone"></i> Ditar'; campo.dispatchEvent(new Event('change', { bubbles: true })); };
    rec.onerror = (ev) => toast(ev.error === 'not-allowed' ? 'O navegador não liberou o microfone. Permita o microfone para este site e tente de novo.' : `O ditado parou (${ev.error}). Tente de novo ou digite.`, 'erro');
    rec.start(); b.innerHTML = '<i class="fa-solid fa-stop"></i> Parar';
  });

  // ----- perguntas -----
  const responder = async (id, campo, valor) => {
    if (campo === 'nicho') { await db.atualizar(COL.clientes, cliente.id, { nicho: valor }); cliente.nicho = valor; }
    else if (campo === 'destino') await salvarComo(cliente, { destino: normalizarCamposAnuncio({ destino: valor }).destino });
    else if (['ticketMedio', 'verbaMensal'].includes(campo)) await salvarComo(cliente, { [campo]: VALOR_OPCAO[valor] ?? numeroBR(valor) });
    else await salvarComo(cliente, { texto: `${comoAnunciaDe(cliente).texto || ''}\n${$(`[data-pergunta="${id}"] p`, el)?.textContent || 'Pergunta'} ${valor}`.trim() }); // pergunta da IA: a resposta entra no texto (fonte única)
    toast('Resposta salva: vale para a próxima análise.');
    await redesenhar();
  };
  on(el, 'click', '[data-responder]', (b) => responder(b.dataset.responder, b.dataset.campoResp, b.dataset.valor));
  on(el, 'click', '[data-responder-livre]', (b) => { const v = $(`[data-livre="${b.dataset.responderLivre}"]`, el)?.value.trim(); if (v) responder(b.dataset.responderLivre, b.dataset.campoResp, v); });
  on(el, 'click', '[data-ir-resultados]', () => { location.hash = `#/c/${cliente.id}/resultados`; });

  // ----- Biblioteca de Anúncios -----
  const atualizarLink = () => { const p = limparPalavras($('[data-palavras]', el).value); $('[data-abrir-biblioteca]', el).href = urlBibliotecaAnuncios({ palavras: p, pais: isoDoCliente(cliente) }); return p; };
  on(el, 'input', '[data-palavras]', atualizarLink);
  on(el, 'change', '[data-palavras]', async () => { await salvarComo(cliente, { palavrasBiblioteca: atualizarLink() }); });
  on(el, 'click', '[data-sugerir-palavras]', (b) => ocupado(b, async () => {
    const p = await sugerirPalavrasBiblioteca({ cliente });
    if (!p.length) throw new Error('A IA não sugeriu palavras. Edite as palavras à mão.');
    $('[data-palavras]', el).value = p.join(', '); await salvarComo(cliente, { palavrasBiblioteca: atualizarLink() });
    mostrarResultado($('[data-biblioteca-nicho]', el), 'Palavras sugeridas. Edite se quiser e abra a Biblioteca.');
  }));

  // ----- análise -----
  const rodar = (b, opts) => ocupado(b, async () => {
    const { analise } = await analisarERecomendar(cliente, opts);
    analises.unshift(analise); desenharHistorico(); mostrarAnalise(analise);
    mostrarResultado(alvoRec(), `Pronto: recomendação ${opts.semIA ? 'sem IA' : 'com IA'} abaixo. Marque o que aceita e clique em "Aplicar os itens aceitos".`);
  });
  on(el, 'click', '[data-analisar]', (b) => rodar(b, { semIA: false }));
  on(el, 'click', '[data-analisar-sem-ia]', (b) => rodar(b, { semIA: true }));
  on(el, 'click', '[data-pesquisar-de-novo]', (b) => ocupado(b, async () => {
    if (!cliente.nicho) throw new Error('Confirme o nicho antes de pesquisar.');
    await obterPesquisa(cliente, { forcar: true });
    await redesenhar();
    mostrarResultado($('[data-pesquisa-nicho]', el), 'Pesquisa do nicho feita de novo (custo em Configurações > Custos de IA).');
  }));
  on(el, 'click', '[data-ver-analise]', (b) => { const a = analises.find((x) => x.id === b.dataset.verAnalise); if (a) { mostrarAnalise(a); alvoRec().scrollIntoView({ block: 'start' }); } });
  on(el, 'click', '[data-aplicar-aceitos]', (b) => ocupado(b, async () => {
    const a = analises.find((x) => x.id === b.dataset.aplicarAceitos); if (!a) return;
    const marcados = [...el.querySelectorAll(`[data-recomendacao="${a.id}"] [data-aceitar]:checked:not(:disabled)`)].map((c) => c.dataset.aceitar);
    if (!marcados.length) throw new Error('Marque pelo menos um item para aplicar (nada é aplicado sem você aceitar).');
    const r = aplicarAceitos(a.resultado, marcados, { clienteId: cliente.id, analiseId: a.id, urlSite: ctx.site?.linkPublicado || '' });
    if (!(await confirmar(`Aplicar ${marcados.length} item(ns)? ${r.campanha ? 'Cria 1 rascunho de campanha. ' : ''}${r.briefs.length ? `Cria ${r.briefs.length} brief(s) de criativo. ` : ''}${r.tarefas.length ? `Cria ${r.tarefas.length} tarefa(s).` : ''}`, 'Aplicar'))) return;
    if (r.campanha) await db.criar(COL.campanhas, r.campanha);
    for (const t of [...r.briefs, ...r.tarefas]) await db.criar(COL.tarefas, t);
    a.aceitos = [...new Set([...(a.aceitos || []), ...marcados])];
    await db.atualizar(COL.analises, a.id, { aceitos: a.aceitos, aplicadoEm: new Date().toISOString() });
    toast(`Aplicado: ${[r.campanha && 'rascunho de campanha', r.briefs.length && `${r.briefs.length} brief(s)`, r.tarefas.length && `${r.tarefas.length} tarefa(s)`].filter(Boolean).join(', ')}.`);
    aoMudar();
    mostrarResultado('[data-rascunhos-campanha], [data-tarefas-anuncio]', r.campanha ? 'Rascunho de campanha criado: abra, confira e confirme.' : 'Itens aplicados.');
  }));
  on(el, 'click', '[data-tarefa-feita]', async (b) => { await db.atualizar(COL.tarefas, b.dataset.tarefaFeita, { status: 'feita', feitaEm: new Date().toISOString() }); b.closest('[data-tarefa]')?.remove(); toast('Tarefa marcada como feita.'); });
}
