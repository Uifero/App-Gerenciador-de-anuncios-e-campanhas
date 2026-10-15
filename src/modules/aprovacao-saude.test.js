// Regra de saúde no envio ao cliente: alegação de saúde em criativo é só informação (decisão do operador). O criativo
// vai para o link de aprovação normalmente; o que continua barrando é checklist, termo proibido e colchete.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../core/storage.js', () => ({ db: {}, COL: {} }));
vi.mock('../core/auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('./configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('./custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));

const { motivoBloqueio } = await import('./aprovacao.js');
const { CHECKLIST_QUALIDADE } = await import('../lib/constantes.js');

const checklist = Object.fromEntries(CHECKLIST_QUALIDADE.map(([k]) => [k, true]));
const thermora = { id: 't', nome: 'Thermora', marca: { produtoSaude: true } };
const moda = { id: 'm', nome: 'Loja', marca: { produtoSaude: false } };
const criativo = (hook) => ({ hook, copy: 'Uma cápsula de manhã, junto com o café.', cta: 'Conheça a fórmula', checklist });

describe('motivoBloqueio com a regra de saúde', () => {
  it('as 4 frases de produção vão para o cliente (alegação de saúde não bloqueia)', () => {
    for (const hook of ['Você sabia que guaraná e cafeína juntos têm esse efeito no metabolismo?', 'Tomar só cafeína pra ter energia? Você está fazendo isso errado', 'Seu corpo pede mais que isso', 'Se você termina o dia sem energia, presta atenção nisso']) {
      expect(motivoBloqueio(criativo(hook), thermora)).toBeNull();
    }
  });
  it('composição real passa; cliente que não é de saúde não é afetado', () => {
    expect(motivoBloqueio(criativo('5 ativos em 60 cápsulas'), thermora)).toBeNull();
    expect(motivoBloqueio(criativo('Laranja moro, cafeína e guaraná na mesma fórmula'), thermora)).toBeNull();
    expect(motivoBloqueio(criativo('Seu corpo pede mais que isso'), moda)).toBeNull();
  });
  it('resultado no corpo também não bloqueia; colchete continua bloqueando', () => {
    expect(motivoBloqueio(criativo('Perdi 3 kg em um mês'), thermora)).toBeNull();
    expect(motivoBloqueio(criativo('Eu testei [produto]'), thermora)).toMatch(/colchete/);
  });
});
