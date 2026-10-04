// "Montar site": status dos 6 passos, onde a aba abre, plataforma escolhida (nunca chutada) e os caminhos de menu.
import { describe, it, expect } from 'vitest';
import { statusEtapas, primeiraEtapaComFalta, plataformaDoSite, patchPlataforma } from './etapas-site.js';
import { caminhosDe, dadosDoPacote, gruposPlataforma, CONFIRA_TEMA } from './pacote-loja.js';
import { gerarSiteHTML } from './sitegen.js';
import { depoimentosVivos } from './prova-social.js';
import { comTextosDoPacote } from './csv.js';

const marcaCompleta = { negocio: 'garrafas', usp: 'gelada 24h', tomDeVoz: 'direto', objecoes: 'E se vazar?', linguagemDor: 'água quente', provasSociais: 'Nota 4,9 no Google' };
const clienteOk = { id: 'c1', nome: 'Loja', marca: marcaCompleta, rastreamento: { metaPixelId: '123456789012345' }, logoArquivo: { url: 'https://x/logo.png' } };
const prod = (id, extra = {}) => ({ id, nome: `Produto ${id}`, preco: 10, fotos: [{ url: `https://x/${id}.jpg` }], ...extra });
const siteOk = { modo: 'pacote_plataforma', plataforma: 'shopify', tema: 'dawn', pacote: { banners: [{ titulo: 'Oi' }] }, linkPublicado: 'https://loja.com' };
const status = (ctx) => statusEtapas(ctx).map((x) => x.status);

describe('status dos passos', () => {
  it('cliente sem nada: falta algo nos passos 1-4 e 6; aprovar é opcional; abre no passo 1', () => {
    const e = statusEtapas({ cliente: { id: 'c1', nome: 'Novo' } });
    expect(e.map((x) => x.status)).toEqual(['falta', 'falta', 'falta', 'falta', 'opcional', 'falta']);
    expect(primeiraEtapaComFalta(e)).toBe(1);
    expect(e[0].faltas.map((f) => f.texto).join(' ')).toMatch(/Falta preencher o diferencial/);
    expect(e[1].faltas[0]).toMatchObject({ texto: expect.stringMatching(/Nenhum produto/), acao: { tipo: 'novoProduto' } });
    expect(e[2].faltas[0].texto).toMatch(/Escolha a plataforma/);
  });
  it('preenchendo em ordem, os passos ficam completos e a aba abre no primeiro que falta', () => {
    const base = { cliente: clienteOk, produtos: [prod('p1')] };
    expect(primeiraEtapaComFalta(statusEtapas(base))).toBe(3); // 1 e 2 completos
    expect(status({ ...base, site: { ...siteOk, pacote: null } }).slice(0, 4)).toEqual(['completo', 'completo', 'completo', 'falta']);
    const tudo = statusEtapas({ ...base, site: siteOk, etiquetaAprov: { tipo: 'aprovado', texto: 'Aprovado v2' } });
    expect(tudo.map((x) => x.status)).toEqual(['completo', 'completo', 'completo', 'completo', 'completo', 'completo']);
    expect(primeiraEtapaComFalta(tudo)).toBe(6);
  });
  it('materiais: produto sem preço/foto, sem logo e print sem borrar nem autorização, cada um com a ação', () => {
    const e = statusEtapas({ cliente: { ...clienteOk, logoArquivo: null }, produtos: [prod('p1', { preco: 0 }), prod('p2', { fotos: [] })],
      materiais: [{ id: 'm1', url: 'https://x/print.png', origem: 'prova_social' }] })[1];
    expect(e.faltas.map((f) => f.acao.tipo)).toEqual(['produto', 'produto', 'ancora', 'ancora']);
    expect(e.faltas[3].texto).toMatch(/sem borrar e sem autorização/);
  });
  it('aprovar: pedido de ajuste e aguardando contam como "falta algo"', () => {
    expect(statusEtapas({ etiquetaAprov: { tipo: 'ajuste', texto: 'Ajuste pedido v3' } })[4].status).toBe('falta');
    expect(statusEtapas({ etiquetaAprov: { tipo: 'aguardando', texto: 'Aguardando cliente v1' } })[4].faltas[0].texto).toMatch(/aguardando/);
  });
  it('checklist final: logo, preços, foto principal, prints, Pixel, plataforma e publicado', () => {
    const c = statusEtapas({ cliente: clienteOk, produtos: [prod('p1')], site: { ...siteOk, linkPublicado: '' } })[5];
    expect(c.checklist.map((x) => [x.id, x.ok])).toEqual([['plataforma', true], ['logo', true], ['precos', true], ['fotos', true], ['prints', true], ['pixel', true], ['publicado', false]]);
  });
});

describe('plataforma e tema', () => {
  it('"nuvemshop" marcado sozinho pelo app antigo não conta: pergunta uma vez', () => {
    expect(plataformaDoSite({ modo: 'pacote_plataforma', plataforma: 'nuvemshop' })).toBeNull();
    expect(plataformaDoSite({ modo: 'pacote_plataforma', plataforma: 'nuvemshop', plataformaConfirmada: true })).toBe('nuvemshop');
    expect(plataformaDoSite({ modo: 'pacote_plataforma', plataforma: 'shopify' })).toBe('shopify');
    expect(plataformaDoSite({ modo: 'custom' })).toBe('custom');
    expect(patchPlataforma('shopify')).toEqual({ modo: 'pacote_plataforma', plataforma: 'shopify', plataformaConfirmada: true });
    expect(patchPlataforma('custom')).toEqual({ modo: 'custom', plataformaConfirmada: true });
  });
  it('Shopify (Horizon e Dawn) nunca mostra caminho da Nuvemshop; Nuvemshop mostra os dela; sem escolha, nenhum', () => {
    const tudo = (c) => Object.values(c).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))).join(' | ');
    for (const tema of ['horizon', 'dawn', 'outro', '']) {
      const c = tudo(caminhosDe('shopify', tema));
      expect(c).toMatch(/Loja virtual > Temas/);
      expect(c).not.toMatch(/Design > Personalizar/);
    }
    expect(caminhosDe('shopify', 'dawn').banner).toMatch(/"Banner de imagem"/);
    expect(caminhosDe('shopify', 'horizon').banner).toContain(CONFIRA_TEMA);
    expect(caminhosDe('shopify', 'outro').banner).toContain(CONFIRA_TEMA);
    expect(tudo(caminhosDe('nuvemshop'))).toMatch(/Design > Personalizar/);
    expect(tudo(caminhosDe('nuvemshop'))).not.toMatch(/Loja virtual > Temas/);
    expect(tudo(caminhosDe(null))).not.toMatch(/Design > Personalizar|Loja virtual/);
  });
  it('"O que colocar na plataforma" segue a plataforma escolhida do cliente', () => {
    const grupos = (site) => gruposPlataforma(dadosDoPacote({ cliente: clienteOk, site, produtos: [prod('p1')] })).map((g) => g.caminho).join(' | ');
    expect(grupos(siteOk)).not.toMatch(/Design >/);
    expect(grupos({ ...siteOk, plataforma: 'nuvemshop', plataformaConfirmada: true })).toMatch(/Design > Personalizar/);
    expect(grupos({ ...siteOk, plataforma: 'nuvemshop' })).toMatch(/Escolha a plataforma no passo 3/);
  });
});

describe('dado lido da fonte (mapa de conexões)', () => {
  const site = { ...siteOk, modo: 'custom', conteudo: { heroTitulo: 'Oi', depoimentos: [{ nome: 'Clientes da loja', texto: 'Nota 4,9 no Google', origem: 'prova_texto' }] } };
  it('preço e prova social editados na fonte aparecem na prévia e no pacote sem gerar de novo', () => {
    const cliente = { ...clienteOk, marca: { ...marcaCompleta, provasSociais: 'Nota 5,0 em 800 avaliações' } };
    const html = gerarSiteHTML({ cliente, produtos: [prod('p1', { preco: 123.45 })], conteudo: site.conteudo, materiais: [] });
    expect(html).toContain('123,45');
    expect(html).toContain('Nota 5,0 em 800 avaliações');
    expect(html).not.toContain('Nota 4,9 no Google'); // a cópia antiga não volta
    const d = dadosDoPacote({ cliente, site: { ...siteOk, conteudo: site.conteudo }, produtos: [prod('p1', { preco: 123.45 })] });
    expect(d.produtos[0].preco).toBe(123.45);
    expect(d.depoimentos.map((x) => x.texto)).toEqual(['Nota 5,0 em 800 avaliações']);
  });
  it('depoimento de print usa a cópia borrada atual; print apagado sai', () => {
    const guardados = [{ nome: 'Google', texto: 'Ótimo', origem: 'prova_social', materialId: 'm1', exibir: 'print', midiaUrl: 'https://x/original.png' }];
    const mats = [{ id: 'm1', url: 'https://x/original.png', origem: 'prova_social', borrada: { url: 'https://x/borrada.jpg' } }, { id: 'm9', url: 'https://x/outra.png' }];
    expect(depoimentosVivos({ cliente: {}, materiais: mats, guardados })[0].midiaUrl).toBe('https://x/borrada.jpg');
    expect(depoimentosVivos({ cliente: {}, materiais: [mats[1]], guardados })).toEqual([]);
  });
  it('descrição do pacote presa ao produto pelo id: renomear o produto não perde o texto', () => {
    const r = comTextosDoPacote([{ id: 'p1', nome: 'Thermora 2' }], { descricoesProdutos: [{ nome: 'Thermora', produtoId: 'p1', descricao: 'Mantém gelado' }] });
    expect(r[0].descricao).toBe('Mantém gelado');
  });
});
