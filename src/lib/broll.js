// B-roll: regras puras (sem DOM) da busca em bancos gratuitos. A busca em si passa pelo servidor (/api/broll).

const PARADAS = new Set(('a o as os um uma uns umas de da do das dos em na no nas nos por pra para com sem que se e é ou mas mais menos ' +
  'nosso nossa nossos nossas seu sua seus suas meu minha teu tua eu voce você vocês ele ela eles elas isso esse essa este esta aqui ali já ja não nao sim como quando ' +
  'porque qual quais quem ao aos à às pelo pela pelos pelas tem ter ser está esta estão vai vem foi são sao muito muita todo toda todos ' +
  'agora hoje só so até ate também tambem nunca sempre compre clique link bio frete grátis gratis desconto oferta aproveite garanta').split(/\s+/));

/** Palavras-chave de um texto: sem pontuação/números/palavras vazias, só as de 4+ letras, na ordem em que aparecem. */
export function palavrasChave(texto, max = 3) {
  const vistas = new Set();
  return String(texto || '').toLowerCase().replace(/[^\p{L}\s-]/gu, ' ').split(/\s+/)
    .filter((p) => p.length >= 4 && !PARADAS.has(p) && !vistas.has(p) && vistas.add(p))
    .slice(0, max);
}

/**
 * Sugestões de busca (no máximo 4, sem repetir): o texto da cena escolhida vem primeiro (é o mais específico),
 * depois o produto, o nicho do cliente e as palavras do hook.
 */
export function sugestoesBroll({ textoCena = '', produto = '', nicho = '', hook = '' } = {}) {
  const lista = [
    palavrasChave(textoCena, 3).join(' '),
    String(produto || '').trim().toLowerCase(),
    String(nicho || '').trim().toLowerCase(),
    palavrasChave(hook, 2).join(' '),
  ].map((s) => s.slice(0, 60).trim()).filter(Boolean);
  return [...new Set(lista)].slice(0, 4);
}

/** Orientação pedida ao banco a partir do formato do vídeo do Estúdio ("1080x1920" -> retrato). */
export function orientacaoDoFormato(formato = '') {
  const [w, h] = String(formato).split('x').map(Number);
  if (!w || !h) return '';
  return h > w ? 'portrait' : h < w ? 'landscape' : 'square';
}

/** Nome do arquivo baixado (vira o nome do material no Estúdio). */
export function nomeArquivoBroll(item, tipoMime = '') {
  const ext = item.tipo === 'video' ? 'mp4' : /png/.test(tipoMime) ? 'png' : /webp/.test(tipoMime) ? 'webp' : 'jpg';
  return `broll-${String(item.fonte || 'banco').toLowerCase()}-${String(item.id || '').replace(/[^\w-]/g, '').slice(-24) || 'item'}.${ext}`;
}
