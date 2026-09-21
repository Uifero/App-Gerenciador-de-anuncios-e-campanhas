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

/** Modal genérico. Retorna { el, fechar }. `corpo` é HTML. */
export function modal(titulo, corpo, { largo = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4';
  wrap.innerHTML = `<div class="my-8 w-full ${largo ? 'max-w-3xl' : 'max-w-lg'} rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true">
    <div class="mb-4 flex items-center justify-between"><h3 class="text-lg font-semibold">${esc(titulo)}</h3>
    <button data-fechar class="text-slate-400 hover:text-slate-700" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div>
    <div data-corpo>${corpo}</div></div>`;
  const fechar = () => wrap.remove();
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) fechar(); });
  on(wrap, 'click', '[data-fechar]', fechar);
  document.body.appendChild(wrap);
  return { el: wrap, fechar };
}

export function confirmar(mensagem, textoBotao = 'Confirmar') {
  return new Promise((ok) => {
    const m = modal('Confirmação', `<p class="mb-5 text-sm">${esc(mensagem)}</p>
      <div class="flex justify-end gap-2"><button class="btn-ghost" data-nao>Cancelar</button>
      <button class="btn-danger" data-sim>${esc(textoBotao)}</button></div>`);
    on(m.el, 'click', '[data-sim]', () => { m.fechar(); ok(true); });
    on(m.el, 'click', '[data-nao],[data-fechar]', () => ok(false));
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
