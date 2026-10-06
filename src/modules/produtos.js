// Aba Produtos: catálogo do cliente (base do site e do CSV de importação).
// Fotos: um lugar só, os Materiais do cliente. A foto enviada aqui vai para Materiais já ligada ao produto ("Usar em");
// as fotos antigas do campo do produto são migradas para Materiais (mesmos arquivos) na primeira vez que a tela abre.
import { db, COL } from '../core/storage.js';
import { esc, $, on, montar, cabecalho, vazio, tag, dataBR, moeda, toast, ocupado, lerForm, num, confirmar, modal, campoArquivo } from '../core/ui.js';
import { migrarFotosProdutos, enviarFotoDoProduto, garantirCodigos, salvarUsos } from '../lib/materiais.js';
import { fotosDoProduto, mudarUso, semProduto } from '../lib/fotos-site.js';
import { excluirMateriais } from './excluir-material.js';

/** Migra uma vez por sessão por cliente (é idempotente; isto só evita reler à toa). Avisa quantas fotos migrou. */
const migrados = new Set();
export async function garantirMigracaoFotos(cliente) {
  if (migrados.has(cliente.id)) return null;
  const r = await migrarFotosProdutos(cliente);
  migrados.add(cliente.id);
  if (r.fotos) toast(`Fotos dos produtos agora ficam em Materiais do cliente: ${r.fotos} foto(s) de ${r.produtos} produto(s), os mesmos arquivos, na mesma ordem e com a mesma foto principal.`, 'info');
  return r;
}

/** "Cor: Preto, Branco\nTamanho: P, M" -> [{nome:'Cor', valores:['Preto','Branco']}, ...] */
export function parseVariacoes(txt) {
  return String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [nome, resto = ''] = l.split(':');
    return { nome: nome.trim(), valores: resto.split(',').map((v) => v.trim()).filter(Boolean) };
  }).filter((v) => v.nome && v.valores.length);
}
const variacoesTexto = (vs = []) => vs.map((v) => `${v.nome}: ${v.valores.join(', ')}`).join('\n');

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  await garantirMigracaoFotos(cliente);
  const [produtos, materiais] = await Promise.all([db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.materiais, { clienteId: cliente.id })]);
  const fotos = (p) => fotosDoProduto(p, materiais);

  root.innerHTML = `${cabecalho('Produtos', 'Catálogo do cliente. É a base do site e do arquivo de importação para Shopify/Nuvemshop (aba Site/Loja), e aparece para escolher ao criar um criativo (aba Criativos).',
    '<button class="btn-primary" data-novo title="Cadastrar um produto"><i class="fa-solid fa-plus"></i> Novo produto</button>')}
    ${produtos.length ? `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">${produtos.map((p) => `<button data-abrir="${p.id}" class="card text-left transition hover:border-indigo-400 hover:shadow-md">
      <div class="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-300">${fotos(p)[0] ? `<img src="${esc(fotos(p)[0].url)}" alt="${esc(p.nome)}" class="h-full w-full object-cover" loading="lazy">` : '<i class="fa-solid fa-image text-3xl"></i>'}</div>
      <h3 class="font-semibold leading-tight">${esc(p.nome)}</h3>
      <p class="text-sm">${p.precoPromocional ? `<s class="text-slate-400">${moeda(p.preco)}</s> <b>${moeda(p.precoPromocional)}</b>` : `<b>${moeda(p.preco)}</b>`}</p>
      <div class="mt-2 flex flex-wrap gap-1">${p.categoria ? tag(p.categoria, 'tag-info') : ''}${(p.variacoes || []).map((v) => tag(v.nome)).join('')}${p.destaque ? tag('mais vendido', 'tag-ok') : ''}${fotos(p).length ? tag(fotos(p).length + ' foto(s)') : tag('sem foto', 'tag-warn')}</div>
      <p class="hint mt-2">${dataBR(p.criadoEm)}</p></button>`).join('')}</div>`
      : vazio('box', 'Nenhum produto cadastrado', 'Cadastre os produtos para montar o site ou o pacote da loja.', '<button class="btn-primary" data-novo>Cadastrar produto</button>')}`;

  on(root, 'click', '[data-novo]', () => abrirProduto(cliente, null, recarregar));
  on(root, 'click', '[data-abrir]', (b) => abrirProduto(cliente, produtos.find((x) => x.id === b.dataset.abrir), recarregar));
});

const form = (p = {}, fotos = []) => `<form id="fp" class="space-y-3">
  <div><label class="label">Nome *</label><input class="input" name="nome" value="${esc(p.nome)}"></div>
  <div class="grid grid-cols-2 gap-3"><div><label class="label">Preço (R$) *</label><input class="input" type="number" step="0.01" min="0" name="preco" value="${esc(p.preco)}"></div>
    <div><label class="label">Categoria</label><input class="input" name="categoria" value="${esc(p.categoria)}" placeholder="Ex.: Leggings"></div></div>
  <div><label class="label">Descrição</label><textarea class="input" rows="3" name="descricao">${esc(p.descricao)}</textarea></div>
  <div><label class="label">Variações (uma por linha)</label><textarea class="input" rows="2" name="variacoes" placeholder="Cor: Preto, Branco&#10;Tamanho: P, M, G">${esc(variacoesTexto(p.variacoes))}</textarea>
    <p class="hint">Formato "Nome: valor, valor". Até 3 tipos de variação.</p></div>
  <div><label class="label">Fotos</label>${campoArquivo({ attrs: 'name="fotos"', accept: 'image/png,image/jpeg,image/webp', multiple: true, icone: 'camera', texto: fotos.length ? 'Adicionar mais fotos do produto' : 'Enviar fotos do produto (JPG/PNG)', destaque: false, dica: 'Fotos originais do produto (JPG ou PNG, sem passar pelo WhatsApp). Elas vão para Materiais do cliente, já ligadas a este produto ("Usar em"), e sobem quando você clicar em "Salvar produto".' })}
    ${fotos.length ? `<div class="mt-2 flex flex-wrap gap-2" data-fotos-produto>${fotos.map((f, i) => `<span class="relative" title="${esc(f.codigo ? `${f.codigo} — ${f.nome}` : f.nome)}"><img src="${esc(f.url)}" class="h-16 w-16 rounded object-cover ${i === 0 ? 'ring-2 ring-indigo-500' : ''}" alt="">
      ${f.codigo ? `<span class="absolute left-0.5 top-0.5 rounded px-1 text-[10px] font-bold" style="background:rgba(0,0,0,.78);color:#fff">${esc(f.codigo)}</span>` : ''}
      ${f.materialId ? `<button type="button" data-rmfoto="${esc(f.materialId)}" title="Tirar esta foto do produto (ela continua em Materiais)" class="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1 text-xs text-white">×</button>${i ? `<button type="button" data-principal="${esc(f.materialId)}" title="Usar como foto principal" class="absolute -bottom-1 -right-1 rounded-full bg-indigo-600 px-1 text-[10px] text-white">★</button>` : ''}
      <button type="button" data-excluir-foto-produto="${esc(f.materialId)}" title="Excluir a foto (sai de Materiais e de todo lugar)" class="absolute -bottom-1 -left-1 rounded-full bg-slate-800 px-1 text-[10px] text-white"><i class="fa-solid fa-trash"></i></button>` : ''}</span>`).join('')}</div>
      <p class="hint">A 1ª (com borda) é a foto principal. ★ troca a principal; × tira a foto só deste produto (ela continua em Materiais); a lixeira exclui a foto de vez (a confirmação diz onde mais ela está em uso).</p>` : ''}</div>
  <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções (promoção, destaque, fórmula e benefícios)</summary>
    <div class="mt-3 space-y-3"><div><label class="label">Preço promocional (R$)</label><input class="input" type="number" step="0.01" min="0" name="precoPromocional" value="${esc(p.precoPromocional)}">
      <p class="hint">Aparece na seção "Sale" do site e como "preço promocional" no CSV.</p></div>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="destaque" ${p.destaque ? 'checked' : ''}> Mostrar em "Mais vendidos"</label>
      <p class="text-sm font-medium">Página do produto (opcional)</p>
      <p class="hint !mt-0">Só fatos reais do produto. Aparecem como seções na página do produto quando o plano do site pede; a IA nunca inventa estes dados.</p>
      <div><label class="label">Fórmula / ingredientes</label><textarea class="input" rows="2" name="formula">${esc(p.formula)}</textarea></div>
      <div><label class="label">Benefícios</label><textarea class="input" rows="2" name="beneficios">${esc(p.beneficios)}</textarea></div>
      <div><label class="label">Modo de uso</label><textarea class="input" rows="2" name="modoUso">${esc(p.modoUso)}</textarea></div></div></details>
  <div class="flex justify-between"><button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar produto</button>
    ${p.id ? '<button class="btn-danger" type="button" data-apagar>Apagar</button>' : ''}</div></form>`;

/** Janela de cadastro/edição de produto. Também usada pela pergunta "Quais produtos você quer no site?" (aba Site/Loja). */
export async function abrirProduto(cliente, p, aoSalvar) {
  await garantirMigracaoFotos(cliente);
  if (p?.id) p = (await db.obter(COL.produtos, p.id)) || p; // sempre o registro do banco (quem chama pode ter a lista com as fotos já montadas)
  let materiais = await db.listar(COL.materiais, { clienteId: cliente.id });
  const fotosAtuais = () => (p ? fotosDoProduto(p, materiais) : []);
  const m = modal(p ? 'Editar produto' : 'Novo produto', form(p || {}, fotosAtuais()));
  const redesenhar = () => { $('#fp', m.el).outerHTML = form({ ...p, ...lerForm($('#fp', m.el)) }, fotosAtuais()); };
  const mudarFoto = async (materialId, opcoes, aviso) => {
    const patches = mudarUso(materiais, materialId, { uso: 'produto', produtoId: p.id, ...opcoes });
    await salvarUsos(patches);
    materiais = await db.listar(COL.materiais, { clienteId: cliente.id });
    redesenhar(); toast(aviso);
    document.dispatchEvent(new CustomEvent('gcc:materiais', { detail: { clienteId: cliente.id, lista: materiais } }));
  };
  on(m.el, 'click', '[data-rmfoto]', (b) => ocupado(b, () => mudarFoto(b.dataset.rmfoto, { ligado: false }, 'Foto tirada do produto. Ela continua em Materiais do cliente.')));
  on(m.el, 'click', '[data-principal]', (b) => ocupado(b, () => mudarFoto(b.dataset.principal, { ligado: true, principal: true }, 'Foto principal trocada.')));
  on(m.el, 'click', '[data-excluir-foto-produto]', (b) => ocupado(b, async () => {
    const x = materiais.find((y) => y.id === b.dataset.excluirFotoProduto); if (!x) return;
    await excluirMateriais(cliente, [x], { aoExcluir: (lista) => { materiais = lista; redesenhar(); } });
  }));
  on(m.el, 'submit', '#fp', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    if (!v.nome || v.preco === '') return toast('Informe nome e preço.', 'erro');
    await ocupado(f.querySelector('[type=submit]'), async () => {
      const dados = {
        clienteId: cliente.id, nome: v.nome, preco: num(v.preco), categoria: v.categoria || '', descricao: v.descricao || '',
        variacoes: parseVariacoes(v.variacoes), precoPromocional: num(v.precoPromocional), destaque: f.elements.destaque.checked,
        formula: (v.formula || '').trim(), beneficios: (v.beneficios || '').trim(), modoUso: (v.modoUso || '').trim(),
      };
      // Produto novo já nasce no modelo novo: fotos só em Materiais (o campo antigo fica vazio).
      const id = p ? p.id : (await db.criar(COL.produtos, { ...dados, fotos: [], fotosMigradas: true })).id;
      const novas = [...f.elements.fotos.files], falhas = [];
      for (const arq of novas) {
        try { materiais = [...materiais, await enviarFotoDoProduto(cliente, id, arq, materiais)]; } catch (e) { falhas.push(e.message); }
      }
      if (novas.length) { materiais = await garantirCodigos(cliente, await db.listar(COL.materiais, { clienteId: cliente.id })); document.dispatchEvent(new CustomEvent('gcc:materiais', { detail: { clienteId: cliente.id, lista: materiais } })); }
      await db.atualizar(COL.produtos, id, { ...dados, origemAuto: null }); // salvar no formulário = a pessoa conferiu (tira a marca "do site")
      if (falhas.length) toast(`${falhas.length} foto(s) não enviada(s):\n${falhas.join('\n')}`, 'erro');
      toast(novas.length - falhas.length ? `Produto salvo. ${novas.length - falhas.length} foto(s) em Materiais do cliente, ligada(s) a este produto.` : 'Produto salvo.'); m.fechar(); aoSalvar?.();
    });
  });
  on(m.el, 'click', '[data-apagar]', async () => {
    if (!(await confirmar('Apagar este produto? As fotos dele continuam em Materiais do cliente (só deixam de estar ligadas a ele).', 'Apagar'))) return;
    await salvarUsos(semProduto(materiais, p.id)); // vínculo sai junto; o arquivo fica em Materiais
    await db.remover(COL.produtos, p.id); m.fechar(); aoSalvar?.(); toast('Produto apagado. As fotos continuam em Materiais do cliente.');
  });
}
