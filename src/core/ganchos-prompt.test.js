// Modelos de gancho nos pedidos de criativos e hooks: o que vai para a IA e como a resposta volta conferida.
// IA simulada com as respostas reais gravadas em tests/fixtures/ia/ganchos-*-real.json (sem chamada real aqui).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('./auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('../modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));

const { gerarCriativos, gerarHooks, acharTermosProibidos } = await import('./ia.js');
const { motivoGancho, temColchete } = await import('../lib/ganchos.js');

let pedidos = [];
const responder = (texto) => vi.stubGlobal('fetch', vi.fn(async (_u, o) => {
  pedidos.push(JSON.parse(o.body));
  return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ texto }) };
}));
const enviado = () => pedidos.map((p) => p.messages.map((m) => m.content).join('\n')).join('\n');
const fixture = (nome) => JSON.parse(readFileSync(`tests/fixtures/ia/${nome}`, 'utf8'));
const moda = { id: 'c1', nome: 'Loja', nicho: 'moda fitness', marca: { produtoSaude: false } };
const thermora = { id: 't', nome: 'Thermora', nicho: 'suplementos termogênicos', marca: { produtoSaude: true } };

beforeEach(() => { pedidos = []; });

describe('pedido de criativos e hooks', () => {
  it('criativos pedem modeloGancho, modelo diferente por variação e, com modelo escolhido, usam ele na 1ª', async () => {
    responder('[{"nome":"a","hook":"h","copy":"c","cta":"x","modeloGancho":46}]');
    await gerarCriativos({ cliente: moda, briefing: 'legging', quantidade: 3, modeloGancho: 46 });
    const t = enviado();
    expect(t).toContain('"modeloGancho" (número do modelo da biblioteca de ganchos');
    expect(t).toMatch(/um modelo diferente em cada item/);
    expect(t).toContain('A variação 1 usa o modelo de gancho 46');
  });
  it('hooks pedem o número do modelo', async () => {
    responder('[{"texto":"Oi","categoria":"dor","modeloGancho":"56"}]');
    const [h] = await gerarHooks({ cliente: moda, quantidade: 2 });
    expect(enviado()).toMatch(/\{"texto","categoria","modeloGancho"\}/);
    expect(h.modeloGancho).toBe(56);
  });
  it('criativo de saúde com modelo (*) escolhido leva o aviso de não usar resultado no corpo', async () => {
    responder('[{"nome":"a","hook":"h","copy":"c","cta":"x","modeloGancho":37}]');
    await gerarCriativos({ cliente: thermora, briefing: 'b', quantidade: 1, modeloGancho: 37 });
    expect(enviado()).toMatch(/Use o modelo de gancho 37.*produto é de saúde: adapte sem resultado no corpo/);
  });
});

describe('respostas reais gravadas', () => {
  it('criativo com modelo de gancho: cada variação diz de qual modelo veio, sem repetir e sem colchete', async () => {
    responder(fixture('ganchos-criativo-moda-real.json').texto);
    const vars = await gerarCriativos({ cliente: moda, briefing: 'legging', quantidade: 3 });
    expect(vars.length).toBeGreaterThan(1);
    const modelos = vars.map((v) => v.modeloGancho).filter(Boolean);
    expect(modelos.length).toBe(vars.length);
    expect(new Set(modelos).size).toBe(modelos.length);
    for (const v of vars) {
      expect(temColchete(`${v.hook} ${v.copy} ${v.cta}`)).toBe(false);
      expect(v.avisosGancho).toEqual([]);
    }
  });
  it('Thermora com modelo (*): gancho adaptado sem resultado no corpo, nada bloqueado', async () => {
    responder(fixture('ganchos-thermora-asterisco-real.json').texto);
    const [v] = await gerarCriativos({ cliente: thermora, briefing: 'b', quantidade: 1, modeloGancho: 37 });
    expect(v.modeloGancho).toBe(37);
    expect(motivoGancho(v, thermora)).toBe('');
    expect(acharTermosProibidos(`${v.hook} ${v.copy} ${v.cta}`, thermora)).toEqual([]);
  });
});
