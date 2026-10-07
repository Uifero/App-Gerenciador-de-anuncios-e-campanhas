// Análise com fonte, sempre DENTRO DO NICHO do cliente (Frente 5). Puro, sem banco nem tela:
//  - prioridade quando as fontes discordam: política do Meta/regras do app > resultados do cliente > resultados do
//    mesmo nicho > documentos de referência > anúncios do nicho > pesquisa web;
//  - filtro por nicho (e subnicho) e país em tudo: anúncios do swipe file, clientes do mesmo nicho e pesquisa; nicho sem
//    dado = dizer que não tem, nunca pegar de outro nicho (nicho vizinho só se o operador cadastrou, com rótulo);
//  - "Resultados do nicho" com a privacidade dos Insights: nunca nome; com só 1 outro cliente, "dados insuficientes";
//  - conferência de cada item da IA: fonte que não foi enviada sai, número sem fonte sai, confiança cai quando falta base.
import { somarDestino } from './destinos.js';
import { chavePais } from './pais.js';

const txt = (v) => String(v ?? '').trim();
export const normNicho = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

// ---------- prioridade ----------
export const TIPOS_FONTE = ['politica', 'resultadosCliente', 'resultadosNicho', 'documentos', 'anuncios', 'web'];
export const ROTULO_FONTE = {
  politica: 'Política do Meta / regras do app', resultadosCliente: 'Resultados do cliente', resultadosNicho: 'Resultados do nicho',
  documentos: 'Documentos', anuncios: 'Anúncios do nicho', web: 'Web',
};
/** 1 = mais forte. Tipo desconhecido fica por último. */
export const prioridadeFonte = (tipo) => { const i = TIPOS_FONTE.indexOf(tipo); return i < 0 ? 99 : i + 1; };
/** Ordena opções em conflito ([{ tipo, ... }]) da mais forte para a mais fraca; a primeira vence. */
export const ordenarPorPrioridade = (opcoes = []) => [...opcoes].sort((a, b) => prioridadeFonte(a.tipo) - prioridadeFonte(b.tipo));
/** Tipo de fonte mais forte que o item tem (null = nenhuma). */
export function fontePrincipal(fontes = {}) {
  return TIPOS_FONTE.find((t) => (fontes[t] || []).length) || null;
}
export const TEXTO_PRIORIDADE = 'PRIORIDADE quando as fontes discordam (da mais forte para a mais fraca): 1) política do Meta e regras do app (nada de prova inventada; restrições de produto de saúde); 2) resultados do próprio cliente; 3) resultados de outros clientes do MESMO nicho; 4) documentos de referência; 5) anúncios do nicho (swipe file); 6) pesquisa web. Quando escolher uma fonte em vez de outra, diga em "conflitos" qual venceu e por quê.';

// ---------- nicho ----------
/** Mesmo nicho (e, quando os dois têm, mesmo subnicho) e mesmo país. */
export const mesmoNicho = (a, b, { subnicho = false } = {}) => Boolean(normNicho(a?.nicho)) && normNicho(a?.nicho) === normNicho(b?.nicho)
  && chavePais(a) === chavePais(b) && (!subnicho || normNicho(a?.subnicho) === normNicho(b?.subnicho));
const vizinhos = (cliente) => (Array.isArray(cliente?.nichosVizinhos) ? cliente.nichosVizinhos : String(cliente?.nichosVizinhos || '').split(/[,;\n]/)).map(normNicho).filter(Boolean);

/**
 * Anúncios do swipe file (gcc_referencias de qualquer cliente) do nicho do cliente e do mesmo país, sem repetir o
 * mesmo anúncio copiado entre clientes, do que está há mais tempo no ar para o que está há menos (sinal de mercado).
 * Com subnicho e anúncios dele: só esses. Sem nada no nicho: anúncios de nicho vizinho (se cadastrado), com rótulo.
 * Devolve { itens, nivel: 'subnicho'|'nicho'|'vizinho'|'nenhum', rotulo }.
 */
export function anunciosDoNicho(referencias = [], cliente = {}) {
  const pais = chavePais(cliente);
  const doPais = (r) => !r.paisCliente || chavePais({ pais: r.paisCliente }) === pais;
  const unicos = (l) => l.filter((r, i) => l.findIndex((x) => (r.link && x.link === r.link) || (!r.link && x.titulo === r.titulo && normNicho(x.nicho) === normNicho(r.nicho))) === i);
  const ordenar = (l) => unicos(l).sort((a, b) => (Number(b.diasNoAr) || -1) - (Number(a.diasNoAr) || -1));
  const nicho = normNicho(cliente.nicho);
  const doNicho = nicho ? referencias.filter((r) => normNicho(r.nicho) === nicho && doPais(r)) : [];
  if (cliente.subnicho) {
    const sub = doNicho.filter((r) => normNicho(r.subnicho) === normNicho(cliente.subnicho));
    if (sub.length) return { itens: ordenar(sub), nivel: 'subnicho', rotulo: `subnicho "${cliente.subnicho}"` };
  }
  if (doNicho.length) return { itens: ordenar(doNicho), nivel: 'nicho', rotulo: `nicho "${cliente.nicho}"${cliente.subnicho ? ' (nenhum anúncio salvo do subnicho)' : ''}` };
  const viz = vizinhos(cliente);
  const deVizinho = viz.length ? referencias.filter((r) => viz.includes(normNicho(r.nicho)) && doPais(r)) : [];
  if (deVizinho.length) return { itens: ordenar(deVizinho), nivel: 'vizinho', rotulo: 'nicho vizinho (nenhum anúncio salvo do nicho do cliente) — confiança menor' };
  return { itens: [], nivel: 'nenhum', rotulo: `nenhum anúncio salvo do nicho "${cliente.nicho || '?'}"` };
}

export const MINIMO_CLIENTES_NICHO = 2;
/** Agregado por destino com a mesma regra: um destino com menos de 2 clientes não mostra número (exporia esse cliente). */
export function porDestinoPrivado(rs) {
  const out = {};
  for (const d of ['whatsapp', 'site']) {
    const doDestino = rs.filter((r) => (r.destino === 'whatsapp' ? 'whatsapp' : 'site') === d);
    const n = new Set(doDestino.map((r) => r.clienteId)).size;
    out[d] = n >= MINIMO_CLIENTES_NICHO ? { ...somarDestino(doDestino, d), clientes: n } : { destino: d, registros: 0, insuficiente: true, clientes: n };
  }
  return out;
}
/**
 * "Resultados do nicho": agregado de OUTROS clientes do mesmo nicho (subnicho quando dá) e país, por destino. Nunca
 * sai nome nem número de um cliente isolado: com menos de 2 outros clientes com resultado, devolve
 * `suficiente: false` e a mensagem "dados insuficientes no nicho" (sem números).
 * `resultados` = resultados de todos os clientes (com clienteId).
 */
export function resultadosDoNicho({ cliente = {}, clientes = [], resultados = [] } = {}) {
  const com = (lista) => {
    const ids = new Set(lista.map((c) => c.id));
    const rs = resultados.filter((r) => ids.has(r.clienteId));
    return { rs, clientes: new Set(rs.map((r) => r.clienteId)).size };
  };
  const outros = clientes.filter((c) => c.id !== cliente.id);
  const tentativas = [];
  if (cliente.subnicho) tentativas.push(['subnicho', outros.filter((c) => mesmoNicho(c, cliente, { subnicho: true })), `subnicho "${cliente.subnicho}"`]);
  tentativas.push(['nicho', outros.filter((c) => mesmoNicho(c, cliente)), `nicho "${cliente.nicho}"`]);
  for (const [nivel, lista, rotulo] of tentativas) {
    const x = com(lista);
    if (x.clientes >= MINIMO_CLIENTES_NICHO) return { suficiente: true, nivel, rotulo, clientes: x.clientes, porDestino: porDestinoPrivado(x.rs) };
  }
  const viz = vizinhos(cliente);
  if (viz.length) {
    const x = com(outros.filter((c) => viz.includes(normNicho(c.nicho)) && chavePais(c) === chavePais(cliente)));
    if (x.clientes >= MINIMO_CLIENTES_NICHO) return { suficiente: true, nivel: 'vizinho', rotulo: 'nicho vizinho — confiança menor', clientes: x.clientes, porDestino: porDestinoPrivado(x.rs) };
  }
  return { suficiente: false, nivel: 'nenhum', rotulo: `nicho "${cliente.nicho || '?'}"`, clientes: com(outros.filter((c) => mesmoNicho(c, cliente))).clientes, mensagem: 'dados insuficientes no nicho' };
}

// ---------- pesquisa web: data da fonte ----------
/** 'sem_data' | true (mais de `meses` meses) | false. Datas aceitas: AAAA, AAAA-MM, AAAA-MM-DD. */
export function fonteDesatualizada(data, hoje = new Date(), meses = 12) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(txt(data));
  if (!m) return 'sem_data';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2] || 12) - 1, Number(m[3] || 28)));
  const limite = new Date(hoje); limite.setMonth(limite.getMonth() - meses);
  return d < limite;
}
const linkValido = (u) => /^https?:\/\/[^\s]+$/i.test(txt(u));
const semBarra = (u) => txt(u).replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();
const siteDe = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Pesquisa do nicho devolvida pela IA -> só itens com link de verdade; cada um com site e data (e se está velho). */
export function normalizarPesquisa(d = {}, hoje = new Date()) {
  const fonte = (x) => (linkValido(x?.url) ? { url: txt(x.url), site: txt(x.site) || siteDe(x.url), data: txt(x.data) || null, desatualizada: fonteDesatualizada(x.data, hoje) } : null);
  const praticas = (Array.isArray(d.praticas) ? d.praticas : []).map((p) => ({ texto: txt(p?.texto), fonte: fonte(p) })).filter((p) => p.texto && p.fonte).slice(0, 8);
  const benchmarks = (Array.isArray(d.benchmarks) ? d.benchmarks : []).map((b) => ({ metrica: txt(b?.metrica), valor: txt(b?.valor), fonte: fonte(b) })).filter((b) => b.metrica && b.valor && b.fonte).slice(0, 6);
  return { encontrou: praticas.length + benchmarks.length > 0, resumo: txt(d.resumo).slice(0, 800), noNicho: d.noNicho !== false, praticas, benchmarks };
}
/** Lista única de fontes web da pesquisa (para numerar no pedido e conferir as citações da IA). */
export const fontesDaPesquisa = (p) => [...(p?.praticas || []), ...(p?.benchmarks || [])].map((x) => x.fonte).filter(Boolean).filter((f, i, l) => l.findIndex((y) => semBarra(y.url) === semBarra(f.url)) === i);

export const CACHE_PESQUISA_DIAS = 7;
/** Chave do cache da pesquisa: nicho + subnicho + destino + país. */
export const chavePesquisa = (cliente = {}, destino = '') => [normNicho(cliente.nicho), normNicho(cliente.subnicho), destino || 'geral', chavePais(cliente)].join('|').replace(/[^\w|-]+/g, '_');
/** Cache ainda vale (até 7 dias)? */
export const pesquisaValida = (doc, agora = Date.now()) => Boolean(doc?.pesquisadoEm) && agora - new Date(doc.pesquisadoEm).getTime() < CACHE_PESQUISA_DIAS * 864e5;

// ---------- conferência de cada item da IA ----------
export const CONFIANCAS = ['alta', 'media', 'baixa'];
export const ROTULO_CONFIANCA = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const SEM_FONTE = 'baseado só no raciocínio da IA';
const menor = (a, b) => (CONFIANCAS.indexOf(a) > CONFIANCAS.indexOf(b) ? a : b);
const conf = (v) => { const s = normNicho(v).replace('é', 'e'); return CONFIANCAS.includes(s) ? s : 'baixa'; };
const numOuNull = (v) => { if (v == null || v === '') return null; const x = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : null; };
const lista = (v) => (Array.isArray(v) ? v : []);

/**
 * Confere um item da recomendação/otimização contra o que o app de fato mandou para a IA (`ctx`):
 *  ctx = { documentos: [{ id, titulo }], web: [{ url, site, data, desatualizada }], anuncios: [{ id, titulo, diasNoAr }],
 *          qtdResultadosCliente, nicho: { suficiente, nivel }, poucoHistorico }
 * Devolve { porque, fontes: { documentos, web, anuncios, resultadosCliente, resultadosNicho, politica }, resultadoEsperado,
 * confianca, semFonte, avisos }.
 */
export function conferirItem(it = {}, ctx = {}) {
  const f = it.fontes || {}, avisos = [];
  const docs = lista(f.documentos).map((d) => { const x = (ctx.documentos || []).find((y) => y.id === txt(d?.id || d)); return x ? { id: x.id, titulo: x.titulo, parte: txt(d?.parte).slice(0, 120) } : null; }).filter(Boolean);
  const web = lista(f.web).map((w) => { const x = (ctx.web || []).find((y) => semBarra(y.url) === semBarra(w?.url || w)); return x ? { ...x } : null; }).filter(Boolean);
  const anuncios = lista(f.anuncios).map((a) => { const x = (ctx.anuncios || []).find((y) => y.id === txt(a?.id || a)); return x ? { id: x.id, titulo: x.titulo, diasNoAr: x.diasNoAr ?? null } : null; }).filter(Boolean);
  const cli = (ctx.qtdResultadosCliente || 0) > 0 ? lista(f.resultadosCliente).map((r) => ({ periodo: txt(r?.periodo), campanha: txt(r?.campanha), destino: txt(r?.destino) })).filter((r) => r.periodo || r.campanha) : [];
  const nic = ctx.nicho?.suficiente ? lista(f.resultadosNicho).map((r) => ({ descricao: txt(r?.descricao || r).slice(0, 200) })).filter((r) => r.descricao) : [];
  const pol = lista(f.politica).map((p) => ({ descricao: txt(p?.descricao || p).slice(0, 200) })).filter((p) => p.descricao);
  const tirados = [lista(f.documentos).length - docs.length, lista(f.web).length - web.length, lista(f.anuncios).length - anuncios.length, lista(f.resultadosCliente).length - cli.length, lista(f.resultadosNicho).length - nic.length].reduce((a, b) => a + b, 0);
  if (tirados > 0) avisos.push(`${tirados} fonte(s) citada(s) pela IA não estavam entre as enviadas e foram retiradas.`);
  const fontes = { politica: pol, resultadosCliente: cli, resultadosNicho: nic, documentos: docs, anuncios, web };
  const semFonte = !fontePrincipal(fontes);

  let confianca = conf(it.confianca || it.resultadoEsperado?.confianca);
  if (semFonte) confianca = 'baixa';
  if (web.some((w) => w.desatualizada === true) && !cli.length && !nic.length) { confianca = menor(confianca, 'media'); avisos.push('Fonte web com mais de 12 meses: pode estar desatualizada.'); }
  if (ctx.nicho?.nivel === 'vizinho' && nic.length) { confianca = menor(confianca, 'media'); avisos.push('Usa dados de nicho vizinho (não do nicho do cliente).'); }

  // Resultado esperado: faixa só com número que veio de fonte com número (resultados reais, web ou documento); nunca promessa.
  const re = it.resultadoEsperado || {};
  let min = numOuNull(re.min), max = numOuNull(re.max);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  const baseNumero = cli.length || nic.length || web.length || docs.length;
  if ((min != null || max != null) && !baseNumero) { avisos.push('A IA deu um número sem fonte que o sustente: retirado (o app não inventa benchmark).'); min = null; max = null; }
  let rConf = menor(conf(re.confianca || confianca), confianca);
  if (ctx.poucoHistorico && !nic.length) { rConf = 'baixa'; if (min != null || max != null) avisos.push('Pouco histórico deste cliente: a faixa é larga e a confiança, baixa.'); }
  const resultadoEsperado = (re.metrica || min != null || max != null) ? {
    metrica: txt(re.metrica).slice(0, 80), min, max, unidade: txt(re.unidade).slice(0, 12), confianca: rConf, dependeDe: txt(re.dependeDe).slice(0, 300),
  } : null;
  return { porque: txt(it.porque).slice(0, 1200), fontes, semFonte, confianca, resultadoEsperado, avisos };
}
