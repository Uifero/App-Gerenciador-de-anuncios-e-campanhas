// Testes da prova social: criativo aprovado -> depoimento do site, preservando os depoimentos escritos à mão.
import { describe, it, expect } from 'vitest';
import { criativoParaDepoimento, mesclarDepoimentos, faqParaTexto, textoParaFaq, perguntasDasObjecoes } from './sites.js';
import { respostasSite, progressoSite, formatoAtual } from './perguntas-site.js';
import { objecoesDe, normalizarFaq } from '../core/ia.js';

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

describe('FAQ no formulário', () => {
  it('ida e volta texto <-> lista', () => {
    const faq = [{ p: 'E se não servir?', r: 'Troca grátis | sem custo' }];
    expect(textoParaFaq(faqParaTexto(faq))).toEqual(faq);
  });
  it('objeções viram perguntas com resposta em branco (sem IA)', () => {
    const c = { marca: { objecoes: '- demora pra chegar\nE se não servir?;preço alto' } };
    expect(objecoesDe(c)).toEqual(['demora pra chegar', 'E se não servir?', 'preço alto']);
    expect(perguntasDasObjecoes(c)).toBe('Demora pra chegar? | \nE se não servir? | \nPreço alto? | ');
    expect(perguntasDasObjecoes({ marca: {} })).toBe('');
  });
  it('normalizarFaq aceita pergunta/resposta por extenso e descarta incompletos', () => {
    expect(normalizarFaq([{ pergunta: 'a', resposta: 'b' }, { p: 'c' }])).toEqual([{ p: 'a', r: 'b' }]);
  });
});

describe('Perguntas para montar o site', () => {
  it('conta as 10 respostas (0 a i) a partir dos dados reais', () => {
    expect(progressoSite({ marca: {} }, null, [])).toBe(0);
    const cli = { siteReferencia: 'https://x.com', marca: { tomDeVoz: 'premium', usp: 'u', objecoes: 'o', provasSociais: 'p' }, rastreamento: { metaPixelId: '123456789' } };
    const site = { modo: 'custom', pagamentoPreferido: 'stripe' };
    expect(progressoSite(cli, site, [{ id: 'p' }])).toBe(9); // falta só a pergunta 0
    cli.leituraSite = { url: 'https://loja.com.br/' };
    expect(Object.values(respostasSite(cli, site, [{ id: 'p' }])).every(Boolean)).toBe(true);
    expect(progressoSite(cli, site, [{ id: 'p' }])).toBe(10);
  });
  it('"ainda não tem pixel" conta como respondida; o formato vem do modo/plataforma', () => {
    expect(respostasSite({ marca: {} }, { semPixel: true }, []).pixel).toBe(true);
    expect(formatoAtual({ modo: 'pacote_plataforma', plataforma: 'shopify' })).toBe('shopify');
    expect(formatoAtual({ modo: 'custom' })).toBe('custom');
    expect(formatoAtual(null)).toBe('');
  });
});
