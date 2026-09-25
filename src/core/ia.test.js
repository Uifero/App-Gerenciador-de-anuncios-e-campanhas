// Testes da normalização da estrutura de campanha — em especial a seleção de criativos feita pela IA
// (selecaoCriativos/avisoCriativos), que precisa tolerar variação de chave e nunca quebrar com dado ausente.
import { describe, it, expect } from 'vitest';
import { normalizarCampanha } from './ia.js';

describe('normalizarCampanha — seleção de criativos', () => {
  it('mantém a seleção de criativos com motivo, filtrando os sem criativoId', () => {
    const d = { selecaoCriativos: [{ criativoId: 'c1', criativoNome: 'A', motivo: 'ROAS 4.2x' }, { criativoNome: 'sem id' }], avisoCriativos: null };
    const r = normalizarCampanha(d);
    expect(r.selecaoCriativos).toEqual([{ criativoId: 'c1', criativoNome: 'A', motivo: 'ROAS 4.2x' }]);
    expect(r.avisoCriativos).toBeNull();
  });

  it('aceita a variação em espanhol da chave (o modelo às vezes mistura idiomas)', () => {
    const d = { seleccionCreativos: [{ creativoId: 'c1', creativoNome: 'A', justificativa: 'motivo x' }] };
    const r = normalizarCampanha(d);
    expect(r.selecaoCriativos).toEqual([{ criativoId: 'c1', criativoNome: 'A', motivo: 'motivo x' }]);
  });

  it('sem seleção nem aviso, devolve listas/valores vazios sem quebrar', () => {
    const r = normalizarCampanha({});
    expect(r.selecaoCriativos).toEqual([]);
    expect(r.avisoCriativos).toBeNull();
  });

  it('mantém o aviso de criativos insuficientes', () => {
    const r = normalizarCampanha({ avisoCriativos: 'Faltam criativos de ângulo economia.' });
    expect(r.avisoCriativos).toBe('Faltam criativos de ângulo economia.');
  });
});

import { normalizarDiscussao } from './ia.js';

describe('normalizarCampanha — conjuntos e raciocínio', () => {
  it('deriva públicos e seleção plana dos conjuntos e junta motivos do mesmo criativo', () => {
    const r = normalizarCampanha({
      conjuntos: [
        { nome: 'A', publico: { nome: 'Frio' }, orcamentoDiario: '60', criativos: [{ criativoId: 'c1', motivo: 'm1' }] },
        { nome: 'B', publico: 'Quente', orcamentoDiario: 40, criativos: [{ criativoId: 'c1', motivo: 'm2' }] },
      ],
      orcamento: { diario: 100 },
    });
    expect(r.publicos.map((p) => p.nome)).toEqual(['Frio', 'Quente']);
    expect(r.selecaoCriativos).toEqual([{ criativoId: 'c1', criativoNome: '', motivo: 'm1 · m2' }]);
    expect(r.conjuntos[0].orcamentoDiario).toBe(60);
  });

  it('conjunto sem orçamento recebe a parte igual do que sobrou, marcado como estimado', () => {
    const r = normalizarCampanha({ conjuntos: [{ nome: 'A', orcamentoDiario: 50 }, { nome: 'B' }, { nome: 'C' }], orcamento: { diario: 100 } });
    expect(r.conjuntos[1]).toMatchObject({ orcamentoDiario: 25, orcamentoEstimado: true });
  });

  it('base desconhecida do público vira "sem_dados" (não inventa fonte)', () => {
    const r = normalizarCampanha({ raciocinio: { publicos: [{ conjunto: 'A', porque: 'x', base: 'intuição' }] } });
    expect(r.raciocinio.publicos[0].base).toBe('sem_dados');
  });
});

describe('normalizarDiscussao', () => {
  it('ajuste com estrutura vira "ajuste"', () => {
    const r = normalizarDiscussao({ tipo: 'ajuste', resposta: 'troquei', estrutura: { conjuntos: [{ nome: 'A' }] } });
    expect(r.tipo).toBe('ajuste');
    expect(r.estrutura.conjuntos).toHaveLength(1);
  });
  it('"ajuste" sem estrutura válida é tratado como explicação (nada muda)', () => {
    expect(normalizarDiscussao({ tipo: 'ajuste', resposta: 'x', estrutura: null })).toEqual({ tipo: 'explicacao', resposta: 'x', estrutura: null });
  });
  it('explicação ignora estrutura que venha junto', () => {
    expect(normalizarDiscussao({ tipo: 'explicacao', resposta: 'porque sim', estrutura: { conjuntos: [{ nome: 'A' }] } }).estrutura).toBeNull();
  });
});
