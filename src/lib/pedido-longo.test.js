// "Como eu quero o site" com texto longo (até 12.000 caracteres) no formato real do operador: títulos "###" e "**...:**",
// separadores "***", listas de códigos ("F23, F26, F25", "f27/f28/f29") e códigos no meio da frase. Leitura sem IA
// (lib/fotos-site.js) e o plano por seção do "Analisar meu pedido" (lib/plano-site.js), com a resposta gravada.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lerReferencias, dividirSecoes, codigosDoTexto, aplicarReferencias, resolverEscolha, comUsos, usosDe, tituloDaLinha } from './fotos-site.js';
import {
  normalizarPlanoSecoes, aplicarSecao, aplicarTodasSecoes, responderPerguntaSecao, substituirSecao, itensAceitos, aplicacaoDoPlano,
  conferirPorCodigo, conferenciaPorSecao, planoDasFotos, secoesAplicaveis,
} from './plano-site.js';
import { contadorTexto, exigirTamanho, LIMITE_TEXTO_SITE } from './textos-site.js';
import FX_PLANO from '../../tests/fixtures/ia/plano-thermora-secoes.json';
import FX_SECAO from '../../tests/fixtures/ia/plano-secao-thermora.json';
import FX_REAL from '../../tests/fixtures/ia/plano-thermora-secoes-real.json';

const TEXTO = readFileSync(new URL('../../tests/fixtures/pedido-site-thermora-longo.md', import.meta.url), 'utf8');
const foto = (n, extra = {}) => ({ id: `m${n}`, codigo: `F${n}`, url: `https://x/f${n}.jpg`, origem: 'envio', tipo: 'image/jpeg', nomeOriginal: `f${n}.jpg`, ...extra });
const PRODUTOS = [{ id: 'p1', nome: 'Thermora' }];
// F41 marcada à mão como foto principal do Thermora (o texto pede a F27): o conflito real de produção.
const MATERIAIS = Array.from({ length: 41 }, (_, i) => foto(i + 1, i + 1 === 41 ? { usos: { produtos: [{ id: 'p1', ordem: 1, principal: true, por: 'manual' }] } } : {}));
const ctx = { materiais: MATERIAIS, produtos: PRODUTOS, modo: 'pacote', plataforma: 'shopify', tema: 'dawn', saude: true, secoesTexto: dividirSecoes(TEXTO) };
const resposta = (fx) => JSON.parse(fx.texto);

describe('limite de 12.000 caracteres', () => {
  it('o texto de teste tem ~11.500 caracteres e cabe inteiro', () => {
    expect(TEXTO.length).toBeGreaterThan(11000);
    expect(LIMITE_TEXTO_SITE).toBe(12000);
    expect(contadorTexto(TEXTO).rotulo).toBe(`${TEXTO.length.toLocaleString('pt-BR')} de 12.000 caracteres`);
    expect(exigirTamanho(TEXTO)).toBe(TEXTO); // nada cortado
  });
  it('12.000 passa; 12.001 vira erro pedindo para encurtar (nunca corta calado)', () => {
    expect(exigirTamanho('a'.repeat(12000))).toHaveLength(12000);
    expect(() => exigirTamanho('a'.repeat(12001))).toThrow(/12\.001 caracteres e o limite para a IA é 12\.000/);
    expect(contadorTexto('a'.repeat(10800)).perto).toBe(true);
  });
});

describe('leitura sem IA: listas e títulos', () => {
  const r = lerReferencias(TEXTO, { materiais: MATERIAIS, produtos: PRODUTOS });
  const de = (uso) => r.refs.filter((x) => x.uso === uso).map((x) => x.codigo);

  it('listas resolvidas pelo título mais próximo, na ordem escrita e sem repetir', () => {
    expect(de('banner')).toEqual(['F15']);
    // "### Página do produto" + "Galeria do produto:" + "f27/f28/f29/f33/f32/f31" (minúsculas, barras)
    expect(r.refs.filter((x) => x.uso === 'produto').map((x) => [x.codigo, x.ordem, x.principal])).toEqual([['F27', 1, true], ['F28', 2, false], ['F29', 3, false], ['F33', 4, false], ['F32', 5, false], ['F31', 6, false]]);
    // "**Depoimentos (prova social):**" + "F23, F26, F25, F29, F20, F24, F25": F25 repetida entra uma vez
    expect(de('clientes')).toEqual(['F23', 'F26', 'F25', 'F29', 'F20', 'F24']);
    expect(de('galeria')).toEqual(['F36', 'F40']);
    expect(de('sobre')).toEqual(['F10', 'F11', 'F12']); // "F10 a F12" = intervalo
  });
  it('UM resumo do que não deu para entender, com a lista para abrir; F99 só como código que não existe', () => {
    expect(r.resumo).toBe('2 fotos não foram entendidas sem IA. Clique em "Analisar meu pedido" para a IA resolver.');
    expect(r.naoEntendidas.map((x) => [x.codigos.join(), x.motivo.split(':')[0]])).toEqual([['F31', 'perguntas frequentes'], ['F34', 'carrinho']]);
    expect(r.inexistentes).toEqual(['F99']);
    expect(r.avisos).toHaveLength(2); // nunca uma linha por código
  });
  it('separadores, intervalos e jeitos de escrever lista', () => {
    const mats = Array.from({ length: 30 }, (_, i) => foto(i + 1));
    const ler = (t) => lerReferencias(t, { materiais: mats, produtos: PRODUTOS }).refs.map((x) => `${x.codigo}>${x.uso}`);
    expect(ler('F20-F22 na galeria')).toEqual(['F20>galeria', 'F21>galeria', 'F22>galeria']);
    expect(ler('Galeria: f5; F6\nF7 e F8')).toEqual(['F5>galeria', 'F6>galeria', 'F7>galeria', 'F8>galeria']);
    expect(ler('No banner quero F1 e na galeria F2, F3')).toEqual(['F1>banner', 'F2>galeria', 'F3>galeria']);
    expect(ler('### Depoimentos\nF4 F9\n***\nF10')).toEqual(['F4>clientes', 'F9>clientes']); // depois do "***" o título não vale
    expect(ler('**Banner:** F11, F12, F11')).toEqual(['F11>banner', 'F12>banner']);
    expect(ler('Topo: F13. Capa do produto: F14')).toEqual(['F13>banner', 'F14>produto']);
  });
  it('"***" e "---" nunca são título; "**Carrinho:**" e "### X" são', () => {
    expect(tituloDaLinha('***')).toBeNull();
    expect(tituloDaLinha('---')).toBeNull();
    expect(tituloDaLinha('**Carrinho:**')).toMatchObject({ titulo: 'Carrinho', fixo: true });
    expect(tituloDaLinha('### Página do produto')).toMatchObject({ titulo: 'Página do produto', nivel: 1 });
    expect(tituloDaLinha('Galeria: F27, F28')).toMatchObject({ titulo: 'Galeria', fixo: false });
    expect(tituloDaLinha('Veja https://site.com')).toBeNull();
  });
});

describe('conflito texto x seletor: escolha em um clique', () => {
  it('"O texto pede F27 como foto principal, mas no seletor está F41" com [Usar F27] [Manter F41]', () => {
    const { refs } = lerReferencias('A foto principal do Thermora é a F27.', { materiais: MATERIAIS, produtos: PRODUTOS });
    const r = aplicarReferencias(MATERIAIS, refs, { produtos: PRODUTOS });
    expect(r.escolhas).toHaveLength(1);
    expect(r.escolhas[0]).toMatchObject({ texto: 'O texto pede F27 como foto principal do Thermora, mas no seletor está F41.', usar: { rotulo: 'Usar F27', materialId: 'm27', uso: 'produto', produtoId: 'p1', principal: true }, manter: { rotulo: 'Manter F41' } });
    // "Usar F27": o seletor muda (escolha manual) e a F41 deixa de ser a principal
    const depois = comUsos(MATERIAIS, resolverEscolha(MATERIAIS, r.escolhas[0].usar));
    expect(usosDe(depois[26]).produtos[0]).toMatchObject({ id: 'p1', principal: true, por: 'manual' });
    expect(usosDe(depois[40]).produtos[0].principal).toBe(false);
    // e o conflito some na próxima leitura
    expect(aplicarReferencias(depois, refs, { produtos: PRODUTOS }).escolhas).toEqual([]);
  });
});

describe('seções do texto (o que a IA lê na ordem do operador)', () => {
  const secoes = dividirSecoes(TEXTO);
  it('uma seção por título forte; subtítulo fica dentro; nada do texto fica de fora', () => {
    expect(secoes.map((s) => s.titulo)).toEqual(['Começo do texto', 'Banner (topo da página inicial)', 'Faixa de aviso no topo', 'Página do produto', 'Seção de benefícios', 'Como usar', 'Fórmula (o que tem dentro)',
      'Depoimentos (prova social)', 'Galeria da loja', 'Sobre nós', 'Perguntas frequentes', 'Carrinho', 'Rodapé', 'Cores e estilo', 'Ordem da página inicial', 'Observações finais', 'Página de contato', 'Kit com 3 potes', 'E-mails e mensagens depois da compra', 'Celular']);
    const juntas = secoes.map((s) => s.texto).join('\n');
    for (const l of TEXTO.split('\n').map((x) => x.trim()).filter((x) => x && x !== '***')) expect(juntas.includes(l), l.slice(0, 40)).toBe(true);
    expect(secoes.find((s) => s.titulo === 'Página do produto').texto).toMatch(/f27\/f28\/f29\/f33\/f32\/f31/);
  });
  it('códigos na ordem do texto', () => {
    expect(codigosDoTexto(TEXTO).map((c) => c.codigo)).toEqual(['F15', 'F27', 'F28', 'F29', 'F33', 'F32', 'F31', 'F23', 'F26', 'F25', 'F20', 'F24', 'F36', 'F40', 'F10', 'F11', 'F12', 'F34', 'F99']);
  });
});

describe('"Analisar meu pedido" por seção (resposta gravada)', () => {
  const plano = normalizarPlanoSecoes(resposta(FX_PLANO), ctx);
  const sec = (titulo) => plano.secoes.find((s) => s.titulo === titulo);
  const itensDe = (titulo) => plano.itens.filter((x) => x.secao === sec(titulo).id);

  it('todas as seções voltam, na ordem do operador, e nada fica ignorado', () => {
    expect(plano.secoes).toHaveLength(20);
    expect(plano.secoes.every((s) => !s.faltou && s.entendi)).toBe(true);
    expect(plano.ignorado).toEqual([]);
  });
  it('fotos com lugar e ordem: galeria do produto e depoimentos na ordem escrita', () => {
    const prod = itensDe('Página do produto').find((x) => x.tipo === 'produto_fotos');
    expect(prod.params.codigos).toEqual(['F27', 'F28', 'F29', 'F33', 'F32', 'F31']);
    expect(itensDe('Depoimentos (prova social)').find((x) => x.tipo === 'clientes_fotos').params.codigos).toEqual(['F23', 'F26', 'F25', 'F29', 'F20', 'F24']);
    expect(itensDe('Galeria da loja').find((x) => x.tipo === 'galeria_fotos').params.codigos).toEqual(['F36', 'F40']);
    expect(itensDe('Sobre nós').find((x) => x.tipo === 'sobre_fotos').params.codigos).toEqual(['F10', 'F11', 'F12']);
  });
  it('F99 marcado como "não existe esse código"; lugar sem foto vira "não dá" com alternativa', () => {
    expect(plano.inexistentes).toEqual([{ codigo: 'F99', secoes: [sec('Rodapé').id] }]);
    expect(itensDe('Rodapé').find((x) => /F99/.test(x.pedido))).toMatchObject({ status: 'impossivel', motivo: expect.stringMatching(/F99 não existe nos Materiais/) });
    expect(itensDe('Perguntas frequentes').find((x) => /F31/.test(x.pedido))).toMatchObject({ status: 'impossivel', alternativa: expect.stringMatching(/galeria do produto/) });
  });
  it('F27 x F41 vira pergunta com opções; até responder, a F27 entra sem ser a principal', () => {
    const q = plano.perguntas.find((x) => x.secao === sec('Página do produto').id);
    expect(q.opcoes.map((o) => o.texto)).toEqual(['Usar F27', 'Manter F41']);
    expect(sec('Página do produto').status).toBe('decidir');
    expect(itensDe('Página do produto').find((x) => x.tipo === 'produto_fotos').params.principal).toBe('');
    // "Usar F27": o plano passa a ter a F27 como principal e o seletor recebe a escolha (manual)
    const { plano: p2, usar } = responderPerguntaSecao(plano, q.id, 0, ctx);
    expect(usar).toEqual([{ materialId: 'm27', uso: 'produto', produtoId: 'p1', principal: true }]);
    expect(p2.itens.find((x) => x.secao === q.secao && x.tipo === 'produto_fotos').params).toMatchObject({ codigos: ['F27', 'F28', 'F29', 'F33', 'F32', 'F31'], principal: 'F27' });
    expect(p2.secoes.find((s) => s.id === q.secao).status).toBe('entendido');
    // "Manter F41": nada muda no seletor
    expect(responderPerguntaSecao(plano, q.id, 1, ctx).usar).toEqual([]);
  });
  it('nada é aplicado antes de "Aplicar esta seção" / "Aplicar tudo"; a ordem vai para o "Usar em"', () => {
    expect(itensAceitos(plano)).toEqual([]);
    const s8 = sec('Depoimentos (prova social)').id;
    const um = aplicarSecao(plano, s8, ctx);
    expect(itensAceitos(um).every((x) => x.secao === s8)).toBe(true);
    expect(aplicacaoDoPlano(itensAceitos(um), { materiais: MATERIAIS, produtos: PRODUTOS }).refs.map((r) => r.codigo)).toEqual(['F23', 'F26', 'F25', 'F29', 'F20', 'F24']);
    const tudo = aplicarTodasSecoes(plano, ctx);
    expect(tudo.secoes.every((s) => s.aplicada)).toBe(true);
    const refs = aplicacaoDoPlano(itensAceitos(tudo), { materiais: MATERIAIS, produtos: PRODUTOS }).refs;
    const r = aplicarReferencias(MATERIAIS, refs, { produtos: PRODUTOS });
    const depois = comUsos(MATERIAIS, r.patches);
    expect(usosDe(depois[26]).produtos[0]).toMatchObject({ id: 'p1', principal: false, por: 'texto' }); // F27 sem ser a principal até responder
    expect(usosDe(depois[14]).banner).toBe('texto');
    expect(secoesAplicaveis(plano).length).toBeGreaterThan(10);
  });
  it('a IA esqueceu uma seção e um código: o app avisa e usa a leitura sem IA; e cria a pergunta do conflito sozinho', () => {
    const d = resposta(FX_PLANO);
    d.secoes = d.secoes.filter((s) => s.id !== 'S17');
    d.fotos = d.fotos.filter((f) => !(f.secao === 'S8' && f.codigo === 'F20'));
    d.perguntas = [];
    const p = normalizarPlanoSecoes(d, ctx);
    expect(p.secoes.find((s) => s.id === 'S17')).toMatchObject({ faltou: true, status: 'decidir' });
    expect(p.ignorado.map((x) => x.secao)).toContain('S17');
    expect(p.fotos.find((f) => f.secao === 'S8' && f.codigo === 'F20')).toMatchObject({ destino: 'clientes', origem: 'leitura' });
    expect(p.itens.find((x) => x.secao === 'S8' && x.tipo === 'clientes_fotos').params.codigos).toEqual(['F23', 'F26', 'F25', 'F29', 'F20', 'F24']);
    expect(p.perguntas).toEqual([expect.objectContaining({ auto: true, texto: 'O texto pede F27 como foto principal do Thermora, mas no seletor está F41.' })]);
  });
  it('"Corrigir" troca só a seção, com a releitura barata (resposta gravada)', () => {
    const s4 = sec('Página do produto').id;
    const q = plano.perguntas.find((x) => x.secao === s4);
    const p = substituirSecao(plano, s4, resposta(FX_SECAO), ctx, 'A F27 é a principal, sim.');
    expect(p.secoes.find((s) => s.id === s4)).toMatchObject({ corrigida: { texto: 'A F27 é a principal, sim.' }, aplicada: false });
    expect(p.perguntas.some((x) => x.id === q.id)).toBe(false);
    // a F41 continua marcada à mão como principal: o app pergunta de novo (o seletor vence até o operador escolher)
    expect(p.perguntas.find((x) => x.secao === s4)).toMatchObject({ auto: true });
    expect(p.secoes.filter((s) => s.id !== s4).map((s) => s.entendi)).toEqual(plano.secoes.filter((s) => s.id !== s4).map((s) => s.entendi));
  });
  it('as fotos valem pelo plano só se ele for do texto de agora e tiver seção aplicada', () => {
    const base = { ...aplicarSecao(plano, 'S2', ctx), base: { texto: TEXTO.trim() } };
    expect(planoDasFotos(null, base, TEXTO)).toBe(base);
    expect(planoDasFotos(null, base, `${TEXTO} mais`)).toBeNull();
    expect(planoDasFotos(null, { ...plano, base: { texto: TEXTO.trim() } }, TEXTO)).toBeNull();
  });
});

describe('resposta REAL gravada (plano_site, Sonnet, 14/10/2026, o mesmo texto de ~11.500 caracteres)', () => {
  const plano = normalizarPlanoSecoes(JSON.parse(FX_REAL.texto.replace(/^```(?:json)?\s*|```\s*$/g, '')), ctx);
  const sec = (titulo) => plano.secoes.find((s) => s.titulo.startsWith(titulo));
  const codigosDe = (titulo, tipo) => plano.itens.find((x) => x.secao === sec(titulo).id && x.tipo === tipo)?.params.codigos;

  it('todas as seções voltam, nada fica ignorado', () => {
    expect(plano.secoes).toHaveLength(20);
    expect(plano.secoes.every((s) => !s.faltou && s.entendi)).toBe(true);
    expect(plano.ignorado).toEqual([]);
  });
  it('ordem da galeria do produto e dos depoimentos = ordem escrita; F99 marcado', () => {
    expect(codigosDe('Página do produto', 'produto_fotos')).toEqual(['F27', 'F28', 'F29', 'F33', 'F32', 'F31']);
    expect(codigosDe('Depoimentos', 'clientes_fotos')).toEqual(['F23', 'F26', 'F25', 'F29', 'F20', 'F24']);
    expect(codigosDe('Galeria da loja', 'galeria_fotos')).toEqual(['F36', 'F40']);
    expect(plano.inexistentes.map((x) => x.codigo)).toEqual(['F99']);
  });
  it('F27 x F41 volta como pergunta com opções clicáveis', () => {
    const q = plano.perguntas.find((x) => x.secao === sec('Página do produto').id);
    expect(q.opcoes).toHaveLength(2);
    expect(q.opcoes[0].fotos).toEqual([expect.objectContaining({ codigo: 'F27', principal: true, produtoId: 'p1' })]);
    expect(responderPerguntaSecao(plano, q.id, 0, ctx).usar).toEqual([{ materialId: 'm27', uso: 'produto', produtoId: 'p1', principal: true }]);
  });
  it('"Só na galeria do produto" tira a F29 dos depoimentos (a opção não dizia o que sai)', () => {
    const q = plano.perguntas.find((x) => /F29/.test(x.texto));
    const i = q.opcoes.findIndex((o) => /^Só na galeria do produto/.test(o.texto));
    const { plano: p2 } = responderPerguntaSecao(plano, q.id, i, ctx);
    expect(codigosDe('Depoimentos', 'clientes_fotos')).toContain('F29');
    expect(p2.itens.find((x) => x.secao === q.secao && x.tipo === 'clientes_fotos').params.codigos).toEqual(['F23', 'F26', 'F25', 'F20', 'F24']);
    expect(p2.itens.find((x) => x.tipo === 'produto_fotos').params.codigos).toContain('F29');
    // "Nos dois lugares" não tira nada
    const dois = q.opcoes.findIndex((o) => /dois/.test(o.texto));
    expect(responderPerguntaSecao(plano, q.id, dois, ctx).plano.itens.find((x) => x.secao === q.secao && x.tipo === 'clientes_fotos').params.codigos).toContain('F29');
  });
});

describe('Conferência do pedido por seção', () => {
  it('cada seção: feito / não feito com motivo, e cada código no lugar pedido', () => {
    const p = aplicarTodasSecoes(normalizarPlanoSecoes(resposta(FX_PLANO), ctx), ctx);
    const refs = aplicacaoDoPlano(itensAceitos(p), { materiais: MATERIAIS, produtos: PRODUTOS }).refs;
    const mats = comUsos(MATERIAIS, aplicarReferencias(MATERIAIS, refs, { produtos: PRODUTOS }).patches);
    const { resultados } = conferirPorCodigo(itensAceitos(p), { modo: 'pacote', site: { pacote: {} }, materiais: mats, produtos: PRODUTOS });
    const linhas = conferenciaPorSecao(p, resultados);
    expect(linhas).toHaveLength(20);
    const dep = linhas.find((l) => l.secao.titulo === 'Depoimentos (prova social)').linhas.find((l) => l.item.tipo === 'clientes_fotos');
    expect(dep.status).toBe('atendido');
    expect(dep.codigos.map((c) => `${c.codigo}${c.ok ? '✓' : '✗'}`)).toEqual(['F23✓', 'F26✓', 'F25✓', 'F29✓', 'F20✓', 'F24✓']);
    const gal = linhas.find((l) => l.secao.titulo === 'Galeria da loja').linhas[0];
    expect(gal).toMatchObject({ status: 'atendido' });
    const rod = linhas.find((l) => l.secao.titulo === 'Rodapé').linhas.find((l) => /F99/.test(l.item.pedido));
    expect(rod).toMatchObject({ status: 'nao', motivo: expect.stringMatching(/F99 não existe/) });
    const mails = linhas.find((l) => l.secao.titulo === 'E-mails e mensagens depois da compra');
    expect(mails.secao.status).toBe('impossivel');
  });
});
