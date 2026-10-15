// "Cara de IA" (Frente 1): confere o site gerado contra a lista do que denuncia texto e visual feitos por IA, sem IA e
// sem custo. A lista de clichês é a mesma da referência que a IA recebe (server/referencias/site-profissional.js).
// Puro: lê o estado do site (conteudo do personalizado ou pacote) e o sistema visual (lib/design-site.js), devolve os
// achados e corrige localmente o que é mecânico (travessão, exclamação, emoji em título, parede de texto).
// Clichê de texto é reescrito pela IA só quando o operador pede ("Corrigir com IA", pela proposta de "Ajustar este site").
import { ehRoxoAzul } from './design-site.js';

const txt = (v) => String(v ?? '').trim();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Clichês de texto: { id, re (sobre o texto sem acento, minúsculo), rotulo, troca (sugestão do que escrever) }. */
export const CLICHES = [
  { id: 'descubra', re: /\bdescubra\b/, rotulo: '"Descubra"', troca: 'diga o que a pessoa vai encontrar ("Veja os tamanhos", "Conheça a fórmula")' },
  { id: 'transforme', re: /\btransform(e|a) (a )?sua (vida|rotina|pele|casa)/, rotulo: '"Transforme sua vida/rotina"', troca: 'o que muda de concreto (ex.: "cabe na bolsa", "seca em 2 minutos")' },
  { id: 'revolucionario', re: /\brevolucionari[oa]s?\b/, rotulo: '"Revolucionário"', troca: 'o fato que torna o produto diferente' },
  { id: 'eleve', re: /\beleve\b/, rotulo: '"Eleve"', troca: 'um verbo simples e o resultado concreto' },
  { id: 'desbloqueie', re: /\bdesbloqueie\b/, rotulo: '"Desbloqueie"', troca: 'um verbo simples ("use", "tenha", "comece")' },
  { id: 'experiencia', re: /\bexperiencia(s)? unica(s)?\b/, rotulo: '"Experiência única"', troca: 'o detalhe que a pessoa sente (textura, cheiro, caimento)' },
  { id: 'incrivel', re: /\bincrive(l|is)\b/, rotulo: '"Incrível"', troca: 'um fato no lugar do adjetivo' },
  { id: 'inovador', re: /\binovador(a|es|as)?\b/, rotulo: '"Inovador"', troca: 'o que é novo, dito de forma concreta' },
  { id: 'mais-do-que', re: /\bmais do que (um|uma|apenas)\b|\bnao e (so|apenas) (um|uma)\b/, rotulo: '"Mais do que um produto" / "Não é só um"', troca: 'diga o que o produto é e faz' },
  { id: 'feito-para-voce', re: /\b(feit|pensad|criad)[oa]s? (especialmente )?para voce\b/, rotulo: '"Feito para você"', troca: 'para quem é, de verdade (ex.: "para quem treina cedo")' },
];
const EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_G = /\s*\p{Extended_Pictographic}️?\s*/gu;
const TRAVESSAO = /\s+[—–]\s+|—/g;
export const LIMITE_PARAGRAFO = 450; // caracteres de um parágrafo sem quebra = parede de texto

/** Chaves que nunca são texto para o público (endereços, ids, cores, escolhas visuais). */
const NAO_TEXTO = new Set(['url', 'id', 'materialId', 'produtoId', 'codigo', 'corPrimaria', 'corFundo', 'paletaSugerida', 'visual', 'recursos', 'tipografia', 'uso', 'origem', 'midiaUrl', 'midiaTipo', 'exibir', 'nome', 'seoTitulo', 'seoDescricao', 'provasOcultas', 'destaques', 'depoimentos','estilo', 'observacoes', 'secoesHome']);
const TITULOS = new Set(['heroTitulo', 'titulo', 'newsletterTitulo', 'p']);

/**
 * Textos do site que vão para o público: [{ caminho: ['conteudo','faq',0,'p'], onde, texto, titulo }].
 * Modo 'custom' lê site.conteudo; 'pacote', site.pacote (+ as políticas, que ficam no conteudo nos dois modos).
 */
export function textosDoSite(site = {}, modo = 'custom') {
  const out = [];
  const andar = (v, caminho, onde) => {
    if (typeof v === 'string') { if (txt(v)) out.push({ caminho, onde, texto: v, titulo: TITULOS.has(caminho[caminho.length - 1]) }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => andar(x, [...caminho, i], onde)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!NAO_TEXTO.has(k)) andar(x, [...caminho, k], ONDE[k] || onde);
  };
  if (modo === 'custom') andar(site.conteudo || {}, ['conteudo'], 'site');
  else { andar(site.pacote || {}, ['pacote'], 'loja'); andar({ politicas: site.conteudo?.politicas || {} }, ['conteudo'], 'políticas'); }
  return out;
}
const ONDE = { heroTitulo: 'título do banner', heroSubtitulo: 'subtítulo do banner', heroCta: 'botão do banner', storytelling: 'história da marca', sobre: 'Sobre a marca', faq: 'perguntas frequentes', banners: 'banner', bannersPromo: 'banners de promoção', politicas: 'políticas', descricoesProdutos: 'descrição de produto', descricao: 'descrição de produto', depoimentos: 'depoimentos', newsletterTitulo: 'newsletter', newsletterTexto: 'newsletter', textosPagina: 'páginas' };

const trecho = (t, i, n = 60) => { const a = Math.max(0, i - 20); return `${a ? '…' : ''}${t.slice(a, a + n).replace(/\s+/g, ' ').trim()}${a + n < t.length ? '…' : ''}`; };

/**
 * Achados de "cara de IA". ctx: { site, modo, design (designDoSite), produtos }. Devolve
 * [{ id, tipo: 'cliche'|'travessao'|'exclamacao'|'emoji'|'parede'|'cor'|'banner', titulo, onde, trecho, sugestao, corrige: 'local'|'ia'|'manual' }].
 */
export function verificarCaraDeIa({ site = {}, modo = 'custom', design = null, produtos = [] } = {}) {
  const achados = [];
  const textos = textosDoSite(site, modo);
  for (const t of textos) {
    const n = norm(t.texto);
    for (const c of CLICHES) {
      const m = c.re.exec(n);
      if (m) achados.push({ id: `cliche-${c.id}-${t.caminho.join('.')}`, tipo: 'cliche', titulo: `Clichê ${c.rotulo}`, onde: t.onde, trecho: trecho(t.texto, m.index), sugestao: `Troque por ${c.troca}.`, corrige: 'ia', caminho: t.caminho });
    }
    if (/—|\s–\s/.test(t.texto)) achados.push({ id: `travessao-${t.caminho.join('.')}`, tipo: 'travessao', titulo: 'Travessão longo (—)', onde: t.onde, trecho: trecho(t.texto, t.texto.search(/—|\s–\s/)), sugestao: 'Troque por vírgula ou ponto.', corrige: 'local', caminho: t.caminho });
    if (t.titulo && EMOJI.test(t.texto)) achados.push({ id: `emoji-${t.caminho.join('.')}`, tipo: 'emoji', titulo: 'Emoji em título', onde: t.onde, trecho: trecho(t.texto, 0), sugestao: 'Tire o emoji do título.', corrige: 'local', caminho: t.caminho });
    const longo = t.texto.split(/\n\s*\n|\n/).find((p) => p.length > LIMITE_PARAGRAFO);
    if (longo) achados.push({ id: `parede-${t.caminho.join('.')}`, tipo: 'parede', titulo: 'Parede de texto', onde: t.onde, trecho: trecho(longo, 0), sugestao: `Parágrafo com ${longo.length} caracteres: quebre em parágrafos de 2 ou 3 frases.`, corrige: 'local', caminho: t.caminho });
  }
  const exclam = textos.reduce((s, t) => s + (t.texto.match(/!/g) || []).length, 0);
  if (exclam > 1) achados.push({ id: 'exclamacao', tipo: 'exclamacao', titulo: `${exclam} pontos de exclamação`, onde: 'site inteiro', trecho: trecho(textos.find((t) => t.texto.includes('!')).texto, textos.find((t) => t.texto.includes('!')).texto.indexOf('!')), sugestao: 'No máximo um na página: troque os outros por ponto.', corrige: 'local' });
  // Visual: cor de destaque roxo/azul que não veio da marca (palpite da IA). Cor escolhida pelo operador nunca é apontada.
  const cor = design?.cores?.acento;
  if (cor && ehRoxoAzul(cor) && ['ia', 'neutra'].includes(design?.fonteCor)) {
    achados.push({ id: 'cor', tipo: 'cor', titulo: 'Roxo/azul de padrão, não da marca', onde: 'cores', trecho: cor, sugestao: 'Escreva a cor da marca na estética do perfil (ex.: #0f5132) ou envie o logo: o app passa a usar a cor dele.', corrige: 'manual' });
  }
  // Visual: banner sem foto real (sem slide e nenhum produto com foto).
  const temFotoProduto = produtos.some((p) => (p.fotos || []).some((f) => f?.url || typeof f === 'string'));
  const temSlide = modo === 'custom' ? Boolean(site?.layout?.imagens?.hero?.url) : Boolean(site?.pacote?.visual?.banner?.url);
  if (!temFotoProduto && !temSlide) achados.push({ id: 'banner', tipo: 'banner', titulo: 'Banner sem foto real', onde: 'banner', trecho: '', sugestao: 'Envie foto do produto (passo 2) ou escolha uma foto em "Usar em" > Banner.', corrige: 'manual' });
  return achados;
}

// ---------- correção local (sem IA) ----------
const tirarTravessao = (t) => t.replace(/\s+[—–]\s+/g, ', ').replace(/—/g, ', ').replace(/,\s*,/g, ',');
const tirarEmoji = (t) => t.replace(EMOJI_G, ' ').replace(/\s{2,}/g, ' ').trim();
const tirarExclamacao = (t) => t.replace(/!+/g, '.').replace(/\.\s*\./g, '.').replace(/\?\./g, '?');
/** Quebra parágrafos longos a cada 2 frases (o texto continua igual, só ganha respiro). */
export function quebrarParede(t) {
  return String(t).split(/\n/).map((p) => {
    if (p.length <= LIMITE_PARAGRAFO) return p;
    const frases = p.match(/[^.!?]+[.!?]+["”)]?\s*|[^.!?]+$/g) || [p];
    const blocos = []; for (let i = 0; i < frases.length; i += 2) blocos.push(frases.slice(i, i + 2).join('').trim());
    return blocos.join('\n\n');
  }).join('\n');
}

const pegar = (o, c) => c.reduce((x, k) => (x == null ? x : x[k]), o);
const pôr = (o, c, v) => { let x = o; for (const k of c.slice(0, -1)) x = x[k]; x[c[c.length - 1]] = v; };

/**
 * Aplica as correções locais nos achados escolhidos. `estado` = { conteudo, pacote, config }; devolve
 * { estado (cópia), mudancas: [texto], restantes: achados que precisam de IA ou do operador }.
 */
export function corrigirLocal(estado = {}, achados = [], { modo = 'custom' } = {}) {
  const e = JSON.parse(JSON.stringify(estado));
  const mudancas = [], restantes = [];
  const textos = textosDoSite({ conteudo: e.conteudo, pacote: e.pacote }, modo);
  const aplicar = (fn, filtro, rotulo) => {
    let n = 0;
    for (const t of textos.filter(filtro)) { const atual = pegar(e, t.caminho); const novo = fn(atual); if (novo !== atual) { pôr(e, t.caminho, novo); n++; } }
    if (n) mudancas.push(`${rotulo} (${n} texto${n > 1 ? 's' : ''})`);
  };
  const tipos = new Set(achados.map((a) => a.tipo));
  if (tipos.has('travessao')) aplicar(tirarTravessao, () => true, 'Travessões trocados por vírgula');
  if (tipos.has('emoji')) aplicar(tirarEmoji, (t) => t.titulo, 'Emoji tirado dos títulos');
  if (tipos.has('exclamacao')) aplicar(tirarExclamacao, () => true, 'Exclamações trocadas por ponto');
  if (tipos.has('parede')) aplicar(quebrarParede, () => true, 'Parágrafos longos quebrados');
  for (const a of achados) if (a.corrige !== 'local') restantes.push(a);
  return { estado: e, mudancas, restantes };
}

/**
 * "Fazer essa mudança" de UM achado mecânico (travessão, emoji, exclamação, parede): só no texto dele (a exclamação vale
 * para o site todo, que é onde ela foi contada). Devolve { estado (cópia), mudancas }.
 */
export function corrigirAchado(estado = {}, a = {}, { modo = 'custom' } = {}) {
  const e = JSON.parse(JSON.stringify(estado));
  const fn = { travessao: tirarTravessao, emoji: tirarEmoji, exclamacao: tirarExclamacao, parede: quebrarParede }[a.tipo];
  if (!fn) return { estado: e, mudancas: [] };
  const caminhos = a.caminho ? [a.caminho] : textosDoSite({ conteudo: e.conteudo, pacote: e.pacote }, modo).map((t) => t.caminho);
  let n = 0;
  for (const c of caminhos) { const atual = pegar(e, c); if (typeof atual !== 'string') continue; const novo = fn(atual); if (novo !== atual) { pôr(e, c, novo); n++; } }
  return { estado: e, mudancas: n ? [`${a.titulo} corrigido em ${a.onde}${n > 1 ? ` (${n} textos)` : ''}`] : [] };
}

/** Pedido para a IA reescrever SÓ os clichês achados (vai para "Ajustar este site", que mostra Atual × Com a mudança). */
export const pedidoClichesIa = (achados = []) => `Reescreva SÓ estes trechos com clichê de texto de IA, mantendo o sentido, o tom da marca e o tamanho, com fato concreto do perfil no lugar do adjetivo (sem inventar dado): ${achados.filter((a) => a.tipo === 'cliche').map((a) => `${a.titulo} em ${a.onde} ("${a.trecho}")`).join('; ')}. Não mexa em mais nada.`;
