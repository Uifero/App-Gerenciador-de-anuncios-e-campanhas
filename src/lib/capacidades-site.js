// O que dá para mudar em cada seção, por plataforma, ANTES de a IA propor (Frente "a IA conhece os limites"), e o resultado
// honesto depois de aplicar ("Mudou", "Mudou em parte", "Nada mudou", "Anotado para o tema"). Puro: sem banco e sem tela.
//  - A lista vai no "Entendi assim" (ajuste_entender) e no ajuste por seção (ajuste_secao): a IA só propõe o que existe e
//    diz ANTES o que não dá, com a alternativa.
//  - Observação do briefing do tema não é lugar para guardar texto que a IA não conseguiu pôr no site: só entra quando o
//    operador pede o tema/estilo; senão o app recusa ("isso não muda o site").
import { TITULOS_LOJA } from './visual-site.js';

const txt = (v) => String(v ?? '').trim();

const LOJA = {
  banner: 'banner: título, subtítulo e botão (texto puro; o tema não aceita negrito em parte do texto); foto pelo código ou pelo produto ("foto do X no banner"); tirar o subtítulo ou o botão. Altura e carrossel automático: só no tema.',
  destaques: 'destaques (seus textos, ex.: "5 motivos"): título, cada texto (editar, acrescentar, tirar, mudar de ordem), negrito com **assim**, criar seção nova com título + textos ({"op":"destaque","acao":"criar",...}), mudar a seção de lugar e tirar.',
  provas: 'provas (Clientes reais): só os prints/fotos reais; muda de lugar, sai, título editável, dá para tirar o título e a dica. O conteúdo dos prints nunca muda.',
  produtos: 'produtos: título da seção; a lista vem da aba Produtos (nome, preço, variações e kits mudam lá). Colunas e tamanho do card: só no tema.',
  confianca: 'confianca (Compra segura): faixa fixa e legal (pagamento pela plataforma + resumo das políticas de envio e trocas). Não sai e não tem texto próprio: muda nas políticas ("Conteúdo da loja"). Lista sua de motivos vai em destaques.',
  depoimentos: 'depoimentos (Quem já comprou): só texto DIGITADO pelo operador e os prints como imagem; título editável; tirar a seção, o título ou só os textos (deixa as imagens). Nunca escreva nem reescreva depoimento.',
  sobre: 'sobre: título e texto (negrito com **assim**); foto pelo código ou pelo produto.',
  galeria: 'galeria: título; fotos pelo código (ordem pelo "Usar em"). Tamanho das fotos: só no tema.',
  faq: 'faq: título; perguntas (editar, acrescentar, tirar, mudar de ordem). Resposta nova só com fato que o operador escreveu.',
  produto: 'produto (página do produto): descrição, título e descrição para SEO; fotos pelo código (ordem e principal). Fórmula, benefícios, modo de uso, preço e kits: só da aba Produtos (a IA nunca inventa); faltando, o site sai com "Preencher" para o cliente.',
  geral: 'geral: fotos inteiras ou preenchendo; paleta sugerida para o tema. Fonte, espaçamento, tamanho e layout fino: só no tema (anotar em "Ajustar no tema", passo 6).',
};
const CUSTOM = {
  hero: 'hero (banner): título, subtítulo, botão, altura (curto/normal/alto), imagem; elementos (tamanho, espaço, ordem, tirar).',
  destaques: 'destaques (seus textos, logo depois do banner): título e cada texto (editar, acrescentar, tirar, ordem), negrito com **assim**, criar seção nova.',
  provas: 'provas (Clientes reais): mover, ocultar, mostrar; o conteúdo nunca muda.',
  categorias: 'categorias: título; mover/ocultar.', vendidos: 'vendidos: título, colunas (2/3/4).', sale: 'sale: título, colunas.', catalogo: 'catalogo: título, colunas.',
  marca: 'marca (Nossa história): título, texto, imagem.', galeria: 'galeria: título; fotos pelo código.',
  depoimentos: 'depoimentos: título; ocultar/mostrar cada depoimento; nunca reescrever (só texto digitado pelo operador aparece).',
  faq: 'faq: título e perguntas.', newsletter: 'newsletter: título e texto.',
  produto: 'produto: fotos pelo código; fórmula, benefícios, preço e kits só da aba Produtos (faltando, sai "Preencher").',
  geral: 'geral: cores (contraste ≥ 4,5), fotos inteiras/preenchendo.', rodape: 'rodape: texto dos dados da loja e das políticas (nunca saem).',
};

/** Lista de capacidades para a IA (só as seções pedidas; vazio = todas). */
export function capacidadesDoSite(modo = 'pacote', { secoes = [], plataforma = null } = {}) {
  const mapa = modo === 'pacote' ? LOJA : CUSTOM;
  const ids = secoes.length && !secoes.includes('todo') ? secoes : Object.keys(mapa);
  const linhas = ids.filter((id) => mapa[id]).map((id) => `- ${mapa[id]}`);
  const plat = plataforma === 'shopify' ? 'Shopify' : plataforma === 'nuvemshop' ? 'Nuvemshop' : 'a plataforma';
  return `O QUE DÁ PARA MUDAR (${modo === 'pacote' ? `pacote para ${plat}` : 'site personalizado'}):
${linhas.join('\n')}
Fora disso não existe operação: diga ANTES, em "impossivel", o que não dá e a alternativa mais próxima (ex.: "no tema", "na aba Produtos", "na seção destaques"). Nunca use "tema.observacoes" para guardar um texto que você não conseguiu pôr no site.`;
}

// ---------- notas para o tema x mudança no site ----------
const RE_PEDE_TEMA = /\b(tema|estilo|tipografia|fonte|observa|briefing|paleta|cores? (?:do|da) (?:tema|loja))\b/i;
/** Operação que só anota para o tema (o site/prévia não muda). */
export const ehSoNota = (op = {}, modo = 'pacote') => modo === 'pacote' && ((op.op === 'texto' && /^tema\./.test(txt(op.campo))) || op.op === 'paleta');
/**
 * Tira as notas do briefing que a IA usou como "lugar" para o que não conseguiu fazer (o pedido não falava de tema).
 * Devolve { ops, recusadas: [{ op, motivo }] }.
 */
export function semNotaDeSobra(operacoes = [], pedido = '', modo = 'pacote') {
  if (RE_PEDE_TEMA.test(String(pedido || ''))) return { ops: operacoes, recusadas: [] };
  const recusadas = [], ops = [];
  for (const op of operacoes) {
    if (modo === 'pacote' && op?.op === 'texto' && /^tema\./.test(txt(op.campo))) recusadas.push({ op, motivo: 'Recusado: a IA tentou anotar no briefing do tema (observações) o que não conseguiu mudar no site; isso não muda a loja.' });
    else ops.push(op);
  }
  return { ops, recusadas };
}

/**
 * Foto já resolvida pelo app (pedido pelo nome do produto, escolhida pelo operador): a operação de foto/imagem que a IA
 * mandar para o MESMO lugar é repetição e sai antes de contar (senão o cartão diria "em parte" com tudo feito).
 */
export function semFotoRepetida(operacoes = [], uso = null) {
  if (!uso) return operacoes;
  const LUGAR = { hero: 'banner', banner: 'banner', marca: 'sobre', sobre: 'sobre', galeria: 'galeria' };
  return operacoes.filter((op) => !((op?.op === 'imagem' && LUGAR[op.bloco || 'banner'] === uso) || (op?.op === 'foto' && op.uso === uso)));
}

/**
 * Resultado honesto de um ajuste: { status: 'mudou'|'parcial'|'nada'|'anotado', titulo, feitas, total, faltou: [motivo] }.
 * `aplicadas` = operações que mudaram o rascunho; `recusadas` = motivos das que não entraram; `naoFeito` = o que a IA
 * disse que não fez; `impossivel` = o que o "Entendi assim" já disse que não dá.
 */
export function resultadoDoAjuste({ aplicadas = [], recusadas = [], naoFeito = [], impossivel = [], modo = 'pacote' } = {}) {
  const site = aplicadas.filter((op) => !ehSoNota(op, modo));
  const notas = aplicadas.length - site.length;
  const faltou = [...recusadas, ...naoFeito, ...impossivel].map(txt).filter(Boolean);
  const total = site.length + notas + faltou.length;
  if (!site.length && notas) return { status: 'anotado', titulo: 'Anotado para o tema (o site não muda)', feitas: 0, total, faltou };
  if (!site.length) return { status: 'nada', titulo: 'Nada mudou', feitas: 0, total, faltou };
  if (faltou.length) return { status: 'parcial', titulo: `Mudou em parte (${site.length} de ${site.length + faltou.length})`, feitas: site.length, total: site.length + faltou.length, faltou };
  return { status: 'mudou', titulo: 'Mudou', feitas: site.length, total: site.length, faltou };
}

/** Títulos padrão das seções da loja (para a IA saber o que existe). */
export const titulosDaLoja = () => Object.entries(TITULOS_LOJA).map(([k, t]) => `${k}: "${t}"`).join(', ');
