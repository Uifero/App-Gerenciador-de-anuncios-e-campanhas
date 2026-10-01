import { describe, it, expect } from 'vitest';
import { dadosDoPacote, gruposPlataforma, gerarPreviaLojaHTML, TEXTO_COMPRA_DESATIVADA, LEGENDA_PREVIA_PACOTE } from './pacote-loja.js';

const cliente = {
  nome: 'Loja Ana', logoArquivo: { url: 'https://cdn.exemplo/logo.png' },
  rastreamento: { metaPixelId: '123456789012345', googleAdsId: 'AW-1', hotjarId: '999', tawkPropertyId: 'abc/def' },
};
const site = {
  modo: 'pacote_plataforma', plataforma: 'shopify',
  conteudo: { politicas: { trocas: 'Troca grátis em 30 dias', envio: 'Envio em 24h', privacidade: 'Seus dados ficam protegidos' } },
  pacote: {
    banners: [{ titulo: 'Legging que não fica transparente', subtitulo: 'Agache sem medo', cta: 'Ver coleção', uso: 'Banner principal' }],
    briefingTema: { paletaSugerida: ['#db2777', '#111111'], tipografia: 'Poppins', secoesHome: ['Banner', 'Produtos', 'Depoimentos'] },
    textosPagina: { sobre: 'Nascemos na academia.', faq: [{ p: 'Fica transparente?', r: 'Não.' }] },
    descricoesProdutos: [{ nome: 'Legging Power', descricao: 'Cintura alta, tecido grosso.', seoTitulo: 'Legging Power cintura alta', seoDescricao: 'Não marca' }],
  },
};
const produtos = [
  { nome: 'Legging Power', preco: 129.9, precoPromocional: 99.9, variacoes: [{ nome: 'Tamanho', valores: ['P', 'M', 'G'] }], fotos: [{ url: 'https://cdn.exemplo/legging.jpg' }] },
  { nome: 'Top Flex', preco: 1279, fotos: [] },
];

describe('prévia do pacote com cara de loja', () => {
  const d = dadosDoPacote({ cliente, site, produtos });
  const html = gerarPreviaLojaHTML(d);

  it('usa o logo, a cor, as fotos, os preços e os textos reais do cliente', () => {
    expect(html).toContain('<img src="https://cdn.exemplo/logo.png" alt="Loja Ana" class="logo">');
    expect(html).toContain('background:#db2777');
    expect(html).toContain('https://cdn.exemplo/legging.jpg');
    expect(html).toContain('R$ 129,90'); // preço "de"
    expect(html).toContain('R$ 99,90');  // promocional
    expect(html).toContain('R$ 1.279,00');
    expect(html).toContain('Legging que não fica transparente');
    expect(html).toContain('Cintura alta, tecido grosso.'); // descrição do pacote
    expect(html).toContain('<span class="chip">M</span>');
    expect(html).toContain('id="produto-0"'); // página de produto navegável (âncora)
    expect(html).toContain('href="#produto-1"');
  });

  it('compra desativada, sem script nenhum e sem rastreador, noindex', () => {
    expect(html).toContain(`<button type="button" class="comprar" disabled data-compra-desativada>${TEXTO_COMPRA_DESATIVADA}</button>`);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son\w+=/i); // nenhum onclick/onload...
    expect(html).not.toMatch(/fbq|gtag|googletagmanager|hotjar|tawk|123456789012345|AW-1/i);
    expect(html).not.toMatch(/<form|checkout|action=/i);
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('<base href="about:srcdoc">'); // âncoras ficam dentro da prévia
    expect(html).toContain(LEGENDA_PREVIA_PACOTE);
  });

  it('sem logo, mostra o nome; texto do cliente é escapado', () => {
    const h = gerarPreviaLojaHTML(dadosDoPacote({ cliente: { nome: '<b>Loja</b>' }, site, produtos: [] }));
    expect(h).toContain('&lt;b&gt;Loja&lt;/b&gt;');
    expect(h).not.toContain('<b>Loja</b>');
  });

  it('"O que colocar na plataforma": grupos com o caminho do manual e itens para copiar', () => {
    const g = gruposPlataforma(d);
    expect(g.map((x) => x.id)).toEqual(['loja', 'logo', 'banner', 'home', 'produto-0', 'produto-1', 'paginas', 'politicas', 'cores']);
    expect(g.find((x) => x.id === 'politicas').caminho).toBe('Configurações > Políticas');
    expect(g.find((x) => x.id === 'cores').caminho).toMatch(/Loja virtual > Temas/);
    const p0 = g.find((x) => x.id === 'produto-0').itens;
    expect(p0).toEqual(expect.arrayContaining([{ rotulo: 'Preço', valor: 'R$ 129,90' }, { rotulo: 'Variações', valor: 'Tamanho: P, M, G' }, { rotulo: 'Título para SEO', valor: 'Legging Power cintura alta' }]));
    const nuvem = gruposPlataforma(dadosDoPacote({ cliente, site: { ...site, plataforma: 'nuvemshop' }, produtos }));
    expect(nuvem.find((x) => x.id === 'banner').caminho).toMatch(/Design > Personalizar/);
    expect(nuvem.find((x) => x.id === 'produto-0').caminho).toMatch(/Produtos > Importar\/Exportar/);
  });
});
