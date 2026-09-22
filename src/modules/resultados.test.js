// Testes da atribuição temporal: qual versão do criativo estava ativa na data de um resultado.
import { describe, it, expect } from 'vitest';
import { versaoAtivaEm } from './resultados.js';

const v = (n, quando, extra = {}) => ({ n, quando, hook: 'h' + n, ...extra });

describe('versaoAtivaEm', () => {
  it('sem versões, devolve null', () => {
    expect(versaoAtivaEm({ versoes: [] }, '2026-09-20')).toBeNull();
    expect(versaoAtivaEm({}, '2026-09-20')).toBeNull();
  });

  it('sem data, devolve null', () => {
    expect(versaoAtivaEm({ versoes: [v(1, '2026-09-01T10:00:00Z')] }, null)).toBeNull();
  });

  it('uma única versão sempre é a ativa', () => {
    const c = { versoes: [v(1, '2026-09-10T10:00:00Z', { angulo: 'dor' })] };
    expect(versaoAtivaEm(c, '2026-09-20').angulo).toBe('dor');
    expect(versaoAtivaEm(c, '2026-01-01').angulo).toBe('dor'); // resultado anterior à 1ª versão: usa a mais antiga mesmo assim
  });

  it('escolhe a última versão criada ANTES ou NO dia do resultado', () => {
    const c = {
      versoes: [
        v(1, '2026-09-01T10:00:00Z', { angulo: 'dor' }),
        v(2, '2026-09-10T10:00:00Z', { angulo: 'economia' }),
        v(3, '2026-09-20T10:00:00Z', { angulo: 'curiosidade' }),
      ],
    };
    expect(versaoAtivaEm(c, '2026-09-05').angulo).toBe('dor'); // entre v1 e v2: v1 estava ativa
    expect(versaoAtivaEm(c, '2026-09-15').angulo).toBe('economia'); // entre v2 e v3: v2 estava ativa
    expect(versaoAtivaEm(c, '2026-09-25').angulo).toBe('curiosidade'); // depois de v3: v3 está ativa
  });

  it('resultado no MESMO DIA em que uma versão foi criada considera essa versão já ativa', () => {
    const c = { versoes: [v(1, '2026-09-10T08:00:00Z', { angulo: 'dor' }), v(2, '2026-09-10T20:00:00Z', { angulo: 'economia' })] };
    expect(versaoAtivaEm(c, '2026-09-10').angulo).toBe('economia'); // a versão mais recente DENTRO do dia vence
  });

  it('funciona mesmo se as versões não vierem ordenadas no array', () => {
    const c = { versoes: [v(3, '2026-09-20T10:00:00Z', { angulo: 'c' }), v(1, '2026-09-01T10:00:00Z', { angulo: 'a' }), v(2, '2026-09-10T10:00:00Z', { angulo: 'b' })] };
    expect(versaoAtivaEm(c, '2026-09-15').angulo).toBe('b');
  });
});
