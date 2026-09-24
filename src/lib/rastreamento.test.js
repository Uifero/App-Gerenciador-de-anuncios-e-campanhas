// Pixel do Meta / Google Ads: validação dos IDs, código inserido no site custom e passos do manual do pacote.
import { describe, it, expect } from 'vitest';
import { normalizarRastreamento, statusPixel, codigoHead, codigoCheckout, passosRastreamentoPacote } from './rastreamento.js';
import { gerarSiteHTML } from './sitegen.js';

const PRODUTOS = [{ id: 'p1', nome: 'Legging', preco: 89, fotos: [] }];
const cliente = (rastreamento) => ({ id: 'c1', nome: 'Loja Teste', nicho: 'moda fitness', marca: {}, rastreamento });

describe('normalizarRastreamento', () => {
  it('aceita em branco (campo opcional)', () => {
    expect(normalizarRastreamento({})).toEqual({ valor: { metaPixelId: '', googleAdsId: '', googleAdsRotulo: '' }, erros: [] });
  });
  it('limpa espaços, aceita "aw-" minúsculo e separa o rótulo da conversão', () => {
    const r = normalizarRastreamento({ metaPixelId: ' 1234 5678 9012 345 ', googleAdsId: 'aw-987654321/AbC-12_x' });
    expect(r.erros).toEqual([]);
    expect(r.valor).toEqual({ metaPixelId: '123456789012345', googleAdsId: 'AW-987654321', googleAdsRotulo: 'AbC-12_x' });
  });
  it('recusa formatos errados (e nunca guarda o valor inválido)', () => {
    const r = normalizarRastreamento({ metaPixelId: '12ab34', googleAdsId: 'G-XYZ123' });
    expect(r.erros).toHaveLength(2);
    expect(r.valor.metaPixelId).toBe('');
    expect(r.valor.googleAdsId).toBe('');
  });
});

describe('statusPixel', () => {
  it('verde com qualquer um dos dois; âmbar sem nenhum', () => {
    expect(statusPixel(cliente({ metaPixelId: '123456789012345' }))).toMatchObject({ configurado: true, texto: 'Pixel configurado (Meta)' });
    expect(statusPixel(cliente({ metaPixelId: '123456789012345', googleAdsId: 'AW-1234567' })).texto).toBe('Pixel configurado (Meta + Google Ads)');
    expect(statusPixel(cliente(undefined))).toMatchObject({ configurado: false });
    expect(statusPixel(cliente(undefined)).texto).toContain('campanhas não vão conseguir medir conversão no site');
  });
});

describe('site custom', () => {
  it('sem IDs: nenhum código de pixel no HTML', () => {
    const html = gerarSiteHTML({ cliente: cliente(undefined), produtos: PRODUTOS });
    expect(html).not.toMatch(/fbq\(|gtag\(|googletagmanager|connect\.facebook\.net/);
    expect(html).toContain('rastrearCheckout(carrinho);window.checkoutHandler(carrinho)'); // função vazia, não quebra
  });
  it('com os dois IDs: Pixel com PageView e tag do Google no <head>, evento no Finalizar compra', () => {
    const html = gerarSiteHTML({ cliente: cliente({ metaPixelId: '123456789012345', googleAdsId: 'AW-987654321', googleAdsRotulo: 'AbCd' }), produtos: PRODUTOS });
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain("fbq('init', \"123456789012345\")");
    expect(head).toContain("fbq('track', 'PageView')");
    expect(head).toContain('https://www.googletagmanager.com/gtag/js?id=AW-987654321');
    expect(head).toContain("gtag('config',\"AW-987654321\")");
    expect(html).toContain("fbq('track','InitiateCheckout'");
    expect(html).toContain('send_to:"AW-987654321/AbCd"');
    // O evento dispara ANTES de ir para o checkout de terceiro.
    expect(html.indexOf('rastrearCheckout(carrinho)')).toBeLessThan(html.lastIndexOf('window.checkoutHandler(carrinho)'));
  });
  it('Google sem rótulo: evento begin_checkout em vez de conversão', () => {
    expect(codigoCheckout({ googleAdsId: 'AW-1234567' })).toContain("gtag('event','begin_checkout'");
    expect(codigoHead({ metaPixelId: '', googleAdsId: '' })).toBe('');
  });
});

describe('manual do pacote', () => {
  it('traz o passo com os valores reais e o caminho de cada plataforma', () => {
    const r = { metaPixelId: '123456789012345', googleAdsId: 'AW-987654321', googleAdsRotulo: '' };
    const n = passosRastreamentoPacote(r, 'nuvemshop', 'Nuvemshop');
    expect(n[0]).toBe('Cole o ID do Pixel do Meta 123456789012345 e do Google Ads AW-987654321 nas configurações de rastreamento da sua loja em Nuvemshop.');
    expect(n[1]).toContain('Códigos externos');
    expect(passosRastreamentoPacote(r, 'shopify', 'Shopify')[1]).toContain('Facebook & Instagram');
  });
  it('só um dos IDs e nenhum ID', () => {
    expect(passosRastreamentoPacote({ metaPixelId: '', googleAdsId: 'AW-1234567' }, 'shopify', 'Shopify')[0]).toBe('Cole o ID do Google Ads AW-1234567 nas configurações de rastreamento da sua loja em Shopify.');
    expect(passosRastreamentoPacote({ metaPixelId: '', googleAdsId: '' }, 'shopify', 'Shopify')).toEqual([]);
  });
});
