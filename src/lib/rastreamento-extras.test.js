// Hotjar e Tawk.to: validação, código no site custom (só depois do aceite de cookies), aviso de cookies e manual do pacote.
import { describe, it, expect } from 'vitest';
import { normalizarExtras, normalizarRastreamento, codigoHead, textoAvisoCookies, passosExtrasPacote, rastreamentoDe } from './rastreamento.js';
import { gerarSiteHTML } from './sitegen.js';

const PROP = '64f1a2b3c4d5e6f7a8b9c0d1';
const PRODUTOS = [{ id: 'p1', nome: 'Legging', preco: 89, fotos: [] }];
const cliente = (rastreamento) => ({ id: 'c1', nome: 'Loja Teste', nicho: 'moda fitness', marca: {}, rastreamento });

describe('normalizarExtras', () => {
  it('em branco é aceito', () => {
    expect(normalizarExtras({})).toEqual({ valor: { hotjarId: '', tawkPropertyId: '', tawkWidgetId: '' }, erros: [] });
  });
  it('Hotjar: número puro ou código colado inteiro (pega o hjid)', () => {
    expect(normalizarExtras({ hotjarId: ' 3456789 ' }).valor.hotjarId).toBe('3456789');
    expect(normalizarExtras({ hotjarId: "<script>(function(h,o,t,j,a,r){h._hjSettings={hjid:3456789,hjsv:6};" }).valor.hotjarId).toBe('3456789');
    const r = normalizarExtras({ hotjarId: 'abc' });
    expect(r.erros).toHaveLength(1);
    expect(r.valor.hotjarId).toBe('');
  });
  it('Tawk.to: dois campos, ou o link embed colado no 1º campo', () => {
    expect(normalizarExtras({ tawkPropertyId: PROP, tawkWidgetId: '1h2j3k4l5' }).valor).toMatchObject({ tawkPropertyId: PROP, tawkWidgetId: '1h2j3k4l5' });
    expect(normalizarExtras({ tawkPropertyId: `s1.src='https://embed.tawk.to/${PROP}/default';` }).valor).toMatchObject({ tawkPropertyId: PROP, tawkWidgetId: 'default' });
  });
  it('Tawk.to incompleto ou errado: erro e nada gravado', () => {
    const r = normalizarExtras({ tawkPropertyId: PROP });
    expect(r.erros).toHaveLength(1);
    expect(r.valor.tawkPropertyId).toBe('');
    expect(normalizarExtras({ tawkPropertyId: 'curto', tawkWidgetId: 'x' }).erros).toHaveLength(1);
  });
  it('normalizarRastreamento junta tudo', () => {
    const r = normalizarRastreamento({ metaPixelId: '123456789012345', hotjarId: '3456789', tawkPropertyId: PROP, tawkWidgetId: 'default' });
    expect(r.erros).toEqual([]);
    expect(r.valor).toMatchObject({ metaPixelId: '123456789012345', hotjarId: '3456789', tawkPropertyId: PROP, tawkWidgetId: 'default' });
  });
});

describe('site custom com Hotjar e Tawk.to', () => {
  const r = { hotjarId: '3456789', tawkPropertyId: PROP, tawkWidgetId: 'default' };
  it('entram dentro de carregarRastreamento (só depois do aceite), junto com Meta/Google', () => {
    const head = codigoHead({ metaPixelId: '123456789012345', ...r });
    const inicio = head.indexOf('window.carregarRastreamento=function(){');
    expect(inicio).toBeGreaterThan(-1);
    expect(head.indexOf('static.hotjar.com')).toBeGreaterThan(inicio);
    expect(head.indexOf(`embed.tawk.to/${PROP}/default`)).toBeGreaterThan(inicio);
    expect(head).toContain('hjid:"3456789"');
  });
  it('só Hotjar/Tawk (sem Pixel) também gera o bloco com a trava de consentimento', () => {
    const head = codigoHead(r);
    expect(head).toContain('window.carregarRastreamento=function(){');
    expect(head).not.toContain('fbq(');
  });
  it('sem nenhum dos dois o site sai sem eles', () => {
    const html = gerarSiteHTML({ cliente: cliente({ metaPixelId: '123456789012345' }), produtos: PRODUTOS });
    expect(html).not.toMatch(/hotjar|tawk/i);
  });
  it('rodando o <head>: sem aceite nada carrega; com aceite guardado, Hotjar e Tawk.to carregam', () => {
    const head = codigoHead(r);
    const js = head.slice(head.indexOf('<script>') + 8, head.indexOf('</script>'));
    const rodar = (escolha) => {
      const criados = [];
      const document = { createElement: () => { const s = { setAttribute() {} }; criados.push(s); return s; }, head: { appendChild() {} }, getElementsByTagName: () => [{ appendChild() {} }] };
      const window = {};
      new Function('window', 'document', 'localStorage', js)(window, document, { getItem: () => escolha });
      return { window, srcs: criados.map((s) => s.src) };
    };
    expect(rodar(null).srcs).toEqual([]);
    expect(rodar('rejeitado').srcs).toEqual([]);
    const ok = rodar('aceito');
    expect(ok.srcs.some((s) => s.startsWith('https://static.hotjar.com/c/hotjar-3456789'))).toBe(true);
    expect(ok.srcs).toContain(`https://embed.tawk.to/${PROP}/default`);
  });
  it('aviso de cookies diz em palavras simples o que carrega com o "Aceitar"', () => {
    expect(textoAvisoCookies({})).toBe('Usamos cookies para o carrinho funcionar. Você pode mudar a escolha quando quiser em "Preferências de cookies", no fim da página.');
    expect(textoAvisoCookies({ metaPixelId: '1', ...r })).toContain('para medir os anúncios, entender como as pessoas usam o site e abrir o chat de atendimento');
    const html = gerarSiteHTML({ cliente: cliente(r), produtos: PRODUTOS });
    expect(html).toContain('entender como as pessoas usam o site e abrir o chat de atendimento');
  });
});

describe('manual do pacote', () => {
  it('traz os códigos com o caminho de cada plataforma e lembra do banner de cookies', () => {
    const r = rastreamentoDe(cliente({ hotjarId: '3456789', tawkPropertyId: PROP, tawkWidgetId: 'default' }));
    const n = passosExtrasPacote(r, 'nuvemshop', 'Nuvemshop');
    expect(n).toHaveLength(3);
    expect(n[0]).toContain('Hotjar (ID do site 3456789)');
    expect(n[0]).toContain('Códigos externos');
    expect(n[1]).toContain(`embed.tawk.to/${PROP}/default`);
    expect(n[2]).toContain('cookies');
    expect(passosExtrasPacote(r, 'shopify', 'Shopify')[0]).toContain('app oficial "Hotjar"');
    expect(passosExtrasPacote(rastreamentoDe(cliente({})), 'shopify', 'Shopify')).toEqual([]);
  });
});
