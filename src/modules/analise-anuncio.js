// Dados e execução de "Analisar e recomendar" e do "Plano de otimização" (a tela fica em area-anuncio.js e
// prints-resultado.js). Tudo lido da FONTE na hora: cliente, produtos, criativos, resultados, swipe file do nicho,
// clientes do mesmo nicho (agregado), documentos e o cache da pesquisa web (7 dias por nicho + destino).
import { db, COL } from '../core/storage.js';
import { analisesDoTipo } from '../lib/analises.js';
import { pesquisarNicho, recomendarAnuncio, planejarOtimizacao } from '../core/ia.js';
import { comoAnunciaDe, avisosDestino, sugerirNicho } from '../lib/anuncio.js';
import { anunciosDoNicho, resultadosDoNicho, normalizarPesquisa, chavePesquisa, pesquisaValida, mesmoNicho, normNicho } from '../lib/fontes-analise.js';
import { blocoFontes, normalizarRecomendacao, perguntasFaltantes, recomendacaoSemIA, normalizarOtimizacao, planoSemIA, diferencas } from '../lib/recomendacao.js';
import { compararDestinos } from '../lib/destinos.js';
import { documentosParaAnalise } from '../lib/documentos.js';
import { fonteDiagnostico, linhasFonteDiagnostico } from '../lib/conexoes.js';
import { produtosComFotos } from '../lib/fotos-site.js';
import { etiquetaSite } from '../lib/aprovacao-site.js';
import { chavePais } from '../lib/pais.js';

/** Tudo o que a análise lê, de uma vez. */
export async function carregarContexto(cliente) {
  const f = { clienteId: cliente.id };
  const [campanhas, criativos, sites, produtosBase, materiais, resultados, referencias, clientes, documentos, aprov, resp, analises] = await Promise.all([
    db.listar(COL.campanhas, f), db.listar(COL.criativos, f), db.listar(COL.sites, f).catch(() => []), db.listar(COL.produtos, f).catch(() => []),
    db.listar(COL.materiais, f).catch(() => []), db.listar(COL.resultados, f), db.listar(COL.referencias), db.listar(COL.clientes),
    db.listar(COL.documentos).catch(() => []), db.listar(COL.aprovacoes, f).catch(() => []), db.listar(COL.respostas, f).catch(() => []), db.listar(COL.analises, f).catch(() => []),
  ]);
  // Resultados de outros clientes: só dos que têm o mesmo nicho e país (o agregado nunca mostra quem é quem).
  const nichoNorm = normNicho(cliente.nicho), vizinhos = String(cliente.nichosVizinhos || '').split(/[,;\n]/).map(normNicho).filter(Boolean);
  const outros = clientes.filter((c) => c.id !== cliente.id && (mesmoNicho(c, cliente) || (vizinhos.includes(normNicho(c.nicho)) && chavePais(c) === chavePais(cliente))));
  const resultadosOutros = nichoNorm ? (await Promise.all(outros.map((c) => db.listar(COL.resultados, { clienteId: c.id })))).flat() : [];
  const site = sites[0] || null;
  const etiquetaAprov = etiquetaSite(aprov.filter((l) => l.tipo === 'site'), resp);
  const produtos = produtosComFotos(produtosBase, materiais);
  return { cliente, campanhas, criativos, site, produtos, materiais, resultados, referencias, clientes, resultadosOutros, documentos, etiquetaAprov, analises };
}

/** Pesquisa web do nicho: usa o cache de 7 dias (por nicho + subnicho + destino + país) ou faz UMA busca nova. */
export async function obterPesquisa(cliente, { forcar = false } = {}) {
  const destino = comoAnunciaDe(cliente).destino || 'ambos';
  const id = chavePesquisa(cliente, destino);
  const atual = await db.obter(COL.pesquisas, id).catch(() => null);
  if (!forcar && pesquisaValida(atual)) return { ...atual, id, doCache: true };
  const bruto = await pesquisarNicho({ cliente, destino });
  const doc = { chave: id, nicho: cliente.nicho, subnicho: cliente.subnicho || '', destino, pais: cliente.pais || '', clienteId: cliente.id,
    resultado: normalizarPesquisa(bruto), paginas: (bruto.paginasConsultadas || []).slice(0, 10), pesquisadoEm: new Date().toISOString() };
  await db.definir(COL.pesquisas, id, doc, { silencioso: true });
  return { ...doc, id, doCache: false };
}
/** Pesquisa em cache (sem pesquisar), para mostrar a data e as fontes na tela. */
export const pesquisaEmCache = async (cliente) => { const id = chavePesquisa(cliente, comoAnunciaDe(cliente).destino || 'ambos'); const d = await db.obter(COL.pesquisas, id).catch(() => null); return d ? { ...d, id, valida: pesquisaValida(d) } : null; };

/** O que é igual nas duas análises: fontes no nicho, comparação, avisos e perguntas. */
export function montarFontes(ctx, pesquisa = null) {
  const { cliente, resultados, referencias, clientes, resultadosOutros, documentos, produtos, site, etiquetaAprov, campanhas } = ctx;
  const anuncios = anunciosDoNicho(referencias, cliente);
  const nicho = resultadosDoNicho({ cliente, clientes, resultados: resultadosOutros });
  const comparacao = compararDestinos(resultados);
  const docs = documentosParaAnalise(documentos, cliente.id);
  const { texto, ctx: conferencia } = blocoFontes({ documentos: docs, pesquisa: pesquisa?.resultado || null, anuncios, resultados, nicho, comparacao, campanhas });
  const cadastro = linhasFonteDiagnostico(fonteDiagnostico({ cliente, site, etiquetaAprov, produtos }));
  return { anuncios, nicho, comparacao, docs, texto, conferencia, cadastro,
    avisos: avisosDestino({ cliente, site, etiquetaAprov, produtos }),
    perguntas: perguntasFaltantes({ cliente, resultados, sugestaoNicho: sugerirNicho(cliente, produtos) }) };
}

const ultima = (analises, tipo) => analisesDoTipo(analises, tipo)[0] || null;

/**
 * "Analisar e recomendar". Com IA: pesquisa (cache ou uma busca) + uma chamada de recomendação. Sem IA: regras do app.
 * Grava a análise com data e, se houver anterior, o que mudou (fatos do app + o porquê da IA).
 */
export async function analisarERecomendar(cliente, { semIA = false, forcarPesquisa = false } = {}) {
  const ctx = await carregarContexto(cliente);
  const anterior = ultima(ctx.analises, 'recomendacao');
  let pesquisa = null, rec;
  if (semIA) {
    const f = montarFontes(ctx);
    rec = recomendacaoSemIA({ cliente, produtos: ctx.produtos, comparacao: f.comparacao, anuncios: f.anuncios });
    rec.perguntas = f.perguntas; rec.avisos = f.avisos; rec.fontesUsadas = resumoFontes(f, null);
  } else {
    pesquisa = await obterPesquisa(cliente, { forcar: forcarPesquisa });
    const f = montarFontes(ctx, pesquisa);
    const bruto = await recomendarAnuncio({ cliente, fontes: f.texto, cadastro: f.cadastro, produtos: ctx.produtos, criativos: ctx.criativos.filter((c) => !c.arquivado), avisos: f.avisos, perguntas: f.perguntas,
      anterior: anterior ? { data: String(anterior.criadoEm).slice(0, 10), resumo: anterior.resultado?.resumo || '' } : null });
    rec = normalizarRecomendacao(bruto, { cliente, produtos: ctx.produtos, conferencia: f.conferencia });
    rec.perguntas = [...f.perguntas, ...rec.perguntas]; rec.avisos = f.avisos; rec.fontesUsadas = resumoFontes(f, pesquisa);
  }
  rec.diferencas = anterior ? diferencas(anterior.resultado, rec) : [];
  // Sem análise anterior não há "o que mudou" (a IA às vezes usa o campo para pendências: elas já vão em perguntas/avisos).
  if (!anterior) rec.mudancas = [];
  const salvo = await db.criar(COL.analises, { clienteId: cliente.id, tipo: 'recomendacao', origem: semIA ? 'manual' : 'ia', resultado: rec, anteriorId: anterior?.id || null, pesquisaId: pesquisa?.id || null, aceitos: [] });
  return { analise: salvo, ctx };
}

/** "Plano de otimização" WhatsApp x Site (com IA ou só regras). */
export async function planoDeOtimizacao(cliente, { semIA = false, intervalo = {} } = {}) {
  const ctx = await carregarContexto(cliente);
  const comparacao = compararDestinos(ctx.resultados, intervalo);
  let plano, pesquisa = null;
  if (semIA) plano = planoSemIA({ cliente, comparacao });
  else {
    pesquisa = await obterPesquisa(cliente);
    const f = montarFontes({ ...ctx, resultados: ctx.resultados }, pesquisa);
    plano = normalizarOtimizacao(await planejarOtimizacao({ cliente, fontes: f.texto, cadastro: f.cadastro }), { conferencia: f.conferencia, comparacao });
    plano.fontesUsadas = resumoFontes(f, pesquisa);
  }
  plano.comparacao = { nivel: comparacao.nivel, mensagem: comparacao.mensagem, avisoPeriodo: comparacao.avisoPeriodo };
  const salvo = await db.criar(COL.analises, { clienteId: cliente.id, tipo: 'otimizacao', origem: semIA ? 'manual' : 'ia', resultado: plano, intervalo, pesquisaId: pesquisa?.id || null, aceitos: [] });
  return { analise: salvo, comparacao };
}

/** O que a IA tinha em mãos (contado pelo app), para a tela mostrar junto da análise. */
function resumoFontes(f, pesquisa) {
  return {
    documentos: f.docs.map((d) => d.titulo), anuncios: f.anuncios.itens.length, anunciosNivel: f.anuncios.rotulo,
    resultadosCliente: f.conferencia.qtdResultadosCliente, nicho: f.nicho.suficiente ? `${f.nicho.rotulo}, ${f.nicho.clientes} clientes` : f.nicho.mensagem || 'dados insuficientes no nicho',
    pesquisa: pesquisa ? { em: pesquisa.pesquisadoEm, doCache: pesquisa.doCache, encontrou: pesquisa.resultado?.encontrou, noNicho: pesquisa.resultado?.noNicho !== false, fontes: [...(pesquisa.resultado?.praticas || []), ...(pesquisa.resultado?.benchmarks || [])].map((x) => x.fonte) } : null,
  };
}
