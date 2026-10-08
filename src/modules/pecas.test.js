// Peças no banco demo: guardar e ler de volta (como depois de recarregar a página), mudar status, excluir (com o
// arquivo de link enviado guardado), a cascata ao excluir o criativo e o backup das peças.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { prepararDemo, limparBanco } from '../../tests/dados-demo.js';

const mapa = prepararDemo();
vi.mock('../lib/video.js', () => ({ comprimirVideoPeca: vi.fn(async () => new Blob([new Uint8Array(1000)], { type: 'video/mp4' })) }));
vi.mock('../core/ui.js', () => ({ esc: (s) => String(s), $: () => null, on: () => {}, modal: () => ({}), toast: () => {}, ocupado: async (_b, fn) => fn(), confirmar: async () => true, tag: (t) => t, dataBR: () => '', opcoes: () => '', mostrarResultado: () => {} }));
vi.mock('./aprovacao.js', () => ({ statusAposTrocarArquivo: (c) => (['aprovado', 'pronto_aprovacao'].includes(c?.status) ? { status: 'reaprovacao' } : {}) }));
// FileReader (data URL do demo) e createImageBitmap não existem no Node: o envio demo e a miniatura são simulados.
vi.stubGlobal('FileReader', class { readAsDataURL(b) { this.result = `data:${b.type};base64,AAAA`; setTimeout(() => this.onload(), 0); } });

let db, COL, salvarPeca, definirStatusPeca, excluirPecas, usarComoPecaFinal, montarBackup, apagarCriativoEmCascata;
beforeAll(async () => {
  ({ db, COL } = await import('../core/storage.js'));
  ({ salvarPeca, definirStatusPeca, excluirPecas, usarComoPecaFinal } = await import('./pecas.js'));
  ({ montarBackup } = await import('./backup.js'));
  ({ apagarCriativoEmCascata } = await import('../lib/cascata.js'));
});
beforeEach(() => limparBanco(mapa));

const cliente = { id: 'cliT' };
const criativo = { id: 'cr1', nome: 'Cena da manhã', produtoId: 'p1', modeloGancho: 37, versoes: [{ n: 1 }] };
const imagem = () => ({ blob: new Blob([new Uint8Array(2048)], { type: 'image/jpeg' }), tipo: 'imagem', formato: '1080x1350', ext: 'jpg', config: { hook: 'H', cta: 'C', template: 'destaque' } });

describe('guardar e ler', () => {
  it('imagem: vai para gcc/<cliente>/pecas/<id>/ e volta na leitura (sobrevive ao recarregar)', async () => {
    const p = await salvarPeca(cliente, criativo, imagem());
    expect(p.path).toMatch(/^gcc\/cliT\/pecas\/pc[\w]+\/cena-da-manha-feed-4x5\.jpg$/);
    expect(p.url).toMatch(/^data:image\/jpeg/);
    const lidas = await db.listar(COL.pecas, { clienteId: 'cliT' });
    expect(lidas).toHaveLength(1);
    expect(lidas[0]).toMatchObject({ criativoId: 'cr1', produtoId: 'p1', formatoNome: 'feed-4x5', status: 'nova', modeloGancho: 37, tamanho: 2048, texto: { hook: 'H', cta: 'C' } });
  });
  it('vídeo WebM: comprime para MP4 antes de guardar', async () => {
    const p = await salvarPeca(cliente, criativo, { blob: new Blob([new Uint8Array(5000)], { type: 'video/webm' }), tipo: 'video', formato: '1080x1920', ext: 'webm', duracao: 5 });
    expect(p).toMatchObject({ ext: 'mp4', comprimido: true, tamanho: 1000, formatoNome: 'reels-9x16' });
    expect(p.nomeArquivo).toBe('cena-da-manha-reels-9x16.mp4');
  });
});

describe('status, peça final e exclusão', () => {
  it('muda o status e grava', async () => {
    const p = await salvarPeca(cliente, criativo, imagem());
    await definirStatusPeca(p, 'usar');
    expect((await db.obter(COL.pecas, p.id)).status).toBe('usar');
  });
  it('usar como peça final aponta o criativo para o arquivo da peça; aprovado vira reaprovação', async () => {
    const p = await salvarPeca(cliente, criativo, imagem());
    await db.definir(COL.criativos, 'cr1', { clienteId: 'cliT', status: 'aprovado' });
    const c = { ...(await db.obter(COL.criativos, 'cr1')) };
    await usarComoPecaFinal(c, p);
    expect(await db.obter(COL.criativos, 'cr1')).toMatchObject({ arquivoPath: p.path, arquivoNome: p.nomeArquivo, status: 'reaprovacao' });
  });
  it('exclui só as descartadas; a que foi num link enviado guarda o arquivo no cliente', async () => {
    await db.definir(COL.clientes, 'cliT', { nome: 'Thermora' });
    const a = await salvarPeca(cliente, criativo, imagem());
    const b = await salvarPeca(cliente, criativo, imagem());
    const usar = await salvarPeca(cliente, criativo, imagem());
    await definirStatusPeca(a, 'descartar'); await definirStatusPeca(b, 'descartar'); await definirStatusPeca(usar, 'usar');
    const criativos = [{ id: 'cr1', aprovacaoToken: 'tok', aprovacaoArquivo: { path: b.path }, arquivoPath: b.path }];
    const plano = await excluirPecas(cliente, [a, b, usar], criativos);
    expect(plano.apagar.map((x) => x.id)).toEqual([a.id]);
    expect(plano.manter.map((x) => x.id)).toEqual([b.id]);
    expect((await db.listar(COL.pecas, { clienteId: 'cliT' })).map((x) => x.id)).toEqual([usar.id]);
    expect((await db.obter(COL.clientes, 'cliT')).arquivosRetidos.map((x) => x.path)).toEqual([b.path]);
  });
});

describe('cascata e backup', () => {
  it('excluir o criativo leva as peças dele', async () => {
    await db.definir(COL.criativos, 'cr1', { clienteId: 'cliT' });
    await salvarPeca(cliente, criativo, imagem());
    await salvarPeca(cliente, { ...criativo, id: 'cr2' }, imagem());
    await apagarCriativoEmCascata('cr1', null, null, { clienteId: 'cliT' });
    expect((await db.listar(COL.pecas, { clienteId: 'cliT' })).map((p) => p.criativoId)).toEqual(['cr2']);
  });
  it('backup do cliente inclui as peças (registro com o link do arquivo), sem o token do link', async () => {
    await db.definir(COL.clientes, 'cliT', { nome: 'Thermora' });
    const p = await salvarPeca(cliente, criativo, imagem());
    await db.atualizar(COL.pecas, p.id, { aprovacaoToken: 'segredo' });
    const b = await montarBackup({ id: 'cliT', nome: 'Thermora' });
    const pecas = b.colecoes[COL.pecas];
    expect(pecas).toHaveLength(1);
    expect(pecas[0]).toMatchObject({ id: p.id, path: p.path, url: p.url, foiParaAprovacao: true });
    expect(JSON.stringify(b)).not.toMatch(/segredo/);
  });
});
