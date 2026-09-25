// Aba Campanhas: estrutura de teste (IA ou manual) que nasce como RASCUNHO (diagrama + raciocínio + chat com a IA)
// e só vira campanha oficial ao confirmar; depois: criativos vinculados, alerta de fadiga e checklist p/ o Meta.
import { db, COL } from '../core/storage.js';
import { gerarEstruturaCampanha, discutirEstruturaCampanha } from '../core/ia.js';
import { obterConfig } from './configuracoes.js';
import { definirStatus } from './criativos.js';
import { padroesLocais, padroesPorNicho } from './insights.js';
import { STATUS_CAMPANHA, FORMATOS } from '../lib/constantes.js';
import { tipoDaPeca, previaAtual } from '../lib/previa.js';
import { perguntarBuscaMercado } from './busca-mercado.js';
import {
  esc, $, on, montar, cabecalho, iaNota, vazio, tag, dataBR, diasDesde, moeda, toast, modal, ocupado, lerForm, opcoes, copiar,
  listaDeLinhas, num, confirmar,
} from '../core/ui.js';

const COR_STATUS = { rascunho: 'tag-warn', planejada: '', ativa: 'tag-ok', pausada: 'tag-warn', encerrada: 'tag-bad' };
const nomeStatus = (v) => (v === 'rascunho' ? 'Rascunho' : (STATUS_CAMPANHA.find(([k]) => k === v) || [, v])[1]);
const APROVADOS = ['aprovado', 'em_uso', 'pausado'];
/** Rascunho não conta como campanha (checklist de lançamento, alertas): só existe depois de confirmado. */
export const ehRascunho = (c) => c?.status === 'rascunho';

/** URL de destino com parâmetros UTM básicos (fonte/campanha), só para o checklist — a pessoa pode ajustar na hora. */
function urlComUtm(url, nomeCampanha) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'meta'); u.searchParams.set('utm_medium', 'paid'); u.searchParams.set('utm_campaign', nomeCampanha || '');
    return u.toString();
  } catch { return url; } // URL sem protocolo válido: devolve como veio, sem travar o checklist
}

/** Checklist padrão (usado no modo manual e como complemento quando a IA não traz um). */
export function checklistPadrao(c, cliente, criativos = []) {
  const e = c.estruturaTeste || {};
  const pubs = (c.publicos || []).map((p) => p.nome).join(', ') || 'a definir';
  const destino = urlComUtm(c.urlDestino, c.nome);
  const nomeDe = (id) => criativos.find((x) => x.id === id)?.nome || null;
  // Com diagrama (conjuntos): um passo por conjunto, com público, orçamento e criativos de cada um.
  const passosConjuntos = (c.conjuntos || []).map((k, i) => {
    const crs = (k.criativos || []).map((s) => nomeDe(s.criativoId) || s.criativoNome).filter(Boolean);
    return `Conjunto ${i + 1} "${k.nome}": público ${k.publico?.nome || 'a definir'}${k.orcamentoDiario ? `, orçamento R$ ${k.orcamentoDiario}/dia` : ''}; anúncios: ${crs.length ? crs.join(', ') : 'nenhum criativo definido ainda'}.`;
  });
  return [
    `Criar campanha "${c.nome}" com objetivo ${c.objetivo || 'Vendas'} (${cliente.estagio === 'novo' ? 'teste inicial' : 'otimização/escala'}).`,
    `Definir orçamento diário total: ${c.orcamentoDiario ? 'R$ ' + c.orcamentoDiario : 'a definir'}${c.orcamentoNota ? ' — ' + c.orcamentoNota : ''}.`,
    ...(passosConjuntos.length ? passosConjuntos : [
      `Criar ${e.conjuntos || 'os conjuntos de anúncios'} com os públicos: ${pubs}.`,
      `Subir os criativos aprovados (${(c.criativos || []).length}) ${e.criativosPorConjunto ? '— ' + e.criativosPorConjunto : 'em conjuntos separados para testar cada ângulo'}.`,
    ]),
    destino ? `Conferir pixel/evento de conversão. URL de destino (já com UTM): ${destino}` : 'Conferir pixel/evento de conversão e URL de destino com parâmetros UTM (nenhum site publicado ainda para sugerir o link).',
    `Deixar rodar ${e.duracaoDias || 3}+ dias antes de mexer${e.criterioDecisao ? '. Critério: ' + e.criterioDecisao : ''}.`,
    'Marcar cada criativo como "em uso" aqui no app para acompanhar a fadiga.',
  ];
}
const checklistFinal = (c, cliente, criativos) => (c.checklistMeta?.length ? c.checklistMeta : checklistPadrao(c, cliente, criativos));
const textoChecklist = (c, cliente, criativos) => `CHECKLIST — ${c.nome}\n` + checklistFinal(c, cliente, criativos).map((t, i) => `${i + 1}. ${t}`).join('\n');

/** Site publicado do cliente, se houver: custom (link salvo) ou pacote de plataforma (plataforma configurada + link salvo). */
export function siteDestino(sites) {
  const site = sites.find((s) => s.linkPublicado);
  return site ? { url: site.linkPublicado, modo: site.modo } : null;
}

/**
 * Estrutura da IA (normalizarCampanha) -> campos da campanha. Defesa: só aceita criativos que existem entre os
 * aprovados (a IA não pode inventar um id); o nome vem do app, não da IA.
 */
export function camposDaEstrutura(e, aprovados, orcamentoInformado = null) {
  const valido = (id) => aprovados.find((a) => a.id === id);
  const conjuntos = (e.conjuntos || []).map((k) => ({
    ...k, criativos: (k.criativos || []).filter((s) => valido(s.criativoId)).map((s) => ({ ...s, criativoNome: valido(s.criativoId).nome })),
  }));
  const selecao = (e.selecaoCriativos || []).filter((s) => valido(s.criativoId));
  const avisoCriativos = e.avisoCriativos || (!aprovados.length ? 'Nenhum criativo aprovado ainda — produza e aprove criativos antes de vincular à campanha.' : null);
  return {
    resumo: e.resumo || '', publicos: e.publicos || [], conjuntos, estruturaTeste: e.estruturaTeste || {}, raciocinio: e.raciocinio || null,
    orcamentoDiario: num(e.orcamento?.diario) ?? orcamentoInformado, orcamentoNota: e.orcamento?.distribuicao || '', checklistMeta: e.checklistMeta || [],
    criativos: selecao.map((s) => ({ id: s.criativoId, inicio: null })), selecaoCriativos: selecao, avisoCriativos,
  };
}

/** Modo manual: um conjunto por público, orçamento dividido igualmente e os criativos marcados em todos os conjuntos. */
export function conjuntosManuais(publicos, orcamentoDiario, criativosIds = []) {
  const pubs = publicos.length ? publicos : [{ nome: 'Público a definir', descricao: '' }];
  const parte = orcamentoDiario ? Math.round((orcamentoDiario / pubs.length) * 100) / 100 : null;
  return pubs.map((p, i) => ({
    nome: `Conjunto ${i + 1}`, publico: { nome: p.nome, descricao: p.descricao || '', tipo: '' }, orcamentoDiario: parte, objetivo: '',
    criativos: criativosIds.map((id) => ({ criativoId: id, criativoNome: '', motivo: '' })),
  }));
}

/** Soma os resultados por criativo (gasto, compras, ROAS) — dado bruto para a IA citar mesmo quando ainda não há padrão. */
export function resultadosPorCriativo(resultados, criativos) {
  const porId = {};
  for (const r of resultados) {
    if (!r.criativoId) continue;
    // ROAS e CPA médios ponderados pelo gasto (mesma regra do motor de Insights); registro sem o número não entra na média.
    const g = (porId[r.criativoId] ||= { nome: criativos.find((c) => c.id === r.criativoId)?.nome || 'criativo apagado', registros: 0, gasto: 0, pRoas: 0, gRoas: 0, pCpa: 0, gCpa: 0 });
    const gasto = Number(r.gasto) || 0;
    g.registros++; g.gasto += gasto;
    if (r.roas != null && gasto) { g.pRoas += Number(r.roas) * gasto; g.gRoas += gasto; }
    if (r.cpa != null && gasto) { g.pCpa += Number(r.cpa) * gasto; g.gCpa += gasto; }
  }
  return Object.values(porId).map((g) => ({ nome: g.nome, registros: g.registros, gasto: g.gasto, roas: g.gRoas ? g.pRoas / g.gRoas : null, cpa: g.gCpa ? g.pCpa / g.gCpa : null }));
}

// ---------- diagrama e raciocínio (HTML) ----------
/** Miniatura do criativo: prévia/arquivo de imagem se houver; senão um ícone pelo formato. */
function miniatura(cr) {
  const img = cr && ((previaAtual(cr) && cr.previaTipo === 'imagem' && cr.previaUrl) || (tipoDaPeca(cr.arquivoNome) === 'imagem' && cr.arquivoUrl));
  if (img) return `<img src="${esc(img)}" alt="" class="h-10 w-10 flex-none rounded object-cover" loading="lazy">`;
  const icone = cr?.formato === 'imagem' ? 'image' : cr?.formato === 'carrossel' ? 'images' : cr?.formato === 'texto' ? 'align-left' : 'film';
  return `<span class="flex h-10 w-10 flex-none items-center justify-center rounded bg-slate-100 text-slate-400"><i class="fa-solid fa-${icone}"></i></span>`;
}

/** Diagrama campanha -> conjuntos -> criativos (cards + conectores em CSS, ver .arvore em style.css). */
export function diagramaHtml(c, criativos) {
  const doCli = (id) => criativos.find((x) => x.id === id);
  const naCampanha = new Set((c.criativos || []).map((k) => k.id));
  const conjuntos = c.conjuntos || [];
  const soma = conjuntos.reduce((s, k) => s + (k.orcamentoDiario || 0), 0);
  const noConjunto = new Set(conjuntos.flatMap((k) => (k.criativos || []).map((s) => s.criativoId)));
  const soltos = [...naCampanha].filter((id) => !noConjunto.has(id)).map(doCli).filter(Boolean);
  const crHtml = (s) => {
    const cr = doCli(s.criativoId);
    if (!cr && !s.criativoNome) return '';
    return `<div class="arvore-criativo rounded-lg border border-slate-200 bg-white p-2 text-xs">
      <div class="flex gap-2">${miniatura(cr)}<div class="min-w-0"><p class="truncate font-semibold text-slate-800" title="${esc(cr?.nome || s.criativoNome)}">${esc(cr?.nome || s.criativoNome)}</p>
        <p class="text-slate-500">${esc([cr?.angulo, cr?.framework].filter(Boolean).join(' · ') || (FORMATOS.find(([k]) => k === cr?.formato)?.[1] || 'sem ângulo definido'))}</p></div></div>
      ${s.motivo ? `<p class="mt-1 border-t border-slate-100 pt-1 text-slate-600"><i class="fa-solid fa-chart-simple text-violet-800"></i> ${esc(s.motivo)}</p>` : ''}</div>`;
  };
  return `<div class="arvore" aria-label="Diagrama da estrutura da campanha">
    <div class="flex justify-center"><div class="arvore-topo rounded-xl border-2 border-indigo-400 bg-white px-4 py-2 text-center">
      <p class="text-xs uppercase tracking-wide text-slate-500">Campanha</p><p class="font-semibold">${esc(c.nome)}</p>
      <p class="text-xs text-slate-600">${esc(c.objetivo || 'Vendas')} · ${moeda(c.orcamentoDiario)}/dia${c.estruturaTeste?.duracaoDias ? ` · ${esc(c.estruturaTeste.duracaoDias)} dias de teste` : ''}</p></div></div>
    ${conjuntos.length ? `<div class="arvore-ramos">${conjuntos.map((k, i) => `<div class="arvore-ramo">
      <div class="rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm">
        <p class="text-xs uppercase tracking-wide text-slate-500">Conjunto ${i + 1}</p><p class="font-semibold">${esc(k.nome)}</p>
        <p class="mt-1"><i class="fa-solid fa-users text-slate-400"></i> ${esc(k.publico?.nome || 'público a definir')}</p>
        ${k.publico?.descricao ? `<p class="text-xs text-slate-500">${esc(k.publico.descricao)}</p>` : ''}
        <p class="mt-1"><i class="fa-solid fa-coins text-slate-400"></i> ${k.orcamentoDiario ? moeda(k.orcamentoDiario) + '/dia' : 'orçamento a definir'}${k.orcamentoDiario && soma ? ` <span class="text-xs text-slate-500">(${Math.round((k.orcamentoDiario / soma) * 100)}%)</span>` : ''}${k.orcamentoEstimado ? ' <span class="text-xs text-slate-500">(dividido igualmente)</span>' : ''}</p>
        ${k.objetivo ? `<p class="mt-1 text-xs text-slate-600"><i class="fa-solid fa-bullseye text-slate-400"></i> ${esc(k.objetivo)}</p>` : ''}</div>
      <div class="arvore-folhas">${(k.criativos || []).length ? k.criativos.map(crHtml).join('') : '<p class="arvore-criativo rounded-lg border border-dashed border-amber-300 p-2 text-xs text-amber-800">Nenhum criativo aprovado atribuído.</p>'}</div>
    </div>`).join('')}</div>`
    : '<p class="hint mt-3 text-center">Estrutura sem conjuntos definidos (campanha criada antes do diagrama). Os públicos e criativos estão listados abaixo.</p>'}
    ${soltos.length ? `<p class="hint mt-3"><i class="fa-solid fa-circle-info"></i> Criativos adicionados depois, ainda sem conjunto no diagrama: ${soltos.map((x) => esc(x.nome)).join(', ')}.</p>` : ''}
  </div>`;
}

const BASE_TXT = { historico_cliente: ['histórico deste cliente', 'tag-ok'], nicho: ['padrão do nicho', 'tag-info'], referencia: ['referência de mercado', 'tag-info'], sem_dados: ['sem dados suficientes', 'tag-warn'] };

/** Seção "Por que essa estrutura" (só estruturas da IA). `aberta` = começa expandida (no rascunho sempre). */
export function raciocinioHtml(c, aberta = true) {
  const r = c.raciocinio;
  if (!r) return '';
  const f = c.fontesDados;
  const item = (letra, titulo, corpo) => (corpo ? `<div><p class="font-semibold">${letra}) ${titulo}</p><div class="text-slate-700">${corpo}</div></div>` : '');
  return `<details class="rounded-lg border border-violet-200 bg-white p-3" ${aberta ? 'open' : ''} data-raciocinio>
    <summary class="cursor-pointer text-sm font-semibold text-violet-800"><i class="fa-solid fa-lightbulb"></i> Por que essa estrutura</summary>
    <div class="mt-2 space-y-3 text-sm">
      ${f ? `<p class="rounded bg-slate-50 p-2 text-xs text-slate-600"><b>Dados que a IA tinha em mãos</b> (contados pelo app, não pela IA): ${f.resultados} resultado(s) registrado(s) deste cliente · ${f.nicho ? 'padrões de clientes do mesmo nicho disponíveis' : 'nenhum padrão de outros clientes do nicho'} · ${f.referencias} referência(s) de mercado de sinal forte.</p>` : ''}
      ${item('a', 'Quantidade de conjuntos', esc(r.quantidadeConjuntos))}
      ${item('b', 'Por que cada público', (r.publicos || []).length ? `<ul class="space-y-1">${r.publicos.map((p) => `<li><b>${esc(p.conjunto)}</b>: ${esc(p.porque)} ${tag('base: ' + BASE_TXT[p.base][0], BASE_TXT[p.base][1])}</li>`).join('')}</ul>` : '')}
      ${item('c', 'Divisão do orçamento', esc(r.divisaoOrcamento))}
      ${item('d', 'O que esta estrutura tenta provar', esc(r.objetivoEstrutura))}
      ${(r.dadosInsuficientes || []).length ? item('e', 'Onde faltou dado', `<ul class="list-disc pl-5 text-amber-800">${r.dadosInsuficientes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`)
        : '<p class="text-xs text-slate-500">e) A IA não apontou decisão tomada sem dado.</p>'}
    </div></details>`;
}

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [campanhas, criativos, sites, referencias, resultados, cfg] = await Promise.all([
    db.listar(COL.campanhas, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }),
    db.listar(COL.sites, { clienteId: cliente.id }), db.listar(COL.referencias, { clienteId: cliente.id }),
    db.listar(COL.resultados, { clienteId: cliente.id }), obterConfig(),
  ]);
  const destino = siteDestino(sites);
  const fadigados = criativos.filter((c) => c.status === 'em_uso' && (diasDesde(c.emUsoDesde) ?? 0) >= cfg.diasFadiga);
  const referenciasFortes = referencias.filter((r) => r.sinal === 'forte');
  const locais = padroesLocais(resultados);
  const aprovados = criativos.filter((c) => APROVADOS.includes(c.status));
  // Contexto que a IA recebe (na geração e no chat do rascunho); o nicho é buscado só quando precisa.
  const ctx = { cliente, criativos, aprovados, locais, referenciasFortes, qtdResultados: resultados.length, porCriativo: resultadosPorCriativo(resultados, criativos), cfg, recarregar };
  const rascunhos = campanhas.filter(ehRascunho);
  const oficiais = campanhas.filter((c) => !ehRascunho(c));

  const card = (c) => `<button data-abrir="${c.id}" class="card text-left transition hover:border-indigo-400 hover:shadow-md">
      <div class="flex items-start justify-between gap-2"><h3 class="font-semibold">${esc(c.nome)}</h3>${tag(nomeStatus(c.status), COR_STATUS[c.status])}</div>
      <p class="caption mt-1">${esc(c.resumo || c.objetivo || '')}</p>
      <div class="mt-3 flex flex-wrap gap-1">${tag(moeda(c.orcamentoDiario) + '/dia')}${(c.conjuntos || []).length ? tag(c.conjuntos.length + ' conjunto(s)') : ''}${tag((c.criativos || []).length + ' criativos')}${(c.publicos || []).slice(0, 2).map((p) => tag(p.nome, 'tag-info')).join('')}${c.origem === 'ia' ? tag('estrutura por IA', 'tag-info') : ''}</div>
      <p class="hint mt-2">${dataBR(c.criadoEm)}</p></button>`;

  root.innerHTML = `${cabecalho('Campanhas', 'Estrutura de teste, públicos e orçamento — pronta para replicar no Gerenciador de Anúncios do Meta.',
    '<button class="btn-primary" data-nova title="Cria uma estrutura nova (com IA ou manual). Ela nasce como rascunho até você confirmar."><i class="fa-solid fa-plus"></i> Nova campanha</button>')}
    ${fadigados.length ? `<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i>
      <b>Alerta de fadiga:</b> ${fadigados.map((c) => `“${esc(c.nome)}” (${diasDesde(c.emUsoDesde)} dias no ar)`).join('; ')} — passou de ${cfg.diasFadiga} dias. Fadiga = o público já viu demais o anúncio e o resultado costuma cair: troque ou renove o criativo.</div>` : ''}
    ${rascunhos.length ? `<div class="mb-5"><h3 class="mb-1 text-sm font-semibold">Rascunhos (ainda não confirmados)</h3>
      <p class="hint mb-2">Estruturas em discussão. Não contam como campanha até você abrir e clicar em "Confirmar estrutura".</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${rascunhos.map(card).join('')}</div></div>` : ''}
    ${oficiais.length ? `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${oficiais.map(card).join('')}</div>`
      : rascunhos.length ? '' : vazio('bullseye', 'Nenhuma campanha ainda', 'Crie a primeira: a estrutura sai pronta com públicos, orçamento e plano de teste.')}`;

  // ---------- nova campanha ----------
  on(root, 'click', '[data-nova]', () => {
    const m = modal('Nova campanha', `<form id="fn" class="space-y-3">
      <p class="caption">${cliente.estagio === 'novo' ? 'Cliente novo: a estrutura será de primeiro teste.' : 'Cliente rodando: a estrutura considera o histórico dele.'}</p>
      <div><label class="label">Nome *</label><input class="input" name="nome" placeholder="Ex.: Teste de ângulos — Legging"></div>
      <div class="grid gap-3 sm:grid-cols-2"><div><label class="label">Objetivo</label><input class="input" name="objetivo" value="Vendas"></div>
        <div><label class="label">Orçamento diário (R$)</label><input class="input" type="number" step="0.01" name="orcamento" value="${esc(cliente.historico?.orcamentoDiario)}"></div></div>
      <div><label class="label">URL de destino</label><input class="input" name="urlDestino" value="${esc(destino?.url || '')}" placeholder="https://…">
        ${destino ? `<p class="hint">Preenchido com o site publicado deste cliente (${destino.modo === 'custom' ? 'site personalizado' : 'pacote de plataforma'}). Ajuste se quiser apontar para outra página.</p>`
          : `<p class="hint text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i> Nenhum site publicado ainda para este cliente — preencha manualmente ou publique um link na aba Site/Loja.</p>`}</div>
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Estrutura manual (usada no botão "sem IA")</summary>
        <div class="mt-3 space-y-3"><div><label class="label">Públicos (um por linha — cada um vira um conjunto)</label><textarea class="input" rows="3" name="publicos" placeholder="Interesse fitness feminino&#10;Lookalike 1% compradores"></textarea></div>
          <div class="grid gap-3 sm:grid-cols-2"><div><label class="label">Conjuntos de anúncios</label><input class="input" name="conjuntos" placeholder="Ex.: 3 conjuntos, 1 por público"></div>
            <div><label class="label">Duração do teste (dias)</label><input class="input" type="number" name="duracao" value="3"></div></div>
          <div><label class="label">Critério de decisão</label><input class="input" name="criterio" placeholder="Ex.: pausar quem gastar 2x o CPA alvo sem venda"></div></div>
          <div><label class="label">Criativos aprovados a vincular (entram em todos os conjuntos)</label>
            ${aprovados.length ? `<div class="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">${aprovados.map((c) => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="cr_${c.id}"> ${esc(c.nome)} ${c.angulo ? `<span class="hint">(${esc(c.angulo)})</span>` : ''}</label>`).join('')}</div>`
              : '<p class="hint">Nenhum criativo aprovado ainda.</p>'}</div></details>
      <p class="caption"><b>Com IA:</b> monta os conjuntos (público, orçamento e objetivo de cada um), escolhe quais criativos aprovados vão em cada conjunto e explica o porquê de cada decisão. <b>Sem IA:</b> usa o que você preencher em "Estrutura manual" acima. Nos dois casos a estrutura abre como <b>rascunho</b>, com o diagrama: nada vira campanha até você clicar em "Confirmar estrutura".</p>
      <div class="flex flex-wrap gap-2"><button class="btn-ia" type="submit" data-modo="ia"><i class="fa-solid fa-wand-magic-sparkles"></i> Montar rascunho com IA</button>
        <button class="btn-ghost" type="submit" data-modo="manual">Montar rascunho com a estrutura manual</button></div></form>`);
    on(m.el, 'submit', '#fn', async (f, ev) => {
      ev.preventDefault();
      const btn = ev.submitter; const v = lerForm(f);
      if (!v.nome) return toast('Dê um nome à campanha.', 'erro');
      await ocupado(btn, async () => {
        const base = { clienteId: cliente.id, nome: v.nome, objetivo: v.objetivo, orcamentoDiario: num(v.orcamento), urlDestino: v.urlDestino || null, status: 'rascunho', criativos: [] };
        let nova;
        if (btn.dataset.modo === 'ia') {
          const nicho = await padroesPorNicho(cliente.nicho, cliente.id).catch(() => ({ padroes: null }));
          ctx.nicho = nicho.padroes;
          const e = await gerarEstruturaCampanha({
            cliente, criativos: aprovados, criativosAprovados: aprovados, objetivo: v.objetivo, orcamentoDiario: v.orcamento,
            padroesLocais: locais, padroesNicho: nicho.padroes, referenciasFortes, qtdResultados: resultados.length, resultadosPorCriativo: ctx.porCriativo,
          });
          nova = await db.criar(COL.campanhas, {
            ...base, origem: 'ia', ...camposDaEstrutura(e, aprovados, base.orcamentoDiario), versaoRascunho: 1, discussao: [],
            fontesDados: { resultados: resultados.length, nicho: Boolean(nicho.padroes && Object.values(nicho.padroes).some((l) => l?.length)), referencias: referenciasFortes.length },
          });
          toast('Rascunho montado pela IA. Leia o porquê, discuta se quiser e confirme quando estiver bom.');
        } else {
          const selecionados = aprovados.filter((c) => f.elements['cr_' + c.id]?.checked);
          const publicos = listaDeLinhas(v.publicos).map((nome) => ({ nome, descricao: '' }));
          nova = await db.criar(COL.campanhas, {
            ...base, origem: 'manual', resumo: '', publicos, conjuntos: conjuntosManuais(publicos, base.orcamentoDiario, selecionados.map((c) => c.id)),
            estruturaTeste: { conjuntos: v.conjuntos, duracaoDias: num(v.duracao), criterioDecisao: v.criterio }, checklistMeta: [],
            criativos: selecionados.map((c) => ({ id: c.id, inicio: null })),
          });
          toast('Rascunho criado. Confira o diagrama e confirme.');
        }
        m.fechar(); recarregar();
        if (nova) abrirRascunho(nova, ctx);
        perguntarBuscaMercado(cliente); // 1ª campanha da sessão: oferece buscar novos exemplos de mercado (uma vez)
      });
    });
  });

  on(root, 'click', '[data-abrir]', (b) => {
    const c = campanhas.find((x) => x.id === b.dataset.abrir);
    if (ehRascunho(c)) abrirRascunho(c, ctx); else detalhe(c, cliente, criativos, cfg, recarregar);
  });
});

// ---------- rascunho: diagrama + raciocínio + discussão com a IA, até confirmar ou descartar ----------
function abrirRascunho(c, ctx) {
  const { cliente, criativos, aprovados, cfg, recarregar } = ctx;
  const m = modal(`Rascunho — ${c.nome}`, '<div id="r"></div>', { largo: true });
  const alvo = $('#r', m.el);
  const ia = c.origem === 'ia';

  const desenhar = () => {
    const conversa = c.discussao || [];
    alvo.innerHTML = `
    <div class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"><i class="fa-solid fa-pen-ruler"></i>
      <b>Isto é um rascunho${ia ? ` (versão ${c.versaoRascunho || 1})` : ''}.</b> Ainda não é uma campanha: não aparece nos alertas nem no checklist de lançamento, e nada é publicado em plataforma nenhuma.
      ${ia ? 'Leia o porquê, pergunte ou peça ajustes à IA no chat abaixo.' : 'Confira o diagrama.'} Quando estiver bom, clique em <b>Confirmar estrutura</b> (gera o checklist para o Gerenciador de Anúncios). <b>Descartar rascunho</b> apaga só este rascunho, sem afetar mais nada.</div>
    ${c.resumo ? `<p class="mt-3 text-sm">${esc(c.resumo)}</p>` : ''}
    ${ia ? `<div class="mt-3">${raciocinioHtml(c, true)}</div>` : ''}
    ${c.avisoCriativos ? `<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(c.avisoCriativos)}</div>` : ''}
    <div class="mt-4"><h4 class="mb-1 text-sm font-semibold">Diagrama da estrutura</h4>
      <p class="hint mb-2">Campanha no topo, um bloco por conjunto de anúncios (público, orçamento e objetivo) e, embaixo de cada um, os criativos que vão nele${ia ? ', com o motivo da escolha' : ''}.</p>
      ${diagramaHtml(c, criativos)}</div>
    ${ia ? `<div class="mt-5 rounded-lg border border-violet-200 p-3"><h4 class="mb-1 text-sm font-semibold text-violet-800"><i class="fa-solid fa-comments"></i> Discutir esta estrutura com a IA</h4>
      <p class="hint mb-2">Pergunte ou peça ajuste em linguagem natural. Ex.: “por que esse formato em vez de vídeo?”, “troca esse criativo por outro”, “quero testar um público mais amplo no conjunto 2”, “isso vale a pena pra esse orçamento?”. A IA diz se só explicou (nada muda) ou se propôs uma nova versão (o diagrama e o porquê acima são atualizados).</p>
      <div data-chat class="mb-2 max-h-80 space-y-2 overflow-y-auto text-sm">${conversa.map((t) => t.role === 'user'
        ? `<p class="text-slate-600"><b>Você:</b> ${esc(t.content)}</p>`
        : `<div class="rounded-lg bg-slate-50 p-2"><p class="mb-1">${t.tipo === 'ajuste' ? tag(`propôs nova versão (v${t.versao})`, 'tag-ok') : tag('só explicou — nada mudou', 'tag-info')}</p><p class="whitespace-pre-wrap text-slate-800"><b>IA:</b> ${esc(t.content)}</p></div>`).join('')}</div>
      <form id="fdisc" class="flex gap-2" data-aviso-sair><input class="input" name="mensagem" placeholder="Pergunte ou peça um ajuste…" autocomplete="off"><button class="btn-ia btn-sm" type="submit">Enviar à IA</button></form></div>` : ''}
    <div class="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
      <button class="btn-danger btn-sm" data-descartar title="Apaga este rascunho. Nenhuma outra informação é afetada."><i class="fa-solid fa-trash"></i> Descartar rascunho</button>
      <button class="btn-primary" data-confirmar title="Vira campanha oficial (status Planejada) e gera o checklist para o Gerenciador de Anúncios"><i class="fa-solid fa-check"></i> Confirmar estrutura</button></div>`;
    const chat = $('[data-chat]', alvo); if (chat) chat.scrollTop = chat.scrollHeight;
  };
  desenhar();

  on(alvo, 'submit', '#fdisc', async (f, ev) => {
    ev.preventDefault();
    const mensagem = lerForm(f).mensagem;
    if (!mensagem) return;
    await ocupado(f.querySelector('button'), async () => {
      if (ctx.nicho === undefined) ctx.nicho = (await padroesPorNicho(cliente.nicho, cliente.id).catch(() => ({ padroes: null }))).padroes;
      const r = await discutirEstruturaCampanha({
        cliente, campanha: c, mensagem, conversa: (c.discussao || []).map((t) => ({ role: t.role, content: t.content })),
        criativosAprovados: aprovados, padroesLocais: ctx.locais, padroesNicho: ctx.nicho, referenciasFortes: ctx.referenciasFortes, qtdResultados: ctx.qtdResultados, resultadosPorCriativo: ctx.porCriativo,
      });
      const versao = (c.versaoRascunho || 1) + (r.tipo === 'ajuste' ? 1 : 0);
      const discussao = [...(c.discussao || []), { role: 'user', content: mensagem, em: new Date().toISOString() },
        { role: 'assistant', content: r.resposta, tipo: r.tipo, versao, em: new Date().toISOString() }];
      const patch = r.tipo === 'ajuste'
        ? { ...camposDaEstrutura(r.estrutura, aprovados, c.orcamentoDiario), versaoRascunho: versao, discussao }
        : { discussao };
      await db.atualizar(COL.campanhas, c.id, patch);
      Object.assign(c, patch);
      desenhar(); recarregar();
      toast(r.tipo === 'ajuste' ? `A IA propôs a versão ${versao}: diagrama e raciocínio atualizados.` : 'A IA respondeu sem mudar a estrutura.', 'info');
    });
  });
  on(alvo, 'click', '[data-confirmar]', async (b) => {
    await ocupado(b, async () => {
      const patch = { status: 'planejada', confirmadaEm: new Date().toISOString() };
      await db.atualizar(COL.campanhas, c.id, patch); Object.assign(c, patch);
      m.fechar(); recarregar();
      toast('Estrutura confirmada: a campanha foi criada. Siga o checklist para montá-la no Meta.');
      detalhe(c, cliente, criativos, cfg, recarregar);
    });
  });
  on(alvo, 'click', '[data-descartar]', async () => {
    if (!(await confirmar('Descartar este rascunho? Só ele é apagado (criativos, clientes e outras campanhas não são afetados).', 'Descartar'))) return;
    await db.remover(COL.campanhas, c.id); m.fechar(); recarregar(); toast('Rascunho descartado.');
  });
}

// ---------- detalhe ----------
function detalhe(c, cliente, criativos, cfg, recarregar) {
  const m = modal(c.nome, '<div id="d"></div>', { largo: true });
  const alvo = $('#d', m.el);
  const doCli = (id) => criativos.find((x) => x.id === id);

  const desenhar = () => {
    const e = c.estruturaTeste || {};
    const disponiveis = criativos.filter((x) => APROVADOS.includes(x.status) && !(c.criativos || []).some((k) => k.id === x.id));
    alvo.innerHTML = `
    ${c.origem === 'ia' ? iaNota('Estrutura criada pela IA a partir do perfil do cliente, dos padrões do motor de Insights e das referências de sinal forte. Ajuste o que quiser abaixo.') : ''}
    ${c.resumo ? `<p class="mt-2 text-sm">${esc(c.resumo)}</p>` : ''}
    ${c.avisoCriativos ? `<div class="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(c.avisoCriativos)}</div>` : ''}
    ${(c.conjuntos || []).length ? `<div class="mt-3">${raciocinioHtml(c, false)}</div><div class="mt-3">${diagramaHtml(c, criativos)}</div>` : ''}
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div class="card"><h4 class="mb-1 text-sm font-semibold">Públicos</h4>${(c.publicos || []).length ? `<ul class="list-disc pl-5 text-sm">${c.publicos.map((p) => `<li><b>${esc(p.nome)}</b>${p.descricao ? ' — ' + esc(p.descricao) : ''}</li>`).join('')}</ul>` : '<p class="hint">Nenhum público definido.</p>'}</div>
      <div class="card"><h4 class="mb-1 text-sm font-semibold">Orçamento e teste</h4><p class="text-sm">Diário: <b>${moeda(c.orcamentoDiario)}</b></p>
        ${c.orcamentoNota ? `<p class="text-sm">${esc(c.orcamentoNota)}</p>` : ''}
        <p class="text-sm">${e.campanhas ? `Campanhas: ${esc(e.campanhas)} · ` : ''}${e.conjuntos ? `Conjuntos: ${esc(e.conjuntos)}` : ''}</p>
        ${e.duracaoDias ? `<p class="text-sm">Duração: ${esc(e.duracaoDias)} dias</p>` : ''}${e.criterioDecisao ? `<p class="text-sm">Decisão: ${esc(e.criterioDecisao)}</p>` : ''}</div></div>

    <div class="mt-3"><label class="label">URL de destino</label><input class="input" data-url-destino value="${esc(c.urlDestino || '')}" placeholder="https://…">
      <p class="hint">${c.urlDestino ? 'Usada no checklist abaixo, já com parâmetros UTM.' : 'Sem link ainda — publique o site do cliente ou preencha manualmente.'}</p></div>

    <div class="mt-4"><h4 class="mb-1 text-sm font-semibold">Criativos desta campanha</h4>
      <p class="hint mb-2">Quando subir um criativo no Meta, clique em "Marcar em uso": o app anota a data e avisa quando ele passar de ${cfg.diasFadiga} dias no ar (fadiga: o público já viu demais e o resultado costuma cair).</p>
      ${(c.criativos || []).length ? `<div class="space-y-2">${c.criativos.map((k) => {
        const cr = doCli(k.id); if (!cr) return '';
        const dias = cr.status === 'em_uso' ? diasDesde(cr.emUsoDesde) : null; const fadiga = dias != null && dias >= cfg.diasFadiga;
        const motivo = (c.selecaoCriativos || []).find((s) => s.criativoId === cr.id)?.motivo;
        return `<div class="rounded-lg border border-slate-200 p-2 text-sm"><div class="flex flex-wrap items-center justify-between gap-2">
          <span><b>${esc(cr.nome)}</b> ${cr.emUsoDesde ? tag('início ' + dataBR(k.inicio || cr.emUsoDesde), 'tag-ok') : tag('ainda não subiu')} ${fadiga ? tag(`fadiga · ${dias} dias`, 'tag-bad') : ''}</span>
          <span class="flex gap-1">${cr.status !== 'em_uso' ? `<button class="btn-primary btn-sm" data-uso="${cr.id}" title="Registra a data de início e passa a contar a fadiga">Marcar em uso</button>` : `<button class="btn-ghost btn-sm" data-pausar="${cr.id}">Pausar</button>`}
          <button class="btn-danger btn-sm" data-tirar="${cr.id}" title="Remover da campanha"><i class="fa-solid fa-xmark"></i></button></span></div>
          ${motivo ? `<p class="hint mt-1"><i class="fa-solid fa-chart-simple"></i> Escolhido pela IA: ${esc(motivo)}</p>` : ''}</div>`;
      }).join('')}</div>` : '<p class="hint">Nenhum criativo vinculado ainda.</p>'}
      ${disponiveis.length ? `<div class="mt-2 flex gap-2"><select class="input" data-add>${'<option value="">Adicionar criativo aprovado…</option>' + disponiveis.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select></div>`
        : '<p class="hint mt-2">Só criativos aprovados (checklist completo) podem ser vinculados.</p>'}</div>

    <div class="mt-4 card"><div class="mb-2 flex items-center justify-between"><h4 class="text-sm font-semibold">Checklist para o Gerenciador de Anúncios do Meta</h4>
      <button class="btn-primary btn-sm" data-copiar><i class="fa-solid fa-copy"></i> Copiar checklist</button></div>
      <p class="hint mb-2">Passo a passo para criar esta campanha no Gerenciador de Anúncios do Meta (business.facebook.com), igual à estrutura acima. Copie para seguir lá.</p>
      <ol class="list-decimal space-y-1 pl-5 text-sm">${checklistFinal(c, cliente, criativos).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>

    <div class="mt-4 flex flex-wrap items-end justify-between gap-2"><div><label class="label">Status da campanha</label>
      <select class="input" data-status>${opcoes(STATUS_CAMPANHA, c.status)}</select></div>
      <button class="btn-danger btn-sm" data-apagar><i class="fa-solid fa-trash"></i> Apagar campanha</button></div>`;
  };
  desenhar();

  const salvar = async (patch) => { await db.atualizar(COL.campanhas, c.id, patch); Object.assign(c, patch); desenhar(); recarregar(); };

  on(alvo, 'change', '[data-add]', async (s) => { if (s.value) await salvar({ criativos: [...(c.criativos || []), { id: s.value, inicio: null }] }); });
  // Tirar da campanha também tira do diagrama (senão o conjunto continuaria mostrando o criativo).
  on(alvo, 'click', '[data-tirar]', (b) => salvar({
    criativos: c.criativos.filter((k) => k.id !== b.dataset.tirar),
    ...(c.conjuntos ? { conjuntos: c.conjuntos.map((k) => ({ ...k, criativos: (k.criativos || []).filter((s) => s.criativoId !== b.dataset.tirar) })) } : {}),
  }));
  on(alvo, 'click', '[data-uso]', async (b) => {
    const cr = doCli(b.dataset.uso);
    await definirStatus(cr, 'em_uso');
    await salvar({ criativos: c.criativos.map((k) => (k.id === cr.id ? { ...k, inicio: cr.emUsoDesde } : k)) });
    toast('Marcado em uso. A data de início foi registrada.');
  });
  on(alvo, 'click', '[data-pausar]', async (b) => { await definirStatus(doCli(b.dataset.pausar), 'pausado'); desenhar(); recarregar(); });
  on(alvo, 'click', '[data-copiar]', () => copiar(textoChecklist(c, cliente, criativos)));
  on(alvo, 'change', '[data-url-destino]', (i) => salvar({ urlDestino: i.value.trim() || null }));
  on(alvo, 'change', '[data-status]', (s) => salvar({ status: s.value }));
  on(alvo, 'click', '[data-apagar]', async () => {
    if (!(await confirmar('Apagar esta campanha?', 'Apagar'))) return;
    await db.remover(COL.campanhas, c.id); m.fechar(); recarregar(); toast('Campanha apagada.');
  });
}
