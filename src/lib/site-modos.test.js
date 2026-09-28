// Consistência entre o site personalizado e o pacote Nuvemshop/Shopify do mesmo cliente.
import { describe, it, expect } from 'vitest';
import { baseDoCustom, baseDoPacote, aplicarBaseNoPacote, aplicarBaseNoCustom, divergencias, baseParaGerar, temCustom, temPacote } from './site-modos.js';
import { criarZip } from './zip.js';

const custom = {
  conteudo: { heroTitulo: 'Leggings que não marcam', heroSubtitulo: 'Conforto no treino', heroCta: 'Ver coleção', storytelling: 'Nascemos em 2019.',
    faq: [{ p: 'E se não servir?', r: 'Troca grátis.' }], depoimentos: [{ nome: 'Ana', texto: 'Amei' }, { nome: 'Loja', texto: 'Hook', origem: 'criativo', midiaUrl: 'https://x/v.mp4' }] },
  config: { corPrimaria: '#aa3355', corFundo: '#ffffff' },
};
const pacoteIa = { banners: [{ titulo: 'Outro título', subtitulo: 'Outro', cta: 'Comprar', uso: 'Banner principal desktop' }, { titulo: 'Frete', subtitulo: 'grátis', cta: 'Ver', uso: 'faixa' }],
  briefingTema: { estilo: 'clean', paletaSugerida: ['#123456', '#AA3355'] }, textosPagina: { sobre: 'Outra história', faq: [{ p: 'x', r: 'y' }] }, descricoesProdutos: [{ nome: 'L' }] };

describe('reaproveitar entre modos', () => {
  it('custom -> pacote: banner principal, Sobre, FAQ, paleta e depoimentos vêm do site; o resto da IA fica', () => {
    const p = aplicarBaseNoPacote(pacoteIa, baseDoCustom(custom));
    expect(p.banners[0]).toEqual({ titulo: 'Leggings que não marcam', subtitulo: 'Conforto no treino', cta: 'Ver coleção', uso: 'Banner principal desktop' });
    expect(p.banners[1].titulo).toBe('Frete');
    // versão mobile do banner principal (mesmo título do 1º) também recebe o texto novo
    const mob = aplicarBaseNoPacote({ banners: [{ titulo: 'A', uso: 'desktop' }, { titulo: 'A', uso: 'mobile' }, { titulo: 'B' }] }, { heroTitulo: 'Novo' });
    expect(mob.banners.map((b) => b.titulo)).toEqual(['Novo', 'Novo', 'B']);
    expect(p.textosPagina.sobre).toBe('Nascemos em 2019.');
    expect(p.textosPagina.faq).toEqual([{ p: 'E se não servir?', r: 'Troca grátis.' }]);
    expect(p.briefingTema.paletaSugerida).toEqual(['#aa3355', '#ffffff', '#123456']); // sem repetir a cor que a IA já tinha
    expect(p.briefingTema.estilo).toBe('clean');
    expect(p.depoimentos).toHaveLength(2);
    expect(p.descricoesProdutos).toHaveLength(1);
  });
  it('pacote -> custom: textos e cor principal vêm do pacote; depoimentos escritos à mão ficam', () => {
    const site = { pacote: aplicarBaseNoPacote(pacoteIa, baseDoCustom(custom)) };
    const r = aplicarBaseNoCustom({ heroTitulo: 'IA nova', politicas: { trocas: 't' }, depoimentos: [{ nome: 'Bia', texto: 'ok' }] }, { whatsapp: '55' }, baseDoPacote(site));
    expect(r.conteudo.heroTitulo).toBe('Leggings que não marcam');
    expect(r.conteudo.storytelling).toBe('Nascemos em 2019.');
    expect(r.conteudo.politicas.trocas).toBe('t');
    expect(r.conteudo.depoimentos.map((d) => d.nome)).toEqual(['Bia', 'Loja']);
    expect(r.config).toEqual({ whatsapp: '55', corPrimaria: '#aa3355' });
  });
  it('baseParaGerar: só na 1ª geração do segundo modo', () => {
    expect(baseParaGerar(custom, 'pacote')).toMatchObject({ heroTitulo: 'Leggings que não marcam' });
    expect(baseParaGerar(custom, 'custom')).toBeNull();
    expect(baseParaGerar({ ...custom, pacote: pacoteIa }, 'pacote')).toBeNull(); // pacote já existe: geração livre
    expect(baseParaGerar({ pacote: pacoteIa }, 'custom')).toMatchObject({ heroTitulo: 'Outro título' });
    expect(baseParaGerar({}, 'custom')).toBeNull();
  });
  it('temCustom / temPacote', () => {
    expect(temCustom(custom)).toBe(true); expect(temPacote(custom)).toBe(false);
    expect(temCustom({ conteudo: { politicas: {} } })).toBe(false); expect(temPacote({ pacote: pacoteIa })).toBe(true);
  });
});

describe('divergências (oferta de sincronizar, nunca automática)', () => {
  it('iguais depois de sincronizar; edição no formulário aparece; campo vazio não conta', () => {
    const site = { ...custom, pacote: aplicarBaseNoPacote(pacoteIa, baseDoCustom(custom)) };
    expect(divergencias(site)).toEqual([]);
    const editado = { ...site, conteudo: { ...site.conteudo, heroTitulo: 'Novo título', heroCta: '' }, config: { ...site.config, corPrimaria: '#000000' } };
    expect(divergencias(editado)).toEqual(['título do banner', 'cor principal']);
    expect(divergencias(custom)).toEqual([]); // sem pacote, nada a oferecer
  });
});

describe('zip da pasta do site', () => {
  it('gera um .zip válido (assinaturas, nome UTF-8 e conteúdo sem compressão)', () => {
    const z = criarZip([{ nome: 'site-loja/index.html', conteudo: '<p>olá</p>' }]);
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
    const texto = new TextDecoder().decode(z);
    expect(texto).toContain('site-loja/index.html');
    expect(texto).toContain('<p>olá</p>');
  });
  it('CRC-32 certo (valor de conferência padrão de "123456789")', () => {
    const z = criarZip([{ nome: 'a.txt', conteudo: '123456789' }]);
    expect(new DataView(z.buffer).getUint32(14, true)).toBe(0xcbf43926);
  });
});
