// Biblioteca de animações (criativos) e animações do site: preenchimento dos presets, zona segura do texto animado,
// bloqueio de saúde/colchete, normalização da IA, "Parece anúncio?" das peças animadas e a regra do contador.
import { describe, it, expect } from 'vitest';
import { PRESETS, planoInicial, conferirPlano, motivoPreset, normalizarPlanoIa, layoutAnimacao, cenaNoTempo, itensDoProduto, precoDe, freteDe, ajustarDuracao, DURACAO_MAX_GIF, telasDe } from './animacoes.js';
import { foraDaZona } from './formatos-instagram.js';
import { pareceAnuncio } from './parece-anuncio.js';
import { prazoDaOferta, normalizarAnimacoes, cssAnimacoes, instrucoesTema, PADRAO_ANIMACOES } from './animacoes-site.js';
import { dadosDoPacote, gerarPreviaLojaHTML } from './pacote-loja.js';
import { gerarSiteHTML } from './sitegen.js';

const saude = { nome: 'Thermora', nicho: 'suplemento termogênico', marca: { produtoSaude: true, ofertaAtiva: 'Frete grátis acima de R$ 249' } };
const moda = { nome: 'Ateliê Lume', nicho: 'moda feminina em linho', marca: {} };
const criativo = { hook: 'Minha manhã antes do trabalho', copy: 'Eu tomo uma cápsula com o café e saio. Cabe na bolsa.', cta: 'O link tá no perfil' };
const produto = { nome: 'Thermora Caps', preco: 149.9, precoPromocional: 129.9, formula: 'Cafeína 200 mg, chá verde 300 mg' };

describe('preenchimento dos presets (sem IA)', () => {
  it('cada preset sai com cenas, duração no limite e o CTA no fim (menos o GIF)', () => {
    for (const p of PRESETS.filter((x) => x.id !== 'antes_depois')) {
      const pl = planoInicial(p.id, { criativo, produto, cliente: saude, nFotos: 3 });
      expect(pl.cenas.length, p.id).toBeGreaterThan(0);
      expect(pl.duracao, p.id).toBeLessThanOrEqual(p.gif ? DURACAO_MAX_GIF : 20);
      if (!p.gif) expect(pl.cenas.at(-1)).toMatchObject({ tipo: 'cta', texto: 'O link tá no perfil' });
    }
  });
  it('itens saem do cadastro (composição); sem cadastro, aviso e nenhum item inventado', () => {
    expect(planoInicial('itens', { criativo, produto, cliente: saude }).cenas.filter((c) => c.tipo === 'item').map((c) => c.texto)).toEqual(['Cafeína 200 mg', 'chá verde 300 mg']);
    const sem = planoInicial('itens', { criativo, produto: { nome: 'X' }, cliente: saude });
    expect(sem.cenas.filter((c) => c.tipo === 'item')).toEqual([]);
    expect(sem.avisos.join(' ')).toMatch(/não inventa itens/);
    expect(itensDoProduto({ beneficios: '- leve\n- cabe na bolsa' })).toEqual(['leve', 'cabe na bolsa']);
  });
  it('preço e frete só do cadastro', () => {
    expect(precoDe(produto)).toEqual({ de: 'R$ 149,90', por: 'R$ 129,90' });
    expect(precoDe({})).toBeNull();
    expect(freteDe({ cliente: saude })).toBe('Frete grátis acima de R$ 249');
    expect(freteDe({ cliente: moda, recursos: { freteGratis: { valor: 199 } } })).toBe('Frete grátis acima de R$ 199,00');
    const gif = planoInicial('gif_preco', { criativo, produto, cliente: saude });
    expect(gif).toMatchObject({ preco: { por: 'R$ 129,90' }, frete: 'Frete grátis acima de R$ 249', duracao: 3 });
  });
  it('texto em ritmo de fala: poucas palavras por tela, sem palavra sozinha no fim do trecho', () => {
    expect(telasDe('Eu tomo uma cápsula com o café e saio.', 4)).toEqual(['Eu tomo uma', 'cápsula com o', 'café e saio.']);
    expect(planoInicial('kinetic', { criativo, produto, cliente: saude }).cenas.every((c) => c.texto.split(' ').length <= 5)).toBe(true);
  });
  it('duração acima do limite encolhe as cenas; GIF fica em até 6 s', () => {
    const longo = ajustarDuracao({ preset: 'zoom_legenda', cenas: Array.from({ length: 8 }, () => ({ texto: 'x', dur: 6 })) });
    expect(longo.duracao).toBeLessThanOrEqual(20);
    expect(ajustarDuracao({ preset: 'gif_preco', cenas: [{ texto: 'x', dur: 6 }, { texto: 'y', dur: 6 }] }).duracao).toBeLessThanOrEqual(6);
  });
  it('em que cena cai cada segundo', () => {
    const pl = { cenas: [{ dur: 2 }, { dur: 3 }] };
    expect(cenaNoTempo(pl, 0).i).toBe(0); expect(cenaNoTempo(pl, 2.5)).toMatchObject({ i: 1, p: 0.5 / 3 }); expect(cenaNoTempo(pl, 99).i).toBe(1);
  });
});

describe('zona segura do texto animado', () => {
  it('legenda, oferta, CTA, título, itens e centro ficam dentro da zona do Instagram em 9:16, 4:5 e no GIF', () => {
    for (const [w, h] of [[1080, 1920], [1080, 1350], [540, 960], [270, 480]]) expect(foraDaZona(layoutAnimacao(w, h).caixas, w, h)).toEqual([]);
  });
});

describe('bloqueio de saúde, colchete e política nos textos animados', () => {
  it('promessa de efeito no corpo em produto de saúde bloqueia a gravação', () => {
    const pl = planoInicial('kinetic', { criativo: { ...criativo, copy: 'Acelera o metabolismo e queima gordura.' }, produto, cliente: saude });
    expect(conferirPlano(pl, { cliente: saude }).bloqueio).toMatch(/^Não dá para gravar: produto de saúde/);
    const editado = { ...planoInicial('zoom_legenda', { criativo, produto, cliente: saude }) };
    editado.cenas = [...editado.cenas, { texto: 'mais energia o dia todo', dur: 2, tipo: 'fala' }];
    expect(conferirPlano(editado, { cliente: saude }).bloqueio).toMatch(/saúde/);
    expect(conferirPlano(planoInicial('zoom_legenda', { criativo, produto, cliente: saude }), { cliente: saude }).bloqueio).toBe('');
  });
  it('colchete do modelo de gancho bloqueia', () => {
    const pl = planoInicial('zoom_legenda', { criativo: { ...criativo, hook: 'A verdade sobre [produto]' }, produto, cliente: moda });
    expect(conferirPlano(pl, { cliente: moda }).bloqueio).toMatch(/colchete/);
  });
  it('antes e depois: proibido em saúde e cosmético; em moda, precisa de duas fotos reais', () => {
    expect(motivoPreset('antes_depois', { cliente: saude, fotos: 2 })).toMatch(/saúde/);
    expect(motivoPreset('antes_depois', { cliente: { nicho: 'cosméticos para pele' }, fotos: 2 })).toMatch(/cosmético/);
    expect(motivoPreset('antes_depois', { cliente: moda, fotos: 1 })).toMatch(/duas fotos/);
    expect(motivoPreset('antes_depois', { cliente: moda, fotos: 2 })).toBe('');
  });
  it('tela com muitas palavras vira aviso (não bloqueia)', () => {
    const pl = { preset: 'kinetic', duracao: 3, cenas: [{ texto: 'uma duas três quatro cinco seis sete oito nove', dur: 3, tipo: 'fala' }] };
    expect(conferirPlano(pl, { cliente: moda })).toMatchObject({ bloqueio: '' });
    expect(conferirPlano(pl, { cliente: moda }).avisos.join(' ')).toMatch(/mais de 8 palavras/);
  });
});

describe('preenchimento pela IA', () => {
  const base = planoInicial('oferta_final', { criativo, produto, cliente: saude });
  it('só texto e tempo; preço que a IA escrever sai; a cena de oferta do app fica', () => {
    const r = normalizarPlanoIa({ cenas: [{ tipo: 'fala', texto: 'Aqui em casa é assim, R$ 99', dur: 2.2 }, { tipo: 'cta', texto: 'Link no perfil', dur: 2 }] }, base);
    expect(r.cenas.map((c) => c.tipo)).toEqual(['fala', 'oferta', 'cta']);
    expect(r.cenas[0].texto).toBe('Aqui em casa é assim,');
    expect(r.preco).toEqual(base.preco);
    expect(r.preenchidoPor).toBe('ia');
  });
  it('resposta vazia mantém o plano do app', () => { expect(normalizarPlanoIa({}, base)).toBe(base); });
});

describe('"Parece anúncio?" nas peças animadas', () => {
  it('preset em estilo anúncio e tela cheia de texto contam; estilo orgânico curto, não', () => {
    const anuncio = pareceAnuncio({}, { cliente: moda, peca: { tipo: 'video', config: { animacao: 'oferta_final', estilo: 'anuncio', hook: 'Minha manhã', cenas: [{ texto: 'um dois três quatro cinco seis sete oito nove', tipo: 'fala' }] } } });
    expect(anuncio.motivos.map((m) => m.id)).toEqual(['animacao-anuncio', 'texto-tela']);
    const org = pareceAnuncio({ copy: 'Eu uso todo dia.' }, { cliente: moda, peca: { tipo: 'video', config: { animacao: 'zoom_legenda', estilo: 'organico', hook: 'Minha manhã', cenas: [{ texto: 'Minha manhã', tipo: 'fala' }] } } });
    expect(org.nota).toBe(0);
  });
});

describe('animações do site', () => {
  const hoje = new Date('2026-10-14T12:00:00');
  it('contador só com prazo real na oferta ativa', () => {
    expect(prazoDaOferta({ marca: { ofertaAtiva: 'Frete grátis acima de R$ 249' } }, hoje).motivo).toMatch(/não tem data de término[\s\S]*não inventa prazo/);
    expect(prazoDaOferta({ marca: {} }, hoje).motivo).toMatch(/Não há oferta ativa/);
    expect(prazoDaOferta({ marca: { ofertaAtiva: 'Desconto até 31/10' } }, hoje)).toMatchObject({ texto: 'Oferta até 31/10 às 23:59' });
    expect(prazoDaOferta({ marca: { ofertaAtiva: '10% off, válida até 5 de novembro' } }, hoje).texto).toBe('Oferta até 05/11 às 23:59');
    expect(prazoDaOferta({ marca: { ofertaAtiva: 'Promo até 10/10' } }, hoje).motivo).toMatch(/já passou/);
    expect(normalizarAnimacoes({ contador: true }, { prazo: null }).contador).toBe(false);
    expect(normalizarAnimacoes({ contador: true }, { prazo: prazoDaOferta({ marca: { ofertaAtiva: 'até 31/10' } }, hoje) }).contador).toBe(true);
    expect(normalizarAnimacoes(null)).toEqual(PADRAO_ANIMACOES);
  });
  it('CSS: só dentro de prefers-reduced-motion, só opacity/transform, nunca na página do produto nem no botão de compra', () => {
    const css = cssAnimacoes({ revelar: true, banner: true, botao: true, frete: true, junto: true });
    const anim = css.slice(css.indexOf('@media (prefers-reduced-motion:no-preference)'));
    expect(css.indexOf('@keyframes')).toBeGreaterThan(css.indexOf('@media (prefers-reduced-motion:no-preference)'));
    expect(anim).not.toMatch(/(width|height|margin|padding|top|left)\s*:/);
    expect(anim).toMatch(/animation-timeline:view\(\)/);
    const revelar = /\.anim-revelar[^{]*\{/.exec(anim)[0];
    expect(revelar.replace(/:not\([^)]*\)/g, '')).not.toMatch(/pagina|pdp|comprar|barra-compra/); // o que aparece é só exclusão
    expect(revelar).toContain(':not(.pdp-pagina)');
    expect(revelar).toContain(':not(.pagina)'); // página do produto do pacote: o transform prenderia a barra fixa de compra
    expect(cssAnimacoes({})).toBe('');
  });
  it('prévia do pacote e site personalizado ganham as classes; contador aparece só com prazo; site tem o script do contador', () => {
    const prod = [{ id: 'p1', nome: 'P', preco: 10, fotos: [{ url: 'https://x/p.jpg' }] }];
    const comPrazo = { nome: 'L', marca: { ofertaAtiva: `Frete grátis até 31/12/${new Date().getFullYear()}` } };
    const h = gerarPreviaLojaHTML(dadosDoPacote({ cliente: comPrazo, site: { animacoes: { contador: true } }, produtos: prod }));
    expect(h).toMatch(/<body class="anim-revelar anim-banner anim-botao anim-contador">/);
    expect(h).toContain('data-contador');
    expect(h).not.toMatch(/<script/i);
    const sem = gerarPreviaLojaHTML(dadosDoPacote({ cliente: { nome: 'L', marca: {} }, site: { animacoes: { contador: true } }, produtos: prod }));
    expect(sem).not.toContain('data-contador');
    const s = gerarSiteHTML({ cliente: comPrazo, produtos: prod, conteudo: { heroTitulo: 'Oi' }, animacoes: { contador: true, revelar: false } });
    expect(s).toMatch(/<body class="anim-banner anim-botao anim-contador">/);
    expect(s).toContain("querySelectorAll('[data-contador]')");
  });
  it('passo 6: instrução de tema (Dawn tem "Animações"; nos outros, conferir), sem prometer igual', () => {
    const a = normalizarAnimacoes(null);
    expect(instrucoesTema(a, 'shopify', 'dawn')[0].valor).toMatch(/Configurações do tema > Animações/);
    expect(instrucoesTema(a, 'nuvemshop', '')[0].valor).toMatch(/confira no editor do tema/);
    expect(instrucoesTema(a, 'shopify', 'horizon').at(-1).valor).toMatch(/pode não ser igual/);
    expect(instrucoesTema({ ...a, contador: true }, 'nuvemshop').map((x) => x.valor).join(' ')).toMatch(/app de contador/);
  });
});
