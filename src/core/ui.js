// Utilitários de interface compartilhados pelos módulos.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Delegação de eventos: on(root, 'click', '[data-act]', (el, ev) => ...) */
export function on(root, evento, seletor, fn) {
  root.addEventListener(evento, (ev) => {
    const el = ev.target.closest(seletor);
    if (el && root.contains(el)) fn(el, ev);
  });
}

/**
 * Renderiza `fn(root, recarregar)` num nó novo dentro de `el`. Chamar `recarregar()` descarta o nó
 * (e seus listeners) e monta de novo — evita listeners duplicados entre renderizações.
 */
export function montar(el, fn) {
  const recarregar = async () => {
    const root = document.createElement('div');
    // Segura a altura atual enquanto a aba é redesenhada: sem isso a página fica vazia por um instante e o navegador
    // volta ao topo (o operador perdia de vista o que acabou de gerar).
    const altura = el.offsetHeight; if (altura) el.style.minHeight = `${altura}px`;
    el.replaceChildren(root);
    try { await fn(root, recarregar); } finally { el.style.minHeight = ''; aplicarResultadoPendente(); }
  };
  return recarregar();
}

// ---------- resultado visível e status que não some ----------
// Regra do app: depois de qualquer geração ou leitura, o resultado fica visível sem o operador procurar — rolar até
// ele, destacar, status que não some (até a pessoa mudar de tela ou fechar) e erro que não some (até fechar).
let pendente = null;
const DESTAQUE = ['ring-4', 'ring-emerald-300', 'ring-offset-2', 'transition-shadow'];

function barraStatus(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'fixed inset-x-4 bottom-4 z-[101] sm:inset-x-auto sm:right-4 sm:w-[28rem]';
    document.body.appendChild(el);
  }
  return el;
}
const fecharBarra = (id) => document.getElementById(id)?.replaceChildren();

/** Rola até `alvo` (elemento ou seletor), destaca por 2,5 s e mostra "Pronto: resultado abaixo" com "Ver resultado". */
export function mostrarResultado(alvo, texto = 'Pronto: resultado abaixo.') {
  // Seletor = algo que a aba ainda vai redesenhar (recarregar): aplica quando o redesenho terminar (montar), ou em 1,5 s.
  if (typeof alvo === 'string') { pendente = { alvo, texto }; setTimeout(aplicarResultadoPendente, 1500); return; }
  if (alvo) aplicarResultado(alvo, texto);
}
function aplicarResultadoPendente() {
  if (!pendente) return;
  const el = document.querySelector(pendente.alvo); if (!el) return;
  const { texto } = pendente; pendente = null;
  aplicarResultado(el, texto);
}
function aplicarResultado(el, texto) {
  el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.8 ? 'start' : 'center' });
  el.classList.add(...DESTAQUE); setTimeout(() => el.classList.remove(...DESTAQUE), 2500);
  const barra = barraStatus('status-resultado');
  barra.innerHTML = `<div class="flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white shadow-lg" role="status" data-status-resultado>
    <i class="fa-solid fa-circle-check"></i><span class="min-w-0 flex-1">${esc(texto)}</span>
    <button type="button" class="rounded bg-white/20 px-2 py-1 text-xs font-semibold hover:bg-white/30" data-ver-resultado-status>Ver resultado</button>
    <button type="button" class="px-1 text-lg leading-none" aria-label="Fechar" data-fechar-status>&times;</button></div>`;
  barra.querySelector('[data-ver-resultado-status]').onclick = () => { if (el.isConnected) aplicarResultado(el, texto); else fecharBarra('status-resultado'); };
  barra.querySelector('[data-fechar-status]').onclick = () => fecharBarra('status-resultado');
}
// O status de "pronto" vale para a tela atual: some quando o operador muda de tela.
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { pendente = null; fecharBarra('status-resultado'); });

const TEM_ORIENTACAO = /tente|use |usar|peça|pe[çc]a |verifique|confira|envie|selecione|escreva|cadastre|abra|escolha|preencha|marque|remova|adicione|defina|publique|aguarde|recarregue|clique|monte|gere|cole|ative|o que fazer/i;
/** Erro que fica na tela até a pessoa fechar, com o motivo e o que fazer. */
export function mostrarErro(msg, { detalhe = '' } = {}) {
  const texto = String(msg || 'Algo deu errado.');
  const dica = TEM_ORIENTACAO.test(texto) ? '' : 'O que fazer: tente de novo em instantes. Se continuar, use o caminho sem IA desta tela.';
  const barra = barraStatus('status-erro');
  barra.innerHTML = `<div class="flex items-start gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm text-white shadow-lg" role="alert" data-status-erro>
    <i class="fa-solid fa-triangle-exclamation mt-0.5"></i><div class="min-w-0 flex-1"><p class="whitespace-pre-wrap">${esc(texto)}</p>${dica ? `<p class="mt-1 text-rose-100">${esc(dica)}</p>` : ''}${detalhe ? `<details class="mt-1 text-xs text-rose-100" data-detalhe-erro><summary class="cursor-pointer">Detalhe técnico</summary><p class="mt-1 break-all">${esc(detalhe)}</p></details>` : ''}</div>
    <button type="button" class="px-1 text-lg leading-none" aria-label="Fechar" data-fechar-erro>&times;</button></div>`;
  barra.querySelector('[data-fechar-erro]').onclick = () => fecharBarra('status-erro');
}

export function dataBR(iso) {
  if (!iso) return '—';
  // Data sem hora ("2026-09-24", do <input type="date">): o navegador leria como meia-noite UTC, que no Brasil
  // (UTC-3) ainda é o dia anterior. Formata direto, sem fuso.
  const so = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (so) return `${so[3]}/${so[2]}/${so[1]}`;
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
}
export function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
export const moeda = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

export const tag = (texto, cls = '') => `<span class="tag ${cls}">${esc(texto)}</span>`;
export const icone = (nome) => `<i class="fa-solid fa-${nome}"></i>`;

/** Cabeçalho de tela: título + legenda curta + ações à direita. */
export function cabecalho(titulo, legenda, acoes = '') {
  return `<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div><h2 class="text-xl font-semibold text-slate-900">${esc(titulo)}</h2>
    ${legenda ? `<p class="caption">${esc(legenda)}</p>` : ''}</div>
    <div class="flex flex-wrap gap-2">${acoes}</div></div>`;
}

/** Nota padrão que acompanha todo resultado gerado por IA. */
export const iaNota = (texto) => `<div class="ia-note"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>${esc(texto)}</div>`;

export function vazio(icon, titulo, texto, acao = '') {
  return `<div class="card text-center py-10"><div class="text-3xl text-slate-300 mb-2"><i class="fa-solid fa-${icon}"></i></div>
    <p class="font-medium text-slate-700">${esc(titulo)}</p><p class="caption mb-4">${esc(texto)}</p>${acao}</div>`;
}

export function toast(msg, tipo = 'ok', extra = {}) {
  if (tipo === 'erro') return mostrarErro(msg, extra); // erro fica na tela até fechar (regra do app)
  const cor = { ok: 'bg-emerald-600', erro: 'bg-rose-600', info: 'bg-slate-800' }[tipo] || 'bg-slate-800';
  const el = document.createElement('div');
  el.className = `${cor} text-white text-sm rounded-lg px-4 py-2 shadow-lg max-w-sm`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 3500);
}

/** Modal genérico. Retorna { el, fechar }. `corpo` é HTML. `aoFechar` roda quando fecha por QUALQUER caminho (X, clique fora, botão, código). */
export function modal(titulo, corpo, { largo = false, aoFechar = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4';
  wrap.innerHTML = `<div class="my-8 w-full ${largo ? 'max-w-3xl' : 'max-w-lg'} rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true">
    <div class="mb-4 flex items-center justify-between"><h3 class="text-lg font-semibold">${esc(titulo)}</h3>
    <button data-fechar class="text-slate-400 hover:text-slate-700" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div>
    <div data-corpo>${corpo}</div></div>`;
  const fechar = () => { if (!wrap.isConnected) return; wrap.remove(); const i = abertos.indexOf(fechar); if (i >= 0) abertos.splice(i, 1); aoFechar?.(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) fechar(); });
  on(wrap, 'click', '[data-fechar]', fechar);
  document.body.appendChild(wrap);
  abertos.push(fechar);
  return { el: wrap, fechar };
}

// Janelas abertas, da mais antiga para a mais nova: Esc fecha a de cima; trocar de tela (link, voltar do navegador)
// fecha todas — senão uma janela da tela anterior ficava por cima da tela nova.
const abertos = [];
export function fecharModais() { [...abertos].reverse().forEach((f) => f()); }
if (typeof document !== 'undefined') {
  // Dentro de um campo de texto, Esc só sai do campo (fechar a janela ali perderia o que está sendo digitado/montado).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !abertos.length || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    abertos[abertos.length - 1]();
  });
}

export function confirmar(mensagem, textoBotao = 'Confirmar') {
  return new Promise((ok) => {
    // Fechar de qualquer jeito (Cancelar, X, clicar fora) = "não"; só o botão de confirmação resolve "sim".
    const m = modal('Confirmação', `<p class="mb-5 whitespace-pre-line text-sm" data-texto-confirmacao>${esc(mensagem)}</p>
      <div class="flex justify-end gap-2"><button class="btn-ghost" data-nao>Cancelar</button>
      <button class="btn-danger" data-sim>${esc(textoBotao)}</button></div>`, { aoFechar: () => ok(false) });
    on(m.el, 'click', '[data-sim]', () => { ok(true); m.fechar(); });
    on(m.el, 'click', '[data-nao]', () => m.fechar());
  });
}

/** Executa fn com o botão desabilitado e spinner; mostra erro em toast. */
export async function ocupado(btn, fn) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aguarde…';
  // Chamada de IA longa: o botão mostra que ela ainda está trabalhando (evento de core/ia.js pedirAoServidor).
  const progresso = (e) => { const s = e.detail?.segundos || 0; if (btn.isConnected && s >= 10) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> A IA ainda está trabalhando… ${s} s${e.detail?.etapa === 'reserva' ? ' (reserva)' : ''}`; };
  if (typeof window !== 'undefined') window.addEventListener('gcc:ia-progresso', progresso);
  try { return await fn(); }
  catch (e) { console.error(e); toast(e.message || 'Algo deu errado.', 'erro', { detalhe: e.detalhe || '' }); }
  finally { if (typeof window !== 'undefined') window.removeEventListener('gcc:ia-progresso', progresso); btn.disabled = false; btn.innerHTML = html; }
}

export function lerForm(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}

/**
 * Copia para a área de transferência. A API moderna às vezes fica esperando para sempre (aba sem foco, pedido de
 * permissão ignorado): depois de 1,5 s cai no método antigo. Devolve true se copiou.
 */
export async function copiar(texto) {
  try {
    await Promise.race([navigator.clipboard.writeText(texto), new Promise((_, rej) => setTimeout(() => rej(new Error('tempo')), 1500))]);
    toast('Copiado!'); return true;
  } catch {
    const t = document.createElement('textarea'); t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    if (ok) toast('Copiado!'); else toast('O navegador não deixou copiar. Selecione o texto em "Ver o texto" e copie com Ctrl+C.', 'erro');
    return ok;
  }
}

export function baixarTexto(nome, conteudo, tipo = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const listaDeLinhas = (txt) => String(txt || '').split(/\n|;/).map((s) => s.trim()).filter(Boolean);
export const opcoes = (lista, atual) => lista.map(([v, r]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(r)}</option>`).join('');

// ---------- Botão de upload ----------
// O <input type="file"> nativo aparece como "Escolher ficheiros", sem estilo e fácil de não ver. campoArquivo()
// gera um botão de verdade (o input fica escondido dentro do <label>) com o texto do que ele aceita; depois da
// escolha, ativarCamposArquivo() troca o botão por uma confirmação com miniatura/nome e as ações Trocar/Remover.
// Os módulos continuam ouvindo o "change" do próprio input, então nenhuma lógica de upload muda.

const tamanhoLegivel = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const iconeDoArquivo = (f) => (f.type.startsWith('audio/') ? 'music' : f.type === 'application/pdf' ? 'file-pdf' : f.type.startsWith('video/') ? 'film' : 'file');

/**
 * HTML de um botão de upload. `attrs` são os atributos que o módulo usa para achar o input (ex.: 'data-logo',
 * 'name="fotos"'). `lista: true` = o módulo já mostra os arquivos escolhidos (ex.: materiais do Estúdio), então o
 * botão continua visível para adicionar mais. `removivel: false` esconde "Remover" quando esvaziar não faz sentido.
 */
export function campoArquivo({ attrs = '', texto, accept = '', multiple = false, icone = 'upload', destaque = true, lista = false, removivel = true, dica = '' }) {
  return `<div class="upload" data-upload${lista ? ' data-upload-lista' : ''}${removivel ? '' : ' data-upload-fixo'}>
    <label class="${destaque ? 'btn-primary' : 'btn-ghost'} upload-btn"><input type="file" class="sr-only" ${attrs}${accept ? ` accept="${esc(accept)}"` : ''}${multiple ? ' multiple' : ''}>
      <i class="fa-solid fa-${icone}"></i> <span data-upload-rotulo>${esc(texto)}</span></label>
    ${dica ? `<p class="hint">${esc(dica)}</p>` : ''}
    <div data-upload-escolhido class="hidden"></div></div>`;
}

function mostrarEscolhidos(caixa, input) {
  const alvo = $('[data-upload-escolhido]', caixa), botao = $('.upload-btn', caixa), dica = $('.hint', caixa);
  (caixa._urls || []).forEach((u) => URL.revokeObjectURL(u)); caixa._urls = [];
  const arqs = [...(input.files || [])];
  if (!arqs.length) { alvo.classList.add('hidden'); alvo.innerHTML = ''; botao.classList.remove('hidden'); dica?.classList.remove('hidden'); return; }
  const miniatura = (f) => {
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return `<span class="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500"><i class="fa-solid fa-${iconeDoArquivo(f)} text-lg"></i></span>`;
    const u = URL.createObjectURL(f); caixa._urls.push(u);
    return f.type.startsWith('image/') ? `<img src="${u}" alt="" class="h-12 w-12 shrink-0 rounded object-cover">`
      : `<video src="${u}#t=0.1" muted preload="metadata" class="h-12 w-12 shrink-0 rounded bg-black object-cover"></video>`;
  };
  const nome = arqs.length === 1 ? `${esc(arqs[0].name)} <span class="text-slate-500">(${tamanhoLegivel(arqs[0].size)})</span>` : `${arqs.length} arquivos <span class="text-slate-500">(${tamanhoLegivel(arqs.reduce((t, f) => t + f.size, 0))})</span>`;
  alvo.innerHTML = `<div class="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
      <div class="flex flex-wrap gap-1">${arqs.slice(0, 6).map(miniatura).join('')}${arqs.length > 6 ? `<span class="self-center text-xs text-slate-500">+${arqs.length - 6}</span>` : ''}</div>
      <div class="min-w-0 flex-1 text-sm"><p class="font-medium text-emerald-800"><i class="fa-solid fa-circle-check"></i> ${arqs.length > 1 ? 'Arquivos escolhidos' : 'Arquivo escolhido'}</p><p class="truncate">${nome}</p></div>
      <span class="flex gap-1"><button type="button" class="btn-ghost btn-sm" data-upload-trocar><i class="fa-solid fa-arrow-rotate-right"></i> Trocar</button>
      ${caixa.hasAttribute('data-upload-fixo') ? '' : '<button type="button" class="btn-danger btn-sm" data-upload-remover title="Remover este arquivo">×</button>'}</span></div>`;
  alvo.classList.remove('hidden'); botao.classList.add('hidden'); dica?.classList.add('hidden');
}

/** Liga (uma vez, no documento) o comportamento de todos os campoArquivo() do app. */
export function ativarCamposArquivo() {
  document.addEventListener('change', (ev) => {
    const input = ev.target, caixa = input?.closest?.('[data-upload]');
    if (!caixa || input.type !== 'file' || caixa.hasAttribute('data-upload-lista')) return;
    mostrarEscolhidos(caixa, input);
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-upload-trocar], [data-upload-remover]'); if (!b) return;
    const caixa = b.closest('[data-upload]'), input = $('input[type=file]', caixa);
    if (b.hasAttribute('data-upload-trocar')) return input.click();
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true })); // o módulo zera o estado dele (logo, trilha...)
  });
  // Arrastar e soltar: qualquer campoArquivo() (ou uma área maior marcada com data-soltar em volta dele) aceita
  // arquivos soltos em cima. Os arquivos entram no próprio input e disparam o mesmo "change" do clique, então o
  // módulo não precisa saber de onde vieram. Enquanto arrasta por cima, a área ganha destaque.
  const zonaDe = (ev) => ev.target?.closest?.('[data-soltar]') || ev.target?.closest?.('[data-upload]'); // a área maior tem prioridade
  const inputDe = (zona) => { const i = zona && $('input[type=file]', zona); return i && !i.disabled ? i : null; };
  const temArquivo = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');
  const DESTAQUE = ['ring-2', 'ring-indigo-400', 'bg-sky-50']; // sky-50 é remapeado no tema escuro
  const apagar = () => document.querySelectorAll('[data-soltando]').forEach((z) => { z.removeAttribute('data-soltando'); z.classList.remove(...DESTAQUE); });
  document.addEventListener('dragover', (ev) => {
    const zona = zonaDe(ev); if (!temArquivo(ev) || !inputDe(zona)) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy';
    if (!zona.hasAttribute('data-soltando')) { apagar(); zona.setAttribute('data-soltando', ''); zona.classList.add(...DESTAQUE); }
  });
  document.addEventListener('dragleave', (ev) => {
    const zona = zonaDe(ev); if (zona && !zona.contains(ev.relatedTarget)) apagar();
  });
  document.addEventListener('drop', (ev) => {
    const zona = zonaDe(ev), input = inputDe(zona);
    apagar();
    if (!input || !temArquivo(ev)) return;
    ev.preventDefault();
    const aceita = (input.accept || '').split(',').map((s) => s.trim()).filter(Boolean);
    const confere = (f) => !aceita.length || aceita.some((a) => (a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : f.type === a));
    const arqs = [...ev.dataTransfer.files];
    const bons = arqs.filter(confere).slice(0, input.multiple ? undefined : 1);
    if (!bons.length) return toast('Esse tipo de arquivo não é aceito aqui.', 'erro');
    if (bons.length < arqs.length) toast(`${arqs.length - bons.length} arquivo(s) ficaram de fora (tipo não aceito${input.multiple ? '' : ' ou só cabe um'}).`, 'erro');
    const dt = new DataTransfer(); bons.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // Soltar fora de uma área de upload não abre o arquivo no lugar do app.
  window.addEventListener('dragover', (ev) => { if (temArquivo(ev) && !ev.defaultPrevented) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'none'; } });
  window.addEventListener('drop', (ev) => { if (temArquivo(ev)) { ev.preventDefault(); apagar(); } });
}

/**
 * Faixa com rolagem lateral (abas, passos): centraliza o item atual (`[aria-current]`) e esmaece a borda do lado em que
 * há mais itens (classes `mais-esq`/`mais-dir`, CSS em style.css), para o celular mostrar que dá para rolar.
 */
export function faixaRolavel(el) {
  if (!el) return;
  el.classList.add('faixa-rolavel');
  const atual = el.querySelector('[aria-current]');
  if (atual && el.scrollWidth > el.clientWidth) {
    const a = atual.getBoundingClientRect(), f = el.getBoundingClientRect();
    el.scrollLeft += a.left - f.left - (el.clientWidth - a.width) / 2;
  }
  const marcar = () => {
    el.classList.toggle('mais-esq', el.scrollLeft > 2);
    el.classList.toggle('mais-dir', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  el.addEventListener('scroll', marcar, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(marcar).observe(el);
  marcar();
}
