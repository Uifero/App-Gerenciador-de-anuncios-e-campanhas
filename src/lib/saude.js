// Produto de saúde / emagrecimento / forma do corpo: a política de anúncios do Meta proíbe antes e depois e resultado
// de peso/medida nesses anúncios, MESMO com prova real. O perfil de marca tem a chave "Produto de saúde/emagrecimento"
// (marca.produtoSaude: true/false); sem a pessoa ter escolhido, o app detecta pelo nicho, pelo negócio e pelos produtos.
// Vale só para CRIATIVOS: o site pode mostrar os depoimentos reais como estão.

export const AVISO_META_SAUDE = 'Política do Meta: antes e depois e resultados de peso são proibidos em anúncios deste tipo de produto';

const RE_SAUDE = /emagrec|perd(?:er|a) (?:de )?peso|\bpeso\b|gordura|queima|termog[eê]nic|dieta|detox|celulite|barriga|sa[uú]de|suplement|col[aá]geno|ch[aá] verde|obesi|apetite|metabolismo|massa magra/i;

/** O texto do cadastro sugere saúde/emagrecimento? (só a detecção automática, sem a escolha da pessoa) */
export function detectarProdutoSaude(cliente, produtos = []) {
  const m = cliente?.marca || {};
  const texto = [cliente?.nicho, m.negocio, m.usp, ...produtos.map((p) => `${p?.nome || ''} ${p?.categoria || ''}`)].filter(Boolean).join(' ');
  return RE_SAUDE.test(texto);
}

/** Vale a regra? A escolha explícita do perfil manda; sem escolha, a detecção automática. */
export function ehProdutoSaude(cliente, produtos = []) {
  const v = cliente?.marca?.produtoSaude;
  return typeof v === 'boolean' ? v : detectarProdutoSaude(cliente, produtos);
}

/** Regra extra para a IA (só nos clientes de saúde/emagrecimento). */
export const REGRA_SAUDE = `PRODUTO DE SAÚDE/EMAGRECIMENTO (${AVISO_META_SAUDE}): em anúncios, NUNCA use comparação de antes e depois, números de kg ou cm perdidos, nem promessa de resultado no corpo, mesmo que exista prova real no perfil. Também NUNCA use texto que provoque autoimagem negativa (o Meta proíbe): a dor sobre corpo, peso ou aparência ("a barriga continua aí", "não consigo emagrecer", "cansada do seu corpo") não vira gancho, ângulo nem copy, mesmo sendo as palavras reais do público; use dores permitidas (cansaço, falta de disposição, rotina corrida). Para prova, use ângulos permitidos: experiência de uso, rotina, como é usar, número de clientes atendidos.`;

// kg/cm com número ("perdi 3 kg", "-5cm", "3 quilos") e a ideia de antes e depois.
const RE_ACHADOS = [
  /\b\d+(?:[.,]\d+)?\s*(?:kg|quilos?|kilos?|cm|cent[ií]metros?)\b/gi,
  /\bantes\s*(?:e|x|\/|&|vs\.?)\s*depois\b/gi,
];

/** Trechos de criativo que ferem a política (kg/cm de resultado, antes e depois). Devolve a lista sem repetição. */
export function achadosSaude(texto) {
  const t = String(texto || '');
  return [...new Set(RE_ACHADOS.flatMap((re) => t.match(re) || []).map((x) => x.toLowerCase().replace(/\s+/g, ' ').trim()))];
}
