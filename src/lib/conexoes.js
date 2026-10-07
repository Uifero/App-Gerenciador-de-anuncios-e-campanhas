// Conexões entre as áreas do app, sempre lendo da FONTE (nada copiado que possa ficar diferente):
//  - criativo ligado a um produto: nome, preço, foto principal e fotos ligadas (Materiais/"Usar em") e a oferta ativa
//    do perfil de marca, lidos na hora;
//  - montagem de campanha: avisos (sem Pixel, loja não publicada/aprovada, produto sem foto principal) e o endereço
//    de destino por produto quando dá para saber;
//  - prints de prova social em criativos: só a cópia borrada, só com autorização; em cliente de saúde/emagrecimento,
//    print com kg/cm/antes e depois é bloqueado (política do Meta) — o site continua com a regra dele;
//  - diagnóstico: rastreamento, plataforma e site lidos do cadastro;
//  - Insights por produto e por oferta.
import { fotosDoProduto } from './fotos-site.js';
import { rastreamentoDe } from './rastreamento.js';
import { plataformaDoSite, nomeTema } from './etapas-site.js';
import { ehProdutoSaude, achadosSaude, AVISO_META_SAUDE } from './saude.js';
import { tipoMaterial } from './prova-social.js';
import { slug } from './csv.js';

const txt = (v) => String(v ?? '').trim();
const moeda = (n) => (Number(n) > 0 ? `R$ ${Number(n).toFixed(2).replace('.', ',')}` : '');

// ---------- criativo + produto ----------
/**
 * Dados do produto ligado ao criativo, lidos agora: { produto, excluido, fotos, principal, preco, precoPromocional,
 * precoTexto, oferta }. Sem produto ligado: null. Produto ligado que foi apagado: { excluido: true }.
 */
export function produtoDoCriativo(criativo, { produtos = [], materiais = [], cliente = {} } = {}) {
  if (!criativo?.produtoId) return null;
  const p = produtos.find((x) => x.id === criativo.produtoId);
  if (!p) return { excluido: true, produto: null, fotos: [], principal: null, oferta: txt(cliente.marca?.ofertaAtiva) };
  const fotos = fotosDoProduto(p, materiais);
  const promo = Number(p.precoPromocional) > 0 && Number(p.precoPromocional) < Number(p.preco) ? Number(p.precoPromocional) : null;
  return {
    excluido: false, produto: p, fotos, principal: fotos[0] || null, preco: Number(p.preco) || null, precoPromocional: promo,
    precoTexto: promo ? `de ${moeda(p.preco)} por ${moeda(promo)}` : moeda(p.preco), oferta: txt(cliente.marca?.ofertaAtiva),
  };
}
/** Linha para a IA (refinar/atualizar o criativo com os dados de agora). */
export function contextoProdutoAtual(dados) {
  if (!dados || dados.excluido) return '';
  const p = dados.produto;
  return `PRODUTO DESTE CRIATIVO (dados ATUAIS do catálogo — se o texto citar preço, nome ou oferta diferentes, use estes): "${p.nome}"${dados.precoTexto ? `, preço ${dados.precoTexto}` : ''}${p.categoria ? `, categoria ${p.categoria}` : ''}${p.descricao ? `. Descrição: ${p.descricao}` : ''}.${dados.oferta ? ` Oferta ativa agora: ${dados.oferta}.` : ' Sem oferta ativa no momento: não cite promoção.'}`;
}

// ---------- campanha ----------
/** Endereço da loja publicado (o site do cliente) e o status da aprovação. */
export function lojaDoCliente(site, etiquetaAprov = null) {
  const url = txt(site?.linkPublicado);
  return { url, publicada: Boolean(url) || site?.status === 'publicado', aprovada: etiquetaAprov?.tipo === 'aprovado', etiqueta: etiquetaAprov?.texto || '', plataforma: plataformaDoSite(site), tema: nomeTema(site) };
}
/**
 * Endereço de destino de um produto quando dá para saber: na Shopify e na Nuvemshop, o endereço do produto segue o
 * identificador do CSV que o app gerou (/products/<id> e /produtos/<id>/). No site personalizado, a vitrine.
 * Devolve { url, certeza: 'montado'|'vitrine' } ou null.
 */
export function urlDoProduto(produto, site) {
  const base = txt(site?.linkPublicado).replace(/\/+$/, '');
  if (!base || !produto?.nome) return null;
  const plat = plataformaDoSite(site);
  if (plat === 'shopify') return { url: `${base}/products/${slug(produto.nome)}`, certeza: 'montado' };
  if (plat === 'nuvemshop') return { url: `${base}/produtos/${slug(produto.nome)}/`, certeza: 'montado' };
  if (plat === 'custom') return { url: `${base}#catalogo`, certeza: 'vitrine' };
  return null;
}
/**
 * Avisos da montagem de campanha (nunca bloqueiam). ctx: { cliente, site, etiquetaAprov, produtos (com fotos de
 * "Usar em"), criativos (os que vão na campanha) }. Produtos checados: os ligados aos criativos; sem nenhum, todos.
 */
export function avisosCampanha({ cliente = {}, site = null, etiquetaAprov = null, produtos = [], criativos = [] } = {}) {
  const r = rastreamentoDe(cliente), loja = lojaDoCliente(site, etiquetaAprov);
  const avisos = [];
  if (!r.metaPixelId && !r.googleAdsId) avisos.push({ id: 'pixel', texto: 'Sem Pixel configurado: a campanha não vai conseguir medir as vendas no site (cadastre em Editar > Rastreamento ou na pergunta 16).' });
  if (!loja.publicada) avisos.push({ id: 'loja', texto: `Loja ainda não publicada${loja.aprovada ? '' : '/aprovada'}: os anúncios precisam de uma página no ar (aba Site/Loja, passos 5 e 6).` });
  else if (!loja.aprovada && loja.etiqueta) avisos.push({ id: 'aprovacao', texto: `Loja publicada, mas a última aprovação do site está "${loja.etiqueta}".` });
  const ids = new Set(criativos.map((c) => c.produtoId).filter(Boolean));
  const alvo = ids.size ? produtos.filter((p) => ids.has(p.id)) : produtos;
  for (const p of alvo.filter((x) => !(x.fotos || []).length)) avisos.push({ id: `foto-${p.id}`, texto: `Produto "${p.nome}" sem foto principal (envie no produto ou ligue uma foto em "Usar em").` });
  return avisos;
}

// ---------- prints de prova social em criativos ----------
/**
 * Prints que podem virar imagem de criativo. Regras: só a cópia borrada (nunca o original); autorização confirmada
 * (sem ela, `pedirAutorizacao`); cliente de saúde/emagrecimento: print que mostra resultado no corpo (kg, cm, antes e
 * depois) é bloqueado pela política do Meta. Devolve [{ material, url, usavel, pedirAutorizacao, motivo }].
 */
export function printsParaCriativo({ cliente = {}, produtos = [], materiais = [] } = {}) {
  const saude = ehProdutoSaude(cliente, produtos);
  return materiais.filter((m) => tipoMaterial(m) === 'prova_social' && m.url).map((m) => {
    const texto = [m.descricao, m.citacao, m.resumo, m.fonteProva, m.nomeOriginal].map(txt).join(' ');
    const achados = saude ? achadosSaude(texto) : [];
    if (achados.length) return { material: m, url: '', usavel: false, bloqueadoSaude: true, motivo: `${AVISO_META_SAUDE} (este print mostra: ${achados.join(', ')}). No site ele pode continuar.` };
    if (!m.borrada?.url) return { material: m, url: '', usavel: false, motivo: 'Borre nome, número e rosto antes (aba Site/Loja, passo 2): em criativo só entra a cópia borrada.' };
    return { material: m, url: m.borrada.url, usavel: true, pedirAutorizacao: !m.autorizado, motivo: m.autorizado ? '' : 'Precisa confirmar a autorização do cliente antes de usar.' };
  });
}

// ---------- diagnóstico ----------
/** O que o diagnóstico lê do cadastro (fonte), para mostrar e mandar à IA. */
export function fonteDiagnostico({ cliente = {}, site = null, etiquetaAprov = null, produtos = [] } = {}) {
  const r = rastreamentoDe(cliente), loja = lojaDoCliente(site, etiquetaAprov);
  return {
    pixel: r.metaPixelId || '', googleAds: r.googleAdsId ? `${r.googleAdsId}${r.googleAdsRotulo ? '/' + r.googleAdsRotulo : ''}` : '', hotjar: r.hotjarId || '', tawk: r.tawkPropertyId || '',
    plataforma: { shopify: 'Shopify', nuvemshop: 'Nuvemshop', custom: 'Site personalizado' }[loja.plataforma] || 'não escolhida', tema: loja.tema,
    linkLoja: loja.url, lojaPublicada: loja.publicada, aprovacao: loja.etiqueta || 'nenhum link de aprovação', oferta: txt(cliente.marca?.ofertaAtiva),
    produtos: produtos.map((p) => `${p.nome}${Number(p.preco) > 0 ? ` (${moeda(p.precoPromocional || p.preco)})` : ''}`).slice(0, 12),
  };
}
/** Linhas para o pedido da IA do diagnóstico. */
export const linhasFonteDiagnostico = (f) => [
  `Rastreamento cadastrado: Pixel do Meta ${f.pixel || 'NÃO cadastrado'}; Google Ads ${f.googleAds || 'não cadastrado'}; Hotjar ${f.hotjar || 'não'}; chat Tawk.to ${f.tawk || 'não'}.`,
  `Loja: ${f.plataforma}${f.tema ? ` (tema ${f.tema})` : ''}; ${f.lojaPublicada ? `publicada em ${f.linkLoja || '(endereço não informado)'}` : 'ainda NÃO publicada'}; aprovação do site: ${f.aprovacao}.`,
  `Oferta ativa no perfil de marca: ${f.oferta || 'nenhuma'}.`,
  f.produtos.length ? `Produtos cadastrados: ${f.produtos.join('; ')}.` : 'Nenhum produto cadastrado.',
].join('\n');

// ---------- Insights por produto e por oferta ----------
export const SEM_PRODUTO = 'Sem produto ligado';
export const SEM_OFERTA = 'Sem oferta registrada';
/** Produto de um resultado: o do criativo dele, lido agora. */
export function produtoDoResultado(r, criativos = [], produtos = []) {
  const c = criativos.find((x) => x.id === r.criativoId);
  const pid = c?.produtoId || r.produtoId || null; // resultado de print sem criativo pode vir ligado direto ao produto
  const p = pid ? produtos.find((x) => x.id === pid) : null;
  return p ? { id: p.id, nome: p.nome } : pid ? { id: pid, nome: 'produto excluído' } : { id: '', nome: SEM_PRODUTO };
}
/** Oferta de um resultado: a que estava ativa quando ele foi registrado (é um fato daquela data, não uma cópia). */
export const ofertaDoResultado = (r) => txt(r.oferta) || SEM_OFERTA;
/** Filtra resultados por produto (id; '' = sem produto) e/ou oferta. Valor null = sem filtro. */
export function filtrarResultados(resultados = [], { produtoId = null, oferta = null, criativos = [], produtos = [] } = {}) {
  return resultados.filter((r) => (produtoId == null || produtoDoResultado(r, criativos, produtos).id === produtoId) && (oferta == null || ofertaDoResultado(r) === oferta));
}
/** Agrupa por produto ou oferta: [{ chave, nome, amostras, gasto, roasMedio, cpaMedio }] do melhor ROAS para o pior. */
export function agruparResultados(resultados = [], por = 'produto', { criativos = [], produtos = [] } = {}) {
  const g = {};
  for (const r of resultados) {
    const k = por === 'produto' ? produtoDoResultado(r, criativos, produtos) : { id: ofertaDoResultado(r), nome: ofertaDoResultado(r) };
    const x = (g[k.id || k.nome] ||= { chave: k.id, nome: k.nome, amostras: 0, gasto: 0, rS: 0, rP: 0, cS: 0, cP: 0 });
    const peso = r.gasto > 0 ? r.gasto : 1;
    x.amostras++; x.gasto += Number(r.gasto) || 0;
    if (r.roas != null) { x.rS += r.roas * peso; x.rP += peso; }
    if (r.cpa != null) { x.cS += r.cpa * peso; x.cP += peso; }
  }
  return Object.values(g).map((x) => ({ chave: x.chave, nome: x.nome, amostras: x.amostras, gasto: x.gasto, roasMedio: x.rP ? x.rS / x.rP : null, cpaMedio: x.cP ? x.cS / x.cP : null }))
    .sort((a, b) => (b.roasMedio ?? -1) - (a.roasMedio ?? -1));
}
