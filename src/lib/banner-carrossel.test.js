// Várias fotos por lugar: banner em carrossel (seletor e texto), ordem por arrastar em Clientes reais e produtos,
// "Juntar fotos" no banner e sites antigos com uma imagem só.
import { describe, it, expect } from 'vitest';
import { mudarUso, comUsos, usosDe, lerReferencias, aplicarReferencias, slidesDoBanner, reordenar, juntarNoBanner, separarNoBanner, sugestoesJuntar, fotosDoProduto } from './fotos-site.js';
import { printsDoCliente } from './visual-site.js';
import { dadosDoPacote, gerarPreviaLojaHTML, gruposPlataforma } from './pacote-loja.js';
import { gerarSiteHTML } from './sitegen.js';

const foto = (n, usos = {}, extra = {}) => ({ id: `m${n}`, codigo: `F${n}`, url: `https://x/m${n}.jpg`, nome: `m${n}.jpg`, nomeOriginal: `m${n}.jpg`, origem: 'envio', tipo: 'image/jpeg', criadoEm: `2026-10-01T00:00:${String(n).padStart(2, '0')}Z`, usos, ...extra });
const emPe = { largura: 1080, altura: 1920 };
const base = () => [foto(15, {}, emPe), foto(36, {}, emPe), foto(40, {}, emPe), foto(7)];
const produtos = [{ id: 'p1', nome: 'Thermora', preco: 99, fotos: [] }];
const cods = (slides) => slides.map((s) => s.fotos.map((f) => f.codigo).join('+'));

describe('banner em carrossel', () => {
  it('pelo seletor: F36, F40, F15 marcadas nessa ordem viram 3 slides nessa ordem', () => {
    let l = base();
    for (const id of ['m36', 'm40', 'm15']) l = comUsos(l, mudarUso(l, id, { uso: 'banner' }));
    expect(cods(slidesDoBanner(l))).toEqual(['F36', 'F40', 'F15']);
  });
  it('pelo texto: "F36, F40, F15 no banner em carrossel" aplica as 3 nessa ordem, sem conflito', () => {
    const l = base();
    const { refs, avisos } = lerReferencias('F36, F40, F15 no banner em carrossel', { materiais: l, produtos });
    expect(avisos).toEqual([]);
    const r = aplicarReferencias(l, refs, { produtos });
    expect(r.conflitos).toEqual([]);
    expect(r.aplicadas).toEqual(['F36 → Banner', 'F40 → Banner', 'F15 → Banner']);
    const depois = comUsos(l, r.patches);
    expect(cods(slidesDoBanner(depois))).toEqual(['F36', 'F40', 'F15']);
    // gerar de novo com o mesmo texto: mesma ordem, nada duplicado
    const r2 = aplicarReferencias(depois, lerReferencias('F36, F40, F15 no banner em carrossel', { materiais: depois, produtos }).refs, { produtos });
    expect(cods(slidesDoBanner(comUsos(depois, r2.patches)))).toEqual(['F36', 'F40', 'F15']);
  });
  it('o seletor continua vencendo o texto', () => {
    let l = base(); l = comUsos(l, mudarUso(l, 'm7', { uso: 'banner' }));
    const r = aplicarReferencias(l, lerReferencias('F36 e F40 no banner', { materiais: l, produtos }).refs, { produtos });
    expect(r.patches).toEqual([]);
    expect(r.conflitos[0]).toMatch(/já foi escolhido no seletor \(F7\)/);
    expect(cods(slidesDoBanner(l))).toEqual(['F7']);
  });
  it('arrastar muda a ordem dos slides (e vira escolha do seletor)', () => {
    let l = base();
    l = comUsos(l, aplicarReferencias(l, lerReferencias('F36, F40, F15 no banner', { materiais: l, produtos }).refs, { produtos }).patches);
    l = comUsos(l, reordenar(l, 'banner', ['m15', 'm36', 'm40']));
    expect(cods(slidesDoBanner(l))).toEqual(['F15', 'F36', 'F40']);
    expect(usosDe(l.find((m) => m.id === 'm15')).banner).toBe('manual');
  });
  it('tirar uma foto do banner tira o slide (as outras ficam na ordem)', () => {
    let l = base();
    for (const id of ['m36', 'm40', 'm15']) l = comUsos(l, mudarUso(l, id, { uso: 'banner' }));
    l = comUsos(l, mudarUso(l, 'm40', { uso: 'banner', ligado: false }));
    expect(cods(slidesDoBanner(l))).toEqual(['F36', 'F15']);
  });
});

describe('"Juntar fotos" (fotos em pé no banner)', () => {
  let l = base();
  for (const id of ['m36', 'm40', 'm15']) l = comUsos(l, mudarUso(l, id, { uso: 'banner' }));
  it('sugere juntar quando há fotos em pé seguidas no banner', () => {
    expect(sugestoesJuntar(slidesDoBanner(l))).toEqual([{ ids: ['m36', 'm40', 'm15'], codigos: ['F36', 'F40', 'F15'] }]);
  });
  it('junta 2 lado a lado num slide; depois 3; separar volta a 3 slides', () => {
    let j = comUsos(l, juntarNoBanner(l, ['m36', 'm40']));
    expect(cods(slidesDoBanner(j))).toEqual(['F36+F40', 'F15']);
    expect(slidesDoBanner(j)[0].junto).toBe(true);
    expect(sugestoesJuntar(slidesDoBanner(j))).toEqual([]); // sobrou só uma em pé sozinha
    j = comUsos(j, juntarNoBanner(j, ['m36', 'm40', 'm15']));
    expect(cods(slidesDoBanner(j))).toEqual(['F36+F40+F15']);
    j = comUsos(j, separarNoBanner(j, 'm36'));
    expect(cods(slidesDoBanner(j))).toEqual(['F36', 'F40', 'F15']);
  });
  it('foto que sai do banner sai do slide junto', () => {
    let j = comUsos(l, juntarNoBanner(l, ['m36', 'm40']));
    j = comUsos(j, mudarUso(j, 'm40', { uso: 'banner', ligado: false }));
    expect(cods(slidesDoBanner(j))).toEqual(['F36', 'F15']);
  });
});

describe('várias fotos em Clientes reais e nos produtos, com ordem', () => {
  it('Clientes reais: prints e fotos, na ordem arrastada', () => {
    let l = [foto(1, {}, { etiquetas: ['prova social'] }), foto(2, { clientes: 'manual' }), foto(3, { clientes: 'manual' })];
    const antes = printsDoCliente(l).map((p) => p.codigo);
    l = comUsos(l, reordenar(l, 'clientes', ['m3', 'm1', 'm2']));
    expect(printsDoCliente(l).map((p) => p.codigo)).toEqual(['F3', 'F1', 'F2']);
    expect(antes).toHaveLength(3);
  });
  it('produto: arrastar muda a ordem e a 1ª vira a foto principal', () => {
    let l = [1, 2, 3].map((n) => foto(n));
    for (const id of ['m1', 'm2', 'm3']) l = comUsos(l, mudarUso(l, id, { uso: 'produto', produtoId: 'p1' }));
    l = comUsos(l, reordenar(l, 'produto', ['m3', 'm1', 'm2'], 'p1'));
    expect(fotosDoProduto({ id: 'p1', fotosMigradas: true }, l).map((f) => f.codigo)).toEqual(['F3', 'F1', 'F2']);
    expect(usosDe(l[2]).produtos[0].principal).toBe(true);
    expect(usosDe(l[0]).produtos[0].principal).toBe(false);
  });
});

describe('prévia, link de aprovação e site personalizado', () => {
  let l = base();
  for (const id of ['m36', 'm40', 'm15']) l = comUsos(l, mudarUso(l, id, { uso: 'banner' }));
  l = l.map((m) => (m.id === 'm36' ? { ...m, foco: { x: 0.4, y: 0.15 } } : m));
  const site = { modo: 'pacote_plataforma', plataforma: 'shopify', plataformaConfirmada: true, tema: 'dawn', pacote: { banners: [{ titulo: 'Oi' }] } };
  const d = dadosDoPacote({ cliente: { nome: 'Loja' }, site, produtos, materiais: l });
  it('prévia do pacote (a mesma do link de aprovação): carrossel com 3 slides na ordem e recorte pelo ponto', () => {
    const h = gerarPreviaLojaHTML(d);
    expect(h).toContain('data-carrossel="3"');
    expect(h.indexOf('m36.jpg')).toBeLessThan(h.indexOf('m40.jpg')); expect(h.indexOf('m40.jpg')).toBeLessThan(h.indexOf('m15.jpg'));
    expect(h).toContain('src="https://x/m36.jpg" alt="Loja" style="--pos:40% 15%"');
    expect(h).not.toMatch(/<script/i);
  });
  it('"O que colocar na plataforma": arquivo de cada slide no computador e no celular', () => {
    const g = gruposPlataforma(d).find((x) => x.id === 'visual-banner');
    expect(g.titulo).toBe('Imagens do banner: carrossel com 3 slides, nesta ordem');
    expect(g.itens.find((i) => i.rotulo === 'Slide 2').valor).toBe('Computador: banner/banner-2-desktop.jpg (2400×1000)\nCelular: banner/banner-2-mobile.jpg (1080×1350)\nFotos: F40 — m40.jpg');
    expect(g.itens.find((i) => i.rotulo === 'Tamanhos').valor).toMatch(/Dawn/);
  });
  it('site personalizado: carrossel no topo', () => {
    const h = gerarSiteHTML({ cliente: { id: 'c', nome: 'Loja' }, produtos, conteudo: { heroTitulo: 'Oi' }, materiais: l });
    expect(h).toContain('<div id="topo" class="hero com-carrossel"><div class="car car-3"');
    expect(h).toContain('@keyframes car3');
  });
  it('site antigo com uma imagem só no banner continua igual (slide único, sem setas)', () => {
    const antigo = { ...site, pacote: { ...site.pacote, visual: { banner: { materialId: 'm7', url: 'https://x/m7.jpg', nome: 'm7.jpg' } } } };
    const d2 = dadosDoPacote({ cliente: { nome: 'Loja' }, site: antigo, produtos, materiais: base() });
    expect(cods(d2.visual.slides)).toEqual(['F7']);
    const h = gerarPreviaLojaHTML(d2);
    expect(h).toContain('data-carrossel="1"'); expect(h).not.toContain('class="car-seta"');
    const hc = gerarSiteHTML({ cliente: { id: 'c', nome: 'Loja' }, produtos, conteudo: {}, layout: { imagens: { hero: { materialId: 'm7', url: 'https://x/m7.jpg', nome: 'm7' } } }, materiais: base() });
    expect(hc).toContain('<img src="https://x/m7.jpg"');
  });
});
