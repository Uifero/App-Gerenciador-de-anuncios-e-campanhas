// "Apontar no site" e "Anexar print": ids dos elementos pelo significado (lib/elementos-site.js), o HTML que respeita o
// que o operador mudou (tirar, espaço, tamanho, ordem, acréscimos), as ações do menu viram operações SEM IA, os itens
// legais nunca saem (só o texto muda), o pacote anota o que é do tema, e o "Entendi assim" do print guarda os elementos.
import { describe, it, expect } from 'vitest';
import { gerarSiteHTML } from './sitegen.js';
import { gerarPreviaLojaHTML, dadosDoPacote } from './pacote-loja.js';
import { aplicarOperacoes, normalizarLayout } from './site-blocos.js';
import { operacoesDaAcao, nomeElemento, idFaq, elementoValido, ehLegal, ehCompra, secaoDoElemento, textoAtual, elementosDaSecao, MOTIVO_LEGAL } from './elementos-site.js';
import { secaoDaOperacao, filtrarOperacoes, normalizarEntendimento, responderEntendimento, escolhasDeTexto, estimarCusto } from './ajuste-secoes.js';
import { comApontar } from './apontar-site.js';

const cliente = { id: 'cliT', nome: 'Thermora', nicho: 'suplementos', dadosLoja: { razaoSocial: 'Thermora Ltda', cnpj: '11.222.333/0001-81', email: 'oi@thermora.com', telefone: '(41) 3333-0000' } };
const produtos = [{ id: 'p1', nome: 'Thermora', preco: 197, fotos: [{ url: 'https://x/f30.jpg' }] }];
const conteudo = { heroTitulo: 'Thermora: sua rotina com mais foco', heroSubtitulo: 'Cápsulas com cafeína e chá verde', heroCta: 'Comprar agora', storytelling: 'A Thermora nasceu em 2021.', faq: [{ p: 'Como tomar?', r: 'Duas cápsulas por dia.' }, { p: 'Tem cafeína?', r: 'Sim, 80 mg.' }], politicas: { trocas: 'Troca em 7 dias corridos.' } };
const config = { recursos: { freteGratis: { valor: 199 }, paginaProduto: true } };
const site = (layout = {}) => gerarSiteHTML({ cliente, produtos, conteudo, config, layout });
const materiais = [{ id: 'm27', codigo: 'F27', url: 'https://x/f27.jpg', usos: {} }, { id: 'm12', codigo: 'F12', url: 'https://x/f12.jpg', usos: { galeria: 'manual' } }];
const ESTADO = { conteudo, config, layout: normalizarLayout({}) };

describe('cada elemento tem id pelo significado no HTML', () => {
  const h = site();
  it('banner, página do produto, FAQ e rodapé', () => {
    for (const id of ['hero', 'hero.titulo', 'hero.subtitulo', 'hero.botao', 'produto.preco', 'produto.frete', 'produto.botao', 'vendidos.preco', 'marca.texto', 'rodape.cnpj', 'rodape.trocas', idFaq('Como tomar?')]) expect(h, id).toContain(`data-el="${id}"`);
    expect(h).toContain('data-el-nome="Página do produto › selo de frete"');
    expect(h).toContain('data-el-nome="Rodapé › CNPJ"');
  });
  it('o id não muda quando a ordem muda (FAQ pela pergunta, não pela posição)', () => {
    const outra = gerarSiteHTML({ cliente, produtos, conteudo: { ...conteudo, faq: [...conteudo.faq].reverse() }, config });
    expect(outra).toContain(`data-el="${idFaq('Como tomar?')}"`);
    expect(idFaq('Como tomar?')).toBe(idFaq('  como TOMAR? '));
  });
  it('o script de apontar só entra na prévia (nunca no site baixado nem no link)', () => {
    expect(h).not.toContain('gcc-apontado');
    expect(comApontar(h)).toContain('gcc-apontado');
  });
});

describe('o HTML respeita o que o operador mudou', () => {
  it('tirar, espaço (P/M/G/GG), tamanho e ordem dentro da seção', () => {
    const L = { elementos: { 'produto.frete': { oculto: true }, 'hero.titulo': { espaco: 2, tamanho: 1 }, vendidos: { espaco: -1 } }, ordemElementos: { hero: ['botao', 'titulo', 'subtitulo', 'contador'] } };
    const h = site(L);
    expect(h).not.toContain('data-el="produto.frete"');
    const tag = (id) => (new RegExp(`<[a-z0-9]+[^>]*data-el="${id.replace('.', '\\.')}"[^>]*>`).exec(h) || [''])[0];
    expect(tag('hero.titulo')).toContain('style="margin-top:36px;margin-bottom:36px;zoom:1.15;order:1"');
    expect(tag('hero.botao')).toContain('style="order:0"');
    expect(h).toContain('class="hero-txt ord"');
    expect(tag('vendidos')).toMatch(/^<section id="vendidos"[^>]*style="padding-top:20px;padding-bottom:20px"/);
  });
  it('"Adicionar abaixo": texto, selo e foto pelo código (lida dos Materiais)', () => {
    const L = { extras: [{ id: 'extra.1', apos: 'produto.preco', tipo: 'selo', texto: 'Envio em 24h' }, { id: 'extra.2', apos: 'hero.subtitulo', tipo: 'foto', codigo: 'F27' }] };
    const h = gerarSiteHTML({ cliente, produtos, conteudo, config, layout: L, materiais });
    expect(h).toMatch(/data-el="produto\.preco"[^>]*>[^<]*<s>|data-el="produto\.preco"/);
    expect(h).toContain('<p class="extra-selo" data-el="extra.1"');
    expect(h).toContain('✓ Envio em 24h');
    expect(h).toMatch(/<img class="extra-foto" data-el="extra\.2"[^>]*src="https:\/\/x\/f27\.jpg"/);
  });
});

describe('ações do menu viram operações sem IA', () => {
  const ctx = { estado: ESTADO, modo: 'custom', materiais, produtos };
  it('itens legais NÃO saem (CDC e Decreto 7.962/2013), mas o texto muda', () => {
    for (const id of ['rodape.cnpj', 'rodape.telefone', 'rodape.trocas', 'rodape']) expect(operacoesDaAcao('tirar', id, null, ctx).recusa).toMatch(/Decreto 7\.962\/2013/);
    expect(operacoesDaAcao('texto', 'rodape.telefone', '(41) 99999-0000', ctx).ops).toEqual([{ op: 'dadoLoja', campo: 'telefone', valor: '(41) 99999-0000' }]);
    expect(operacoesDaAcao('texto', 'rodape.trocas', 'Troca em até 30 dias corridos, com frete por nossa conta.', ctx).ops[0]).toMatchObject({ op: 'texto', campo: 'politicas.trocas' });
    expect(operacoesDaAcao('texto', 'rodape.cnpj', '   ', ctx).recusa).toMatch(/não pode ficar vazio/);
  });
  it('preço e botão de compra saem com confirmação explicando o impacto', () => {
    expect(ehCompra('produto.preco') && ehCompra('vendidos.botao')).toBe(true);
    const r = operacoesDaAcao('tirar', 'produto.botao', null, ctx);
    expect(r.ops).toEqual([{ op: 'elemento', id: 'produto.botao', acao: 'ocultar' }]);
    expect(r.confirmar).toBe('Sem botão de compra o cliente não consegue comprar por aqui. Tirar mesmo assim?');
    expect(operacoesDaAcao('tirar', 'produto.frete', null, ctx)).toEqual({ ops: [{ op: 'elemento', id: 'produto.frete', acao: 'ocultar' }] });
  });
  it('espaço no elemento e entre seções, tamanho, ordem', () => {
    expect(operacoesDaAcao('junto', 'produto.frete', null, ctx).ops).toEqual([{ op: 'elemento', id: 'produto.frete', acao: 'espaco', passo: -1 }]);
    expect(operacoesDaAcao('separado', 'faq', null, ctx).ops).toEqual([{ op: 'elemento', id: 'faq', acao: 'espaco', passo: 1 }]);
    expect(operacoesDaAcao('maior', 'hero.titulo', null, ctx).ops[0]).toMatchObject({ acao: 'tamanho', passo: 1 });
    expect(operacoesDaAcao('maior', 'faq', null, ctx).recusa).toMatch(/cada elemento/);
    expect(operacoesDaAcao('subir', 'hero.botao', null, ctx).ops).toEqual([{ op: 'elemento', id: 'hero.botao', acao: 'mover', direcao: 'subir' }]);
    expect(operacoesDaAcao('descer', 'vendidos', null, ctx).ops).toEqual([{ op: 'mover', bloco: 'vendidos', depoisDe: 'sale' }]);
    expect(operacoesDaAcao('descer', idFaq('Como tomar?'), null, ctx).ops).toEqual([{ op: 'faq', acao: 'mover', indice: 0, direcao: 'descer' }]);
    expect(operacoesDaAcao('subir', 'galeria.foto.F12', null, ctx).recusa).toMatch(/Materiais/);
  });
  it('trocar foto vira escolha no "Usar em" (uma fonte só)', () => {
    expect(operacoesDaAcao('foto', 'galeria.foto.F12', 'F27', ctx).ops).toEqual([{ op: 'foto', codigo: 'F12', uso: 'galeria', acao: 'tirar' }, { op: 'foto', codigo: 'F27', uso: 'galeria', acao: 'usar' }]);
    expect(operacoesDaAcao('foto', 'produto.fotos', 'F27', { ...ctx, produtoId: 'p1' }).ops).toEqual([{ op: 'foto', codigo: 'F27', uso: 'produto', produto: 'Thermora', acao: 'usar', principal: true, ordem: 1 }]);
  });
  it('"Adicionar abaixo": acréscimo e pergunta logo depois da tocada', () => {
    expect(operacoesDaAcao('adicionar', 'produto.preco', { tipo: 'selo', texto: 'Envio em 24h' }, ctx).ops).toEqual([{ op: 'extra', acao: 'adicionar', apos: 'produto.preco', tipo: 'selo', texto: 'Envio em 24h' }]);
    expect(operacoesDaAcao('adicionar', idFaq('Como tomar?'), { tipo: 'pergunta', p: 'Pode tomar à noite?', r: 'Melhor de manhã.' }, ctx).ops).toEqual([{ op: 'faq', acao: 'adicionar', p: 'Pode tomar à noite?', r: 'Melhor de manhã.', depoisDe: 0 }]);
    expect(operacoesDaAcao('adicionar', 'rodape.cnpj', { tipo: 'texto', texto: 'x' }, ctx).recusa).toMatch(/rodapé legal/);
  });
  it('pacote: espaço, tamanho e acréscimo são do tema (anotados no passo 6); seção e texto continuam', () => {
    const p = { estado: { pacote: { visual: { ordem: ['banner', 'provas', 'produtos'], ocultas: [] }, banners: [{ titulo: 'Thermora' }] } }, modo: 'pacote' };
    expect(operacoesDaAcao('separado', 'banner.titulo', null, p).tema).toEqual({ secao: 'Banner', elemento: 'Banner › título', oque: 'Deixar mais separado (mais espaço em volta)' });
    expect(operacoesDaAcao('adicionar', 'banner', { tipo: 'selo', texto: 'Frete grátis' }, p).tema.oque).toMatch(/selo/);
    expect(operacoesDaAcao('descer', 'banner', null, p).ops).toEqual([{ op: 'mover', bloco: 'banner', depoisDe: 'provas' }]);
    expect(operacoesDaAcao('texto', 'banner.titulo', 'Mais foco', p).ops).toEqual([{ op: 'texto', campo: 'banner.0.titulo', valor: 'Mais foco' }]);
  });
});

describe('o validador (lib/site-blocos.js)', () => {
  const aplicar = (ops) => aplicarOperacoes({ ...ESTADO, layout: {} }, ops, { modo: 'custom', materiais, dadosLoja: cliente.dadosLoja });
  it('passos fixos: espaço -1..2, tamanho -2..+2; várias mudanças juntas', () => {
    const r = aplicar([{ op: 'elemento', id: 'hero.titulo', acao: 'espaco', passo: 1 }, { op: 'elemento', id: 'hero.titulo', acao: 'espaco', passo: 1 }, { op: 'elemento', id: 'hero.titulo', acao: 'espaco', passo: 1 }, { op: 'elemento', id: 'hero.titulo', acao: 'tamanho', passo: -1 }]);
    expect(r.estado.layout.elementos['hero.titulo']).toEqual({ espaco: 2, tamanho: -1 });
    expect(r.descartadas[0].motivo).toMatch(/espaço máximo/);
    expect(r.mudancas).toContain('Banner › título: espaço em volta M → G');
  });
  it('legal: não sai; política não fica vazia; CNPJ conferido; dado da loja à parte (vai para o cliente ao aplicar)', () => {
    const r = aplicar([{ op: 'elemento', id: 'rodape.cnpj', acao: 'ocultar' }, { op: 'texto', campo: 'politicas.trocas', valor: '' }, { op: 'dadoLoja', campo: 'cnpj', valor: '11.111.111/1111-11' }, { op: 'dadoLoja', campo: 'telefone', valor: '(41) 99999-0000' }]);
    expect(r.descartadas.map((d) => d.motivo).join(' | ')).toMatch(/CNPJ não sai do site.*\| .*não pode ficar vazia.*\| .*não conferem/);
    expect(r.estado.dadosLoja).toEqual({ telefone: '(41) 99999-0000' });
    expect(r.estado.conteudo.politicas.trocas).toBe('Troca em 7 dias corridos.');
  });
  it('acréscimo ganha id e pode ser editado e tirado; FAQ muda de ordem', () => {
    const r = aplicar([{ op: 'extra', acao: 'adicionar', apos: 'produto.preco', tipo: 'texto', texto: 'Feito no Brasil' }, { op: 'faq', acao: 'mover', indice: 1, direcao: 'subir' }]);
    expect(r.estado.layout.extras).toEqual([{ id: 'extra.1', apos: 'produto.preco', tipo: 'texto', texto: 'Feito no Brasil' }]);
    expect(r.estado.conteudo.faq[0].p).toBe('Tem cafeína?');
    const r2 = aplicarOperacoes(r.estado, [{ op: 'extra', acao: 'editar', id: 'extra.1', texto: 'Fabricado no Brasil' }, { op: 'extra', acao: 'remover', id: 'extra.9' }], { modo: 'custom', materiais });
    expect(r2.estado.layout.extras[0].texto).toBe('Fabricado no Brasil');
    expect(r2.descartadas[0].motivo).toMatch(/não existe mais/);
  });
  it('"Subir" pula o elemento que não aparece na página (contador sem prazo)', () => {
    const ops = operacoesDaAcao('subir', 'hero.botao', null, { estado: ESTADO, irmaos: ['hero.titulo', 'hero.subtitulo', 'hero.botao'] }).ops;
    expect(ops).toEqual([{ op: 'elemento', id: 'hero.botao', acao: 'mover', direcao: 'subir', visiveis: ['titulo', 'subtitulo', 'botao'] }]);
    expect(aplicar(ops).estado.layout.ordemElementos.hero).toEqual(['titulo', 'botao', 'contador', 'subtitulo']);
  });
  it('layout guardado é limpo (id que não existe sai; passos dentro do limite)', () => {
    expect(normalizarLayout({ elementos: { 'hero.titulo': { espaco: 9 }, 'xyz.abc': { oculto: true } }, ordemElementos: { hero: ['botao', 'inexistente'] } })).toMatchObject({ elementos: { 'hero.titulo': { espaco: 2 } }, ordemElementos: { hero: ['botao'] } });
  });
});

describe('ajuste por seção e print', () => {
  it('a seção da operação vem do elemento; o app recusa elemento fora das seções enviadas', () => {
    expect(secaoDaOperacao({ op: 'elemento', id: 'produto.frete' })).toBe('produto');
    expect(secaoDaOperacao({ op: 'extra', acao: 'adicionar', apos: 'hero.botao' })).toBe('hero');
    expect(secaoDaOperacao({ op: 'dadoLoja', campo: 'cnpj' })).toBe('rodape');
    const r = filtrarOperacoes([{ op: 'elemento', id: 'produto.frete', acao: 'ocultar' }, { op: 'elemento', id: 'hero.titulo', acao: 'tamanho', passo: 1 }], ['produto']);
    expect(r.dentro).toHaveLength(1);
    expect(r.fora[0].motivo).toMatch(/Recusado: mexeria em "Banner principal"/);
  });
  it('a IA recebe os elementos da seção', () => {
    expect(elementosDaSecao('faq', ESTADO)).toEqual(['faq', 'faq.titulo', idFaq('Como tomar?'), idFaq('Tem cafeína?')]);
  });
  it('"Entendi assim" do print: só elementos que existem; ambíguo pergunta com os elementos; referência só ideia de layout', () => {
    const e = normalizarEntendimento({ secoes: [{ id: 'produto', oque: 'tirar o selo', elementos: ['produto.frete', 'xyz.inventado', 'hero.titulo'] }],
      perguntas: [{ texto: 'Você marcou o selo de frete ou o preço?', opcoes: [{ texto: 'O selo de frete', elementos: ['produto.frete'] }, { texto: 'O preço', elementos: ['produto.preco'] }] }],
      referencia: { copiar: 'banner com a foto à direita e o texto à esquerda' } });
    expect(e.secoes[0].elementos).toEqual(['produto.frete']);
    expect(e.perguntas[0].opcoes[1]).toMatchObject({ secoes: ['produto'], elementos: ['produto.preco'] });
    expect(e.referencia).toEqual({ copiar: 'banner com a foto à direita e o texto à esquerda' });
    const r = responderEntendimento(e, 'q1', 1);
    expect(r.secoes[0].elementos).toEqual(['produto.frete', 'produto.preco']);
  });
  it('texto que a IA sugere em "Adicionar abaixo" passa pela escolha de versão', () => {
    expect(escolhasDeTexto([{ op: 'extra', acao: 'adicionar', id: 'extra.3', apos: 'produto.preco', tipo: 'texto', texto: 'Acelera o metabolismo', segura: 'Cafeína e chá verde' }], {}, 'custom'))
      .toEqual([{ campo: 'extra.3', extra: true, original: '', melhorada: 'Acelera o metabolismo', segura: 'Cafeína e chá verde', escolha: null }]);
  });
  it('custo estimado com imagem é maior que sem imagem', () => {
    const sem = estimarCusto('ajuste_entender', 3000), com = estimarCusto('ajuste_entender_print', 3000, { tokensImagem: 1920 });
    expect(com.modelo).toBe('Haiku');
    expect(com.usd).toBeGreaterThan(sem.usd);
  });
});

describe('prévia do pacote', () => {
  it('seções e textos editáveis ganham id; nome com a seção', () => {
    const h = gerarPreviaLojaHTML(dadosDoPacote({ cliente, site: { pacote: { banners: [{ titulo: 'Mais foco', subtitulo: 'Cápsulas' }], textosPagina: { sobre: 'Desde 2021.', faq: [{ p: 'Como tomar?', r: 'Duas.' }] } } }, produtos }));
    for (const id of ['banner', 'banner.titulo', 'produtos', 'sobre.texto', idFaq('Como tomar?')]) expect(h, id).toContain(`data-el="${id}"`);
    expect(nomeElemento('banner.titulo')).toBe('Banner › título');
    expect(ehLegal('confianca') && elementoValido('sobre.texto') && secaoDoElemento('sobre.texto') === 'sobre').toBe(true);
    expect(textoAtual('banner.titulo', { estado: { pacote: { banners: [{ titulo: 'Mais foco' }] } }, modo: 'pacote' })).toBe('Mais foco');
    expect(MOTIVO_LEGAL).toMatch(/Código de Defesa do Consumidor/);
  });
});
