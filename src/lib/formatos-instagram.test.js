import { describe, it, expect } from 'vitest';
import { FORMATOS_INSTAGRAM, zonaSegura, foraDaZona, nomeFormato, MARGENS_ZONA } from './formatos-instagram.js';
import { FORMATOS_IMAGEM, caixasDaPeca } from './estudio.js';

describe('formatos do Instagram', () => {
  it('9:16 e 4:5 vêm antes; 1:1 só quando pedirem', () => {
    expect(FORMATOS_INSTAGRAM.map(([f]) => f)).toEqual(['1080x1920', '1080x1350', '1080x1080']);
    expect(FORMATOS_IMAGEM).toBe(FORMATOS_INSTAGRAM);
  });
  it('nomes de arquivo dizem o formato', () => {
    expect(nomeFormato('1080x1920', 'video')).toBe('reels-9x16');
    expect(nomeFormato('1080x1920')).toBe('stories-9x16');
    expect(nomeFormato('1080x1350')).toBe('feed-4x5');
    expect(nomeFormato('1080x1080')).toBe('feed-1x1');
  });
});

describe('zona segura', () => {
  it('9:16: 14% em cima, 35% embaixo, 6% dos lados (270/672/65 px)', () => {
    const z = zonaSegura(1080, 1920);
    expect([z.topo, z.base, z.lados]).toEqual([269, 672, 65]);
    expect(MARGENS_ZONA.vertical).toEqual({ topo: 0.14, base: 0.35, lados: 0.06 });
  });
  it('4:5 e 1:1: 5% em volta', () => {
    expect(zonaSegura(1080, 1350)).toMatchObject({ topo: 68, base: 68, lados: 54 });
    expect(zonaSegura(1080, 1080)).toMatchObject({ topo: 54, base: 54, lados: 54 });
  });
  it('acusa texto na faixa de baixo do Reels e aceita o que está no centro', () => {
    const caixas = [{ nome: 'hook', x: 100, y: 800, w: 880, h: 200 }, { nome: 'cta', x: 100, y: 1500, w: 400, h: 90 }, { nome: 'logo', x: 30, y: 300, w: 200, h: 60 }];
    expect(foraDaZona(caixas, 1080, 1920)).toEqual(['cta', 'logo']);
    expect(foraDaZona([{ nome: 'vazio', x: 0, y: 0, w: 0, h: 0 }], 1080, 1920)).toEqual([]);
  });
  it.each([['1080x1920'], ['1080x1350'], ['1080x1080']])('templates do Estúdio põem hook, CTA e logo dentro da zona no %s', (formato) => {
    const [w, h] = formato.split('x').map(Number);
    for (const template of ['destaque', 'cartao', 'texto']) {
      const caixas = caixasDaPeca(w, h, { template, hook: 'Sua tarde não precisa travar às 15h com tanta coisa para fazer', cta: 'Conheça a Thermora', temLogo: true, temMidia: template !== 'texto' });
      expect(foraDaZona(caixas, w, h), `${template} ${formato}`).toEqual([]);
    }
  });
});
