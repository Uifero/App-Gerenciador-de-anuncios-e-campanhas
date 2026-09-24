// Prévia em qualidade reduzida no link de aprovação: o que vai para o snapshot público e como a página exibe.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bancos = {};
vi.mock('../core/storage.js', () => ({
  COL: { criativos: 'criativos', respostas: 'respostas', aprovacoes: 'aprovacoes' },
  db: {
    listar: vi.fn(async () => []),
    obter: vi.fn(async (col, id) => bancos[col]?.get(id) || null),
    criar: vi.fn(async (col, dados, id) => { (bancos[col] ||= new Map()).set(id, dados); return { id, ...dados }; }),
    atualizar: vi.fn(async (col, id, patch) => { const m = (bancos[col] ||= new Map()); m.set(id, { ...m.get(id), ...patch }); }),
    remover: vi.fn(async () => {}),
  },
  removerArquivo: vi.fn(async () => {}),
  enviarArquivo: vi.fn(),
}));

const { itemDoSnapshot, criarLink, midia, LEGENDA_PREVIA } = await import('./aprovacao.js');
const { tipoDaPeca, dimensoesPreviaImagem, previaAtual, removerPrevia } = await import('../lib/previa.js');
const { removerArquivo } = await import('../core/storage.js');

const BASE = { id: 'c1', nome: 'Legging', hook: 'h', copy: 'c', cta: 'x', formato: 'video_curto' };

beforeEach(() => { for (const k of Object.keys(bancos)) delete bancos[k]; });

describe('tipo e tamanho da prévia', () => {
  it('só imagem e vídeo têm prévia (PDF não)', () => {
    expect(tipoDaPeca('peca.JPG')).toBe('imagem');
    expect(tipoDaPeca('video.mov')).toBe('video');
    expect(tipoDaPeca('x', 'video/mp4')).toBe('video');
    expect(tipoDaPeca('briefing.pdf', 'application/pdf')).toBe(null);
  });
  it('imagem: até 800 px de largura, proporção mantida, sem ampliar', () => {
    expect(dimensoesPreviaImagem(2400, 1800)).toEqual({ largura: 800, altura: 600 });
    expect(dimensoesPreviaImagem(1080, 1920)).toEqual({ largura: 800, altura: 1422 });
    expect(dimensoesPreviaImagem(600, 400)).toEqual({ largura: 600, altura: 400 });
  });
  it('prévia só vale para a peça atual (arquivo trocado = prévia velha)', () => {
    expect(previaAtual({ previaUrl: 'p', arquivoPath: 'a', previaDoArquivo: 'a' })).toBe(true);
    expect(previaAtual({ previaUrl: 'p', arquivoPath: 'b', previaDoArquivo: 'a' })).toBe(false);
  });
});

describe('snapshot do link de aprovação', () => {
  it('com prévia: vai só a prévia, o original em qualidade total NÃO entra no link', () => {
    const it = itemDoSnapshot({ ...BASE, arquivoUrl: 'orig', arquivoPath: 'gcc/1/criativos/c1/a.mp4', arquivoNome: 'a.mp4', previaUrl: 'prev', previaTipo: 'video', previaDoArquivo: 'gcc/1/criativos/c1/a.mp4' });
    expect(it).toMatchObject({ previaUrl: 'prev', previaTipo: 'video', arquivoUrl: null, arquivoNome: null });
  });
  it('sem prévia (PDF ou peça antiga): mantém o comportamento de antes', () => {
    expect(itemDoSnapshot({ ...BASE, arquivoUrl: 'orig', arquivoPath: 'p', arquivoNome: 'b.pdf' })).toMatchObject({ previaUrl: null, arquivoUrl: 'orig', arquivoNome: 'b.pdf' });
    expect(itemDoSnapshot({ ...BASE })).toMatchObject({ previaUrl: null, arquivoUrl: null });
  });
  it('criarLink grava o snapshot com a prévia', async () => {
    bancos.criativos = new Map([['c1', {}]]);
    const c = { ...BASE, arquivoUrl: 'orig', arquivoPath: 'a', arquivoNome: 'a.png', previaUrl: 'prev', previaTipo: 'imagem', previaDoArquivo: 'a' };
    const { token } = await criarLink({ id: 'cli', nome: 'Cliente' }, [c], 7);
    const doc = bancos.aprovacoes.get(token);
    expect(doc.itens[0]).toMatchObject({ previaUrl: 'prev', arquivoUrl: null });
  });
});

describe('página pública', () => {
  it('mostra a prévia com a legenda de qualidade reduzida', () => {
    const img = midia({ nome: 'n', previaUrl: 'https://x/p.jpg', previaTipo: 'imagem' });
    expect(img).toContain('<img');
    expect(img).toContain(LEGENDA_PREVIA);
    const vid = midia({ nome: 'n', previaUrl: 'https://x/p.mp4', previaTipo: 'video' });
    expect(vid).toContain('<video');
    expect(vid).toContain('controls');
  });
  it('sem peça final: só o texto, como antes', () => {
    expect(midia({ nome: 'n' })).toBe('');
  });
  it('links antigos (sem prévia) continuam mostrando o arquivo', () => {
    expect(midia({ nome: 'n', arquivoUrl: 'https://x/a.png', arquivoNome: 'a.png' })).toContain('<img');
  });
});

describe('remover a peça final remove a prévia', () => {
  it('apaga o arquivo da prévia e limpa os campos', async () => {
    bancos.criativos = new Map([['c1', {}]]);
    const c = { ...BASE, previaUrl: 'p', previaPath: 'gcc/x/previews/c1/1.jpg', previaTipo: 'imagem', previaDoArquivo: 'a' };
    await removerPrevia(c);
    expect(removerArquivo).toHaveBeenCalledWith('gcc/x/previews/c1/1.jpg');
    expect(c).toMatchObject({ previaUrl: null, previaPath: null, previaTipo: null });
  });
});
