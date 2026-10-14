// "Analisar meu pedido" (passo 3 de "Montar site") e "Conferência do pedido" (passo 4). Regras puras, sem banco nem tela.
//  1. A IA lê "Como eu quero o site" e devolve um PLANO, item a item (o que foi pedido, como fica, status). Aqui o plano
//     é conferido: códigos de foto e produtos que não existem viram "Não dá para fazer"; ONDE FUNCIONA (prévia/loja e o
//     caminho de menu) sai desta tabela, pela plataforma e pelo tema — a IA nunca inventa caminho.
//  2. Nada é aplicado antes de "Aplicar o plano": só os itens e sugestões marcados entram (aplicacaoDoPlano), pelas
//     mesmas regras de sempre (a escolha manual em "Usar em" vence; lib/fotos-site.js e lib/site-blocos.js).
//  3. Os itens aceitos viram uma lista OBRIGATÓRIA na geração (checklistObrigatorio) e são conferidos depois de cada
//     geração/ajuste (conferirPorCodigo); só o que o código não consegue conferir vai para a IA barata.
import { caminhosDe, CONFIRA_TEMA } from './pacote-loja.js';
import { slidesDoBanner, fotosDoProduto, temCodigo, usosDe, fotosDoUso, imagensDoUso, codigosDoTexto, lerReferencias, LUGARES_SEM_FOTO } from './fotos-site.js';
import { printsDoCliente, normalizarVisual, ORDEM_LOJA, nomeSecaoLoja } from './visual-site.js';
import { normalizarLayout, ORDEM_PADRAO, nomeBloco } from './site-blocos.js';
import { FORMAS_PAGAMENTO } from './sitegen.js';
import { normalizarRecursos, recursosDoSite, textoSecaoProduto, sugeridoPara, SECOES_PRODUTO, numero } from './recursos-loja.js';
import { normalizarParte, atualizarItemTexto, ehItemTexto, conferirTextoItem, textosParaAplicar, DESTINOS_TEXTO } from './textos-site.js';
import { paresFaq, naoSeiDoTexto } from './modelo-pedido-site.js';

const txt = (v) => String(v ?? '').trim();
const sem = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const codigoOk = (c) => /^F\d{1,3}$/i.test(txt(c));

// ---------- tipos de pedido ----------
export const TIPOS_PEDIDO = {
  banner_fotos: 'Fotos do banner (carrossel)',
  clientes_fotos: 'Depoimentos/clientes reais com fotos',
  produto_fotos: 'Fotos de um produto',
  galeria_fotos: 'Fotos da galeria da loja',
  sobre_fotos: 'Fotos de Sobre a loja',
  nao_fotos: 'Fotos fora do site',
  frete_gratis: 'Frete grátis a partir de um valor',
  pagamentos: 'Formas de pagamento (ícones)',
  colunas_produtos: 'Produtos lado a lado (colunas)',
  botao_grande: 'Botão de compra grande',
  pagina_produto: 'Página do produto com todas as fotos e descrição detalhada',
  secoes_produto: 'Seções na página do produto (fórmula, benefícios, modo de uso)',
  faq: 'Perguntas frequentes',
  depoimentos_home: 'Depoimentos na página inicial',
  compre_junto: 'Compre junto (cross-sell)',
  ordem_secoes: 'Ordem das seções da home',
  ocultar_secao: 'Tirar uma seção da home',
  fotos_ajuste: 'Fotos inteiras ou preenchendo',
  cores: 'Cores',
  texto: 'Texto (títulos, chamadas, tom)',
  outro: 'Outro',
};
export const STATUS_ITEM = { pronto: 'Pronto para aplicar', pergunta: 'Precisa de resposta', impossivel: 'Não dá para fazer' };
export const ONDE = { ambos: 'Na prévia e na loja', previa: 'Só na prévia', loja: 'Na loja precisa configurar' };
export const RESULTADO = { atendido: 'Atendido', parcial: 'Parcial', nao: 'Não atendido' };

/** Seções da home de cada modo (o mesmo pedido "banner" vira "hero" no site personalizado). */
export const secoesDoModo = (modo) => (modo === 'custom' ? ORDEM_PADRAO : ORDEM_LOJA);
const SINONIMOS = { custom: { banner: 'hero', sobre: 'marca', produtos: 'vendidos', clientes: 'provas' }, pacote: { hero: 'banner', marca: 'sobre', vendidos: 'produtos', catalogo: 'produtos', clientes: 'provas' } };
export const secaoDoModo = (k, modo) => { const s = sem(k); const m = modo === 'custom' ? 'custom' : 'pacote'; const r = SINONIMOS[m][s] || s; return secoesDoModo(m).includes(r) ? r : null; };
const nomeSecao = (k, modo) => (modo === 'custom' ? nomeBloco(k) : nomeSecaoLoja(k));

export { normalizarRecursos, recursosDoSite, textoSecaoProduto, sugeridoPara, SECOES_PRODUTO };

// ---------- onde funciona (tabela; nunca vem da IA) ----------
const conf = (s) => `${s} (${CONFIRA_TEMA})`;
const SHOPIFY = {
  frete: 'Configurações > Frete e entrega: crie uma taxa "Frete grátis" com condição de valor mínimo do pedido',
  pagamentos: 'Configurações > Pagamentos: ative os meios',
  appComplementar: 'App gratuito "Shopify Search & Discovery" (da própria Shopify): cadastre os produtos complementares de cada produto',
};
function caminhoShopify(tipo, tema, cam) {
  const dawn = tema === 'dawn';
  return {
    frete_gratis: `${SHOPIFY.frete}; e o aviso: Loja virtual > Temas > Personalizar > ${dawn ? 'seção "Barra de anúncios"' : conf('barra de anúncios do cabeçalho')}`,
    pagamentos: `${SHOPIFY.pagamentos}; ícones: Loja virtual > Temas > Personalizar > Rodapé > ${dawn ? '"Mostrar ícones de pagamento"' : conf('ícones de pagamento')}`,
    colunas_produtos: dawn ? 'Loja virtual > Temas > Personalizar > seção "Coleção em destaque" > "Número de colunas no desktop" (2)' : conf('Loja virtual > Temas > Personalizar > seção de produtos/coleção: número de colunas'),
    botao_grande: conf('Loja virtual > Temas > Personalizar > Configurações do tema > Botões'),
    pagina_produto: dawn ? 'Loja virtual > Temas > Personalizar > Modelo de produto > bloco "Mídia" (layout das fotos); a descrição vai no CSV' : conf('Loja virtual > Temas > Personalizar > Modelo de produto: galeria de mídia; a descrição vai no CSV'),
    secoes_produto: dawn ? 'Loja virtual > Temas > Personalizar > Modelo de produto > Adicionar bloco "Linha recolhível" (uma por seção)' : conf('Loja virtual > Temas > Personalizar > Modelo de produto > adicionar bloco de acordeão/texto'),
    faq: dawn ? 'Loja virtual > Temas > Personalizar > Adicionar seção "Conteúdo recolhível"' : conf('Loja virtual > Temas > Personalizar > Adicionar seção de perguntas/acordeão'),
    compre_junto_produto: `${SHOPIFY.appComplementar}; no tema: Modelo de produto > ${dawn ? 'bloco "Produtos complementares"' : conf('bloco de produtos complementares/recomendações')}`,
    compre_junto_carrinho: conf('Sugestão no carrinho: normalmente precisa de um app de cross-sell da Shopify App Store; antes, veja se o tema tem recomendações no carrinho'),
  }[tipo] ?? cam;
}
function caminhoNuvemshop(tipo, cam) {
  return {
    frete_gratis: conf('Painel da Nuvemshop: frete grátis por valor mínimo nas configurações de envio/promoções; o aviso no topo em Design > Personalizar'),
    pagamentos: conf('Painel da Nuvemshop: meios de pagamento; os ícones aparecem no rodapé conforme os meios ativos'),
    colunas_produtos: conf('Design > Personalizar: lista de produtos (produtos por linha)'),
    botao_grande: conf('Design > Personalizar: botões'),
    pagina_produto: conf('Design > Personalizar: página de produto (galeria de fotos); a descrição vai no CSV'),
    secoes_produto: conf('Produtos > editar: ponha fórmula e benefícios na descrição (o tema pode mostrar em abas)'),
    faq: 'Crie a página "Perguntas frequentes" com o texto do passo 6',
    compre_junto_produto: conf('Design > Personalizar: produtos relacionados na página do produto; "Compre junto" de verdade costuma ser um app da Loja de Aplicativos da Nuvemshop'),
    compre_junto_carrinho: conf('Sugestão no carrinho: um app da Loja de Aplicativos da Nuvemshop'),
  }[tipo] ?? cam;
}

/**
 * { tipo: 'ambos'|'previa'|'loja', oque, caminho } de um pedido, pela plataforma ('shopify'|'nuvemshop'|'custom'|null)
 * e tema. 'ambos' = sai pronto no que é entregue (site, CSV, textos); 'loja' = precisa de configuração/app na loja.
 */
export function ondeFunciona(tipo, params = {}, plataforma = null, tema = '') {
  if (plataforma === 'custom') {
    if (tipo === 'frete_gratis') return { tipo: 'loja', oque: 'O site já mostra o aviso; a regra de frete grátis precisa ser ligada no checkout do site', caminho: 'Manual de entrega, seção 3 (checkout: Mercado Pago, Stripe ou Shopify)' };
    if (tipo === 'pagamentos') return { tipo: 'loja', oque: 'Os ícones aparecem no site; os meios precisam estar ativos no checkout', caminho: 'Manual de entrega, seção 3 (checkout)' };
    return { tipo: 'ambos', oque: 'Sai pronto no site gerado', caminho: '' };
  }
  if (!plataforma) return { tipo: 'loja', oque: 'Depende da plataforma', caminho: 'Escolha a plataforma no passo 3 para ver onde configurar' };
  const t = String(tema || '').toLowerCase();
  const cam = caminhosDe(plataforma, t);
  const rota = (k) => (plataforma === 'shopify' ? caminhoShopify(k, t, null) : caminhoNuvemshop(k, null));
  switch (tipo) {
    case 'produto_fotos': return { tipo: 'ambos', oque: 'As fotos vão no CSV de produtos, na ordem escolhida', caminho: cam.produtos };
    case 'galeria_fotos': return { tipo: 'loja', oque: 'Fotos da galeria, na ordem do plano (pasta galeria/ do .zip)', caminho: cam.secoes };
    case 'sobre_fotos': return { tipo: 'loja', oque: 'Fotos da seção Sobre (pasta sobre/ do .zip)', caminho: cam.secoes };
    case 'nao_fotos': return { tipo: 'ambos', oque: 'Estas fotos ficam fora do site', caminho: '' };
    case 'texto': return { tipo: 'ambos', oque: 'Vai nos textos do pacote (copiar no passo 6)', caminho: 'Passo 6, "O que colocar na plataforma"' };
    case 'banner_fotos': return { tipo: 'loja', oque: 'Um slide por foto, na ordem do plano', caminho: cam.banner };
    case 'clientes_fotos': case 'depoimentos_home': return { tipo: 'loja', oque: 'Seção de depoimentos/imagens na home', caminho: cam.provas };
    case 'ordem_secoes': case 'ocultar_secao': return { tipo: 'loja', oque: 'Ordem das seções da página inicial', caminho: cam.secoes };
    case 'fotos_ajuste': return { tipo: 'loja', oque: 'Proporção das fotos no tema', caminho: cam.fotos };
    case 'cores': return { tipo: 'loja', oque: 'Cores do tema', caminho: cam.cores };
    case 'compre_junto': return { tipo: 'loja', oque: params.onde === 'carrinho' ? 'Sugestão de outro produto no carrinho' : 'Bloco "Compre junto" na página do produto', caminho: rota(params.onde === 'carrinho' ? 'compre_junto_carrinho' : 'compre_junto_produto') };
    case 'frete_gratis': return { tipo: 'loja', oque: `Regra de frete grátis${params.valor ? ` acima de R$ ${params.valor}` : ''} e o aviso no topo`, caminho: rota('frete_gratis') };
    case 'pagamentos': return { tipo: 'loja', oque: 'Meios de pagamento ativos e os ícones no rodapé', caminho: rota('pagamentos') };
    case 'colunas_produtos': return { tipo: 'loja', oque: `${params.colunas || 2} produtos por linha`, caminho: rota('colunas_produtos') };
    case 'botao_grande': return { tipo: 'loja', oque: 'Tamanho/estilo do botão de compra no tema', caminho: rota('botao_grande') };
    case 'pagina_produto': return { tipo: 'loja', oque: 'Galeria com todas as fotos (tema) e descrição detalhada (CSV)', caminho: rota('pagina_produto') };
    case 'secoes_produto': return { tipo: 'loja', oque: 'Blocos de texto na página do produto', caminho: rota('secoes_produto') };
    case 'faq': return { tipo: 'loja', oque: 'Perguntas frequentes', caminho: rota('faq') };
    default: return { tipo: 'loja', oque: 'Confira se o tema tem essa opção', caminho: conf(plataforma === 'shopify' ? 'Loja virtual > Temas > Personalizar' : 'Design > Personalizar') };
  }
}

// ---------- leitura do plano devolvido pela IA ----------
const codigos = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,;/]+/)).map((c) => txt(c).toUpperCase()).filter(codigoOk))];
const acharProduto = (nome, produtos) => { const n = sem(nome); if (!n) return null; return produtos.find((p) => sem(p.nome) === n) || (produtos.filter((p) => sem(p.nome).includes(n) || n.includes(sem(p.nome))).length === 1 ? produtos.find((p) => sem(p.nome).includes(n) || n.includes(sem(p.nome))) : null); };

/** Parâmetros do pedido, limpos para o tipo. Devolve { params, problema } (problema = por que não dá para fazer). */
export function limparParams(tipo, p = {}, { materiais = [], produtos = [], modo = 'pacote' } = {}) {
  const existentes = new Set(materiais.filter(temCodigo).map((m) => txt(m.codigo).toUpperCase()));
  // Código que não existe sai do pedido com um aviso; se nenhum existir, o pedido não dá para fazer.
  const separar = (lista) => { const ok = lista.filter((c) => existentes.has(c)), faltam = lista.filter((c) => !existentes.has(c)); const msg = faltam.length ? `${faltam.join(', ')} não existe${faltam.length > 1 ? 'm' : ''} nos Materiais do cliente (passo 2)` : null; return { ok, problema: lista.length && !ok.length ? msg : null, aviso: ok.length && msg ? `${msg}: fica de fora` : null }; };
  switch (tipo) {
    case 'banner_fotos': case 'clientes_fotos': case 'galeria_fotos': case 'sobre_fotos': case 'nao_fotos': { const c = separar(codigos(p.codigos)); return { params: { codigos: c.ok }, problema: c.problema || (!c.ok.length ? 'nenhuma foto foi indicada pelo código (ex.: F3)' : null), aviso: c.aviso }; }
    case 'produto_fotos': {
      const c = separar(codigos(p.codigos)), prod = acharProduto(p.produto, produtos);
      // principal: código da foto principal ('' = nenhuma; ausente = a 1ª da lista, como nos planos antigos).
      const principal = p.principal == null ? undefined : c.ok.includes(txt(p.principal).toUpperCase()) ? txt(p.principal).toUpperCase() : '';
      return { params: { codigos: c.ok, produto: prod?.nome || txt(p.produto), produtoId: prod?.id || null, ...(principal !== undefined ? { principal } : {}) }, problema: !prod ? `o produto "${txt(p.produto) || '?'}" não está cadastrado (passo 2)` : c.problema, aviso: c.aviso };
    }
    case 'frete_gratis': { const v = numero(p.valor); return { params: { valor: v }, problema: v ? null : 'falta o valor mínimo do frete grátis' }; }
    case 'pagamentos': { const f = (Array.isArray(p.formas) ? p.formas : []).map(sem).map((x) => (/pix/.test(x) ? 'pix' : /bolet/.test(x) ? 'boleto' : /cart|credit|debit/.test(x) ? 'cartao' : null)).filter(Boolean); return { params: { formas: [...new Set(f.length ? f : ['cartao', 'pix'])] }, problema: null }; }
    case 'colunas_produtos': { const n = Number(p.colunas) || 2; return { params: { colunas: [2, 3, 4].includes(n) ? n : 2 }, problema: null }; }
    case 'secoes_produto': { const s = (Array.isArray(p.secoes) ? p.secoes : []).map(sem).map((x) => (/formul|ingred|compos|ativo/.test(x) ? 'formula' : /benef/.test(x) ? 'beneficios' : /modo|como usar|uso/.test(x) ? 'modo_uso' : null)).filter(Boolean); return { params: { secoes: [...new Set(s.length ? s : ['formula', 'beneficios'])] }, problema: null }; }
    case 'compre_junto': {
      const de = acharProduto(p.produto, produtos), sug = acharProduto(p.sugerido, produtos);
      return { params: { onde: p.onde === 'carrinho' ? 'carrinho' : 'produto', produtoId: de?.id || null, sugeridoId: sug?.id || null, produto: de?.nome || '', sugerido: sug?.nome || '' }, problema: produtos.length < 2 ? 'o "Compre junto" precisa de pelo menos 2 produtos cadastrados' : null };
    }
    case 'ordem_secoes': { const o = (Array.isArray(p.ordem) ? p.ordem : []).map((k) => secaoDoModo(k, modo)).filter(Boolean); return { params: { ordem: [...new Set(o)] }, problema: o.length < 2 ? 'não deu para entender a ordem das seções' : null }; }
    case 'ocultar_secao': { const s = secaoDoModo(p.secao, modo); return { params: { secao: s }, problema: s ? null : `a seção "${txt(p.secao)}" não existe neste modelo` }; }
    case 'fotos_ajuste': return { params: { ajuste: p.ajuste === 'contain' ? 'contain' : 'cover' }, problema: null };
    case 'cores': { const hex = (c) => (/^#[0-9a-f]{6}$/i.test(txt(c)) ? txt(c).toLowerCase() : null); return { params: { corPrimaria: hex(p.corPrimaria), corFundo: hex(p.corFundo) }, problema: null }; }
    case 'pagina_produto': return { params: { todasFotos: true, descricaoDetalhada: p.descricaoDetalhada !== false }, problema: null };
    case 'texto': return { params: { destino: DESTINOS_TEXTO[p.destino] ? p.destino : 'secao', titulo: txt(p.titulo).slice(0, 120) }, problema: null };
    case 'faq': { const pares = (Array.isArray(p.pares) ? p.pares : []).map((x) => ({ p: txt(x?.p).slice(0, 200), r: txt(x?.r).slice(0, 600) })).filter((x) => x.p && x.r).slice(0, 15); return { params: pares.length ? { pares } : {}, problema: null }; }
    default: return { params: {}, problema: null };
  }
}

const opcaoLimpa = (o) => (typeof o === 'string' ? { texto: txt(o) } : { texto: txt(o?.texto || o?.rotulo), como: txt(o?.como), tipo: TIPOS_PEDIDO[o?.tipo] ? o.tipo : undefined, params: o?.params && typeof o.params === 'object' ? o.params : undefined });

// Pergunta que só pede o texto inteiro ("Você me manda o texto completo?"): vira um campo próprio no item, não opções.
const RE_PEDE_TEXTO = /texto (?:completo|inteiro|todo)|me mand[ae] o texto|cole (?:aqui )?o texto|texto (?:foi |veio )?cortado/i;

/**
 * Plano da IA -> plano conferido. ctx: { materiais, produtos, modo, plataforma, tema, saude }. Itens que citam foto/produto que
 * não existe viram "Não dá para fazer" com o motivo; "onde funciona" vem de ondeFunciona (nunca da IA, exceto o tipo
 * "outro", que sempre leva "confira no editor do tema").
 */
export function normalizarPlano(d = {}, ctx = {}) {
  const itensBrutos = (Array.isArray(d.itens) ? d.itens : []).filter((x) => x && typeof x === 'object').slice(0, 30);
  const itens = itensBrutos.map((x, i) => montarItem(x, `i${i + 1}`, ctx)).filter((x) => x.pedido || x.como);
  const sugestoes = (Array.isArray(d.sugestoes) ? d.sugestoes : []).filter((x) => x && typeof x === 'object' && txt(x.texto || x.como)).slice(0, 5)
    .map((x, i) => ({ ...montarItem({ ...x, pedido: x.texto || x.pedido, status: 'pronto' }, `s${i + 1}`, ctx), sugestao: true, motivo: txt(x.motivo).slice(0, 200), aceito: false }))
    .filter((x) => x.status === 'pronto');
  return { itens, sugestoes, resumo: txt(d.resumo).slice(0, 400) };
}
function montarItem(x, id, ctx) {
  const tipo = TIPOS_PEDIDO[x.tipo] ? x.tipo : 'outro';
  const { params, problema, aviso } = limparParams(tipo, x.params || {}, ctx);
  let status = ['pronto', 'pergunta', 'impossivel'].includes(x.status) ? x.status : 'pronto';
  const opcoes = (Array.isArray(x.pergunta?.opcoes) ? x.pergunta.opcoes : []).map(opcaoLimpa).filter((o) => o.texto).slice(0, 5);
  if (status === 'pergunta' && opcoes.length < 2) status = 'pronto'; // pergunta sem opções não ajuda: segue com o que a IA entendeu
  let motivo = txt(x.motivo);
  if (problema && status !== 'impossivel') { status = 'impossivel'; motivo = `Não dá: ${problema}.`; }
  // Textos do operador para o site: uma parte por frase, com "Seu texto", "Versão melhorada" e "Versão segura".
  // O status sai das partes (número sem fonte ou alegação sem "Entendi" = pendente), nunca de "Não dá para fazer".
  const pedeTexto = tipo === 'texto' && (x.pedeTexto === true || (x.status === 'pergunta' && RE_PEDE_TEXTO.test(`${txt(x.pergunta?.texto || x.pergunta)} ${opcoes.map((o) => o.texto).join(' ')}`)));
  const brutos = Array.isArray(x.textos) ? x.textos.filter((t) => txt(typeof t === 'string' ? t : t?.original)).slice(0, 20) : [];
  if (tipo === 'texto' && (brutos.length || pedeTexto)) {
    const partes = brutos.map((t, k) => normalizarParte(t, `${id}t${k + 1}`));
    const onde = ondeFunciona(tipo, params, ctx.plataforma || null, ctx.tema || '');
    return atualizarItemTexto({ id, tipo, params, status: 'pergunta', onde, pedido: txt(x.pedido).slice(0, 240), como: txt(x.como).slice(0, 400), pergunta: null, motivo: '', alternativa: '', aviso: '', resposta: null, aceito: false, partes, pedeTexto, textoCompleto: '' }, { saude: !!ctx.saude });
  }
  const onde = tipo === 'outro'
    ? { tipo: ONDE[x.onde] ? x.onde : 'loja', oque: txt(x.oque || x.como).slice(0, 160), caminho: ctx.plataforma === 'custom' ? '' : `${CONFIRA_TEMA}` }
    : ondeFunciona(tipo, params, ctx.plataforma || null, ctx.tema || '');
  return {
    id, tipo, params, status, onde,
    pedido: txt(x.pedido).slice(0, 240), como: txt(x.como).slice(0, 400),
    pergunta: status === 'pergunta' ? { texto: txt(x.pergunta?.texto || x.pergunta).slice(0, 240), opcoes } : null,
    motivo: status === 'impossivel' ? motivo.slice(0, 300) : '', alternativa: status === 'impossivel' ? txt(x.alternativa).slice(0, 300) : '',
    aviso: aviso || '', resposta: null, aceito: status === 'pronto',
  };
}

/** Responde a pergunta de um item: a opção escolhida muda o item (como fica, tipo/parâmetros) e ele fica pronto e marcado. */
export function responderPergunta(item, indice, ctx = {}) {
  const o = item?.pergunta?.opcoes?.[indice]; if (!o) return item;
  const tipo = o.tipo || item.tipo;
  const { params, problema } = o.params ? limparParams(tipo, o.params, ctx) : { params: item.params, problema: null };
  const base = { ...item, tipo, params, resposta: o.texto, como: o.como || `${item.como ? `${item.como} ` : ''}Escolha: ${o.texto}.`.trim(), onde: tipo === 'outro' ? item.onde : ondeFunciona(tipo, params, ctx.plataforma || null, ctx.tema || '') };
  return problema ? { ...base, status: 'impossivel', motivo: `Não dá: ${problema}.`, aceito: false } : { ...base, status: 'pronto', aceito: true };
}

/** Itens e sugestões marcados (só os prontos). */
export const itensAceitos = (plano) => [...(plano?.itens || []), ...(plano?.sugestoes || [])].filter((x) => x.aceito && x.status === 'pronto');

/** Diferença para o plano anterior: { novos, removidos, mudados } (pela chave tipo + pedido). */
export function diferencaPlanos(antigo, novo) {
  const chave = (x) => `${x.tipo}|${sem(x.pedido).replace(/[^a-z0-9]+/g, ' ').trim()}`;
  const A = new Map((antigo?.itens || []).map((x) => [chave(x), x])), N = new Map((novo?.itens || []).map((x) => [chave(x), x]));
  const porTipo = (mapa) => new Map([...mapa.values()].map((x) => [x.tipo, x]));
  const aTipo = porTipo(A);
  const novos = [], mudados = [];
  for (const [k, x] of N) {
    const a = A.get(k) || (x.tipo !== 'outro' && x.tipo !== 'texto' ? aTipo.get(x.tipo) : null);
    if (!a) { novos.push(x); continue; }
    const dif = [];
    if (a.status !== x.status) dif.push(`status: ${STATUS_ITEM[a.status]} → ${STATUS_ITEM[x.status]}`);
    if (JSON.stringify(a.params) !== JSON.stringify(x.params)) dif.push('detalhes mudaram');
    if (sem(a.como) !== sem(x.como) && !dif.length) dif.push('jeito de fazer mudou');
    if (dif.length) mudados.push({ item: x, antes: a, dif });
  }
  const usados = new Set([...N.values()].map((x) => (A.has(chave(x)) ? chave(x) : aTipo.get(x.tipo) && x.tipo !== 'outro' && x.tipo !== 'texto' ? chave(aTipo.get(x.tipo)) : null)).filter(Boolean));
  const removidos = [...A.entries()].filter(([k]) => !usados.has(k)).map(([, x]) => x);
  return { novos, removidos, mudados, igual: !novos.length && !removidos.length && !mudados.length };
}

/** Lista OBRIGATÓRIA para o prompt de geração (itens aceitos, numerados). Vazio = sem plano aplicado. */
export function checklistObrigatorio(itens = []) {
  if (!itens.length) return '';
  const textos = textosParaAplicar(itens);
  itens = itens.filter((x) => !ehItemTexto(x));
  const linhaTextos = textos.length ? `
TEXTOS JÁ ESCOLHIDOS PELO OPERADOR (o app coloca no site exatamente assim, por cima do que você escrever; não repita, não reescreva e não contradiga): ${textos.map((g) => `${DESTINOS_TEXTO[g.destino]}${g.destino === 'secao' && g.titulo ? ` "${g.titulo}"` : ''}: ${g.linhas.map((l) => `"${l.texto}"`).join('; ')}`).join(' | ')}` : '';
  if (!itens.length) return linhaTextos;
  return `\nPEDIDOS OBRIGATÓRIOS DO OPERADOR (aprovados por ele no plano; cada um TEM de ser atendido no que você escrever; não invente dado, número, preço nem depoimento para atender):
${itens.map((x, i) => `${i + 1}. ${x.pedido || TIPOS_PEDIDO[x.tipo]} → ${x.como || TIPOS_PEDIDO[x.tipo]}${x.resposta ? ` (resposta do operador: ${x.resposta})` : ''}`).join('\n')}
O app já aplica sozinho as partes de estrutura (fotos por código, seções, frete grátis, pagamento, colunas, botão, "Compre junto"); você cuida dos TEXTOS que esses pedidos exigem (ex.: chamada do banner citando o frete grátis, descrição detalhada dos produtos usando só os dados cadastrados).${linhaTextos}`;
}

// ---------- aplicar o plano (só o que foi aceito) ----------
const USO_DO_TIPO = { banner_fotos: 'banner', clientes_fotos: 'clientes', galeria_fotos: 'galeria', sobre_fotos: 'sobre', nao_fotos: 'nao' };
/**
 * O que os itens aceitos mudam, sem gravar nada: { refs (fotos por código, como o texto "F3 no banner"), ops (operações
 * de lib/site-blocos.js), recursos (patch de recursos de loja), pagamentosConfig (site personalizado) }.
 */
export function aplicacaoDoPlano(itens = [], { modo = 'pacote', materiais = [], produtos = [], recursosAtuais = {} } = {}) {
  const porCodigo = new Map(materiais.filter(temCodigo).map((m) => [txt(m.codigo).toUpperCase(), m]));
  const refs = [], ops = [];
  const rec = normalizarRecursos(recursosAtuais);
  let pagamentosConfig = null;
  const custom = modo === 'custom';
  const mostrar = (k) => ops.push({ op: 'mostrar', bloco: k });
  for (const x of itens) {
    const p = x.params || {};
    switch (x.tipo) {
      case 'banner_fotos': case 'clientes_fotos': case 'galeria_fotos': case 'sobre_fotos': case 'nao_fotos':
        p.codigos.forEach((c) => { const m = porCodigo.get(c); if (m) refs.push({ codigo: c, materialId: m.id, uso: USO_DO_TIPO[x.tipo], principal: false, ordem: 0 }); });
        if (x.tipo === 'clientes_fotos') mostrar('provas');
        break;
      case 'produto_fotos':
        p.codigos.forEach((c, i) => { const m = porCodigo.get(c); if (m && p.produtoId) refs.push({ codigo: c, materialId: m.id, uso: 'produto', produtoId: p.produtoId, produtoNome: p.produto, principal: p.principal != null ? c === p.principal : i === 0, ordem: i + 1 }); });
        break;
      case 'frete_gratis': rec.freteGratis = { valor: p.valor }; break;
      case 'pagamentos': rec.pagamentos = p.formas; if (custom) pagamentosConfig = p.formas; break;
      case 'colunas_produtos':
        if (custom) for (const b of ['vendidos', 'catalogo']) ops.push({ op: 'variacao', bloco: b, opcao: 'colunas', valor: p.colunas });
        else rec.colunasProdutos = p.colunas;
        break;
      case 'botao_grande': rec.botaoGrande = true; break;
      case 'pagina_produto': rec.paginaProduto = true; break;
      case 'secoes_produto': rec.paginaProduto = true; rec.secoesProduto = [...new Set([...rec.secoesProduto, ...p.secoes])]; break;
      case 'compre_junto': {
        const pares = [...(rec.compreJunto?.pares || [])];
        if (p.produtoId && p.sugeridoId) { const i = pares.findIndex((q) => q.de === p.produtoId); const par = { de: p.produtoId, sugerido: p.sugeridoId }; if (i >= 0) pares[i] = par; else pares.push(par); }
        rec.compreJunto = { onde: p.onde, pares }; rec.paginaProduto = true;
        break;
      }
      case 'faq': mostrar('faq'); break;
      case 'depoimentos_home': mostrar('depoimentos'); break;
      case 'ordem_secoes': for (let i = 1; i < p.ordem.length; i++) ops.push({ op: 'mover', bloco: p.ordem[i], depoisDe: p.ordem[i - 1] }); p.ordem.forEach(mostrar); break;
      case 'ocultar_secao': ops.push({ op: 'ocultar', bloco: p.secao }); break;
      case 'fotos_ajuste': ops.push({ op: 'fotos', ajuste: p.ajuste }); break;
      case 'cores': if (custom && p.corPrimaria) ops.push({ op: 'paleta', corPrimaria: p.corPrimaria, ...(p.corFundo ? { corFundo: p.corFundo } : {}) }); else if (!custom && p.corPrimaria) ops.push({ op: 'paleta', cores: [p.corPrimaria, p.corFundo || '#ffffff'] }); break;
      default: break;
    }
  }
  // Ordem do carrossel / Clientes reais = ordem dos códigos no plano (aplicarReferencias numera na ordem das refs).
  return { refs, ops, recursos: rec, pagamentosConfig };
}

// ---------- passo 6: o que configurar na loja ----------
/** Itens aceitos que precisam de configuração na loja, com o caminho de menu da plataforma/tema. */
export const tarefasDaLoja = (plano) => itensAceitos(plano).filter((x) => x.onde?.tipo === 'loja').map((x) => ({ id: x.id, titulo: x.pedido || TIPOS_PEDIDO[x.tipo], oque: x.onde.oque, caminho: x.onde.caminho, tipo: x.tipo }));

// ---------- conferência do pedido ----------
const r = (status, motivo) => ({ status, motivo });
const lista = (cs) => cs.join(', ');
/** Fotos pedidas x fotos no lugar, com a ordem. */
function conferirCodigos(pedidos, tem, lugar) {
  return { ...conferirLista(pedidos, tem, lugar), codigos: pedidos.map((c) => ({ codigo: c, ok: tem.includes(c) })) };
}
function conferirLista(pedidos, tem, lugar) {
  const presentes = pedidos.filter((c) => tem.includes(c));
  if (!presentes.length) return r('nao', `${lugar}: nenhuma das fotos pedidas (${lista(pedidos)}) está lá${tem.length ? ` (está: ${lista(tem)})` : ''}`);
  const faltam = pedidos.filter((c) => !tem.includes(c));
  const ordemTem = tem.filter((c) => pedidos.includes(c));
  if (faltam.length) return r('parcial', `${lugar}: ${lista(presentes)}; falta ${lista(faltam)}`);
  if (ordemTem.join() !== pedidos.join()) return r('parcial', `${lugar}: todas as fotos estão, mas na ordem ${lista(ordemTem)} (pedido: ${lista(pedidos)})`);
  return r('atendido', `${lugar}: ${lista(pedidos)}, nessa ordem${tem.length > pedidos.length ? ` (e mais ${lista(tem.filter((c) => !pedidos.includes(c)))})` : ''}`);
}

/**
 * Confere cada item aceito no estado ATUAL (o que a prévia mostra). ctx: { modo, site, materiais, produtos (com as
 * fotos de "Usar em" já montadas pelo chamador ou não: fotosDoProduto é chamado aqui) }. Devolve
 * { [id]: { status: 'atendido'|'parcial'|'nao', motivo, por: 'codigo' } } e a lista dos ids que só a IA consegue conferir.
 */
export function conferirPorCodigo(itens = [], { modo = 'pacote', site = {}, materiais = [], produtos = [] } = {}) {
  const custom = modo === 'custom';
  const rec = recursosDoSite(site, modo);
  const L = normalizarLayout(site?.layout), V = normalizarVisual(site?.pacote?.visual);
  const ordem = custom ? L.ordem : V.ordem, ocultas = custom ? L.ocultos : V.ocultas;
  const visiveis = ordem.filter((k) => !ocultas.includes(k));
  const direta = custom ? L.imagens.hero : V.banner;
  const res = {}, paraIa = [];
  const faqTem = custom ? (site?.conteudo?.faq || []).filter((f) => txt(f?.p) && txt(f?.r)).length : (site?.pacote?.textosPagina?.faq || []).filter((f) => txt(f?.p) && txt(f?.r)).length;
  const descricao = (p) => txt(custom ? p.descricao : (site?.pacote?.descricoesProdutos || []).find((d) => d.produtoId === p.id || sem(d.nome) === sem(p.nome))?.descricao || p.descricao);
  for (const x of itens) {
    const p = x.params || {};
    let v = null;
    switch (x.tipo) {
      case 'banner_fotos': v = conferirCodigos(p.codigos, slidesDoBanner(materiais, direta).flatMap((s) => s.fotos.map((f) => txt(f.codigo).toUpperCase())).filter(Boolean), 'Banner'); break;
      case 'galeria_fotos': v = conferirCodigos(p.codigos, fotosDoUso(materiais, 'galeria').map((f) => txt(f.codigo).toUpperCase()).filter(Boolean), 'Galeria'); break;
      case 'sobre_fotos': v = conferirCodigos(p.codigos, imagensDoUso(materiais, 'sobre', custom ? L.imagens.marca : null).map((f) => txt(f.codigo).toUpperCase()).filter(Boolean), 'Sobre a loja'); break;
      case 'nao_fotos': { const fora = materiais.filter((m) => temCodigo(m) && usosDe(m).nao).map((m) => txt(m.codigo).toUpperCase()); const faltam = p.codigos.filter((c) => !fora.includes(c)); v = { ...(faltam.length ? r('nao', `ainda no site: ${lista(faltam)}`) : r('atendido', `fora do site: ${lista(p.codigos)}`)), codigos: p.codigos.map((c) => ({ codigo: c, ok: fora.includes(c) })) }; break; }
      case 'clientes_fotos': {
        v = conferirCodigos(p.codigos, printsDoCliente(materiais).map((m) => txt(m.codigo).toUpperCase()).filter(Boolean), 'Clientes reais');
        if (v.status !== 'nao' && !visiveis.includes('provas')) v = { ...v, ...r('parcial', `${v.motivo}, mas a seção "Clientes reais" está oculta`) };
        break;
      }
      case 'produto_fotos': {
        const prod = produtos.find((q) => q.id === p.produtoId);
        v = prod ? conferirCodigos(p.codigos, fotosDoProduto(prod, materiais).map((f) => txt(f.codigo).toUpperCase()).filter(Boolean), `Fotos do ${prod.nome}`) : r('nao', 'o produto não existe mais');
        break;
      }
      case 'frete_gratis': v = rec.freteGratis?.valor === p.valor ? r('atendido', `aviso de frete grátis acima de R$ ${p.valor}`) : rec.freteGratis ? r('parcial', `o aviso diz R$ ${rec.freteGratis.valor}, o pedido é R$ ${p.valor}`) : r('nao', 'sem aviso de frete grátis'); break;
      case 'pagamentos': {
        const tem = custom ? (Array.isArray(site?.config?.pagamentos) ? site.config.pagamentos : ['cartao', 'pix']) : rec.pagamentos;
        const faltam = p.formas.filter((k) => !tem.includes(k));
        v = !tem.length ? r('nao', 'sem ícones de pagamento') : faltam.length ? r('parcial', `falta: ${faltam.map((k) => FORMAS_PAGAMENTO.find(([y]) => y === k)?.[1] || k).join(', ')}`) : r('atendido', `ícones: ${p.formas.map((k) => FORMAS_PAGAMENTO.find(([y]) => y === k)?.[1] || k).join(', ')}`);
        break;
      }
      case 'colunas_produtos': {
        const n = custom ? L.variacoes?.vendidos?.colunas ?? L.variacoes?.catalogo?.colunas : rec.colunasProdutos;
        v = n === p.colunas ? r('atendido', `${n} produtos por linha`) : r('nao', n ? `está com ${n} por linha` : 'número de colunas automático');
        break;
      }
      case 'botao_grande': v = rec.botaoGrande ? r('atendido', 'botão de compra grande') : r('nao', 'botão no tamanho padrão'); break;
      case 'pagina_produto': {
        if (!rec.paginaProduto) { v = r('nao', 'a página do produto não está ligada'); break; }
        const semDesc = produtos.filter((q) => descricao(q).length < 120);
        v = semDesc.length ? r('parcial', `página com todas as fotos; descrição curta ou vazia em: ${semDesc.map((q) => q.nome).join(', ')}`) : r('atendido', 'página com todas as fotos e descrição detalhada');
        break;
      }
      case 'secoes_produto': {
        const faltaSecao = p.secoes.filter((s) => !rec.secoesProduto.includes(s));
        const faltaDado = produtos.flatMap((q) => p.secoes.filter((s) => !textoSecaoProduto(q, s)).map((s) => `${SECOES_PRODUTO[s].toLowerCase()} do ${q.nome}`));
        v = faltaSecao.length === p.secoes.length ? r('nao', 'as seções não estão ligadas na página do produto')
          : faltaSecao.length || faltaDado.length ? r('parcial', [faltaSecao.length && `faltam as seções: ${faltaSecao.map((s) => SECOES_PRODUTO[s]).join(', ')}`, faltaDado.length && `falta preencher (aba Produtos): ${faltaDado.join('; ')}`].filter(Boolean).join('; '))
            : r('atendido', `seções ${p.secoes.map((s) => SECOES_PRODUTO[s]).join(', ')} com os dados dos produtos`);
        break;
      }
      case 'faq': v = faqTem && visiveis.includes('faq') ? r('atendido', `${faqTem} pergunta(s) na seção`) : faqTem ? r('parcial', 'há perguntas, mas a seção está oculta') : r('nao', 'sem perguntas frequentes (cadastre as objeções no perfil de marca)'); break;
      case 'depoimentos_home': {
        const temDep = (site?.conteudo?.depoimentos || site?.pacote?.depoimentos || []).length || printsDoCliente(materiais).length;
        v = visiveis.includes('depoimentos') || visiveis.includes('provas') ? (temDep ? r('atendido', 'depoimentos na página inicial') : r('parcial', 'a seção está na home, mas ainda não há depoimento real')) : r('nao', 'a seção de depoimentos está oculta');
        break;
      }
      case 'compre_junto': v = rec.compreJunto ? (produtos.length >= 2 ? r('atendido', `bloco "Compre junto" ${rec.compreJunto.onde === 'carrinho' ? 'no carrinho' : 'na página do produto'}`) : r('parcial', 'precisa de 2 produtos')) : r('nao', 'sem "Compre junto"'); break;
      case 'ordem_secoes': { const pos = p.ordem.map((k) => visiveis.indexOf(k)); v = pos.every((n, i) => n >= 0 && (i === 0 || n > pos[i - 1])) ? r('atendido', `ordem: ${p.ordem.map((k) => nomeSecao(k, modo)).join(' > ')}`) : r('parcial', `ordem atual: ${visiveis.map((k) => nomeSecao(k, modo)).join(' > ')}`); break; }
      case 'ocultar_secao': v = ocultas.includes(p.secao) ? r('atendido', `"${nomeSecao(p.secao, modo)}" fora da home`) : r('nao', `"${nomeSecao(p.secao, modo)}" ainda aparece`); break;
      case 'fotos_ajuste': { const a = custom ? L.ajusteFotos : V.ajusteFotos; v = a === p.ajuste ? r('atendido', p.ajuste === 'contain' ? 'fotos inteiras' : 'fotos preenchendo') : r('nao', 'ajuste das fotos diferente do pedido'); break; }
      case 'texto': v = ehItemTexto(x) ? conferirTextoItem(x, site, modo) : null; break;
      case 'cores': { const c = custom ? txt(site?.config?.corPrimaria).toLowerCase() : txt(site?.pacote?.briefingTema?.paletaSugerida?.[0]).toLowerCase(); v = !p.corPrimaria ? null : c === p.corPrimaria ? r('atendido', `cor principal ${c}`) : r('nao', `cor principal ${c || 'padrão'}`); break; }
      default: v = null;
    }
    if (v) res[x.id] = { ...v, por: 'codigo' }; else paraIa.push(x.id);
  }
  return { resultados: res, paraIa };
}

/** Resumo de uma conferência: { atendido, parcial, nao, total }. */
export const contagemConferencia = (resultados = {}) => Object.values(resultados).reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; a.total++; return a; }, { atendido: 0, parcial: 0, nao: 0, total: 0 });
/** Itens que "Corrigir o que faltou" deve tratar. */
export const itensFaltando = (itens = [], resultados = {}) => itens.filter((x) => ['parcial', 'nao'].includes(resultados[x.id]?.status));
/** Os usos de foto atuais batem com o que a conferência viu (para saber se precisa reconferir). */
export const assinaturaUsos = (materiais = []) => materiais.filter(temCodigo).map((m) => `${m.codigo}:${JSON.stringify(usosDe(m))}`).join('|');

// ---------- "Entendi assim": o plano por seção do texto do operador ----------
// O app divide o texto nas seções do operador (lib/fotos-site.js dividirSecoes) e a IA devolve uma seção para cada uma:
// o que entendeu, os itens, as fotos com lugar e ordem e as perguntas (só dúvida real). Aqui o app confere por cima da
// IA, sem confiar nela: seção que faltou, código citado que a IA não pôs em lugar nenhum, código que não existe, ordem
// das fotos (= a ordem em que o operador escreveu) e conflito do texto com o seletor "Usar em" (vira pergunta com botão).
// Nada é aplicado antes de "Aplicar esta seção"/"Aplicar tudo": os itens nascem desmarcados.
export const STATUS_SECAO = { entendido: 'Entendido', decidir: 'Precisa decidir', impossivel: 'Não dá para fazer', nao_preenchido: 'Não preenchido' };
const DESTINOS_FOTO = { banner: 'banner', topo: 'banner', capa: 'banner', produto: 'produto', galeria: 'galeria', clientes: 'clientes', depoimentos: 'clientes', prova_social: 'clientes', sobre: 'sobre', nao: 'nao', outro: 'outro' };
const TIPO_DO_DESTINO = { banner: 'banner_fotos', clientes: 'clientes_fotos', galeria: 'galeria_fotos', sobre: 'sobre_fotos', nao: 'nao_fotos', produto: 'produto_fotos' };
const NOME_DESTINO = { banner: 'no banner', clientes: 'nos depoimentos (Clientes reais)', galeria: 'na galeria da loja', sobre: 'em Sobre a loja', nao: 'fora do site' };
const TIPOS_FOTO = new Set(['banner_fotos', 'clientes_fotos', 'produto_fotos', 'galeria_fotos', 'sobre_fotos', 'nao_fotos']);
const DESTINO_DO_TIPO = { banner_fotos: 'banner', clientes_fotos: 'clientes', galeria_fotos: 'galeria', sobre_fotos: 'sobre', nao_fotos: 'nao', produto_fotos: 'produto' };

/** Uma foto da IA, conferida: { codigo, secao, destino, produtoId, produto, principal, lugar, alternativa, existe }. null = sem código válido. */
function normalizarFoto(f, ctx, secaoPadrao = '') {
  const codigo = txt(f?.codigo).toUpperCase().replace(/^F\s*-?\s*/, 'F');
  if (!codigoOk(codigo)) return null;
  const existentes = new Set((ctx.materiais || []).filter(temCodigo).map((m) => txt(m.codigo).toUpperCase()));
  const destino = DESTINOS_FOTO[sem(f?.destino).replace(/\s+/g, '_')] || 'outro';
  let prod = null;
  if (destino === 'produto') prod = acharProduto(f?.produto, ctx.produtos || []) || (ctx.produtos || []).find((p) => p.id === f?.produtoId) || ((ctx.produtos || []).length === 1 ? ctx.produtos[0] : null);
  return {
    codigo, secao: txt(f?.secao) || secaoPadrao, destino, produtoId: prod?.id || null, produto: prod?.nome || txt(f?.produto), principal: destino === 'produto' && f?.principal === true,
    lugar: destino === 'outro' ? txt(f?.lugar).slice(0, 60) : '', alternativa: txt(f?.alternativa).slice(0, 200), existe: existentes.has(codigo), ...(f?.origem ? { origem: f.origem } : {}),
  };
}
const chaveFoto = (f) => `${f.secao}|${f.codigo}|${f.destino}|${f.produtoId || f.lugar || ''}`;
function normalizarPergunta(q, i, ctx) {
  const opcoes = (Array.isArray(q?.opcoes) ? q.opcoes : []).map((o) => ({
    texto: txt(typeof o === 'string' ? o : o?.texto).slice(0, 80), fotos: (Array.isArray(o?.fotos) ? o.fotos : []).map((f) => normalizarFoto(f, ctx, txt(q?.secao))).filter(Boolean),
    // o que a opção TIRA de um lugar (ex.: "Só na galeria do produto" tira a foto dos depoimentos)
    remover: (Array.isArray(o?.remover) ? o.remover : []).map((r) => ({ codigo: txt(r?.codigo).toUpperCase(), destino: DESTINOS_FOTO[sem(r?.destino).replace(/\s+/g, '_')] || '' })).filter((r) => codigoOk(r.codigo) && r.destino),
  })).filter((o) => o.texto).slice(0, 3);
  return { id: txt(q?.id) || `q${i + 1}`, secao: txt(q?.secao), texto: txt(q?.texto).slice(0, 240), opcoes, resposta: q?.resposta ?? null, ...(q?.auto ? { auto: true } : {}) };
}
// Itens de foto que a IA pôs como item (deveriam vir em "fotos"): viram fotos, nada se perde.
function fotosDeItem(x, secao) {
  const p = x?.params || {};
  const lista = Array.isArray(p.codigos) ? p.codigos : String(p.codigos || '').split(/[\s,;/]+/);
  return lista.map((c, k) => ({ codigo: c, secao, destino: DESTINO_DO_TIPO[x.tipo], produto: p.produto, principal: x.tipo === 'produto_fotos' && k === 0 && p.principal !== false }));
}

/** Posição de cada código no texto da seção (para a ordem = a ordem em que o operador escreveu). */
const posicoes = (texto) => new Map(codigosDoTexto(texto).map((c, i) => [c.codigo, i]));

/**
 * Plano da IA no formato por seção -> plano conferido. ctx: { secoesTexto (dividirSecoes), texto, materiais, produtos,
 * modo, plataforma, tema, saude }. Devolve { resumo, secoes, itens, fotos, perguntas, ignorado, ignoradoIa, inexistentes, sugestoes }.
 */
export function normalizarPlanoSecoes(d = {}, ctx = {}) {
  const locais = Array.isArray(ctx.secoesTexto) ? ctx.secoesTexto : [];
  const brutas = (Array.isArray(d.secoes) ? d.secoes : []).filter((x) => x && typeof x === 'object');
  const porId = new Map(brutas.map((x, i) => [txt(x.id) || `S${i + 1}`, x]));
  const fotosIa = [], itens = [];
  const secoes = locais.map((S) => {
    // Parte do modelo que ficou só com "[...]": não foi para a IA e não é erro nem aviso (cinza, "Não preenchido").
    if (S.naoPreenchido) return { id: S.id, titulo: S.titulo, trecho: S.texto, entendi: '', statusIa: 'entendido', motivo: '', alternativa: '', aplicada: false, faltou: false, naoPreenchido: true };
    const ia = porId.get(S.id);
    (Array.isArray(ia?.itens) ? ia.itens : []).filter((x) => x && typeof x === 'object').slice(0, 20).forEach((x) => {
      if (TIPOS_FOTO.has(x.tipo)) { fotosIa.push(...fotosDeItem(x, S.id)); return; }
      const it = montarItem(x, `${S.id}-i${itens.filter((y) => y.secao === S.id).length + 1}`, ctx);
      if (it.pedido || it.como || ehItemTexto(it)) itens.push({ ...it, secao: S.id, aceito: false });
    });
    return {
      id: S.id, titulo: txt(ia?.titulo) || S.titulo, trecho: S.texto, entendi: txt(ia?.entendi).slice(0, 600),
      statusIa: ['entendido', 'decidir', 'impossivel'].includes(ia?.status) ? ia.status : 'entendido', motivo: txt(ia?.motivo).slice(0, 300), alternativa: txt(ia?.alternativa).slice(0, 300),
      aplicada: false, faltou: !ia,
    };
  });
  // Seção que a IA inventou (id que não existe no texto) não entra: o texto do operador é a referência.
  const fotos = [...(Array.isArray(d.fotos) ? d.fotos : []), ...fotosIa].map((f) => normalizarFoto(f, ctx)).filter(Boolean).filter((f) => secoes.some((s) => s.id === f.secao));
  const perguntas = (Array.isArray(d.perguntas) ? d.perguntas : []).map((q, i) => normalizarPergunta(q, i, ctx)).filter((q) => q.texto && q.opcoes.length >= 2 && secoes.some((s) => s.id === q.secao));
  const ignoradoIa = (Array.isArray(d.ignorado) ? d.ignorado : []).map((x) => ({ trecho: txt(typeof x === 'string' ? x : x?.trecho).slice(0, 200), motivo: txt(x?.motivo).slice(0, 200), secao: txt(x?.secao) })).filter((x) => x.trecho || x.motivo);
  const sugestoes = normalizarPlano({ sugestoes: d.sugestoes }, ctx).sugestoes;
  let todos = itens;
  for (const S of locais.filter((x) => !x.naoPreenchido)) {
    todos = comFaqDoTexto(todos, S, ctx);
    const r = comNaoSei(todos, perguntas, S);
    todos = r.itens; ignoradoIa.push(...r.ignorado);
  }
  return recomporPlano({ resumo: txt(d.resumo).slice(0, 400), secoes, itens: todos, fotos, perguntas, ignoradoIa, sugestoes }, ctx);
}

/**
 * Pares "pergunta | resposta" do texto da seção (lib/modelo-pedido-site.js paresFaq): viram UM item "Perguntas
 * frequentes" com os pares exatamente como ele escreveu (o app põe no site: lib/textos-site.js aplicarTextosNoEstado).
 * O item "faq" da IA e o texto dela que só repete essas perguntas saem (não duplica).
 */
function comFaqDoTexto(itens, S, ctx) {
  const pares = paresFaq(S.texto, S.titulo);
  if (!pares.length) return itens;
  const so = (s) => sem(s).replace(/[^a-z0-9]+/g, ' ').trim();
  const doTexto = so(pares.map((x) => `${x.p} ${x.r}`).join(' '));
  const repete = (x) => x.tipo === 'faq' || (ehItemTexto(x) && (x.partes || []).length > 0 && x.partes.every((p) => doTexto.includes(so(p.original))));
  const resto = itens.filter((x) => !(x.secao === S.id && repete(x)));
  const it = montarItem({ tipo: 'faq', params: { pares }, pedido: 'Perguntas frequentes', como: `${pares.length} pergunta${pares.length > 1 ? 's' : ''} do seu texto ${pares.length > 1 ? 'entram' : 'entra'} na seção Perguntas frequentes, como você escreveu.`, status: 'pronto' }, `${S.id}-faq`, ctx);
  return [...resto, { ...it, secao: S.id, aceito: false }];
}

/**
 * "não sei" escrito pelo operador: nada é inventado para esse ponto. Item da IA feito a partir dele sai, e, se a IA não
 * perguntou nada nessa seção, o ponto fica marcado para ele decidir (amarelo, com o trecho).
 */
function comNaoSei(itens, perguntas, S) {
  const pontos = naoSeiDoTexto(S.texto);
  if (!pontos.length) return { itens, ignorado: [] };
  const fica = itens.filter((x) => !(x.secao === S.id && x.status !== 'pergunta' && /\bn[aã]o sei\b/i.test(x.pedido)));
  const perguntou = perguntas.some((q) => q.secao === S.id) || fica.some((x) => x.secao === S.id && x.status === 'pergunta');
  return { itens: fica, ignorado: perguntou ? [] : pontos.map((p) => ({ secao: S.id, trecho: p.trecho, motivo: 'Você escreveu "não sei": aqui nada é inventado. Preencha no texto ou diga em "Corrigir" o que usar.' })) };
}

/**
 * Refaz o que sai das fotos e das conferências do app (depois da análise, de uma resposta ou de um "Corrigir"):
 * dedup e ordem das fotos, código citado que a IA esqueceu (usa a leitura sem IA; sem ela, vai para "ignorado"),
 * conflito com o seletor (pergunta automática), itens de foto por seção e o status de cada seção.
 */
export function recomporPlano(plano, ctx = {}) {
  const materiais = ctx.materiais || [], produtos = ctx.produtos || [];
  const secoes = plano.secoes || [];
  // 1. Dedup (mesmo código no mesmo lugar da mesma seção = uma vez) e ordem do texto dentro de cada seção.
  const vistos = new Set();
  let fotos = (plano.fotos || []).filter((f) => { const k = chaveFoto(f); if (vistos.has(k)) return false; vistos.add(k); return true; });
  const pos = new Map(secoes.map((s) => [s.id, posicoes(s.trecho)]));
  const ordemSecao = new Map(secoes.map((s, i) => [s.id, i]));
  const ordenar = (lista) => lista.map((f, i) => ({ f, i })).sort((a, b) => (ordemSecao.get(a.f.secao) - ordemSecao.get(b.f.secao)) || ((pos.get(a.f.secao)?.get(a.f.codigo) ?? 1e6 + a.i) - (pos.get(b.f.secao)?.get(b.f.codigo) ?? 1e6 + b.i))).map((x) => x.f);
  // 2. Código citado no texto que a IA não pôs em lugar nenhum: a leitura sem IA resolve; se nem ela, fica em "ignorado".
  const perguntas = [...(plano.perguntas || [])];
  const citadosIa = new Set([...fotos.map((f) => `${f.secao}|${f.codigo}`), ...perguntas.flatMap((q) => q.opcoes.flatMap((o) => o.fotos.map((f) => `${q.secao}|${f.codigo}`)))]);
  const ignoradoAuto = [];
  for (const s of secoes) {
    const faltam = codigosDoTexto(s.trecho).map((c) => c.codigo).filter((c) => !citadosIa.has(`${s.id}|${c}`) && !fotos.some((f) => f.codigo === c && f.origem === 'leitura'));
    if (!faltam.length) continue;
    const local = lerReferencias(s.trecho, { materiais, produtos });
    for (const c of faltam) {
      const refs = local.refs.filter((r) => r.codigo === c);
      if (refs.length) refs.forEach((r) => fotos.push({ codigo: c, secao: s.id, destino: r.uso, produtoId: r.produtoId || null, produto: r.produtoNome || '', principal: Boolean(r.principal), lugar: '', alternativa: '', existe: true, origem: 'leitura' }));
      else if (local.inexistentes.includes(c)) fotos.push({ codigo: c, secao: s.id, destino: 'outro', produtoId: null, produto: '', principal: false, lugar: '', alternativa: '', existe: false, origem: 'leitura' });
      else ignoradoAuto.push({ secao: s.id, trecho: c, motivo: `${c} está no texto, mas não ficou claro onde usar. Responda em "Corrigir" (ex.: "${c} na galeria do produto").` });
    }
  }
  fotos = ordenar(fotos);
  // A leitura sem IA viu "foto principal" no texto e a IA não marcou nem perguntou: vale o texto.
  const perguntado = (c) => perguntas.some((q) => q.opcoes.some((o) => o.fotos.some((g) => g.codigo === c)));
  for (const s of secoes) {
    const principais = new Set(lerReferencias(s.trecho, { materiais, produtos }).refs.filter((r) => r.principal).map((r) => r.codigo));
    if (!principais.size) continue;
    fotos = fotos.map((f) => (f.secao === s.id && f.destino === 'produto' && principais.has(f.codigo) && !f.principal && !perguntado(f.codigo) && !fotos.some((g) => g.secao === s.id && g.produtoId === f.produtoId && g.principal) ? { ...f, principal: true } : f));
  }
  // 3. Texto x seletor: foto principal pedida no texto, mas outra marcada à mão como principal = pergunta com botão.
  for (const f of fotos) {
    if (!(f.destino === 'produto' && f.principal && f.existe && f.produtoId)) continue;
    if (perguntas.some((q) => q.opcoes.some((o) => o.fotos.some((g) => g.codigo === f.codigo)))) continue;
    const outra = materiais.find((m) => temCodigo(m) && txt(m.codigo).toUpperCase() !== f.codigo && usosDe(m).produtos.some((p) => p.id === f.produtoId && p.principal && p.por === 'manual'));
    if (!outra) continue;
    perguntas.push({ id: `auto-${f.codigo}-${f.produtoId}`, secao: f.secao, auto: true, resposta: null,
      texto: `O texto pede ${f.codigo} como foto principal do ${f.produto || 'produto'}, mas no seletor está ${outra.codigo}.`,
      opcoes: [{ texto: `Usar ${f.codigo}`, fotos: [{ ...f, principal: true }] }, { texto: `Manter ${outra.codigo}`, fotos: [] }] });
  }
  // Enquanto a pergunta não tem resposta, a foto entra sem ser a principal (o seletor vence até o operador escolher).
  const emAberto = new Set(perguntas.filter((q) => !q.resposta).flatMap((q) => q.opcoes.flatMap((o) => o.fotos.filter((g) => g.principal).map((g) => g.codigo))));
  fotos = fotos.map((f) => (emAberto.has(f.codigo) && f.principal ? { ...f, principal: false } : f));
  // 4. Itens de foto por seção e lugar (a ordem é a das fotos), mais "não existe esse código" e lugar sem foto.
  const antigos = new Map((plano.itens || []).map((x) => [x.id, x]));
  const itensFoto = [];
  for (const s of secoes) {
    const daSecao = fotos.filter((f) => f.secao === s.id);
    const grupos = new Map();
    for (const f of daSecao.filter((x) => x.existe && x.destino !== 'outro' && !(x.destino === 'produto' && !x.produtoId))) {
      const k = `${f.destino}|${f.produtoId || ''}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(f);
    }
    let n = 0;
    for (const [, lista] of grupos) {
      const f0 = lista[0], cods = lista.map((f) => f.codigo);
      const principal = f0.destino === 'produto' ? (lista.find((f) => f.principal)?.codigo || '') : undefined;
      const onde = f0.destino === 'produto' ? `no ${f0.produto}${principal ? ` (${principal} é a foto principal)` : ''}` : NOME_DESTINO[f0.destino];
      const it = montarItem({ tipo: TIPO_DO_DESTINO[f0.destino], params: { codigos: cods, ...(f0.destino === 'produto' ? { produto: f0.produto, principal } : {}) }, pedido: `Fotos ${cods.join(', ')}`, como: `${cods.join(', ')} ${onde}${cods.length > 1 ? ', nessa ordem' : ''}.`, status: 'pronto' }, `${s.id}-f${++n}`, ctx);
      itensFoto.push(it);
    }
    for (const f of daSecao.filter((x) => !x.existe)) itensFoto.push(itemImpossivel(`${s.id}-f${++n}`, f.codigo, `Não dá: ${f.codigo} não existe nos Materiais do cliente (passo 2).`, 'Envie a foto em Materiais (ela ganha um código) e analise de novo.'));
    for (const f of daSecao.filter((x) => x.existe && x.destino === 'outro')) itensFoto.push(itemImpossivel(`${s.id}-f${++n}`, `${f.codigo}${f.lugar ? ` em ${f.lugar}` : ''}`, `Não dá: o site não tem lugar de foto${f.lugar ? ` em "${f.lugar}"` : ' nesse ponto'}.`, f.alternativa || 'Usar a foto na galeria da loja ou na página do produto.'));
    for (const f of daSecao.filter((x) => x.existe && x.destino === 'produto' && !x.produtoId)) itensFoto.push(itemImpossivel(`${s.id}-f${++n}`, f.codigo, `Não dá: o produto "${f.produto || '?'}" não está cadastrado (passo 2).`, 'Cadastre o produto ou diga em "Corrigir" de qual produto é a foto.'));
  }
  const itens = [];
  for (const s of secoes) {
    for (const x of [...(plano.itens || []).filter((y) => y.secao === s.id && !y.deFoto), ...itensFoto.filter((y) => y.id.startsWith(`${s.id}-`)).map((y) => ({ ...y, secao: s.id, deFoto: true }))]) {
      const ant = antigos.get(x.id);
      // Item de foto refeito: continua aceito se a seção já foi aplicada (e ele está pronto).
      itens.push(x.deFoto ? { ...x, aceito: x.status === 'pronto' && Boolean(s.aplicada || ant?.aceito) } : x);
    }
  }
  const inexistentes = [...new Set(fotos.filter((f) => !f.existe).map((f) => f.codigo))].map((codigo) => ({ codigo, secoes: [...new Set(fotos.filter((f) => f.codigo === codigo).map((f) => f.secao))] }));
  const ignorado = [...(plano.ignoradoIa || []), ...secoes.filter((s) => s.faltou).map((s) => ({ secao: s.id, trecho: s.titulo, motivo: 'A IA não devolveu esta parte do texto. Use "Corrigir" nela para ler de novo.' })), ...ignoradoAuto];
  const out = { ...plano, fotos, perguntas, itens, inexistentes, ignorado };
  out.secoes = secoes.map((s) => ({ ...s, status: statusSecao(out, s, ctx) }));
  return out;
}
function itemImpossivel(id, pedido, motivo, alternativa) {
  return { id, tipo: 'outro', params: {}, status: 'impossivel', onde: { tipo: 'loja', oque: '', caminho: '' }, pedido: `Foto ${pedido}`, como: '', pergunta: null, motivo, alternativa, aviso: '', resposta: null, aceito: false };
}

/** entendido | decidir (pergunta aberta, item pendente, algo ignorado) | impossivel (a seção inteira não dá). */
export function statusSecao(plano, s, ctx = {}) {
  if (s.naoPreenchido) return 'nao_preenchido';
  const itens = (plano.itens || []).filter((x) => x.secao === s.id);
  const aberta = (plano.perguntas || []).some((q) => q.secao === s.id && !q.resposta);
  const ignorada = (plano.ignorado || []).some((x) => x.secao === s.id);
  if (s.faltou || aberta || ignorada || itens.some((x) => x.status === 'pergunta') || (s.statusIa === 'decidir' && !itens.length)) return 'decidir';
  if (s.statusIa === 'impossivel' && !itens.some((x) => x.status === 'pronto')) return 'impossivel';
  if (itens.length && itens.every((x) => x.status === 'impossivel')) return 'impossivel';
  void ctx;
  return 'entendido';
}
export const ehPlanoPorSecao = (plano) => Array.isArray(plano?.secoes) && plano.secoes.length > 0;
const comStatus = (plano, ctx) => ({ ...plano, secoes: plano.secoes.map((s) => ({ ...s, status: statusSecao(plano, s, ctx) })) });

/** "Aplicar esta seção": os itens prontos dela ficam marcados (entram na aplicação) e a seção fica "aplicada". */
export function aplicarSecao(plano, secaoId, ctx = {}) {
  const itens = plano.itens.map((x) => (x.secao === secaoId && x.status === 'pronto' ? { ...x, aceito: true } : x));
  return comStatus({ ...plano, itens, secoes: plano.secoes.map((s) => (s.id === secaoId ? { ...s, aplicada: true } : s)) }, ctx);
}
/** "Aplicar tudo": todas as seções. */
export const aplicarTodasSecoes = (plano, ctx = {}) => plano.secoes.reduce((p, s) => aplicarSecao(p, s.id, ctx), plano);
/** Seções que têm alguma coisa pronta para aplicar. */
export const secoesAplicaveis = (plano) => (plano?.secoes || []).filter((s) => (plano.itens || []).some((x) => x.secao === s.id && x.status === 'pronto'));

/**
 * Resposta de uma pergunta: a opção vale para o plano (as fotos dela entram no lugar das da mesma seção) e o que ela
 * pede ao seletor vem em `usar` (o app marca à mão em "Usar em": foi o operador quem decidiu). Devolve { plano, usar }.
 */
// "Só na galeria do produto" / "Só nos depoimentos" sem "remover": o lugar escrito fica, os outros lugares dos códigos da pergunta saem.
const LUGAR_NA_OPCAO = [['produto', /produto/], ['clientes', /depoimento|prova|avalia|clientes/], ['banner', /banner|topo|capa/], ['sobre', /sobre|historia|quem somos/], ['galeria', /galeria|carrossel/]];
function removerPeloTexto(q, o, fotos) {
  const t = sem(o.texto);
  if (!/^(so|somente|apenas)\b/.test(t)) return [];
  const fica = LUGAR_NA_OPCAO.find(([, re]) => re.test(t))?.[0];
  if (!fica) return [];
  const cods = new Set(codigosDoTexto(`${q.texto} ${o.texto}`).map((c) => c.codigo));
  return fotos.filter((f) => cods.has(f.codigo) && f.destino !== fica && f.destino !== 'outro').map((f) => ({ codigo: f.codigo, destino: f.destino }));
}
export function responderPerguntaSecao(plano, perguntaId, indice, ctx = {}) {
  const q = (plano.perguntas || []).find((x) => x.id === perguntaId);
  const o = q?.opcoes?.[indice];
  if (!q || !o) return { plano, usar: [] };
  const trocar = new Set(o.fotos.map((f) => `${f.secao || q.secao}|${f.codigo}`));
  const remover = o.remover?.length ? o.remover : removerPeloTexto(q, o, plano.fotos);
  const fotos = [...plano.fotos.filter((f) => !(trocar.has(`${f.secao}|${f.codigo}`) && o.fotos.some((g) => g.codigo === f.codigo && g.destino === f.destino)) && !remover.some((r) => r.codigo === f.codigo && r.destino === f.destino)), ...o.fotos.map((f) => ({ ...f, secao: f.secao || q.secao }))];
  const perguntas = plano.perguntas.map((x) => (x.id === perguntaId ? { ...x, resposta: o.texto } : x));
  const porCod = new Map((ctx.materiais || []).filter(temCodigo).map((m) => [txt(m.codigo).toUpperCase(), m]));
  const usar = o.fotos.filter((f) => f.existe && porCod.has(f.codigo) && f.destino !== 'outro' && !(f.destino === 'produto' && !f.produtoId))
    .map((f) => ({ materialId: porCod.get(f.codigo).id, uso: f.destino, ...(f.destino === 'produto' ? { produtoId: f.produtoId, principal: f.principal } : {}) }));
  return { plano: recomporPlano({ ...plano, fotos, perguntas }, ctx), usar };
}

/**
 * "Corrigir" de uma seção: a releitura (IA barata) troca só ela (o que entendeu, itens, fotos e perguntas). A seção
 * volta a "não aplicada" (o operador confere de novo). d: { secao: { entendi, status, motivo, alternativa, itens }, fotos, perguntas }.
 */
export function substituirSecao(plano, secaoId, d = {}, ctx = {}, correcao = '') {
  const s = plano.secoes.find((x) => x.id === secaoId); if (!s) return plano;
  const ia = d.secao && typeof d.secao === 'object' ? d.secao : d;
  const novosItens = [];
  const fotosIa = [];
  (Array.isArray(ia.itens) ? ia.itens : []).filter((x) => x && typeof x === 'object').slice(0, 20).forEach((x) => {
    if (TIPOS_FOTO.has(x.tipo)) { fotosIa.push(...fotosDeItem(x, secaoId)); return; }
    const it = montarItem(x, `${secaoId}-c${Date.now().toString(36)}${novosItens.length + 1}`, ctx);
    if (it.pedido || it.como || ehItemTexto(it)) novosItens.push({ ...it, secao: secaoId, aceito: false });
  });
  const fotos = [...plano.fotos.filter((f) => f.secao !== secaoId), ...[...(Array.isArray(d.fotos) ? d.fotos : []), ...fotosIa].map((f) => normalizarFoto({ ...f, secao: secaoId }, ctx, secaoId)).filter(Boolean)];
  const perguntas = [...plano.perguntas.filter((q) => q.secao !== secaoId), ...(Array.isArray(d.perguntas) ? d.perguntas : []).map((q, i) => normalizarPergunta({ ...q, secao: secaoId, id: `${secaoId}-q${Date.now().toString(36)}${i + 1}` }, i, ctx)).filter((q) => q.texto && q.opcoes.length >= 2)];
  const secoes = plano.secoes.map((x) => (x.id === secaoId ? { ...x, entendi: txt(ia.entendi).slice(0, 600) || x.entendi, statusIa: ['entendido', 'decidir', 'impossivel'].includes(ia.status) ? ia.status : 'entendido', motivo: txt(ia.motivo).slice(0, 300), alternativa: txt(ia.alternativa).slice(0, 300), aplicada: false, faltou: false, corrigida: { texto: txt(correcao).slice(0, 600), em: new Date().toISOString() } } : x));
  const itens = comFaqDoTexto([...plano.itens.filter((x) => x.secao !== secaoId), ...novosItens], { id: secaoId, texto: s.trecho, titulo: s.titulo }, ctx);
  const ignoradoIa = (plano.ignoradoIa || []).filter((x) => x.secao !== secaoId);
  return recomporPlano({ ...plano, secoes, itens, fotos, perguntas, ignoradoIa }, ctx);
}

/**
 * Plano cujas fotos valem na geração (lib: sites.js aplicarFotosTexto): o aplicado, ou o atual com alguma seção aplicada,
 * desde que tenha sido analisado sobre o MESMO texto de agora. null = vale a leitura sem IA do texto.
 */
export function planoDasFotos(planoAplicadoAtual, planoAtualDoSite, texto) {
  const t = txt(texto);
  if (planoAplicadoAtual && planoAplicadoAtual.base?.texto === t) return planoAplicadoAtual;
  if (ehPlanoPorSecao(planoAtualDoSite) && planoAtualDoSite.base?.texto === t && planoAtualDoSite.secoes.some((s) => s.aplicada)) return planoAtualDoSite;
  return null;
}

/**
 * Conferência por seção (passo 4): para cada seção do texto, cada item com "feito no site" / "não feito (motivo)" e
 * cada código de foto no lugar pedido. resultados = conferirPorCodigo + IA. Devolve [{ secao, linhas: [{ item, status, motivo, codigos }] }].
 */
export function conferenciaPorSecao(plano, resultados = {}) {
  if (!ehPlanoPorSecao(plano)) return [];
  return plano.secoes.map((s) => ({
    secao: s,
    linhas: plano.itens.filter((x) => x.secao === s.id).map((x) => {
      const r = resultados[x.id];
      if (r) return { item: x, status: r.status, motivo: r.motivo, codigos: r.codigos || null, por: r.por };
      if (x.status === 'impossivel') return { item: x, status: 'nao', motivo: `${x.motivo.replace(/^Não dá:\s*/, '')}${x.alternativa ? ` Mais próximo: ${x.alternativa}` : ''}`, codigos: null };
      return { item: x, status: 'nao', motivo: s.aplicada ? 'você desmarcou este item' : 'esta seção não foi aplicada', codigos: null };
    }),
  }));
}
