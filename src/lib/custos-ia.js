// "Custos de IA" (Configurações): o consumo REAL registrado em gcc_uso_api (um registro por chamada) e nos resumos dos
// meses fechados (gcc_uso_api_resumo), por tarefa e por mês. Chamada pela assinatura (CLI) custa 0 de verdade; a
// estimativa "se tudo fosse pela API" usa os tokens registrados e a tabela de lib/precos-ia.js. Puro (sem banco).
import { calcularCusto, precoDoModelo } from './precos-ia.js';

const usoDe = (r) => ({ entrada: r.tokensEntrada || 0, saida: r.tokensSaida || 0, cacheEscrita: r.tokensCacheEscrita || 0, cacheLeitura: r.tokensCacheLeitura || 0, buscasWeb: r.buscasWeb || 0 });
const vazio = () => ({ chamadas: 0, assinatura: 0, reserva: 0, entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0, buscasWeb: 0, custoReal: 0, custoSeApi: 0, modelos: {} });
const somar = (a, r) => {
  const u = usoDe(r);
  a.chamadas++; if (r.provedor === 'cli') a.assinatura++; else a.reserva++;
  a.entrada += u.entrada; a.saida += u.saida; a.cacheEscrita += u.cacheEscrita; a.cacheLeitura += u.cacheLeitura; a.buscasWeb += u.buscasWeb;
  a.custoReal += r.provedor === 'cli' ? 0 : Number(r.custoUsd) || 0; // assinatura não cobra por token
  a.custoSeApi += calcularCusto(r.modelo, u);
  if (r.modelo) a.modelos[r.modelo] = (a.modelos[r.modelo] || 0) + 1;
  return a;
};
const juntar = (a, b) => { for (const k of ['chamadas', 'assinatura', 'reserva', 'entrada', 'saida', 'cacheEscrita', 'cacheLeitura', 'buscasWeb', 'custoReal', 'custoSeApi']) a[k] += b[k] || 0; for (const [m, n] of Object.entries(b.modelos || {})) a.modelos[m] = (a.modelos[m] || 0) + n; return a; };
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
