// Alertas e indicadores por cliente: semáforo, "hora de escalar", fadiga e progresso de lançamento.
// Usado no dashboard (central de alertas + cards) e na tela do cliente.
import { semaforo, horaDeEscalar, checklistLancamento } from '../lib/metricas.js';
import { esc, diasDesde, moeda } from '../core/ui.js';
import { usd } from './custo.js';

const PONTO = { verde: 'bg-emerald-500', amarelo: 'bg-amber-400', vermelho: 'bg-rose-500', sem_meta: 'bg-slate-300', sem_dados: 'bg-slate-300' };
const ROTULO = { verde: 'No alvo', amarelo: 'Atenção', vermelho: 'Fora da meta', sem_meta: 'Sem meta', sem_dados: 'Sem resultados' };
const n2 = (v) => Number(v).toFixed(2).replace('.', ',');

/** Reúne os dados do cliente e calcula tudo de uma vez. `d` = { criativos, resultados, campanhas, sites } de todos os clientes. */
export function resumoCliente(c, d, cfg) {
  const crs = d.criativos.filter((x) => x.clienteId === c.id);
  const rs = d.resultados.filter((x) => x.clienteId === c.id);
  const cps = d.campanhas.filter((x) => x.clienteId === c.id);
  const site = d.sites.find((x) => x.clienteId === c.id) || null;
  return {
    sem: semaforo(rs, c.metas, cfg),
    escalar: horaDeEscalar(rs, crs, c.metas, cfg),
    fadiga: crs.filter((x) => x.status === 'em_uso' && (diasDesde(x.emUsoDesde) ?? 0) >= cfg.diasFadiga)
      .map((x) => ({ criativoId: x.id, nome: x.nome, dias: diasDesde(x.emUsoDesde) })),
    // Enviado ao cliente (link de aprovação) e sem resposta há muito tempo: o gargalo está do lado do cliente.
    aprovacaoPendente: crs.filter((x) => x.status === 'pronto_aprovacao' && (diasDesde(x.aprovacaoEnviadaEm) ?? 0) >= (cfg.diasAprovacaoPendente ?? 5))
      .map((x) => ({ criativoId: x.id, nome: x.nome, dias: diasDesde(x.aprovacaoEnviadaEm) })),
    // Ainda em rascunho (nunca enviado, nem aprovado nem rejeitado) há muito tempo: o gargalo está do lado de cá.
    semDecisao: crs.filter((x) => x.status === 'rascunho' && (diasDesde(x.criadoEm) ?? 0) >= (cfg.diasCriativoSemDecisao ?? 10))
      .map((x) => ({ criativoId: x.id, nome: x.nome, dias: diasDesde(x.criadoEm) })),
    lancamento: checklistLancamento({ cliente: c, criativos: crs, campanhas: cps, site }),
  };
}

function detalheSemaforo(sem, metas) {
  if (sem.estado === 'sem_meta') return 'Defina uma meta de CPA e/ou ROAS ao editar o cliente para ativar o semáforo.';
  if (sem.estado === 'sem_dados') return 'Registre resultados na aba Resultados para comparar com a meta.';
  const p = [];
  if (Number(metas?.cpa) > 0 && sem.cpa != null) p.push(`CPA ${moeda(sem.cpa)} (meta ${moeda(metas.cpa)})`);
  if (Number(metas?.roas) > 0 && sem.roas != null) p.push(`ROAS ${n2(sem.roas)}x (meta ${n2(metas.roas)}x)`);
  return `Últimos ${sem.dias} dias: ${p.join(' · ')}. Verde = na meta; amarelo = até 20% pior; vermelho = mais que isso.`;
}

export function semaforoHtml(sem, metas) {
  return `<span class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600" title="${esc(detalheSemaforo(sem, metas))}" data-semaforo="${sem.estado}">
    <span class="h-2.5 w-2.5 rounded-full ${PONTO[sem.estado]}"></span>${ROTULO[sem.estado]}</span>`;
}

/** Junta os alertas de todos os clientes. itens = [{ cliente, resumo }]. `insights` = saída de sugestoesDashboard. */
export function agregar(itens, orcamento = [], insights = []) {
  const out = { fadiga: [], escalar: [], vermelhos: [], orcamento, aprovacaoPendente: [], semDecisao: [], insights };
  for (const { cliente, resumo } of itens) {
    resumo.fadiga.forEach((f) => out.fadiga.push({ cliente, ...f }));
    resumo.escalar.forEach((e) => out.escalar.push({ cliente, ...e }));
    resumo.aprovacaoPendente.forEach((a) => out.aprovacaoPendente.push({ cliente, ...a }));
    resumo.semDecisao.forEach((s) => out.semDecisao.push({ cliente, ...s }));
    if (resumo.sem.estado === 'vermelho') out.vermelhos.push({ cliente, sem: resumo.sem });
  }
  return out;
}

/** Painel único do dashboard: "o que precisa de atenção hoje" entre todos os clientes. */
export function painelAlertas(a) {
  const insights = a.insights || [];
  const total = a.fadiga.length + a.escalar.length + a.vermelhos.length + (a.orcamento || []).length + a.aprovacaoPendente.length + a.semDecisao.length + insights.length;
  const linha = (cor, icone, html, href) => `<li><a href="${href}" class="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100"><i class="fa-solid fa-${icone} mt-0.5 ${cor}"></i><span>${html}</span></a></li>`;
  const bloco = (titulo, legenda, itens) => (itens.length ? `<div><h4 class="text-sm font-semibold">${titulo} <span class="tag">${itens.length}</span></h4><p class="hint mb-1">${legenda}</p><ul>${itens.join('')}</ul></div>` : '');
  return `<section class="card mb-6" id="central-alertas" aria-label="Central de alertas">
    <div class="mb-2 flex items-center justify-between"><h3 class="font-semibold"><i class="fa-solid fa-bell mr-1 text-slate-400"></i>Central de alertas</h3>
      ${total ? `<span class="tag tag-bad">${total} alerta(s)</span>` : '<span class="tag tag-ok">tudo em ordem</span>'}</div>
    <p class="caption mb-3">Tudo o que precisa de atenção em todos os clientes, sem entrar em cada um.</p>
    ${total ? `<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      ${bloco('Clientes no vermelho', 'Resultados recentes piores que a meta em mais de 20%. Clique para ver os resultados.', a.vermelhos.map((v) => linha('text-rose-500', 'circle-exclamation', `<b>${esc(v.cliente.nome)}</b> está fora da meta`, `#/c/${v.cliente.id}/resultados`)))}
      ${bloco('Hora de escalar', 'Criativos batendo a meta de forma consistente.', a.escalar.map((e) => linha('text-emerald-500', 'arrow-trend-up', `<b>${esc(e.cliente.nome)}</b> · “${esc(e.nome)}” está na meta há ${e.dias} dias. Considere aumentar o orçamento ou duplicar o conjunto.`, `#/c/${e.cliente.id}/resultados`)))}
      ${bloco('Padrão comprovado ainda não testado', 'Ângulo/framework com bom desempenho em clientes de nicho semelhante (Insights) — este cliente ainda não usou. Clique para criar um criativo com ele.', insights.map((s) => linha('text-violet-500', 'chart-simple', `<b>${esc(s.cliente.nome)}</b> · ${esc(s.rotulo)} “${esc(s.grupo.valor)}” (ROAS médio ${s.grupo.roasMedio?.toFixed(2) ?? 'n/d'}x, ${s.grupo.amostras} amostra(s))`, `#/c/${s.cliente.id}/criativos`)))}
      ${bloco('Aguardando o cliente', 'Enviado para aprovação e sem resposta há muito tempo — vale cobrar.', a.aprovacaoPendente.map((x) => linha('text-amber-500', 'paper-plane', `<b>${esc(x.cliente.nome)}</b> · “${esc(x.nome)}” aguarda resposta há ${x.dias} dias`, `#/c/${x.cliente.id}/criativos`)))}
      ${bloco('Sem decisão', 'Criativo criado e nunca enviado, nem aprovado nem rejeitado — parado do nosso lado.', a.semDecisao.map((x) => linha('text-slate-500', 'circle-question', `<b>${esc(x.cliente.nome)}</b> · “${esc(x.nome)}” parado há ${x.dias} dias`, `#/c/${x.cliente.id}/criativos`)))}
      ${bloco('Orçamento de IA', 'Gasto com IA perto ou acima do limite do mês.', (a.orcamento || []).map((o) => linha(o.pct >= 100 ? 'text-rose-500' : 'text-amber-500', 'coins', `<b>${esc(o.nome)}</b>: ${Math.round(o.pct)}% do limite (${usd(o.gasto)} de ${usd(o.orc)})`, o.escopo === 'global' ? '#/config' : `#/c/${o.clienteId}`)))}
      ${bloco('Fadiga de criativo', 'Há muito tempo no ar: o público cansa de ver e o resultado costuma cair. Troque ou renove a peça.', a.fadiga.map((f) => linha('text-amber-500', 'hourglass-half', `<b>${esc(f.cliente.nome)}</b> · “${esc(f.nome)}” (${f.dias} dias no ar)`, `#/c/${f.cliente.id}/campanhas`)))}
    </div>` : '<p class="text-sm text-slate-500">Nenhum criativo em fadiga, nenhum cliente no vermelho e nada pedindo escala, resposta ou decisão agora.</p>'}</section>`;
}

/** Barra de progresso do checklist de lançamento (dentro do cliente). */
export function cartaoProgresso(c, resumo) {
  const l = resumo.lancamento;
  const proxima = l.etapas.find((e) => !e.feito);
  return `<details class="card mb-5" id="lancamento">
    <summary class="cursor-pointer list-none">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-semibold"><i class="fa-solid fa-list-check mr-1 text-slate-400"></i>Checklist de lançamento · ${l.percentual}%</span>
        <span class="flex items-center gap-3">${semaforoHtml(resumo.sem, c.metas)}
          <span class="caption">${proxima ? `Próximo passo: ${esc(proxima.nome)}` : 'Tudo pronto!'}</span></span></div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow="${l.percentual}" aria-valuemin="0" aria-valuemax="100" title="${l.feitas} de ${l.total} etapas concluídas">
        <div class="h-full rounded-full bg-indigo-500 transition-all" style="width:${l.percentual}%"></div></div></summary>
    <ol class="mt-4 space-y-2">${l.etapas.map((e, i) => `<li class="flex items-center justify-between gap-2 text-sm">
      <span><i class="fa-solid ${e.feito ? 'fa-circle-check text-emerald-500' : 'fa-circle text-slate-300'} mr-2"></i><b>${i + 1}. ${esc(e.nome)}</b> <span class="text-slate-500">— ${esc(e.detalhe)}</span></span>
      ${e.feito ? '' : `<a class="btn-ghost btn-sm" href="#/c/${c.id}${e.aba === 'editar' ? '/editar' : '/' + e.aba}" title="Ir para esta etapa">Ir</a>`}</li>`).join('')}</ol>
    ${resumo.escalar.length ? `<p class="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800"><i class="fa-solid fa-arrow-trend-up"></i> <b>Hora de escalar:</b> ${resumo.escalar.map((e) => `“${esc(e.nome)}” (${e.dias} dias na meta)`).join('; ')}.</p>` : ''}
    <p class="hint mt-2"><b>Semáforo (${ROTULO[resumo.sem.estado]}):</b> ${esc(detalheSemaforo(resumo.sem, c.metas))}</p>
    <p class="hint mt-1">O progresso conta as etapas que já têm conteúdo cadastrado. Só entram as etapas do escopo deste cliente.</p></details>`;
}
