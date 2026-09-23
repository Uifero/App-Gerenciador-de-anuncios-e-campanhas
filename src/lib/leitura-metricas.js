// Leitura das métricas para quem não é da área: um número de ROAS/CTR/CPA sozinho não diz nada, então cada tela
// que mostra um desses números usa estas funções para dizer "isso é bom, médio ou ruim" e o que fazer.
// São REFERÊNCIAS GERAIS de mercado (Meta Ads, e-commerce), não regra: a meta do cliente, quando existe, vale mais
// (o CPA só é julgado contra a meta, porque "bom" depende da margem de cada produto). Sem DOM: testável.

export const NIVEL_TAG = { bom: 'tag-ok', medio: 'tag-warn', ruim: 'tag-bad' };
export const ROTULO_NIVEL = { bom: 'bom', medio: 'atenção', ruim: 'ruim' };

/** ROAS = R$ que voltaram em vendas para cada R$ 1 investido em anúncio. */
export function lerRoas(v, meta = null) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return null;
  if (Number(meta) > 0) {
    if (n >= meta) return { nivel: 'bom', texto: `na meta do cliente (${fmt(meta)}x)` };
    return n >= meta * 0.8 ? { nivel: 'medio', texto: `um pouco abaixo da meta (${fmt(meta)}x)` } : { nivel: 'ruim', texto: `abaixo da meta (${fmt(meta)}x)` };
  }
  if (n < 1) return { nivel: 'ruim', texto: 'prejuízo: voltou menos do que foi gasto' };
  if (n < 2) return { nivel: 'medio', texto: 'paga o anúncio, mas a margem costuma ficar apertada' };
  if (n < 3) return { nivel: 'medio', texto: 'razoável; acima de 3x costuma ser considerado bom' };
  return { nivel: 'bom', texto: 'bom retorno (acima de 3x)' };
}

/** CTR (link) = % de quem viu o anúncio e clicou. No Meta, a média do mercado fica perto de 1%. */
export function lerCtr(v) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return null;
  if (n < 0.8) return { nivel: 'ruim', texto: 'poucos clicam: o começo do criativo não está prendendo' };
  if (n < 1.5) return { nivel: 'medio', texto: 'na média do mercado (perto de 1%)' };
  return { nivel: 'bom', texto: 'acima da média: o criativo chama atenção' };
}

/** CPA = custo por venda. Só dá para julgar contra a meta (depende do preço e da margem de cada produto). */
export function lerCpa(v, meta = null) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return null;
  if (!(Number(meta) > 0)) return { nivel: null, texto: 'compare com o lucro por venda: se o CPA for maior, cada venda dá prejuízo' };
  if (n <= meta) return { nivel: 'bom', texto: `dentro da meta (R$ ${fmt(meta)})` };
  return n <= meta * 1.2 ? { nivel: 'medio', texto: `até 20% acima da meta (R$ ${fmt(meta)})` } : { nivel: 'ruim', texto: `acima da meta (R$ ${fmt(meta)})` };
}

const fmt = (n) => Number(n).toFixed(2).replace('.', ',').replace(/,00$/, '');

/** Explicação curta de cada métrica, mostrada junto de formulários e tabelas. */
export const EXPLICA = {
  gasto: 'Quanto foi investido no anúncio no período.',
  ctr: 'CTR (link): % de quem viu e clicou. Perto de 1% é a média; acima de 1,5% é bom; abaixo de 0,8% o criativo não está prendendo.',
  cpa: 'CPA: quanto custou cada venda. Bom é o que fica abaixo do lucro por venda (ou da meta do cliente).',
  roas: 'ROAS: R$ em vendas para cada R$ 1 gasto. Abaixo de 1x = prejuízo; acima de 3x costuma ser considerado bom.',
};
