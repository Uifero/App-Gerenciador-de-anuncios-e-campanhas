// "Perguntas para montar o site e os anúncios" (aba Site/Loja e aba Criativos): questionário ÚNICO de 18 perguntas
// (lib/questionario.js, ids estáveis) em que cada resposta grava direto no dado que já existe — perfil de marca,
// produtos, cadastro do cliente, rastreamento e o modo do site. Não há cadastro paralelo.
// Embaixo do card: "Copiar perguntas para enviar ao cliente" e "Colar a resposta do cliente" (modules/respostas-cliente.js).
import { db, COL } from '../core/storage.js';
import { normalizarRastreamento, rastreamentoDe } from '../lib/rastreamento.js';
import { PERGUNTAS, BLOCOS_Q, TOTAL_PERGUNTAS as TOTAL, respondidas, PAGAMENTOS_PRETENDIDOS as PAGS, FORMATOS_SITE as FORMATOS, formatoAtual as fmt } from '../lib/questionario.js';
import { abrirProduto } from './produtos.js';
import { perguntaZeroHtml, ligarPerguntaZero } from './leitura-site.js';
import { montarRespostasCliente } from './respostas-cliente.js';
import { provaSocialHtml, ligarProvaSocial } from './prova-social.js';
import { textoMarca } from '../lib/leitura.js';
import { esc, $, on, tag, toast, moeda } from '../core/ui.js';

export const PAGAMENTOS_PRETENDIDOS = PAGS;
export const FORMATOS_SITE = FORMATOS;
export const formatoAtual = fmt;
export const TOTAL_PERGUNTAS = TOTAL;
/** Quais das 18 perguntas já têm resposta no dado real (nome antigo mantido para quem já usava). */
export const respostasSite = (cliente, site, produtos = [], materiais = 0) => respondidas(cliente, site, produtos, materiais);
export const progressoSite = (cliente, site, produtos, materiais = 0) => Object.values(respostasSite(cliente, site, produtos, materiais)).filter(Boolean).length;

/**
 * O mesmo card fora da aba Site/Loja (aba Criativos): carrega o site e os produtos sozinho. Sem "Gerar site".
 * O documento do site só é criado se alguma resposta precisar dele (pagamento, modo do site, "ainda não tem pixel").
 */
export async function montarQuestionarioNaAba(alvo, cliente, recarregar) {
  const [sites, produtos] = await Promise.all([db.listar(COL.sites, { clienteId: cliente.id }), db.listar(COL.produtos, { clienteId: cliente.id })]);
  let site = sites[0] || null;
  const salvarSite = async (patch) => {
    if (site) { await db.atualizar(COL.sites, site.id, patch); Object.assign(site, patch); }
    else site = await db.criar(COL.sites, { clienteId: cliente.id, status: 'rascunho', versaoManual: 0, ...patch });
  };
  montarPerguntasSite(alvo, { cliente, produtos, salvarSite, recarregar, get site() { return site; } }, { aberto: false });
}

/** Etiqueta "preenchido automaticamente…, confirme ou edite" + botão Confirmar. */
const marcaAuto = (m, attrs) => (m ? `<span class="mt-1 inline-flex flex-wrap items-center gap-1"><span class="tag tag-warn"><i class="fa-solid fa-robot mr-1"></i>${esc(textoMarca(m))}</span><button type="button" class="text-xs text-indigo-600 underline" ${attrs}>Confirmar</button></span>` : '');

const TONS = ['descontraído', 'premium', 'técnico', 'acolhedor', 'divertido', 'direto'];
const PLACEHOLDER = {
  negocio: 'Ex.: roupas de academia para mulheres de 25 a 45 anos', usp: 'Ex.: tecido que não fica transparente no agachamento', tomDeVoz: 'Ex.: descontraído, próximo, sem gírias',
  objecoes: 'Uma por linha. Ex.: E se não servir?\nDemora pra chegar?', linguagemDor: 'Nas palavras deles. Ex.: "toda legging fica transparente quando agacho"', termosProibidos: 'Separe por vírgula. Ex.: cura, garantido, emagreça',
  materiaisOriginais: 'Link do Google Drive ou WeTransfer', logo: 'Link do logo em PNG (ou "vai junto no link das fotos")', provasSociais: 'Ex.: 4,9 estrelas em 320 avaliações; 5 mil clientes',
  publicoCompra: 'Ex.: mulheres de 28 a 40, de BH e interior de MG, que treinam de manhã', ofertaAtiva: 'Ex.: frete grátis acima de R$ 199 até o fim do mês',
};
const ROTULO = {
  negocio: 'O que vende e para quem: salvo no perfil de marca.', tomDeVoz: 'Tom de voz salvo no perfil de marca.', usp: 'Diferencial salvo no perfil de marca.', objecoes: 'Objeções salvas no perfil de marca (alimentam a FAQ).',
  linguagemDor: 'Palavras do público salvas no perfil de marca.', termosProibidos: 'Termos proibidos salvos: a IA evita e o app avisa se aparecerem.', provasSociais: 'Provas sociais salvas no perfil de marca.',
  estetica: 'Estética salva no perfil de marca.', materiaisOriginais: 'Link das fotos e vídeos salvo no perfil de marca.', logo: 'Logo anotado no perfil de marca.', publicoCompra: 'Quem mais compra: salvo no perfil de marca.', ofertaAtiva: 'Oferta ativa salva no perfil de marca.',
};

/**
 * Monta o card no `alvo`. ctx: { cliente, site, produtos, salvarSite(patch), recarregar(), gerar?(botao) }.
 * `aberto` = começa expandido (na 1ª vez e enquanto faltar resposta). Sem `gerar` (aba Criativos), o botão
 * "Gerar site com essas respostas" não aparece.
 */
// Aberto/fechado escolhido pela pessoa, por cliente: responder algumas perguntas recarrega a aba e o card não pode fechar sozinho.
const abertoPorCliente = new Map();

export function montarPerguntasSite(alvo, ctx, { aberto: abertoPadrao = true } = {}) {
  const aberto = abertoPorCliente.has(ctx.cliente.id) ? abertoPorCliente.get(ctx.cliente.id) : abertoPadrao;
  const { cliente, produtos } = ctx;
  const m = cliente.marca || {}; const r = rastreamentoDe(cliente); const h = cliente.historico || {};
  let qtdMateriais = 0;
  const resp = () => respostasSite(cliente, ctx.site, produtos, qtdMateriais);
  const auto = (k) => cliente.autoPreenchido?.[k];
  const pergunta = (id, corpo) => {
    const p = PERGUNTAS.find((x) => x.id === id);
    return `<li class="rounded-lg border border-slate-200 p-3" data-pergunta="${id}">
      <div class="flex items-start justify-between gap-2"><p class="text-sm font-semibold">${p.n}. ${esc(p.titulo)}</p><span data-ok="${id}"></span></div>
      <p class="hint mb-2">Vai para: ${esc(p.destino)}</p>${corpo}</li>`;
  };
  const area = (campo, valor) => `<textarea class="input" rows="2" data-marca="${campo}" placeholder="${esc(PLACEHOLDER[campo] || '')}">${esc(valor)}</textarea>${marcaAuto(auto(campo), `data-confirmar-campo="${campo}"`)}`;

  const CORPO = {
    negocio: () => area('negocio', m.negocio),
    usp: () => area('usp', m.usp),
    tom: () => `${area('tomDeVoz', m.tomDeVoz)}<div class="mt-1 flex flex-wrap gap-1">${TONS.map((t) => `<button type="button" class="tag cursor-pointer" data-tom="${t}" title="Acrescentar ao campo">+ ${t}</button>`).join('')}</div>`,
    objecoes: () => area('objecoes', m.objecoes),
    linguagemDor: () => area('linguagemDor', m.linguagemDor),
    termosProibidos: () => `${area('termosProibidos', m.termosProibidos)}<p class="hint">A IA evita esses termos e o app avisa se algum aparecer num criativo.</p>`,
    produtos: () => `<div class="text-sm">${produtos.some((p) => p.origemAuto) ? `<p class="mb-1 flex flex-wrap items-center gap-2"><span class="tag tag-warn"><i class="fa-solid fa-robot mr-1"></i>${produtos.filter((p) => p.origemAuto).length} produto(s) ${esc(textoMarca(produtos.find((p) => p.origemAuto).origemAuto))}</span><button type="button" class="text-xs text-indigo-600 underline" data-confirmar-todos-prod>Confirmar todos</button><span class="hint">Clique no nome para conferir preço, variações e fotos.</span></p>` : ''}${produtos.length ? `<ul class="mb-2 space-y-0.5">${produtos.map((p) => `<li><button type="button" class="underline decoration-dotted" data-editar-prod="${p.id}">${esc(p.nome)}</button> <span class="hint">${p.preco ? moeda(p.precoPromocional || p.preco) : 'sem preço'}${p.fotos?.length ? ` · ${p.fotos.length} foto(s)` : ' · sem foto'}</span>${p.origemAuto ? ` <span class="tag tag-warn" title="${esc(textoMarca(p.origemAuto))}">${{ instagram: 'do Instagram', resposta: 'da resposta do cliente' }[p.origemAuto.origem] || 'do site'}</span> <button type="button" class="text-xs text-indigo-600 underline" data-confirmar-prod="${p.id}">Confirmar</button>` : ''}</li>`).join('')}</ul>` : '<p class="hint mb-2">Nenhum produto cadastrado ainda.</p>'}
      <button type="button" class="btn-ghost btn-sm" data-novo-prod><i class="fa-solid fa-plus"></i> Cadastrar produto</button></div>`,
    materiais: () => `${area('materiaisOriginais', m.materiaisOriginais)}<p class="hint">Peça por Google Drive ou WeTransfer (pelo WhatsApp a qualidade cai). Depois de baixar, envie os arquivos em <b>Estúdio > Materiais</b> (botão "Gerar foto e vídeo" num criativo). <span data-qtd-materiais></span></p>`,
    logo: () => `${area('logo', m.logo)}<p class="hint">O arquivo PNG também vai para Materiais do cliente, junto com as fotos.</p>`,
    provas: () => `${area('provasSociais', m.provasSociais)}<p class="hint">Digite à mão (uma prova por linha) ou envie prints logo abaixo.</p>${provaSocialHtml('q')}`,
    presenca: () => '',
    referencia: () => `<input class="input" data-referencia value="${esc(cliente.siteReferencia)}" placeholder="https://…">${marcaAuto(auto('siteReferencia'), 'data-confirmar-campo="siteReferencia"')}`,
    anuncios: () => `<div class="grid gap-2 sm:grid-cols-3"><select class="input" data-anuncia><option value="">Escolha…</option><option value="nao" ${cliente.estagio !== 'rodando' && m.jaAnuncia === 'nao' ? 'selected' : ''}>Ainda não anuncia</option><option value="sim" ${cliente.estagio === 'rodando' ? 'selected' : ''}>Já anuncia</option></select>
        <input class="input" type="number" min="0" step="0.01" data-hist="orcamentoDiario" value="${esc(h.orcamentoDiario)}" placeholder="Investe por dia (R$)">
        <input class="input" type="number" min="0" step="0.01" data-hist="cpaMedio" value="${esc(h.cpaMedio)}" placeholder="Custo por venda (R$)"></div>
      <p class="hint">"Já anuncia" muda o estágio do cliente para "rodando": a IA passa a considerar esses números.</p>${marcaAuto(auto('anuncios'), 'data-confirmar-campo="anuncios"')}`,
    publicoCompra: () => area('publicoCompra', m.publicoCompra),
    oferta: () => area('ofertaAtiva', m.ofertaAtiva),
    pixel: () => `<div class="grid gap-2 sm:grid-cols-2"><input class="input" data-pixel="metaPixelId" value="${esc(r.metaPixelId)}" placeholder="ID do Pixel do Meta (só números)">
        <input class="input" data-pixel="googleAdsId" value="${esc(r.googleAdsId ? r.googleAdsId + (r.googleAdsRotulo ? '/' + r.googleAdsRotulo : '') : '')}" placeholder="Google Ads: AW-123456789 ou AW-…/rótulo"></div>
      <label class="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" data-sem-pixel ${ctx.site?.semPixel ? 'checked' : ''}> Ainda não tem (conta como respondida; dá para cadastrar depois)</label>
      <p class="hint text-rose-600" data-erro-pixel></p>
      <p class="hint">Hotjar (como as pessoas navegam) e chat ao vivo Tawk.to ficam no <a class="underline" href="#/c/${esc(cliente.id)}/editar">cadastro do cliente → Rastreamento</a>.</p>${marcaAuto(auto('pixel'), 'data-confirmar-campo="pixel"')}`,
    pagamento: () => `<select class="input" data-pagamento><option value="">Escolha…</option>${PAGAMENTOS_PRETENDIDOS.map(([k, t]) => `<option value="${k}" ${ctx.site?.pagamentoPreferido === k ? 'selected' : ''}>${t}</option>`).join('')}</select>${marcaAuto(auto('pagamento'), 'data-confirmar-campo="pagamento"')}`,
    formato: () => `<div class="flex flex-wrap gap-3 text-sm">${FORMATOS_SITE.map(([k, t]) => `<label class="flex items-center gap-1"><input type="radio" name="formatoSite" value="${k}" data-formato ${formatoAtual(ctx.site) === k ? 'checked' : ''}> ${t}</label>`).join('')}</div>${marcaAuto(auto('formato'), 'data-confirmar-campo="formato"')}`,
  };

  alvo.innerHTML = `<details class="card" ${aberto ? 'open' : ''} data-perguntas-site>
    <summary class="cursor-pointer"><span class="font-semibold"><i class="fa-solid fa-clipboard-question mr-1 text-indigo-500"></i> Perguntas para montar o site e os anúncios</span>
      <span class="ml-2 text-sm text-slate-500" data-progresso></span></summary>
    <p class="caption mt-2">As 18 perguntas que o app precisa para o site e para os criativos. Dois jeitos de responder: <b>digitar aqui durante a conversa</b> (cada resposta é salva sozinha ao sair do campo, direto no lugar certo do app) ou <b>mandar as perguntas para o cliente</b> e colar a resposta dele (logo abaixo da lista). Não é obrigatório responder tudo.</p>
    <div class="mt-3" data-respostas-cliente></div>
    ${BLOCOS_Q.map(([b, titulo]) => `<h4 class="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500">${titulo}</h4><ol class="mt-2 space-y-2">
      ${PERGUNTAS.filter((p) => p.bloco === b).map((p) => (p.id === 'presenca' ? perguntaZeroHtml(cliente, p.n) : pergunta(p.id, CORPO[p.id]()))).join('')}</ol>`).join('')}
    ${ctx.gerar ? `<div class="mt-3 rounded-lg bg-slate-50 p-3"><p class="caption mb-2"><b>Gerar site com essas respostas:</b> usa a IA para escrever os textos no modo escolhido na pergunta 18 — no site personalizado: banner, história, depoimentos (os reais das provas sociais; modelos marcados só se não houver nenhuma), políticas e a FAQ a partir das objeções; no pacote: banners, briefing do tema e textos das páginas. Depois é só revisar e baixar abaixo. Prefere sem IA? Preencha "Conteúdo da loja" à mão.</p>
      <button type="button" class="btn-ia" data-gerar-respostas><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar site com essas respostas</button></div>` : ''}
  </details>`;

  const pintar = () => {
    const rs = resp(); const n = Object.values(rs).filter(Boolean).length;
    $('[data-progresso]', alvo).innerHTML = `${n} de ${TOTAL_PERGUNTAS} respondidas ${n === TOTAL_PERGUNTAS ? tag('completo', 'tag-ok') : ''}`;
    for (const [k, ok] of Object.entries(rs)) { const s = $(`[data-ok="${k}"]`, alvo); if (s) s.innerHTML = ok ? '<i class="fa-solid fa-circle-check text-emerald-600" title="Respondida"></i>' : '<i class="fa-regular fa-circle text-slate-300" title="Sem resposta"></i>'; }
  };
  pintar();
  db.listar(COL.materiais, { clienteId: cliente.id }).then((lista) => {
    qtdMateriais = lista.length; pintar();
    const s = $('[data-qtd-materiais]', alvo); if (s) s.textContent = lista.length ? `Já há ${lista.length} arquivo(s) em Materiais.` : '';
  }).catch(() => {});
  $('[data-perguntas-site]', alvo).addEventListener('toggle', (e) => abertoPorCliente.set(cliente.id, e.target.open));
  ligarPerguntaZero(alvo, ctx);
  ligarProvaSocial($('[data-pergunta="provas"]', alvo), ctx);
  montarRespostasCliente($('[data-respostas-cliente]', alvo), { ...ctx, get site() { return ctx.site; }, get qtdMateriais() { return qtdMateriais; } });

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
  on(alvo, 'click', '[data-confirmar-todos-prod]', async () => {
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
  const tirarEtiqueta = (chave, el) => { if (!cliente.autoPreenchido?.[chave]) return {}; el?.parentElement?.querySelector('.tag-warn')?.parentElement?.remove(); return { autoPreenchido: semMarca(chave) }; };
  on(alvo, 'change', '[data-marca]', (t) => {
    const campo = t.dataset.marca; const valor = t.value.trim();
    if ((cliente.marca?.[campo] || '') === valor) return;
    salvarCliente({ marca: { ...(cliente.marca || {}), [campo]: valor }, ...tirarEtiqueta(campo, t) }, ROTULO[campo] || 'Salvo no perfil de marca.');
  });
  on(alvo, 'click', '[data-tom]', (b) => {
    const t = $('[data-marca="tomDeVoz"]', alvo); const atual = t.value.trim();
    if (atual.toLowerCase().includes(b.dataset.tom)) return;
    t.value = atual ? `${atual}, ${b.dataset.tom}` : b.dataset.tom; t.dispatchEvent(new Event('change', { bubbles: true }));
  });
  on(alvo, 'change', '[data-referencia]', (i) => salvarCliente({ siteReferencia: i.value.trim(), ...tirarEtiqueta('siteReferencia', i) }, 'Site de referência salvo no cadastro do cliente.'));
  const salvarAnuncios = () => {
    const anuncia = $('[data-anuncia]', alvo).value;
    const num = (k) => { const v = Number($(`[data-hist="${k}"]`, alvo).value); return v > 0 ? v : 0; };
    if (!anuncia) return;
    const historico = anuncia === 'sim' ? { ...(cliente.historico || {}), orcamentoDiario: num('orcamentoDiario'), cpaMedio: num('cpaMedio') } : cliente.historico || {};
    salvarCliente({ estagio: anuncia === 'sim' ? 'rodando' : cliente.estagio === 'rodando' ? 'novo' : cliente.estagio || 'novo', historico, marca: { ...(cliente.marca || {}), jaAnuncia: anuncia }, ...tirarEtiqueta('anuncios', $('[data-anuncia]', alvo)) },
      anuncia === 'sim' ? 'Salvo: cliente já anuncia (estágio "rodando", com orçamento e custo por venda).' : 'Salvo: cliente ainda não anuncia.');
  };
  on(alvo, 'change', '[data-anuncia]', salvarAnuncios);
  on(alvo, 'change', '[data-hist]', () => { if ($('[data-anuncia]', alvo).value === 'sim') salvarAnuncios(); });
  on(alvo, 'change', '[data-pixel]', () => {
    const meta = $('[data-pixel="metaPixelId"]', alvo).value, google = $('[data-pixel="googleAdsId"]', alvo).value;
    const { valor, erros } = normalizarRastreamento({ metaPixelId: meta, googleAdsId: google });
    $('[data-erro-pixel]', alvo).textContent = erros.join(' ');
    if (erros.length) return; // não grava um ID inválido; o texto fica no campo para corrigir
    // Só os campos do Pixel mudam aqui: Hotjar e Tawk.to (cadastro do cliente) ficam como estão.
    salvarCliente({ rastreamento: { ...(cliente.rastreamento || {}), metaPixelId: valor.metaPixelId, googleAdsId: valor.googleAdsId, googleAdsRotulo: valor.googleAdsRotulo }, ...tirarEtiqueta('pixel', $('[data-pixel="googleAdsId"]', alvo)) }, 'Rastreamento salvo no cadastro do cliente.');
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
    if (!ctx.site?.modo) { toast('Responda a pergunta 18 primeiro: ela decide se é site personalizado ou pacote de plataforma.', 'erro'); $('[data-pergunta="formato"]', alvo).scrollIntoView({ block: 'center' }); return; }
    ctx.gerar(b);
  });
}
