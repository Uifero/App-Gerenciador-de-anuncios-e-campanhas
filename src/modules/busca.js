// Busca global (topo do app): clientes, criativos e hooks ao mesmo tempo, sem diferenciar acentos/maiúsculas.
import { db, COL } from '../core/storage.js';
import { esc, $, on } from '../core/ui.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LIMITE = 6; // resultados por grupo

let dados = null, carregadoEm = 0;
async function carregar() {
  if (dados && Date.now() - carregadoEm < 15000) return dados;
  const [clientes, criativos, hooks] = await Promise.all([db.listar(COL.clientes), db.listar(COL.criativos), db.listar(COL.hooks)]);
  dados = { clientes, criativos, hooks }; carregadoEm = Date.now();
  return dados;
}

/** Filtra e devolve grupos de resultados (exportada para teste). */
export function buscarEm({ clientes, criativos, hooks }, termo) {
  const t = norm(termo).trim();
  if (t.length < 2) return null;
  const nomeDe = (id) => clientes.find((c) => c.id === id)?.nome || '';
  return {
    clientes: clientes.filter((c) => norm(c.nome).includes(t) || norm(c.nicho).includes(t)).slice(0, LIMITE),
    criativos: criativos.filter((c) => norm(c.nome).includes(t) || norm(c.hook).includes(t)).slice(0, LIMITE).map((c) => ({ ...c, clienteNome: nomeDe(c.clienteId) })),
    hooks: hooks.filter((h) => norm(h.texto).includes(t)).slice(0, LIMITE),
  };
}

/** Guarda o que abrir ao chegar na aba de destino (lido por criativos.js e hooks.js). */
function pedirAbertura(chave, id) { try { sessionStorage.setItem(chave, id); } catch { /* sem storage */ } }

/** Mac usa ⌘K; os demais, Ctrl+K. */
export const teclaAtalho = () => (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl+K');
/** Ctrl+K / ⌘K: o atalho da busca global (Ctrl+Shift+K e afins ficam livres). */
export const ehAtalhoBusca = (e) => Boolean((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'k');

// Um único ouvinte para o app inteiro (montarBusca roda de novo quando o layout é refeito).
let atalhoLigado = false;
function ligarAtalho() {
  if (atalhoLigado) return;
  atalhoLigado = true;
  document.addEventListener('keydown', (e) => {
    if (!ehAtalhoBusca(e)) return;
    const inp = document.getElementById('busca');
    if (!inp) return; // tela sem busca (login, link público de aprovação)
    e.preventDefault(); // no navegador, Ctrl+K abriria a busca da barra de endereço
    inp.focus(); inp.select();
  });
}

export function montarBusca(container, aoNavegar) {
  ligarAtalho();
  container.innerHTML = `<div class="relative w-full max-w-md">
    <i class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
    <input id="busca" type="search" autocomplete="off" class="input !pl-9 sm:!pr-16" placeholder="Buscar clientes, criativos e hooks…" aria-label="Busca global" aria-keyshortcuts="Control+K Meta+K" title="Busca por nome/legenda em clientes, criativos e hooks (atalho: ${teclaAtalho()}; Esc fecha)">
    <kbd data-dica-atalho class="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] text-slate-500 sm:block">${teclaAtalho()}</kbd>
    <div id="busca-res" class="absolute left-0 right-0 top-full z-40 mt-1 hidden max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl" role="listbox"></div></div>`;
  const inp = $('#busca', container), res = $('#busca-res', container);
  let ultimo = 0;

  const fechar = () => { res.classList.add('hidden'); };
  const item = (icone, titulo, sub, attrs) => `<button type="button" role="option" class="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100" ${attrs}>
    <i class="fa-solid fa-${icone} mt-1 w-4 text-slate-400"></i><span class="min-w-0"><span class="block truncate font-medium">${esc(titulo)}</span><span class="block truncate text-xs text-slate-500">${esc(sub)}</span></span></button>`;

  async function buscar() {
    const minha = ++ultimo;
    const d = await carregar();
    if (minha !== ultimo) return;
    const r = buscarEm(d, inp.value);
    if (!r) return fechar();
    const grupos = [
      ['Clientes', r.clientes.map((c) => item('user', c.nome, c.nicho, `data-tipo="cliente" data-id="${c.id}"`))],
      ['Criativos', r.criativos.map((c) => item('wand-magic-sparkles', c.nome, `${c.clienteNome} · “${c.hook}”`, `data-tipo="criativo" data-id="${c.id}" data-cliente="${c.clienteId}"`))],
      ['Hooks', r.hooks.map((h) => item('bolt', h.texto, h.clienteId === 'generico' ? 'genérico' : `de ${h.clienteNome || 'cliente'}`, `data-tipo="hook" data-id="${h.id}" data-cliente="${h.clienteId}"`))],
    ].filter(([, l]) => l.length);
    res.innerHTML = grupos.length ? grupos.map(([t, l]) => `<p class="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">${t}</p>${l.join('')}`).join('')
      : '<p class="px-2 py-3 text-sm text-slate-500">Nada encontrado. Tente outra palavra.</p>';
    res.classList.remove('hidden');
  }

  let timer;
  inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(buscar, 120); });
  inp.addEventListener('focus', () => { dados = null; if (inp.value.trim().length >= 2) buscar(); }); // refaz a leitura: dados podem ter mudado
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fechar(); inp.blur(); } });
  // A dica do atalho some enquanto a busca está em uso (senão fica por cima do texto e do "x" do campo).
  const dica = $('[data-dica-atalho]', container);
  const mostrarDica = () => dica.classList.toggle('sm:block', document.activeElement !== inp && !inp.value);
  inp.addEventListener('focus', mostrarDica); inp.addEventListener('blur', mostrarDica); inp.addEventListener('input', mostrarDica);
  // Com uma janela aberta (fundo escuro z-50), o cabeçalho sobe por cima dela enquanto a busca está em uso.
  const cab = container.closest('header');
  inp.addEventListener('focus', () => cab?.classList.add('!z-[60]'));
  inp.addEventListener('blur', () => setTimeout(() => cab?.classList.remove('!z-[60]'), 200)); // 200 ms: deixa o clique no resultado acontecer
  document.addEventListener('mousedown', (e) => { if (!container.contains(e.target)) fechar(); });

  on(res, 'click', '[data-tipo]', async (b) => {
    const { tipo, id, cliente } = b.dataset;
    let destino;
    if (tipo === 'cliente') destino = `#/c/${id}`;
    else if (tipo === 'criativo') { pedirAbertura('gcc_abrir_criativo', id); destino = `#/c/${cliente}/criativos`; }
    else {
      pedirAbertura('gcc_abrir_hook', id);
      // Hook genérico não pertence a um cliente: abre na aba Hooks do cliente atual (ou do primeiro que tenha a aba).
      let alvo = cliente;
      if (alvo === 'generico') {
        const atual = location.hash.match(/^#\/c\/([^/]+)/)?.[1];
        const { clientes } = await carregar();
        alvo = (clientes.find((c) => c.id === atual && (c.escopo || { hooks: true }).hooks) || clientes.find((c) => (c.escopo || { hooks: true }).hooks))?.id;
      }
      destino = alvo ? `#/c/${alvo}/hooks` : '#/';
    }
    inp.value = ''; fechar();
    if (location.hash === destino) aoNavegar?.(); else location.hash = destino;
  });
}
