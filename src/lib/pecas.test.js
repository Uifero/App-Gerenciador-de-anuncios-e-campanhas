// Peças da Galeria: nome com formato, registro, filtros, status, exclusão (arquivo em link enviado fica), uso do
// armazenamento e a cota gratuita, e quando comprimir o vídeo.
import { describe, it, expect } from 'vitest';
import {
  nomeArquivoPeca, caminhoPeca, ehCaminhoDePeca, registroPeca, filtrarPecas, statusDaPeca, pecaEmLinkEnviado, planoExclusaoPecas,
  usoArmazenamento, situacaoCota, formatarBytes, planoCompressaoVideo, COTA_STORAGE,
} from './pecas.js';

describe('nome e caminho', () => {
  it('nome do arquivo leva o formato', () => {
    expect(nomeArquivoPeca({ nomeCriativo: 'Cena da manhã', formato: '1080x1920', tipo: 'video' })).toBe('cena-da-manha-reels-9x16.mp4');
    expect(nomeArquivoPeca({ nomeCriativo: '', formato: '1080x1350', tipo: 'imagem' })).toBe('criativo-feed-4x5.jpg');
    expect(nomeArquivoPeca({ nomeCriativo: 'X', formato: '1080x1920', tipo: 'imagem' })).toBe('x-stories-9x16.jpg');
  });
  it('caminho no Storage e reconhecimento', () => {
    const c = caminhoPeca('cli1', 'pc1', 'x.jpg');
    expect(c).toBe('gcc/cli1/pecas/pc1/x.jpg');
    expect(ehCaminhoDePeca(c)).toBe(true);
    expect(ehCaminhoDePeca('gcc/cli1/criativos/a.png')).toBe(false);
  });
});

describe('registro', () => {
  it('liga ao criativo e ao produto, com formato, gancho, versão e texto', () => {
    const r = registroPeca({ cliente: { id: 'c1' }, criativo: { id: 'cr1', nome: 'A', produtoId: 'p1', modeloGancho: 37, versoes: [{}, {}] }, tipo: 'imagem', formato: '1080x1350', ext: 'jpg', tamanho: 1234, miniatura: 'data:x', config: { hook: 'H', cta: 'C' } });
    expect(r).toMatchObject({ clienteId: 'c1', criativoId: 'cr1', produtoId: 'p1', formatoNome: 'feed-4x5', status: 'nova', modeloGancho: 37, versaoCriativo: 2, texto: { hook: 'H', cta: 'C' }, tamanho: 1234, nomeArquivo: 'a-feed-4x5.jpg' });
  });
});

const pecas = [
  { id: 'a', produtoId: 'p1', formatoNome: 'feed-4x5', status: 'usar', path: 'gcc/c/pecas/a/a.jpg', tamanho: 1000, clienteId: 'c1' },
  { id: 'b', produtoId: 'p2', formatoNome: 'reels-9x16', status: 'descartar', path: 'gcc/c/pecas/b/b.mp4', tamanho: 3000, clienteId: 'c1' },
  { id: 'c', produtoId: 'p1', formatoNome: 'reels-9x16', path: 'gcc/c/pecas/c/c.mp4', tamanho: 500, clienteId: 'c2' },
  { id: 'd', produtoId: 'p1', formatoNome: 'feed-4x5', status: 'descartar', path: 'gcc/c/pecas/d/d.jpg', tamanho: 10, clienteId: 'c2', aprovacaoToken: 't1' },
];

describe('filtros e status', () => {
  it('sem status vale "nova"; status desconhecido também', () => {
    expect(statusDaPeca({})).toBe('nova');
    expect(statusDaPeca({ status: 'xyz' })).toBe('nova');
    expect(statusDaPeca({ status: 'usar' })).toBe('usar');
  });
  it('filtra por produto, formato e status', () => {
    expect(filtrarPecas(pecas, { produtoId: 'p1' }).map((p) => p.id)).toEqual(['a', 'c', 'd']);
    expect(filtrarPecas(pecas, { formato: 'reels-9x16' }).map((p) => p.id)).toEqual(['b', 'c']);
    expect(filtrarPecas(pecas, { status: 'nova' }).map((p) => p.id)).toEqual(['c']);
    expect(filtrarPecas(pecas, { produtoId: 'p1', status: 'descartar' }).map((p) => p.id)).toEqual(['d']);
  });
});

describe('exclusão', () => {
  it('peça num link enviado: pelo token dela, pelo criativo ou restaurada de backup', () => {
    expect(pecaEmLinkEnviado(pecas[3], [])).toBe(true);
    expect(pecaEmLinkEnviado(pecas[1], [{ aprovacaoToken: 'x', aprovacaoArquivo: { path: pecas[1].path } }])).toBe(true);
    expect(pecaEmLinkEnviado(pecas[1], [{ aprovacaoToken: null, aprovacaoArquivo: { path: pecas[1].path } }])).toBe(false);
    expect(pecaEmLinkEnviado({ foiParaAprovacao: true }, [])).toBe(true);
  });
  it('só "Descartar" sai; a que foi para aprovação perde o registro e mantém o arquivo', () => {
    const p = planoExclusaoPecas(pecas, []);
    expect(p.apagar.map((x) => x.id)).toEqual(['b']);
    expect(p.manter.map((x) => x.id)).toEqual(['d']);
    expect(p.bloqueadas.map((x) => x.id)).toEqual(['a', 'c']);
    expect(p.texto).toMatch(/link de aprovação/);
  });
});

describe('armazenamento e cota', () => {
  it('soma total e por cliente', () => {
    const u = usoArmazenamento(pecas);
    expect(u.bytes).toBe(4510);
    expect(u.quantidade).toBe(4);
    expect(u.porCliente).toEqual({ c1: { bytes: 4000, quantidade: 2 }, c2: { bytes: 510, quantidade: 2 } });
    expect(usoArmazenamento([{ tamanho: 'abc' }, { tamanho: -5 }]).bytes).toBe(0);
  });
  it('cota gratuita de 5 GB: perto a partir de 80%, passou com custo do excedente', () => {
    const gb = 1024 ** 3;
    expect(COTA_STORAGE.gratisBytes).toBe(5 * gb);
    expect(situacaoCota(1 * gb)).toMatchObject({ perto: false, passou: false, excedenteGb: 0, custoMesUsd: 0 });
    expect(situacaoCota(4.2 * gb)).toMatchObject({ perto: true, passou: false });
    const s = situacaoCota(7 * gb);
    expect(s.passou).toBe(true);
    expect(s.excedenteGb).toBeCloseTo(2);
    expect(s.custoMesUsd).toBeCloseTo(2 * COTA_STORAGE.precoGbMesUsd);
  });
  it('formata bytes em pt-BR', () => {
    expect(formatarBytes(0)).toBe('0 B');
    expect(formatarBytes(1536)).toBe('1,5 KB');
    expect(formatarBytes(5 * 1024 ** 3)).toBe('5 GB');
  });
});

describe('compressão do vídeo', () => {
  it('WebM sempre vira MP4', () => {
    expect(planoCompressaoVideo({ bytes: 100, duracao: 10, ext: 'webm' }).comprimir).toBe(true);
  });
  it('MP4 pesado (8 Mbps da gravação) comprime; leve fica', () => {
    expect(planoCompressaoVideo({ bytes: 10_000_000, duracao: 10, ext: 'mp4' }).comprimir).toBe(true); // 8 Mbps
    expect(planoCompressaoVideo({ bytes: 5_000_000, duracao: 10, ext: 'mp4' }).comprimir).toBe(false); // 4 Mbps
  });
});
