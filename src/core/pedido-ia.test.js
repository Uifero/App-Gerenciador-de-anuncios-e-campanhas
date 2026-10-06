// Pedido de IA pelo navegador: trabalho no servidor + consultas curtas, uma nova tentativa automática em falha de rede.
import { describe, it, expect, vi } from 'vitest';
vi.mock('./auth.js', () => ({ tokenAtual: async () => 'demo' }));
vi.mock('../modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));
const { pedirAoServidor, ERRO_REDE } = await import('./ia.js');

const resp = (status, corpo) => ({ status, ok: status >= 200 && status < 300, json: async () => corpo });

describe('pedirAoServidor', () => {
  it('cria o trabalho e consulta até ficar pronto (cada consulta é curta)', async () => {
    const chamadas = [];
    const fila = [resp(202, { trabalho: 't1' }), resp(200, { pronto: false, segundos: 12, etapa: 'assinatura' }), resp(200, { pronto: true, status: 200, corpo: { texto: 'oi', provedor: 'cli' } })];
    const r = await pedirAoServidor('tk', '{}', { fetchFn: async (url) => { chamadas.push(url); return fila.shift(); }, espera: 1 });
    expect(r).toEqual({ status: 200, ok: true, corpo: { texto: 'oi', provedor: 'cli' } });
    expect(chamadas).toEqual(['/api/claude', '/api/claude/trabalho/t1', '/api/claude/trabalho/t1']);
  });
  it('servidor antigo (resposta direta) continua funcionando', async () => {
    const r = await pedirAoServidor('tk', '{}', { fetchFn: async () => resp(200, { texto: 'x' }), espera: 1 });
    expect(r.corpo.texto).toBe('x');
  });
  it('falha de rede: tenta de novo uma vez e segue', async () => {
    let n = 0;
    const r = await pedirAoServidor('tk', '{}', { fetchFn: async () => { if (n++ === 0) throw new TypeError('Failed to fetch'); return resp(200, { texto: 'ok' }); }, espera: 1 });
    expect(n).toBe(2);
    expect(r.corpo.texto).toBe('ok');
  });
  it('falha de rede duas vezes: mensagem simples e o detalhe técnico guardado', async () => {
    let n = 0;
    const e = await pedirAoServidor('tk', '{}', { fetchFn: async () => { n++; throw new TypeError('Failed to fetch'); }, espera: 1 }).catch((x) => x);
    expect(n).toBe(2);
    expect(e.message).toBe(ERRO_REDE);
    expect(e.message).toBe('Não consegui falar com o servidor do app. Se você acabou de atualizar, espere 30 segundos e tente de novo.');
    expect(e.detalhe).toMatch(/TypeError: Failed to fetch/);
  });
  it('proxy sem o app (502 sem JSON, servidor reiniciando) conta como falha de rede: tenta de novo', async () => {
    let n = 0;
    const html = { status: 502, ok: false, headers: { get: () => 'text/html' }, json: async () => { throw new Error('html'); } };
    const r = await pedirAoServidor('tk', '{}', { fetchFn: async () => (n++ === 0 ? html : resp(200, { texto: 'voltou' })), espera: 1 });
    expect(n).toBe(2);
    expect(r.corpo.texto).toBe('voltou');
  });
  it('erro do servidor no trabalho (limite da assinatura sem reserva) chega com a mensagem em português', async () => {
    const fila = [resp(202, { trabalho: 't2' }), resp(200, { pronto: true, status: 503, corpo: { erro: 'O limite da assinatura do Claude acabou. Volta às 18:30 (horário de Brasília).', limite: true } })];
    const r = await pedirAoServidor('tk', '{}', { fetchFn: async () => fila.shift(), espera: 1 });
    expect(r.ok).toBe(false);
    expect(r.corpo.erro).toMatch(/Volta às 18:30/);
  });
});
