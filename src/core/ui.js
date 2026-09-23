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
    el.replaceChildren(root);
    await fn(root, recarregar);
  };
  return recarregar();
}

export function dataBR(iso) {
  if (!iso) return '—';
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

export function toast(msg, tipo = 'ok') {
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
    const m = modal('Confirmação', `<p class="mb-5 text-sm">${esc(mensagem)}</p>
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
  try { return await fn(); }
  catch (e) { console.error(e); toast(e.message || 'Algo deu errado.', 'erro'); }
  finally { btn.disabled = false; btn.innerHTML = html; }
}

export function lerForm(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado!'); }
  catch {
    const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t);
    t.select(); document.execCommand('copy'); t.remove(); toast('Copiado!');
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
}
