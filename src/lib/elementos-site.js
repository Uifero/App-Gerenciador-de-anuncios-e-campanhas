// "Apontar no site": os ELEMENTOS de cada seção, com id pelo significado (nunca pela posição), o nome que aparece no
// rótulo ("Página do produto › preço"), o que pode ser feito com cada um e a tradução de cada ação do menu em
// OPERAÇÕES validadas por lib/site-blocos.js (nada de IA: tirar, espaço, tamanho, ordem, foto, texto digitado).
// Os ids saem na montagem do HTML (lib/sitegen.js: data-el), sem mudar dado guardado. O que o operador muda por
// elemento fica em layout.elementos / layout.ordemElementos / layout.extras (site personalizado). No pacote, espaço,
// tamanho e "Adicionar abaixo" são do tema: viram itens do "Ajustar no tema" no passo 6.
// Itens legais (CNPJ, contato, políticas, arrependimento, selo de compra segura, carrinho) NÃO saem do site: o CDC e o
// Decreto 7.962/2013 exigem que fiquem visíveis. Continuam editáveis pelo "Mudar o texto".

const txt = (v) => String(v ?? '').trim();
const sem = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export const VITRINES = ['vendidos', 'sale', 'catalogo'];
const NOME_SECAO = {
  hero: 'Banner', provas: 'Clientes reais', categorias: 'Categorias', vendidos: 'Mais vendidos', sale: 'Promoções', catalogo: 'Catálogo',
  marca: 'Nossa história', galeria: 'Galeria', depoimentos: 'Depoimentos', faq: 'Perguntas frequentes', newsletter: 'Newsletter', destaques: 'Destaques',
  produto: 'Página do produto', rodape: 'Rodapé', geral: 'Topo do site',
  banner: 'Banner', produtos: 'Produtos', confianca: 'Compra segura', sobre: 'Sobre a marca',
};
const COM_TITULO = ['provas', 'categorias', 'vendidos', 'sale', 'catalogo', 'marca', 'galeria', 'depoimentos', 'faq'];
const CARD = { foto: 'foto', nome: 'nome do produto', preco: 'preço', variacoes: 'variações', botao: 'botão de compra', detalhes: 'link "Ver detalhes"' };
const PDP = { fotos: 'fotos', nome: 'nome', contador: 'contador da oferta', preco: 'preço', frete: 'selo de frete', variacoes: 'variações', botao: 'botão de compra', descricao: 'descrição', secoes: 'fórmula, benefícios e modo de uso', junto: '"Compre junto"' };

/** Elementos fixos do site personalizado: { id: { nome, campo (texto editável), foto (uso no "Usar em"), dado (dado da loja), politica } }. */
export const ELEMENTOS = {
  'hero.titulo': { nome: 'título', campo: 'heroTitulo' }, 'hero.subtitulo': { nome: 'subtítulo', campo: 'heroSubtitulo' }, 'hero.contador': { nome: 'contador da oferta' },
  'hero.botao': { nome: 'botão', campo: 'heroCta' }, 'hero.foto': { nome: 'foto', foto: 'banner' },
  ...Object.fromEntries(COM_TITULO.map((k) => [`${k}.titulo`, { nome: 'título da seção', campo: `titulo.${k}` }])),
  ...Object.fromEntries(VITRINES.flatMap((v) => Object.entries(CARD).map(([k, nome]) => [`${v}.${k}`, { nome, ...(k === 'foto' ? { foto: 'produto' } : {}) }]))),
  ...Object.fromEntries(Object.entries(PDP).map(([k, nome]) => [`produto.${k}`, { nome, ...(k === 'fotos' ? { foto: 'produto' } : {}) }])),
  'marca.foto': { nome: 'foto', foto: 'sobre' }, 'marca.texto': { nome: 'texto da história', campo: 'storytelling' },
  'newsletter.titulo': { nome: 'título', campo: 'newsletterTitulo' }, 'newsletter.texto': { nome: 'texto', campo: 'newsletterTexto' }, 'newsletter.form': { nome: 'campo de e-mail' },
  'geral.barraFrete': { nome: 'barra de frete grátis' },
  'rodape.loja': { nome: 'nome da loja' }, 'rodape.razaoSocial': { nome: 'razão social', dado: 'razaoSocial' }, 'rodape.cnpj': { nome: 'CNPJ', dado: 'cnpj' },
  'rodape.endereco': { nome: 'endereço', dado: 'endereco' }, 'rodape.email': { nome: 'e-mail', dado: 'email' }, 'rodape.telefone': { nome: 'telefone', dado: 'telefone' },
  'rodape.trocas': { nome: 'política de trocas e arrependimento', politica: 'trocas' }, 'rodape.envio': { nome: 'política de envio', politica: 'envio' },
  'rodape.privacidade': { nome: 'política de privacidade', politica: 'privacidade' }, 'rodape.pagamentos': { nome: 'formas de pagamento' }, 'rodape.copy': { nome: 'direitos e preferências de cookies' },
};
/** Elementos que mudam de ordem dentro da seção, na ordem padrão (o grupo é o começo do id). */
export const ORDENAVEIS = {
  hero: ['titulo', 'subtitulo', 'contador', 'botao'],
  produto: ['nome', 'contador', 'preco', 'frete', 'variacoes', 'botao', 'descricao', 'secoes', 'junto'],
  marca: ['titulo', 'foto', 'texto'], newsletter: ['titulo', 'texto', 'form'],
  ...Object.fromEntries(VITRINES.map((v) => [v, ['foto', 'nome', 'preco', 'variacoes', 'botao', 'detalhes']])),
};

// ---------- ids ----------
export const idFaq = (pergunta) => `faq.item.${hash(sem(pergunta))}`;
const partes = (id) => txt(id).split('.');
/** Seção do elemento (o id é a própria seção quando não tem ponto). Extra: a seção do elemento que ela segue. */
export function secaoDoElemento(id, layout = {}) {
  const [s] = partes(id);
  if (s === 'extra') { const x = (layout.extras || []).find((e) => e.id === id); return x ? secaoDoElemento(x.apos, layout) : null; }
  return s || null;
}
export const ehSecao = (id) => Boolean(id) && !txt(id).includes('.');
/** Nome do rótulo: "Página do produto › selo de frete". */
export function nomeElemento(id, { layout = {}, estado = {} } = {}) {
  const p = partes(id), s = p[0];
  const secao = NOME_SECAO[s] || s;
  if (p.length === 1) return `Seção ${secao}`;
  if (ELEMENTOS[id]) return `${secao} › ${ELEMENTOS[id].nome}`;
  if (s === 'faq' && p[1] === 'item') { const f = (estado.conteudo?.faq || estado.pacote?.textosPagina?.faq || []).find((x) => idFaq(x.p) === id); return `${secao} › pergunta${f ? ` "${f.p.slice(0, 40)}"` : ''}`; }
  if (s === 'galeria' && p[1] === 'foto') return `${secao} › foto ${p[2]}`;
  if (s === 'depoimentos' && p[1] === 'item') return `${secao} › depoimento ${Number(p[2]) + 1}`;
  if (s === 'extra') { const x = (layout.extras || []).find((e) => e.id === id); return `${x ? nomeElemento(x.apos, { layout, estado }).split(' › ')[0] : 'Seção'} › ${TIPOS_EXTRA[x?.tipo] || 'acréscimo'} acrescentado`; }
  if (['banner', 'sobre', 'faq'].includes(s)) return `${secao} › ${{ titulo: 'título', subtitulo: 'subtítulo', cta: 'botão', texto: 'texto' }[p[1]] || p[1]}`;
  return `${secao} › ${p.slice(1).join(' ')}`;
}
/** id conhecido (fixo ou de um padrão dinâmico)? */
export function elementoValido(id) {
  const p = partes(id);
  if (p.length === 1) return Boolean(NOME_SECAO[p[0]]);
  return Boolean(ELEMENTOS[id]) || ['banner.titulo', 'banner.subtitulo', 'banner.cta', 'sobre.texto'].includes(id) || (p[0] === 'faq' && p[1] === 'item' && p[2]) || (p[0] === 'galeria' && p[1] === 'foto' && /^F\d+$/i.test(p[2] || ''))
    || (p[0] === 'depoimentos' && p[1] === 'item' && /^\d+$/.test(p[2] || '')) || (p[0] === 'extra' && Boolean(p[1]));
}

// ---------- itens protegidos ----------
export const MOTIVO_LEGAL = 'não sai do site: o Código de Defesa do Consumidor e o Decreto 7.962/2013 exigem que dados da loja (razão social, CNPJ, endereço e contato), políticas, direito de arrependimento e as informações de compra segura fiquem visíveis. Dá para mudar o texto ("Mudar o texto").';
export const ehLegal = (id) => /^(rodape|carrinho)\b/.test(txt(id)) || /\.selo$/.test(txt(id)) || /^confianca$/.test(txt(id));
export const ehCompra = (id) => /^(produto|vendidos|sale|catalogo)\.(preco|botao)$/.test(txt(id));
export const AVISO_COMPRA = (id) => `Sem ${/preco$/.test(id) ? 'preço' : 'botão de compra'} o cliente não consegue comprar por aqui. Tirar mesmo assim?`;

// ---------- passos fixos (o desenho continua consistente) ----------
export const ESPACOS = { '-1': 'P', 0: 'M', 1: 'G', 2: 'GG' };
const ESPACO_EL = { '-1': '2px', 1: '20px', 2: '36px' };
const ESPACO_SECAO = { '-1': '20px', 1: '72px', 2: '104px' };
const ZOOM = { '-2': 0.8, '-1': 0.9, 1: 1.15, 2: 1.3 };
export const limitar = (n, min, max) => Math.max(min, Math.min(max, Math.round(Number(n) || 0)));

/** Estilo de um elemento no HTML (o que o operador ajustou): { oculto, estilo } (estilo = CSS em linha). */
export function estiloElemento(layout = {}, id, { ordem = null } = {}) {
  const x = layout.elementos?.[id] || {};
  const css = [];
  if (x.espaco) css.push(ehSecao(id) ? `padding-top:${ESPACO_SECAO[x.espaco]};padding-bottom:${ESPACO_SECAO[x.espaco]}` : `margin-top:${ESPACO_EL[x.espaco]};margin-bottom:${ESPACO_EL[x.espaco]}`);
  if (x.tamanho) css.push(`zoom:${ZOOM[x.tamanho]}`);
  if (ordem != null) css.push(`order:${ordem}`);
  return { oculto: Boolean(x.oculto), estilo: css.join(';') };
}
/** Ordem do elemento no grupo (null = ordem padrão do HTML, sem `order`). */
export function ordemDe(layout = {}, id) {
  const [g, k] = partes(id);
  const lista = layout.ordemElementos?.[g];
  return Array.isArray(lista) && lista.includes(k) ? lista.indexOf(k) : null;
}
export const grupoOrdenado = (layout = {}, g) => Array.isArray(layout.ordemElementos?.[g]) && layout.ordemElementos[g].length > 0;

/**
 * Marca o primeiro tag de um pedaço de HTML com o id do elemento (data-el, data-el-nome) e o estilo do operador; devolve
 * '' quando o operador tirou o elemento; acrescenta logo depois os itens de "Adicionar abaixo".
 */
export function marcarElemento(html, id, { layout = {}, estado = {}, extras = () => '', produto = '' } = {}) {
  const h = String(html || '');
  if (!h.trim()) return h;
  const { oculto, estilo } = estiloElemento(layout, id, { ordem: ordemDe(layout, id) });
  if (oculto) return extras(id);
  const nome = nomeElemento(id, { layout, estado }).replace(/"/g, '&quot;');
  const atributos = ` data-el="${id}" data-el-nome="${nome}"${produto ? ` data-produto="${produto}"` : ''}`;
  const m = /^(\s*<[a-zA-Z][\w-]*)([^>]*)>/.exec(h);
  if (!m) return h + extras(id);
  let resto = m[2];
  if (estilo) resto = /\sstyle="/.test(resto) ? resto.replace(/\sstyle="([^"]*)"/, (_, s) => ` style="${s}${s && !s.trim().endsWith(';') ? ';' : ''}${estilo}"`) : `${resto} style="${estilo}"`;
  return `${m[1]}${resto}${atributos}>${h.slice(m[0].length)}${extras(id)}`;
}

// ---------- "Adicionar abaixo" ----------
export const TIPOS_EXTRA = { texto: 'texto', selo: 'selo', foto: 'foto', botao: 'botão', pergunta: 'pergunta frequente' };
/** HTML dos acréscimos que seguem um elemento (texto escapado aqui; foto pelo código, lida dos Materiais). */
export function htmlExtras(layout = {}, apos, { materiais = [], esc = (s) => s, destino = '#catalogo' } = {}) {
  return (layout.extras || []).filter((x) => x.apos === apos).map((x) => {
    const est = estiloElemento(layout, x.id);
    if (est.oculto) return '';
    const st = est.estilo ? ` style="${est.estilo}"` : '';
    const at = ` data-el="${x.id}" data-el-nome="${esc(nomeElemento(x.id, { layout }))}"${st}`;
    if (x.tipo === 'foto') { const m = materiais.find((y) => String(y.codigo || '').toUpperCase() === String(x.codigo || '').toUpperCase()); return m?.url ? `<img class="extra-foto"${at} src="${esc(m.url)}" alt="" loading="lazy">` : ''; }
    if (x.tipo === 'selo') return `<p class="extra-selo"${at}>✓ ${esc(x.texto)}</p>`;
    if (x.tipo === 'botao') return `<a class="btn extra-botao"${at} href="${destino}">${esc(x.texto)}</a>`;
    return `<p class="extra-texto"${at}>${esc(x.texto)}</p>`;
  }).join('');
}
export const CSS_ELEMENTOS = '.ord{display:flex;flex-direction:column;align-items:flex-start}.extra-texto{margin:12px 0;line-height:1.6}.extra-selo{display:inline-flex;gap:6px;margin:10px 0;padding:6px 10px;border:1px solid var(--borda,#e5e7eb);border-radius:var(--raio,8px);font-weight:600;font-size:14px}.extra-foto{display:block;max-width:100%;height:auto;margin:12px 0;border-radius:var(--raio,8px)}.extra-botao{display:inline-flex;margin:12px 0;text-decoration:none}';

// ---------- ação do menu -> operações ----------
const CAMPOS_PACOTE = { 'banner.titulo': 'banner.0.titulo', 'banner.subtitulo': 'banner.0.subtitulo', 'banner.cta': 'banner.0.cta', 'sobre.texto': 'sobre' };
/** Texto atual do elemento (para "Mudar o texto"). */
export function textoAtual(id, { estado = {}, dadosLoja = {}, modo = 'custom' } = {}) {
  if (modo === 'pacote') {
    const P = estado.pacote || {};
    if (CAMPOS_PACOTE[id]) { const c = CAMPOS_PACOTE[id]; return c === 'sobre' ? P.textosPagina?.sobre || '' : P.banners?.[0]?.[c.split('.')[2]] || ''; }
    const f = (P.textosPagina?.faq || []).find((x) => idFaq(x.p) === id); return f ? { p: f.p, r: f.r } : '';
  }
  const c = estado.conteudo || {}, e = ELEMENTOS[id];
  if (e?.campo) return /^titulo\./.test(e.campo) ? estado.layout?.titulos?.[e.campo.slice(7)] || '' : c[e.campo] || '';
  if (e?.dado) return dadosLoja[e.dado] || '';
  if (e?.politica) return c.politicas?.[e.politica] || '';
  const f = (c.faq || []).find((x) => idFaq(x.p) === id); if (f) return { p: f.p, r: f.r };
  const x = (estado.layout?.extras || []).find((y) => y.id === id); if (x) return x.texto || '';
  return null;
}
export const temTexto = (id, ctx = {}) => textoAtual(id, ctx) !== null && textoAtual(id, ctx) !== undefined && !(ctx.modo !== 'pacote' && !ELEMENTOS[id]?.campo && !ELEMENTOS[id]?.dado && !ELEMENTOS[id]?.politica && !/^faq\.item\./.test(id) && !/^extra\./.test(id));
export const temFoto = (id) => Boolean(ELEMENTOS[id]?.foto) || /^galeria\.foto\./.test(id) || ['banner'].includes(id);
const fotosNo = (materiais, uso) => materiais.filter((m) => m.usos?.[uso]).map((m) => m.codigo).filter(Boolean);

/**
 * Traduz uma ação do menu em operações. ctx: { estado, modo, materiais, produtos, dadosLoja }. Devolve
 * { ops } | { recusa } (com o motivo) | { tema: { secao, elemento, oque } } (pacote: anotar no passo 6), mais
 * `confirmar` (texto de confirmação, ex.: tirar o preço).
 */
export function operacoesDaAcao(acao, id, valor = null, ctx = {}) {
  const { estado = {}, modo = 'custom', materiais = [], produtos = [] } = ctx;
  const pac = modo === 'pacote';
  const p = partes(id), secao = secaoDoElemento(id, estado.layout);
  const nome = nomeElemento(id, { layout: estado.layout, estado });
  const doTema = (oque) => ({ tema: { secao: NOME_SECAO[secao] || secao, elemento: nome, oque } });
  switch (acao) {
    case 'tirar': {
      if (ehLegal(id)) return { recusa: `${nome} ${MOTIVO_LEGAL}` };
      if (ehSecao(id)) return { ops: [{ op: 'ocultar', bloco: id }] };
      if (pac) return doTema('Tirar este elemento');
      if (p[0] === 'faq' && p[1] === 'item') { const i = (estado.conteudo?.faq || []).findIndex((f) => idFaq(f.p) === id); return i < 0 ? { recusa: 'Essa pergunta não existe mais.' } : { ops: [{ op: 'faq', acao: 'remover', indice: i }] }; }
      if (p[0] === 'galeria' && p[1] === 'foto') return { ops: [{ op: 'foto', codigo: p[2], uso: 'galeria', acao: 'tirar' }] };
      if (p[0] === 'depoimentos' && p[1] === 'item') return { ops: [{ op: 'depoimento', acao: 'ocultar', indice: Number(p[2]) }] };
      if (p[0] === 'extra') return { ops: [{ op: 'extra', acao: 'remover', id }] };
      return { ops: [{ op: 'elemento', id, acao: 'ocultar' }], ...(ehCompra(id) ? { confirmar: AVISO_COMPRA(id) } : {}) };
    }
    case 'junto': case 'separado': {
      if (pac) return doTema(acao === 'junto' ? 'Deixar mais junto (menos espaço em volta)' : 'Deixar mais separado (mais espaço em volta)');
      return { ops: [{ op: 'elemento', id, acao: 'espaco', passo: acao === 'junto' ? -1 : 1 }] };
    }
    case 'maior': case 'menor': {
      if (pac) return doTema(acao === 'maior' ? 'Aumentar o tamanho' : 'Diminuir o tamanho');
      if (ehSecao(id)) return { recusa: 'O tamanho muda em cada elemento: toque no título, no texto ou na foto.' };
      return { ops: [{ op: 'elemento', id, acao: 'tamanho', passo: acao === 'maior' ? 1 : -1 }] };
    }
    case 'subir': case 'descer': {
      const d = acao === 'subir' ? -1 : 1;
      if (ehSecao(id)) {
        const ordem = pac ? (estado.pacote?.visual?.ordem || []) : (estado.layout?.ordem || []);
        const ocultos = pac ? (estado.pacote?.visual?.ocultas || []) : (estado.layout?.ocultos || []);
        const vis = ordem.filter((k) => !ocultos.includes(k)), i = vis.indexOf(id), viz = vis[i + d];
        if (i < 0 || !viz) return { recusa: `A seção já está ${d < 0 ? 'no topo' : 'no fim'}.` };
        return { ops: [{ op: 'mover', bloco: id, [d < 0 ? 'antesDe' : 'depoisDe']: viz }] };
      }
      if (p[0] === 'faq' && p[1] === 'item') {
        const lista = pac ? estado.pacote?.textosPagina?.faq || [] : estado.conteudo?.faq || [];
        const i = lista.findIndex((f) => idFaq(f.p) === id); return i < 0 ? { recusa: 'Essa pergunta não existe mais.' } : { ops: [{ op: 'faq', acao: 'mover', indice: i, direcao: acao }] };
      }
      if (pac) return doTema(acao === 'subir' ? 'Subir dentro da seção' : 'Descer dentro da seção');
      if (!ORDENAVEIS[p[0]]?.includes(p[1])) return { recusa: p[0] === 'galeria' ? 'A ordem das fotos fica em Materiais do cliente ("Usar em", passo 2).' : 'Esse elemento não muda de ordem dentro da seção.' };
      // Só os elementos que aparecem na página contam (o contador sem prazo, por exemplo, não está lá).
      const visiveis = (ctx.irmaos || []).filter((x) => partes(x)[0] === p[0] && partes(x).length === 2).map((x) => partes(x)[1]);
      return { ops: [{ op: 'elemento', id, acao: 'mover', direcao: acao, ...(visiveis.length ? { visiveis } : {}) }] };
    }
    case 'texto': {
      if (valor == null || (typeof valor === 'string' && !txt(valor))) return { recusa: ehLegal(id) ? `${nome}: o texto não pode ficar vazio (${MOTIVO_LEGAL})` : 'Escreva o texto novo.' };
      if (pac) {
        if (CAMPOS_PACOTE[id]) return { ops: [{ op: 'texto', campo: CAMPOS_PACOTE[id], valor: txt(valor) }] };
        const i = (estado.pacote?.textosPagina?.faq || []).findIndex((f) => idFaq(f.p) === id);
        return i < 0 ? { recusa: 'Esse texto não muda por aqui no pacote.' } : { ops: [{ op: 'faq', acao: 'editar', indice: i, p: txt(valor.p), r: txt(valor.r) }] };
      }
      const e = ELEMENTOS[id];
      if (e?.campo) return { ops: [{ op: 'texto', campo: e.campo, valor: txt(valor) }] };
      if (e?.dado) return { ops: [{ op: 'dadoLoja', campo: e.dado, valor: txt(valor) }] };
      if (e?.politica) return { ops: [{ op: 'texto', campo: `politicas.${e.politica}`, valor: txt(valor) }] };
      if (p[0] === 'faq' && p[1] === 'item') { const i = (estado.conteudo?.faq || []).findIndex((f) => idFaq(f.p) === id); return i < 0 ? { recusa: 'Essa pergunta não existe mais.' } : { ops: [{ op: 'faq', acao: 'editar', indice: i, p: txt(valor.p), r: txt(valor.r) }] }; }
      if (p[0] === 'extra') return { ops: [{ op: 'extra', acao: 'editar', id, texto: txt(valor) }] };
      return { recusa: 'Esse elemento não tem texto editável por aqui: use "Outro: escrever".' };
    }
    case 'foto': {
      const cod = txt(valor).toUpperCase();
      if (!/^F\d+$/.test(cod)) return { recusa: 'Escolha a foto pelo código (ex.: F27).' };
      if (p[0] === 'galeria' && p[1] === 'foto') return { ops: [{ op: 'foto', codigo: p[2], uso: 'galeria', acao: 'tirar' }, { op: 'foto', codigo: cod, uso: 'galeria', acao: 'usar' }] };
      const uso = id === 'banner' ? 'banner' : ELEMENTOS[id]?.foto;
      if (uso === 'produto') {
        const prod = produtos.find((x) => x.id === ctx.produtoId) || (produtos.length === 1 ? produtos[0] : null);
        if (!prod) return { recusa: 'Toque na foto do produto que quer trocar.' };
        return { ops: [{ op: 'foto', codigo: cod, uso: 'produto', produto: prod.nome, acao: 'usar', principal: true, ordem: 1 }] };
      }
      if (uso === 'banner' || uso === 'sobre') return { ops: [...fotosNo(materiais, uso).filter((c) => c !== cod).map((c) => ({ op: 'foto', codigo: c, uso, acao: 'tirar' })), { op: 'foto', codigo: cod, uso, acao: 'usar' }] };
      return { recusa: 'Esse elemento não tem foto.' };
    }
    case 'adicionar': {
      const v = valor || {};
      if (pac) return doTema(`Acrescentar abaixo: ${TIPOS_EXTRA[v.tipo] || 'item'}${v.texto ? ` ("${txt(v.texto).slice(0, 80)}")` : ''}`);
      if (ehLegal(id) && !ehSecao(id)) return { recusa: 'No rodapé legal não entra acréscimo: use "Mudar o texto".' };
      if (v.tipo === 'pergunta') {
        if (!txt(v.p) || !txt(v.r)) return { recusa: 'Escreva a pergunta e a resposta.' };
        const i = (estado.conteudo?.faq || []).findIndex((f) => idFaq(f.p) === id);
        return { ops: [{ op: 'faq', acao: 'adicionar', p: txt(v.p), r: txt(v.r), ...(i >= 0 ? { depoisDe: i } : {}) }] };
      }
      if (!TIPOS_EXTRA[v.tipo]) return { recusa: 'Escolha o que acrescentar.' };
      if (v.tipo === 'foto' ? !/^F\d+$/i.test(txt(v.codigo)) : !txt(v.texto)) return { recusa: v.tipo === 'foto' ? 'Escolha a foto pelo código.' : 'Escreva o texto.' };
      return { ops: [{ op: 'extra', acao: 'adicionar', apos: id, tipo: v.tipo, ...(v.tipo === 'foto' ? { codigo: txt(v.codigo).toUpperCase() } : { texto: txt(v.texto) }) }] };
    }
    default: return { recusa: 'Ação desconhecida.' };
  }
}

/** Elementos de uma seção (para a IA saber os ids no ajuste por seção e no mapeamento do print). */
export function elementosDaSecao(secao, estado = {}, { modo = 'custom', materiais = [] } = {}) {
  if (modo === 'pacote') {
    const base = { banner: ['banner.titulo', 'banner.subtitulo', 'banner.cta'], sobre: ['sobre.texto'], faq: (estado.pacote?.textosPagina?.faq || []).map((f) => idFaq(f.p)) }[secao] || [];
    return [secao, ...base];
  }
  const fixos = Object.keys(ELEMENTOS).filter((id) => partes(id)[0] === secao);
  const din = secao === 'faq' ? (estado.conteudo?.faq || []).map((f) => idFaq(f.p)) : secao === 'galeria' ? materiais.filter((m) => m.usos?.galeria && m.codigo).map((m) => `galeria.foto.${m.codigo}`) : [];
  const extras = (estado.layout?.extras || []).filter((x) => secaoDoElemento(x.apos, estado.layout) === secao).map((x) => x.id);
  return [secao, ...fixos, ...din, ...extras];
}
export const listaElementos = (secoes, estado, ctx = {}) => secoes.flatMap((s) => elementosDaSecao(s, estado, ctx)).map((id) => `${id}: ${nomeElemento(id, { layout: estado.layout, estado })}`).join('\n');
