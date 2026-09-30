// "Modelos de Prompt": biblioteca completa e bem formada, preenchimento manual/cadastro/IA sem inventar marcador.
import { describe, it, expect } from 'vitest';
import { CATEGORIAS_MODELO, MODELOS_PROMPT, MARCADORES, marcadoresDe, preencherModelo, valoresDoCadastro, valoresDaIa, modeloPorId } from './modelos-prompt.js';

describe('biblioteca', () => {
  it('tem os 15 modelos pedidos, nas 4 categorias, cada um com envie, resultado, inglês e português', () => {
    expect(MODELOS_PROMPT).toHaveLength(15);
    expect(CATEGORIAS_MODELO.map(([k]) => MODELOS_PROMPT.filter((m) => m.categoria === k).length)).toEqual([3, 3, 5, 4]);
    for (const m of MODELOS_PROMPT) {
      expect(m.envie && m.resultado && m.en && m.pt).toBeTruthy();
      expect(new Set(MODELOS_PROMPT.map((x) => x.id)).size).toBe(15);
      // mesmos marcadores no inglês e no português, e todos com explicação para o campo da tela
      expect(m.en.match(/\[[^\]]+\]/g)?.sort()).toEqual(m.pt.match(/\[[^\]]+\]/g)?.sort());
      for (const k of marcadoresDe(m)) expect(MARCADORES[k]).toBeTruthy();
    }
  });

  it('oferta De/Por traz os marcadores do enunciado', () => {
    expect(marcadoresDe(modeloPorId('oferta-de-por'))).toEqual(['[NOME DO PRODUTO]', '[PREÇO DE]', '[COR DE DESTAQUE]', '[PREÇO POR]']);
    expect(marcadoresDe(modeloPorId('pergunta-gancho'))).toContain('[CHAMADA PARA AÇÃO]');
  });
});

describe('preencherModelo', () => {
  const m = modeloPorId('oferta-de-por');
  it('valor digitado vale para os dois idiomas; o que falta continua entre colchetes', () => {
    const r = preencherModelo(m, { '[NOME DO PRODUTO]': 'Vela Lavanda', '[PREÇO POR]': 'R$ 49,90' });
    expect(r.en).toContain('photo of Vela Lavanda');
    expect(r.pt).toContain('como R$ 49,90');
    expect(r.faltam).toEqual(['[PREÇO DE]', '[COR DE DESTAQUE]']);
    expect(r.en).toContain('[COR DE DESTAQUE]');
  });
  it('valor {en, pt} vai para cada idioma', () => {
    const r = preencherModelo(m, { '[COR DE DESTAQUE]': { en: 'deep lavender purple', pt: 'roxo lavanda' } });
    expect(r.en).toContain('in deep lavender purple');
    expect(r.pt).toContain('em roxo lavanda');
  });
});

describe('valoresDoCadastro (sem IA)', () => {
  it('usa produto, promoção, diferencial, cor, CTA e os outros produtos', () => {
    const v = valoresDoCadastro({
      cliente: { marca: { usp: 'cera de soja' } }, produto: { id: 'a', nome: 'Vela Lavanda', preco: 59.9, precoPromocional: 49.9 },
      produtos: [{ id: 'a', nome: 'Vela Lavanda' }, { id: 'b', nome: 'Vela Baunilha' }], corMarca: '#7c3aed', criativo: { cta: 'Compre agora' },
    });
    expect(v).toEqual({ '[NOME DO PRODUTO]': 'Vela Lavanda', '[PREÇO DE]': 'R$ 59,90', '[PREÇO POR]': 'R$ 49,90', '[DIFERENCIAL]': 'cera de soja', '[COR DE DESTAQUE]': '#7c3aed', '[CHAMADA PARA AÇÃO]': 'Compre agora', '[OUTROS PRODUTOS DA MESMA COLEÇÃO]': 'Vela Baunilha' });
  });
  it('sem promoção não inventa preço antigo; sem dado, não preenche', () => {
    const v = valoresDoCadastro({ cliente: {}, produto: { nome: 'X', preco: 10 } });
    expect(v['[PREÇO DE]']).toBeUndefined();
    expect(v['[PREÇO POR]']).toBe('R$ 10,00');
    expect(valoresDoCadastro({ cliente: {} })).toEqual({});
  });
});

describe('valoresDaIa', () => {
  const m = modeloPorId('pergunta-gancho');
  it('só aceita marcadores do modelo; texto da imagem fica em português nos dois idiomas', () => {
    const v = valoresDaIa(m, { valores: {
      '[NOME DO PRODUTO]': { en: 'Lavender Candle', pt: 'Vela Lavanda' }, 'COR DE DESTAQUE': { en: 'lavender purple', pt: 'roxo lavanda' },
      '[CHAMADA PARA AÇÃO]': 'Quero a minha', '[PREÇO POR]': 'R$ 1', '[EX.: PERGUNTA-GANCHO]': { en: '', pt: '' },
    } });
    expect(v['[NOME DO PRODUTO]']).toBe('Vela Lavanda');
    expect(v['[COR DE DESTAQUE]']).toEqual({ en: 'lavender purple', pt: 'roxo lavanda' });
    expect(v['[CHAMADA PARA AÇÃO]']).toBe('Quero a minha');
    expect(v['[PREÇO POR]']).toBeUndefined(); // não é marcador deste modelo
    expect(v['[EX.: PERGUNTA-GANCHO]']).toBeUndefined(); // vazio não entra
  });
});
