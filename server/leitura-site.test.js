// Leitura do site do próprio cliente: extração sem IA, proteção de rede (só IP público) e fotos só do próprio site.
import { describe, it, expect } from 'vitest';
import { extrairPagina, produtosShopify, juntarProdutos, ipPrivado, conferirUrlPublica, imagemDoSite, dominioBase, lerSite, decodificarEntidades } from './leitura-site.js';

const HTML = `<!doctype html><html><head><title>Ateliê Fit &amp; Cia</title>
<meta name="description" content="Leggings que não ficam transparentes">
<meta property="og:image" content="/img/capa.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Legging Blindada","description":"<p>Cintura alta</p>","image":["https://cdn.shopify.com/s/legging.jpg"],"offers":{"@type":"Offer","price":"129.90"}}]}</script>
<script>var x = "não é texto visível";</script><style>.a{}</style></head>
<body><h1>Treine sem medo</h1><p>Mais de 5 mil clientes. Nota 4,9 em 320 avaliações.</p>
<img src="/logo.png" alt="logo"><img src="/p/top.jpg" alt="Top Nuvem" width="600"><img src="data:image/png;base64,AA"><img src="/i.gif">
<a href="/products/legging-blindada">ver</a><a href="https://outro.com/products/x">fora</a></body></html>`;

describe('extrairPagina', () => {
  const p = extrairPagina(HTML, 'https://www.ateliefit.com.br/');
  it('título, descrição e texto visível (sem script/style)', () => {
    expect(p.titulo).toBe('Ateliê Fit & Cia');
    expect(p.descricao).toBe('Leggings que não ficam transparentes');
    expect(p.texto).toContain('Mais de 5 mil clientes');
    expect(p.texto).not.toContain('não é texto visível');
  });
  it('produto do JSON-LD com preço e imagem', () => {
    expect(p.produtos).toEqual([{ nome: 'Legging Blindada', descricao: 'Cintura alta', preco: 129.9, imagens: ['https://cdn.shopify.com/s/legging.jpg'], fonte: 'jsonld' }]);
  });
  it('fotos absolutas, sem logo, data URL nem gif; links de produto só do mesmo site', () => {
    expect(p.imagens.map((i) => i.url)).toEqual(['https://www.ateliefit.com.br/img/capa.jpg', 'https://cdn.shopify.com/s/legging.jpg', 'https://www.ateliefit.com.br/p/top.jpg']);
    expect(p.linksProduto).toEqual(['https://www.ateliefit.com.br/products/legging-blindada']);
    expect(p.shopify).toBe(true);
  });
  it('entidades HTML', () => expect(decodificarEntidades('a&nbsp;&#233;&#x21;')).toBe('a é!'));
});

describe('produtos', () => {
  it('Shopify /products.json e junção sem repetir nome', () => {
    const s = produtosShopify({ products: [{ title: 'Legging Blindada', body_html: '<b>x</b>', variants: [{ price: '129.90' }], images: [{ src: '//cdn.shopify.com/a.jpg' }] }] }, 'https://loja.com');
    expect(s[0]).toMatchObject({ nome: 'Legging Blindada', preco: 129.9, imagens: ['https://cdn.shopify.com/a.jpg'], fonte: 'shopify' });
    expect(juntarProdutos(s, [{ nome: 'legging blindada' }, { nome: 'Top' }]).map((x) => x.nome)).toEqual(['Legging Blindada', 'Top']);
  });
});

describe('segurança de rede', () => {
  it('IPs privados/loopback/link-local', () => {
    ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1'].forEach((ip) => expect(ipPrivado(ip)).toBe(true));
    ['8.8.8.8', '104.16.0.1', '2606:4700::1'].forEach((ip) => expect(ipPrivado(ip)).toBe(false));
  });
  it('recusa localhost, IP interno, porta estranha e nome que resolve para rede interna', async () => {
    const lookup = async (h) => (h === 'interno.exemplo.com' ? [{ address: '10.1.1.1' }] : [{ address: '93.184.216.34' }]);
    await expect(conferirUrlPublica('http://localhost/', { lookup })).rejects.toThrow('não é público');
    await expect(conferirUrlPublica('http://169.254.169.254/latest', { lookup })).rejects.toThrow('não é público');
    await expect(conferirUrlPublica('https://loja.com:8080/', { lookup })).rejects.toThrow('portas padrão');
    await expect(conferirUrlPublica('https://interno.exemplo.com/', { lookup })).rejects.toThrow('não é público');
    await expect(conferirUrlPublica('ftp://loja.com/', { lookup })).rejects.toThrow('http');
    await expect(conferirUrlPublica('https://loja.com.br/', { lookup })).resolves.toBeTruthy();
  });
  it('redirecionamento para rede interna é barrado', async () => {
    const lookup = async (h) => (h === 'loja.com.br' ? [{ address: '93.184.216.34' }] : [{ address: '127.0.0.1' }]);
    const fetch = async () => new Response(null, { status: 302, headers: { location: 'http://admin.interno/' } });
    await expect(lerSite('https://loja.com.br', { fetch, lookup })).rejects.toThrow('não é público');
  });
  it('site que recusa robô vira erro 424 (a tela tenta a busca web)', async () => {
    const lookup = async () => [{ address: '93.184.216.34' }];
    const fetch = async () => new Response('bloqueado', { status: 403 });
    await expect(lerSite('https://loja.com.br', { fetch, lookup })).rejects.toMatchObject({ status: 424 });
  });
});

describe('fotos só do próprio site', () => {
  it('mesmo domínio (inclusive .com.br) ou CDN da plataforma da loja', () => {
    expect(dominioBase('www.loja.com.br')).toBe('loja.com.br');
    expect(dominioBase('img.loja.com')).toBe('loja.com');
    expect(imagemDoSite('https://img.loja.com.br/a.jpg', 'https://www.loja.com.br/')).toBe(true);
    expect(imagemDoSite('https://cdn.shopify.com/s/a.jpg', 'https://www.loja.com.br/')).toBe(true);
    expect(imagemDoSite('https://dcdn.mitiendanube.com/a.jpg', 'https://www.loja.com.br/')).toBe(true);
    expect(imagemDoSite('https://concorrente.com.br/a.jpg', 'https://www.loja.com.br/')).toBe(false);
    expect(imagemDoSite('file:///etc/passwd', 'https://www.loja.com.br/')).toBe(false);
  });
});
