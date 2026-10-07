// Regras permanentes do CLAUDE.md nos prompts: criativos para o Instagram no celular e sites feitos primeiro para o celular.
// IA simulada: o fetch devolve uma resposta pronta e o teste lê o pedido que seria enviado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('../modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));

const { gerarCriativos, gerarHooks, gerarConteudoSite, gerarTextosPacote, CELULAR_PRIMEIRO } = await import('./ia.js');
const { REGRA_INSTAGRAM } = await import('../lib/formatos-instagram.js');

let pedidos = [];
const responder = (texto) => vi.stubGlobal('fetch', vi.fn(async (_u, o) => {
  pedidos.push(JSON.parse(o.body));
  return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ texto }) };
}));
const enviado = () => pedidos.map((p) => p.messages.map((m) => m.content).join('\n')).join('\n');
const cliente = { id: 'c1', nome: 'Loja', marca: {} };

beforeEach(() => { pedidos = []; });

describe('criativos e hooks: Instagram no celular', () => {
  it('gerarCriativos manda formato 9:16/4:5, zona segura, sem som e gancho em 3 s', async () => {
    responder('[{"nome":"a","hook":"h","copy":"c","cta":"x"}]');
    await gerarCriativos({ cliente, briefing: 'b', quantidade: 1 });
    const t = enviado();
    expect(t).toContain(REGRA_INSTAGRAM);
    expect(REGRA_INSTAGRAM).toMatch(/9:16 \(1080x1920\)/);
    expect(REGRA_INSTAGRAM).toMatch(/4:5 \(1080x1350\)/);
    expect(REGRA_INSTAGRAM).toMatch(/sem som/);
    expect(REGRA_INSTAGRAM).toMatch(/3 primeiros segundos/);
  });
  it('gerarHooks pede texto curto lido sem som no celular', async () => {
    responder('[{"texto":"Oi","categoria":"dor"}]');
    await gerarHooks({ cliente, quantidade: 2 });
    expect(enviado()).toMatch(/Instagram no celular.*sem som/);
  });
});

describe('site e pacote de loja: celular primeiro', () => {
  it('site personalizado', async () => {
    responder('{"heroTitulo":"t"}');
    await gerarConteudoSite({ cliente, produtos: [{ nome: 'P' }] });
    expect(enviado()).toContain(CELULAR_PRIMEIRO);
  });
  it('pacote para plataforma', async () => {
    responder('{"banners":[]}');
    await gerarTextosPacote({ cliente, produtos: [{ nome: 'P' }], plataforma: 'nuvemshop' });
    expect(enviado()).toContain(CELULAR_PRIMEIRO);
    expect(CELULAR_PRIMEIRO).toMatch(/uma coluna/);
  });
});
