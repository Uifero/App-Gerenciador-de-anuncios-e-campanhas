// Análise sempre no nicho do cliente, com fonte conferida e prioridade quando as fontes discordam.
import { describe, it, expect } from 'vitest';
import {
  prioridadeFonte, ordenarPorPrioridade, fontePrincipal, anunciosDoNicho, resultadosDoNicho, fonteDesatualizada, normalizarPesquisa,
  conferirItem, chavePesquisa, pesquisaValida, SEM_FONTE,
} from './fontes-analise.js';

describe('prioridade das fontes', () => {
  it('política > resultados do cliente > nicho > documentos > anúncios > web', () => {
    expect(['web', 'anuncios', 'documentos', 'resultadosNicho', 'resultadosCliente', 'politica'].map(prioridadeFonte)).toEqual([6, 5, 4, 3, 2, 1]);
    const ord = ordenarPorPrioridade([{ tipo: 'web', diz: 'escalar' }, { tipo: 'resultadosCliente', diz: 'pausar' }, { tipo: 'documentos', diz: 'manter' }]);
    expect(ord[0]).toEqual({ tipo: 'resultadosCliente', diz: 'pausar' }); // o resultado do próprio cliente vence a web
    expect(fontePrincipal({ web: [{}], anuncios: [{}] })).toBe('anuncios');
    expect(fontePrincipal({})).toBeNull();
  });
});

const moda = { id: 'c1', nicho: 'Moda feminina', pais: 'Brasil' };
const refs = [
  { id: 'r1', nicho: 'moda feminina', titulo: 'Vestido A', diasNoAr: 40, paisCliente: 'Brasil' },
  { id: 'r2', nicho: 'Moda Feminina ', titulo: 'Blusa B', diasNoAr: 90, paisCliente: 'Brasil', subnicho: 'plus size' },
  { id: 'r3', nicho: 'Suplementos', titulo: 'Whey', diasNoAr: 200, paisCliente: 'Brasil' },
  { id: 'r4', nicho: 'Moda feminina', titulo: 'Vestido A', diasNoAr: 40, paisCliente: 'Brasil' }, // cópia em outro cliente (sem link: mesmo título)
  { id: 'r5', nicho: 'Moda feminina', titulo: 'Moda PT', diasNoAr: 300, paisCliente: 'Portugal' },
];

describe('anúncios do nicho (swipe file)', () => {
  it('cliente de moda só recebe anúncios de moda do mesmo país, do mais tempo no ar para o menos, sem repetir', () => {
    const r = anunciosDoNicho(refs, moda);
    expect(r.nivel).toBe('nicho');
    expect(r.itens.map((x) => x.id)).toEqual(['r2', 'r1']);
  });
  it('com subnicho e anúncio dele, só o subnicho', () => {
    const r = anunciosDoNicho(refs, { ...moda, subnicho: 'Plus Size' });
    expect(r.nivel).toBe('subnicho');
    expect(r.itens.map((x) => x.id)).toEqual(['r2']);
  });
  it('nicho sem anúncio diz que não tem (nunca pega de outro nicho)', () => {
    const r = anunciosDoNicho(refs, { id: 'x', nicho: 'Pet shop', pais: 'Brasil' });
    expect(r.nivel).toBe('nenhum');
    expect(r.itens).toEqual([]);
  });
  it('nicho vizinho só se o operador cadastrou, com rótulo de confiança menor', () => {
    const r = anunciosDoNicho(refs, { id: 'x', nicho: 'Moda masculina', pais: 'Brasil', nichosVizinhos: 'moda feminina' });
    expect(r.nivel).toBe('vizinho');
    expect(r.rotulo).toContain('confiança menor');
  });
});

describe('resultados do nicho (privacidade)', () => {
  const clientes = [moda, { id: 'c2', nicho: 'moda feminina' }, { id: 'c3', nicho: 'Moda feminina' }, { id: 'c4', nicho: 'Suplementos' }];
  const resultados = [
    { clienteId: 'c2', destino: 'site', gasto: 100, compras: 2 }, { clienteId: 'c3', destino: 'site', gasto: 300, compras: 3 },
    { clienteId: 'c4', destino: 'site', gasto: 1000, compras: 1 }, { clienteId: 'c1', destino: 'site', gasto: 50, compras: 5 },
  ];
  it('agrega só outros clientes do mesmo nicho, sem nomes', () => {
    const r = resultadosDoNicho({ cliente: moda, clientes, resultados });
    expect(r.suficiente).toBe(true);
    expect(r.clientes).toBe(2);
    expect(r.porDestino.site.custoVenda).toBe(80); // (100+300)/(2+3); o suplemento e o próprio cliente ficam fora
    expect(JSON.stringify(r)).not.toMatch(/c2|c3/);
  });
  it('só 1 outro cliente no nicho = "dados insuficientes no nicho", sem números', () => {
    const r = resultadosDoNicho({ cliente: moda, clientes: clientes.filter((c) => c.id !== 'c3'), resultados });
    expect(r.suficiente).toBe(false);
    expect(r.mensagem).toBe('dados insuficientes no nicho');
    expect(r.porDestino).toBeUndefined();
  });
  it('destino com 1 cliente só no nicho não mostra número (mesmo com o nicho suficiente)', () => {
    const rs = [...resultados, { clienteId: 'c2', destino: 'whatsapp', gasto: 50, conversas: 10, vendasConversa: 1 }];
    const r = resultadosDoNicho({ cliente: moda, clientes, resultados: rs });
    expect(r.porDestino.whatsapp).toMatchObject({ insuficiente: true, registros: 0 });
    expect(r.porDestino.whatsapp.custoVenda).toBeUndefined();
    expect(r.porDestino.site.clientes).toBe(2);
  });
  it('país diferente não entra', () => {
    const r = resultadosDoNicho({ cliente: moda, clientes: [moda, { id: 'c2', nicho: 'moda feminina', pais: 'Portugal' }, { id: 'c3', nicho: 'Moda feminina', pais: 'Portugal' }], resultados });
    expect(r.suficiente).toBe(false);
  });
});

describe('pesquisa web', () => {
  const hoje = new Date('2026-10-07T12:00:00Z');
  it('marca fonte com mais de 12 meses e fonte sem data', () => {
    expect(fonteDesatualizada('2025-03', hoje)).toBe(true);
    expect(fonteDesatualizada('2026-05-10', hoje)).toBe(false);
    expect(fonteDesatualizada('', hoje)).toBe('sem_data');
  });
  it('só fica item com link de verdade', () => {
    const p = normalizarPesquisa({ resumo: 'ok', praticas: [{ texto: 'UGC', url: 'https://ex.com/a', data: '2024-01' }, { texto: 'sem link', url: 'ex.com' }], benchmarks: [{ metrica: 'CTR', valor: '1,2%', url: 'https://ex.com/b', site: 'Ex' }] }, hoje);
    expect(p.praticas).toHaveLength(1);
    expect(p.praticas[0].fonte).toMatchObject({ site: 'ex.com', desatualizada: true });
    expect(p.benchmarks[0].fonte.desatualizada).toBe('sem_data');
    expect(p.encontrou).toBe(true);
  });
  it('cache por nicho + destino vale 7 dias', () => {
    expect(chavePesquisa(moda, 'whatsapp')).not.toBe(chavePesquisa(moda, 'site'));
    expect(chavePesquisa(moda, 'site')).not.toBe(chavePesquisa({ ...moda, nicho: 'Suplementos' }, 'site'));
    expect(pesquisaValida({ pesquisadoEm: new Date(Date.now() - 6 * 864e5).toISOString() })).toBe(true);
    expect(pesquisaValida({ pesquisadoEm: new Date(Date.now() - 8 * 864e5).toISOString() })).toBe(false);
  });
});

describe('conferirItem', () => {
  const ctx = {
    documentos: [{ id: 'vortex', titulo: 'Metodologia Vortex' }], web: [{ url: 'https://ex.com/a', site: 'ex.com', data: '2026-05', desatualizada: false }],
    anuncios: [{ id: 'r2', titulo: 'Blusa B', diasNoAr: 90 }], qtdResultadosCliente: 5, nicho: { suficiente: false }, poucoHistorico: false,
  };
  it('mantém só as fontes enviadas e preenche os dados delas pelo app (não pela IA)', () => {
    const c = conferirItem({ porque: 'x', confianca: 'alta', fontes: { documentos: [{ id: 'vortex', parte: 'Narrativas' }, { id: 'inventado' }], anuncios: [{ id: 'r2' }], web: [{ url: 'https://ex.com/a/' }], resultadosNicho: [{ descricao: 'nicho' }] } }, ctx);
    expect(c.fontes.documentos).toEqual([{ id: 'vortex', titulo: 'Metodologia Vortex', parte: 'Narrativas' }]);
    expect(c.fontes.anuncios[0].diasNoAr).toBe(90);
    expect(c.fontes.web).toHaveLength(1);
    expect(c.fontes.resultadosNicho).toEqual([]); // nicho sem dado suficiente: não pode ser citado
    expect(c.avisos[0]).toContain('retiradas');
    expect(c.semFonte).toBe(false);
  });
  it('sem fonte: confiança baixa e o número sai', () => {
    const c = conferirItem({ porque: 'acho', confianca: 'alta', resultadoEsperado: { metrica: 'ROAS', min: 3, max: 5, confianca: 'alta' } }, ctx);
    expect(c.semFonte).toBe(true);
    expect(c.confianca).toBe('baixa');
    expect(c.resultadoEsperado).toMatchObject({ min: null, max: null, confianca: 'baixa' });
    expect(SEM_FONTE).toBe('baseado só no raciocínio da IA');
  });
  it('pouco histórico: faixa mantida mas confiança baixa', () => {
    const c = conferirItem({ fontes: { resultadosCliente: [{ periodo: 'set', campanha: 'A' }] }, resultadoEsperado: { metrica: 'custo por venda', min: 60, max: 30, confianca: 'alta' } }, { ...ctx, poucoHistorico: true });
    expect(c.resultadoEsperado).toMatchObject({ min: 30, max: 60, confianca: 'baixa' });
  });
});
