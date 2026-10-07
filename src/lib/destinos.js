// WhatsApp x Site: as contas dos resultados por destino (custo por conversa, custo por venda, ROAS, taxa de conversão
// e ticket), a comparação no MESMO período e "onde colocar a próxima verba". Puro, sem IA: a IA só interpreta estes
// números. Venda fechada na conversa do WhatsApp o Meta não vê: vem só do registro manual do operador.

const n = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const brl = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
export const DESTINOS_RESULTADO = [['site', 'Site'], ['whatsapp', 'WhatsApp']];
export const nomeDestino = (d) => (d === 'whatsapp' ? 'WhatsApp' : 'Site');
export const destinoDe = (r) => (r?.destino === 'whatsapp' ? 'whatsapp' : 'site');

/**
 * Métricas de UM resultado. WhatsApp: conversas, vendas fechadas na conversa e o faturamento delas (registro manual).
 * Site: compras e faturamento (ou o que dá para tirar do CPA/ROAS registrados).
 */
export function metricasResultado(r = {}) {
  const destino = destinoDe(r), gasto = n(r.gasto);
  const whats = destino === 'whatsapp';
  const conversas = n(r.conversas);
  const vendas = whats ? n(r.vendasConversa) : n(r.compras) ?? (gasto && n(r.cpa) ? gasto / n(r.cpa) : null);
  const faturamento = whats ? n(r.faturamentoConversa) : n(r.faturamento) ?? (gasto != null && n(r.roas) != null ? n(r.roas) * gasto : null);
  const cliques = n(r.cliques);
  return {
    destino, gasto, conversas, vendas, faturamento, cliques,
    custoConversa: r2(gasto && conversas ? gasto / conversas : n(r.custoConversa)),
    custoVenda: r2(gasto && vendas ? gasto / vendas : whats ? null : n(r.cpa)),
    roas: r2(gasto && faturamento != null ? faturamento / gasto : whats ? null : n(r.roas)),
    taxaConversao: r2(whats ? (conversas && vendas != null ? (vendas / conversas) * 100 : null) : (cliques && vendas != null ? (vendas / cliques) * 100 : null)),
    ticket: r2(vendas && faturamento != null ? faturamento / vendas : null),
  };
}

/**
 * Soma os resultados de um destino. Cada razão usa só o gasto dos registros que têm aquele número (um registro sem
 * vendas anotadas não infla o custo por venda). `registros` = quantos entraram; `semVendas` = quantos não têm venda anotada.
 */
export function somarDestino(resultados = [], destino) {
  const a = { destino, registros: 0, gasto: 0, conversas: 0, vendas: 0, faturamento: 0, cliques: 0, gastoConversas: 0, gastoVendas: 0, gastoFaturamento: 0, conversasComVenda: 0, vendasComConversa: 0, cliquesComVenda: 0, vendasComClique: 0, vendasComFaturamento: 0, faturamentoComVenda: 0, semVendas: 0, comConversas: 0, comFaturamento: 0 };
  for (const r of resultados) {
    if (destinoDe(r) !== destino) continue;
    const m = metricasResultado(r), g = m.gasto || 0;
    a.registros++; a.gasto += g;
    if (m.conversas != null) { a.conversas += m.conversas; a.gastoConversas += g; a.comConversas++; }
    if (m.vendas != null) { a.vendas += m.vendas; a.gastoVendas += g; } else a.semVendas++;
    if (m.faturamento != null) { a.faturamento += m.faturamento; a.gastoFaturamento += g; a.comFaturamento++; }
    if (m.cliques != null) a.cliques += m.cliques;
    if (m.conversas != null && m.vendas != null) { a.conversasComVenda += m.conversas; a.vendasComConversa += m.vendas; }
    if (m.cliques != null && m.vendas != null) { a.cliquesComVenda += m.cliques; a.vendasComClique += m.vendas; }
    if (m.vendas != null && m.faturamento != null) { a.vendasComFaturamento += m.vendas; a.faturamentoComVenda += m.faturamento; }
  }
  const temVendas = a.registros - a.semVendas > 0;
  return {
    destino, registros: a.registros, gasto: r2(a.gasto), conversas: a.comConversas ? a.conversas : null, vendas: temVendas ? r2(a.vendas) : null, faturamento: a.comFaturamento ? r2(a.faturamento) : null, temVendas,
    custoConversa: r2(a.conversas ? a.gastoConversas / a.conversas : null),
    custoVenda: r2(a.vendas ? a.gastoVendas / a.vendas : null),
    roas: r2(a.gastoFaturamento ? a.faturamento / a.gastoFaturamento : null),
    taxaConversao: r2(destino === 'whatsapp' ? (a.conversasComVenda ? (a.vendasComConversa / a.conversasComVenda) * 100 : null) : (a.cliquesComVenda ? (a.vendasComClique / a.cliquesComVenda) * 100 : null)),
    ticket: r2(a.vendasComFaturamento ? a.faturamentoComVenda / a.vendasComFaturamento : null),
  };
}

// ---------- período ----------
const dia = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : null);
/** Período de um resultado: o do print (início/fim) ou o dia do registro manual. */
export const periodoDe = (r) => { const i = dia(r?.periodoInicio) || dia(r?.data), f = dia(r?.periodoFim) || i; return i ? { inicio: i <= f ? i : f, fim: i <= f ? f : i } : null; };
/** Resultado cujo período cabe inteiro no intervalo (sem intervalo: todos). */
export const dentroDoPeriodo = (r, { inicio, fim } = {}) => { const p = periodoDe(r); if (!p) return !inicio && !fim; return (!inicio || p.inicio >= inicio) && (!fim || p.fim <= fim); };
/** Do primeiro dia ao último entre os registros (null sem datas). */
export function faixa(resultados = []) {
  const ps = resultados.map(periodoDe).filter(Boolean);
  if (!ps.length) return null;
  return { inicio: ps.map((p) => p.inicio).sort()[0], fim: ps.map((p) => p.fim).sort().pop() };
}
export const textoPeriodo = (p) => (p ? `${p.inicio.split('-').reverse().join('/')} a ${p.fim.split('-').reverse().join('/')}` : 'sem data');
/** As duas faixas são o mesmo período? (mesmo primeiro e último dia) */
export const mesmoPeriodo = (a, b) => Boolean(a && b && a.inicio === b.inicio && a.fim === b.fim);

/**
 * Compara WhatsApp x Site no período pedido. Regras:
 *  - os períodos dos dois lados têm de ser os mesmos; se não forem, `avisoPeriodo` diz quais são (a comparação ainda
 *    aparece, mas marcada);
 *  - sem venda do WhatsApp anotada (o Meta não vê venda fechada na conversa), compara só até o custo por conversa e
 *    diz que a comparação de venda precisa desse registro (`nivel: 'conversa'`);
 *  - "onde colocar a próxima verba" = o destino com o menor custo por venda (empate = diferença de até 10%).
 */
export function compararDestinos(resultados = [], intervalo = {}) {
  const lista = resultados.filter((r) => dentroDoPeriodo(r, intervalo));
  const whats = lista.filter((r) => destinoDe(r) === 'whatsapp'), site = lista.filter((r) => destinoDe(r) === 'site');
  const w = somarDestino(whats, 'whatsapp'), s = somarDestino(site, 'site');
  const fw = faixa(whats), fs = faixa(site);
  const avisoPeriodo = whats.length && site.length && !mesmoPeriodo(fw, fs)
    ? `Períodos diferentes: WhatsApp ${textoPeriodo(fw)} e site ${textoPeriodo(fs)}. Compare o mesmo período (escolha as datas acima ou envie os prints do mesmo período) antes de decidir.` : '';
  let nivel = 'sem_dados', mensagem = '', ondeVerba = null;
  if (!whats.length || !site.length) {
    mensagem = !whats.length && !site.length ? 'Nenhum resultado neste período.' : `Só há resultados de ${whats.length ? 'WhatsApp' : 'site'} neste período: registre os do outro destino para comparar.`;
  } else if (!w.temVendas) {
    nivel = 'conversa';
    mensagem = 'Sem vendas do WhatsApp registradas: a comparação vai só até o custo por conversa. Registre as vendas fechadas na conversa (o Meta não vê essas vendas) para comparar custo por venda e ROAS.';
  } else if (!s.temVendas) {
    nivel = 'conversa';
    mensagem = 'Sem compras do site registradas neste período: registre as compras (ou o CPA) para comparar por venda.';
  } else {
    nivel = 'venda';
    if (avisoPeriodo) mensagem = 'Com períodos diferentes, o app não indica onde colocar a próxima verba: compare o mesmo período.';
    else if (w.custoVenda != null && s.custoVenda != null) {
      const menor = w.custoVenda <= s.custoVenda ? 'whatsapp' : 'site', maior = menor === 'whatsapp' ? s.custoVenda : w.custoVenda, base = Math.min(w.custoVenda, s.custoVenda);
      ondeVerba = maior - base <= base * 0.1
        ? { destino: 'empate', motivo: `Custo por venda parecido (WhatsApp ${brl(w.custoVenda)} x site ${brl(s.custoVenda)}, diferença de até 10%): mantenha a divisão e decida pelo ROAS e pela capacidade de atendimento.` }
        : { destino: menor, motivo: `Custo por venda menor no ${nomeDestino(menor)}: ${brl(base)} contra ${brl(maior)} no ${nomeDestino(menor === 'whatsapp' ? 'site' : 'whatsapp')}.` };
    }
  }
  return { whatsapp: w, site: s, periodos: { whatsapp: fw, site: fs }, mesmoPeriodo: !avisoPeriodo, avisoPeriodo, nivel, mensagem, ondeVerba };
}

/** Uma linha por grupo (produto, oferta...) com as métricas dos dois destinos. `chave(r)` -> { id, nome }. */
export function compararPorGrupo(resultados = [], chave) {
  const g = new Map();
  for (const r of resultados) { const k = chave(r); if (!g.has(k.id)) g.set(k.id, { ...k, lista: [] }); g.get(k.id).lista.push(r); }
  return [...g.values()].map((x) => ({ id: x.id, nome: x.nome, whatsapp: somarDestino(x.lista, 'whatsapp'), site: somarDestino(x.lista, 'site') }));
}
