// WhatsApp x Site: contas por destino, período e "onde colocar a próxima verba".
import { describe, it, expect } from 'vitest';
import { metricasResultado, somarDestino, compararDestinos, periodoDe, compararPorGrupo } from './destinos.js';

const w = (extra) => ({ destino: 'whatsapp', periodoInicio: '2026-09-01', periodoFim: '2026-09-07', ...extra });
const s = (extra) => ({ destino: 'site', periodoInicio: '2026-09-01', periodoFim: '2026-09-07', ...extra });

describe('metricasResultado', () => {
  it('WhatsApp: custo por conversa, custo por venda, ROAS, conversão e ticket', () => {
    const m = metricasResultado(w({ gasto: 300, conversas: 60, vendasConversa: 6, faturamentoConversa: 1200 }));
    expect(m).toMatchObject({ destino: 'whatsapp', custoConversa: 5, custoVenda: 50, roas: 4, taxaConversao: 10, ticket: 200 });
  });
  it('WhatsApp sem vendas anotadas: só custo por conversa', () => {
    const m = metricasResultado(w({ gasto: 300, conversas: 60 }));
    expect(m.custoConversa).toBe(5);
    expect(m.custoVenda).toBeNull();
    expect(m.roas).toBeNull();
  });
  it('site: usa compras/faturamento; sem eles, o CPA e o ROAS registrados', () => {
    expect(metricasResultado(s({ gasto: 400, compras: 8, faturamento: 1600, cliques: 400 }))).toMatchObject({ custoVenda: 50, roas: 4, taxaConversao: 2, ticket: 200 });
    expect(metricasResultado({ gasto: 100, cpa: 25, roas: 3 })).toMatchObject({ destino: 'site', custoVenda: 25, roas: 3 });
  });
});

describe('somarDestino', () => {
  it('cada razão usa só o gasto dos registros que têm o número', () => {
    const a = somarDestino([w({ gasto: 100, conversas: 20, vendasConversa: 2, faturamentoConversa: 400 }), w({ gasto: 100, conversas: 20 })], 'whatsapp');
    expect(a.registros).toBe(2);
    expect(a.custoConversa).toBe(5); // 200 / 40
    expect(a.custoVenda).toBe(50); // só o registro com vendas: 100 / 2 (o outro não infla)
    expect(a.roas).toBe(4);
    expect(a.taxaConversao).toBe(10); // 2 vendas em 20 conversas do registro com venda
    expect(a.temVendas).toBe(true);
  });
});

describe('compararDestinos', () => {
  it('por venda quando os dois lados têm vendas no mesmo período; verba no menor custo por venda', () => {
    const c = compararDestinos([w({ gasto: 300, conversas: 60, vendasConversa: 6, faturamentoConversa: 1200 }), s({ gasto: 400, compras: 5, faturamento: 1000 })]);
    expect(c.nivel).toBe('venda');
    expect(c.mesmoPeriodo).toBe(true);
    expect(c.whatsapp.custoVenda).toBe(50);
    expect(c.site.custoVenda).toBe(80);
    expect(c.ondeVerba.destino).toBe('whatsapp');
    expect(c.ondeVerba.motivo).toContain('R$ 50,00');
  });
  it('sem vendas do WhatsApp registradas: só até o custo por conversa, e diz isso', () => {
    const c = compararDestinos([w({ gasto: 300, conversas: 60 }), s({ gasto: 400, compras: 5, faturamento: 1000 })]);
    expect(c.nivel).toBe('conversa');
    expect(c.mensagem).toContain('Registre as vendas fechadas na conversa');
    expect(c.ondeVerba).toBeNull();
    expect(c.whatsapp.custoConversa).toBe(5);
  });
  it('custo por venda parecido (até 10%) = empate', () => {
    const c = compararDestinos([w({ gasto: 100, vendasConversa: 2, conversas: 10 }), s({ gasto: 105, compras: 2 })]);
    expect(c.ondeVerba.destino).toBe('empate');
  });
  it('períodos diferentes geram aviso', () => {
    const c = compararDestinos([w({ gasto: 100, vendasConversa: 2 }), s({ gasto: 100, compras: 2, periodoInicio: '2026-09-01', periodoFim: '2026-09-15' })]);
    expect(c.mesmoPeriodo).toBe(false);
    expect(c.avisoPeriodo).toContain('01/09/2026 a 07/09/2026');
    expect(c.avisoPeriodo).toContain('01/09/2026 a 15/09/2026');
    expect(c.ondeVerba).toBeNull(); // períodos diferentes: o app não indica onde colocar a verba
    expect(c.mensagem).toContain('não indica');
  });
  it('filtra pelo intervalo pedido (resultado que não cabe inteiro fica fora)', () => {
    const c = compararDestinos([w({ gasto: 100, vendasConversa: 1 }), s({ gasto: 100, compras: 1, periodoInicio: '2026-08-25', periodoFim: '2026-09-07' })], { inicio: '2026-09-01', fim: '2026-09-30' });
    expect(c.site.registros).toBe(0);
    expect(c.nivel).toBe('sem_dados');
  });
  it('resultado manual usa a data do registro como período', () => {
    expect(periodoDe({ data: '2026-09-10' })).toEqual({ inicio: '2026-09-10', fim: '2026-09-10' });
  });
});

describe('compararPorGrupo', () => {
  it('uma linha por produto com os dois destinos', () => {
    const rs = [w({ produtoId: 'p1', gasto: 100, vendasConversa: 2 }), s({ produtoId: 'p1', gasto: 100, compras: 1 }), s({ produtoId: 'p2', gasto: 50, compras: 1 })];
    const g = compararPorGrupo(rs, (r) => ({ id: r.produtoId, nome: r.produtoId }));
    expect(g.find((x) => x.id === 'p1').whatsapp.custoVenda).toBe(50);
    expect(g.find((x) => x.id === 'p1').site.custoVenda).toBe(100);
    expect(g.find((x) => x.id === 'p2').whatsapp.registros).toBe(0);
  });
});
