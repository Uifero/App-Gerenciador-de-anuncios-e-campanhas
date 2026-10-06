// Medidas por lugar, recorte com ponto focal e o plano de arquivos do .zip "Imagens por lugar".
import { describe, it, expect } from 'vitest';
import { medidasDe, recorte, encaixe, fatias, normalizarFoco, posicaoCss, ehVertical, planoArquivos } from './medidas-site.js';
import { carrosselHtml, carrosselCss } from './carrossel.js';

describe('medidas por lugar e plataforma', () => {
  it('banner largo no computador e mais alto no celular; produto quadrado; Clientes reais em pé', () => {
    const m = medidasDe(null);
    expect(m.banner.desktop.l / m.banner.desktop.a).toBeGreaterThan(2);
    expect(m.banner.mobile.l / m.banner.mobile.a).toBeLessThan(1);
    expect(m.produto.desktop.l).toBe(m.produto.desktop.a);
    expect(m.clientes.desktop.a).toBeGreaterThan(m.clientes.desktop.l);
    expect(m.galeria.mobile).toBeNull();
    expect(m.banner.fonte).toMatch(/padrão do app/);
  });
  it('Shopify: produto 2048×2048 e nota do tema Dawn; Nuvemshop: produto quadrado e banner com celular separado', () => {
    const s = medidasDe('shopify', 'Dawn');
    expect(s.produto.desktop).toEqual({ l: 2048, a: 2048 });
    expect(s.banner.desktop).toEqual({ l: 2400, a: 1000 });
    expect(s.banner.nota).toMatch(/Dawn/);
    expect(medidasDe('shopify', 'horizon').banner.nota).toMatch(/Horizon/);
    const n = medidasDe('nuvemshop');
    expect(n.produto.desktop).toEqual({ l: 1024, a: 1024 });
    expect(n.banner.mobile).toEqual({ l: 1080, a: 1350 });
    expect(n.banner.nota).toBeUndefined();
  });
});

describe('recorte com ponto focal', () => {
  const dentro = (r, w, h, f) => { const px = f.x * w, py = f.y * h; return px >= r.x - 1e-9 && px <= r.x + r.w + 1e-9 && py >= r.y - 1e-9 && py <= r.y + r.h + 1e-9; };
  it('foto em pé no banner largo: largura inteira, altura cortada em volta do rosto', () => {
    const r = recorte(1080, 1920, 2.4, { x: 0.5, y: 0.2 });
    expect(r.w).toBe(1080); expect(r.h).toBeCloseTo(450);
    expect(r.y).toBeCloseTo(0.2 * (1920 - 450));
    expect(dentro(r, 1080, 1920, { x: 0.5, y: 0.2 })).toBe(true);
  });
  it('o ponto escolhido fica dentro de TODO recorte (qualquer foto, proporção e ponto)', () => {
    const fotos = [[1080, 1920], [4000, 3000], [1000, 1000], [3000, 600]];
    const proporcoes = [2.4, 0.8, 1, 1.6, 4 / 5, 1 / 3];
    for (const [w, h] of fotos) for (const a of proporcoes) for (const x of [0, 0.1, 0.5, 0.93, 1]) for (const y of [0, 0.3, 0.77, 1]) {
      const r = recorte(w, h, a, { x, y });
      expect(r.w / r.h).toBeCloseTo(a, 6);
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(w + 1e-9); expect(r.y + r.h).toBeLessThanOrEqual(h + 1e-9);
      expect(dentro(r, w, h, { x, y })).toBe(true);
    }
  });
  it('sem ponto marcado = centro; valores fora de 0..1 são limitados; CSS equivalente', () => {
    expect(normalizarFoco(undefined)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizarFoco({ x: -2, y: 7 })).toEqual({ x: 0, y: 1 });
    expect(recorte(2000, 1000, 1, null)).toEqual({ x: 500, y: 0, w: 1000, h: 1000 });
    expect(posicaoCss({ x: 0.3, y: 0.125 })).toBe('30% 12.5%');
  });
  it('"Mostrar inteira" encaixa sem cortar; "Juntar fotos" divide a largura sem sobrar pixel', () => {
    expect(encaixe(1000, 2000, 1000, 1000)).toEqual({ x: 250, y: 0, w: 500, h: 1000 });
    const f = fatias(3, 1920, 800);
    expect(f.map((x) => x.w).reduce((a, b) => a + b)).toBe(1920);
    expect(f[2].x + f[2].w).toBe(1920);
  });
  it('foto em pé = mais alta que larga (com folga); sem medidas, não', () => {
    expect(ehVertical({ largura: 1080, altura: 1920 })).toBe(true);
    expect(ehVertical({ largura: 1000, altura: 1050 })).toBe(false);
    expect(ehVertical({})).toBe(false);
  });
});

describe('pacote .zip: um arquivo por lugar e aparelho, já no tamanho', () => {
  const d = {
    plataforma: 'shopify', tema: 'dawn',
    visual: { ajusteFotos: 'cover', slides: [
      { fotos: [{ url: 'u36', codigo: 'F36', foco: { x: 0.5, y: 0.2 } }] },
      { fotos: [{ url: 'u40', codigo: 'F40' }, { url: 'u15', codigo: 'F15' }] },
    ] },
    produtos: [{ nome: 'Thermora', arquivos: [{ url: 'p1', codigo: 'F5' }, { url: 'p2', codigo: 'F6' }] }],
    provas: [{ url: 'print', codigo: 'F8' }, { url: 'pessoa', codigo: 'F9', foto: true, foco: { x: 0.4, y: 0.3 } }],
    sobreImagens: [{ url: 's1', codigo: 'F2' }], galeria: [{ url: 'g1', codigo: 'F3' }],
  };
  d.medidas = medidasDe(d.plataforma, d.tema);
  const plano = planoArquivos(d);
  it('nomes claros e tamanhos de cada lugar', () => {
    expect(plano.map((a) => `${a.caminho} ${a.l}x${a.a}`)).toEqual([
      'banner/banner-1-desktop.jpg 2400x1000', 'banner/banner-1-mobile.jpg 1080x1350',
      'banner/banner-2-desktop.jpg 2400x1000', 'banner/banner-2-mobile.jpg 1080x1350',
      'produtos/thermora/produto-1.jpg 2048x2048', 'produtos/thermora/produto-2.jpg 2048x2048',
      'clientes-reais/cliente-1.jpg 1080x1350', 'clientes-reais/cliente-2.jpg 1080x1350',
      'sobre/sobre-1-desktop.jpg 1600x1000', 'sobre/sobre-1-mobile.jpg 1080x1080',
      'galeria/galeria-1.jpg 1080x1080',
    ]);
  });
  it('ponto focal e "Juntar fotos" vão junto; print de cliente nunca é cortado', () => {
    expect(plano[0].fotos[0].foco).toEqual({ x: 0.5, y: 0.2 });
    expect(plano[2].fotos.map((f) => f.codigo)).toEqual(['F40', 'F15']);
    expect(plano.find((a) => a.caminho === 'clientes-reais/cliente-1.jpg').ajuste).toBe('contain');
    expect(plano.find((a) => a.caminho === 'clientes-reais/cliente-2.jpg').ajuste).toBe('cover');
  });
  it('"Mostrar inteiras" nas fotos dos produtos: o arquivo do produto sai sem corte', () => {
    const p2 = planoArquivos({ ...d, visual: { ...d.visual, ajusteFotos: 'contain' } });
    expect(p2.filter((a) => a.lugar === 'produto').every((a) => a.ajuste === 'contain')).toBe(true);
    expect(p2.filter((a) => a.lugar === 'banner').every((a) => a.ajuste === 'cover')).toBe(true);
  });
  it('site antigo (só a imagem única do banner, sem slides): vira banner-1', () => {
    expect(planoArquivos({ visual: { banner: { url: 'b', codigo: 'F1' } } }).map((a) => a.caminho)).toEqual(['banner/banner-1-desktop.jpg', 'banner/banner-1-mobile.jpg']);
  });
});

describe('carrossel só com CSS', () => {
  const med = medidasDe(null).banner;
  const slides = [{ fotos: [{ url: 'a.jpg', foco: { x: 0.5, y: 0.2 } }] }, { fotos: [{ url: 'b.jpg' }, { url: 'c.jpg' }] }, { fotos: [{ url: 'd.jpg' }] }];
  it('slides na ordem, setas, pontos e proporção por aparelho', () => {
    const h = carrosselHtml({ slides, medida: med, conteudo: '<h1>Oi</h1>' });
    expect(h).toContain('data-carrossel="3"');
    expect(h.indexOf('a.jpg')).toBeLessThan(h.indexOf('b.jpg')); expect(h.indexOf('c.jpg')).toBeLessThan(h.indexOf('d.jpg'));
    expect(h).toContain('style="--pos:50% 20%"');
    expect(h).toContain('class="car-slide car-junto"');
    expect((h.match(/class="car-seta"/g) || []).length).toBe(6);
    expect(h).toContain('--rd:2.4000;--rm:0.8000');
    const css = carrosselCss({ n: 3 });
    expect(css).toContain('@keyframes car3');
    expect(css).toContain('#bn-2:checked~.car-trilho .car-slide:nth-child(3){opacity:1}');
    expect(css).not.toMatch(/<script/);
  });
  it('um slide só: imagem fixa, sem setas, pontos nem animação', () => {
    const h = carrosselHtml({ slides: slides.slice(0, 1), medida: med });
    expect(h).not.toContain('car-seta'); expect(h).not.toContain('type="radio"');
    expect(carrosselCss({ n: 1 })).not.toContain('@keyframes');
  });
});
