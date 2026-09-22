// Testes do rodízio de provedores de imagem por IA — sem rede real (fetchImpl fake) e sem tocar o arquivo de
// contagem de verdade (arquivo temporário por teste), usando a injeção de dependência já existente no módulo.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gerarImagem, statusImagens, reiniciarPausas } from './imagens.js';

const HOJE = '2026-09-22';
const hoje = () => HOJE;
let arquivo;

beforeEach(() => {
  reiniciarPausas(); // as pausas por erro ficam em memória (Map do módulo): zera entre testes
  arquivo = path.join(os.tmpdir(), `gcc-teste-uso-imagens-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
});
afterEach(() => { try { fs.unlinkSync(arquivo); } catch { /* já não existe */ } });

/** Fake fetch: cada entrada de `regras` é [padrão-na-url, respostaOuFuncao]. A primeira que casar decide a resposta. */
function fetchFake(regras) {
  return async (url) => {
    for (const [padrao, resp] of regras) {
      if (String(url).includes(padrao)) return typeof resp === 'function' ? resp(url) : resp;
    }
    throw new Error('URL não esperada no teste: ' + url);
  };
}
const jsonResp = (ok, status, body) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });

const ENV_DOIS = {
  IMAGEM_PROVEDORES: 'cloudflare,together',
  CLOUDFLARE_ACCOUNT_ID: 'acc1', CLOUDFLARE_API_TOKEN: 'tok1',
  TOGETHER_API_KEY: 'tok2',
};

describe('gerarImagem', () => {
  it('usa o primeiro provedor configurado quando ele funciona', async () => {
    const fetchImpl = fetchFake([
      ['cloudflare.com', jsonResp(true, 200, { result: { image: 'imgcf' } })],
    ]);
    const r = await gerarImagem({ prompt: 'produto em cima da mesa' }, { env: ENV_DOIS, fetchImpl, arquivo, hoje });
    expect(r.provedor).toBe('cloudflare');
    expect(r.imagem).toContain('imgcf');
    expect(r.tentativas).toEqual([]);
  });

  it('pula provedores sem chave configurada', async () => {
    const env = { IMAGEM_PROVEDORES: 'cloudflare,together', TOGETHER_API_KEY: 'tok2' }; // sem chave do Cloudflare
    const fetchImpl = fetchFake([['together.xyz', jsonResp(true, 200, { data: [{ b64_json: 'imgtg' }] })]]);
    const r = await gerarImagem({ prompt: 'x' }, { env, fetchImpl, arquivo, hoje });
    expect(r.provedor).toBe('together');
  });

  it('cai para o próximo provedor quando o primeiro falha, e registra a tentativa', async () => {
    const fetchImpl = fetchFake([
      ['cloudflare.com', jsonResp(false, 500, { error: 'instável' })],
      ['together.xyz', jsonResp(true, 200, { data: [{ b64_json: 'imgtg' }] })],
    ]);
    const r = await gerarImagem({ prompt: 'x' }, { env: ENV_DOIS, fetchImpl, arquivo, hoje });
    expect(r.provedor).toBe('together');
    expect(r.tentativas).toHaveLength(1);
    expect(r.tentativas[0]).toMatch(/Cloudflare/);
  });

  it('erro 5xx põe o provedor em pausa (não tenta de novo na chamada seguinte)', async () => {
    let chamadasCloudflare = 0;
    const fetchImpl = fetchFake([
      ['cloudflare.com', () => { chamadasCloudflare++; return jsonResp(false, 500, {}); }],
      ['together.xyz', jsonResp(true, 200, { data: [{ b64_json: 'imgtg' }] })],
    ]);
    await gerarImagem({ prompt: 'x' }, { env: ENV_DOIS, fetchImpl, arquivo, hoje });
    await gerarImagem({ prompt: 'y' }, { env: ENV_DOIS, fetchImpl, arquivo, hoje });
    expect(chamadasCloudflare).toBe(1); // na 2ª chamada, o Cloudflare já estava pausado: nem tentou
  });

  it('respeita o limite diário de uso do app (não é a cota do provedor, é o teto configurado)', async () => {
    fs.writeFileSync(arquivo, JSON.stringify({ data: HOJE, contagem: { cloudflare: 150 } })); // 150 = limite padrão
    const fetchImpl = fetchFake([['together.xyz', jsonResp(true, 200, { data: [{ b64_json: 'imgtg' }] })]]);
    const r = await gerarImagem({ prompt: 'x' }, { env: ENV_DOIS, fetchImpl, arquivo, hoje });
    expect(r.provedor).toBe('together');
    expect(r.tentativas[0]).toMatch(/limite diário/);
  });

  it('um limite diário customizado por env (ex.: CLOUDFLARE_LIMITE_DIA) é respeitado', async () => {
    fs.writeFileSync(arquivo, JSON.stringify({ data: HOJE, contagem: { cloudflare: 2 } }));
    const env = { ...ENV_DOIS, CLOUDFLARE_LIMITE_DIA: '2' };
    const fetchImpl = fetchFake([['together.xyz', jsonResp(true, 200, { data: [{ b64_json: 'imgtg' }] })]]);
    const r = await gerarImagem({ prompt: 'x' }, { env, fetchImpl, arquivo, hoje });
    expect(r.provedor).toBe('together');
  });

  it('sem nenhum provedor configurado, falha com status 503 e mensagem clara', async () => {
    await expect(gerarImagem({ prompt: 'x' }, { env: {}, fetchImpl: fetchFake([]), arquivo, hoje }))
      .rejects.toMatchObject({ status: 503 });
  });

  it('quando todos os provedores configurados falham, erro 502 com o motivo de cada um', async () => {
    const fetchImpl = fetchFake([
      ['cloudflare.com', jsonResp(false, 500, {})],
      ['together.xyz', jsonResp(false, 401, { error: { message: 'chave inválida' } })],
    ]);
    await expect(gerarImagem({ prompt: 'x' }, { env: ENV_DOIS, fetchImpl, arquivo, hoje }))
      .rejects.toMatchObject({ status: 502 });
  });

  it('incrementa o contador do provedor usado, persistido no arquivo', async () => {
    const fetchImpl = fetchFake([['cloudflare.com', jsonResp(true, 200, { result: { image: 'imgcf' } })]]);
    await gerarImagem({ prompt: 'x' }, { env: ENV_DOIS, fetchImpl, arquivo, hoje });
    const salvo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    expect(salvo.contagem.cloudflare).toBe(1);
  });
});

describe('statusImagens', () => {
  it('reporta configurado, usado hoje, limite e pausa de cada provedor listado', async () => {
    fs.writeFileSync(arquivo, JSON.stringify({ data: HOJE, contagem: { cloudflare: 5 } }));
    const s = statusImagens({ env: ENV_DOIS, arquivo, hoje, agora: () => 1000 });
    const cf = s.find((p) => p.id === 'cloudflare');
    expect(cf).toMatchObject({ configurado: true, usadoHoje: 5, limiteDia: 150, pausado: false });
    const tg = s.find((p) => p.id === 'together');
    expect(tg).toMatchObject({ configurado: true, usadoHoje: 0, limiteDia: 100 });
  });

  it('mostra um provedor sem chave como não configurado', () => {
    const s = statusImagens({ env: { IMAGEM_PROVEDORES: 'cloudflare' }, arquivo, hoje, agora: () => 1000 });
    expect(s.find((p) => p.id === 'cloudflare').configurado).toBe(false);
  });

  it('reflete a pausa aplicada após uma falha recente', async () => {
    const fetchImpl = fetchFake([
      ['cloudflare.com', jsonResp(false, 500, {})],
      ['together.xyz', jsonResp(true, 200, { data: [{ b64_json: 'imgtg' }] })],
    ]);
    await gerarImagem({ prompt: 'x' }, { env: ENV_DOIS, fetchImpl, arquivo, hoje });
    const s = statusImagens({ env: ENV_DOIS, arquivo, hoje, agora: Date.now });
    expect(s.find((p) => p.id === 'cloudflare').pausado).toBe(true);
  });
});
