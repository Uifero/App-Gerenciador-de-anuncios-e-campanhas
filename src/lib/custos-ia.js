// "Custos de IA" (Configurações): o consumo REAL registrado em gcc_uso_api (um registro por chamada) e nos resumos dos
// meses fechados (gcc_uso_api_resumo), por tarefa e por mês. "Pago por": provedor 'cli' = Assinatura (custo real 0; "custaria
// US$ X pela API" é só informação, pelos tokens e a tabela de lib/precos-ia.js), 'api' = API (custo real registrado) e registro
// antigo sem provedor = "não registrado" (o histórico não é reescrito). Puro (sem banco).
import { calcularCusto, precoDoModelo } from './precos-ia.js';

const usoDe = (r) => ({ entrada: r.tokensEntrada || 0, saida: r.tokensSaida || 0, cacheEscrita: r.tokensCacheEscrita || 0, cacheLeitura: r.tokensCacheLeitura || 0, buscasWeb: r.buscasWeb || 0 });
const vazio = () => ({ chamadas: 0, assinatura: 0, reserva: 0, naoRegistrado: 0, entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0, buscasWeb: 0, custoReal: 0, custoSeApi: 0, custoAssinaturaSeApi: 0, custoNaoRegistrado: 0, modelos: {} });
/** Quem pagou a chamada: 'assinatura' | 'api' | 'nao_registrado' (registro antigo sem provedor). */
export const pagoPor = (r) => (r?.provedor === 'cli' ? 'assinatura' : r?.provedor === 'api' ? 'api' : 'nao_registrado');
export const ROTULO_PAGO_POR = { assinatura: 'Assinatura', api: 'API', nao_registrado: 'não registrado' };
const somar = (a, r) => {
  const u = usoDe(r), quem = pagoPor(r), seApi = calcularCusto(r.modelo, u);
  a.chamadas++;
  if (quem === 'assinatura') { a.assinatura++; a.custoAssinaturaSeApi += seApi; } // assinatura não cobra por token
  else if (quem === 'api') { a.reserva++; a.custoReal += Number(r.custoUsd) || 0; }
  else { a.naoRegistrado++; a.custoNaoRegistrado += Number(r.custoUsd) || 0; }
  a.entrada += u.entrada; a.saida += u.saida; a.cacheEscrita += u.cacheEscrita; a.cacheLeitura += u.cacheLeitura; a.buscasWeb += u.buscasWeb;
  a.custoSeApi += seApi;
  if (r.modelo) a.modelos[r.modelo] = (a.modelos[r.modelo] || 0) + 1;
  return a;
};
const juntar = (a, b) => { for (const k of ['chamadas', 'assinatura', 'reserva', 'naoRegistrado', 'entrada', 'saida', 'cacheEscrita', 'cacheLeitura', 'buscasWeb', 'custoReal', 'custoSeApi', 'custoAssinaturaSeApi', 'custoNaoRegistrado']) a[k] += b[k] || 0; for (const [m, n] of Object.entries(b.modelos || {})) a.modelos[m] = (a.modelos[m] || 0) + n; return a; };
const modeloPrincipal = (a) => Object.entries(a.modelos).sort((x, y) => y[1] - x[1])[0]?.[0] || '';

/** Por tarefa, já com médias: entrada total (com cache) e saída por chamada, e custo por chamada nos preços atuais da API. */
function fechar(a) {
  const n = a.chamadas || 1;
  const modelo = modeloPrincipal(a);
  return { ...a, modelo, nomeModelo: modelo ? precoDoModelo(modelo).nome : '', mediaEntrada: Math.round((a.entrada + a.cacheEscrita + a.cacheLeitura) / n), mediaSaida: Math.round(a.saida / n), custoPorChamada: a.custoSeApi / n };
}

/**
 * regs: registros de gcc_uso_api; resumos: documentos de gcc_uso_api_resumo (meses fechados; os antigos só têm
 * porCategoria, os novos têm porTarefa). Devolve { porTarefa: [...], porMes: [{ mes, ...totais }], total, mesesSemDetalhe }.
 */
export function relatorioCustos(regs = [], resumos = []) {
  const tarefas = {}, meses = {};
  for (const r of regs) {
    const t = r.tarefa || 'outros';
    somar(tarefas[t] ||= vazio(), r);
    somar(meses[r.mes || String(r.data || '').slice(0, 7) || '?'] ||= vazio(), r);
  }
  const mesesSemDetalhe = [];
  for (const z of resumos) {
    if (z.porTarefa) {
      for (const [t, v] of Object.entries(z.porTarefa)) { juntar(tarefas[t] ||= vazio(), v); juntar(meses[z.mes] ||= vazio(), v); }
    } else {
      mesesSemDetalhe.push(z.mes);
      const m = (meses[z.mes] ||= vazio());
      m.chamadas += z.chamadas || 0; m.custoReal += z.totalUsd || 0; m.entrada += z.tokensEntrada || 0; m.saida += z.tokensSaida || 0;
    }
  }
  const porTarefa = Object.entries(tarefas).map(([tarefa, a]) => ({ tarefa, ...fechar(a) })).sort((x, y) => y.custoSeApi - x.custoSeApi);
  const porMes = Object.entries(meses).map(([mes, a]) => ({ mes, ...fechar(a) })).sort((x, y) => y.mes.localeCompare(x.mes));
  const total = fechar(porTarefa.reduce((a, t) => juntar(a, t), vazio()));
  return { porTarefa, porMes, total, mesesSemDetalhe: mesesSemDetalhe.sort() };
}

/** Agregado por tarefa de um mês (para o resumo do mês fechado, que antes só guardava por categoria). */
export function porTarefaDoMes(regs = []) {
  const out = {};
  for (const r of regs) somar(out[r.tarefa || 'outros'] ||= vazio(), r);
  return out;
}

/** Chamadas uma a uma (mais recentes primeiro), com quem pagou: assinatura = US$ 0 e "custaria" pela API só como informação. */
export function chamadasRecentes(regs = [], n = 30) {
  return [...regs].sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, n).map((r) => {
    const quem = pagoPor(r);
    return { data: r.data || '', tarefa: r.tarefa || 'outros', cliente: r.clienteNome || '', pagoPor: quem, rotulo: ROTULO_PAGO_POR[quem],
      custo: quem === 'assinatura' ? 0 : Number(r.custoUsd) || 0, custariaApi: quem === 'assinatura' ? calcularCusto(r.modelo, usoDe(r)) : null };
  });
}
