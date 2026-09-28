// "Ajustar este site": validador de operações, proteções, contraste, versões e o HTML gerado a partir do layout.
import { describe, it, expect } from 'vitest';
import { aplicarOperacoes, estadoDoSite, registrarVersao, versoesDoModo, MAX_VERSOES, problemaPaleta, PALETAS_PRONTAS, normalizarLayout, motivoProtegido, resumoMudancas } from './site-blocos.js';
import { normalizarAjusteSite, pedidoAmplo } from '../core/ia.js';
import { gerarSiteHTML } from './sitegen.js';
import { comTextosDoPacote, csvNuvemshop } from './csv.js';

const site = {
  conteudo: { heroTitulo: 'Leggings que não marcam', heroCta: 'Ver coleção', storytelling: 'Nascemos em 2019.', faq: [{ p: 'E se não servir?', r: 'Troca grátis.' }],
    depoimentos: [{ nome: 'Ana', texto: 'Amei' }, { nome: 'Bia', texto: 'Serviu' }], politicas: { trocas: '30 dias' } },
  config: { corPrimaria: '#4f46e5', corFundo: '#ffffff' },
};
const e0 = estadoDoSite(site, 'custom');
const ap = (ops, e = e0, extra) => aplicarOperacoes(e, ops, { modo: 'custom', ...extra });

describe('operações no site personalizado', () => {
  it('reordenar: texto antes/depois e o original intacto', () => {
    const r = ap([{ op: 'mover', bloco: 'depoimentos', antesDe: 'vendidos' }]);
    expect(r.mudancas[0]).toBe('Bloco Depoimentos: passa de depois de "Nossa história" para depois de "Categorias"');
    expect(r.estado.layout.ordem.indexOf('depoimentos')).toBeLessThan(r.estado.layout.ordem.indexOf('vendidos'));
    expect(e0.layout.ordem.indexOf('depoimentos')).toBe(6); // aplicar não mexe no estado original
  });
  it('ocultar/mostrar, e não deixa sumir com todos os produtos', () => {
    const r = ap([{ op: 'ocultar', bloco: 'newsletter' }, { op: 'ocultar', bloco: 'vendidos' }, { op: 'ocultar', bloco: 'catalogo' }]);
    expect(r.estado.layout.ocultos).toEqual(['newsletter', 'vendidos']);
    expect(r.descartadas[0].motivo).toContain('não podem ficar ocultos ao mesmo tempo');
    expect(ap([{ op: 'mostrar', bloco: 'newsletter' }], r.estado).mudancas[0]).toContain('oculto para visível');
  });
  it('textos: campo permitido, limite de tamanho, obrigatório e título de seção', () => {
    const r = ap([{ op: 'texto', campo: 'heroTitulo', valor: 'Treine sem medo' }, { op: 'texto', campo: 'heroCta', valor: '' }, { op: 'texto', campo: 'heroSubtitulo', valor: 'x'.repeat(300) }, { op: 'texto', campo: 'titulo.depoimentos', valor: 'Quem comprou aprovou' }]);
    expect(r.estado.conteudo.heroTitulo).toBe('Treine sem medo');
    expect(r.mudancas[0]).toBe('Banner principal: título: "Leggings que não marcam" → "Treine sem medo"');
    expect(r.estado.layout.titulos.depoimentos).toBe('Quem comprou aprovou');
    expect(r.descartadas.map((d) => d.motivo)).toEqual(['"Banner principal: texto do botão" não pode ficar vazio', '"Banner principal: subtítulo" pode ter no máximo 180 caracteres']);
  });
  it('FAQ e depoimentos (depoimento não é reescrito, só escolhido)', () => {
    const r = ap([{ op: 'faq', acao: 'adicionar', p: 'Tem frete grátis?', r: 'Acima de R$ 200.' }, { op: 'faq', acao: 'editar', indice: 0, r: 'Troca grátis em 30 dias.' }, { op: 'depoimento', acao: 'ocultar', indice: 1 }, { op: 'depoimento', acao: 'editar', indice: 0, texto: 'inventado' }]);
    expect(r.estado.conteudo.faq).toHaveLength(2);
    expect(r.estado.conteudo.faq[0].r).toBe('Troca grátis em 30 dias.');
    expect(r.estado.layout.depoimentosOcultos).toEqual(['Serviu']);
    expect(r.descartadas[0].motivo).toContain('não reescrevemos');
  });
  it('paleta: aceita legível, recusa ilegível explicando', () => {
    expect(ap([{ op: 'paleta', corPrimaria: '#166534', corFundo: '#f7fbf5' }]).estado.config).toMatchObject({ corPrimaria: '#166534', corFundo: '#f7fbf5' });
    const clara = ap([{ op: 'paleta', corPrimaria: '#fde047', corFundo: '#ffffff' }]);
    expect(clara.aplicadas).toHaveLength(0);
    expect(clara.descartadas[0].motivo).toContain('texto branco dos botões ficaria difícil de ler');
    expect(ap([{ op: 'paleta', corPrimaria: '#4f46e5', corFundo: '#111111' }]).descartadas[0].motivo).toContain('Use um fundo mais claro');
    for (const [, a, b] of PALETAS_PRONTAS) expect(problemaPaleta(a, b)).toBeNull();
  });
  it('variação e imagem só dos Materiais', () => {
    const materiais = [{ id: 'm1', url: 'https://x/foto.jpg', nome: 'foto-loja.jpg' }];
    const r = ap([{ op: 'variacao', bloco: 'hero', opcao: 'altura', valor: 'curto' }, { op: 'variacao', bloco: 'catalogo', opcao: 'colunas', valor: 3 }, { op: 'variacao', bloco: 'catalogo', opcao: 'colunas', valor: 7 },
      { op: 'imagem', bloco: 'hero', materialId: 'm1' }, { op: 'imagem', bloco: 'hero', materialId: 'https://internet/qualquer.jpg' }], e0, { materiais });
    expect(r.estado.layout.variacoes).toEqual({ hero: { altura: 'curto' }, catalogo: { colunas: 3 } });
    expect(r.estado.layout.imagens.hero.url).toBe('https://x/foto.jpg');
    expect(r.descartadas.map((d) => d.motivo)).toEqual(['para colunas de produtos, os valores possíveis são: 2, 3, 4', 'a imagem precisa ser uma das que já estão nos Materiais do cliente (Estúdio)']);
  });
  it('operação desconhecida ou lixo é descartada sem quebrar', () => {
    const r = ap([null, { op: 'html', valor: '<script>' }, { op: 'mover', bloco: 'carrossel', antesDe: 'hero' }]);
    expect(r.aplicadas).toHaveLength(0);
    expect(r.descartadas).toHaveLength(3);
  });
});

describe('o que nunca pode ser alterado', () => {
  it('Pixel, cookies, checkout, selo e políticas são recusados com motivo', () => {
    const r = ap([{ op: 'texto', campo: 'politicas.trocas', valor: '7 dias' }, { op: 'ocultar', bloco: 'cookies' }, { op: 'texto', campo: 'pixel', valor: '1' }, { op: 'ocultar', bloco: 'selo de compra segura' }, { op: 'mover', bloco: 'checkout', antesDe: 'hero' }]);
    expect(r.aplicadas).toHaveLength(0);
    const motivos = r.descartadas.map((d) => d.motivo).join(' | ');
    expect(motivos).toContain('políticas');
    expect(motivos).toContain('aviso de cookies');
    expect(motivos).toContain('Rastreamento');
    expect(motivos).toContain('selo de compra segura');
    expect(motivoProtegido({ op: 'texto', campo: 'heroTitulo' })).toBeNull();
  });
  it('site gerado com layout mexido continua com Pixel travado pelo aceite, banner de cookies, checkout e selo', () => {
    const r = ap([{ op: 'ocultar', bloco: 'faq' }, { op: 'mover', bloco: 'depoimentos', antesDe: 'hero' }, { op: 'paleta', corPrimaria: '#166534', corFundo: '#f7fbf5' }]);
    const html = gerarSiteHTML({ cliente: { nome: 'L', nicho: 'n', marca: {}, rastreamento: { metaPixelId: '123456789012345', hotjarId: '3456789', tawkPropertyId: '64f1a2b3c4d5e6f7a8b9c0d1', tawkWidgetId: 'default' } },
      produtos: [{ id: 'p', nome: 'P', preco: 10, fotos: [] }], conteudo: r.estado.conteudo, config: r.estado.config, layout: r.estado.layout });
    expect(html).toContain('window.carregarRastreamento=function(){');
    expect(html).toContain('static.hotjar.com'); expect(html).toContain('embed.tawk.to');
    expect(html).toContain('id="cookies"'); expect(html).toContain('data-checkout-slot'); expect(html).toContain('Compra segura');
    expect(html).not.toContain('<section id="faq"');
    expect(html.indexOf('Quem já usa')).toBeLessThan(html.indexOf('id="topo"'));
    expect(html).toContain('--cor:#166534');
  });
});

describe('pacote (só conteúdo)', () => {
  const pac = { pacote: { banners: [{ titulo: 'A', subtitulo: 'b', cta: 'c', uso: 'principal' }], briefingTema: { secoesHome: ['Banner', 'Mais vendidos', 'Depoimentos'], paletaSugerida: ['#111111', '#ffffff'] },
    textosPagina: { sobre: 'História', faq: [] }, descricoesProdutos: [{ nome: 'Legging', descricao: 'd', seoTitulo: 's', seoDescricao: 'sd' }] } };
  const e = estadoDoSite(pac, 'pacote');
  it('texto de banner, ordem das seções, paleta e produto do CSV', () => {
    const r = aplicarOperacoes(e, [{ op: 'texto', campo: 'banner.0.titulo', valor: 'Novo' }, { op: 'mover', secao: 'Depoimentos', antesDe: 'Mais vendidos' }, { op: 'paleta', cores: ['#166534', '#f7fbf5'] },
      { op: 'produto', nome: 'legging', campo: 'seoTitulo', valor: 'Legging que não marca' }], { modo: 'pacote' });
    expect(r.aplicadas).toHaveLength(4);
    expect(r.estado.pacote.briefingTema.secoesHome).toEqual(['Banner', 'Depoimentos', 'Mais vendidos']);
    const csv = csvNuvemshop(comTextosDoPacote([{ nome: 'Legging', preco: 10, descricao: 'cadastro' }], r.estado.pacote), { nome: 'L' });
    expect(csv).toContain('Legging que não marca');
  });
  it('mudança de layout no pacote é recusada explicando onde fazer', () => {
    const r = aplicarOperacoes(e, [{ op: 'variacao', bloco: 'hero', opcao: 'altura', valor: 'alto' }], { modo: 'pacote' });
    expect(r.descartadas[0].motivo).toContain('editor de temas');
  });
});

describe('versões', () => {
  it('1ª mudança guarda a versão inicial; voltar cria versão nova; limite de 20', () => {
    let s = { ...site };
    const e1 = ap([{ op: 'texto', campo: 'heroTitulo', valor: 'V2' }]).estado;
    Object.assign(s, e1, registrarVersao(s, { modo: 'custom', estadoAntes: e0, estadoDepois: e1, resumo: 'título' }));
    expect(versoesDoModo(s, 'custom').map((v) => v.n)).toEqual([2, 1]);
    expect(versoesDoModo(s, 'custom')[1].resumo).toBe('Versão inicial (antes dos ajustes)');
    const e2 = ap([{ op: 'ocultar', bloco: 'newsletter' }], e1).estado;
    Object.assign(s, e2, registrarVersao(s, { modo: 'custom', estadoAntes: e1, estadoDepois: e2, resumo: 'newsletter' }));
    const v1 = versoesDoModo(s, 'custom').find((v) => v.n === 1);
    Object.assign(s, v1.estado, registrarVersao(s, { modo: 'custom', estadoAntes: e2, estadoDepois: v1.estado, resumo: 'Voltou para a v1' }));
    expect(versoesDoModo(s, 'custom').map((v) => v.n)).toEqual([4, 3, 2, 1]); // histórico mantido
    expect(s.conteudo.heroTitulo).toBe('Leggings que não marcam');
    for (let i = 0; i < 30; i++) Object.assign(s, registrarVersao(s, { modo: 'custom', estadoAntes: e0, estadoDepois: e0, resumo: `x${i}` }));
    expect(s.versoesAjuste).toHaveLength(MAX_VERSOES);
    expect(versoesDoModo(s, 'custom')[0].n).toBe(34); // numeração continua mesmo com as antigas removidas
  });
  it('layout antigo/ausente vira o padrão', () => {
    expect(normalizarLayout(undefined).ordem[0]).toBe('hero');
    expect(normalizarLayout({ ordem: ['faq', 'xxx'] }).ordem.slice(0, 2)).toEqual(['faq', 'hero']);
    expect(resumoMudancas(['A: 1', 'B: 2'])).toBe('2 mudanças: A; B');
  });
});

describe('resposta da IA', () => {
  it('etiqueta: proposta só com operação; recusa sem operação', () => {
    expect(normalizarAjusteSite({ tipo: 'proposta', resposta: 'ok', operacoes: [] }).tipo).toBe('explicacao');
    expect(normalizarAjusteSite({ tipo: 'proposta', resposta: 'ok', operacoes: [{ op: 'ocultar', bloco: 'faq' }] }).tipo).toBe('proposta');
    expect(normalizarAjusteSite({ tipo: 'recusa', resposta: 'não dá', operacoes: [{ op: 'x' }] })).toMatchObject({ tipo: 'recusa', operacoes: [] });
  });
  it('modelo leve para pedido pontual, forte para pedido amplo', () => {
    expect(pedidoAmplo('troca o título do banner')).toBe(false);
    expect(pedidoAmplo('reescreve todos os textos do site com um tom mais premium')).toBe(true);
  });
});
