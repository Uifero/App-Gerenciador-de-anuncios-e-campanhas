// "Apontar no site" (passo 4, na prévia): o operador liga o modo, toca num elemento e escolhe o que fazer. O que é
// mecânico (tirar, espaço, tamanho, ordem, foto, texto digitado) vira operação SEM IA na fila do "Antes × Depois" de
// "Ajustar este site"; "Outro: escrever" e "a IA sugere" vão para o ajuste por seção (só a seção do elemento). Nada vai
// para o site antes de "Aplicar". No pacote, espaço, tamanho e "Adicionar abaixo" são do tema: viram itens do
// "Ajustar no tema" no passo 6. Regras e ids: lib/elementos-site.js; script da prévia: lib/apontar-site.js.
import { esc, $, on, toast, ocupado, confirmar, mostrarResultado } from '../core/ui.js';
import { comApontar } from '../lib/apontar-site.js';
import { operacoesDaAcao, textoAtual, temFoto, ehSecao, ehLegal, secaoDoElemento, nomeElemento, TIPOS_EXTRA, MOTIVO_LEGAL } from '../lib/elementos-site.js';

const RE_ESTRUTURA = /\b(layout|estrutura|colunas?|grade|disposi|lado a lado|ordem|posi[cç][aã]o)\b/i;
let ouvinteAtual = null; // um ouvinte de mensagens por vez (a tela é redesenhada a cada mudança)

export const barraApontarHtml = () => `<div class="mt-2 flex flex-wrap items-center gap-2" data-barra-apontar>
  <button type="button" class="btn-primary min-h-[44px]" data-apontar aria-pressed="false"><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i> Apontar no site</button>
  <span class="hint !mt-0" aria-live="polite" data-status-apontar>Ligue e toque em um elemento da prévia para mudar só ele.</span>
  <span data-fila-apontar></span></div>`;

const BOTOES = [
  ['tirar', 'trash-can', 'Tirar daqui'], ['texto', 'pen', 'Mudar o texto'], ['junto', 'compress', 'Mais junto'], ['separado', 'expand', 'Mais separado'],
  ['maior', 'magnifying-glass-plus', 'Maior'], ['menor', 'magnifying-glass-minus', 'Menor'], ['subir', 'arrow-up', 'Subir'], ['descer', 'arrow-down', 'Descer'],
  ['foto', 'image', 'Trocar foto'], ['adicionar', 'plus', 'Adicionar abaixo'], ['outro', 'comment-dots', 'Outro: escrever'],
];
const NOME_ACAO = Object.fromEntries(BOTOES.map(([k, , t]) => [k, t]));

/**
 * ctx: { modo, cliente, produtos, iframe() (a prévia), htmlBase(estado) (HTML da prévia para um estado), api() (o de
 * "Ajustar este site": proporOperacoes, prepararSugestao, estadoParaPrevia, dadosLojaAtuais, mudancasNaFila, materiais),
 * site(), salvarSite(patch) }. Devolve { destacar(id) } (o "Entendi assim" do print mostra o elemento na prévia).
 */
export function ligarApontar(alvo, ctx) {
  const pac = ctx.modo === 'pacote';
  let ativo = false, sel = null, destacarDepois = null;
  const fr = () => ctx.iframe();
  const barra = () => $('[data-barra-apontar]', alvo);
  const post = (msg) => fr()?.contentWindow?.postMessage(msg, '*');
  const estado = () => ctx.api()?.estadoParaPrevia?.() || {};

  function recarregar(destacar = null) {
    const f = fr(); if (!f) return;
    const html = ctx.htmlBase(estado());
    if (pac) f.setAttribute('sandbox', ativo || destacar ? 'allow-scripts' : ''); // a prévia do pacote só ganha script com o modo ligado
    destacarDepois = destacar;
    f.srcdoc = ativo || destacar ? comApontar(html) : html;
  }
  // Aviso na própria barra (sem barra fixa por cima do menu no celular).
  const statusBarra = (t) => { const st = $('[data-status-apontar]', alvo); if (st) { st.textContent = t; st.className = 'rounded bg-emerald-50 px-2 py-1 text-sm text-emerald-800'; } };
  function fila() {
    const n = ctx.api()?.mudancasNaFila?.() || 0, el = $('[data-fila-apontar]', alvo); if (!el) return;
    el.innerHTML = n ? `<button type="button" class="btn-ghost min-h-[44px]" data-ver-fila><i class="fa-solid fa-code-compare" aria-hidden="true"></i> Ver Antes × Depois (${n})</button>` : '';
  }
  function ligar(v) {
    ativo = v;
    const b = $('[data-apontar]', alvo);
    if (b) { b.setAttribute('aria-pressed', String(v)); b.innerHTML = v ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Parar de apontar' : '<i class="fa-solid fa-hand-pointer" aria-hidden="true"></i> Apontar no site'; }
    const st = $('[data-status-apontar]', alvo);
    if (st) st.textContent = v ? 'Toque em um elemento da prévia. Toque fora dele para cancelar.' : 'Ligue e toque em um elemento da prévia para mudar só ele.';
    if (!v) fecharMenu();
    recarregar();
    fila();
  }

  // ---------- menu do elemento ----------
  function fecharMenu() { $('[data-menu-elemento]', document)?.remove(); sel = null; post({ tipo: 'gcc-limpar' }); }
  function menuHtml() {
    const est = estado(), id = sel.id;
    const secao = ehSecao(id);
    const temTxt = !secao && textoAtual(id, { estado: est, dadosLoja: ctx.api()?.dadosLojaAtuais?.() || {}, modo: ctx.modo }) !== null;
    // Item legal (CNPJ, contato, políticas, selo, carrinho): sem "Tirar daqui"; o aviso no topo do menu explica o motivo.
    const mostra = (k) => ({
      tirar: !ehLegal(id), texto: temTxt, junto: true, separado: true, maior: !secao, menor: !secao, subir: true, descer: true,
      foto: !secao && temFoto(id), adicionar: !(ehLegal(id) && !secao), outro: true,
    }[k]);
    const legal = ehLegal(id);
    return `<div class="fixed inset-x-0 bottom-0 z-40 max-h-[72vh] overflow-y-auto rounded-t-xl border border-slate-200 bg-white p-3 shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[440px] sm:rounded-xl" role="dialog" aria-modal="false" aria-labelledby="menu-el-titulo" data-menu-elemento="${esc(id)}">
      <div class="flex items-start gap-2"><p class="min-w-0 flex-1 text-sm font-semibold" id="menu-el-titulo"><i class="fa-solid fa-crosshairs text-rose-600" aria-hidden="true"></i> ${esc(sel.nome || nomeElemento(id, { layout: est.layout, estado: est }))}</p>
        <button type="button" class="btn-ghost btn-sm min-h-[44px] min-w-[44px]" data-fechar-menu aria-label="Fechar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
      ${legal ? `<p class="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-800" data-aviso-legal><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Item legal: ${esc(MOTIVO_LEGAL)}</p>` : ''}
      ${pac ? '<p class="mt-1 text-xs text-slate-600">Pacote: espaço, tamanho e acréscimos são do tema da plataforma; esses pedidos ficam anotados no passo 6.</p>' : ''}
      <div class="mt-2 grid grid-cols-2 gap-2" data-acoes-elemento>${BOTOES.filter(([k]) => mostra(k)).map(([k, ic, t]) => `<button type="button" class="btn-ghost btn-sm min-h-[44px] justify-start" data-acao-el="${k}"><i class="fa-solid fa-${ic}" aria-hidden="true"></i> ${t}</button>`).join('')}</div>
      <div class="mt-2" data-menu-form></div>
      <p class="mt-2 text-sm" aria-live="polite" data-menu-msg></p></div>`;
  }
  function abrirMenu() {
    $('[data-menu-elemento]', document)?.remove();
    // a barra de resultado (fixa, por cima de tudo) cobriria os botões do menu no celular: sai ao abrir o menu
    document.querySelectorAll('[data-status-resultado]').forEach((e) => e.closest('.fixed')?.remove() || e.remove());
    document.body.insertAdjacentHTML('beforeend', menuHtml());
    const el = $('[data-menu-elemento]', document);
    ligarMenu(el);
    $('[data-acao-el]', el)?.focus({ preventScroll: true });
  }
  const msg = (texto, tipo = 'ok') => {
    const el = $('[data-menu-msg]', document); if (!el) return;
    el.className = `mt-2 rounded p-2 text-sm ${tipo === 'ok' ? 'bg-emerald-50 text-emerald-800' : tipo === 'tema' ? 'bg-sky-50 text-slate-800' : 'bg-amber-50 text-amber-800'}`;
    el.innerHTML = texto;
  };
  const form = (html) => { const el = $('[data-menu-form]', document); if (el) { el.innerHTML = html; el.querySelector('input,textarea,select,button')?.focus(); } };

  async function registrarTema(t) {
    const lista = ctx.site()?.ajustesTema || [];
    await ctx.salvarSite({ ajustesTema: [...lista, { id: `t${Date.now().toString(36)}`, ...t, feito: false, em: new Date().toISOString() }].slice(-60) });
    msg('<i class="fa-solid fa-paintbrush" aria-hidden="true"></i> <b>Isso é do tema: anotei no passo 6</b> ("Ajustar no tema", em "Subir na plataforma").', 'tema');
    toast('Isso é do tema: anotei no passo 6.', 'info');
  }
  async function executar(acao, valor = null) {
    const api = ctx.api(); if (!api || !sel) return;
    const est = estado();
    const r = operacoesDaAcao(acao, sel.id, valor, { estado: est, modo: ctx.modo, materiais: api.materiais?.() || [], produtos: ctx.produtos, dadosLoja: api.dadosLojaAtuais?.(), produtoId: sel.produto, irmaos: sel.irmaos || [] });
    if (r.recusa) return msg(`<i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${esc(r.recusa)}`, 'aviso');
    if (r.tema) return registrarTema(r.tema);
    if (r.confirmar && !(await confirmar(r.confirmar, 'Tirar mesmo assim'))) return msg('Nada mudou.', 'aviso');
    const res = await api.proporOperacoes(r.ops, { fonte: 'apontar', pedido: `${sel.nome}: ${NOME_ACAO[acao]}` }, { rolar: false });
    if (!res.ok) return msg(`<i class="fa-solid fa-circle-info" aria-hidden="true"></i> Não deu: ${esc(res.motivo)}`, 'aviso');
    const id = sel.id, saiu = acao === 'tirar';
    recarregar(saiu ? null : id);
    fila();
    if (saiu) { fecharMenu(); statusBarra(`Na fila: ${res.n} mudança(s). Nada mudou no site ainda: veja e aplique em "Ver Antes × Depois".`); return; }
    form('');
    msg(`<i class="fa-solid fa-check" aria-hidden="true"></i> Na fila: ${res.n} mudança(s). A prévia já mostra; nada mudou no site até "Aplicar".`);
  }

  // ---------- formulários curtos ----------
  const FOTOS = () => (ctx.api()?.materiais?.() || []).filter((m) => m.codigo && /^image\//.test(m.tipo || 'image/'));
  function formTexto() {
    const atual = textoAtual(sel.id, { estado: estado(), dadosLoja: ctx.api()?.dadosLojaAtuais?.() || {}, modo: ctx.modo });
    if (atual && typeof atual === 'object') return form(`<form class="space-y-2" data-form-el="texto"><label class="label" for="el-p">Pergunta</label><input id="el-p" class="input" name="p" value="${esc(atual.p)}" maxlength="200">
      <label class="label" for="el-r">Resposta</label><textarea id="el-r" class="input" name="r" rows="3" maxlength="600">${esc(atual.r)}</textarea>
      <button class="btn-primary min-h-[44px]" type="submit">Pôr na fila</button></form>`);
    return form(`<form class="space-y-2" data-form-el="texto"><label class="label" for="el-texto">Texto novo</label><textarea id="el-texto" class="input" name="texto" rows="3" maxlength="3000">${esc(atual || sel.texto || '')}</textarea>
      <p class="hint">Você escreve: entra exatamente assim (sem IA).${ehLegal(sel.id) ? ' Item legal: pode mudar o texto, não pode ficar vazio.' : ''}</p><button class="btn-primary min-h-[44px]" type="submit">Pôr na fila</button></form>`);
  }
  function formFoto() {
    const fotos = FOTOS();
    form(fotos.length ? `<p class="text-xs font-semibold">Escolha a foto (vira escolha sua no "Usar em")</p><div class="mt-1 grid grid-cols-4 gap-2" data-fotos-trocar>${fotos.map((m) => `<button type="button" class="relative min-h-[44px] overflow-hidden rounded border border-slate-200" data-trocar-para="${esc(m.codigo)}" aria-label="Usar ${esc(m.codigo)}"><img src="${esc(m.url)}" alt="" class="h-16 w-full object-cover"><span class="absolute left-0.5 top-0.5 rounded px-1 text-[11px] font-bold" style="background:rgba(0,0,0,.78);color:#fff">${esc(m.codigo)}</span></button>`).join('')}</div>`
      : '<p class="hint">Sem fotos com código nos Materiais do cliente (passo 2).</p>');
  }
  function formOutro() {
    form(`<form class="space-y-2" data-form-el="outro"><label class="label" for="el-outro">O que quer neste elemento?</label><textarea id="el-outro" class="input" name="texto" rows="3" maxlength="600" placeholder="Ex.: deixa esse texto mais curto e direto"></textarea>
      <p class="hint">Vai só a seção dele para a IA; antes, o "Entendi assim" mostra o custo. Nada muda antes de "Aplicar".</p><button class="btn-ia min-h-[44px]" type="submit">Ver o que vai mudar</button></form>`);
  }
  function formAdicionar() {
    const fotos = FOTOS();
    form(`<form class="space-y-2" data-form-el="adicionar"><label class="label" for="el-tipo">O que acrescentar abaixo</label>
      <select id="el-tipo" class="input" name="tipo">${Object.entries(TIPOS_EXTRA).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <div data-campos-extra><label class="label" for="el-extra-texto">Texto</label><textarea id="el-extra-texto" class="input" name="texto" rows="2" maxlength="600"></textarea>
        <label class="mt-1 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="ia" class="h-4 w-4"> A IA sugere o texto (você escolhe a versão: sugerida ou segura)</label></div>
      <div data-campos-pergunta hidden><label class="label" for="el-ap">Pergunta</label><input id="el-ap" class="input" name="p" maxlength="200"><label class="label" for="el-ar">Resposta</label><textarea id="el-ar" class="input" name="r" rows="2" maxlength="600"></textarea><p class="hint">Pergunta e resposta escritas por você (a IA não inventa resposta).</p></div>
      <div data-campos-foto hidden><label class="label" for="el-afoto">Foto</label><select id="el-afoto" class="input" name="codigo">${fotos.map((m) => `<option value="${esc(m.codigo)}">${esc(m.codigo)}${m.nomeOriginal ? ` · ${esc(m.nomeOriginal)}` : ''}</option>`).join('')}</select></div>
      <button class="btn-primary min-h-[44px]" type="submit">Pôr na fila</button></form>`);
  }

  // ---------- eventos ----------
  on(alvo, 'click', '[data-apontar]', () => ligar(!ativo));
  on(alvo, 'click', '[data-ver-fila]', () => { const r = $('[data-rascunho]', document); if (r) mostrarResultado(r, 'Antes × Depois: confira e clique em "Aplicar".'); });
  // Eventos do menu: ligados no próprio menu (ele é recriado a cada elemento tocado).
  function ligarMenu(menu) {
  on(menu, 'click', '[data-fechar-menu]', () => fecharMenu());
  menu.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { fecharMenu(); $('[data-apontar]', alvo)?.focus(); } });
  on(menu, 'click', '[data-acao-el]', (b) => {
    const a = b.dataset.acaoEl;
    if (a === 'texto') return formTexto();
    if (a === 'foto') return formFoto();
    if (a === 'outro') return formOutro();
    if (a === 'adicionar') return formAdicionar();
    return ocupado(b, () => executar(a));
  });
  on(menu, 'click', '[data-trocar-para]', (b) => ocupado(b, () => executar('foto', b.dataset.trocarPara)));
  on(menu, 'change', '[data-form-el="adicionar"] [name=tipo]', (s) => {
    const f = s.form;
    f.querySelector('[data-campos-extra]').hidden = s.value === 'pergunta' || s.value === 'foto';
    f.querySelector('[data-campos-pergunta]').hidden = s.value !== 'pergunta';
    f.querySelector('[data-campos-foto]').hidden = s.value !== 'foto';
  });
  on(menu, 'submit', '[data-form-el]', (f, ev) => {
    ev.preventDefault();
    const tipo = f.dataset.formEl, dados = Object.fromEntries(new FormData(f));
    const botao = f.querySelector('[type=submit]');
    if (tipo === 'texto') return ocupado(botao, () => executar('texto', 'p' in dados ? { p: dados.p, r: dados.r } : dados.texto));
    if (tipo === 'outro' || (tipo === 'adicionar' && dados.ia && !['pergunta', 'foto'].includes(dados.tipo))) {
      const texto = String(dados.texto || '').trim();
      if (tipo === 'outro' && !texto) return msg('Escreva o que quer neste elemento.', 'aviso');
      const id = sel.id, nome = sel.nome, secao = secaoDoElemento(id, estado().layout);
      const instrucao = tipo === 'outro'
        ? `No elemento "${nome}" (id ${id}): ${texto}`
        : `Acrescente logo abaixo de "${nome}" (apos: ${id}) um ${TIPOS_EXTRA[dados.tipo]}${texto ? ` sobre: ${texto}` : ''}. Use {"op":"extra","acao":"adicionar","apos":"${id}","tipo":"${dados.tipo}","texto":..., "segura":...}. Só com fatos do cliente; nunca invente número, prova ou promessa.`;
      return ocupado(botao, async () => {
        fecharMenu();
        await ctx.api().prepararSugestao({ fonte: 'apontar', secoes: [secao], elementos: [id], oque: tipo === 'outro' ? `${nome}: ${texto}` : `${nome}: acrescentar ${TIPOS_EXTRA[dados.tipo]} abaixo (a IA sugere)`, instrucao, estrutura: RE_ESTRUTURA.test(texto) });
      });
    }
    return ocupado(botao, () => executar('adicionar', dados));
  });
  }
  // Mensagens da prévia (iframe sandbox: confere que veio da prévia certa).
  if (ouvinteAtual) window.removeEventListener('message', ouvinteAtual);
  ouvinteAtual = (e) => {
    if (!alvo.isConnected) { window.removeEventListener('message', ouvinteAtual); ouvinteAtual = null; return; }
    if (e.source !== fr()?.contentWindow) return;
    const d = e.data || {};
    if (d.tipo === 'gcc-pronto') { if (ativo) post({ tipo: 'gcc-modo', ativo: true }); if (destacarDepois) { post({ tipo: 'gcc-destacar', id: destacarDepois }); destacarDepois = null; } }
    if (d.tipo === 'gcc-apontado' && ativo) { sel = d; abrirMenu(); }
    if (d.tipo === 'gcc-cancelar') fecharMenu();
  };
  window.addEventListener('message', ouvinteAtual);
  fila();
  return {
    destacar(id) { ativo || ligar(true); recarregar(id); fr()?.scrollIntoView({ block: 'center' }); },
    atualizar() { recarregar(); fila(); },
  };
}
