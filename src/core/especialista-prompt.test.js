// consultarEspecialista: tarefa por área, regras no pedido (sem pessoa real, sem inventar, regra de saúde) e aviso local
// de saúde. IA simulada com a resposta real gravada em tests/fixtures/ia/especialista-thermora-real.json.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('./auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('../modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));

const { consultarEspecialista } = await import('./ia.js');
const { especialistaPorId } = await import('../lib/especialistas.js');
const { REGRA_SAUDE } = await import('../lib/saude.js');

let pedidos = [];
const responder = (texto) => vi.stubGlobal('fetch', vi.fn(async (_u, o) => {
  pedidos.push(JSON.parse(o.body));
  return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ texto }) };
}));
const real = JSON.parse(readFileSync('tests/fixtures/ia/especialista-thermora-real.json', 'utf8')).texto;
const moda = { id: 'm', nome: 'Loja', nicho: 'moda fitness', marca: { produtoSaude: false } };
const thermora = { id: 't', nome: 'Thermora', nicho: 'suplementos', marca: { produtoSaude: true } };

beforeEach(() => { pedidos = []; });

describe('consultarEspecialista', () => {
  it('usa a tarefa da área, o contexto do cliente em cache e o pedido com critérios, item e pergunta', async () => {
    responder('{"resumo":"ok","pontos":[],"acoes":[{"acao":"a"}]}');
    await consultarEspecialista({ cliente: moda, especialista: especialistaPorId('escala'), alvo: { tipo: 'campanha', rotulo: 'Campanha' }, contexto: 'CAMPANHA "X"', pergunta: 'Escalo?' });
    const [p] = pedidos;
    expect(p.tarefa).toBe('especialista_trafego');
    expect(p.estavel).toContain('REGRAS CRÍTICAS');
    expect(p.system).toContain('o especialista em Escala de campanhas do app');
    expect(p.system).toMatch(/nunca diz ser uma pessoa real/);
    expect(p.system).toMatch(/Nunca invente número, preço, garantia, prazo, depoimento nem benchmark/);
    expect(p.system).not.toContain(REGRA_SAUDE);
    const pedido = p.messages[0].content;
    expect(pedido).toContain('CAMPANHA "X"');
    expect(pedido).toContain('PERGUNTA DO GESTOR: Escalo?');
    expect(pedido).toContain(especialistaPorId('escala').foco[0]);
    expect(pedido).toMatch(/"avaliacao": "ok"\|"ajustar"\|"falta_dado"/);
  });
  it('copy e oferta vão para as tarefas delas', async () => {
    responder('{"resumo":"ok"}');
    await consultarEspecialista({ cliente: moda, especialista: especialistaPorId('ganchos'), alvo: { tipo: 'criativo' } });
    await consultarEspecialista({ cliente: moda, especialista: especialistaPorId('whatsapp'), alvo: { tipo: 'livre' }, pergunta: 'p' });
    expect(pedidos.map((p) => p.tarefa)).toEqual(['especialista_copy', 'especialista_oferta']);
  });
  it('cliente de saúde: REGRA_SAUDE no pedido e aviso quando a SUGESTÃO tem kg ou antes e depois', async () => {
    responder('{"resumo":"Mostre o antes e depois","acoes":[{"acao":"Diga que perdeu 3 kg"}],"avisos":[]}');
    const r = await consultarEspecialista({ cliente: thermora, especialista: especialistaPorId('copy'), alvo: { tipo: 'criativo' } });
    expect(pedidos[0].system).toContain(REGRA_SAUDE);
    expect(r.avisos.at(-1)).toMatch(/^Produto de saúde: o Meta proíbe .*3 kg/);
  });
  it('não acusa quando o especialista só cita o proibido para dizer "não use" (avisos/pontos)', async () => {
    responder('{"resumo":"Bom.","pontos":[{"ponto":"Sem antes e depois","avaliacao":"ok"}],"acoes":[{"acao":"Manter"}],"avisos":["Não use antes e depois"]}');
    const r = await consultarEspecialista({ cliente: thermora, especialista: especialistaPorId('copy'), alvo: { tipo: 'criativo' } });
    expect(r.avisos).toEqual(['Não use antes e depois']);
  });
  it('resposta real gravada: normalizada e sem aviso falso de saúde', async () => {
    responder(real);
    const r = await consultarEspecialista({ cliente: thermora, especialista: especialistaPorId('copy'), alvo: { tipo: 'criativo' } });
    expect(r.acoes.length).toBeGreaterThan(0);
    expect(r.avisos.some((a) => a.startsWith('Produto de saúde: o Meta proíbe'))).toBe(false);
  });
});
