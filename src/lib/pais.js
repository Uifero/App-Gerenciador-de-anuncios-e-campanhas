// País / mercado do cliente: diz em que país ele anuncia, para as buscas de mercado (benchmarks, referências,
// Biblioteca de Anúncios) e os padrões de nicho olharem o país certo e a moeda certa. Padrão: Brasil — inclusive
// para clientes antigos, que não têm o campo (migração segura: nada é regravado, só lido com esse padrão).

export const PAIS_PADRAO = 'Brasil';

/** [nome, código ISO (filtro de país da Biblioteca de Anúncios), código da moeda, símbolo]. Outros países podem ser digitados. */
export const PAISES = [
  ['Brasil', 'BR', 'BRL', 'R$'], ['Portugal', 'PT', 'EUR', '€'], ['Estados Unidos', 'US', 'USD', 'US$'], ['México', 'MX', 'MXN', 'MX$'],
  ['Argentina', 'AR', 'ARS', 'AR$'], ['Chile', 'CL', 'CLP', 'CLP$'], ['Colômbia', 'CO', 'COP', 'COL$'], ['Peru', 'PE', 'PEN', 'S/'],
  ['Uruguai', 'UY', 'UYU', '$U'], ['Paraguai', 'PY', 'PYG', '₲'], ['Espanha', 'ES', 'EUR', '€'], ['Reino Unido', 'GB', 'GBP', '£'],
  ['Canadá', 'CA', 'CAD', 'CA$'], ['Alemanha', 'DE', 'EUR', '€'], ['França', 'FR', 'EUR', '€'], ['Itália', 'IT', 'EUR', '€'],
  ['Austrália', 'AU', 'AUD', 'A$'],
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const APELIDOS = { eua: 'Estados Unidos', usa: 'Estados Unidos', 'united states': 'Estados Unidos', brazil: 'Brasil', uk: 'Reino Unido', mexico: 'México', spain: 'Espanha' };

/** País do cliente (texto), com Brasil quando o campo está vazio ou ausente. */
export const paisDoCliente = (c) => String(c?.pais || '').trim() || PAIS_PADRAO;

/** Dados do país conhecido ({ nome, iso, moeda, simbolo }) ou null se for um país fora da lista (moeda não presumida). */
export function infoPais(nome) {
  const n = norm(nome), alvo = norm(APELIDOS[n] || nome);
  const p = PAISES.find(([x]) => norm(x) === alvo);
  return p ? { nome: p[0], iso: p[1], moeda: p[2], simbolo: p[3] } : null;
}

/** Linha pronta para os prompts: "Brasil (moeda: BRL, R$)" ou "Japão (moeda local — confirme na fonte)". */
export function descreverMercado(c) {
  const pais = paisDoCliente(c), i = infoPais(pais);
  return i ? `${i.nome} (moeda: ${i.moeda}, ${i.simbolo})` : `${pais} (moeda local do país — confirme na fonte)`;
}

/** Símbolo para rótulos de campo do cliente (ex.: "CPA atual (R$)"); país desconhecido = "moeda local". */
export const simboloDoCliente = (c) => infoPais(paisDoCliente(c))?.simbolo || 'moeda local';

/** Símbolos usados para um código de moeda (ex.: "USD" -> ["US$"]); vazio se a moeda não está na lista. */
export const simbolosDaMoeda = (codigo) => [...new Set(PAISES.filter((p) => p[2] === String(codigo || '').toUpperCase()).map((p) => p[3]))];

/** Mesma chave de país para comparar clientes (Brasil vazio = Brasil preenchido; "EUA" = "Estados Unidos"). */
export const chavePais = (c) => norm(infoPais(paisDoCliente(c))?.nome || paisDoCliente(c));
