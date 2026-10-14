// Políticas de anúncio por nicho além da saúde (Frente 2, item 11): conferência LOCAL que só AVISA (a regra de saúde em
// lib/saude.js continua sendo a que bloqueia). Mesmos pontos da referência que a IA recebe
// (server/referencias/politicas-nicho.js): atributos pessoais de quem vê, preço riscado/desconto, sorteio e público infantil.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const REGRAS = [
  { id: 'atributo', re: /\bvoce (esta|e|tem|anda|sofre|vive|se sente)\b[^.?!]{0,30}\b(peso|gord|magr|acne|espinha|calvo|calvic|careca|divida|endividad|solteir|divorciad|deprimid|depressao|ansios|ansiedade|diabet|velh|idos|pobre|desempregad|gravida|infertil)/,
    texto: 'Fala de um atributo pessoal de quem vê (Meta proíbe insinuar peso, saúde, idade, renda, estado civil...).', troca: 'Fale da situação ou do produto, não da pessoa ("para quem treina cedo" em vez de "você está acima do peso?").' },
  { id: 'preco-riscado', re: /\bde r\$\s?\d[\d.,]*\s*(por|=>|->)\s*r\$|\bde\s+\d[\d.,]*\s+por\s+\d|\d+\s?% (de )?(off|desconto)/,
    texto: 'Preço riscado ou desconto em %.', troca: 'Só use se o preço antigo foi praticado de verdade e o desconto estiver cadastrado no perfil (oferta ativa).' },
  { id: 'sorteio', re: /\bsorteio|\bsortear|\bmarque (\d|tres|dois|um|seus) amig|\bconcorra\b/,
    texto: 'Sorteio ou "marque amigos".', troca: 'Só com sorteio real e ativo do cliente, com regras claras; sem exigir marcar amigos e sem citar o Meta como organizador.' },
  { id: 'infantil', re: /\b(pede pra|peca (para|pra)) (sua )?(mae|mamae|pai|papai)|\bcriancas?,? (compre|peca|pecam)/,
    texto: 'Pede à criança que compre ou peça aos pais.', troca: 'Fale com o adulto que compra.' },
];

/** Avisos de política no texto: [{ id, texto, troca }]. Só avisa; não bloqueia. */
export function avisosPolitica(texto = '') {
  const t = norm(texto);
  return REGRAS.filter((r) => r.re.test(t)).map(({ id, texto: tx, troca }) => ({ id, texto: tx, troca }));
}
