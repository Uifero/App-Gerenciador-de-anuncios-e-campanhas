// Biblioteca de playbooks (gcc_playbooks): sequência de ângulos/hooks que costuma funcionar por tipo de produto.
// Um playbook pode ser aplicado num cliente (vira hooks + ângulos sugeridos) ou criado a partir de um cliente que performa bem.
import { db, COL } from '../core/storage.js';
import { gerarPlaybook } from '../core/ia.js';
import { CATEGORIAS_HOOK } from '../lib/constantes.js';
import { esc, $, on, montar, cabecalho, vazio, tag, dataBR, toast, modal, ocupado, lerForm, confirmar } from '../core/ui.js';

const nomeCat = (v) => (CATEGORIAS_HOOK.find(([k]) => k === v) || [, v])[1];

/** "Ângulo | hook 1 | hook 2" (uma linha por ângulo) -> [{angulo, hooks[]}] */
export function parseAngulos(txt) {
  return String(txt || '').split('\n').map((l) => l.split('|').map((s) => s.trim()).filter(Boolean)).filter((p) => p.length)
    .map(([angulo, ...hooks]) => ({ angulo, hooks }));
}
export const angulosTexto = (as = []) => as.map((a) => [a.angulo, ...(a.hooks || [])].join(' | ')).join('\n');

/** Copia os hooks do playbook para o cliente e grava os ângulos sugeridos. Retorna quantos hooks foram criados. */
export async function aplicarPlaybook(cliente, pb) {
  const jaTem = new Set((await db.listar(COL.hooks, { clienteId: cliente.id })).map((h) => String(h.texto).trim().toLowerCase()));
  const novos = [];
  for (const a of pb.angulos || []) {
    for (const h of a.hooks || []) {
      const k = String(h).trim().toLowerCase();
      if (jaTem.has(k)) continue; // não duplica hook que o cliente já tem
      jaTem.add(k);
      novos.push({ texto: h, categoria: '', angulo: a.angulo, origemPlaybook: pb.nome, clienteId: cliente.id, clienteNome: cliente.nome, nota: null });
    }
  }
  await Promise.all(novos.map((h) => db.criar(COL.hooks, h))); // gravações em paralelo (rápido mesmo com dezenas de hooks)
  const n = novos.length;
  await db.atualizar(COL.clientes, cliente.id, { playbookId: pb.id, playbookNome: pb.nome, angulosSugeridos: (pb.angulos || []).map((a) => a.angulo) });
  Object.assign(cliente, { playbookId: pb.id, playbookNome: pb.nome, angulosSugeridos: (pb.angulos || []).map((a) => a.angulo) });
  return n;
}

/** Monta um rascunho de playbook a partir do que funcionou no cliente (ângulos dos criativos + hooks bem avaliados). */
export async function rascunhoDeCliente(cliente) {
  const f = { clienteId: cliente.id };
  const [criativos, resultados, hooks] = await Promise.all([db.listar(COL.criativos, f), db.listar(COL.resultados, f), db.listar(COL.hooks, f)]);
  const grupos = new Map();
  for (const c of criativos.filter((x) => x.angulo && x.hook)) {
    const g = grupos.get(c.angulo) || { angulo: c.angulo, hooks: [], roas: 0 };
    if (!g.hooks.includes(c.hook)) g.hooks.push(c.hook);
    for (const r of resultados.filter((x) => x.criativoId === c.id && x.roas)) g.roas = Math.max(g.roas, r.roas);
    grupos.set(c.angulo, g);
  }
  const angulos = [...grupos.values()].sort((a, b) => b.roas - a.roas || b.hooks.length - a.hooks.length)
    .map((g) => ({ angulo: g.angulo, hooks: g.hooks.slice(0, 4) }));
  const bons = hooks.filter((h) => (h.nota || 0) >= 4);
  const porCat = new Map();
  for (const h of bons) porCat.set(h.categoria || 'geral', [...(porCat.get(h.categoria || 'geral') || []), h.texto]);
  for (const [cat, hs] of porCat) angulos.push({ angulo: `Hooks bem avaliados (${nomeCat(cat)})`, hooks: hs.slice(0, 4) });
  const melhor = [...resultados].filter((r) => r.roas).sort((a, b) => b.roas - a.roas)[0];
  return {
    nome: `Playbook — ${cliente.nome}`, tipoProduto: cliente.nicho, angulos,
    notas: [`Criado a partir do cliente "${cliente.nome}" (${cliente.estagio === 'rodando' ? 'rodando' : 'novo'}).`,
      cliente.marca?.usp && `Diferencial: ${cliente.marca.usp}.`, cliente.marca?.tomDeVoz && `Tom de voz: ${cliente.marca.tomDeVoz}.`,
      melhor && `Melhor ROAS registrado: ${melhor.roas}x ("${melhor.criativoNome}").`].filter(Boolean).join(' '),
    origemClienteId: cliente.id,
  };
}

const formHtml = (p = {}) => `<form id="fpb" class="space-y-3">
  <div><label class="label">Nome do playbook *</label><input class="input" name="nome" value="${esc(p.nome)}" placeholder="Ex.: Moda fitness feminina"></div>
  <div><label class="label">Tipo de produto / nicho *</label><input class="input" name="tipoProduto" value="${esc(p.tipoProduto)}" placeholder="Ex.: leggings e roupas de treino"></div>
  <div><label class="label">Ângulos e hooks que costumam funcionar</label>
    <textarea class="input font-mono text-xs" rows="7" name="angulos" placeholder="Vergonha na academia | Ninguém fala disso... | Testei e não transparece&#10;Custo-benefício | ...">${esc(angulosTexto(p.angulos))}</textarea>
    <p class="hint">Um ângulo por linha, na ordem em que costumam funcionar. Formato: <code>Ângulo | hook 1 | hook 2</code></p></div>
  <div><label class="label">Notas gerais</label><textarea class="input" rows="3" name="notas">${esc(p.notas)}</textarea></div>
  <div class="flex justify-between"><button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar playbook</button>
    ${p.id ? '<button class="btn-danger" type="button" data-apagar>Apagar</button>' : ''}</div></form>`;

/** Abre o editor de playbook. `rascunho` = dados iniciais (sem id) ou playbook existente (com id). */
export function abrirEditor(rascunho, aoSalvar, titulo = 'Playbook') {
  const m = modal(titulo, formHtml(rascunho || {}), { largo: true });
  on(m.el, 'submit', '#fpb', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    if (!v.nome || !v.tipoProduto) return toast('Informe o nome e o tipo de produto.', 'erro');
    const dados = { nome: v.nome, tipoProduto: v.tipoProduto, angulos: parseAngulos(v.angulos), notas: v.notas || '', origemClienteId: rascunho?.origemClienteId || null };
    await ocupado(f.querySelector('[type=submit]'), async () => {
      const salvo = rascunho?.id ? (await db.atualizar(COL.playbooks, rascunho.id, dados), { id: rascunho.id, ...dados }) : await db.criar(COL.playbooks, dados);
      toast('Playbook salvo.'); m.fechar(); aoSalvar?.(salvo);
    });
  });
  on(m.el, 'click', '[data-apagar]', async () => {
    if (!(await confirmar('Apagar este playbook? Clientes que já o aplicaram não são afetados.', 'Apagar'))) return;
    await db.remover(COL.playbooks, rascunho.id); m.fechar(); toast('Playbook apagado.'); aoSalvar?.(null);
  });
}

// ---------------- página da biblioteca ----------------
export const view = (el) => montar(el, async (root, recarregar) => {
  const pbs = await db.listar(COL.playbooks);
  root.innerHTML = `${cabecalho('Playbooks', 'Receitas reaproveitáveis por tipo de produto: a sequência de ângulos e hooks que costuma funcionar. Para usar num cliente: escolha o playbook ao cadastrar o cliente, ou dentro dele em "Mais ações" > "Aplicar playbook" — os hooks vão para a aba Hooks e os ângulos aparecem como sugestão ao criar criativos.',
    `<button class="btn-ia" data-ia title="A IA sugere um playbook a partir do tipo de produto"><i class="fa-solid fa-wand-magic-sparkles"></i> Sugerir playbook com IA</button>
     <button class="btn-primary" data-novo title="Escreva um playbook você mesmo"><i class="fa-solid fa-plus"></i> Novo playbook</button>`)}
    <div id="painel"></div>
    ${pbs.length ? `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${pbs.map((p) => `<button data-abrir="${p.id}" class="card text-left transition hover:border-indigo-400 hover:shadow-md">
      <h3 class="font-semibold leading-tight">${esc(p.nome)}</h3><p class="caption mt-1">${esc(p.tipoProduto)}</p>
      <div class="mt-3 flex flex-wrap gap-1">${tag((p.angulos || []).length + ' ângulos', 'tag-info')}${(p.angulos || []).slice(0, 3).map((a) => tag(a.angulo)).join('')}${p.origemClienteId ? tag('de um cliente', 'tag-ok') : ''}</div>
      <p class="hint mt-2">${dataBR(p.criadoEm)}</p></button>`).join('')}</div>`
      : vazio('book-open', 'Nenhum playbook ainda', 'Crie um manualmente, peça uma sugestão à IA ou salve a estrutura de um cliente que está performando bem (dentro do cliente, em "Mais ações").')}`;

  on(root, 'click', '[data-novo]', () => abrirEditor({}, recarregar, 'Novo playbook'));
  on(root, 'click', '[data-abrir]', (b) => abrirEditor(pbs.find((p) => p.id === b.dataset.abrir), recarregar, 'Editar playbook'));
  on(root, 'click', '[data-ia]', () => {
    $('#painel', root).innerHTML = `<form id="fi" class="card mb-4 space-y-3"><p class="caption">A IA propõe ângulos e hooks que costumam funcionar para esse tipo de produto. Você revisa num editor antes de salvar.</p>
      <div><label class="label">Para que tipo de produto?</label>
      <input class="input" name="tipo" placeholder="Ex.: suplemento para dormir melhor" required></div>
      <button class="btn-ia" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar playbook sugerido</button></form>`;
  });
  on(root, 'submit', '#fi', async (f, ev) => {
    ev.preventDefault();
    const tipo = lerForm(f).tipo; if (!tipo) return;
    await ocupado(f.querySelector('button'), async () => {
      const r = await gerarPlaybook({ tipoProduto: tipo });
      $('#painel', root).innerHTML = '';
      toast('Sugestão criada pela IA. Revise e salve.');
      abrirEditor({ nome: r.nome || `Playbook — ${tipo}`, tipoProduto: tipo, angulos: r.angulos || [], notas: r.notas || '' }, recarregar, 'Sugestão da IA (revise antes de salvar)');
    });
  });
});
