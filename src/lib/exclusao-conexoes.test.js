// Excluir x arquivar, foto em uso, criativo ligado a produto, avisos de campanha, prints em criativos (regra de saúde),
// diagnóstico lido da fonte e Insights por produto/oferta.
import { describe, it, expect } from 'vitest';
import { acaoAoExcluir, planoCriativos, criativosVisiveis, semVersao, nomeCriativo, usosDoMaterial, textoExcluirFotos, linksQueUsam } from './exclusao.js';
import { produtoDoCriativo, contextoProdutoAtual, avisosCampanha, urlDoProduto, printsParaCriativo, fonteDiagnostico, linhasFonteDiagnostico, agruparResultados, filtrarResultados, SEM_OFERTA } from './conexoes.js';
import { produtosComFotos } from './fotos-site.js';

const res = (criativoId, extra = {}) => ({ criativoId, gasto: 100, roas: 2, cpa: 30, ...extra });

describe('excluir x arquivar criativo', () => {
  it('sem resultado: excluir; com resultado: arquivar; arquivado: só exclusão definitiva', () => {
    const r = [res('c2'), res('c2')];
    expect(acaoAoExcluir({ id: 'c1' }, r)).toEqual({ acao: 'excluir', resultados: 0 });
    expect(acaoAoExcluir({ id: 'c2' }, r)).toEqual({ acao: 'arquivar', resultados: 2 });
    expect(acaoAoExcluir({ id: 'c2', arquivado: true }, r)).toEqual({ acao: 'excluirDefinitivo', resultados: 2 });
  });
  it('em massa: uma confirmação resumindo o que acontece com cada grupo', () => {
    const p = planoCriativos([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], [res('c2')]);
    expect(p.excluir.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(p.arquivar.map((c) => c.id)).toEqual(['c2']);
    expect(p.texto).toMatch(/2 criativo\(s\) sem resultado serão excluídos.*1 criativo\(s\) com resultados registrados serão ARQUIVADOS: saem da lista e continuam nos Insights/);
    const d = planoCriativos([{ id: 'c2', arquivado: true }], [res('c2')], { definitivo: true });
    expect(d.texto).toMatch(/os resultados de 1 deles SAEM dos Insights/);
  });
  it('arquivados saem da lista e aparecem só em "Mostrar arquivados"; referência que sobrou diz "criativo excluído"', () => {
    const cs = [{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B', arquivado: true }];
    expect(criativosVisiveis(cs).map((c) => c.id)).toEqual(['a']);
    expect(criativosVisiveis(cs, { arquivados: true }).map((c) => c.id)).toEqual(['b']);
    expect(nomeCriativo('x', cs, 'Velho')).toBe('criativo excluído (Velho)');
    expect(nomeCriativo('b', cs)).toBe('B (arquivado)');
  });
  it('excluir versão: só as antigas; a atual e a única não saem', () => {
    const c = { versoes: [{ n: 1 }, { n: 2 }, { n: 3 }] };
    expect(semVersao(c, 2).versoes.map((v) => v.n)).toEqual([1, 3]);
    expect(() => semVersao(c, 3)).toThrow(/versão atual/);
    expect(() => semVersao({ versoes: [{ n: 1 }] }, 1)).toThrow(/única versão/);
  });
});

describe('foto em uso: a confirmação diz onde', () => {
  const m = { id: 'm1', codigo: 'F3', url: 'https://x/f3.jpg', nomeOriginal: 'f3.jpg', origem: 'envio', usos: { banner: 'manual', produtos: [{ id: 'p1', ordem: 1, principal: true }] } };
  const ctx = {
    cliente: { logoArquivo: null }, site: { conteudo: {} }, produtos: [{ id: 'p1', nome: 'Thermora' }],
    aprovacoes: [{ tipo: 'site', criadoEm: '2026-10-04T15:00:00Z', previa: '<img src="https://x/f3.jpg">' }, { tipo: 'site', criadoEm: '2026-10-01T15:00:00Z', previa: '<img src="https://x/outra.jpg">' }],
  };
  it('lista banner, produto e o link de aprovação de dd/mm', () => {
    expect(usosDoMaterial(m, ctx)).toEqual(['Banner', 'Produto Thermora', 'Link de aprovação de 04/10']);
    expect(linksQueUsam(m, ctx.aprovacoes)).toHaveLength(1);
    const t = textoExcluirFotos([{ material: m, usos: usosDoMaterial(m, ctx) }]);
    expect(t).toMatch(/F3 "f3.jpg" está em uso: Banner, Produto Thermora, Link de aprovação de 04\/10/);
    expect(t).toMatch(/Links de aprovação já enviados continuam mostrando a prévia que foi salva/);
  });
  it('escolha direta dos ajustes rápidos e logo também contam', () => {
    const u = usosDoMaterial({ id: 'm9', url: 'u' }, { cliente: { logoArquivo: { materialId: 'm9' } }, site: { layout: { imagens: { hero: { materialId: 'm9', url: 'u' } } } } });
    expect(u).toEqual(['Logo da loja', 'Imagem do banner (ajustes rápidos)']);
  });
});

describe('criativo ligado a produto (lido da fonte)', () => {
  const mats = [{ id: 'm1', codigo: 'F1', url: 'https://x/principal.jpg', origem: 'envio', usos: { produtos: [{ id: 'p1', ordem: 1, principal: true }] } }];
  const cliente = { marca: { ofertaAtiva: 'Frete grátis' } };
  it('foto principal, preço e oferta atuais; mudou o preço na fonte, muda aqui', () => {
    const produtos = [{ id: 'p1', nome: 'Thermora', preco: 129, fotos: [], fotosMigradas: true }];
    const d = produtoDoCriativo({ produtoId: 'p1' }, { produtos, materiais: mats, cliente });
    expect(d).toMatchObject({ principal: { url: 'https://x/principal.jpg' }, precoTexto: 'R$ 129,00', oferta: 'Frete grátis' });
    produtos[0].preco = 159.9;
    expect(contextoProdutoAtual(produtoDoCriativo({ produtoId: 'p1' }, { produtos, materiais: mats, cliente }))).toMatch(/preço R\$ 159,90.*Oferta ativa agora: Frete grátis/);
    expect(produtoDoCriativo({ produtoId: 'p9' }, { produtos, materiais: mats, cliente }).excluido).toBe(true);
    expect(produtoDoCriativo({}, { produtos })).toBeNull();
  });
});

describe('campanha: avisos e destino', () => {
  const produtos = produtosComFotos([{ id: 'p1', nome: 'Thermora Azul', fotos: [] }], []);
  it('sem Pixel, loja não publicada e produto sem foto principal (sem bloquear)', () => {
    const av = avisosCampanha({ cliente: {}, site: { modo: 'pacote_plataforma', plataforma: 'shopify' }, produtos });
    expect(av.map((a) => a.id)).toEqual(['pixel', 'loja', 'foto-p1']);
    expect(av[0].texto).toMatch(/^Sem Pixel configurado/);
    expect(av[1].texto).toMatch(/^Loja ainda não publicada\/aprovada/);
    expect(av[2].texto).toMatch(/Produto "Thermora Azul" sem foto principal/);
  });
  it('tudo certo: nenhum aviso', () => {
    const ok = avisosCampanha({ cliente: { rastreamento: { metaPixelId: '123456789012345' } }, site: { linkPublicado: 'https://loja.com' }, etiquetaAprov: { tipo: 'aprovado' }, produtos: [{ id: 'p1', nome: 'X', fotos: [{ url: 'u' }] }] });
    expect(ok).toEqual([]);
  });
  it('URL por produto: Shopify /products/, Nuvemshop /produtos/, sem loja publicada nada', () => {
    const p = { nome: 'Thermora Azul' };
    expect(urlDoProduto(p, { modo: 'pacote_plataforma', plataforma: 'shopify', linkPublicado: 'https://loja.com/' }).url).toBe('https://loja.com/products/thermora-azul');
    expect(urlDoProduto(p, { modo: 'pacote_plataforma', plataforma: 'nuvemshop', plataformaConfirmada: true, linkPublicado: 'https://l.com' }).url).toBe('https://l.com/produtos/thermora-azul/');
    expect(urlDoProduto(p, { modo: 'custom' })).toBeNull();
  });
});

describe('prints de prova social em criativos', () => {
  const borrado = (extra = {}) => ({ id: 'm1', url: 'https://x/orig.png', origem: 'prova_social', borrada: { url: 'https://x/borrada.jpg' }, ...extra });
  it('só a cópia borrada, e pede autorização quando falta', () => {
    const [x] = printsParaCriativo({ cliente: { nicho: 'moda' }, materiais: [borrado()] });
    expect(x).toMatchObject({ usavel: true, url: 'https://x/borrada.jpg', pedirAutorizacao: true });
    const [y] = printsParaCriativo({ cliente: { nicho: 'moda' }, materiais: [{ id: 'm2', url: 'https://x/o.png', origem: 'prova_social' }] });
    expect(y.usavel).toBe(false);
    expect(y.motivo).toMatch(/só entra a cópia borrada/);
  });
  it('cliente de saúde: print "perdi 3 kg" bloqueado com o aviso; outro cliente pode', () => {
    const print = borrado({ descricao: 'Cliente diz: perdi 3 kg em um mês', autorizado: true });
    const [s] = printsParaCriativo({ cliente: { nicho: 'suplemento para emagrecer' }, materiais: [print] });
    expect(s).toMatchObject({ usavel: false, bloqueadoSaude: true });
    expect(s.motivo).toMatch(/Política do Meta.*3 kg/);
    expect(printsParaCriativo({ cliente: { nicho: 'moda fitness', marca: { produtoSaude: false } }, materiais: [print] })[0].usavel).toBe(true);
  });
});

describe('diagnóstico e Insights lidos da fonte', () => {
  it('rastreamento, plataforma, link da loja e oferta vêm do cadastro', () => {
    const f = fonteDiagnostico({ cliente: { rastreamento: { metaPixelId: '123456789012345' }, marca: { ofertaAtiva: '10% off' } }, site: { modo: 'pacote_plataforma', plataforma: 'shopify', tema: 'dawn', linkPublicado: 'https://loja.com' }, etiquetaAprov: { tipo: 'aprovado', texto: 'Aprovado v2' } });
    expect(f).toMatchObject({ pixel: '123456789012345', plataforma: 'Shopify', tema: 'Dawn', linkLoja: 'https://loja.com', lojaPublicada: true, aprovacao: 'Aprovado v2', oferta: '10% off' });
    expect(linhasFonteDiagnostico(f)).toMatch(/Pixel do Meta 123456789012345.*\n.*Shopify \(tema Dawn\); publicada em https:\/\/loja.com/);
  });
  it('Insights por produto (do criativo, lido agora) e por oferta (a do dia do resultado)', () => {
    const criativos = [{ id: 'c1', produtoId: 'p1' }, { id: 'c2', produtoId: 'p2' }, { id: 'c3' }];
    const produtos = [{ id: 'p1', nome: 'Thermora' }, { id: 'p2', nome: 'Garrafa' }];
    const rs = [res('c1', { roas: 4, oferta: 'Frete grátis' }), res('c1', { roas: 2 }), res('c2', { roas: 1, oferta: 'Frete grátis' }), res('c3', { roas: 3 })];
    expect(agruparResultados(rs, 'produto', { criativos, produtos }).map((g) => [g.nome, g.amostras, g.roasMedio])).toEqual([['Thermora', 2, 3], ['Sem produto ligado', 1, 3], ['Garrafa', 1, 1]]);
    expect(agruparResultados(rs, 'oferta').map((g) => [g.nome, g.amostras])).toEqual([['Frete grátis', 2], [SEM_OFERTA, 2]]);
    expect(filtrarResultados(rs, { produtoId: 'p1', criativos, produtos })).toHaveLength(2);
    expect(filtrarResultados(rs, { oferta: 'Frete grátis' })).toHaveLength(2);
  });
});
