// Aba Hooks: biblioteca filtrável de ganchos, reaproveitável entre clientes (origem = cliente ou "genérico").
import { db, COL } from '../core/storage.js';
import { gerarHooks } from '../core/ia.js';
import { CATEGORIAS_HOOK } from '../lib/constantes.js';
import { esc, $, on, montar, cabecalho, iaNota, vazio, tag, dataBR, toast, ocupado, lerForm, opcoes, copiar, num } from '../core/ui.js';

const nomeCat = (v) => (CATEGORIAS_HOOK.find(([k]) => k === v) || [, v || 'sem categoria'])[1];
const estrelas = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : 'sem nota');

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const todos = await db.listar(COL.hooks);
  let escopo = 'cliente', cat = '', busca = '';
  // Vindo da busca global: mostra o hook encontrado (em qualquer escopo) e o destaca.
  let destaque = null;
  try { destaque = sessionStorage.getItem('gcc_abrir_hook'); sessionStorage.removeItem('gcc_abrir_hook'); } catch { /* sem storage */ }
  const hookBusca = destaque && todos.find((h) => h.id === destaque);
  if (hookBusca) escopo = hookBusca.clienteId === 'generico' ? 'generico' : hookBusca.clienteId === cliente.id ? 'cliente' : 'todos';

  const visiveis = () => todos.filter((h) => {
    if (escopo === 'cliente' && h.clienteId !== cliente.id) return false;
    if (escopo === 'generico' && h.clienteId !== 'generico') return false;
    return (!cat || h.categoria === cat) && (!busca || h.texto.toLowerCase().includes(busca.toLowerCase()));
  });

  const lista = () => {
    const itens = visiveis();
    if (!itens.length) return vazio('bolt', 'Nenhum hook por aqui', 'Gere com IA ou escreva o seu. Hooks bons podem ser reaproveitados em outros clientes.');
    return `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${itens.map((h) => `<div class="card ${h.id === destaque ? 'ring-2 ring-indigo-500' : ''}" data-hook-id="${h.id}">
      <p class="font-medium">“${esc(h.texto)}”</p>
      <div class="mt-2 flex flex-wrap gap-1">${h.angulo ? tag('ângulo: ' + h.angulo, 'tag-info') : tag(nomeCat(h.categoria), 'tag-info')}${tag(h.clienteId === 'generico' ? 'genérico' : 'de ' + (h.clienteNome || 'cliente'))}${tag(estrelas(h.nota))}</div>
      <p class="hint mt-2">${dataBR(h.criadoEm)}</p>
      <div class="mt-2 flex flex-wrap gap-1">
        <button class="btn-ghost btn-sm" data-copiar="${h.id}" title="Copiar o texto"><i class="fa-solid fa-copy"></i></button>
        <select class="input !w-auto !py-1 text-xs" data-nota="${h.id}" title="Nota de performance"><option value="">Nota</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${h.nota === n ? 'selected' : ''}>${n}★</option>`).join('')}</select>
        ${h.clienteId !== 'generico' && h.clienteId === cliente.id ? `<button class="btn-ghost btn-sm" data-generico="${h.id}" title="Deixa este hook disponível para todos os clientes">Tornar genérico</button>` : ''}
        ${h.clienteId !== cliente.id ? `<button class="btn-ghost btn-sm" data-usar="${h.id}" title="Copia este hook para a biblioteca deste cliente">Usar aqui</button>` : ''}
        <button class="btn-danger btn-sm" data-apagar="${h.id}" title="Apagar"><i class="fa-solid fa-trash"></i></button></div></div>`).join('')}</div>`;
  };

  root.innerHTML = `${cabecalho('Hooks', 'Ganchos de abertura isolados. Filtre, avalie e reaproveite entre clientes.',
    '<button class="btn-ia" data-ia title="A IA cria vários hooks com o perfil de marca do cliente"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar com IA</button><button class="btn-ghost" data-manual title="Escreva um hook você mesmo">Adicionar manual</button>')}
    <div id="painel"></div>
    <div class="mb-4 flex flex-wrap gap-2">
      <select class="input !w-auto" data-escopo><option value="cliente" ${escopo === 'cliente' ? 'selected' : ''}>Deste cliente</option><option value="generico" ${escopo === 'generico' ? 'selected' : ''}>Genéricos</option><option value="todos" ${escopo === 'todos' ? 'selected' : ''}>Todos os clientes</option></select>
      <select class="input !w-auto" data-cat><option value="">Todas as categorias</option>${opcoes(CATEGORIAS_HOOK, '')}</select>
      <input class="input !w-56" data-busca placeholder="Buscar no texto…"></div>
    <div id="lista">${lista()}</div>`;
  const redesenhar = () => { $('#lista', root).innerHTML = lista(); };
  if (hookBusca) $(`[data-hook-id="${hookBusca.id}"]`, root)?.scrollIntoView({ block: 'center' });
  on(root, 'change', '[data-escopo]', (s) => { escopo = s.value; redesenhar(); });
  on(root, 'change', '[data-cat]', (s) => { cat = s.value; redesenhar(); });
  on(root, 'input', '[data-busca]', (i) => { busca = i.value; redesenhar(); });

  const salvar = (texto, categoria, extra = {}) => db.criar(COL.hooks, {
    texto, categoria: categoria || '', clienteId: cliente.id, clienteNome: cliente.nome, nota: null, ...extra,
  });

  on(root, 'click', '[data-manual]', () => {
    $('#painel', root).innerHTML = `<form id="fm" class="card mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <input class="input" name="texto" placeholder="Texto do hook" required><select class="input" name="categoria">${opcoes(CATEGORIAS_HOOK, '')}</select>
      <button class="btn-primary" type="submit">Salvar</button></form>`;
  });
  on(root, 'submit', '#fm', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f); if (!v.texto) return;
    await ocupado(f.querySelector('button'), async () => { await salvar(v.texto, v.categoria); toast('Hook salvo.'); recarregar(); });
  });

  on(root, 'click', '[data-ia]', () => {
    $('#painel', root).innerHTML = `<form id="fi" class="card mb-4 space-y-3">
      <div class="grid gap-3 sm:grid-cols-3"><div class="sm:col-span-2"><label class="label">Sobre o quê? (opcional)</label><input class="input" name="tema" placeholder="Ex.: legging que não transparece"></div>
      <div><label class="label">Categoria</label><select class="input" name="categoria"><option value="">Variadas</option>${opcoes(CATEGORIAS_HOOK, '')}</select></div></div>
      <button class="btn-ia" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar 8 hooks</button><div id="res"></div></form>`;
  });
  on(root, 'submit', '#fi', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    await ocupado(f.querySelector('button'), async () => {
      const hooks = await gerarHooks({ cliente, tema: v.tema, categoria: v.categoria });
      const res = $('#res', f); res._h = hooks;
      res.innerHTML = `<div class="mt-3 space-y-2">${iaNota(`A IA criou ${hooks.length} hooks nativos/orgânicos para ${cliente.nome}. Salve os que servirem.`)}
        ${hooks.map((h, i) => `<div class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2"><span class="text-sm">“${esc(h.texto)}” ${tag(nomeCat(h.categoria), 'tag-info')}</span>
        <button type="button" class="btn-primary btn-sm shrink-0" data-salvar-h="${i}">Salvar</button></div>`).join('')}</div>`;
    });
  });
  on(root, 'click', '[data-salvar-h]', async (b) => {
    const h = $('#res', root)._h[Number(b.dataset.salvarH)];
    await ocupado(b, async () => { await salvar(h.texto, h.categoria); b.outerHTML = '<span class="tag tag-ok">Salvo</span>'; });
  });

  on(root, 'click', '[data-copiar]', (b) => copiar(todos.find((h) => h.id === b.dataset.copiar).texto));
  on(root, 'change', '[data-nota]', async (s) => { await db.atualizar(COL.hooks, s.dataset.nota, { nota: num(s.value) }); toast('Nota salva.'); recarregar(); });
  on(root, 'click', '[data-generico]', async (b) => { await db.atualizar(COL.hooks, b.dataset.generico, { clienteId: 'generico' }); toast('Agora é um hook genérico.'); recarregar(); });
  on(root, 'click', '[data-usar]', async (b) => {
    const h = todos.find((x) => x.id === b.dataset.usar);
    await salvar(h.texto, h.categoria, { nota: h.nota || null }); toast('Hook copiado para este cliente.'); recarregar();
  });
  on(root, 'click', '[data-apagar]', async (b) => { await db.remover(COL.hooks, b.dataset.apagar); toast('Hook apagado.'); recarregar(); });
});
