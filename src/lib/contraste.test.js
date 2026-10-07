import { describe, it, expect } from 'vitest';
import { contraste, textoSobre, corLegivel, MINIMO_TEXTO } from './contraste.js';
import { dadosDoPacote, gerarPreviaLojaHTML } from './pacote-loja.js';
import { gerarSiteHTML } from './sitegen.js';

// Cores de cliente difíceis: médias (nem claras nem escuras), claras e saturadas.
const CORES = ['#c2410c', '#e11d48', '#4f46e5', '#22c55e', '#facc15', '#ffffff', '#000000', '#808080', '#0ea5e9', '#d97706', '#777', '#9333ea'];

describe('contraste automático da cor do cliente', () => {
  it('mede como o WCAG (preto x branco = 21, iguais = 1)', () => {
    expect(contraste('#000', '#fff')).toBeCloseTo(21, 1);
    expect(contraste('#4f46e5', '#4f46e5')).toBe(1);
  });
  it.each(CORES)('texto sobre fundo %s chega a 4,5:1', (cor) => {
    expect(contraste(textoSobre(cor), cor)).toBeGreaterThanOrEqual(MINIMO_TEXTO);
  });
  it.each(CORES)('texto na cor %s sobre branco chega a 4,5:1', (cor) => {
    expect(contraste(corLegivel(cor, '#ffffff'), '#ffffff')).toBeGreaterThanOrEqual(MINIMO_TEXTO);
  });
  it('texto na cor do cliente sobre fundo escuro também chega a 4,5:1', () => {
    for (const cor of CORES) expect(contraste(corLegivel(cor, '#111827'), '#111827')).toBeGreaterThanOrEqual(MINIMO_TEXTO);
  });
  it('cor que já passa não muda', () => { expect(corLegivel('#4f46e5', '#ffffff')).toBe('#4f46e5'); });
  it('cor inválida cai num texto escuro seguro', () => { expect(corLegivel('azul')).toBe('#111827'); expect(textoSobre('')).toBe('#ffffff'); });
});

describe('prévia da loja e site usam a cor calculada sem trocar a cor do cliente', () => {
  const cliente = { nome: 'Loja', marca: {} };
  const produtos = [{ id: 'p1', nome: 'Produto', preco: 129.9, precoPromocional: 99.9, fotos: [] }];
  it('loja: fundo continua na cor do cliente; texto do banner, CTA, preço e "de" passam de 4,5', () => {
    const site = { plataforma: 'nuvemshop', pacote: { briefingTema: { paletaSugerida: ['#d9734a'] } } };
    const html = gerarPreviaLojaHTML(dadosDoPacote({ cliente, site, produtos }));
    expect(html).toContain('.banner{background:#d9734a;');
    const cta = html.match(/\.cta\{[^}]*color:(#[\da-f]{6})/)[1];
    expect(contraste(cta, '#ffffff')).toBeGreaterThanOrEqual(MINIMO_TEXTO);
    const precoCor = html.match(/\.preco b\{color:(#[\da-f]{6})/)[1];
    expect(contraste(precoCor, '#ffffff')).toBeGreaterThanOrEqual(MINIMO_TEXTO);
    const banner = html.match(/\.banner\{background:#d9734a;color:(#[\da-f]{6})/)[1];
    expect(contraste(banner, '#d9734a')).toBeGreaterThanOrEqual(MINIMO_TEXTO);
    const de = html.match(/\.de\{[^}]*color:(#[\da-f]{6})/)[1];
    expect(contraste(de, '#ffffff')).toBeGreaterThanOrEqual(MINIMO_TEXTO);
  });
  it('site: --cor fica a escolhida; texto sobre ela e preço riscado passam de 4,5', () => {
    const html = gerarSiteHTML({ cliente, produtos, conteudo: {}, config: { corPrimaria: '#facc15' } });
    expect(html).toContain('--cor:#facc15');
    const sobre = html.match(/--sobre-cor:(#[\da-f]{6})/)[1];
    expect(contraste(sobre, '#facc15')).toBeGreaterThanOrEqual(MINIMO_TEXTO);
    const riscado = html.match(/\.preco s\{color:(#[\da-f]{6})/)[1];
    expect(contraste(riscado, '#ffffff')).toBeGreaterThanOrEqual(MINIMO_TEXTO);
  });
  it('site no celular tem menu ☰ só com CSS e alvos de 44px', () => {
    const html = gerarSiteHTML({ cliente, produtos, conteudo: {}, config: {} });
    expect(html).toContain('id="menu-site" class="menu-toggle"');
    expect(html).toMatch(/\.menu-toggle:checked~nav\{display:flex\}/);
    expect(html).toMatch(/\.btn,[^{]*\{min-height:44px\}/);
  });
});
