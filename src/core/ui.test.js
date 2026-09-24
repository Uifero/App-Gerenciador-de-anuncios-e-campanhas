// dataBR: data sem hora (do <input type="date">) não pode "voltar um dia" por causa do fuso (bug visto em produção).
import { describe, it, expect } from 'vitest';
import { dataBR } from './ui.js';

describe('dataBR', () => {
  it('data sem hora sai exatamente como digitada, em qualquer fuso', () => {
    expect(dataBR('2026-09-24')).toBe('24/09/2026');
    expect(dataBR('2026-01-01')).toBe('01/01/2026');
  });
  it('vazio e inválido viram traço', () => {
    expect(dataBR('')).toBe('—');
    expect(dataBR('não é data')).toBe('—');
  });
});
