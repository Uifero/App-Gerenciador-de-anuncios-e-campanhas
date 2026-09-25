// Aba Produtos: catálogo do cliente (base do site e do CSV de importação).
import { db, COL, removerArquivo } from '../core/storage.js';
import { esc, $, on, montar, cabecalho, vazio, tag, dataBR, moeda, toast, ocupado, lerForm, num, confirmar, modal, campoArquivo } from '../core/ui.js';
import { enviarArquivoOuAvisar } from '../lib/uploads.js';

/** "Cor: Preto, Branco\nTamanho: P, M" -> [{nome:'Cor', valores:['Preto','Branco']}, ...] */
export function parseVariacoes(txt) {
  return String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [nome, resto = ''] = l.split(':');
    return { nome: nome.trim(), valores: resto.split(',').map((v) => v.trim()).filter(Boolean) };
  }).filter((v) => v.nome && v.valores.length);
}
const variacoesTexto = (vs = []) => vs.map((v) => `${v.nome}: ${v.valores.join(', ')}`).join('\n');

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const produtos = await db.listar(COL.produtos, { clienteId: cliente.id });

  root.innerHTML = `${cabecalho('Produtos', 'Catálogo do cliente. É a base do site e do arquivo de importação para Shopify/Nuvemshop (aba Site/Loja), e aparece para escolher ao criar um criativo (aba Criativos).',
    '<button class="btn-primary" data-novo title="Cadastrar um produto"><i class="fa-solid fa-plus"></i> Novo produto</button>')}
    ${produtos.length ? `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">${produtos.map((p) => `<button data-abrir="${p.id}" class="card text-left transition hover:border-indigo-400 hover:shadow-md">
      <div class="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-300">${p.fotos?.[0] ? `<img src="${esc(p.fotos[0].url)}" alt="${esc(p.nome)}" class="h-full w-full object-cover" loading="lazy">` : '<i class="fa-solid fa-image text-3xl"></i>'}</div>
      <h3 class="font-semibold leading-tight">${esc(p.nome)}</h3>
      <p class="text-sm">${p.precoPromocional ? `<s class="text-slate-400">${moeda(p.preco)}</s> <b>${moeda(p.precoPromocional)}</b>` : `<b>${moeda(p.preco)}</b>`}</p>
      <div class="mt-2 flex flex-wrap gap-1">${p.categoria ? tag(p.categoria, 'tag-info') : ''}${(p.variacoes || []).map((v) => tag(v.nome)).join('')}${p.destaque ? tag('mais vendido', 'tag-ok') : ''}${p.fotos?.length ? tag(p.fotos.length + ' foto(s)') : tag('sem foto', 'tag-warn')}</div>
      <p class="hint mt-2">${dataBR(p.criadoEm)}</p></button>`).join('')}</div>`
      : vazio('box', 'Nenhum produto cadastrado', 'Cadastre os produtos para montar o site ou o pacote da loja.', '<button class="btn-primary" data-novo>Cadastrar produto</button>')}`;

  on(root, 'click', '[data-novo]', () => abrirProduto(cliente, null, recarregar));
  on(root, 'click', '[data-abrir]', (b) => abrirProduto(cliente, produtos.find((x) => x.id === b.dataset.abrir), recarregar));
});

const form = (p = {}) => `<form id="fp" class="space-y-3">
  <div><label class="label">Nome *</label><input class="input" name="nome" value="${esc(p.nome)}"></div>
  <div class="grid grid-cols-2 gap-3"><div><label class="label">Preço (R$) *</label><input class="input" type="number" step="0.01" min="0" name="preco" value="${esc(p.preco)}"></div>
    <div><label class="label">Categoria</label><input class="input" name="categoria" value="${esc(p.categoria)}" placeholder="Ex.: Leggings"></div></div>
  <div><label class="label">Descrição</label><textarea class="input" rows="3" name="descricao">${esc(p.descricao)}</textarea></div>
  <div><label class="label">Variações (uma por linha)</label><textarea class="input" rows="2" name="variacoes" placeholder="Cor: Preto, Branco&#10;Tamanho: P, M, G">${esc(variacoesTexto(p.variacoes))}</textarea>
    <p class="hint">Formato "Nome: valor, valor". Até 3 tipos de variação.</p></div>
  <div><label class="label">Fotos</label>${campoArquivo({ attrs: 'name="fotos"', accept: 'image/*', multiple: true, icone: 'camera', texto: (p.fotos || []).length ? 'Adicionar mais fotos do produto' : 'Enviar fotos do produto (JPG/PNG)', destaque: false, dica: 'Pode escolher várias de uma vez. Elas sobem quando você clicar em "Salvar produto".' })}
    ${(p.fotos || []).length ? `<div class="mt-2 flex flex-wrap gap-2">${p.fotos.map((f, i) => `<span class="relative"><img src="${esc(f.url)}" class="h-16 w-16 rounded object-cover" alt=""><button type="button" data-rmfoto="${i}" title="Remover esta foto" class="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1 text-xs text-white">×</button></span>`).join('')}</div>` : ''}</div>
  <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções (promoção, destaque)</summary>
    <div class="mt-3 space-y-3"><div><label class="label">Preço promocional (R$)</label><input class="input" type="number" step="0.01" min="0" name="precoPromocional" value="${esc(p.precoPromocional)}">
      <p class="hint">Aparece na seção "Sale" do site e como "preço promocional" no CSV.</p></div>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="destaque" ${p.destaque ? 'checked' : ''}> Mostrar em "Mais vendidos"</label></div></details>
  <div class="flex justify-between"><button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar produto</button>
    ${p.id ? '<button class="btn-danger" type="button" data-apagar>Apagar</button>' : ''}</div></form>`;

/** Janela de cadastro/edição de produto. Também usada pela pergunta "Quais produtos você quer no site?" (aba Site/Loja). */
export function abrirProduto(cliente, p, aoSalvar) {
  const m = modal(p ? 'Editar produto' : 'Novo produto', form(p || {}));
  let fotos = [...(p?.fotos || [])];
  on(m.el, 'click', '[data-rmfoto]', async (b) => {
    const [f] = fotos.splice(Number(b.dataset.rmfoto), 1); await removerArquivo(f.path);
    $('#fp', m.el).outerHTML = form({ ...p, ...lerForm($('#fp', m.el)), fotos });
  });
  on(m.el, 'submit', '#fp', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    if (!v.nome || v.preco === '') return toast('Informe nome e preço.', 'erro');
    await ocupado(f.querySelector('[type=submit]'), async () => {
      const dados = {
        clienteId: cliente.id, nome: v.nome, preco: num(v.preco), categoria: v.categoria || '', descricao: v.descricao || '',
        variacoes: parseVariacoes(v.variacoes), precoPromocional: num(v.precoPromocional), destaque: f.elements.destaque.checked,
      };
      const id = p ? p.id : (await db.criar(COL.produtos, { ...dados, fotos })).id;
      const novas = [...f.elements.fotos.files];
      for (const arq of novas) {
        const r = await enviarArquivoOuAvisar(`gcc/${cliente.id}/produtos/${id}/${Date.now()}_${arq.name.replace(/[^\w.-]/g, '_')}`, arq);
        fotos.push({ url: r.url, path: r.path });
      }
      await db.atualizar(COL.produtos, id, { ...dados, fotos, origemAuto: null }); // salvar no formulário = a pessoa conferiu (tira a marca "do site")
      toast('Produto salvo.'); m.fechar(); aoSalvar?.();
    });
  });
  on(m.el, 'click', '[data-apagar]', async () => {
    if (!(await confirmar('Apagar este produto e as fotos dele?', 'Apagar'))) return;
    for (const f of fotos) await removerArquivo(f.path);
    await db.remover(COL.produtos, p.id); m.fechar(); aoSalvar?.(); toast('Produto apagado.');
  });
}
