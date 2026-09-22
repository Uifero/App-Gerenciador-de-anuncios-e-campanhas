// Teste do resumo de produto usado para prefixar o briefing ao gerar um criativo (item "produto sincronizado").
import { describe, it, expect } from 'vitest';
import { resumoProduto } from './criativos.js';

describe('resumoProduto', () => {
  it('junta nome, categoria, preço e descrição quando presentes', () => {
    const p = { nome: 'Legging Power', categoria: 'Fitness', preco: 129.9, descricao: 'Tecido que não fica transparente' };
    expect(resumoProduto(p)).toBe('Legging Power — (Fitness) — R$ 129.9 — Tecido que não fica transparente');
  });

  it('omite os campos vazios sem deixar separadores soltos', () => {
    expect(resumoProduto({ nome: 'Legging Power' })).toBe('Legging Power');
  });
});
