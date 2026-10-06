// Servidor de IA de verdade (processo separado), com CLI falsa que bate no limite da assinatura e API falsa.
// Sem custo e sem gastar a assinatura: nada sai da máquina.
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiFalsa } from './fixtures/ia/api-falsa.mjs';
import { lerLimite, mensagemLimite } from '../server/limite-ia.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(raiz, 'tests/fixtures/ia/cli-limite.mjs');
let proc = null, api = null;

async function subir(envExtra) {
  const port = 8900 + Math.floor(Math.random() * 500);
  proc = spawn(process.execPath, [path.join(raiz, 'server/index.js')], { cwd: raiz, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DEV_AUTH_BYPASS: '1', IA_PROVEDOR: 'auto', IA_CLI_BIN: CLI, ...envExtra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 100 && !/\[api\] http/.test(log); i++) await new Promise((r) => setTimeout(r, 50));
  return { base: `http://127.0.0.1:${port}`, log: () => log };
}
const pedir = (base) => fetch(`${base}/api/claude`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer demo' },
  body: JSON.stringify({ tarefa: 'conferencia_site', system: 's', messages: [{ role: 'user', content: 'oi' }] }) });

afterEach(async () => { proc?.kill(); proc = null; await api?.fechar(); api = null; });

describe('limite da assinatura no servidor', () => {
  it('vai para a reserva na hora (sem esperar os 3 minutos) e diz que foi a reserva', async () => {
    api = await apiFalsa({ texto: '{"resultados":[]}' });
    const s = await subir({ ANTHROPIC_API_KEY: 'chave-de-teste-nao-real', ANTHROPIC_BASE_URL: api.url });
    const t0 = Date.now();
    const r = await pedir(s.base); const corpo = await r.json();
    expect(r.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(corpo.provedor).toBe('api');
    expect(corpo.uso.provedor).toBe('api');
    expect(corpo.texto).toBe('{"resultados":[]}');
    expect(s.log()).toMatch(/limite da assinatura atingido/);
    expect(s.log()).not.toMatch(/chave-de-teste-nao-real/); // a chave nunca vai para o log
    // A próxima chamada nem tenta a CLI: vai direto para a reserva.
    const r2 = await pedir(s.base); expect((await r2.json()).provedor).toBe('api');
    expect(api.pedidos.length).toBe(2);
  }, 30_000);

  it('reserva também falhando: mensagem simples com a hora de volta em Brasília', async () => {
    api = await apiFalsa({ modo: 'erro' });
    const s = await subir({ ANTHROPIC_API_KEY: 'chave-de-teste-nao-real', ANTHROPIC_BASE_URL: api.url });
    const r = await pedir(s.base); const corpo = await r.json();
    expect(r.status).toBe(503);
    expect(corpo.limite).toBe(true);
    const esperado = mensagemLimite(lerLimite("You've hit your session limit · resets 9:30pm (UTC)").volta);
    expect(corpo.erro.startsWith(esperado)).toBe(true);
    expect(corpo.erro).toMatch(/Volta às \d\d:\d\d \(horário de Brasília\)/);
  }, 60_000);

  it('sem chave da reserva: a mesma mensagem, na hora', async () => {
    const s = await subir({ ANTHROPIC_API_KEY: '' });
    const t0 = Date.now();
    const r = await pedir(s.base); const corpo = await r.json();
    expect(r.status).toBe(503);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(corpo.erro).toMatch(/O limite da assinatura do Claude acabou\. Volta às \d\d:\d\d \(horário de Brasília\)\./);
  }, 30_000);

  it('modo assíncrono: responde na hora com um trabalho e entrega o resultado na consulta', async () => {
    api = await apiFalsa({ texto: 'ok' });
    const s = await subir({ ANTHROPIC_API_KEY: 'x', ANTHROPIC_BASE_URL: api.url });
    const r = await fetch(`${s.base}/api/claude`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer demo' }, body: JSON.stringify({ tarefa: 'conferencia_site', messages: [{ role: 'user', content: 'oi' }], assincrono: true }) });
    expect(r.status).toBe(202);
    const { trabalho } = await r.json();
    let fim = null;
    for (let i = 0; i < 40 && !fim; i++) { await new Promise((x) => setTimeout(x, 250)); const c = await (await fetch(`${s.base}/api/claude/trabalho/${trabalho}`, { headers: { Authorization: 'Bearer demo' } })).json(); if (c.pronto) fim = c; }
    expect(fim).toMatchObject({ pronto: true, status: 200 });
    expect(fim.corpo.texto).toBe('ok');
  }, 30_000);
});
