// Casos a–j vistos pelo operador na Thermora em produção (pacote Shopify, suplemento), com as frases exatas dele e os
// dados de tests/fixtures/thermora-producao.js. Cada teste falha no código de antes desta fase e passa depois.
import { describe, it, expect } from 'vitest';
import { cliente, produtos, materiais, site, plano, FRASES, DESCRICOES_PRINTS, OCR_PERFIL } from './fixtures/thermora-producao.js';
import CASOS from './fixtures/ia/ajuste-secao-thermora-casos.json';
import REAL_ENTENDER from './fixtures/ia/ajuste-entender-thermora-foto-nome-real.json';
import REAL_SECAO from './fixtures/ia/ajuste-secao-amplo-thermora-foto-nome-real.json';
import { dadosDoPacote, gerarPreviaLojaHTML, gruposPlataforma } from '../src/lib/pacote-loja.js';
import { aplicarOperacoes, estadoDoSite } from '../src/lib/site-blocos.js';
import { operacoesDaAcao } from '../src/lib/elementos-site.js';
import { conferirPorCodigo, itensFaltando, aplicacaoDoPlano, itensAceitos } from '../src/lib/plano-site.js';
import { aplicarReferencias, fotosDoProduto, comUsos, fotosPorNome } from '../src/lib/fotos-site.js';
import { printsDoCliente } from '../src/lib/visual-site.js';
import { filtrarOperacoes, secoesDoSite } from '../src/lib/ajuste-secoes.js';
import * as textos from '../src/lib/textos-visiveis.js';
import * as capac from '../src/lib/capacidades-site.js';
import * as pend from '../src/lib/pendencias-site.js';
import { pacoteTexto } from '../src/modules/sites.js';

const provas = printsDoCliente(materiais);
const dados = (s = site, mats = materiais) => dadosDoPacote({ cliente, site: s, produtos, provas: printsDoCliente(mats), materiais: mats });
const previa = (s = site, mats = materiais) => gerarPreviaLojaHTML(dados(s, mats));
const comPacote = (pacote) => ({ ...site, pacote });
const aplicar = (ops, s = site) => aplicarOperacoes(estadoDoSite(s, 'pacote'), ops, { modo: 'pacote', materiais, produtos });
const home = (html) => html.split('id="inicio"')[1] || '';

describe('j) "Quem já comprou" sem texto inventado', () => {
  it('descrição do print (IA) e OCR do perfil nunca viram depoimento, citação nem número', () => {
    const html = previa();
    for (const t of [...DESCRICOES_PRINTS, OCR_PERFIL]) expect(html).not.toContain(t);
    expect(html).not.toContain('3 kg');
    expect(html).not.toMatch(/Clientes da loja/); // nada de legenda fingindo citação
    expect(JSON.stringify(gruposPlataforma(dados()))).not.toContain('Cliente relata');
    expect(pacoteTexto(site.pacote, dados())).not.toContain('Cliente relata');
  });
  it('o print aparece como IMAGEM; texto só o digitado pelo operador', () => {
    const digitado = materiais.map((m) => (m.id === 'm23' ? { ...m, textoDepoimento: 'Perdi 3 kg e amei a rotina' } : m));
    const s = comPacote({ ...site.pacote, depoimentos: [{ nome: 'Cliente', origem: 'prova_social', materialId: 'm23', exibir: 'ambos', texto: DESCRICOES_PRINTS[1], midiaUrl: 'x' }] });
    const html = previa(s, digitado);
    expect(html).toContain('“Perdi 3 kg e amei a rotina”');
    expect(html).not.toContain(DESCRICOES_PRINTS[1]);
    expect(html).toContain('f23-borrada.jpg'); // a imagem (cópia borrada) continua
  });
  it('o aviso de saúde cobre TODO texto do site, inclusive depoimento e citação ("3 kg")', () => {
    const digitado = materiais.map((m) => (m.id === 'm23' ? { ...m, textoDepoimento: 'Perdi 3 kg, a roupa ficou larga e acabou o inchaço' } : m));
    const s = comPacote({ ...site.pacote, depoimentos: [{ nome: 'Cliente', origem: 'prova_social', materialId: 'm23', exibir: 'texto' }] });
    const lista = textos.alegacoesDoSite({ cliente, site: s, modo: 'pacote', produtos, materiais: digitado, provas });
    const dep = lista.find((x) => x.secao === 'depoimentos');
    expect(dep.achados).toEqual(expect.arrayContaining(['3 kg', 'roupa ficou larga', 'inchaço']));
    expect(lista.some((x) => x.secao === 'destaques' && x.achados.includes('metabolismo'))).toBe(true); // "Auxílio ao metabolismo"
  });
  it('auditoria lista as cópias guardadas e "Remover textos inventados" limpa sem inventar nada no lugar', () => {
    const lista = textos.auditarInventados({ cliente, site, materiais, aprovacoes: [] });
    expect(lista.filter((x) => x.versao === 'atual').map((x) => x.texto)).toEqual(expect.arrayContaining([...DESCRICOES_PRINTS, OCR_PERFIL]));
    expect(lista.some((x) => x.versao === 'v43')).toBe(true);
    const r = textos.semInventados(site.pacote.depoimentos, { materiais, cliente });
    expect(r.lista).toEqual([]);
    expect(r.removidos).toHaveLength(6);
  });
});

describe('i) tirar a seção "Quem já comprou" (Apontar, texto livre e Conferência)', () => {
  it('Apontar > "Tirar daqui" na seção: some da prévia E dos arquivos do pacote', () => {
    const r = operacoesDaAcao('tirar', 'depoimentos', null, { estado: estadoDoSite(site, 'pacote'), modo: 'pacote' });
    const a = aplicar(r.ops);
    expect(a.aplicadas).toHaveLength(1);
    const s = { ...site, ...a.estado };
    const digitado = materiais.map((m) => (m.id === 'm23' ? { ...m, textoDepoimento: 'Amei' } : m));
    expect(home(previa(s, digitado))).not.toContain('Quem já comprou');
    expect(gruposPlataforma(dados(s, digitado)).some((g) => g.id === 'depoimentos')).toBe(false);
    expect(pacoteTexto(s.pacote, dados(s, digitado))).not.toMatch(/Quem já comprou|DEPOIMENTOS/);
  });
  it('texto livre: a IA usa o nome do briefing ("Quem já comprou") e mesmo assim tira a seção da LOJA', () => {
    const { dentro } = filtrarOperacoes([{ op: 'ocultar', secao: 'Quem já comprou' }], ['depoimentos'], 'pacote');
    expect(dentro).toHaveLength(1);
    expect(aplicar(dentro).estado.pacote.visual.ocultas).toContain('depoimentos');
  });
});

describe('d) "Tirar toda a parte onde diz \'Já comprou\', deixar só as imagens"', () => {
  it('existe a operação: tira os textos (e dá para tirar o título); as imagens ficam', () => {
    expect(capac.capacidadesDoSite('pacote', { secoes: ['depoimentos'] })).toMatch(/tirar a seção, o título ou só os textos \(deixa as imagens\)/);
    const s0 = comPacote({ ...site.pacote, visual: { ...site.pacote.visual, ocultas: ['provas'] }, depoimentos: [{ nome: 'Ana', origem: 'prova_social', materialId: 'm23', exibir: 'ambos' }] });
    const mats = materiais.map((m) => (m.id === 'm23' ? { ...m, textoDepoimento: 'Amei demais' } : m));
    const a = aplicarOperacoes(estadoDoSite(s0, 'pacote'), [...CASOS.d.depois.operacoes, { op: 'elemento', id: 'depoimentos.titulo', acao: 'ocultar' }], { modo: 'pacote', materiais: mats, produtos });
    expect(a.aplicadas).toHaveLength(2);
    const html = home(previa({ ...s0, ...a.estado }, mats));
    expect(html).not.toContain('Amei demais');
    expect(html).not.toContain('Quem já comprou');
    expect(html).toContain('f23-borrada.jpg');
    // Apontar no pacote também tem "Tirar daqui" para os textos da seção
    expect(operacoesDaAcao('tirar', 'depoimentos.textos', null, { estado: estadoDoSite(s0, 'pacote'), modo: 'pacote' }).ops).toEqual([{ op: 'elemento', id: 'depoimentos.textos', acao: 'ocultar' }]);
  });
});

describe('f) e g) Conferência pelo tipo do que resolve', () => {
  const itens = itensAceitos(plano);
  const conf = (mats = materiais) => conferirPorCodigo(itens, { modo: 'pacote', site, materiais: mats, produtos: produtos.map((p) => ({ ...p, fotos: fotosDoProduto(p, mats) })) });
  it('f) fórmula/benefícios e kits faltando = "Para o cliente preencher" (nunca "Fazer essa mudança" nem IA)', () => {
    const { resultados, paraIa } = conf();
    expect(resultados.i3.status).toBe('preencher');
    expect(resultados.i3.motivo).toMatch(/Laranja Moro/);
    expect(resultados.i4).toMatchObject({ status: 'preencher', campo: 'kits' });
    expect(itensFaltando(itens, resultados).map((x) => x.id)).not.toEqual(expect.arrayContaining(['i3', 'i4']));
    expect(paraIa).not.toContain('i4');
  });
  it('g) "Galeria grande abaixo da descrição" é do tema (conferido pelo app, nunca "Não feito" pela IA)', () => {
    const { resultados, paraIa } = conf();
    expect(resultados.i5).toMatchObject({ status: 'tema', por: 'codigo' });
    expect(paraIa).toEqual([]);
  });
  it('fotos pedidas: o app confere código por código (F27…F31 todas na galeria do produto)', () => {
    const { resultados } = conf();
    expect(resultados.i2.codigos.map((c) => `${c.codigo}${c.ok ? '✓' : '✗'}`)).toEqual(['F27✓', 'F28✓', 'F29✓', 'F33✓', 'F32✓', 'F31✓']);
  });
});

describe('placeholders "Preencher" (dado que só o cliente tem)', () => {
  it('prévia e arquivos do pacote marcam o lugar; a IA nunca preenche', () => {
    const d = dados();
    expect(d.pendencias.map((x) => x.id)).toEqual(expect.arrayContaining(['pTM:formula', 'pTM:beneficios', 'pTM:modo_uso', 'pLM:formula', 'pTM:kits', 'pLM:foto']));
    const html = previa();
    expect(html).toMatch(/class="preencher" data-preencher="pTM:formula"><b>Preencher:<\/b> fórmula e ingredientes do Thermora Metabolic Formula \(copiar do rótulo\)/);
    expect(html).toContain('Foto a escolher');
    const prod = gruposPlataforma(d).find((g) => g.titulo === 'Produto: Thermora Metabolic Formula');
    expect(prod.itens.find((i) => /Fórmula/.test(i.rotulo)).valor).toBe('[PREENCHER: fórmula e ingredientes do Thermora Metabolic Formula (copiar do rótulo)]');
    // preenchido na aba Produtos: a marca sai sozinha e o texto real entra (fonte única)
    const preenchidos = produtos.map((p) => (p.id === 'pTM' ? { ...p, formula: 'Cafeína anidra 150 mg, chá verde 200 mg' } : p));
    const html2 = gerarPreviaLojaHTML(dadosDoPacote({ cliente, site, produtos: preenchidos, provas, materiais }));
    expect(html2).not.toContain('data-preencher="pTM:formula"');
    expect(html2).toContain('Cafeína anidra 150 mg');
    expect(pend.preenchidasDesde([{ id: 'pTM:formula', oque: 'fórmula' }], [], preenchidos)[0].depois).toBe('Cafeína anidra 150 mg, chá verde 200 mg');
  });
  it('marca "[PREENCHER: …]" nunca conta como alegação de saúde', () => {
    expect(textos.alegacoesDoSite({ cliente, site, modo: 'pacote', produtos, materiais, provas }).some((x) => /PREENCHER/.test(x.texto))).toBe(false);
  });
});

describe('a) b) c) a IA conhece os limites antes de propor', () => {
  it('a) "montar os 5 principais motivos": confianca.* não existe (motivo aponta Destaques); com a lista, vira Destaques', () => {
    const antes = aplicar(CASOS.a.antes.operacoes);
    expect(antes.descartadas.filter((d) => /Compra segura/.test(d.motivo))).toHaveLength(6);
    expect(antes.descartadas[0].motivo).toMatch(/use a seção Destaques/);
    // Só a ordem mudou: o cartão diz "Mudou em parte (1 de 7)" e lista o que não mudou (nunca verde como se tudo tivesse ido)
    expect(capac.resultadoDoAjuste({ aplicadas: antes.aplicadas, recusadas: antes.descartadas.map((d) => d.motivo) })).toMatchObject({ status: 'parcial', titulo: 'Mudou em parte (1 de 7)' });
    const depois = aplicar(CASOS.a.depois.operacoes);
    expect(depois.aplicadas).toHaveLength(1); // o título; a seção já estava logo depois do banner (o app diz, não cria versão à toa)
    const ordem = dados({ ...site, ...depois.estado }).visual.ordem;
    expect(ordem.indexOf('destaques')).toBe(ordem.indexOf('banner') + 1);
    expect(capac.capacidadesDoSite('pacote', { secoes: ['destaques', 'confianca'] })).toMatch(/criar seção nova com título \+ textos/);
  });
  it('a) seção nova no pacote: título + textos numa operação só', () => {
    const r = aplicar([{ op: 'destaque', acao: 'criar', titulo: 'Por que a Thermora', linhas: ['Fórmula simples', 'Duas cápsulas por dia'], depoisDe: 'produtos' }]);
    expect(r.aplicadas).toHaveLength(1);
    expect(r.estado.pacote.destaques).toHaveLength(2);
  });
  it('b) frase nova em negrito vai para o texto do site; nota no briefing é recusada ("não muda o site")', () => {
    const { ops, recusadas } = capac.semNotaDeSobra(CASOS.b.antes.operacoes, FRASES.b, 'pacote');
    expect(ops).toEqual([]);
    expect(recusadas[0].motivo).toMatch(/não muda a loja/);
    expect(capac.resultadoDoAjuste({ aplicadas: aplicar(CASOS.b.antes.operacoes).aplicadas, modo: 'pacote' }).titulo).toBe('Anotado para o tema (o site não muda)');
    const r = aplicar(CASOS.b.depois.operacoes);
    expect(r.aplicadas).toHaveLength(1);
    const html = previa({ ...site, ...r.estado });
    expect(html).toContain('<li><b>Mais de 5mil pessoas</b> compraram e aprovaram os produtos</li>');
    expect(html).not.toContain('Mais de 5000 clientes satisfeitas'); // "apagar a outra"
  });
  it('c) "foto do Thermora Metabolic no banner": o app acha as fotos do produto pelo nome (sem pedir código)', () => {
    const r = fotosPorNome(FRASES.c, { materiais, produtos });
    expect(r.produto.nome).toBe('Thermora Metabolic Formula');
    expect(r.uso).toBe('banner');
    expect(r.fotos.map((f) => f.codigo)).toEqual(['F31', 'F32', 'F33', 'F27', 'F28', 'F29']);
    const a = aplicar([{ op: 'foto', codigo: 'F27', uso: 'banner', acao: 'usar' }, ...CASOS.c.depois.operacoes]);
    expect(a.aplicadas).toHaveLength(1);
    expect(a.descartadas[0].motivo).toMatch(/já está nessa posição/); // os 5 motivos já estão logo depois do banner: diz, não finge
    const mats = comUsos(materiais, Object.entries(a.estado.usosFotos).map(([id, usos]) => ({ id, usos })));
    expect(dados({ ...site, ...a.estado }, mats).visual.slides[0].fotos[0].codigo).toBe('F27');
  });
});

describe('c) com as respostas REAIS gravadas (ajuste_entender com a lista de capacidades; ajuste por seção)', () => {
  const entender = JSON.parse(REAL_ENTENDER.texto), secao = JSON.parse(REAL_SECAO.texto);
  it('"Entendi assim": banner + Destaques, e pergunta o que é ambíguo ("aproximar de onde?") em vez de chutar', async () => {
    const { normalizarEntendimento } = await import('../src/lib/ajuste-secoes.js');
    const ent = normalizarEntendimento(entender, 'pacote');
    expect(ent.secoes.map((s) => s.id)).toEqual(['banner', 'destaques']);
    expect(ent.perguntas[0].opcoes.map((o) => o.texto)).toEqual(['Subir para logo abaixo do banner', 'Levar para perto da seção de produtos']);
  });
  it('ajuste por seção: a foto que o app já resolveu não conta duas vezes; o cartão diz "Mudou"', () => {
    const fotoApp = [{ op: 'foto', codigo: 'F27', uso: 'banner', acao: 'usar' }];
    const ops = [...fotoApp, ...capac.semFotoRepetida(secao.operacoes, 'banner')];
    expect(ops).toEqual([...fotoApp, { op: 'mover', bloco: 'destaques', antesDe: 'produtos' }]);
    const r = aplicar(ops);
    expect(r.descartadas).toEqual([]);
    expect(capac.resultadoDoAjuste({ aplicadas: r.aplicadas, recusadas: [], naoFeito: secao.naoFeito, modo: 'pacote' }).titulo).toBe('Mudou');
    const ordem = dados({ ...site, ...r.estado }).visual.ordem;
    expect(ordem.indexOf('destaques')).toBe(ordem.indexOf('produtos') - 1);
  });
});

describe('h) b) resultado honesto: nunca verde quando nada muda no site', () => {
  it('mudança só de nota = "Anotado para o tema"; nada = "Nada mudou"; parte = "Mudou em parte (X de Y)"', () => {
    expect(capac.resultadoDoAjuste({ aplicadas: [{ op: 'texto', campo: 'tema.observacoes' }], modo: 'pacote' }).status).toBe('anotado');
    expect(capac.resultadoDoAjuste({ aplicadas: [], recusadas: ['x'] }).titulo).toBe('Nada mudou');
    expect(capac.resultadoDoAjuste({ aplicadas: [{ op: 'mover' }], recusadas: ['a', 'b'] }).titulo).toBe('Mudou em parte (1 de 3)');
  });
  it('h) a mesma operação aplicada de novo não muda nada (o app não cria versão vazia)', () => {
    const a = aplicar([{ op: 'ocultar', bloco: 'faq' }]);
    const b = aplicarOperacoes(a.estado, [{ op: 'ocultar', bloco: 'faq' }], { modo: 'pacote', materiais, produtos });
    expect(b.aplicadas).toHaveLength(0);
    expect(JSON.stringify(b.estado)).toBe(JSON.stringify(a.estado));
  });
});

describe('e) fotos no lugar pedido já na primeira geração', () => {
  it('galeria do produto na ordem pedida (F27 principal), mesmo com as fotos já ligadas no envio', () => {
    const a = aplicacaoDoPlano(itensAceitos(plano), { modo: 'pacote', materiais, produtos });
    const r = aplicarReferencias(materiais, a.refs, { direta: {}, produtos });
    const mats = comUsos(materiais, r.patches);
    expect(fotosDoProduto(produtos[0], mats).map((f) => f.codigo)).toEqual(['F27', 'F28', 'F29', 'F33', 'F32', 'F31']);
    expect(r.conflitos).toEqual([]);
  });
  it('Clientes reais: os prints pedidos primeiro, na ordem pedida (F23 primeiro)', () => {
    const a = aplicacaoDoPlano(itensAceitos(plano), { modo: 'pacote', materiais, produtos });
    const mats = comUsos(materiais, aplicarReferencias(materiais, a.refs, { direta: {}, produtos }).patches);
    expect(printsDoCliente(mats).map((p) => p.codigo).slice(0, 5)).toEqual(['F23', 'F26', 'F25', 'F20', 'F24']);
  });
});

describe('seções do pacote', () => {
  it('"Destaques" é seção da loja (muda de lugar, sai) e entra no ajuste por seção', () => {
    expect(secoesDoSite('pacote').map((s) => s.id)).toContain('destaques');
  });
});
