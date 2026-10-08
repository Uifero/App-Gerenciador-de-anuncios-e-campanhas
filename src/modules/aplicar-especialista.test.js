// "Aplicar" do especialista: preparar a reescrita não grava nada; só "Aceitar" grava a nova versão (a anterior fica
// no histórico); reescrita com promessa de saúde é bloqueada e não é salva; o status vai para a consulta.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const gravados = [];
vi.mock('../core/storage.js', () => ({
  COL: { criativos: 'criativos', analises: 'analises', tarefas: 'tarefas' },
  db: { atualizar: vi.fn(async (col, id, patch) => { gravados.push({ col, id, patch }); }) },
}));
vi.mock('../core/ia.js', () => ({ refinarCriativo: vi.fn() }));
vi.mock('./estudio.js', () => ({ abrirEstudio: vi.fn() }));
vi.mock('./produtos.js', () => ({ abrirProduto: vi.fn() }));
vi.mock('../core/ui.js', () => ({ esc: (s) => String(s), $: () => null, on: () => {}, ocupado: async (_b, fn) => fn(), toast: () => {}, tag: (t) => t, mostrarResultado: () => {}, fecharModais: () => {} }));

const { prepararReescrita, aceitarReescrita, registrarAplicacao } = await import('./aplicar-especialista.js');

const thermora = { id: 'cliT', nicho: 'suplementos', marca: { produtoSaude: true } };
const novo = () => ({ id: 'cr1', hook: 'Testei uma cápsula de manhã por 30 dias.', copy: 'Cena 1: cozinha.', cta: 'Chama no WhatsApp', modeloGancho: 37, versoes: [{ n: 1, hook: 'Testei uma cápsula de manhã por 30 dias.' }] });
const acao = { acao: 'Trazer a objeção do medo de acelerar para o gancho', tipo: 'hook' };

beforeEach(() => { gravados.length = 0; });

describe('preparar x aceitar', () => {
  it('preparar chama a IA uma vez e não grava nada', async () => {
    const refinar = vi.fn(async () => ({ hook: 'Medo de acelerar? Testei 1 cápsula por 30 dias.', copy: 'Cena 1: cozinha.', cta: 'Chama no WhatsApp', explicacao: 'Objeção no gancho.' }));
    const c = novo();
    const p = await prepararReescrita({ cliente: thermora, criativo: c, acao, tipo: 'hook', refinar });
    expect(refinar).toHaveBeenCalledTimes(1);
    expect(refinar.mock.calls[0][0].instrucao).toMatch(/SÓ esta mudança/);
    expect(p.campos).toEqual(['hook']);
    expect(p.bloqueio).toBe('');
    expect(gravados).toHaveLength(0);
    expect(c.hook).toBe('Testei uma cápsula de manhã por 30 dias.');
  });
  it('aceitar grava a nova versão e mantém a anterior no histórico', async () => {
    const c = novo();
    const p = await prepararReescrita({ cliente: thermora, criativo: c, acao, tipo: 'hook', refinar: async () => ({ hook: 'Medo de acelerar? Testei 1 cápsula por 30 dias.' }) });
    const { versao } = await aceitarReescrita({ cliente: thermora, criativo: c, proposta: p, nota: 'Especialista (Copy): x' });
    expect(versao).toBe(2);
    expect(gravados).toHaveLength(1);
    expect(gravados[0]).toMatchObject({ col: 'criativos', id: 'cr1' });
    expect(gravados[0].patch.versoes.map((v) => v.hook)).toEqual(['Testei uma cápsula de manhã por 30 dias.', 'Medo de acelerar? Testei 1 cápsula por 30 dias.']);
    expect(c.hook).toBe('Medo de acelerar? Testei 1 cápsula por 30 dias.');
  });
  it('reescrita que cria promessa de saúde: bloqueada e não salva', async () => {
    const c = novo();
    const p = await prepararReescrita({ cliente: thermora, criativo: c, acao, tipo: 'hook', refinar: async () => ({ hook: 'Testei por 30 dias e senti mais energia e o metabolismo acelerado.' }) });
    expect(p.bloqueio).toMatch(/metabolismo|energia/);
    await expect(aceitarReescrita({ cliente: thermora, criativo: c, proposta: p, nota: 'x' })).rejects.toThrow(/Não dá para salvar/);
    expect(gravados).toHaveLength(0);
    expect(c.versoes).toHaveLength(1);
  });
  it('proposta sem mudança não grava', async () => {
    const c = novo();
    const p = await prepararReescrita({ cliente: thermora, criativo: c, acao, tipo: 'hook', refinar: async () => ({}) });
    await expect(aceitarReescrita({ cliente: thermora, criativo: c, proposta: p, nota: 'x' })).rejects.toThrow(/nada a salvar/);
    expect(gravados).toHaveLength(0);
  });
});

describe('registro na consulta', () => {
  it('guarda status, versão e a ação na consulta', async () => {
    const consulta = { id: 'an1', resultado: { acoes: [{ acao: 'A' }, { acao: 'B' }] }, aplicacoes: { 1: { status: 'descartada' } } };
    await registrarAplicacao(consulta, 0, { status: 'aceita', criativoId: 'cr1', versao: 2 });
    expect(gravados[0]).toMatchObject({ col: 'analises', id: 'an1' });
    expect(gravados[0].patch.aplicacoes[0]).toMatchObject({ status: 'aceita', versao: 2, acao: 'A' });
    expect(gravados[0].patch.aplicacoes[1]).toEqual({ status: 'descartada' });
  });
});
