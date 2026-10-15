// Ajuste por seção do site já gerado ("Ajustar este site", sugestões com "Fazer essa mudança"). Puro: sem banco e sem tela.
//  - O site é guardado em DADOS com nome fixo por seção (lib/site-blocos.js: blocos do personalizado, seções da prévia
//    do pacote); toda mudança é uma OPERAÇÃO conferida. Aqui cada operação ganha a SEÇÃO que ela mexe, para a IA receber
//    só as seções afetadas e o app recusar o que vier de fora delas.
//  - Sugestões (Conferência do pedido, Cara de IA, plano) têm uma CHAVE pelo conteúdo: ignorada uma vez, não volta na
//    próxima conferência do mesmo conteúdo (site.sugestoesIgnoradas).
//  - Depois de aplicar, as conferências baratas (sem IA) rodam só nas seções mudadas.
import { BLOCOS, nomeBloco, normalizarLayout, tituloBloco, problemaPaleta, secaoLojaDoNome } from './site-blocos.js';
import { SECOES_LOJA, ORDEM_LOJA, nomeSecaoLoja, normalizarVisual, tituloSecaoLoja } from './visual-site.js';
import { temCodigo, porCodigo, resumoUsos, usosDe } from './fotos-site.js';
import { itensAceitos } from './plano-site.js';
import { textosParaAplicar } from './textos-site.js';
import { achadosSaudeSite } from './saude.js';
import { secaoDoElemento, listaElementos, elementoValido } from './elementos-site.js';
import { verificarCaraDeIa } from './cara-de-ia.js';
import { TAREFAS_IA } from './constantes.js';
import { precoDoModelo } from './precos-ia.js';

const txt = (v) => String(v ?? '').trim();
const sem = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const corta = (s, n) => { const t = txt(s).replace(/\s+/g, ' '); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export const TODO = 'todo'; // "mudança no site todo" (global): a única que libera todas as seções
export const LIMITE_PEDIDO_AJUSTE = 2000;

// ---------- seções ----------
/** Seções do site no modo: [{ id, nome }]. Além dos blocos: "produto" (fotos/descrição do produto) e "geral" (cores, ajuste das fotos, ordem sugerida). */
export function secoesDoSite(modo) {
  const base = modo === 'pacote' ? SECOES_LOJA.map(([id, nome]) => ({ id, nome })) : BLOCOS.flatMap(([id, nome]) => (id === 'hero' ? [{ id, nome }, { id: 'destaques', nome: 'Destaques (seus textos)' }] : [{ id, nome }]));
  return [...base, { id: 'produto', nome: modo === 'pacote' ? 'Produtos (fotos e descrições do CSV)' : 'Página do produto' }, { id: 'geral', nome: modo === 'pacote' ? 'Visual geral (paleta, estilo do tema, ordem sugerida)' : 'Visual geral (cores e fotos dos produtos)' }, ...(modo === 'pacote' ? [] : [{ id: 'rodape', nome: 'Rodapé e dados da loja' }])];
}
export const nomeSecao = (id, modo) => (id === TODO ? 'Site todo' : secoesDoSite(modo).find((s) => s.id === id)?.nome || id);
export const secaoValida = (id, modo) => id === TODO || secoesDoSite(modo).some((s) => s.id === id);
/** Âncora da seção no HTML do site personalizado (lib/sitegen.js), para a prévia rolar até ela. */
export const ANCORA_SECAO = { hero: 'topo', provas: 'clientes-reais', categorias: 'categorias', vendidos: 'vendidos', sale: 'sale', catalogo: 'catalogo', marca: 'marca', galeria: 'galeria', depoimentos: 'depoimentos', faq: 'faq', newsletter: 'newsletter' };

const FOTO_CUSTOM = { banner: 'hero', clientes: 'provas', sobre: 'marca', galeria: 'galeria', produto: 'produto', nao: 'geral' };
const FOTO_PACOTE = { banner: 'banner', clientes: 'provas', sobre: 'sobre', galeria: 'galeria', produto: 'produto', nao: 'geral' };
const CAMPO_CUSTOM = { heroTitulo: 'hero', heroSubtitulo: 'hero', heroCta: 'hero', storytelling: 'marca', newsletterTitulo: 'newsletter', newsletterTexto: 'newsletter' };

/** Seção que uma operação mexe (null = operação sem seção conhecida: é recusada no ajuste por seção). */
export function secaoDaOperacao(op = {}, modo = 'custom', layout = {}) {
  // "Apontar no site" (lib/elementos-site.js): a seção vem do id do elemento (ou do elemento que o acréscimo segue).
  if (op.op === 'elemento') return secaoDoElemento(op.id, layout);
  if (op.op === 'extra') return secaoDoElemento(op.acao === 'adicionar' ? op.apos : op.id, layout);
  if (op.op === 'dadoLoja') return modo === 'pacote' ? 'geral' : 'rodape';
  if (op.op === 'destaque') return 'destaques';
  if (op.op === 'texto' && /^politicas./.test(txt(op.campo))) return 'rodape';
  if (op.op === 'foto') return (modo === 'pacote' ? FOTO_PACOTE : FOTO_CUSTOM)[op.uso] || null;
  if (op.op === 'paleta' || op.op === 'fotos') return 'geral';
  if (op.op === 'faq') return 'faq';
  if (modo === 'pacote') {
    if (['mover', 'ocultar', 'mostrar'].includes(op.op)) return ORDEM_LOJA.includes(op.bloco) ? op.bloco : secaoLojaDoNome(op.secao || op.bloco) || null;
    if (op.op === 'imagem') return 'banner';
    if (op.op === 'produto') return 'produto';
    if (op.op === 'texto') { const c = txt(op.campo); const mt = /^titulo\.(\w+)$/.exec(c); return mt ? (ORDEM_LOJA.includes(mt[1]) ? mt[1] : null) : /^destaques\./.test(c) ? 'destaques' : /^banner\./.test(c) ? 'banner' : c === 'sobre' ? 'sobre' : /^tema\./.test(c) ? 'geral' : /^confianca/.test(c) ? 'confianca' : null; }
    return null;
  }
  if (['mover', 'ocultar', 'mostrar', 'variacao', 'imagem'].includes(op.op)) return BLOCOS.some(([k]) => k === op.bloco) ? op.bloco : null;
  if (op.op === 'depoimento') return 'depoimentos';
  if (op.op === 'texto') { const c = txt(op.campo); const m = /^titulo\.(\w+)$/.exec(c); return m ? m[1] : CAMPO_CUSTOM[c] || null; }
  return null;
}

/**
 * Separa as operações que mexem só nas seções enviadas das que saem delas (essas o app recusa, com o motivo).
 * `secoes` com TODO = mudança no site todo (tudo vale).
 */
export function filtrarOperacoes(operacoes = [], secoes = [], modo = 'custom', layout = {}) {
  const dentro = [], fora = [];
  const todo = secoes.includes(TODO);
  for (const op of Array.isArray(operacoes) ? operacoes : []) {
    const s = secaoDaOperacao(op, modo, layout);
    if (todo || (s && secoes.includes(s))) dentro.push(op);
    else fora.push({ op, motivo: `Recusado: mexeria em "${s ? nomeSecao(s, modo) : 'outra parte do site'}", que não estava no pedido (só ${secoes.map((x) => `"${nomeSecao(x, modo)}"`).join(', ')}).` });
  }
  return { dentro, fora };
}

/** Mudanças aplicadas agrupadas por seção: [{ secao, nome, mudancas }] (r = resultado de aplicarOperacoes). */
export function mudancasPorSecao(r, modo) {
  const mapa = new Map();
  (r?.aplicadas || []).forEach((op, i) => {
    const s = secaoDaOperacao(op, modo, r.estado?.layout) || 'geral';
    if (!mapa.has(s)) mapa.set(s, []);
    mapa.get(s).push(r.mudancas[i]);
  });
  return [...mapa].map(([secao, mudancas]) => ({ secao, nome: nomeSecao(secao, modo), mudancas }));
}
/** Junta dois agrupamentos (rascunho que recebe mais mudanças). */
export function juntarPorSecao(a = [], b = []) {
  const out = a.map((x) => ({ ...x, mudancas: [...x.mudancas] }));
  for (const x of b) { const y = out.find((z) => z.secao === x.secao); if (y) y.mudancas.push(...x.mudancas); else out.push({ ...x, mudancas: [...x.mudancas] }); }
  return out;
}

// ---------- o que a IA recebe: só as seções afetadas ----------
const linhaFoto = (m, produtos) => `${m.codigo}: ${corta(m.nomeOriginal || m.descricao || m.nome || 'foto', 40)}${resumoUsos(m, produtos).length ? ` [${resumoUsos(m, produtos).map((u) => u.texto).join(', ')}]` : ''}`;
const fotosDoLugar = (materiais, uso) => materiais.filter((m) => temCodigo(m) && m.codigo && usosDe(m)[uso]).sort(porCodigo).map((m) => m.codigo);
const fotosDoProduto = (materiais, p) => materiais.filter((m) => temCodigo(m) && m.codigo && usosDe(m).produtos.some((u) => u.id === p.id)).sort(porCodigo).map((m) => m.codigo);

/**
 * Texto com os dados SÓ das seções pedidas (é o que vai para a IA no ajuste por seção). Sempre vai a ordem das seções
 * (para "mover") e, quando há foto envolvida, a lista curta de fotos com código. `secoes` com TODO = todas.
 */
export function resumoDasSecoes(estado = {}, secoes = [], modo = 'custom', { materiais = [], produtos = [] } = {}) {
  const ids = secoes.includes(TODO) ? secoesDoSite(modo).map((s) => s.id) : secoes;
  const linhas = [];
  if (modo === 'pacote') {
    const P = estado.pacote || {}, V = normalizarVisual(P.visual), tp = P.textosPagina || {};
    linhas.push(`Ordem das seções da prévia: ${V.ordem.map((k) => `${k}${V.ocultas.includes(k) ? ' (oculta)' : ''}`).join(', ')}.`);
    for (const id of ids) {
      const t = {
        banner: () => `banner: ${(P.banners || []).map((b, i) => `${i}: "${b.titulo || ''}" / "${b.subtitulo || ''}" [${b.cta || ''}]`).join(' | ') || '(sem banner)'}; imagem: ${V.banner?.nome || 'nenhuma'}; fotos no banner: ${fotosDoLugar(materiais, 'banner').join(', ') || 'nenhuma'}`,
        provas: () => `provas (Clientes reais): título "${tituloSecaoLoja(V, 'provas')}"; prints reais; dá para mover, ocultar e mostrar, tirar o título (provas.titulo) e a dica (provas.dica); o conteúdo nunca muda`,
        produtos: () => `produtos: ${produtos.map((p) => p.nome).join(', ') || '(nenhum)'}; fotos ${V.ajusteFotos === 'contain' ? 'inteiras' : 'preenchendo'}`,
        confianca: () => 'confianca (Compra segura): faixa fixa e legal (pagamento + resumo das políticas de envio e trocas); não sai e não tem texto próprio',
        depoimentos: () => `depoimentos: título "${tituloSecaoLoja(V, 'depoimentos')}"; só textos digitados pelo operador e prints como imagem (nunca escrever nem reescrever); elementos: depoimentos.titulo, depoimentos.textos (tirar os textos e deixar as imagens)`,
        destaques: () => `destaques (índice do grupo: título / textos com índice): ${(P.destaques || []).map((g, i) => `${i}: "${g.titulo || ''}" / ${(g.linhas || []).map((l, k) => `${k}: "${corta(l.texto, 160)}"`).join(' · ')}`).join(' | ') || '(nenhuma seção de destaques ainda: crie com {"op":"destaque","acao":"criar",...})'}`,
        sobre: () => `sobre: título "${tituloSecaoLoja(V, 'sobre')}"; texto "${corta(tp.sobre, 1500)}"; fotos em Sobre: ${fotosDoLugar(materiais, 'sobre').join(', ') || 'nenhuma'}`,
        galeria: () => `galeria: fotos ${fotosDoLugar(materiais, 'galeria').join(', ') || 'nenhuma'}`,
        faq: () => `faq (índice: pergunta / resposta): ${(tp.faq || []).map((f, i) => `${i}: ${f.p} / ${corta(f.r, 160)}`).join(' | ') || '(vazia)'}`,
        produto: () => `produto: ${(P.descricoesProdutos || []).map((d) => `${d.nome}: descrição "${corta(d.descricao, 400)}"`).join(' | ') || '(sem descrições)'}; fotos por produto: ${produtos.map((p) => `${p.nome}: ${fotosDoProduto(materiais, p).join(', ') || 'nenhuma'}`).join(' | ')}`,
        geral: () => `geral: paleta ${(P.briefingTema?.paletaSugerida || []).join(', ') || '(nenhuma)'}; estilo "${corta(P.briefingTema?.estilo, 300)}"; ordem sugerida da home: ${(P.briefingTema?.secoesHome || []).join(' > ') || '(nenhuma)'}`,
      }[id];
      if (t) linhas.push(t());
    }
  } else {
    const c = estado.conteudo || {}, L = normalizarLayout(estado.layout), cfg = estado.config || {};
    linhas.push(`Ordem dos blocos: ${L.ordem.map((k) => `${k}${L.ocultos.includes(k) ? ' (oculto)' : ''}`).join(', ')}.`);
    const tit = (k) => `título "${tituloBloco(L, k)}"`;
    const col = (k) => (L.variacoes?.[k]?.colunas ? `, ${L.variacoes[k].colunas} colunas` : '');
    for (const id of ids) {
      const t = {
        destaques: () => `destaques (índice do grupo: título / textos com índice): ${(c.destaques || []).map((g, i) => `${i}: "${g.titulo || ''}" / ${(g.linhas || []).map((l, k) => `${k}: "${corta(l.texto, 160)}"`).join(' · ')}`).join(' | ') || '(nenhuma)'}`,
        hero: () => `hero (banner): título "${c.heroTitulo || ''}", subtítulo "${c.heroSubtitulo || ''}", botão "${c.heroCta || ''}", altura ${L.variacoes?.hero?.altura || 'normal'}, imagem ${L.imagens.hero?.nome || 'nenhuma'}; fotos no banner: ${fotosDoLugar(materiais, 'banner').join(', ') || 'nenhuma'}`,
        provas: () => 'provas (Clientes reais): prints reais; dá para mover, ocultar e mostrar; o conteúdo nunca muda',
        categorias: () => `categorias: ${tit('categorias')}`, vendidos: () => `vendidos: ${tit('vendidos')}${col('vendidos')}`, sale: () => `sale: ${tit('sale')}${col('sale')}`, catalogo: () => `catalogo: ${tit('catalogo')}${col('catalogo')}`,
        marca: () => `marca (Nossa história): ${tit('marca')}, texto "${corta(c.storytelling, 1500)}", imagem ${L.imagens.marca?.nome || 'nenhuma'}; fotos em Sobre: ${fotosDoLugar(materiais, 'sobre').join(', ') || 'nenhuma'}`,
        galeria: () => `galeria: fotos ${fotosDoLugar(materiais, 'galeria').join(', ') || 'nenhuma'}`,
        depoimentos: () => `depoimentos: ${tit('depoimentos')}; (índice: nome — texto; nunca reescrever) ${(c.depoimentos || []).map((d, i) => `${i}: ${d.nome || 'cliente'} — "${corta(d.texto, 50)}"${L.depoimentosOcultos.includes(d.texto) ? ' (oculto)' : ''}`).join(' | ') || '(nenhum)'}`,
        faq: () => `faq: ${tit('faq')}; (índice: pergunta / resposta) ${(c.faq || []).map((f, i) => `${i}: ${f.p} / ${corta(f.r, 160)}`).join(' | ') || '(vazia)'}`,
        newsletter: () => `newsletter: título "${c.newsletterTitulo || ''}", texto "${c.newsletterTexto || ''}"`,
        produto: () => `produto (fotos da página do produto): ${produtos.map((p) => `${p.nome}: ${fotosDoProduto(materiais, p).join(', ') || 'nenhuma'}`).join(' | ') || '(nenhum produto)'}`,
        geral: () => `geral: cores principal ${cfg.corPrimaria || '#4f46e5'} / fundo ${cfg.corFundo || '#ffffff'}; fotos dos produtos ${L.ajusteFotos === 'contain' ? 'inteiras' : 'preenchendo'}`,
      }[id];
      if (t) linhas.push(t());
    }
  }
  const els = listaElementos(ids.filter((id) => id !== 'geral'), estado, { modo, materiais });
  if (els) linhas.push(`Elementos dessas seções (id: nome), para as operações por elemento:
${els}`);
  if (ids.includes('rodape') && modo !== 'pacote') linhas.push('rodape: dados da loja e políticas (exigência legal: NUNCA saem do site; só o texto muda).');
  const comFoto = ids.some((id) => ['hero', 'banner', 'marca', 'sobre', 'galeria', 'produto', 'provas'].includes(id));
  if (comFoto) linhas.push(`Fotos dos Materiais (código: nome [onde está]): ${materiais.filter((m) => temCodigo(m) && m.codigo).sort(porCodigo).slice(0, 60).map((m) => linhaFoto(m, produtos)).join(' | ') || '(nenhuma)'}`);
  return linhas.join('\n');
}

/** Uma linha curta por seção (para a IA barata descobrir quais seções o pedido mexe). */
export function mapaDasSecoes(estado = {}, modo = 'custom') {
  return secoesDoSite(modo).map((s) => `${s.id}: ${s.nome}`).join('\n');
}

// ---------- textos escritos pelo operador (três versões) ----------
/**
 * Textos do site que o operador escreveu e aprovou no plano (banner): { campo: { original, segura } }. Se o ajuste
 * reescrever um deles, o app mostra "Seu texto / Versão melhorada / Versão segura" em vez de trocar calado.
 */
export function textosDoOperador(site = {}, modo = 'custom') {
  const plano = (site.planos || []).find((p) => p.id === site.planoAplicado);
  if (!plano) return {};
  const out = {};
  for (const g of textosParaAplicar(itensAceitos(plano))) {
    const campo = { banner_titulo: modo === 'pacote' ? 'banner.0.titulo' : 'heroTitulo', banner_subtitulo: modo === 'pacote' ? 'banner.0.subtitulo' : 'heroSubtitulo' }[g.destino];
    if (campo) out[campo] = { original: g.linhas.map((l) => l.texto).join(' '), segura: g.linhas.map((l) => l.segura).filter(Boolean).join(' ') };
  }
  return out;
}
/** Operações de texto que reescrevem um texto do operador: [{ campo, original, melhorada, segura, escolha: null }]. */
export function escolhasDeTexto(operacoes = [], site = {}, modo = 'custom') {
  const dele = textosDoOperador(site, modo);
  const doOperador = operacoes.filter((op) => op.op === 'texto' && dele[op.campo] && txt(op.valor) && txt(op.valor) !== dele[op.campo].original)
    .map((op) => ({ campo: op.campo, original: dele[op.campo].original, melhorada: txt(op.valor), segura: txt(op.segura) || dele[op.campo].segura || '', escolha: null }));
  // "Adicionar abaixo" com "a IA sugere": o texto novo também passa pela escolha (versão da IA ou versão segura).
  const daIa = operacoes.filter((op) => op.op === 'extra' && op.acao === 'adicionar' && op.id && txt(op.segura) && txt(op.segura) !== txt(op.texto))
    .map((op) => ({ campo: op.id, extra: true, original: '', melhorada: txt(op.texto), segura: txt(op.segura), escolha: null }));
  return [...doOperador, ...daIa];
}

// ---------- custo estimado ----------
/** Custo estimado (US$) de uma chamada: entrada pelos caracteres do pedido (+ regras fixas), saída pela metade do limite. */
export function estimarCusto(tarefa, caracteres = 0, { tokensImagem = 0 } = {}) {
  const t = TAREFAS_IA[tarefa]; if (!t) return null;
  const p = precoDoModelo(t[3] === 'Haiku' ? 'haiku' : 'sonnet-5');
  const entrada = Math.round((caracteres + 9000) / 3.5) + tokensImagem, saida = Math.round(t[2] * 0.5);
  return { tarefa, modelo: t[3], entrada, saida, tokensImagem, usd: (entrada * p.entrada + saida * p.saida) / 1e6 };
}
export const textoCusto = (c) => (c ? `~US$ ${c.usd < 0.01 ? c.usd.toFixed(4) : c.usd.toFixed(3)} (${c.modelo})`.replace('.', ',') : '');

// ---------- sugestões e "Ignorar" (lib/sugestoes.js) ----------
export { FONTES_SUGESTAO, chaveSugestao, ignoradas, estaIgnorada, comIgnorada, semIgnorada } from './sugestoes.js';

/** Seção do site de um item do plano (para a Conferência do pedido mandar só ela no ajuste). */
export function secaoDoItemPlano(item = {}, modo = 'custom') {
  const pac = modo === 'pacote';
  const p = item.params || {};
  switch (item.tipo) {
    case 'banner_fotos': return pac ? 'banner' : 'hero';
    case 'clientes_fotos': return 'provas';
    case 'produto_fotos': case 'pagina_produto': case 'secoes_produto': case 'compre_junto': return 'produto';
    case 'galeria_fotos': return 'galeria';
    case 'sobre_fotos': return pac ? 'sobre' : 'marca';
    case 'faq': return 'faq';
    case 'depoimentos_home': return 'depoimentos';
    case 'colunas_produtos': return pac ? 'produtos' : 'vendidos';
    case 'cores': case 'fotos_ajuste': case 'ordem_secoes': return 'geral';
    case 'ocultar_secao': return secaoValida(p.secao, modo) ? p.secao : 'geral';
    case 'texto': return p.destino === 'banner_titulo' || p.destino === 'banner_subtitulo' ? (pac ? 'banner' : 'hero') : null;
    default: return null;
  }
}

/** Seção do site de um achado da Cara de IA (pelo caminho do texto). */
export function secaoDoAchado(a = {}, modo = 'custom') {
  const c = a.caminho || [];
  if (c[0] === 'conteudo') return modo === 'pacote' ? null : CAMPO_CUSTOM[c[1]] || { faq: 'faq', depoimentos: 'depoimentos', bannersPromo: 'sale' }[c[1]] || null;
  if (c[0] === 'pacote') return { banners: 'banner', descricoesProdutos: 'produto' }[c[1]] || (c[1] === 'textosPagina' ? { sobre: 'sobre', faq: 'faq' }[c[2]] || null : null);
  return a.tipo === 'banner' ? (modo === 'pacote' ? 'banner' : 'hero') : null;
}

// ---------- conferências baratas (sem IA) só nas seções mudadas ----------
const LIMITE_CELULAR = { heroTitulo: 60, 'banner.0.titulo': 60, heroCta: 24, 'banner.0.cta': 24 };
/** Textos de uma seção: [{ campo, texto }]. */
function textosDaSecao(estado, id, modo) {
  if (modo === 'pacote') {
    const P = estado.pacote || {}, tp = P.textosPagina || {};
    if (id === 'banner') return (P.banners || []).flatMap((b, i) => ['titulo', 'subtitulo', 'cta'].map((k) => ({ campo: `banner.${i}.${k}`, texto: b[k] })));
    if (id === 'sobre') return [{ campo: 'sobre', texto: tp.sobre }];
    if (id === 'faq') return (tp.faq || []).flatMap((f, i) => [{ campo: `faq.${i}.p`, texto: f.p }, { campo: `faq.${i}.r`, texto: f.r }]);
    if (id === 'produto') return (P.descricoesProdutos || []).map((d) => ({ campo: `produto.${d.nome}`, texto: d.descricao }));
    if (id === 'destaques') return (P.destaques || []).flatMap((g, i) => [{ campo: `destaques.${i}.titulo`, texto: g.titulo }, ...(g.linhas || []).map((l, k) => ({ campo: `destaques.${i}.linha.${k}`, texto: l.texto }))]);
    const tit = normalizarVisual(P.visual).titulos?.[id];
    return tit ? [{ campo: `titulo.${id}`, texto: tit }] : [];
  }
  const c = estado.conteudo || {}, L = normalizarLayout(estado.layout);
  if (id === 'hero') return ['heroTitulo', 'heroSubtitulo', 'heroCta'].map((k) => ({ campo: k, texto: c[k] }));
  if (id === 'marca') return [{ campo: 'titulo.marca', texto: tituloBloco(L, 'marca') }, { campo: 'storytelling', texto: c.storytelling }];
  if (id === 'newsletter') return [{ campo: 'newsletterTitulo', texto: c.newsletterTitulo }, { campo: 'newsletterTexto', texto: c.newsletterTexto }];
  if (id === 'faq') return (c.faq || []).flatMap((f, i) => [{ campo: `faq.${i}.p`, texto: f.p }, { campo: `faq.${i}.r`, texto: f.r }]);
  if (id === 'destaques') return (c.destaques || []).flatMap((g, i) => [{ campo: `destaques.${i}.titulo`, texto: g.titulo }, ...(g.linhas || []).map((l, k) => ({ campo: `destaques.${i}.linha.${k}`, texto: l.texto }))]);
  if (L.titulos?.[id]) return [{ campo: `titulo.${id}`, texto: L.titulos[id] }];
  return [];
}

/**
 * Conferências baratas nas seções mudadas: alegação de saúde (aviso, não bloqueia), cara de IA, leitura no celular
 * (título longo, palavra que não quebra) e contraste das cores. Devolve [{ secao, nome, itens: [{ tipo, ok, texto }] }].
 */
export function conferirSecoes(estado = {}, secoes = [], modo = 'custom', { saude = false, produtos = [], design = null } = {}) {
  const ids = secoes.includes(TODO) ? secoesDoSite(modo).map((s) => s.id) : secoes;
  const cara = verificarCaraDeIa({ site: modo === 'pacote' ? { pacote: estado.pacote, conteudo: {} } : { conteudo: estado.conteudo, layout: estado.layout }, modo, design, produtos });
  return ids.map((id) => {
    const itens = [];
    const textos = textosDaSecao(estado, id, modo).filter((t) => txt(t.texto));
    if (saude) {
      const ach = [...new Set(textos.flatMap((t) => achadosSaudeSite(t.texto)))];
      itens.push(ach.length ? { tipo: 'saude', ok: false, texto: `Alegação de efeito no corpo: ${ach.map((a) => `"${a}"`).join(', ')}. No site fica só com o seu "Entendi e quero manter no site"; nos anúncios continua bloqueada.` } : { tipo: 'saude', ok: true, texto: 'Sem alegação de efeito no corpo.' });
    }
    const cliches = cara.filter((a) => a.tipo !== 'cor' && a.tipo !== 'banner' && secaoDoAchado(a, modo) === id);
    if (textos.length) itens.push(cliches.length ? { tipo: 'cara_de_ia', ok: false, texto: `Cara de IA: ${cliches.map((a) => a.titulo).join('; ')}.` } : { tipo: 'cara_de_ia', ok: true, texto: 'Sem clichê de IA.' });
    const longos = textos.filter((t) => LIMITE_CELULAR[t.campo] && txt(t.texto).length > LIMITE_CELULAR[t.campo]);
    const palavra = textos.map((t) => txt(t.texto).split(/\s+/).find((w) => w.length > 22)).find(Boolean);
    if (textos.length) itens.push(longos.length || palavra ? { tipo: 'celular', ok: false, texto: [longos.length && `Texto longo para o celular: ${longos.map((t) => `${t.campo} com ${txt(t.texto).length} caracteres`).join(', ')}.`, palavra && `Palavra muito longa ("${corta(palavra, 30)}") pode passar da tela de 390px.`].filter(Boolean).join(' ') } : { tipo: 'celular', ok: true, texto: 'Cabe no celular (390px) sem rolar para o lado.' });
    if (id === 'geral' && modo !== 'pacote') {
      const prob = problemaPaleta(estado.config?.corPrimaria || '#4f46e5', estado.config?.corFundo || '#ffffff');
      itens.push(prob ? { tipo: 'contraste', ok: false, texto: `Contraste: ${prob}` } : { tipo: 'contraste', ok: true, texto: 'Contraste das cores legível (mínimo 4,5).' });
    }
    return { secao: id, nome: nomeSecao(id, modo), itens };
  }).filter((s) => s.itens.length);
}

/** Sobre o pedido livre: começa com "Na seção X:" (botão "Mudar esta seção")? Devolve o id ou null. */
export function secaoDoPrefixo(mensagem = '', modo = 'custom') {
  const m = /^\s*na seção\s+"([^"]+)"\s*:/i.exec(String(mensagem));
  if (!m) return null;
  return secoesDoSite(modo).find((s) => sem(s.nome) === sem(m[1]))?.id || null;
}
export const prefixoSecao = (id, modo) => `Na seção "${nomeSecao(id, modo)}": `;

/** "Entendi assim" da IA, conferido: { global, secoes: [{ id, nome, oque, estrutura }], perguntas: [{ texto, opcoes: [{ texto, secoes, instrucao }] }], fora: [] }. */
// Elementos apontados ("Apontar no site" ou marca no print): só ids que existem; o elemento sempre fica na seção dele.
const elementosOk = (lista, secao) => [...new Set((Array.isArray(lista) ? lista : []).map(txt).filter((id) => elementoValido(id) && (!secao || secaoDoElemento(id) === secao)))].slice(0, 10);
export function normalizarEntendimento(d = {}, modo = 'custom') {
  const global = d.global === true;
  const secoes = (Array.isArray(d.secoes) ? d.secoes : []).map((s) => ({ id: txt(s?.id), oque: corta(s?.oque, 240), estrutura: s?.estrutura === true, elementos: elementosOk(s?.elementos, txt(s?.id)) }))
    .filter((s) => s.id && s.id !== TODO && secaoValida(s.id, modo)).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i).map((s) => ({ ...s, nome: nomeSecao(s.id, modo) }));
  const perguntas = (Array.isArray(d.perguntas) ? d.perguntas : []).map((q) => ({
    texto: corta(q?.texto, 240),
    opcoes: (Array.isArray(q?.opcoes) ? q.opcoes : []).map((o) => ({ texto: corta(typeof o === 'string' ? o : o?.texto, 80), secoes: [...new Set([...(Array.isArray(o?.secoes) ? o.secoes : []), ...elementosOk(o?.elementos).map((id) => secaoDoElemento(id))])].filter((id) => secaoValida(id, modo) && id !== TODO), elementos: elementosOk(o?.elementos), instrucao: corta(o?.instrucao, 300) })).filter((o) => o.texto).slice(0, 3),
    resposta: null,
  })).filter((q) => q.texto && q.opcoes.length >= 2).map((q, i) => ({ id: `q${i + 1}`, ...q }));
  const fora = (Array.isArray(d.fora) ? d.fora : []).map((x) => corta(x, 200)).filter(Boolean);
  // O que não tem operação neste site (dito ANTES de rodar), com a alternativa mais próxima.
  const impossivel = (Array.isArray(d.impossivel) ? d.impossivel : []).map((x) => (typeof x === 'string' ? { oque: corta(x, 200), alternativa: '' } : { oque: corta(x?.oque, 200), alternativa: corta(x?.alternativa, 200) })).filter((x) => x.oque).slice(0, 8);
  // Print de outro site: só a ideia de layout (nunca texto, logo ou imagem dele).
  const referencia = d.referencia && txt(d.referencia.copiar) ? { copiar: corta(d.referencia.copiar, 300) } : null;
  return { global, secoes: global ? [{ id: TODO, nome: 'Site todo', oque: corta(d.oque || secoes.map((s) => s.oque).join(' ') || 'mudança no site todo', 240), estrutura: true, elementos: [] }] : secoes, perguntas, fora, impossivel, ...(referencia ? { referencia } : {}) };
}
/** Resposta de uma pergunta do "Entendi assim": as seções da opção entram e a instrução ganha o complemento. */
export function responderEntendimento(ent, perguntaId, indice, modo = 'custom') {
  const q = ent.perguntas.find((x) => x.id === perguntaId); const o = q?.opcoes?.[indice]; if (!q || !o) return ent;
  const novas = o.secoes.filter((id) => !ent.secoes.some((s) => s.id === id)).map((id) => ({ id, nome: nomeSecao(id, modo), oque: o.instrucao || o.texto, estrutura: false, elementos: (o.elementos || []).filter((e) => secaoDoElemento(e) === id) }));
  const comEl = ent.secoes.map((s) => ({ ...s, elementos: [...new Set([...(s.elementos || []), ...(o.elementos || []).filter((e) => secaoDoElemento(e) === s.id)])] }));
  return { ...ent, secoes: ent.secoes.some((s) => s.id === TODO) ? ent.secoes : [...comEl, ...novas], perguntas: ent.perguntas.map((x) => (x.id === perguntaId ? { ...x, resposta: o.texto, instrucao: o.instrucao } : x)), complementos: [...(ent.complementos || []), `${q.texto} → ${o.texto}${o.instrucao ? ` (${o.instrucao})` : ''}`] };
}
/** Tarefa do ajuste: Sonnet só quando muda layout/estrutura ou é o site todo; o resto é Haiku. */
export const tarefaDoAjuste = (ent) => (ent.secoes.some((s) => s.id === TODO || s.estrutura) ? 'ajuste_secao_amplo' : 'ajuste_secao');
