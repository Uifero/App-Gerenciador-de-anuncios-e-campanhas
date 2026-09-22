// Testes do motor de Insights: padrões locais (sem IA), padrões por nicho (sem expor dados de outro cliente) e a
// sugestão proativa de ângulo/framework comprovado ainda não testado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bancos = { clientes: new Map(), resultados: new Map() };
vi.mock('../core/storage.js', () => ({
  COL: { clientes: 'clientes', resultados: 'resultados' },
  db: {
    listar: vi.fn(async (col, filtro) => {
      const m = bancos[col] || new Map();
      return [...m.entries()].map(([id, v]) => ({ id, ...v })).filter((d) => !filtro || Object.entries(filtro).every(([k, v]) => d[k] === v));
    }),
  },
}));
vi.mock('../core/ia.js', () => ({ explicarInsights: vi.fn() }));

const { padroesLocais, padroesPorNicho, sugestaoNaoTestada, sugestoesDashboard, cartaoInsights } = await import('./insights.js');

const resultado = (over) => ({ angulo: '', framework: '', formato: '', roas: null, cpa: null, gasto: 0, ...over });

beforeEach(() => { bancos.clientes.clear(); bancos.resultados.clear(); });

describe('padroesLocais', () => {
  it('agrupa por ângulo/framework/formato e ordena por ROAS (melhor primeiro)', () => {
    const resultados = [
      resultado({ angulo: 'dor', roas: 2, gasto: 100 }), resultado({ angulo: 'dor', roas: 2.4, gasto: 100 }),
      resultado({ angulo: 'economia', roas: 5, gasto: 100 }), resultado({ angulo: 'economia', roas: 5.2, gasto: 100 }),
    ];
    const p = padroesLocais(resultados);
    expect(p.angulo.map((g) => g.valor)).toEqual(['economia', 'dor']);
    expect(p.angulo[0].roasMedio).toBeCloseTo(5.1, 5);
  });

  it('exige o mínimo de amostras (padrão 2): grupo com 1 só não aparece', () => {
    const p = padroesLocais([resultado({ angulo: 'dor', roas: 3 })]);
    expect(p.angulo).toEqual([]);
  });

  it('ignora resultados sem ROAS nem CPA e sem o campo preenchido', () => {
    const p = padroesLocais([resultado({ angulo: '', roas: 3 }), resultado({ angulo: 'dor' })]);
    expect(p.angulo).toEqual([]);
  });

  it('média ponderada pelo gasto favorece o registro com mais gasto', () => {
    const p = padroesLocais([resultado({ angulo: 'dor', roas: 1, gasto: 10 }), resultado({ angulo: 'dor', roas: 5, gasto: 90 })]);
    expect(p.angulo[0].roasMedio).toBeCloseTo(4.6, 5); // (1*10 + 5*90)/100
  });

  it('respeita um mínimo de amostras customizado', () => {
    const resultados = [resultado({ angulo: 'dor', roas: 2 }), resultado({ angulo: 'dor', roas: 2 }), resultado({ angulo: 'dor', roas: 2 })];
    expect(padroesLocais(resultados, 5).angulo).toEqual([]);
    expect(padroesLocais(resultados, 3).angulo).toHaveLength(1);
  });
});

describe('sugestaoNaoTestada', () => {
  it('sugere o melhor ângulo de nicho que o cliente ainda não usou em nenhum criativo', () => {
    const padroesNicho = { angulo: [{ valor: 'economia', roasMedio: 5, amostras: 4 }, { valor: 'dor', roasMedio: 3, amostras: 3 }], framework: [], formato: [] };
    const criativosDoCliente = [{ angulo: 'dor' }];
    const s = sugestaoNaoTestada(padroesNicho, criativosDoCliente);
    expect(s.campo).toBe('angulo');
    expect(s.grupo.valor).toBe('economia');
  });

  it('devolve null quando todos os padrões já foram testados pelo cliente', () => {
    const padroesNicho = { angulo: [{ valor: 'dor', roasMedio: 3, amostras: 3 }], framework: [], formato: [] };
    expect(sugestaoNaoTestada(padroesNicho, [{ angulo: 'dor' }])).toBeNull();
  });

  it('ignora a dimensão "formato" (não é algo para "testar" da mesma forma)', () => {
    const padroesNicho = { angulo: [], framework: [], formato: [{ valor: 'video_curto', roasMedio: 9, amostras: 5 }] };
    expect(sugestaoNaoTestada(padroesNicho, [])).toBeNull();
  });

  it('não é sensível a maiúsculas/espaços ao comparar "já testado"', () => {
    const padroesNicho = { angulo: [{ valor: 'Economia', roasMedio: 5, amostras: 3 }], framework: [], formato: [] };
    expect(sugestaoNaoTestada(padroesNicho, [{ angulo: '  economia  ' }])).toBeNull();
  });
});

describe('padroesPorNicho', () => {
  it('agrega resultados de outros clientes do mesmo nicho, excluindo o próprio', () => {
    bancos.clientes = new Map([
      ['a', { nicho: 'Moda Fitness' }], ['b', { nicho: 'moda fitness' }], ['c', { nicho: 'pet shop' }],
    ]);
    bancos.resultados = new Map([
      ['r1', { clienteId: 'b', angulo: 'dor', roas: 4, gasto: 10 }], ['r2', { clienteId: 'b', angulo: 'dor', roas: 4.4, gasto: 10 }],
      ['r3', { clienteId: 'c', angulo: 'economia', roas: 9, gasto: 10 }], ['r4', { clienteId: 'c', angulo: 'economia', roas: 9, gasto: 10 }],
    ]);
    return padroesPorNicho('moda fitness', 'a').then((r) => {
      expect(r.clientes).toBe(1); // só "b" é do mesmo nicho (excluindo "a")
      expect(r.padroes.angulo.map((g) => g.valor)).toEqual(['dor']); // não inclui o padrão de "c" (pet shop)
    });
  });

  it('sem nenhum outro cliente do mesmo nicho, devolve padrões vazios sem erro', async () => {
    bancos.clientes = new Map([['a', { nicho: 'moda' }]]);
    const r = await padroesPorNicho('moda', 'a');
    expect(r.clientes).toBe(0);
    expect(r.padroes.angulo).toEqual([]);
  });
});

describe('sugestoesDashboard', () => {
  it('sugere para um cliente um padrão comprovado em outro cliente do mesmo nicho, sem leitura extra', () => {
    const clientes = [{ id: 'a', nicho: 'moda' }, { id: 'b', nicho: 'moda' }];
    const criativosTodos = [{ clienteId: 'a', angulo: 'dor' }];
    const resultadosTodos = [
      { clienteId: 'b', angulo: 'economia', roas: 6, gasto: 10 }, { clienteId: 'b', angulo: 'economia', roas: 6.2, gasto: 10 },
    ];
    const out = sugestoesDashboard(clientes, criativosTodos, resultadosTodos);
    expect(out).toHaveLength(1);
    expect(out[0].cliente.id).toBe('a');
    expect(out[0].grupo.valor).toBe('economia');
  });

  it('cliente sozinho no nicho (sem outro pra comparar) não gera sugestão', () => {
    const clientes = [{ id: 'a', nicho: 'moda única' }];
    const out = sugestoesDashboard(clientes, [], []);
    expect(out).toEqual([]);
  });
});

describe('cartaoInsights', () => {
  it('mostra aviso de dados insuficientes quando não há padrão nenhum', async () => {
    const html = await cartaoInsights({ id: 'a', nicho: 'moda' }, []);
    expect(html).toContain('Ainda não há resultados suficientes');
  });

  it('mostra os padrões locais quando há dados suficientes', async () => {
    const resultados = [resultado({ angulo: 'dor', roas: 3 }), resultado({ angulo: 'dor', roas: 3.2 })];
    const html = await cartaoInsights({ id: 'a', nicho: 'moda' }, resultados);
    expect(html).toContain('NESTE CLIENTE');
    expect(html).toContain('dor');
  });
});
