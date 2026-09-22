// Testes do rollup mensal de gcc_uso_api: fecha meses passados num resumo e apaga os registros individuais,
// sem nunca mexer no mês atual (o dashboard precisa continuar lendo o mês corrente sem mudança nenhuma).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bancos = {};
const COL_FAKE = { usoApi: 'usoApi', clientes: 'clientes' };

vi.mock('../core/storage.js', () => ({
  COL: COL_FAKE,
  db: {
    listar: vi.fn(async (col, filtro) => {
      const m = bancos[col] || new Map();
      return [...m.entries()].map(([id, v]) => ({ id, ...v })).filter((d) => !filtro || Object.entries(filtro).every(([k, v]) => d[k] === v));
    }),
    definir: vi.fn(async (col, id, dados) => { (bancos[col] ||= new Map()).set(id, dados); }),
    remover: vi.fn(async (col, id) => { (bancos[col] || new Map()).delete(id); }),
  },
}));

const { fecharMes, fecharMesesPendentes, totalArquivadoDoCliente, COL_USO_RESUMO, mesDe } = await import('./custo.js');
const { db } = await import('../core/storage.js');

function registro(over = {}) {
  return { mes: '2026-08', clienteId: 'cli1', clienteNome: 'Ana', categoria: 'criativos', custoUsd: 0.1, tokensEntrada: 100, tokensSaida: 50, tokensCacheEscrita: 0, tokensCacheLeitura: 0, buscasWeb: 0, ...over };
}

beforeEach(() => { for (const k of Object.keys(bancos)) delete bancos[k]; vi.clearAllMocks(); });

describe('fecharMes', () => {
  it('sem registros para o mês, não faz nada e devolve null', async () => {
    const r = await fecharMes('2026-08');
    expect(r).toBeNull();
    expect(db.definir).not.toHaveBeenCalled();
  });

  it('agrega os registros do mês num resumo único e apaga os individuais', async () => {
    bancos.usoApi = new Map([
      ['r1', registro({ custoUsd: 0.10, tokensEntrada: 100 })],
      ['r2', registro({ custoUsd: 0.20, tokensEntrada: 200, categoria: 'hooks', clienteId: 'cli2', clienteNome: 'Bia' })],
    ]);
    const resumo = await fecharMes('2026-08');
    expect(resumo.chamadas).toBe(2);
    expect(resumo.totalUsd).toBeCloseTo(0.30, 6);
    expect(resumo.porCliente.cli1).toMatchObject({ nome: 'Ana', usd: 0.10, chamadas: 1 });
    expect(resumo.porCliente.cli2).toMatchObject({ nome: 'Bia', usd: 0.20, chamadas: 1 });
    expect(resumo.porCategoria.criativos.chamadas).toBe(1);
    expect(resumo.porCategoria.hooks.chamadas).toBe(1);
    // gravou o resumo na coleção de arquivo, com o mês como id
    expect(db.definir).toHaveBeenCalledWith(COL_USO_RESUMO, '2026-08', expect.objectContaining({ mes: '2026-08' }));
    // apagou os registros individuais
    expect(bancos.usoApi.size).toBe(0);
  });

  it('é idempotente: chamado de novo sem registros crus, não sobrescreve o resumo existente', async () => {
    bancos.usoApi = new Map([['r1', registro()]]);
    await fecharMes('2026-08');
    expect(bancos[COL_USO_RESUMO].get('2026-08').chamadas).toBe(1);
    db.definir.mockClear();
    const segunda = await fecharMes('2026-08'); // já não há mais registros crus
    expect(segunda).toBeNull();
    expect(db.definir).not.toHaveBeenCalled();
    expect(bancos[COL_USO_RESUMO].get('2026-08').chamadas).toBe(1); // resumo intacto
  });
});

describe('fecharMesesPendentes', () => {
  it('nunca fecha o mês atual, mesmo que tenha registros', async () => {
    const atual = mesDe();
    bancos.usoApi = new Map([['r1', registro({ mes: atual })]]);
    await fecharMesesPendentes();
    expect(bancos.usoApi.size).toBe(1); // não foi apagado
    expect(bancos[COL_USO_RESUMO]?.has(atual)).toBeFalsy();
  });

  it('fecha um mês passado que ainda tinha registros soltos', async () => {
    const passado = mesDe(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1));
    bancos.usoApi = new Map([['r1', registro({ mes: passado })]]);
    await fecharMesesPendentes();
    expect(bancos.usoApi.size).toBe(0);
    expect(bancos[COL_USO_RESUMO].has(passado)).toBe(true);
  });
});

describe('totalArquivadoDoCliente', () => {
  it('soma o custo do cliente em todos os meses já fechados', async () => {
    bancos[COL_USO_RESUMO] = new Map([
      ['2026-07', { porCliente: { cli1: { usd: 1, chamadas: 3 } } }],
      ['2026-08', { porCliente: { cli1: { usd: 2, chamadas: 5 }, cli2: { usd: 9, chamadas: 1 } } }],
    ]);
    const t = await totalArquivadoDoCliente('cli1');
    expect(t).toEqual({ usd: 3, chamadas: 8 });
  });

  it('cliente sem nada arquivado devolve zero', async () => {
    bancos[COL_USO_RESUMO] = new Map();
    expect(await totalArquivadoDoCliente('cliX')).toEqual({ usd: 0, chamadas: 0 });
  });
});
