// Alegação de saúde em CRIATIVO é só informação (decisão do operador): nada bloqueia o salvar, a nota amarela aparece
// depois e o selo "Risco Meta" fica no cartão até o texto ficar limpo. Nome da marca e dos produtos nunca conta (criativo
// e site). Sem IA real: tudo local, com os dados do Thermora de produção.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cliente, produtos } from './fixtures/thermora-producao.js';
import {
  alertaSaude, seloRiscoMeta, achadosSaude, achadosSaudeSite, lembrarNomesProtegidos, esquecerNomesProtegidos, textoDoCriativo,
} from '../src/lib/saude.js';
import { propostaDeMudanca, motivoBloqueioTexto } from '../src/lib/aplicar-especialista.js';
import { conferirPlano } from '../src/lib/animacoes.js';
import { motivoGancho } from '../src/lib/ganchos.js';

vi.mock('../src/core/storage.js', () => ({ db: {}, COL: {} }));
vi.mock('../src/core/auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('../src/modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../src/modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));
const { motivoBloqueio } = await import('../src/modules/aprovacao.js');
const { CHECKLIST_QUALIDADE } = await import('../src/lib/constantes.js');

const checklist = Object.fromEntries(CHECKLIST_QUALIDADE.map(([k]) => [k, true]));
const NOTA = (t) => `Aviso: este texto tem alegação de saúde ("${t}"). O Meta pode reprovar o anúncio.`;
const ALTO = ' Risco alto; reprovações repetidas podem restringir a conta de anúncios.';

beforeEach(() => esquecerNomesProtegidos());

describe('nome do produto/marca não é alegação', () => {
  it('"Thermora Metabolic Formula" sozinho não dá aviso (produtos passados ou lembrados da lista)', () => {
    expect(alertaSaude('Thermora Metabolic Formula', cliente, produtos)).toBeNull();
    expect(alertaSaude('Thermora Metabolic Formula', cliente)).not.toBeNull(); // sem saber o nome, "Metabolic" contaria
    lembrarNomesProtegidos(produtos); // o que core/storage.js faz ao listar a coleção de produtos
    expect(alertaSaude('Conheça o Thermora Metabolic Formula: 60 cápsulas', cliente)).toBeNull();
    expect(alertaSaude('Thermora Metabolic em promoção', cliente)).toBeNull(); // começo do nome com 2+ palavras
    expect(seloRiscoMeta('Thermora Metabolic Formula', cliente)).toBe('');
  });
  it('só o que está em volta do nome conta', () => {
    lembrarNomesProtegidos(produtos);
    expect(alertaSaude('Thermora Metabolic Formula acelera o metabolismo', cliente).nota).toBe(NOTA('acelera o metabolismo'));
  });
  it('site: mesmo conserto (nome do produto não vira aviso; a alegação em volta sim)', () => {
    expect(achadosSaudeSite('Thermora Metabolic Formula', cliente, produtos)).toEqual([]);
    expect(achadosSaudeSite('Thermora Metabolic Formula acelera o metabolismo', cliente, produtos)).toEqual(['metabolismo']);
    lembrarNomesProtegidos(produtos);
    expect(achadosSaudeSite('Thermora Metabolic Formula')).toEqual([]); // conferência do plano sem o cliente
    expect(achadosSaude('Thermora Metabolic Formula')).toEqual([]);
  });
});

describe('nota amarela e selo "Risco Meta"', () => {
  beforeEach(() => lembrarNomesProtegidos(produtos));
  it('"acelera o metabolismo": salva, nota e selo', () => {
    const c = { hook: 'Thermora Metabolic Formula acelera o metabolismo', copy: 'Uma cápsula de manhã.', cta: 'Conheça' };
    expect(alertaSaude(textoDoCriativo(c), cliente)).toMatchObject({ altoRisco: false, nota: NOTA('acelera o metabolismo') });
    const selo = seloRiscoMeta(textoDoCriativo(c), cliente);
    expect(selo).toContain('data-risco-meta');
    expect(selo).toContain('Risco Meta');
    expect(selo).toContain('&quot;acelera o metabolismo&quot;');
  });
  it('selo some quando o texto é editado e fica sem alegação', () => {
    const editado = { hook: 'Thermora Metabolic Formula: 60 cápsulas por R$ 147', copy: 'Uma cápsula de manhã, com o café.', cta: 'Conheça' };
    expect(seloRiscoMeta(textoDoCriativo(editado), cliente)).toBe('');
  });
  it('resultado no corpo (kg, medidas, antes e depois, emagrecimento, corpo) ganha a linha de risco alto', () => {
    expect(alertaSaude('Perdi 3 kg em um mês', cliente).nota).toBe(NOTA('perdi 3 kg') + ALTO);
    expect(alertaSaude('Veja o antes e depois', cliente).nota).toBe(NOTA('veja o antes e depois') + ALTO);
    expect(alertaSaude('Ajuda a emagrecer rápido', cliente).altoRisco).toBe(true);
    expect(alertaSaude('Seu corpo pede mais', cliente).altoRisco).toBe(true);
    expect(alertaSaude('Mais energia o dia todo', cliente).altoRisco).toBe(false);
  });
  it('cliente que não é de saúde: nada', () => {
    expect(alertaSaude('Acelera o metabolismo', { nome: 'Loja', marca: { produtoSaude: false } })).toBeNull();
  });
});

describe('todo caminho de salvar criativo salva sem bloquear', () => {
  const texto = { hook: 'Perdi 3 kg e acelerou o metabolismo', copy: 'Antes e depois em 30 dias.', cta: 'Compre' };
  it('Especialistas "Aplicar" / "Aplicar no gancho" / "Aplicar as selecionadas" e "Parece anúncio?" (propostaDeMudanca)', () => {
    const p = propostaDeMudanca({ hook: 'a', copy: 'b', cta: 'c' }, texto, cliente);
    expect(p.bloqueio).toBe('');
    expect(p.alerta.altoRisco).toBe(true);
    expect(motivoBloqueioTexto(texto, cliente, 37)).toBe('');
  });
  it('animações: grava (sem bloqueio) e traz o alerta', () => {
    const c = conferirPlano({ preset: 'kinetic', duracao: 4, cenas: [{ texto: texto.hook, dur: 2, tipo: 'fala' }] }, { cliente });
    expect(c.bloqueio).toBe('');
    expect(c.alerta.nota).toContain('Risco alto');
  });
  it('hooks, aprovação e detalhe: gancho e envio não barram por saúde (colchete continua barrando)', () => {
    expect(motivoGancho({ ...texto, modeloGancho: 37 }, cliente)).toBe('');
    expect(motivoBloqueio({ ...texto, checklist }, cliente)).toBeNull();
    expect(motivoGancho({ hook: 'Eu testei [produto]' }, cliente)).toMatch(/colchete/);
  });
});
