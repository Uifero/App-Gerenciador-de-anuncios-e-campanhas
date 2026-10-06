// Tabela de preços da API da Anthropic (US$ por 1 milhão de tokens). ÚNICO lugar para atualizar: o servidor
// (server/index.js, custo de cada chamada pela reserva) e a página "Custos de IA" (Configurações) leem daqui.
// Fonte: https://platform.claude.com/docs/en/about-claude/pricing , conferida em 2026-10-06. O preço de US$ 2/10 do
// Sonnet 5 (anunciado como introdutório até 31/08/2026) virou o preço padrão; a alta para 3/15 não aconteceu.
// Cache: escrita de 5 min = 1,25x a entrada; leitura = 0,1x (0,05x no Opus 5.5). Busca web: US$ 10 por 1.000 buscas.

export const PRECOS_CONFERIDOS_EM = '2026-10-06';
export const FONTE_PRECOS = 'platform.claude.com/docs/en/about-claude/pricing';

/** Do mais específico para o mais geral: o primeiro `re` que casar com o nome do modelo vale. */
export const PRECOS_MODELOS = [
  { re: /haiku/, nome: 'Haiku 4.5', entrada: 1, saida: 5, leitura: 0.1 },
  { re: /opus-5-5/, nome: 'Opus 5.5', entrada: 4, saida: 20, leitura: 0.05 },
  { re: /fable|mythos/, nome: 'Fable 5.1', entrada: 10, saida: 50, leitura: 0.025 },
  { re: /opus/, nome: 'Opus', entrada: 5, saida: 25, leitura: 0.1 },
  { re: /sonnet-4/, nome: 'Sonnet 4.x', entrada: 3, saida: 15, leitura: 0.1 },
  { re: /./, nome: 'Sonnet 5', entrada: 2, saida: 10, leitura: 0.1 }, // padrão: o modelo "complexo" do app
];
export const MULT_ESCRITA_CACHE = 1.25; // escrita de 5 minutos (a única que o app usa)
export const PRECO_BUSCA_WEB = 0.01; // US$ por busca

export const precoDoModelo = (modelo) => PRECOS_MODELOS.find((p) => p.re.test(String(modelo || '').toLowerCase())) || PRECOS_MODELOS[PRECOS_MODELOS.length - 1];

/** Custo em US$ de uma chamada pela API, com o uso { entrada, saida, cacheEscrita, cacheLeitura, buscasWeb }. */
export function calcularCusto(modelo, u = {}) {
  const p = precoDoModelo(modelo);
  const M = 1e6;
  return ((u.entrada || 0) * p.entrada + (u.cacheEscrita || 0) * p.entrada * MULT_ESCRITA_CACHE + (u.cacheLeitura || 0) * p.entrada * p.leitura + (u.saida || 0) * p.saida) / M
    + (u.buscasWeb || 0) * PRECO_BUSCA_WEB;
}
