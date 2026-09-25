// Site custom: FAQ a partir das objeções, SEO/Open Graph, aviso de cookies (LGPD) com o Pixel só após o aceite e selo de compra segura.
import { describe, it, expect } from 'vitest';
import { gerarSiteHTML, metaSeo, faqValida } from './sitegen.js';
import { codigoHead } from './rastreamento.js';

const PRODUTOS = [
  { id: 'p1', nome: 'Legging', preco: 89, fotos: [{ url: 'data:image/png;base64,AAA' }] },
  { id: 'p2', nome: 'Top', preco: 59, fotos: [{ url: 'https://cdn.exemplo.com/top.jpg' }] },
];
const cliente = { id: 'c1', nome: 'Loja Fit', nicho: 'moda fitness', marca: { usp: 'Não fica transparente' }, rastreamento: { metaPixelId: '123456789012345' } };

describe('FAQ', () => {
  it('mostra só pares completos; sem FAQ a seção nem o link do menu aparecem', () => {
    const html = gerarSiteHTML({ cliente, produtos: PRODUTOS, conteudo: { faq: [{ p: 'E se não servir?', r: 'Troca grátis em 30 dias.' }, { p: 'Sem resposta', r: '' }] } });
    expect(html).toContain('<section id="faq"');
    expect(html).toContain('<summary>E se não servir?</summary><p>Troca grátis em 30 dias.</p>');
    expect(html).not.toContain('Sem resposta');
    expect(html).toContain('href="#faq"');
    const sem = gerarSiteHTML({ cliente, produtos: PRODUTOS, conteudo: {} });
    expect(sem).not.toContain('id="faq"');
    expect(sem).not.toContain('href="#faq"');
  });
  it('faqValida aceita lixo sem quebrar', () => {
    expect(faqValida(null)).toEqual([]);
    expect(faqValida([{ p: ' a ', r: ' b ' }, {}])).toEqual([{ p: 'a', r: 'b' }]);
  });
});

describe('SEO e Open Graph', () => {
  it('título, descrição e og:image com a 1ª foto hospedada online (pula data URL)', () => {
    const html = gerarSiteHTML({ cliente, produtos: PRODUTOS, conteudo: { heroTitulo: 'Leggings que não marcam', heroSubtitulo: 'Conforto no treino' }, url: 'https://lojafit.com.br' });
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('<title>Loja Fit — Leggings que não marcam</title>');
    expect(head).toContain('<meta name="description" content="Conforto no treino">');
    expect(head).toContain('<meta property="og:title" content="Loja Fit — Leggings que não marcam">');
    expect(head).toContain('<meta property="og:description" content="Conforto no treino">');
    expect(head).toContain('<meta property="og:image" content="https://cdn.exemplo.com/top.jpg">');
    expect(head).toContain('<meta property="og:url" content="https://lojafit.com.br">');
  });
  it('conteúdo antigo (sem banner) usa nicho e diferencial; sem foto online, sem og:image', () => {
    const s = metaSeo({ cliente, produtos: [PRODUTOS[0]] });
    expect(s).toEqual({ titulo: 'Loja Fit — moda fitness', descricao: 'Não fica transparente', imagem: '', url: '' });
    expect(gerarSiteHTML({ cliente, produtos: [PRODUTOS[0]] })).not.toContain('og:image" content');
  });
  it('descrição longa é cortada em 160 caracteres', () => {
    expect(metaSeo({ cliente, conteudo: { heroSubtitulo: 'x'.repeat(300) } }).descricao).toHaveLength(160);
  });
});

describe('cookies (LGPD) e Pixel', () => {
  it('Pixel fica dentro de carregarRastreamento e só roda de cara se a escolha guardada for "aceito"', () => {
    const head = codigoHead({ metaPixelId: '123456789012345', googleAdsId: 'AW-1234567' });
    expect(head).toContain('window.carregarRastreamento=function(){');
    expect(head).toContain(`if(localStorage.getItem("consentimento_cookies")==='aceito')window.carregarRastreamento();`);
    expect(head.indexOf("fbq('init'")).toBeGreaterThan(head.indexOf('window.carregarRastreamento=function'));
    expect(head).not.toContain('<noscript>'); // sem JavaScript não há consentimento
  });
  it('banner com aceitar/rejeitar e botão Aceitar carrega o rastreamento', () => {
    const html = gerarSiteHTML({ cliente, produtos: PRODUTOS });
    expect(html).toContain('id="cookiesOk"');
    expect(html).toContain('id="cookiesNao"');
    expect(html).toContain("if(v==='aceito'&&window.carregarRastreamento)window.carregarRastreamento();");
    expect(html).toContain('para medir anúncios (Meta/Google)');
  });
  it('o script do banner roda: 1ª visita mostra, aceitar grava e some, próxima visita não mostra, reabrir mostra', () => {
    const html = gerarSiteHTML({ cliente: { ...cliente, rastreamento: {} }, produtos: PRODUTOS });
    const script = html.slice(html.indexOf('// Consentimento de cookies'), html.indexOf("document.getElementById('finalizar')"));
    const els = {};
    const el = (id) => (els[id] ||= { onclick: null, classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); } } });
    const store = {}; const ls = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
    const rodar = () => { Object.keys(els).forEach((k) => delete els[k]); new Function('document', 'localStorage', 'window', script)({ getElementById: el }, ls, {}); };
    rodar();
    expect(el('cookies').classList.s.has('on')).toBe(true);
    el('cookiesOk').onclick();
    expect(store.consentimento_cookies).toBe('aceito');
    expect(el('cookies').classList.s.has('on')).toBe(false);
    rodar(); // "próxima visita"
    expect(el('cookies').classList.s.has('on')).toBe(false);
    el('prefCookies').onclick();
    expect(el('cookies').classList.s.has('on')).toBe(true);
  });
});

describe('selo de compra segura', () => {
  it('perto do Finalizar compra, com as formas padrão (cartão e Pix) ou as configuradas', () => {
    const html = gerarSiteHTML({ cliente, produtos: PRODUTOS });
    const trecho = html.slice(html.indexOf('id="finalizar"'), html.indexOf('</aside>'));
    expect(trecho).toContain('Compra segura');
    expect(trecho).toContain('Cartão de crédito');
    expect(trecho).toContain('Pix');
    expect(trecho).not.toContain('Boleto');
    const s = gerarSiteHTML({ cliente, produtos: PRODUTOS, config: { pagamentos: ['boleto'] } });
    expect(s.slice(s.indexOf('id="finalizar"'))).toContain('Boleto');
    const nenhum = gerarSiteHTML({ cliente, produtos: PRODUTOS, config: { pagamentos: [] } });
    expect(nenhum).toContain('Compra segura');
    expect(nenhum).not.toContain('class="pags"');
  });
});
