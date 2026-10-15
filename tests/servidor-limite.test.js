// Servidor de IA de verdade (processo separado), com CLI falsa (que responde ou que bate no limite da assinatura) e API falsa.
// Sem custo e sem gastar a assinatura: nada sai da máquina.
// Regra (Frente 1, 2026-10-15): toda tarefa vai pela assinatura; a API (chave) só com a permissão do operador.
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiFalsa } from './fixtures/ia/api-falsa.mjs';
import { lerLimite, mensagemLimite } from '../server/limite-ia.js';
import { TAREFAS } from '../server/index.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_LIMITE = path.join(raiz, 'tests/fixtures/ia/cli-limite.mjs');
const CLI_OK = path.join(raiz, 'tests/fixtures/ia/cli-ok.mjs');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const CHAVE = 'chave-de-teste-nao-real';
const procs = []; let api = null;

async function subir(envExtra, cli = CLI_LIMITE) {
  const port = 8900 + Math.floor(Math.random() * 500);
  const proc = spawn(process.execPath, [path.join(raiz, 'server/index.js')], { cwd: raiz, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DEV_AUTH_BYPASS: '1', IA_PROVEDOR: 'auto', IA_CLI_BIN: cli, ...envExtra }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(proc);
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 100 && !/\[api\] http/.test(log); i++) await new Promise((r) => setTimeout(r, 50));
  return { base: `http://127.0.0.1:${port}`, log: () => log };
}
const pedir = (base, extra = {}) => fetch(`${base}/api/claude`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer demo' },
  body: JSON.stringify({ tarefa: 'conferencia_site', system: 's', messages: [{ role: 'user', content: 'oi' }], ...extra }) });

afterEach(async () => { for (const p of procs.splice(0)) p.kill(); await api?.fechar(); api = null; });

describe('toda tarefa vai pela assinatura', () => {
  it('cada tarefa de TAREFAS (as com imagem também, pela entrada stream-json) é paga pela assinatura, mesmo com a chave configurada', async () => {
    api = await apiFalsa({ texto: 'NÃO DEVIA CHAMAR' });
    const nomes = Object.keys(TAREFAS);
    // O servidor limita 30 chamadas/min por usuário: um servidor por lote.
    for (let i = 0; i < nomes.length; i += 25) {
      const s = await subir({ ANTHROPIC_API_KEY: CHAVE, ANTHROPIC_BASE_URL: api.url }, CLI_OK);
      for (const tarefa of nomes.slice(i, i + 25)) {
        const img = TAREFAS[tarefa].imagens ? { imagens: [{ media_type: 'image/png', data: PNG }, { media_type: 'image/png', data: PNG }] } : {};
        const r = await pedir(s.base, { tarefa, ...img }); const corpo = await r.json();
        expect(r.status, tarefa).toBe(200);
        expect(corpo.provedor, tarefa).toBe('cli');
        expect(corpo.uso, tarefa).toMatchObject({ provedor: 'cli', custoUsd: 0 });
        expect(JSON.parse(corpo.texto).imagens, tarefa).toBe(TAREFAS[tarefa].imagens ? 2 : 0);
      }
      expect(s.log()).toMatch(/\[ia\] tarefa=conferencia_site pago_por=assinatura|\[ia\] tarefa=\w+ pago_por=assinatura/);
      expect(s.log()).not.toContain(CHAVE);
    }
    expect(api.pedidos.length).toBe(0);
  }, 120_000);
});

describe('limite da assinatura no servidor', () => {
  it('"Perguntar" (padrão): não troca para a API; devolve o pedido de permissão com o custo estimado, na hora', async () => {
    api = await apiFalsa({ texto: '{"resultados":[]}' });
    const s = await subir({ ANTHROPIC_API_KEY: CHAVE, ANTHROPIC_BASE_URL: api.url });
    const t0 = Date.now();
    const r = await pedir(s.base); const corpo = await r.json();
    expect(r.status).toBe(409);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(corpo).toMatchObject({ precisaPermissao: true, limite: true, erro: 'A assinatura chegou ao limite.' });
    expect(corpo.custoEstimadoUsd).toBeGreaterThan(0);
    expect(api.pedidos.length).toBe(0);
    expect(s.log()).toMatch(/limite da assinatura atingido/);
    expect(s.log()).toMatch(/\[ia\] tarefa=conferencia_site pago_por=nenhum\(pergunta\)/);
    // A próxima chamada também pergunta (a CLI fica em pausa pelo limite, mas a API não entra sozinha).
    const r2 = await pedir(s.base); expect((await r2.json()).precisaPermissao).toBe(true);
    expect(api.pedidos.length).toBe(0);
    // "Usar API desta vez": só esta chamada vai pela chave.
    const r3 = await pedir(s.base, { permitirApi: true }); const c3 = await r3.json();
    expect(r3.status).toBe(200);
    expect(c3).toMatchObject({ provedor: 'api', uso: { provedor: 'api' } });
    expect(c3.uso.custoUsd).toBeGreaterThan(0);
    expect(api.pedidos.length).toBe(1);
    expect(s.log()).toMatch(/\[ia\] tarefa=conferencia_site pago_por=api /);
    expect(s.log()).not.toContain(CHAVE); // a chave nunca vai para o log
  }, 30_000);

  it('"Nunca": só avisa, sem perguntar e sem usar a chave', async () => {
    api = await apiFalsa();
    const s = await subir({ ANTHROPIC_API_KEY: CHAVE, ANTHROPIC_BASE_URL: api.url });
    const r = await pedir(s.base, { usarApi: 'nunca' }); const corpo = await r.json();
    expect(r.status).toBe(503);
    expect(corpo.precisaPermissao).toBeUndefined();
    expect(corpo.erro).toMatch(/Volta às \d\d:\d\d \(horário de Brasília\).*A chave de API não foi usada/);
    expect(api.pedidos.length).toBe(0);
  }, 30_000);

  it('"Sempre": usa a chave sem perguntar e diz que foi a API', async () => {
    api = await apiFalsa({ texto: 'ok' });
    const s = await subir({ ANTHROPIC_API_KEY: CHAVE, ANTHROPIC_BASE_URL: api.url });
    const r = await pedir(s.base, { usarApi: 'sempre' }); const corpo = await r.json();
    expect(r.status).toBe(200);
    expect(corpo).toMatchObject({ provedor: 'api', texto: 'ok' });
    expect(api.pedidos.length).toBe(1);
  }, 30_000);

  it('"Sempre" com a API também falhando: mensagem simples com a hora de volta em Brasília', async () => {
    api = await apiFalsa({ modo: 'erro' });
    const s = await subir({ ANTHROPIC_API_KEY: CHAVE, ANTHROPIC_BASE_URL: api.url });
    const r = await pedir(s.base, { usarApi: 'sempre' }); const corpo = await r.json();
    expect(r.status).toBe(503);
    expect(corpo.limite).toBe(true);
    const esperado = mensagemLimite(lerLimite("You've hit your session limit · resets 9:30pm (UTC)").volta);
    expect(corpo.erro.startsWith(esperado)).toBe(true);
    expect(corpo.erro).toMatch(/Volta às \d\d:\d\d \(horário de Brasília\)/);
  }, 60_000);

  it('sem chave de API: a mensagem do limite, na hora (nada a perguntar)', async () => {
    const s = await subir({ ANTHROPIC_API_KEY: '' });
    const t0 = Date.now();
    const r = await pedir(s.base); const corpo = await r.json();
    expect(r.status).toBe(503);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(corpo.precisaPermissao).toBeUndefined();
    expect(corpo.erro).toMatch(/O limite da assinatura do Claude acabou\. Volta às \d\d:\d\d \(horário de Brasília\)\./);
  }, 30_000);

  it('modo assíncrono: responde na hora com um trabalho e entrega o resultado (pela assinatura) na consulta', async () => {
    const s = await subir({ ANTHROPIC_API_KEY: 'x' }, CLI_OK);
    const r = await fetch(`${s.base}/api/claude`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer demo' }, body: JSON.stringify({ tarefa: 'conferencia_site', messages: [{ role: 'user', content: 'oi' }], assincrono: true }) });
    expect(r.status).toBe(202);
    const { trabalho } = await r.json();
    let fim = null;
    for (let i = 0; i < 40 && !fim; i++) { await new Promise((x) => setTimeout(x, 250)); const c = await (await fetch(`${s.base}/api/claude/trabalho/${trabalho}`, { headers: { Authorization: 'Bearer demo' } })).json(); if (c.pronto) fim = c; }
    expect(fim).toMatchObject({ pronto: true, status: 200, corpo: { provedor: 'cli' } });
  }, 30_000);
});
