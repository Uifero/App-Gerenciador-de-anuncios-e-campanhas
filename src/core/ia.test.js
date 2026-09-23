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
