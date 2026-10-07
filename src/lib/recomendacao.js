// "Analisar e recomendar" e "Plano de otimização" (Frentes 2 e 4). Puro (sem banco nem tela):
//  - blocoFontes: o que vai para a IA, numerado (documentos, web, anúncios do nicho, resultados), e o mesmo contexto
//    usado depois para conferir as citações (lib/fontes-analise.js conferirItem);
//  - normalizarRecomendacao / normalizarOtimizacao: a resposta da IA vira itens conferidos (nome do objetivo e do local
//    de conversão saem da tabela do app; CTA combina com o destino; produto e anúncio citados existem);
//  - perguntasFaltantes: o que precisa de resposta antes (nicho, destino, ticket, verba, vendas do WhatsApp);
//  - recomendacaoSemIA / planoSemIA: o caminho manual, só com contas e regras do app;
//  - aplicarAceitos / acoesParaTarefas: SÓ o que o operador aceitou vira rascunho de campanha, brief ou tarefa;
//  - diferencas: o que mudou entre a recomendação anterior e a nova.
import { comoAnunciaDe, validarObjetivo, ctaParaDestino, limitesDoCliente, LOCAIS_CONVERSAO, DESTINOS, CONFIRA } from './anuncio.js';
import { conferirItem, fontesDaPesquisa, TEXTO_PRIORIDADE, SEM_FONTE } from './fontes-analise.js';
import { metricasResultado, periodoDe, textoPeriodo, nomeDestino } from './destinos.js';
import { achadosSaude, ehProdutoSaude } from './saude.js';
import { NARRATIVAS, narrativaPorId, narrativaPermitida } from './narrativas.js';
import { FORMATOS } from './constantes.js';

const txt = (v) => String(v ?? '').trim();
const lista = (v) => (Array.isArray(v) ? v : []);
const numero = (v) => { if (v == null || v === '') return null; const x = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(x) && x > 0 ? x : null; };
const normTxt = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (v) => (v == null ? 'n/d' : Number(v).toFixed(2).replace('.', ','));

// ---------- o que vai para a IA ----------
/**
 * Monta o bloco de fontes (texto do pedido) e o contexto de conferência. Entradas já filtradas pelo nicho:
 *  documentos [{ id, titulo, resumo, partes:[{parte}] }], pesquisa (normalizarPesquisa), anuncios (anunciosDoNicho),
 *  resultados (do cliente), nicho (resultadosDoNicho), comparacao (compararDestinos).
 */
export function blocoFontes({ documentos = [], pesquisa = null, anuncios = { itens: [], rotulo: '' }, resultados = [], nicho = null, comparacao = null, campanhas = [] } = {}) {
  const web = fontesDaPesquisa(pesquisa);
  const ads = lista(anuncios.itens).slice(0, 12);
  const nomeCamp = (id) => campanhas.find((c) => c.id === id)?.nome || '';
  const res = [...resultados].sort((a, b) => String(periodoDe(b)?.fim || '').localeCompare(String(periodoDe(a)?.fim || ''))).slice(0, 20);
  const linhaRes = (r) => { const m = metricasResultado(r), p = periodoDe(r);
    return `- período ${textoPeriodo(p)} · ${nomeDestino(m.destino)}${r.campanhaNome || nomeCamp(r.campanhaId) ? ` · campanha "${r.campanhaNome || nomeCamp(r.campanhaId)}"` : ''}${r.criativoNome ? ` · criativo "${r.criativoNome}"` : ''}: gasto R$ ${fmt(m.gasto)}${m.conversas != null ? `, ${m.conversas} conversas (R$ ${fmt(m.custoConversa)}/conversa)` : ''}${m.vendas != null ? `, ${Math.round(m.vendas * 100) / 100} vendas (R$ ${fmt(m.custoVenda)}/venda)` : m.destino === 'whatsapp' ? ', vendas NÃO registradas' : ''}${m.roas != null ? `, ROAS ${fmt(m.roas)}` : ''}${r.ctr != null ? `, CTR ${r.ctr}%` : ''}`; };
  const linhaAgg = (d, a) => a.insuficiente ? `${nomeDestino(d)}: dados insuficientes no nicho (menos de 2 clientes com esse destino — não use número)` : `${nomeDestino(d)}: ${a.registros} registro(s), gasto R$ ${fmt(a.gasto)}${a.custoConversa != null ? `, R$ ${fmt(a.custoConversa)}/conversa` : ''}${a.custoVenda != null ? `, R$ ${fmt(a.custoVenda)}/venda` : ''}${a.roas != null ? `, ROAS ${fmt(a.roas)}` : ''}${a.taxaConversao != null ? `, conversão ${fmt(a.taxaConversao)}%` : ''}${a.ticket != null ? `, ticket R$ ${fmt(a.ticket)}` : ''}`;
  const texto = `FONTES DISPONÍVEIS (cite SÓ estas, pelo id; se uma lista está vazia, não a cite):
DOCUMENTOS DE REFERÊNCIA (id · título · partes):
${documentos.map((d) => `- id "${d.id}" · ${d.titulo}${lista(d.partes).length ? ` · partes: ${d.partes.map((p) => p.parte).filter(Boolean).join('; ')}` : ''}${d.resumo ? `\n  resumo: ${txt(d.resumo).slice(0, 1500)}` : ''}`).join('\n') || '(nenhum)'}

PESQUISA WEB DO NICHO (${pesquisa?.encontrou ? 'feita' : 'sem resultado útil'}${pesquisa?.noNicho === false ? ' — a pesquisa NÃO achou dado específico do nicho' : ''}):
${pesquisa?.resumo ? `resumo: ${pesquisa.resumo}\n` : ''}${(pesquisa?.praticas || []).map((p) => `- prática: ${p.texto} [url ${p.fonte.url} · ${p.fonte.site} · data ${p.fonte.data || 'não informada'}${p.fonte.desatualizada === true ? ' · MAIS DE 12 MESES' : ''}]`).join('\n')}
${(pesquisa?.benchmarks || []).map((b) => `- número: ${b.metrica} = ${b.valor} [url ${b.fonte.url} · ${b.fonte.site} · data ${b.fonte.data || 'não informada'}${b.fonte.desatualizada === true ? ' · MAIS DE 12 MESES' : ''}]`).join('\n')}${(pesquisa?.praticas || []).length || (pesquisa?.benchmarks || []).length ? '' : '(nenhuma)'}

ANÚNCIOS DO NICHO no swipe file (${anuncios.rotulo || 'nicho do cliente'}; do que está há MAIS tempo no ar para o que está há menos — tempo no ar é sinal de que vende; modele a ESTRUTURA, nunca copie):
${ads.map((r) => `- id "${r.id}" · "${r.titulo || 'anúncio'}"${r.empresa ? ` (${r.empresa})` : ''} · ${r.diasNoAr != null ? `${r.diasNoAr} dias no ar` : 'tempo no ar não confirmado'} · ângulo ${r.analise?.angulo || r.categoria || 'n/d'} · formato ${r.analise?.formato || 'n/d'}${r.analise?.replicar ? ` · o que replicar: ${r.analise.replicar}` : ''}`).join('\n') || '(nenhum anúncio salvo deste nicho)'}

RESULTADOS DO CLIENTE (registrados no app; Meta não vê venda fechada no WhatsApp, ela vem do registro manual):
${res.map(linhaRes).join('\n') || '(nenhum resultado registrado)'}
${comparacao && comparacao.nivel !== 'sem_dados' ? `Comparação WhatsApp x Site (mesmo período${comparacao.avisoPeriodo ? ' — ATENÇÃO: ' + comparacao.avisoPeriodo : ''}):\n${linhaAgg('whatsapp', comparacao.whatsapp)}\n${linhaAgg('site', comparacao.site)}\n${comparacao.mensagem || ''}` : ''}

RESULTADOS DO NICHO (outros clientes do mesmo nicho e país, agregados, sem nomes):
${nicho?.suficiente ? `${nicho.rotulo}, ${nicho.clientes} clientes:\n${linhaAgg('whatsapp', nicho.porDestino.whatsapp)}\n${linhaAgg('site', nicho.porDestino.site)}` : 'dados insuficientes no nicho (não use números de nicho)'}

${TEXTO_PRIORIDADE}`;
  const ctx = {
    documentos: documentos.map((d) => ({ id: d.id, titulo: d.titulo })), web,
    anuncios: ads.map((r) => ({ id: r.id, titulo: r.titulo || 'anúncio', diasNoAr: r.diasNoAr ?? null })),
    qtdResultadosCliente: resultados.length, nicho: { suficiente: Boolean(nicho?.suficiente), nivel: nicho?.nivel || 'nenhum' },
    poucoHistorico: resultados.length < 3,
  };
  return { texto, ctx };
}

/** Formato das fontes de cada item (igual na recomendação e na otimização). */
export const FORMATO_FONTES = '"fontes": {"documentos":[{"id","parte"}],"web":[{"url"}],"anuncios":[{"id"}],"resultadosCliente":[{"periodo","campanha","destino"}],"resultadosNicho":[{"descricao"}],"politica":[{"descricao"}]}';
export const FORMATO_ESPERADO = '"resultadoEsperado": {"metrica": string, "min": number|null, "max": number|null, "unidade": "R$"|"%"|"x"|"", "confianca": "alta"|"media"|"baixa", "dependeDe": string} — faixa, nunca promessa; número SÓ se vier de uma fonte com número ou de resultado real; com pouco histórico, faixa larga e confiança baixa';

// ---------- perguntas que precisam de resposta ----------
const OPCOES_TICKET = ['até R$ 100', 'R$ 100 a R$ 300', 'R$ 300 a R$ 1.000', 'acima de R$ 1.000'];
const OPCOES_VERBA = ['até R$ 1.500/mês', 'R$ 1.500 a R$ 5.000/mês', 'R$ 5.000 a R$ 15.000/mês', 'acima de R$ 15.000/mês'];
/** Valor típico de cada faixa (usado só para preencher o campo quando o operador escolhe a opção; ele edita depois). */
export const VALOR_OPCAO = { 'até R$ 100': 80, 'R$ 100 a R$ 300': 200, 'R$ 300 a R$ 1.000': 600, 'acima de R$ 1.000': 1200, 'até R$ 1.500/mês': 1500, 'R$ 1.500 a R$ 5.000/mês': 3000, 'R$ 5.000 a R$ 15.000/mês': 10000, 'acima de R$ 15.000/mês': 20000 };
/**
 * Perguntas que o app já sabe que faltam (sem IA): nicho, destino, ticket, verba e, com WhatsApp, as vendas fechadas na
 * conversa (sem elas a escala seria decidida só por conversa). `campo` diz onde a resposta é gravada.
 */
export function perguntasFaltantes({ cliente = {}, resultados = [], sugestaoNicho = '' } = {}) {
  const a = comoAnunciaDe(cliente), out = [];
  if (!txt(cliente.nicho)) out.push({ id: 'nicho', campo: 'nicho', texto: 'Qual é o nicho deste cliente? A análise só compara com o mesmo nicho.', opcoes: [sugestaoNicho].filter(Boolean), livre: true });
  if (!a.destino) out.push({ id: 'destino', campo: 'destino', texto: 'Onde a venda acontece?', opcoes: DESTINOS.map(([, n]) => n) });
  if (!a.ticketMedio) out.push({ id: 'ticket', campo: 'ticketMedio', texto: 'Qual é o ticket médio (valor médio de cada venda)?', opcoes: OPCOES_TICKET, livre: true });
  if (!a.verbaMensal) out.push({ id: 'verba', campo: 'verbaMensal', texto: 'Qual é a verba mensal de anúncio?', opcoes: OPCOES_VERBA, livre: true });
  const whats = resultados.filter((r) => r.destino === 'whatsapp');
  if (['whatsapp', 'ambos'].includes(a.destino) && whats.length && !whats.some((r) => r.vendasConversa != null)) {
    out.push({ id: 'vendas_whatsapp', campo: 'registrar', texto: 'Há resultados de WhatsApp sem as vendas fechadas na conversa. A escala precisa das vendas, não só das conversas: registre-as na aba Resultados.', opcoes: ['Registrar agora'] });
  }
  return out;
}

// ---------- recomendação ----------
const ESCOLHAS = ['whatsapp', 'site', 'teste'];
const normEscolha = (v) => { const s = normTxt(v); return s.includes('teste') || s.includes('ambos') || s.includes('dois') ? 'teste' : s.includes('whats') ? 'whatsapp' : s.includes('site') ? 'site' : ''; };
const destinoDaEscolha = (e) => (e === 'teste' ? 'ambos' : e);
const formatoValido = (f) => { const s = normTxt(f); return (FORMATOS.find(([k, n]) => normTxt(k) === s || normTxt(n) === s || normTxt(n).includes(s)) || [])[0] || ''; };
const produtoPorNome = (nome, produtos) => { const s = normTxt(nome); return s ? produtos.find((p) => normTxt(p.nome) === s) || produtos.find((p) => s.includes(normTxt(p.nome)) || normTxt(p.nome).includes(s)) || null : null; };

/**
 * Resposta da IA -> recomendação conferida, em itens que o operador aceita um a um:
 *   { resumo, destino, itens: [{ id, tipo, titulo, dados, porque, fontes, resultadoEsperado, confianca, semFonte, avisos }],
 *     perguntas, conflitos, mudancas }
 * ctx: { cliente, produtos, conferencia (blocoFontes().ctx) }.
 */
export function normalizarRecomendacao(d = {}, { cliente = {}, produtos = [], conferencia = {} } = {}) {
  const saude = ehProdutoSaude(cliente, produtos);
  const item = (id, tipo, titulo, dados, bruto) => {
    const c = conferirItem(bruto, conferencia);
    const avisos = [...c.avisos, ...lista(dados._avisos)];
    delete dados._avisos;
    if (saude) { const ach = achadosSaude(JSON.stringify(dados)); if (ach.length) avisos.push(`Produto de saúde: o Meta proíbe ${ach.join(', ')} em anúncios — ajuste antes de usar.`); }
    return { id, tipo, titulo, dados, ...c, avisos };
  };
  const itens = [];
  const dst = d.destino || {};
  const escolha = ESCOLHAS.includes(dst.escolha) ? dst.escolha : normEscolha(dst.escolha);
  let divisao = null;
  if (escolha === 'teste') {
    const w = numero(dst.divisao?.whatsapp), s = numero(dst.divisao?.site);
    divisao = w != null && s != null && w + s > 0 ? { whatsapp: Math.round((w / (w + s)) * 100), site: 100 - Math.round((w / (w + s)) * 100) } : { whatsapp: 50, site: 50 };
  }
  if (escolha) itens.push(item('destino', 'destino', escolha === 'teste' ? `Testar WhatsApp x Site (${divisao.whatsapp}% / ${divisao.site}%)` : `Vender pelo ${nomeDestino(escolha)}`, { escolha, divisao }, dst));

  const e = d.estrutura || {};
  if (Object.keys(e).length) {
    const v = validarObjetivo(e.objetivo, e.localConversao);
    const conjuntos = lista(e.conjuntosDetalhe).map((k, i) => {
      const loc = validarObjetivo(e.objetivo, k.localConversao || e.localConversao);
      return { nome: txt(k.nome) || `Conjunto ${i + 1}`, destino: normEscolha(k.destino) || LOCAIS_CONVERSAO[loc.local.chave]?.destino || '', localConversao: loc.local, orcamentoDiario: numero(k.orcamentoDiario), publico: txt(k.publico) };
    }).slice(0, 10);
    const qtd = conjuntos.length || Math.min(Math.max(Math.round(numero(e.conjuntos) || 1), 1), 10);
    const diario = numero(e.orcamentoDiario) ?? (conjuntos.every((k) => k.orcamentoDiario) && conjuntos.length ? conjuntos.reduce((s, k) => s + k.orcamentoDiario, 0) : null);
    const porConjunto = numero(e.orcamentoPorConjunto) ?? (diario ? Math.round((diario / qtd) * 100) / 100 : null);
    const avisos = [...v.avisos, ...conjuntos.flatMap((k) => (k.localConversao.chave ? [] : [`Conjunto "${k.nome}": local de conversão fora da tabela — ${CONFIRA}.`]))];
    const somaConj = conjuntos.reduce((s, k) => s + (k.orcamentoDiario || 0), 0);
    if (diario && conjuntos.length && conjuntos.every((k) => k.orcamentoDiario) && Math.abs(somaConj - diario) > 1) avisos.push(`A soma dos conjuntos (R$ ${fmt(somaConj)}/dia) não bate com o total (R$ ${fmt(diario)}/dia): confira o orçamento antes de subir.`);
    itens.push(item('estrutura', 'estrutura', `${v.objetivo.nome} · ${v.local.nome} · ${qtd} conjunto(s)${diario ? ` · R$ ${fmt(diario)}/dia` : ''}`,
      { objetivo: v.objetivo, localConversao: v.local, conjuntos: qtd, conjuntosDetalhe: conjuntos, orcamentoDiario: diario, orcamentoPorConjunto: porConjunto, duracaoDias: numero(e.duracaoDias), publicos: lista(e.publicos).map(txt).filter(Boolean).slice(0, 6), _avisos: avisos }, e));
  }

  lista(d.criativos).slice(0, 8).forEach((c, i) => {
    const destino = normEscolha(c.destino) || (escolha === 'teste' ? '' : escolha) || comoAnunciaDe(cliente).destino;
    const dest = destino === 'whatsapp' ? 'whatsapp' : 'site';
    const cta = ctaParaDestino(c.cta, dest);
    const prod = produtoPorNome(c.produto, produtos);
    const narrAchada = narrativaPorId(c.narrativa) || NARRATIVAS.find((n) => normTxt(n.nome) === normTxt(c.narrativa)) || null;
    const narr = narrAchada && narrativaPermitida(narrAchada, cliente) ? narrAchada : null;
    const insp = lista(c.inspiracao).map((x) => txt(x?.id || x)).filter((id) => (conferencia.anuncios || []).some((a) => a.id === id));
    const avisos = [cta.aviso, c.produto && !prod ? `Produto "${txt(c.produto)}" não está cadastrado: escolha um produto ao gerar.` : '',
      narrAchada && !narr ? `Narrativa "${narrAchada.nome}" exige prova real${saude ? ' e é proibida pelo Meta em produto de saúde' : ''}: escolha outra ao gerar.` : ''].filter(Boolean);
    itens.push(item(`criativo_${i + 1}`, 'criativo', `${txt(c.angulo) || 'Ângulo'}${formatoValido(c.formato) ? ` · ${FORMATOS.find(([k]) => k === formatoValido(c.formato))[1]}` : ''}${prod ? ` · ${prod.nome}` : ''}`,
      { angulo: txt(c.angulo), formato: formatoValido(c.formato), narrativa: narr?.id || '', produtoId: prod?.id || null, produtoNome: prod?.nome || '', cta: cta.cta, destino: dest, quantidade: Math.min(Math.max(Math.round(numero(c.quantidade) || 1), 1), 5), descricao: txt(c.descricao).slice(0, 600), inspiracao: insp, _avisos: avisos }, c));
  });

  lista(d.metricas).slice(0, 6).forEach((m, i) => {
    const dest = normEscolha(m.destino) === 'whatsapp' ? 'whatsapp' : 'site';
    itens.push(item(`metrica_${i + 1}`, 'metrica', `${nomeDestino(dest)}: ${txt(m.metrica) || 'métrica'}`, { destino: dest, metrica: txt(m.metrica), escalar: txt(m.escalar), manter: txt(m.manter), pausar: txt(m.pausar) }, m));
  });
  if (d.escala && txt(d.escala.plano)) itens.push(item('escala', 'escala', 'Plano de escala', { plano: txt(d.escala.plano).slice(0, 1200) }, d.escala));

  return {
    resumo: txt(d.resumo).slice(0, 600), destino: escolha || '', divisao, itens,
    perguntas: lista(d.perguntas).map((p, i) => ({ id: `ia_${i + 1}`, texto: txt(p?.texto || p), opcoes: lista(p?.opcoes).map(txt).filter(Boolean).slice(0, 5), campo: txt(p?.campo) })).filter((p) => p.texto).slice(0, 6),
    conflitos: lista(d.conflitos).map((x) => txt(x?.texto || x)).filter(Boolean).slice(0, 6),
    mudancas: lista(d.mudancas).map((x) => ({ oque: txt(x?.oque || x), porque: txt(x?.porque) })).filter((x) => x.oque).slice(0, 8),
  };
}

/**
 * Caminho sem IA: só o que dá para decidir com regra e conta do app (sem citar mercado). Itens "regra do app".
 * ctx: { cliente, produtos, comparacao, anuncios (anunciosDoNicho), qtdResultados }.
 */
export function recomendacaoSemIA({ cliente = {}, produtos = [], comparacao = null, anuncios = { itens: [] } } = {}) {
  const a = comoAnunciaDe(cliente), lim = limitesDoCliente(a);
  const regra = (porque) => ({ porque, fontes: {}, semFonte: false, regraApp: true, confianca: 'baixa', resultadoEsperado: null, avisos: [] });
  const escolha = a.destino === 'ambos' ? 'teste' : a.destino || '';
  const itens = [];
  let divisao = null;
  if (escolha) {
    if (escolha === 'teste') {
      const v = comparacao?.ondeVerba?.destino;
      divisao = v === 'whatsapp' ? { whatsapp: 60, site: 40 } : v === 'site' ? { whatsapp: 40, site: 60 } : { whatsapp: 50, site: 50 };
    }
    itens.push({ id: 'destino', tipo: 'destino', titulo: escolha === 'teste' ? `Testar WhatsApp x Site (${divisao.whatsapp}% / ${divisao.site}%)` : `Vender pelo ${nomeDestino(escolha)}`, dados: { escolha, divisao },
      ...regra(escolha === 'teste' ? (comparacao?.ondeVerba && comparacao.ondeVerba.destino !== 'empate' ? `Você vende pelos dois; ${comparacao.ondeVerba.motivo} Por isso a divisão pende para esse lado.` : 'Você vende pelos dois e ainda não há custo por venda dos dois lados no mesmo período: divisão igual até os números dizerem quem vende mais barato.') : `É o destino de venda informado em "Sobre como esse cliente anuncia".`) });
  }
  const diario = a.verbaMensal ? Math.round((a.verbaMensal / 30) * 100) / 100 : null;
  const conj = escolha === 'teste' ? [{ nome: 'WhatsApp', destino: 'whatsapp', localConversao: { chave: 'apps_mensagem', nome: LOCAIS_CONVERSAO.apps_mensagem.nome } }, { nome: 'Site', destino: 'site', localConversao: { chave: 'site', nome: LOCAIS_CONVERSAO.site.nome } }]
    : escolha ? [{ nome: 'Conjunto 1', destino: escolha, localConversao: escolha === 'whatsapp' ? { chave: 'apps_mensagem', nome: LOCAIS_CONVERSAO.apps_mensagem.nome } : { chave: 'site', nome: LOCAIS_CONVERSAO.site.nome } }] : [];
  if (conj.length) {
    conj.forEach((k) => { k.orcamentoDiario = diario ? Math.round((diario * (divisao ? divisao[k.destino] / 100 : 1)) * 100) / 100 : null; k.publico = ''; });
    itens.push({ id: 'estrutura', tipo: 'estrutura', titulo: `Vendas · ${conj.map((k) => k.localConversao.nome).join(' + ')} · ${conj.length} conjunto(s)${diario ? ` · R$ ${fmt(diario)}/dia` : ''}`,
      dados: { objetivo: { chave: 'vendas', nome: 'Vendas' }, localConversao: conj[0].localConversao, conjuntos: conj.length, conjuntosDetalhe: conj, orcamentoDiario: diario, orcamentoPorConjunto: conj[0].orcamentoDiario, duracaoDias: 7, publicos: [] },
      ...regra(`Um conjunto por destino, com o objetivo Vendas. ${diario ? `Verba mensal ÷ 30 = R$ ${fmt(diario)}/dia.` : 'Sem verba mensal informada: preencha para o app dividir o orçamento.'}`) });
  }
  const prod = produtos[0] || null, dest = escolha === 'whatsapp' ? 'whatsapp' : 'site';
  const inspira = (anuncios.itens || []).slice(0, 3);
  ['dor_solucao', 'por_que_funciona', 'oferta'].map(narrativaPorId).filter(Boolean).forEach((n, i) => {
    itens.push({ id: `criativo_${i + 1}`, tipo: 'criativo', titulo: `${n.nome}${prod ? ` · ${prod.nome}` : ''}`,
      dados: { angulo: n.nome, formato: 'video_curto', narrativa: n.id, produtoId: prod?.id || null, produtoNome: prod?.nome || '', cta: ctaParaDestino('', dest).cta, destino: dest, quantidade: 1, descricao: '', inspiracao: inspira[i] ? [inspira[i].id] : [] },
      ...regra(`Um criativo por etapa do funil (topo, meio e fundo), com o CTA de ${dest === 'whatsapp' ? 'conversa' : 'compra'}.${inspira[i] ? ` Estrutura inspirada em "${inspira[i].titulo}"${inspira[i].diasNoAr != null ? ` (${inspira[i].diasNoAr} dias no ar)` : ''}.` : ''}`) });
  });
  if (lim.ok) {
    for (const d of escolha === 'teste' ? ['whatsapp', 'site'] : escolha ? [escolha] : []) {
      itens.push({ id: `metrica_${d}`, tipo: 'metrica', titulo: `${nomeDestino(d)}: custo por venda`, dados: { destino: d, metrica: 'custo por venda', escalar: `até R$ ${fmt(lim.custoVendaEscalar)}`, manter: `R$ ${fmt(lim.custoVendaEscalar)} a R$ ${fmt(lim.custoVendaEmpate)}`, pausar: `acima de R$ ${fmt(lim.custoVendaEmpate)}` },
        ...regra(`Conta com o ticket (R$ ${fmt(a.ticketMedio)}) e a margem (${a.margem}%) do cliente: o empate é R$ ${fmt(lim.custoVendaEmpate)} por venda; escalar com folga de 30%.`) });
    }
  }
  return { resumo: 'Recomendação sem IA: só regras e contas do app com os dados do cliente.', destino: escolha, divisao, itens, perguntas: [], conflitos: [], mudancas: [], semIA: true };
}

/**
 * Só o que foi ACEITO vira coisa: estrutura -> rascunho de campanha (na montagem que já existe); criativo -> brief
 * (o criativo só é gerado quando o operador clicar em gerar); métrica/escala -> tarefa na área de campanhas.
 * Nada é criado para item não aceito. ctx: { clienteId, analiseId, urlSite, data }.
 */
export function aplicarAceitos(rec = {}, aceitos = [], { clienteId = null, analiseId = null, urlSite = '', data = new Date().toISOString().slice(0, 10) } = {}) {
  const ok = new Set(aceitos);
  const escolhidos = (rec.itens || []).filter((i) => ok.has(i.id));
  const est = escolhidos.find((i) => i.tipo === 'estrutura');
  const metricas = escolhidos.filter((i) => i.tipo === 'metrica');
  let campanha = null;
  if (est) {
    const e = est.dados;
    const det = e.conjuntosDetalhe?.length ? e.conjuntosDetalhe : Array.from({ length: e.conjuntos || 1 }, (_, i) => ({ nome: `Conjunto ${i + 1}`, localConversao: e.localConversao, orcamentoDiario: e.orcamentoPorConjunto, publico: e.publicos?.[i] || '' }));
    const criterio = metricas.map((m) => `${m.titulo}: escalar ${m.dados.escalar || '—'}; manter ${m.dados.manter || '—'}; pausar ${m.dados.pausar || '—'}`).join(' | ');
    campanha = {
      clienteId, nome: `Recomendação ${data.split('-').reverse().join('/')} — ${rec.destino === 'teste' ? 'WhatsApp x Site' : nomeDestino(rec.destino || 'site')}`, status: 'rascunho', origem: 'recomendacao', recomendacaoId: analiseId,
      objetivo: e.objetivo?.nome || CONFIRA, orcamentoDiario: e.orcamentoDiario ?? null, urlDestino: det.some((k) => k.destino === 'site' || k.localConversao?.chave === 'site') ? urlSite || null : null,
      resumo: rec.resumo || '', criativos: [], versaoRascunho: 1, discussao: [],
      publicos: det.map((k) => ({ nome: k.publico || k.nome, descricao: '', tipo: '' })),
      conjuntos: det.map((k, i) => ({ nome: k.nome || `Conjunto ${i + 1}`, publico: { nome: k.publico || 'público a definir', descricao: '', tipo: '' }, orcamentoDiario: k.orcamentoDiario ?? null, objetivo: `Local de conversão: ${k.localConversao?.nome || CONFIRA}`, criativos: [] })),
      estruturaTeste: { conjuntos: String(det.length), duracaoDias: e.duracaoDias ?? null, criterioDecisao: criterio },
      checklistMeta: [
        `Criar campanha com objetivo ${e.objetivo?.nome || CONFIRA}${e.objetivo?.chave ? '' : ''}.`,
        ...det.map((k, i) => `Conjunto ${i + 1} "${k.nome}": local de conversão ${k.localConversao?.nome || CONFIRA}${k.orcamentoDiario ? `, R$ ${fmt(k.orcamentoDiario)}/dia` : ''}${k.publico ? `, público ${k.publico}` : ''}.`),
        'Subir os criativos gerados a partir dos briefs aceitos (aba Criativos) depois de aprovados.',
        ...(criterio ? [`Critério de decisão: ${criterio}`] : []),
      ],
    };
  }
  const briefs = escolhidos.filter((i) => i.tipo === 'criativo').map((i) => ({
    clienteId, analiseId, origem: 'recomendacao', tipo: 'brief_criativo', area: 'criativo', status: 'aberta', titulo: i.titulo,
    texto: [i.dados.descricao, `CTA: ${i.dados.cta}`, i.porque && `Por quê: ${i.porque}`].filter(Boolean).join('\n'), brief: { ...i.dados },
  }));
  const tarefas = [...(est ? [] : metricas), ...escolhidos.filter((i) => i.tipo === 'escala')].map((i) => ({
    clienteId, analiseId, origem: 'recomendacao', tipo: 'acompanhamento', area: 'campanha', status: 'aberta', titulo: i.titulo,
    texto: i.tipo === 'escala' ? i.dados.plano : `Escalar ${i.dados.escalar || '—'}; manter ${i.dados.manter || '—'}; pausar ${i.dados.pausar || '—'}`,
  }));
  return { campanha, briefs, tarefas };
}

/** O que mudou da recomendação anterior para a nova (só fatos; o porquê vem da IA em `mudancas`). */
export function diferencas(anterior, nova) {
  if (!anterior || !nova) return [];
  const de = (rec, id) => (rec.itens || []).find((i) => i.id === id)?.dados || null;
  const out = [];
  const tit = (rec, id) => (rec.itens || []).find((i) => i.id === id)?.titulo || '—';
  if ((anterior.destino || '') !== (nova.destino || '') || JSON.stringify(anterior.divisao || null) !== JSON.stringify(nova.divisao || null)) out.push({ campo: 'Destino', antes: tit(anterior, 'destino'), depois: tit(nova, 'destino') });
  const ea = de(anterior, 'estrutura'), en = de(nova, 'estrutura');
  if (JSON.stringify([ea?.objetivo?.chave, ea?.localConversao?.chave, ea?.conjuntos, ea?.orcamentoDiario]) !== JSON.stringify([en?.objetivo?.chave, en?.localConversao?.chave, en?.conjuntos, en?.orcamentoDiario])) out.push({ campo: 'Estrutura', antes: tit(anterior, 'estrutura'), depois: tit(nova, 'estrutura') });
  const ca = (anterior.itens || []).filter((i) => i.tipo === 'criativo').map((i) => i.titulo), cn = (nova.itens || []).filter((i) => i.tipo === 'criativo').map((i) => i.titulo);
  if (JSON.stringify(ca) !== JSON.stringify(cn)) out.push({ campo: 'Criativos', antes: `${ca.length}: ${ca.join('; ') || '—'}`, depois: `${cn.length}: ${cn.join('; ') || '—'}` });
  const ma = (anterior.itens || []).filter((i) => i.tipo === 'metrica').map((i) => `${i.titulo} (escalar ${i.dados.escalar}; pausar ${i.dados.pausar})`).join(' | ');
  const mn = (nova.itens || []).filter((i) => i.tipo === 'metrica').map((i) => `${i.titulo} (escalar ${i.dados.escalar}; pausar ${i.dados.pausar})`).join(' | ');
  if (ma !== mn) out.push({ campo: 'Métricas', antes: ma || '—', depois: mn || '—' });
  if ((de(anterior, 'escala')?.plano || '') !== (de(nova, 'escala')?.plano || '')) out.push({ campo: 'Escala', antes: de(anterior, 'escala')?.plano || '—', depois: de(nova, 'escala')?.plano || '—' });
  return out;
}

// ---------- plano de otimização (WhatsApp e Site) ----------
export const TIPOS_MUDANCA = {
  criativo: 'Criativo', angulo: 'Ângulo', publico: 'Público', orcamento: 'Verba', objetivo: 'Objetivo', landing_page: 'Página de destino', pagina_produto: 'Página do produto',
  oferta: 'Oferta', tempo_resposta: 'Tempo de resposta no WhatsApp', roteiro_whatsapp: 'Roteiro de atendimento', registro: 'Registro de resultados',
};
/** Ação de site: passo do "Montar site" onde ela aparece (4 = sugestão de ajuste; 6 = tarefa da loja). */
const PASSO_POR_TIPO = { landing_page: 4, pagina_produto: 4, oferta: 6 };
const tipoMudanca = (v) => { const s = normTxt(v).replace(/[\s-]+/g, '_'); return TIPOS_MUDANCA[s] ? s : Object.keys(TIPOS_MUDANCA).find((k) => normTxt(TIPOS_MUDANCA[k]) === normTxt(v)) || 'criativo'; };

/**
 * Plano da IA -> { resumo, whatsapp: [ação], site: [ação], ondeVerba, conflitos }. Até 5 ações por lado, na ordem de
 * prioridade. Ação: { id, area, prioridade, numero (o que o número mostra), mudar, tipo, medir, passoSite, ...conferido }.
 */
export function normalizarOtimizacao(d = {}, { conferencia = {}, comparacao = null } = {}) {
  const acoes = (area) => lista(d[area]).map((x, i) => {
    const c = conferirItem(x, conferencia);
    const tipo = tipoMudanca(x.tipo);
    const passo = area === 'site' ? ([4, 6].includes(Number(x.passoSite)) ? Number(x.passoSite) : PASSO_POR_TIPO[tipo] || null) : null;
    return { id: `${area}_${i + 1}`, area, prioridade: Math.min(Math.max(Math.round(numero(x.prioridade) || i + 1), 1), 5), numero: txt(x.numero).slice(0, 400), mudar: txt(x.mudar).slice(0, 400), tipo, medir: txt(x.medir).slice(0, 300), passoSite: passo, ...c };
  }).filter((a) => a.mudar).sort((a, b) => a.prioridade - b.prioridade).slice(0, 5);
  const ov = d.ondeVerba || {};
  const dest = normEscolha(ov.destino) === 'whatsapp' ? 'whatsapp' : normEscolha(ov.destino) === 'site' ? 'site' : normTxt(ov.destino).includes('empate') || normTxt(ov.destino).includes('manter') ? 'empate' : '';
  let ondeVerba = dest ? { destino: dest, ...conferirItem(ov, conferencia) } : null;
  // Sem venda dos dois lados no mesmo período, o app não deixa a IA cravar o destino da verba pelo custo por venda.
  if (ondeVerba && comparacao && comparacao.nivel !== 'venda') ondeVerba = { ...ondeVerba, destino: 'indefinido', avisos: [...ondeVerba.avisos, comparacao.mensagem || 'Falta custo por venda dos dois destinos no mesmo período.'] };
  return { resumo: txt(d.resumo).slice(0, 600), whatsapp: acoes('whatsapp'), site: acoes('site'), ondeVerba, conflitos: lista(d.conflitos).map((x) => txt(x?.texto || x)).filter(Boolean).slice(0, 6) };
}

/** Caminho sem IA: só regras e contas (empate pela margem; vendas do WhatsApp sem registro). */
export function planoSemIA({ cliente = {}, comparacao = null } = {}) {
  const lim = limitesDoCliente(comoAnunciaDe(cliente));
  const regra = { fontes: {}, semFonte: false, regraApp: true, confianca: 'baixa', resultadoEsperado: null, avisos: [] };
  const out = { resumo: 'Plano sem IA: regras e contas do app com os números registrados.', whatsapp: [], site: [], ondeVerba: null, conflitos: [], semIA: true };
  if (!comparacao) return out;
  const w = comparacao.whatsapp, s = comparacao.site;
  if (w.registros && !w.temVendas) out.whatsapp.push({ id: 'whatsapp_1', area: 'whatsapp', prioridade: 1, numero: `${w.conversas ?? 0} conversa(s) a R$ ${fmt(w.custoConversa)} cada, sem vendas anotadas.`, mudar: 'Anotar as vendas fechadas na conversa (e o valor) para cada período.', tipo: 'registro', medir: 'Custo por venda do WhatsApp no próximo período.', passoSite: null, porque: 'O Meta não vê venda fechada no chat: sem esse registro não dá para saber se o WhatsApp dá lucro.', ...regra });
  for (const [area, a] of [['whatsapp', w], ['site', s]]) {
    if (!lim.ok || a.custoVenda == null) continue;
    const l = out[area];
    if (a.custoVenda > lim.custoVendaEmpate) l.push({ id: `${area}_${l.length + 1}`, area, prioridade: l.length + 1, numero: `Custo por venda R$ ${fmt(a.custoVenda)}, acima do empate (R$ ${fmt(lim.custoVendaEmpate)}).`, mudar: 'Pausar o que está acima do empate e testar outro criativo/ângulo.', tipo: 'criativo', medir: 'Custo por venda abaixo do empate no próximo período.', passoSite: null, porque: 'Acima do empate cada venda dá prejuízo (conta com ticket e margem do cliente).', ...regra });
    else if (a.custoVenda <= lim.custoVendaEscalar) l.push({ id: `${area}_${l.length + 1}`, area, prioridade: l.length + 1, numero: `Custo por venda R$ ${fmt(a.custoVenda)}, com folga sobre o empate (R$ ${fmt(lim.custoVendaEmpate)}).`, mudar: 'Aumentar a verba aos poucos, um passo por vez.', tipo: 'orcamento', medir: 'Custo por venda continua abaixo de R$ ' + fmt(lim.custoVendaEscalar) + ' depois do aumento.', passoSite: null, porque: 'Com folga de 30% sobre o empate, há espaço para escalar.', ...regra });
  }
  if (comparacao.ondeVerba) out.ondeVerba = { destino: comparacao.ondeVerba.destino, porque: comparacao.ondeVerba.motivo, ...regra };
  return out;
}

/** Ações aceitas -> tarefas (área de campanhas; as de site também aparecem no "Montar site", passo 4 ou 6). */
export function acoesParaTarefas(plano = {}, aceitos = [], { clienteId = null, analiseId = null } = {}) {
  const ok = new Set(aceitos);
  return [...(plano.whatsapp || []), ...(plano.site || [])].filter((a) => ok.has(a.id)).map((a) => ({
    clienteId, analiseId, origem: 'otimizacao', tipo: 'otimizacao', area: a.area, passoSite: a.area === 'site' ? a.passoSite || null : null, status: 'aberta',
    titulo: a.mudar, texto: a.numero, medir: a.medir, tipoMudanca: a.tipo,
  }));
}

/** Rótulo de um item sem fonte. */
export const rotuloSemFonte = (it) => (it.regraApp ? 'regra do app (sem IA)' : it.semFonte ? SEM_FONTE : '');
