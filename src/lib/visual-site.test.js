import { describe, it, expect } from 'vitest';
import { normalizarVisual, printsDoCliente, printsSemAutorizacao, imagensParaBanner, ORDEM_LOJA } from './visual-site.js';

describe('escolhas visuais do pacote', () => {
  it('padrão: fotos preenchendo, sem banner; "Clientes reais" logo depois do banner', () => {
    const v = normalizarVisual(undefined);
    expect(v).toEqual({ ordem: ORDEM_LOJA, ocultas: [], ajusteFotos: 'cover', banner: null });
    expect(v.ordem.slice(0, 2)).toEqual(['banner', 'provas']);
  });
  it('ordem salva antes de existir "Clientes reais" ganha a seção depois do banner, sem mexer no resto', () => {
    const v = normalizarVisual({ ordem: ['produtos', 'banner', 'confianca', 'depoimentos', 'sobre', 'faq', 'xxx'], ocultas: ['faq', 'yyy'], ajusteFotos: 'contain', banner: { url: 'u.jpg', materialId: 'm1' } });
    expect(v.ordem).toEqual(['produtos', 'banner', 'provas', 'confianca', 'depoimentos', 'sobre', 'faq']);
    expect(v.ocultas).toEqual(['faq']);
    expect(v.ajusteFotos).toBe('contain');
    expect(v.banner).toEqual({ materialId: 'm1', url: 'u.jpg', nome: 'imagem' });
  });
  it('banner só com imagem dos Materiais (sem vídeo nem print da referência)', () => {
    const lista = [{ id: 'f', url: 'a.jpg', nome: 'a.jpg' }, { id: 'v', url: 'b.mp4', nome: 'b.mp4', tipo: 'video/mp4' }, { id: 'r', url: 'r.png', origem: 'referencia' }];
    expect(imagensParaBanner(lista).map((m) => m.id)).toEqual(['f']);
  });
});

describe('prints de clientes reais', () => {
  const prova = (id, extra) => ({ id, url: `${id}.jpg`, origem: 'prova_social', etiquetas: ['prova social'], criadoEm: `2026-10-0${id.length}T00:00:00Z`, ...extra });
  it('mesmo arquivo em Materiais e em Provas sociais aparece uma vez (fica a cópia protegida)', () => {
    const lista = [
      { id: 'mat', url: 'mat.jpg', origem: 'envio', etiquetas: ['prova social'], hash: 'abc', criadoEm: '2026-10-01T00:00:00Z' },
      prova('prova', { hashOriginal: 'abc', tarjas: 2 }),
      prova('outro', { borrada: { url: 'outro-borrado.jpg' } }),
      { id: 'foto', url: 'foto.jpg', origem: 'envio' }, // foto comum não entra
    ];
    const p = printsDoCliente(lista);
    expect(p.map((x) => x.id)).toEqual(['prova', 'outro']);
    expect(p[1]).toMatchObject({ url: 'outro-borrado.jpg', original: 'outro.jpg', protegido: true });
  });
  it('sem borrar e sem autorização: pede autorização; autorizado ou protegido não pede', () => {
    const p = printsDoCliente([prova('a'), prova('bb', { autorizado: true }), prova('ccc', { borrada: { url: 'x.jpg' } })]);
    expect(printsSemAutorizacao(p).map((x) => x.id)).toEqual(['a']);
  });
});
