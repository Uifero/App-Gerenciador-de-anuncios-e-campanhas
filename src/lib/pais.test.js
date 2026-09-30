// País / mercado do cliente: padrão Brasil (inclusive cliente antigo sem o campo) e moeda de cada país.
import { describe, it, expect } from 'vitest';
import { paisDoCliente, infoPais, descreverMercado, simboloDoCliente, chavePais } from './pais.js';

describe('país / mercado do cliente', () => {
  it('cliente antigo sem o campo (ou vazio) é tratado como Brasil', () => {
    expect(paisDoCliente({})).toBe('Brasil');
    expect(paisDoCliente({ pais: '   ' })).toBe('Brasil');
    expect(paisDoCliente(null)).toBe('Brasil');
    expect(simboloDoCliente({})).toBe('R$');
  });

  it('reconhece países da lista sem ligar para acento/maiúscula e apelidos comuns', () => {
    expect(infoPais('mexico')).toMatchObject({ nome: 'México', iso: 'MX', moeda: 'MXN' });
    expect(infoPais('EUA')).toMatchObject({ nome: 'Estados Unidos', moeda: 'USD', simbolo: 'US$' });
    expect(chavePais({ pais: 'EUA' })).toBe(chavePais({ pais: 'Estados Unidos' }));
    expect(chavePais({})).toBe(chavePais({ pais: 'brasil' }));
  });

  it('país fora da lista não tem moeda presumida', () => {
    expect(infoPais('Japão')).toBeNull();
    expect(simboloDoCliente({ pais: 'Japão' })).toBe('moeda local');
    expect(descreverMercado({ pais: 'Japão' })).toMatch(/Japão \(moeda local/);
    expect(descreverMercado({ pais: 'Portugal' })).toBe('Portugal (moeda: EUR, €)');
  });
});
