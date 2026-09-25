// Testes da conexão campanha <-> site: sugestão automática do link publicado como destino, com UTM no checklist.
import { describe, it, expect } from 'vitest';
import { checklistPadrao, siteDestino } from './campanhas.js';

const cliente = { estagio: 'novo' };

describe('siteDestino', () => {
  it('devolve o primeiro site com link publicado (custom ou pacote)', () => {
    const sites = [{ modo: 'pacote_plataforma', linkPublicado: 'https://loja.exemplo.com' }];
    expect(siteDestino(sites)).toEqual({ url: 'https://loja.exemplo.com', modo: 'pacote_plataforma' });
  });

  it('devolve null quando nenhum site tem link publicado', () => {
    expect(siteDestino([{ modo: 'custom', linkPublicado: '' }])).toBeNull();
    expect(siteDestino([])).toBeNull();
  });
});

describe('checklistPadrao — URL de destino', () => {
  it('inclui a URL com parâmetros UTM quando a campanha tem urlDestino', () => {
    const c = { nome: 'Campanha X', urlDestino: 'https://loja.exemplo.com/produto' };
    const linhas = checklistPadrao(c, cliente);
    const linha = linhas.find((l) => l.includes('URL de destino'));
    expect(linha).toContain('utm_source=meta');
    expect(linha).toContain('utm_campaign=Campanha+X');
  });

  it('avisa claramente quando não há site publicado (sem urlDestino)', () => {
    const linhas = checklistPadrao({ nome: 'Campanha X' }, cliente);
    const linha = linhas.find((l) => l.toLowerCase().includes('url de destino'));
    expect(linha).toContain('nenhum site publicado');
  });
});

// ---------- rascunho de estrutura: conjuntos, defesa contra id inventado e checklist por conjunto ----------
import { camposDaEstrutura, conjuntosManuais, ehRascunho, diagramaHtml, raciocinioHtml } from './campanhas.js';

const aprovados = [{ id: 'a1', nome: 'UGC dor' }, { id: 'a2', nome: 'Prova social' }];
const estrutura = {
  resumo: 'Teste de 2 públicos', publicos: [{ nome: 'Frio' }, { nome: 'Quente' }],
  conjuntos: [
    { nome: 'Frio', publico: { nome: 'Interesses' }, orcamentoDiario: 60, objetivo: 'achar público novo', criativos: [{ criativoId: 'a1', criativoNome: 'nome da IA', motivo: 'ROAS 3x' }, { criativoId: 'inventado', motivo: 'x' }] },
    { nome: 'Quente', publico: { nome: 'Visitantes' }, orcamentoDiario: 40, objetivo: 'converter', criativos: [{ criativoId: 'a2', motivo: 'sem dado' }] },
  ],
  orcamento: { diario: 100, distribuicao: '60/40' }, estruturaTeste: { duracaoDias: 4 },
  raciocinio: { quantidadeConjuntos: 'dois bastam', publicos: [{ conjunto: 'Frio', porque: 'sem histórico', base: 'sem_dados' }], divisaoOrcamento: 'mais no frio', objetivoEstrutura: 'provar o ângulo', dadosInsuficientes: ['sem histórico do cliente'] },
  checklistMeta: [], selecaoCriativos: [{ criativoId: 'a1', motivo: 'ROAS 3x' }, { criativoId: 'inventado' }, { criativoId: 'a2' }], avisoCriativos: null,
};

describe('camposDaEstrutura', () => {
  it('descarta criativo que não está entre os aprovados e usa o nome do app, não o da IA', () => {
    const r = camposDaEstrutura(estrutura, aprovados, 50);
    expect(r.conjuntos[0].criativos).toEqual([{ criativoId: 'a1', criativoNome: 'UGC dor', motivo: 'ROAS 3x' }]);
    expect(r.criativos.map((k) => k.id)).toEqual(['a1', 'a2']);
    expect(r.orcamentoDiario).toBe(100);
    expect(r.raciocinio.dadosInsuficientes).toEqual(['sem histórico do cliente']);
  });

  it('sem nenhum aprovado, avisa em vez de inventar seleção', () => {
    const r = camposDaEstrutura({ ...estrutura, avisoCriativos: null }, [], 50);
    expect(r.criativos).toEqual([]);
    expect(r.avisoCriativos).toMatch(/Nenhum criativo aprovado/);
  });
});

describe('conjuntosManuais', () => {
  it('um conjunto por público, orçamento dividido igualmente e criativos em todos', () => {
    const r = conjuntosManuais([{ nome: 'A' }, { nome: 'B' }, { nome: 'C' }], 100, ['a1']);
    expect(r).toHaveLength(3);
    expect(r[0].orcamentoDiario).toBe(33.33);
    expect(r.every((k) => k.criativos[0].criativoId === 'a1')).toBe(true);
  });
  it('sem público, cria um conjunto "a definir"', () => {
    expect(conjuntosManuais([], null)[0].publico.nome).toBe('Público a definir');
  });
});

describe('rascunho', () => {
  it('ehRascunho só para status rascunho', () => {
    expect(ehRascunho({ status: 'rascunho' })).toBe(true);
    expect(ehRascunho({ status: 'planejada' })).toBe(false);
  });

  it('checklist traz um passo por conjunto com público, orçamento e criativos', () => {
    const c = { nome: 'X', ...camposDaEstrutura(estrutura, aprovados, null) };
    const linhas = checklistPadrao(c, cliente, aprovados);
    expect(linhas.some((l) => l.includes('Conjunto 1 "Frio"') && l.includes('R$ 60/dia') && l.includes('UGC dor'))).toBe(true);
    expect(linhas.some((l) => l.includes('Conjunto 2 "Quente"') && l.includes('Prova social'))).toBe(true);
  });

  it('diagrama mostra cada conjunto com seus criativos e o motivo; raciocínio cobre a..e', () => {
    const c = { nome: 'X', ...camposDaEstrutura(estrutura, aprovados, null), fontesDados: { resultados: 0, nicho: false, referencias: 0 } };
    const html = diagramaHtml(c, aprovados);
    expect(html).toContain('Conjunto 2');
    expect(html).toContain('ROAS 3x');
    expect(html).toContain('60%');
    const r = raciocinioHtml(c);
    ['a) ', 'b) ', 'c) ', 'd) ', 'e) ', 'sem dados suficientes', '0 resultado(s)'].forEach((t) => expect(r).toContain(t));
  });
});

import { resultadosPorCriativo } from './campanhas.js';
describe('resultadosPorCriativo', () => {
  it('soma gasto e pondera ROAS/CPA pelo gasto, por criativo', () => {
    const r = resultadosPorCriativo([
      { criativoId: 'a1', gasto: 100, roas: 4, cpa: 20 }, { criativoId: 'a1', gasto: 300, roas: 2, cpa: 40 },
      { criativoId: 'a2', gasto: 50 }, { gasto: 10, roas: 9 },
    ], aprovados);
    expect(r[0]).toEqual({ nome: 'UGC dor', registros: 2, gasto: 400, roas: 2.5, cpa: 35 });
    expect(r[1]).toMatchObject({ nome: 'Prova social', registros: 1, roas: null, cpa: null });
    expect(r).toHaveLength(2);
  });
});
