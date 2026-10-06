import { describe, it, expect } from 'vitest';
import { calcularCusto, precoDoModelo } from './precos-ia.js';
import { relatorioCustos, porTarefaDoMes } from './custos-ia.js';

describe('tabela de preços (um arquivo só)', () => {
  it('Sonnet 5 2/10, Haiku 4.5 1/5, Opus 5.5 4/20 com leitura de cache a 0,05x', () => {
    const m = { entrada: 1e6, saida: 1e6 };
    expect(calcularCusto('claude-sonnet-5', m)).toBeCloseTo(12, 6);
    expect(calcularCusto('claude-haiku-4-5', m)).toBeCloseTo(6, 6);
    expect(calcularCusto('claude-opus-5-5', m)).toBeCloseTo(24, 6);
    expect(calcularCusto('claude-opus-5-5', { cacheLeitura: 1e6 })).toBeCloseTo(0.2, 6);
    expect(calcularCusto('claude-sonnet-5', { cacheEscrita: 1e6 })).toBeCloseTo(2.5, 6);
    expect(precoDoModelo('claude-fable-5-1').entrada).toBe(10);
  });
});

describe('relatório de custos por tarefa', () => {
  const regs = [
    { tarefa: 'pacote', modelo: 'claude-sonnet-5', provedor: 'cli', tokensEntrada: 3000, tokensSaida: 5000, custoUsd: 0, mes: '2026-10' },
    { tarefa: 'pacote', modelo: 'claude-sonnet-5', provedor: 'api', tokensEntrada: 1000, tokensCacheLeitura: 2000, tokensSaida: 5000, custoUsd: calcularCusto('claude-sonnet-5', { entrada: 1000, cacheLeitura: 2000, saida: 5000 }), mes: '2026-10' },
    { tarefa: 'ajuste_site', modelo: 'claude-haiku-4-5', provedor: 'cli', tokensEntrada: 2000, tokensSaida: 400, custoUsd: 0, mes: '2026-10' },
  ];
  it('chamadas por provedor, custo real só da reserva, estimativa se fosse tudo API e médias', () => {
    const r = relatorioCustos(regs);
    const pac = r.porTarefa.find((x) => x.tarefa === 'pacote');
    expect(pac).toMatchObject({ chamadas: 2, assinatura: 1, reserva: 1, mediaEntrada: 3000, mediaSaida: 5000, modelo: 'claude-sonnet-5' });
    expect(pac.custoReal).toBeCloseTo((1000 * 2 + 2000 * 0.2 + 5000 * 10) / 1e6, 9);
    expect(pac.custoSeApi).toBeCloseTo((3000 * 2 + 5000 * 10) / 1e6 + pac.custoReal, 9);
    expect(pac.custoPorChamada).toBeCloseTo(pac.custoSeApi / 2, 9);
    expect(r.total.chamadas).toBe(3);
    expect(r.porMes[0]).toMatchObject({ mes: '2026-10', chamadas: 3, assinatura: 2, reserva: 1 });
  });
  it('meses fechados: os novos guardam por tarefa; os antigos só o total', () => {
    const resumos = [{ mes: '2026-09', porTarefa: porTarefaDoMes(regs) }, { mes: '2026-08', chamadas: 5, totalUsd: 0, tokensEntrada: 10, tokensSaida: 10 }];
    const r = relatorioCustos([], resumos);
    expect(r.porTarefa.find((x) => x.tarefa === 'pacote').chamadas).toBe(2);
    expect(r.mesesSemDetalhe).toEqual(['2026-08']);
    expect(r.porMes.map((m) => m.mes)).toEqual(['2026-09', '2026-08']);
  });
});
