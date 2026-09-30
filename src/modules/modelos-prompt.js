// Aba global "Modelos de Prompt" (#/modelos) e a mesma biblioteca aberta de dentro do Estúdio ("Usar um modelo
// pronto"). A biblioteca é fixa (lib/modelos-prompt.js); nada é salvo. Fluxo: escolher um modelo -> preencher os
// marcadores (à mão, com o cadastro sem IA, ou com IA usando os dados do cliente) -> copiar o prompt em inglês
// (tradução embaixo) e colar numa das IAs de imagem da lista — o mesmo formato do "Sugerir prompts".
import { db, COL } from '../core/storage.js';
import { preencherModeloPrompt } from '../core/ia.js';
import { CATEGORIAS_MODELO, MODELOS_PROMPT, MARCADORES, modeloPorId, marcadoresDe, preencherModelo, valoresDoCadastro, valoresDaIa } from '../lib/modelos-prompt.js';
import { htmlFerramentas } from '../lib/ferramentas-ia.js';
import { $, esc, on, cabecalho, modal, toast, ocupado, copiar } from '../core/ui.js';

export const LEGENDA_MODELOS = 'Modelos prontos para editar ou gerar fotos de produto. Escolha um, ajuste com os dados do cliente, e use numa das IAs de imagem gratuitas ou pagas.';

/** Cor da marca já cadastrada: a escolhida no Estúdio (guardada neste navegador) ou a cor principal do site. */
export function corDaMarca(cliente, site) {
  let cor = '';
  try { cor = JSON.parse(localStorage.getItem(`gcc_estudio_${cliente.id}`) || '{}').cor || ''; } catch { /* sem armazenamento */ }
  return cor || site?.config?.corPrimaria || '';
}

// ---------- aba global ----------
export async function view(el) {
  const clientes = (await db.listar(COL.clientes)).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  el.innerHTML = `${cabecalho('Modelos de Prompt', LEGENDA_MODELOS)}
    <div class="card mb-4 grid gap-3 sm:grid-cols-2">
      <div><label class="label">Cliente (opcional)</label><select class="input" data-cliente-modelo><option value="">Nenhum — só ver os modelos</option>${clientes.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}</select>
        <p class="hint">Com um cliente escolhido, dá para preencher os campos com os dados dele (produto, diferencial, cor da marca), com ou sem IA.</p></div>
      <div data-produto-slot></div></div>
    <div data-biblioteca></div>`;
  const ctx = { cliente: null, produtos: [], site: null, criativo: null };
  const montar = () => montarBiblioteca($('[data-biblioteca]', el), ctx);
  on(el, 'change', '[data-cliente-modelo]', async (s) => {
    ctx.cliente = clientes.find((c) => c.id === s.value) || null;
    [ctx.produtos, ctx.site] = ctx.cliente ? await Promise.all([db.listar(COL.produtos, { clienteId: ctx.cliente.id }), db.listar(COL.sites, { clienteId: ctx.cliente.id }).then((l) => l[0] || null)]) : [[], null];
    montar();
  });
  montar();
}

// ---------- dentro do Estúdio ----------
/**
 * Abre a biblioteca num modal, já com o cliente (e o criativo) do Estúdio. `categorias` filtra as relevantes;
 * `aoUsarNoGerador(promptEn)` (opcional) mostra o botão que manda o prompt para o "Gerar imagem com IA" do Estúdio.
 */
export async function abrirBiblioteca({ cliente, criativo = null, categorias = null, aoUsarNoGerador = null }) {
  const [produtos, sites] = await Promise.all([db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.sites, { clienteId: cliente.id })]);
  const m = modal(`Usar um modelo pronto — ${cliente.nome}`, `<p class="caption mb-3">${esc(LEGENDA_MODELOS)}</p><div data-biblioteca></div>`, { largo: true });
  montarBiblioteca($('[data-biblioteca]', m.el), { cliente, produtos, site: sites[0] || null, criativo, categorias, aoUsarNoGerador: aoUsarNoGerador && ((p) => { aoUsarNoGerador(p); m.fechar(); }) });
  return m;
}

// ---------- lista + detalhe (compartilhado) ----------
function montarBiblioteca(destino, ctx) {
  destino.innerHTML = '<div></div>';
  const alvo = destino.firstElementChild; // nó novo a cada montagem: os eventos antigos vão embora com o nó antigo
  const est = { modelo: null, valores: {}, marcadores: [] }; // modelo aberto agora
  const cats = CATEGORIAS_MODELO.filter(([k]) => !ctx.categorias || ctx.categorias.includes(k));
  const lista = () => {
    alvo.innerHTML = `${ctx.categorias ? `<p class="hint mb-2">Mostrando as categorias que servem aqui: ${esc(cats.map(([, n]) => n).join(', '))}. Todas estão na aba "Modelos de Prompt", no topo.</p>` : ''}
      ${cats.map(([k, nome, legenda]) => `<section class="mb-5" data-categoria="${k}"><h3 class="font-semibold">${esc(nome)}</h3><p class="caption mb-2">${esc(legenda)}</p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${MODELOS_PROMPT.filter((x) => x.categoria === k).map((x) => `<div class="card flex flex-col" data-modelo-card="${x.id}">
          <h4 class="font-semibold">${esc(x.titulo)}</h4>
          <p class="mt-1 text-sm"><b>Envie:</b> ${esc(x.envie)}</p><p class="text-sm"><b>Resultado:</b> ${esc(x.resultado)}</p>
          <button class="btn-primary btn-sm mt-auto self-start" style="margin-top:0.75rem" data-usar-modelo="${x.id}"><i class="fa-solid fa-wand-magic-sparkles"></i> Usar este modelo</button></div>`).join('')}</div></section>`).join('')}`;
  };
  on(alvo, 'click', '[data-usar-modelo]', (b) => detalhe(modeloPorId(b.dataset.usarModelo)));
  on(alvo, 'click', '[data-voltar-lista]', () => { lista(); alvo.scrollIntoView({ block: 'start' }); });

  const detalhe = (modelo) => {
    const marcadores = marcadoresDe(modelo);
    Object.assign(est, { modelo, valores: {}, marcadores });
    alvo.innerHTML = htmlDetalhe(modelo, marcadores);
    atualizar();
    alvo.scrollIntoView({ block: 'start' });
  };
  const produtoAtual = () => ctx.produtos.find((p) => p.id === $('[data-produto-modelo]', alvo)?.value) || null;
  const htmlDetalhe = (modelo, marcadores) => `<div class="card" data-modelo-aberto="${modelo.id}">
      <button class="btn-ghost btn-sm mb-2" data-voltar-lista><i class="fa-solid fa-arrow-left"></i> Voltar aos modelos</button>
      <h3 class="text-lg font-semibold">${esc(modelo.titulo)} <span class="tag">${esc(CATEGORIAS_MODELO.find(([k]) => k === modelo.categoria)[1])}</span></h3>
      <p class="mt-1 text-sm"><b>Envie para a IA de imagem:</b> ${esc(modelo.envie)}</p><p class="text-sm"><b>O que sai:</b> ${esc(modelo.resultado)}</p>
      <h4 class="mt-4 text-sm font-semibold">1. Preencha os campos entre colchetes</h4>
      ${ctx.cliente ? `<div class="mt-2 flex flex-wrap items-end gap-2"><div><label class="label">Produto</label><select class="input" data-produto-modelo>${ctx.produtos.length ? ctx.produtos.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('') : '<option value="">Nenhum produto cadastrado</option>'}</select></div>
          <button class="btn-ghost btn-sm" data-preencher-cadastro title="Copia o que já está cadastrado (nome, preço, diferencial, cor da marca), sem IA"><i class="fa-solid fa-clipboard-list"></i> Usar dados do cadastro (sem IA)</button>
          <button class="btn-ia btn-sm" data-preencher-ia title="A IA preenche com o catálogo, o perfil de marca e a cor da marca (modelo leve, alguns segundos)"><i class="fa-solid fa-wand-magic-sparkles"></i> Preencher com os dados deste cliente</button></div>`
        : '<p class="hint mt-1">Digite cada campo à mão. Para preencher com os dados de um cliente, escolha o cliente no topo desta página (ou abra os modelos pelo Estúdio de um criativo).</p>'}
      <div class="mt-3 grid gap-3 sm:grid-cols-2">${marcadores.map((k) => `<div><label class="label">${esc(k)}</label><input class="input" data-marcador="${esc(k)}" placeholder="${esc(MARCADORES[k]?.dica || 'Preencha')}">
        <p class="hint" data-en-de="${esc(k)}"></p></div>`).join('')}</div>
      <h4 class="mt-4 text-sm font-semibold">2. Copie o prompt e cole numa IA de imagem</h4>
      <div class="mt-2 rounded-lg bg-slate-50 p-2"><div class="mb-1 flex items-center justify-between gap-2"><b class="text-xs text-slate-600">Prompt (em inglês: as IAs de imagem entendem melhor)</b>
        <button class="btn-ghost btn-sm" data-copiar-modelo>Copiar (inglês)</button></div>
        <p class="whitespace-pre-wrap text-sm" data-prompt-en></p>
        <p class="mt-1 whitespace-pre-wrap border-t border-slate-200 pt-1 text-xs text-slate-500"><b>Tradução:</b> <span data-prompt-pt></span></p></div>
      <p class="mt-1 text-xs font-medium text-amber-700" data-faltam></p>
      ${ctx.aoUsarNoGerador ? `<div class="mt-2 rounded-lg border border-violet-200 p-2 text-sm"><button class="btn-ia btn-sm" data-usar-gerador><i class="fa-solid fa-arrow-right"></i> Usar no "Gerar imagem com IA" do Estúdio</button>
        <p class="hint">O gerador do Estúdio cria a imagem só a partir do texto: ele não recebe a foto do produto. Para modelos que pedem foto anexada, o resultado fica melhor numa das ferramentas abaixo.</p></div>` : ''}
      <div class="mt-3">${htmlFerramentas({ grupos: ['imagem'], titulo: `Cole esse prompt numa dessas ferramentas e anexe: ${modelo.envie.charAt(0).toLowerCase()}${modelo.envie.slice(1)}` })}</div>
      <p class="hint mt-2"><b>Próximo passo:</b> baixe a imagem que a ferramenta criar e envie no Estúdio do criativo ("1. Materiais") para montar a peça, ou use direto no anúncio.</p></div>`;

  const atualizar = () => {
    const { modelo, valores, marcadores } = est;
    const r = preencherModelo(modelo, valores);
    $('[data-prompt-en]', alvo).textContent = r.en; $('[data-prompt-pt]', alvo).textContent = r.pt;
    $('[data-faltam]', alvo).textContent = r.faltam.length ? `Ainda entre colchetes: ${r.faltam.join(', ')}. Preencha acima ou deixe assim (a IA de imagem decide).` : '';
    for (const k of marcadores) {
      const v = valores[k]; const dica = $(`[data-en-de="${CSS.escape(k)}"]`, alvo);
      if (dica) dica.textContent = v && typeof v === 'object' && v.en && v.en !== v.pt ? `No prompt em inglês: ${v.en}` : '';
    }
  };
  const aplicar = (novos, { soVazios = false } = {}) => {
    const { valores } = est;
    let n = 0;
    for (const [k, v] of Object.entries(novos)) {
      const campo = $(`[data-marcador="${CSS.escape(k)}"]`, alvo); if (!campo || (soVazios && campo.value.trim())) continue;
      valores[k] = v; campo.value = typeof v === 'object' ? v.pt || v.en : v; n++;
    }
    atualizar(); return n;
  };
  // Eventos registrados UMA vez (valem para o modelo aberto no momento, via est).
  on(alvo, 'input', '[data-marcador]', (i) => { est.valores[i.dataset.marcador] = i.value; atualizar(); }); // digitado vale para os dois idiomas
  on(alvo, 'click', '[data-preencher-cadastro]', () => {
    const n = aplicar(valoresDoCadastro({ cliente: ctx.cliente, produto: produtoAtual(), produtos: ctx.produtos, corMarca: corDaMarca(ctx.cliente, ctx.site), criativo: ctx.criativo }));
    toast(n ? `${n} campo(s) preenchido(s) com o cadastro. Confira e complete o resto.` : 'O cadastro não tem esses dados: digite à mão ou use a IA.', n ? 'ok' : 'info');
  });
  on(alvo, 'click', '[data-preencher-ia]', (b) => ocupado(b, async () => {
    const r = await preencherModeloPrompt({ cliente: ctx.cliente, modelo: est.modelo, marcadores: est.marcadores, produto: produtoAtual(), produtos: ctx.produtos, corMarca: corDaMarca(ctx.cliente, ctx.site), criativo: ctx.criativo });
    const n = aplicar(valoresDaIa(est.modelo, r));
    toast(n ? `A IA preencheu ${n} campo(s) com os dados de ${ctx.cliente.nome}. Confira antes de copiar.` : 'A IA não achou dados reais para esses campos: preencha à mão.', n ? 'ok' : 'info');
  }));
  on(alvo, 'click', '[data-copiar-modelo]', () => copiar($('[data-prompt-en]', alvo).textContent));
  on(alvo, 'click', '[data-usar-gerador]', () => ctx.aoUsarNoGerador($('[data-prompt-en]', alvo).textContent));
  lista();
}
