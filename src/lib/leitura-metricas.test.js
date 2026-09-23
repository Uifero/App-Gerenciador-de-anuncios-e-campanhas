// Testes da leitura de métricas (bom/médio/ruim) e da lista fixa de ferramentas externas de IA.
import { describe, it, expect } from 'vitest';
import { lerRoas, lerCtr, lerCpa } from './leitura-metricas.js';
import { FERRAMENTAS_IA, AVISO_LIMITES, htmlFerramentas } from './ferramentas-ia.js';

describe('lerRoas', () => {
  it('sem valor não opina', () => { expect(lerRoas(null)).toBeNull(); expect(lerRoas('')).toBeNull(); expect(lerRoas('abc')).toBeNull(); });
  it('usa as referências gerais quando o cliente não tem meta', () => {
    expect(lerRoas(0.7).nivel).toBe('ruim');
    expect(lerRoas(0.7).texto).toMatch(/prejuízo/);
    expect(lerRoas(1.5).nivel).toBe('medio');
    expect(lerRoas(2.5).nivel).toBe('medio');
    expect(lerRoas(3).nivel).toBe('bom');
  });
  it('a meta do cliente vale mais que a referência geral', () => {
    expect(lerRoas(3.5, 4).nivel).toBe('medio'); // "bom" no geral, mas abaixo da meta 4x
    expect(lerRoas(2, 4).nivel).toBe('ruim');
    expect(lerRoas(4.2, 4).nivel).toBe('bom');
  });
});

describe('lerCtr', () => {
  it('classifica em relação à média do mercado (~1%)', () => {
    expect(lerCtr(0.5).nivel).toBe('ruim');
    expect(lerCtr(1).nivel).toBe('medio');
    expect(lerCtr(2).nivel).toBe('bom');
    expect(lerCtr(undefined)).toBeNull();
  });
});

describe('lerCpa', () => {
  it('sem meta não julga, só explica como comparar', () => {
    const r = lerCpa(40);
    expect(r.nivel).toBeNull();
    expect(r.texto).toMatch(/lucro por venda/);
  });
  it('com meta: dentro, até 20% acima, acima', () => {
    expect(lerCpa(38, 40).nivel).toBe('bom');
    expect(lerCpa(46, 40).nivel).toBe('medio');
    expect(lerCpa(60, 40).nivel).toBe('ruim');
  });
});

describe('ferramentas externas de IA', () => {
  it('tem as 4 de imagem e as 3 de vídeo pedidas, todas com link https', () => {
    expect(FERRAMENTAS_IA.imagem.map((f) => f.nome)).toEqual(['Google Gemini', 'ChatGPT', 'Ideogram', 'Microsoft Designer / Bing Image Creator']);
    expect(FERRAMENTAS_IA.video.map((f) => f.nome)).toEqual(['Luma Dream Machine', 'Kling AI', 'Pika']);
    for (const f of [...FERRAMENTAS_IA.imagem, ...FERRAMENTAS_IA.video]) expect(f.url).toMatch(/^https:\/\//);
  });
  it('o HTML traz o título, o aviso fixo de limites e só os grupos pedidos', () => {
    const so = htmlFerramentas({ grupos: ['video'], titulo: 'Cole esse prompt numa dessas ferramentas:' });
    expect(so).toContain('Cole esse prompt numa dessas ferramentas:');
    expect(so).toContain(AVISO_LIMITES);
    expect(so).toContain('Kling AI');
    expect(so).not.toContain('Ideogram');
    expect(htmlFerramentas()).toContain('Ideogram');
  });
});
