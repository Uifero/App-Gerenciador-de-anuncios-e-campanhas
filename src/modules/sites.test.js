// Testes da prova social: criativo aprovado -> depoimento do site, preservando os depoimentos escritos à mão.
import { describe, it, expect } from 'vitest';
import { criativoParaDepoimento, mesclarDepoimentos } from './sites.js';

const cliente = { id: 'cli1', nome: 'Loja da Ana' };

describe('criativoParaDepoimento', () => {
  it('usa o hook como texto e marca a origem/criativoId', () => {
    const d = criativoParaDepoimento(cliente, { id: 'c1', hook: 'Nunca vi nada igual', copy: 'copy longa...' });
    expect(d).toMatchObject({ nome: 'Loja da Ana', texto: 'Nunca vi nada igual', origem: 'criativo', criativoId: 'c1', midiaUrl: null, midiaTipo: null });
  });

  it('usa a copy (cortada) quando não há hook', () => {
    const d = criativoParaDepoimento(cliente, { id: 'c1', hook: '', copy: 'x'.repeat(300) });
    expect(d.texto).toHaveLength(200);
  });

  it('identifica vídeo pela extensão do arquivo anexado', () => {
    const d = criativoParaDepoimento(cliente, { id: 'c1', hook: 'h', arquivoUrl: 'https://x/video.mp4', arquivoNome: 'video.mp4' });
    expect(d.midiaTipo).toBe('video');
    expect(d.midiaUrl).toBe('https://x/video.mp4');
  });

  it('identifica imagem quando a extensão não é de vídeo', () => {
    const d = criativoParaDepoimento(cliente, { id: 'c1', hook: 'h', arquivoUrl: 'https://x/foto.jpg', arquivoNome: 'foto.jpg' });
    expect(d.midiaTipo).toBe('imagem');
  });
});

describe('mesclarDepoimentos', () => {
  it('substitui os depoimentos de origem "criativo" pelos novos, preservando os escritos à mão', () => {
    const atuais = [{ nome: 'Ana', texto: 'escrito à mão' }, { nome: 'Bia', texto: 'antigo', origem: 'criativo', criativoId: 'c1' }];
    const novos = [{ nome: 'Loja', texto: 'novo', origem: 'criativo', criativoId: 'c2' }];
    const out = mesclarDepoimentos(atuais, novos);
    expect(out).toHaveLength(2);
    expect(out.find((d) => d.nome === 'Ana')).toBeTruthy(); // manual preservado
    expect(out.find((d) => d.criativoId === 'c1')).toBeFalsy(); // antigo de criativo removido
    expect(out.find((d) => d.criativoId === 'c2')).toBeTruthy(); // novo entrou
  });

  it('funciona com listas vazias', () => {
    expect(mesclarDepoimentos([], [])).toEqual([]);
    expect(mesclarDepoimentos(undefined, [{ nome: 'x', texto: 'y' }])).toHaveLength(1);
  });
});
