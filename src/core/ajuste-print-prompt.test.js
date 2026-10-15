// "Apontar no site" e "Anexar print" na IA: o print vai com a tarefa própria (Haiku com visão, custo da imagem separado)
// junto com a lista de elementos do site; o ajuste (2ª etapa) nunca recebe a imagem e só aceita operações da seção.
// IA simulada com as respostas reais gravadas em tests/fixtures/ia/ (print-mapeamento e apontar-outro, 2026-10-15).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('./auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('../modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));

const { entenderAjuste, ajustarSecoes } = await import('./ia.js');
const { listaElementos } = await import('../lib/elementos-site.js');
const fx = (n) => JSON.parse(readFileSync(`tests/fixtures/ia/${n}.json`, 'utf8')).texto;

let pedidos = [];
const responder = (texto) => vi.stubGlobal('fetch', vi.fn(async (_u, o) => {
  pedidos.push(JSON.parse(o.body));
  return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ texto }) };
}));
beforeEach(() => { pedidos = []; });

const cliente = { id: 'cliT', nome: 'Thermora', nicho: 'suplementos', marca: { produtoSaude: true } };
const estado = { conteudo: { heroTitulo: 'Thermora: sua rotina com mais foco', heroSubtitulo: 'Cápsulas com cafeína e chá verde, para o seu dia começar com mais foco', faq: [{ p: 'Como tomar?', r: 'Duas.' }], storytelling: 'A Thermora nasceu em 2021.' }, config: {}, layout: {} };

describe('print com marcas', () => {
  it('vai na tarefa ajuste_entender_print, com a imagem e a lista de elementos; a marca vira elemento que existe', async () => {
    responder(fx('print-mapeamento-thermora-real'));
    const elementos = listaElementos(['hero', 'produto', 'faq', 'rodape'], estado, {});
    const r = await entenderAjuste({ cliente, modo: 'custom', mensagem: 'tira isso daqui', imagens: [{ media_type: 'image/jpeg', data: 'QUJD' }], elementos });
    const [p] = pedidos;
    expect(p.tarefa).toBe('ajuste_entender_print');
    expect(p.imagens).toEqual([{ media_type: 'image/jpeg', data: 'QUJD' }]);
    expect(p.messages[0].content).toContain('produto.frete: Página do produto › selo de frete');
    expect(p.messages[0].content).toMatch(/Você marcou o selo de frete ou o preço\?/);
    expect(p.messages[0].content).toMatch(/nunca texto, logo ou imagem dele/);
    expect(r.secoes).toEqual([{ id: 'produto', nome: 'Página do produto', oque: 'Some o botão de compra "Adicionar ao carrinho" da página do produto.', estrutura: true, elementos: ['produto.botao'] }]);
  });
  it('sem print: o "Entendi assim" de sempre (sem imagem, tarefa mais barata)', async () => {
    responder('{"global":false,"secoes":[{"id":"hero","oque":"x"}],"perguntas":[],"fora":[]}');
    await entenderAjuste({ cliente, modo: 'custom', mensagem: 'deixa o banner mais curto' });
    expect(pedidos[0].tarefa).toBe('ajuste_entender');
    expect(pedidos[0].imagens).toBeUndefined();
  });
});

describe('"Outro: escrever" num elemento', () => {
  it('a IA recebe só a seção, o id do elemento e a lista dos elementos; nunca a imagem; operação fora é recusada', async () => {
    const real = JSON.parse(fx('apontar-outro-thermora-real'));
    responder(JSON.stringify({ ...real, operacoes: [...real.operacoes, { op: 'elemento', id: 'faq', acao: 'espaco', passo: 1 }] }));
    const r = await ajustarSecoes({ cliente, modo: 'custom', site: {}, estado, secoes: ['hero'], instrucao: 'No elemento "Banner › subtítulo" (id hero.subtitulo): deixa esse subtítulo mais curto e direto, sem mudar o sentido' });
    const [p] = pedidos;
    expect(p.tarefa).toBe('ajuste_secao');
    expect(p.imagens).toBeUndefined();
    expect(p.messages[0].content).toContain('hero.subtitulo: Banner › subtítulo');
    expect(p.messages[0].content).toMatch(/\{"op":"elemento","id":ID,"acao":"espaco","passo":-1\|1\}/);
    expect(p.messages[0].content).not.toContain('A Thermora nasceu');
    expect(r.operacoes).toEqual(real.operacoes);
    expect(r.foraDasSecoes[0].motivo).toMatch(/Recusado: mexeria em "Perguntas frequentes"/);
  });
});
