// "Perguntas para montar o site" (aba Site/Loja): roteiro de conversa com o cliente em que cada resposta grava direto
// no dado que já existe — perfil de marca, produtos, rastreamento, site de referência e o modo do site. Não há
// cadastro paralelo: só "pagamento pretendido" e "ainda não tem pixel" são campos novos, no documento do site.
import { db, COL } from '../core/storage.js';
import { normalizarRastreamento, rastreamentoDe } from '../lib/rastreamento.js';
import { abrirProduto } from './produtos.js';
import { perguntaZeroHtml, ligarPerguntaZero } from './leitura-site.js';
import { textoMarca } from '../lib/leitura.js';
import { esc, $, on, tag, toast, moeda } from '../core/ui.js';

export const PAGAMENTOS_PRETENDIDOS = [['mercado_pago', 'Mercado Pago'], ['shopify', 'Shopify'], ['stripe', 'Stripe'], ['nativa', 'Nativa da plataforma (Nuvemshop/Shopify)'], ['nao_sei', 'Ainda não sabe']];
/** Resposta da pergunta (i) -> modo do site + plataforma. */
export const FORMATOS_SITE = [['custom', 'Site simples que eu hospedo', { modo: 'custom', plataforma: null }], ['nuvemshop', 'Loja completa na Nuvemshop', { modo: 'pacote_plataforma', plataforma: 'nuvemshop' }], ['shopify', 'Loja completa na Shopify', { modo: 'pacote_plataforma', plataforma: 'shopify' }]];
export const formatoAtual = (site) => (!site?.modo ? '' : site.modo === 'custom' ? 'custom' : site.plataforma === 'shopify' ? 'shopify' : 'nuvemshop');

const cheio = (v) => Boolean(String(v ?? '').trim());
/** Quais das 10 perguntas (0 a i) já têm resposta (no dado real). Pura, para teste. */
export function respostasSite(cliente, site, produtos = []) {
  const m = cliente?.marca || {}; const r = rastreamentoDe(cliente);
  return {
    presenca: cheio(cliente?.leituraSite?.url) || Boolean(cliente?.leituraInstagram),
    produtos: produtos.length > 0, tom: cheio(m.tomDeVoz), usp: cheio(m.usp), objecoes: cheio(m.objecoes), provas: cheio(m.provasSociais),
    referencia: cheio(cliente?.siteReferencia), pixel: Boolean(r.metaPixelId || r.googleAdsId || site?.semPixel),
    pagamento: cheio(site?.pagamentoPreferido), formato: Boolean(site?.modo),
  };
}
export const progressoSite = (cliente, site, produtos) => Object.values(respostasSite(cliente, site, produtos)).filter(Boolean).length;
export const TOTAL_PERGUNTAS = 10;

/** Etiqueta "preenchido automaticamente do site, confirme ou edite" + botão Confirmar. */
const marcaAuto = (m, attrs) => (m ? `<span class="mt-1 inline-flex flex-wrap items-center gap-1"><span class="tag tag-warn"><i class="fa-solid fa-robot mr-1"></i>${esc(textoMarca(m))}</span><button type="button" class="text-xs text-indigo-600 underline" ${attrs}>Confirmar</button></span>` : '');

const TONS = ['descontraído', 'premium', 'técnico', 'acolhedor', 'divertido', 'direto'];

/**
 * Monta o card no `alvo`. ctx: { cliente, site, produtos, salvarSite(patch), recarregar(), gerar(botao) }.
 * `aberto` = começa expandido (na 1ª vez e enquanto faltar resposta).
 */
// Aberto/fechado escolhido pela pessoa, por cliente: responder (a) ou (i) recarrega a aba e o card não pode fechar sozinho.
const abertoPorCliente = new Map();

export function montarPerguntasSite(alvo, ctx, { aberto: abertoPadrao = true } = {}) {
  const aberto = abertoPorCliente.has(ctx.cliente.id) ? abertoPorCliente.get(ctx.cliente.id) : abertoPadrao;
  const { cliente, produtos } = ctx;
  const m = cliente.marca || {}; const r = rastreamentoDe(cliente);
  const resp = () => respostasSite(cliente, ctx.site, produtos);
  const pergunta = (chave, letra, titulo, destino, corpo) => `<li class="rounded-lg border border-slate-200 p-3" data-pergunta="${chave}">
    <div class="flex items-start justify-between gap-2"><p class="text-sm font-semibold">${letra}) ${titulo}</p><span data-ok="${chave}"></span></div>
    <p class="hint mb-2">Vai para: ${destino}</p>${corpo}</li>`;
  const area = (campo, valor, ph) => `<textarea class="input" rows="2" data-marca="${campo}" placeholder="${esc(ph)}">${esc(valor)}</textarea>${marcaAuto(cliente.autoPreenchido?.[campo], `data-confirmar-campo="${campo}"`)}`;

  alvo.innerHTML = `<details class="card" ${aberto ? 'open' : ''} data-perguntas-site>
    <summary class="cursor-pointer"><span class="font-semibold"><i class="fa-solid fa-clipboard-question mr-1 text-indigo-500"></i> Perguntas para montar o site</span>
      <span class="ml-2 text-sm text-slate-500" data-progresso></span></summary>
    <p class="caption mt-2">Roteiro para a conversa com o cliente, antes ou durante a criação do site. Digite a resposta na hora: cada uma é salva <b>sozinha, ao sair do campo</b>, direto no lugar certo do app (perfil de marca, produtos, rastreamento…). Não é obrigatório responder tudo — o site pode ser gerado a qualquer momento.</p>
    <ol class="mt-3 space-y-2">
      ${perguntaZeroHtml(cliente)}
      ${pergunta('produtos', 'a', 'Quais produtos você quer no site?', 'aba Produtos (nome, descrição, preço, variações e fotos)',
        `<div class="text-sm">${produtos.some((p) => p.origemAuto) ? `<p class="mb-1 flex flex-wrap items-center gap-2"><span class="tag tag-warn"><i class="fa-solid fa-robot mr-1"></i>${produtos.filter((p) => p.origemAuto).length} produto(s) ${esc(textoMarca(produtos.find((p) => p.origemAuto).origemAuto))}</span><button type="button" class="text-xs text-indigo-600 underline" data-confirmar-todos-prod>Confirmar todos</button><span class="hint">Clique no nome para conferir preço, variações e fotos.</span></p>` : ''}${produtos.length ? `<ul class="mb-2 space-y-0.5">${produtos.map((p) => `<li><button type="button" class="underline decoration-dotted" data-editar-prod="${p.id}">${esc(p.nome)}</button> <span class="hint">${p.preco ? moeda(p.precoPromocional || p.preco) : 'sem preço'}${p.fotos?.length ? ` · ${p.fotos.length} foto(s)` : ' · sem foto'}</span>${p.origemAuto ? ` <span class="tag tag-warn" title="${esc(textoMarca(p.origemAuto))}">${p.origemAuto.origem === 'instagram' ? 'do Instagram' : 'do site'}</span> <button type="button" class="text-xs text-indigo-600 underline" data-confirmar-prod="${p.id}">Confirmar</button>` : ''}</li>`).join('')}</ul>` : '<p class="hint mb-2">Nenhum produto cadastrado ainda.</p>'}
          <button type="button" class="btn-ghost btn-sm" data-novo-prod><i class="fa-solid fa-plus"></i> Cadastrar produto</button></div>`)}
      ${pergunta('tom', 'b', 'Como você descreveria o tom da sua marca? (descontraído, premium, técnico…)', 'perfil de marca → tom de voz',
        `${area('tomDeVoz', m.tomDeVoz, 'Ex.: descontraído, próximo, sem gírias')}<div class="mt-1 flex flex-wrap gap-1">${TONS.map((t) => `<button type="button" class="tag cursor-pointer" data-tom="${t}" title="Acrescentar ao campo">+ ${t}</button>`).join('')}</div>`)}
      ${pergunta('usp', 'c', 'Qual é o diferencial do seu produto/loja?', 'perfil de marca → diferencial (USP)', area('usp', m.usp, 'Ex.: tecido que não fica transparente no agachamento'))}
      ${pergunta('objecoes', 'd', 'Quais dúvidas ou objeções os clientes mais têm antes de comprar?', 'perfil de marca → objeções (vira a seção "Perguntas frequentes" do site)', area('objecoes', m.objecoes, 'Uma por linha. Ex.: E se não servir?\nDemora pra chegar?'))}
      ${pergunta('provas', 'e', 'Você tem depoimentos, prints de avaliação ou números pra mostrar? (ex.: 500 clientes atendidos)', 'perfil de marca → provas sociais', area('provasSociais', m.provasSociais, 'Ex.: 4,9 estrelas em 320 avaliações; 5 mil clientes'))}
      ${pergunta('referencia', 'f', 'Tem algum site que você gosta como referência de visual?', 'cadastro do cliente → site de referência',
        `<input class="input" data-referencia value="${esc(cliente.siteReferencia)}" placeholder="https://…">`)}
      ${pergunta('pixel', 'g', 'Você já tem Pixel do Meta ou conversão do Google Ads configurados?', 'cadastro do cliente → Rastreamento (entra sozinho no site gerado)',
        `<div class="grid gap-2 sm:grid-cols-2"><input class="input" data-pixel="metaPixelId" value="${esc(r.metaPixelId)}" placeholder="ID do Pixel do Meta (só números)">
          <input class="input" data-pixel="googleAdsId" value="${esc(r.googleAdsId ? r.googleAdsId + (r.googleAdsRotulo ? '/' + r.googleAdsRotulo : '') : '')}" placeholder="Google Ads: AW-123456789 ou AW-…/rótulo"></div>
          <label class="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" data-sem-pixel ${ctx.site?.semPixel ? 'checked' : ''}> Ainda não tem (conta como respondida; dá para cadastrar depois)</label>
          <p class="hint text-rose-600" data-erro-pixel></p>`)}
      ${pergunta('pagamento', 'h', 'Qual plataforma de pagamento você pretende usar?', 'só informativo: o manual de entrega mostra primeiro o passo a passo dessa opção',
        `<select class="input" data-pagamento><option value="">Escolha…</option>${PAGAMENTOS_PRETENDIDOS.map(([k, t]) => `<option value="${k}" ${ctx.site?.pagamentoPreferido === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
      ${pergunta('formato', 'i', 'Prefere loja completa numa plataforma pronta (Nuvemshop/Shopify) ou um site simples que eu hospedo?', 'modo do site deste cliente (site personalizado ou pacote de plataforma)',
        `<div class="flex flex-wrap gap-3 text-sm">${FORMATOS_SITE.map(([k, t]) => `<label class="flex items-center gap-1"><input type="radio" name="formatoSite" value="${k}" data-formato ${formatoAtual(ctx.site) === k ? 'checked' : ''}> ${t}</label>`).join('')}</div>`)}
    </ol>
    <div class="mt-3 rounded-lg bg-slate-50 p-3"><p class="caption mb-2"><b>Gerar site com essas respostas:</b> usa a IA para escrever os textos no modo escolhido em (i) — no site personalizado: banner, história, depoimentos-modelo, políticas e a FAQ a partir das objeções; no pacote: banners, briefing do tema e textos das páginas. Depois é só revisar e baixar abaixo. Prefere sem IA? Preencha "Conteúdo da loja" à mão.</p>
      <button type="button" class="btn-ia" data-gerar-respostas><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar site com essas respostas</button></div>
  </details>`;

  const pintar = () => {
    const rs = resp(); const n = Object.values(rs).filter(Boolean).length;
    $('[data-progresso]', alvo).innerHTML = `${n} de ${TOTAL_PERGUNTAS} perguntas respondidas ${n === TOTAL_PERGUNTAS ? tag('completo', 'tag-ok') : ''}`;
    for (const [k, ok] of Object.entries(rs)) { const s = $(`[data-ok="${k}"]`, alvo); if (s) s.innerHTML = ok ? '<i class="fa-solid fa-circle-check text-emerald-600" title="Respondida"></i>' : '<i class="fa-regular fa-circle text-slate-300" title="Sem resposta"></i>'; }
  };
  pintar();
  $('[data-perguntas-site]', alvo).addEventListener('toggle', (e) => abertoPorCliente.set(cliente.id, e.target.open));
  ligarPerguntaZero(alvo, ctx);
  // Confirmar (ou editar) um campo preenchido automaticamente tira a etiqueta: a partir daí ele conta como dado da pessoa.
  const semMarca = (campo) => { const a = { ...(cliente.autoPreenchido || {}) }; delete a[campo]; return a; };
  on(alvo, 'click', '[data-confirmar-campo]', async (b) => {
    const autoPreenchido = semMarca(b.dataset.confirmarCampo);
    Object.assign(cliente, { autoPreenchido }); await db.atualizar(COL.clientes, cliente.id, { autoPreenchido });
    b.parentElement.remove(); toast('Confirmado.');
  });
  on(alvo, 'click', '[data-confirmar-prod]', async (b) => {
    await db.atualizar(COL.produtos, b.dataset.confirmarProd, { origemAuto: null });
    const p = produtos.find((x) => x.id === b.dataset.confirmarProd); if (p) p.origemAuto = null;
    b.previousElementSibling?.remove(); b.remove(); toast('Produto confirmado.');
  });
  on(alvo, 'click', '[data-confirmar-todos-prod]', async (b) => {
    const marcados = produtos.filter((p) => p.origemAuto);
    await Promise.all(marcados.map((p) => db.atualizar(COL.produtos, p.id, { origemAuto: null })));
    marcados.forEach((p) => { p.origemAuto = null; });
    toast(`${marcados.length} produto(s) confirmado(s).`); ctx.recarregar();
  });

  const salvarCliente = async (patch, aviso) => {
    // Atualiza o objeto antes de gravar: se a pessoa sair do campo direto para "Gerar site", a IA já lê a resposta nova.
    Object.assign(cliente, patch); pintar();
    await db.atualizar(COL.clientes, cliente.id, patch); toast(aviso);
  };
  const ROTULO = { tomDeVoz: 'Tom de voz salvo no perfil de marca.', usp: 'Diferencial salvo no perfil de marca.', objecoes: 'Objeções salvas no perfil de marca (alimentam a FAQ).', provasSociais: 'Provas sociais salvas no perfil de marca.', estetica: 'Estética salva no perfil de marca.' };
  on(alvo, 'change', '[data-marca]', (t) => {
    const campo = t.dataset.marca; const valor = t.value.trim();
    if ((cliente.marca?.[campo] || '') === valor) return;
    const marcado = cliente.autoPreenchido?.[campo];
    salvarCliente({ marca: { ...(cliente.marca || {}), [campo]: valor }, ...(marcado ? { autoPreenchido: semMarca(campo) } : {}) }, ROTULO[campo]);
    if (marcado) t.parentElement.querySelector('.tag-warn')?.parentElement.remove();
  });
  on(alvo, 'click', '[data-tom]', (b) => {
    const t = $('[data-marca="tomDeVoz"]', alvo); const atual = t.value.trim();
    if (atual.toLowerCase().includes(b.dataset.tom)) return;
    t.value = atual ? `${atual}, ${b.dataset.tom}` : b.dataset.tom; t.dispatchEvent(new Event('change', { bubbles: true }));
  });
  on(alvo, 'change', '[data-referencia]', (i) => salvarCliente({ siteReferencia: i.value.trim() }, 'Site de referência salvo no cadastro do cliente.'));
  on(alvo, 'change', '[data-pixel]', () => {
    const meta = $('[data-pixel="metaPixelId"]', alvo).value, google = $('[data-pixel="googleAdsId"]', alvo).value;
    const { valor, erros } = normalizarRastreamento({ metaPixelId: meta, googleAdsId: google });
    $('[data-erro-pixel]', alvo).textContent = erros.join(' ');
    if (erros.length) return; // não grava um ID inválido; o texto fica no campo para corrigir
    salvarCliente({ rastreamento: valor }, 'Rastreamento salvo no cadastro do cliente.');
  });
  on(alvo, 'change', '[data-sem-pixel]', async (c) => { await ctx.salvarSite({ semPixel: c.checked }); pintar(); });
  on(alvo, 'change', '[data-pagamento]', async (s) => { await ctx.salvarSite({ pagamentoPreferido: s.value || null }); pintar(); toast('Forma de pagamento anotada: o manual de entrega vai destacá-la.'); });
  on(alvo, 'change', '[data-formato]', async (i) => {
    const escolha = FORMATOS_SITE.find(([k]) => k === i.value)[2];
    await ctx.salvarSite(escolha); toast(escolha.modo === 'custom' ? 'Modo: site personalizado.' : `Modo: pacote para ${escolha.plataforma === 'shopify' ? 'Shopify' : 'Nuvemshop'}.`);
    ctx.recarregar(); // o resto da aba muda conforme o modo
  });
  on(alvo, 'click', '[data-novo-prod]', () => abrirProduto(cliente, null, ctx.recarregar));
  on(alvo, 'click', '[data-editar-prod]', (b) => abrirProduto(cliente, produtos.find((p) => p.id === b.dataset.editarProd), ctx.recarregar));
  on(alvo, 'click', '[data-gerar-respostas]', (b) => {
    if (!ctx.site?.modo) { toast('Responda a pergunta (i) primeiro: ela decide se é site personalizado ou pacote de plataforma.', 'erro'); $('[data-pergunta="formato"]', alvo).scrollIntoView({ block: 'center' }); return; }
    ctx.gerar(b);
  });
}
