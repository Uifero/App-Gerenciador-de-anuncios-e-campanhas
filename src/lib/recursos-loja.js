// Recursos de loja pedidos no plano ("Analisar meu pedido", lib/plano-site.js) que a prévia e o site mostram: aviso de
// frete grátis, ícones de pagamento, botão grande, colunas, página do produto com todas as fotos e seções (fórmula,
// benefícios, modo de uso, lidas da aba Produtos), "Compre junto". Sem dependências (sitegen e pacote-loja importam daqui).
export const SECOES_PRODUTO = { formula: 'Fórmula / ingredientes', beneficios: 'Benefícios', modo_uso: 'Modo de uso' };
const CAMPO_SECAO = { formula: 'formula', beneficios: 'beneficios', modo_uso: 'modoUso' };
const FORMAS = ['cartao', 'pix', 'boleto'];
const txt = (v) => String(v ?? '').trim();
/** "R$ 199,00", "199", "1.299,90" -> número (null se não der). */
export const numero = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const n = Number(String(v ?? '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** site.config.recursos (personalizado) ou site.pacote.recursos (pacote), sempre num formato válido. */
export function normalizarRecursos(r = {}) {
  const v = numero(r?.freteGratis?.valor);
  const pags = (Array.isArray(r?.pagamentos) ? r.pagamentos : []).filter((k) => FORMAS.includes(k));
  const cj = r?.compreJunto;
  return {
    freteGratis: v ? { valor: v } : null,
    pagamentos: [...new Set(pags)],
    botaoGrande: Boolean(r?.botaoGrande),
    colunasProdutos: [2, 3, 4].includes(Number(r?.colunasProdutos)) ? Number(r.colunasProdutos) : null,
    paginaProduto: Boolean(r?.paginaProduto),
    secoesProduto: [...new Set((r?.secoesProduto || []).filter((k) => SECOES_PRODUTO[k]))],
    compreJunto: cj && ['produto', 'carrinho'].includes(cj.onde) ? { onde: cj.onde, pares: (cj.pares || []).filter((p) => p?.de && p?.sugerido && p.de !== p.sugerido) } : null,
  };
}
export const recursosDoSite = (site, modo) => normalizarRecursos(modo === 'custom' ? site?.config?.recursos : site?.pacote?.recursos);
/** Texto do campo do produto para uma seção da página (fórmula, benefícios, modo de uso). */
export const textoSecaoProduto = (produto, secao) => txt(produto?.[CAMPO_SECAO[secao]]);
/** Produto sugerido no "Compre junto" para `produtoId`: o par escolhido, ou o próximo produto da lista. */
export function sugeridoPara(produtoId, produtos = [], recursos = {}) {
  const par = (recursos.compreJunto?.pares || []).find((p) => p.de === produtoId);
  const achado = par && produtos.find((p) => p.id === par.sugerido);
  if (achado) return achado;
  const outros = produtos.filter((p) => p.id !== produtoId);
  const i = Math.max(0, produtos.findIndex((p) => p.id === produtoId));
  return outros.length ? outros[i % outros.length] : null;
}
/** "R$ 199,00" */
export const reais = (n) => `R$ ${Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
