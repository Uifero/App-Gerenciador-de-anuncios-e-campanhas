// Modelo pronto do "Como eu quero o site": linhas com "[...]" do modelo ficam de fora (leitura sem IA e IA), cada título
// em MAIÚSCULAS vira uma seção, "pergunta | resposta" vira par de FAQ, parte só com "[...]" é "Não preenchido" (cinza)
// e "não sei" vira ponto para decidir, nunca dado inventado. IA simulada com tests/fixtures/ia/plano-modelo-secoes.json.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MODELO_PEDIDO_SITE, limparModelo, limparLinhaModelo, paresFaq, tituloMaiusculo, naoSeiDoTexto } from './modelo-pedido-site.js';
import { dividirSecoes, lerReferencias, tituloDaLinha } from './fotos-site.js';
import { normalizarPlanoSecoes, aplicarTodasSecoes, itensAceitos, STATUS_SECAO } from './plano-site.js';
import { aplicarTextosNoEstado, LIMITE_TEXTO_SITE } from './textos-site.js';

vi.mock('../core/auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('../modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));

const FX = JSON.parse(readFileSync('tests/fixtures/ia/plano-modelo-secoes.json', 'utf8'));
const TITULOS = ['VISÃO GERAL', 'BANNER', 'PÁGINA DO PRODUTO', 'DEPOIMENTOS', 'SOBRE A MARCA', 'PERGUNTAS FREQUENTES', 'FRETE E PAGAMENTO', 'CARRINHO', 'RODAPÉ', 'NÃO QUERO NO SITE'];
const foto = (n) => ({ id: `m${n}`, codigo: `F${n}`, url: `https://x/f${n}.jpg`, origem: 'envio', tipo: 'image/jpeg', nomeOriginal: `f${n}.jpg` });
const MATERIAIS = Array.from({ length: 40 }, (_, i) => foto(i + 1));
const PRODUTOS = [{ id: 'p1', nome: 'Thermora' }];
// O modelo preenchido em parte, como o operador faria.
const PREENCHIDO = MODELO_PEDIDO_SITE
  .replace('Loja: [nome da loja]', 'Loja: Thermora')
  .replace('Público: [quem compra, ex: mulheres de 30 a 50 anos que ...]', 'Público: mulheres de 35 a 55 anos')
  .replace('Fotos: [F1, F2, F3] no banner, nessa ordem', 'Fotos: F2, F1 no banner, nessa ordem')
  .replace('Título: [nome como deve aparecer]', 'Título: Thermora Caps')
  .replace('Preço: [de R$ ... por R$ ...]', 'Preço: não sei')
  .replace('[pergunta] | [resposta]', 'Quanto tempo demora a entrega? | De 5 a 12 dias úteis.')
  .replace('[pergunta] | [resposta]', 'Posso tomar junto com café? | Sim, siga o modo de uso do rótulo.');

describe('o modelo', () => {
  it('cabe bem abaixo do limite de 12.000 caracteres', () => {
    expect(MODELO_PEDIDO_SITE.length).toBeLessThan(LIMITE_TEXTO_SITE / 4);
    expect(MODELO_PEDIDO_SITE.split('\n')[0]).toBe('VISÃO GERAL:');
    expect(MODELO_PEDIDO_SITE.endsWith('[ex: contador de estoque falso, pop-up ao entrar, cara de template]')).toBe(true);
  });
  it('todo título do modelo vira uma seção (MAIÚSCULAS terminando em ":")', () => {
    const s = dividirSecoes(MODELO_PEDIDO_SITE);
    expect(s.map((x) => x.titulo)).toEqual(TITULOS);
    for (const t of TITULOS) expect(tituloDaLinha(`${t}:`)).toMatchObject({ titulo: t, fixo: true, nivel: 2 });
    expect(tituloMaiusculo('CNPJ: [número]')).toBeNull(); // rótulo com conteúdo não é título
    expect(tituloMaiusculo('Banner:')).toBeNull();
  });
  it('modelo sem preencher: nada vai para a leitura (só os títulos) e toda seção é "não preenchida"', () => {
    expect(limparModelo(MODELO_PEDIDO_SITE).replace(/\n+/g, '\n').trim().split('\n').map((l) => l.replace(/:$/, ''))).toEqual(TITULOS);
    expect(dividirSecoes(MODELO_PEDIDO_SITE).every((x) => x.naoPreenchido)).toBe(true);
    const r = lerReferencias(MODELO_PEDIDO_SITE, { materiais: MATERIAIS, produtos: PRODUTOS });
    expect(r.refs).toEqual([]); // [F1, F2, F3], [F10], [F20, F21, F22]... são do modelo: não viram foto no site
    expect(r.inexistentes).toEqual([]);
    expect(paresFaq(MODELO_PEDIDO_SITE, 'PERGUNTAS FREQUENTES')).toEqual([]);
  });
});

describe('linhas com "[...]" do modelo', () => {
  it('linha ainda do modelo sai; linha preenchida em parte perde só os colchetes do modelo', () => {
    expect(limparLinhaModelo('Preço: [de R$ ... por R$ ...]')).toEqual({ linha: '', ignorada: true });
    expect(limparLinhaModelo('Fotos: [F1, F2, F3] no banner, nessa ordem')).toEqual({ linha: '', ignorada: true });
    expect(limparLinhaModelo('Site de referência: loja.com (gosto de: [o que gosta nele])').linha).toBe('Site de referência: loja.com');
    expect(limparLinhaModelo('Preço: de R$ 199 por [R$ ...]').linha).toBe('Preço: de R$ 199 por');
  });
  it('colchete escrito pelo operador (que não é do modelo) fica', () => {
    expect(limparLinhaModelo('Fotos: [F4, F5] no banner').linha).toBe('Fotos: [F4, F5] no banner');
    expect(lerReferencias('BANNER:\nFotos: [F4, F5] no banner', { materiais: MATERIAIS, produtos: PRODUTOS }).refs.map((x) => `${x.codigo}:${x.uso}`)).toEqual(['F4:banner', 'F5:banner']);
  });
  it('modelo preenchido em parte: só o que ele escreveu é lido', () => {
    const r = lerReferencias(PREENCHIDO, { materiais: MATERIAIS, produtos: PRODUTOS });
    expect(r.refs.map((x) => `${x.codigo}:${x.uso}`)).toEqual(['F2:banner', 'F1:banner']);
    const s = dividirSecoes(PREENCHIDO);
    expect(s.map((x) => x.titulo)).toEqual(TITULOS);
    expect(s.filter((x) => !x.naoPreenchido).map((x) => x.id)).toEqual(['S1', 'S2', 'S3', 'S6']);
    expect(s[0].texto).toBe('VISÃO GERAL:\nLoja: Thermora\nPúblico: mulheres de 35 a 55 anos');
    expect(s.map((x) => x.texto).join('\n')).not.toContain('[');
  });
});

describe('perguntas frequentes "pergunta | resposta"', () => {
  it('viram pares; fora da seção de perguntas, só com "?"', () => {
    expect(paresFaq('PERGUNTAS FREQUENTES:\nQuanto tempo demora? | 5 dias\n- Tem troca | Sim, 7 dias\n[pergunta] | [resposta]', 'PERGUNTAS FREQUENTES'))
      .toEqual([{ p: 'Quanto tempo demora?', r: '5 dias' }, { p: 'Tem troca', r: 'Sim, 7 dias' }]);
    expect(paresFaq('Cores: verde | bege\nTem troca? | Sim', 'VISÃO GERAL')).toEqual([{ p: 'Tem troca?', r: 'Sim' }]);
  });
});

describe('plano por seção com o modelo (IA simulada)', () => {
  const partes = dividirSecoes(PREENCHIDO);
  const ctx = { materiais: MATERIAIS, produtos: PRODUTOS, modo: 'custom', plataforma: 'custom', saude: true, secoesTexto: partes };
  const plano = normalizarPlanoSecoes(JSON.parse(FX.texto), ctx);
  const st = (id) => plano.secoes.find((s) => s.id === id).status;

  it('parte só com "[...]" é "Não preenchido" (cinza), não erro, aviso nem "a IA não leu"', () => {
    expect(STATUS_SECAO.nao_preenchido).toBe('Não preenchido');
    for (const id of ['S4', 'S5', 'S7', 'S8', 'S9', 'S10']) expect(st(id)).toBe('nao_preenchido');
    expect(plano.ignorado.filter((x) => ['S4', 'S5', 'S7', 'S8', 'S9', 'S10'].includes(x.secao))).toEqual([]);
    expect(plano.secoes.filter((s) => s.faltou)).toEqual([]);
    expect(st('S1')).toBe('entendido');
    expect(st('S2')).toBe('entendido');
  });
  it('"pergunta | resposta" vira um item de FAQ com os pares como ele escreveu (e o "faq" vazio da IA sai)', () => {
    const faq = plano.itens.filter((x) => x.tipo === 'faq');
    expect(faq).toHaveLength(1);
    expect(faq[0]).toMatchObject({ secao: 'S6', status: 'pronto' });
    expect(faq[0].params.pares).toEqual([{ p: 'Quanto tempo demora a entrega?', r: 'De 5 a 12 dias úteis.' }, { p: 'Posso tomar junto com café?', r: 'Sim, siga o modo de uso do rótulo.' }]);
    const aplicado = aplicarTodasSecoes(plano, ctx);
    const conteudo = aplicarTextosNoEstado({ conteudo: { faq: [{ p: 'Quanto tempo demora a entrega?', r: 'texto da IA' }, { p: 'Tem troca?', r: 'Sim' }] } }, itensAceitos(aplicado), 'custom').conteudo;
    expect(conteudo.faq.map((f) => f.r)).toEqual(['De 5 a 12 dias úteis.', 'Sim, siga o modo de uso do rótulo.', 'Sim']);
    const pacote = aplicarTextosNoEstado({ pacote: { textosPagina: { sobre: 'x' } } }, itensAceitos(aplicado), 'pacote').pacote;
    expect(pacote.textosPagina).toEqual({ sobre: 'x', faq: faq[0].params.pares });
  });
  it('"não sei": o item que a IA inventou sai e o ponto fica para ele decidir', () => {
    expect(naoSeiDoTexto(PREENCHIDO)).toEqual([{ trecho: 'Preço: não sei' }]);
    expect(plano.itens.some((x) => /197/.test(x.como))).toBe(false);
    expect(plano.ignorado.find((x) => x.secao === 'S3')).toMatchObject({ trecho: 'Preço: não sei' });
    expect(st('S3')).toBe('decidir');
  });
});

describe('o que vai para a IA', () => {
  it('"Analisar meu pedido" manda só as partes preenchidas, sem "[...]", com a regra do "não sei" e da FAQ', async () => {
    const pedidos = [];
    vi.stubGlobal('fetch', vi.fn(async (_u, o) => { pedidos.push(JSON.parse(o.body)); return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ texto: FX.texto }) }; }));
    const { analisarPedidoSite, contextoPreferencias } = await import('../core/ia.js');
    const cliente = { id: 'c', nome: 'Thermora', preferenciasSite: { texto: PREENCHIDO } };
    const r = await analisarPedidoSite({ cliente, produtos: PRODUTOS, materiais: MATERIAIS, plataforma: 'custom', secoes: [] });
    const pedido = pedidos[0].messages[0].content;
    expect(pedido).toContain('dividido pelo app em 4 parte(s)');
    expect(pedido).toContain('(S1, S2, S3, S6)');
    expect(pedido).not.toContain('[nome do produto]');
    expect(pedido).not.toContain('[S4] DEPOIMENTOS');
    expect(pedido).toMatch(/"não sei": NÃO invente/);
    expect(pedido).toMatch(/"pergunta \| resposta" são perguntas frequentes/);
    expect(r.partes).toHaveLength(10);
    // na geração do site também: linha com "[...]" não vai como desejo
    const ctxIa = contextoPreferencias(cliente);
    expect(ctxIa).toContain('Loja: Thermora');
    expect(ctxIa).not.toMatch(/\[nome do produto\]|\[F10\]/);
    expect(ctxIa).toMatch(/onde ele escreveu "não sei", não invente/);
    // modelo sem nada preenchido: nem chama a IA
    await expect(analisarPedidoSite({ cliente: { id: 'c', preferenciasSite: { texto: MODELO_PEDIDO_SITE } }, produtos: PRODUTOS, materiais: MATERIAIS })).rejects.toThrow(/O modelo ainda não foi preenchido/);
    expect(pedidos).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
