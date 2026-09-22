// Testes da lógica de custo e roteamento de modelo/tarefa do servidor de IA (sem rede: só as funções puras exportadas).
import { describe, it, expect } from 'vitest';
import { TAREFAS, calcularCusto, paramsDoModelo } from './index.js';

describe('TAREFAS', () => {
  it('toda tarefa tem modelo e limite de tokens de saída', () => {
    for (const [nome, t] of Object.entries(TAREFAS)) {
      expect(t.modelo, `tarefa ${nome} sem modelo`).toBeTruthy();
      expect(t.max, `tarefa ${nome} sem max`).toBeGreaterThan(0);
    }
  });

  it('tarefas simples usam o modelo leve; tarefas complexas usam o modelo completo', () => {
    expect(TAREFAS.hooks.modelo).toBe(TAREFAS.checklist.modelo);
    expect(TAREFAS.criativos.modelo).toBe(TAREFAS.campanha.modelo);
    expect(TAREFAS.hooks.modelo).not.toBe(TAREFAS.criativos.modelo);
  });

  it('só a tarefa de referências (busca de mercado) pede busca web', () => {
    expect(TAREFAS.referencias.web).toBe(true);
    expect(TAREFAS.criativos.web).toBeFalsy();
    expect(TAREFAS.campanha.web).toBeFalsy();
  });
});

describe('calcularCusto', () => {
  const semUso = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };

  it('zero de uso custa zero', () => {
    expect(calcularCusto('claude-haiku-4-5', semUso)).toBe(0);
  });

  it('Sonnet custa mais que Haiku para o mesmo uso (entrada e saída mais caras)', () => {
    const uso = { entrada: 100_000, saida: 10_000, cacheEscrita: 0, cacheLeitura: 0 };
    const haiku = calcularCusto('claude-haiku-4-5', uso);
    const sonnet = calcularCusto('claude-sonnet-5', uso);
    expect(sonnet).toBeGreaterThan(haiku);
  });

  it('calcula o valor exato pela tabela de preços (Sonnet: entrada 2, saída 10 por 1M)', () => {
    const uso = { entrada: 1_000_000, saida: 1_000_000, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('claude-sonnet-5', uso)).toBeCloseTo(2 + 10, 6);
  });

  it('tokens de leitura do cache custam 10% do preço de entrada', () => {
    const comCache = calcularCusto('claude-sonnet-5', { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 1_000_000 });
    const semCache = calcularCusto('claude-sonnet-5', { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 });
    expect(comCache).toBeCloseTo(semCache * 0.1, 6);
  });

  it('tokens de escrita do cache custam 1,25x o preço de entrada', () => {
    const escrita = calcularCusto('claude-sonnet-5', { entrada: 0, saida: 0, cacheEscrita: 1_000_000, cacheLeitura: 0 });
    const normal = calcularCusto('claude-sonnet-5', { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 });
    expect(escrita).toBeCloseTo(normal * 1.25, 6);
  });

  it('soma o custo de buscas web (US$ 0,01 cada)', () => {
    const custo = calcularCusto('claude-sonnet-5', { ...semUso, buscasWeb: 3 });
    expect(custo).toBeCloseTo(0.03, 6);
  });

  it('reconhece a família do modelo pelo nome (opus cai na tabela de opus)', () => {
    const uso = { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('claude-opus-4', uso)).toBeCloseTo(5, 6);
  });

  it('modelo desconhecido cai na tabela do Sonnet (padrão)', () => {
    const uso = { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('modelo-futuro-xyz', uso)).toBeCloseTo(2, 6);
  });
});

describe('paramsDoModelo', () => {
  it('Haiku não recebe thinking nem effort (a API rejeita esses parâmetros no Haiku 4.5)', () => {
    expect(paramsDoModelo('claude-haiku-4-5', { effort: 'medium' })).toEqual({});
  });

  it('Sonnet recebe thinking adaptativo e o effort da tarefa', () => {
    const p = paramsDoModelo('claude-sonnet-5', { effort: 'low' });
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.output_config).toEqual({ effort: 'low' });
  });

  it('Sonnet sem effort definido usa "medium" como padrão', () => {
    const p = paramsDoModelo('claude-sonnet-5', {});
    expect(p.output_config.effort).toBe('medium');
  });
});
