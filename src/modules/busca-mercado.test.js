// Testes das regras da busca de mercado do primeiro uso (quando roda sozinha e quando só pergunta).
import { describe, it, expect } from 'vitest';
import { deveBuscarAutomatico, podePerguntar, iniciouBusca, terminouBusca } from './busca-mercado.js';

const novo = (extra = {}) => ({ id: 'c1', nicho: 'moda fitness', buscaMercadoFeita: false, escopo: { referencias: true }, ...extra });

describe('deveBuscarAutomatico', () => {
  it('roda sozinha só para cliente recém-criado (false), com nicho e com a aba Referências', () => {
    expect(deveBuscarAutomatico(novo())).toBe(true);
  });
  it('não roda de novo depois da primeira busca', () => {
    expect(deveBuscarAutomatico(novo({ buscaMercadoFeita: true }))).toBe(false);
  });
  it('não roda para clientes antigos (campo inexistente), sem nicho ou sem a aba Referências no escopo', () => {
    expect(deveBuscarAutomatico(novo({ buscaMercadoFeita: undefined }))).toBe(false);
    expect(deveBuscarAutomatico(novo({ nicho: '  ' }))).toBe(false);
    expect(deveBuscarAutomatico(novo({ escopo: { referencias: false, criativos: true } }))).toBe(false);
  });
  it('sem escopo salvo usa o padrão (que inclui Referências)', () => {
    expect(deveBuscarAutomatico(novo({ escopo: undefined }))).toBe(true);
  });
});

describe('podePerguntar ("Buscar novos exemplos de mercado agora?")', () => {
  it('pergunta uma vez por sessão', () => {
    expect(podePerguntar(novo({ buscaMercadoFeita: true }), false)).toBe(true);
    expect(podePerguntar(novo({ buscaMercadoFeita: true }), true)).toBe(false);
  });
  it('não pergunta sem a aba Referências nem enquanto a busca inicial está rodando', () => {
    expect(podePerguntar(novo({ escopo: { referencias: false } }), false)).toBe(false);
    iniciouBusca('c1');
    expect(podePerguntar(novo(), false)).toBe(false);
    terminouBusca('c1');
    expect(podePerguntar(novo(), false)).toBe(true);
  });
});
