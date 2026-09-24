// Custo da IA: registra cada chamada em gcc_uso_api (vinculada ao cliente), resume por tipo de operação,
// controla o orçamento mensal (aviso a 80%, confirmação manual ao estourar) e monta os cards de custo.
// Valores em US$ (é como a Anthropic cobra); o equivalente em R$ usa a cotação editável de Configurações e é só estimativa.
import { db, COL } from '../core/storage.js';
import { TAREFAS_IA, CATEGORIAS_CUSTO } from '../lib/constantes.js';
import { esc, confirmar, toast } from '../core/ui.js';

export const AVISO_PCT = 80;
// Coleção de arquivo do rollup mensal (não existe em core/storage.js: é só uma string "gcc_*", já coberta pela
// mesma regra do Firestore que libera todo o resto — não precisou mexer nas regras nem no core para criá-la).
export const COL_USO_RESUMO = 'gcc_uso_api_resumo';

/** "2026-09" no fuso local (o orçamento vira no dia 1 do mês do usuário). */
export const mesDe = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const mesesAnteriores = (n, base = new Date()) => Array.from({ length: n }, (_, i) => mesDe(new Date(base.getFullYear(), base.getMonth() - (i + 1), 1)));

export const usd = (n) => 'US$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Number(n) > 0 && Number(n) < 1 ? 4 : 2 });
export const brl = (n, cotacao) => 'R$ ' + (Number(n || 0) * Number(cotacao || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compacto = (n) => Number(n || 0).toLocaleString('pt-BR');

// ---------- acumulado do mês (cache de sessão; o dashboard e o registro o mantêm em dia) ----------
let acc = null; // { mes, total, porCliente }
function somar(a, r) { a.total += r.custoUsd || 0; if (r.clienteId) a.porCliente[r.clienteId] = (a.porCliente[r.clienteId] || 0) + (r.custoUsd || 0); }
function montarAcc(regs, mes) { const a = { mes, total: 0, porCliente: {} }; regs.forEach((r) => somar(a, r)); return a; }
let escrevendo = Promise.resolve(); // fila de gravações de uso em andamento (segundo plano)
async function carregarMes() {
  const mes = mesDe();
  if (acc && acc.mes === mes) return acc;
  await escrevendo; // se ainda há registro sendo gravado, espera para a leitura já incluí-lo
  acc = montarAcc(await db.listar(COL.usoApi, { mes }), mes);
  return acc;
}
/** Chamado pelo dashboard com os registros que ele já leu: renova o cache sem nova leitura. */
export function definirMes(regs) { const mes = mesDe(); acc = montarAcc(regs.filter((r) => r.mes === mes), mes); }

/**
 * Registra o consumo de uma chamada (`uso` vem do servidor: tokens + custoUsd + modelo).
 * Não bloqueia quem chamou: o acumulado do mês é atualizado na hora e a gravação segue em segundo plano.
 * Nunca lança: falha de log não pode perder a geração (avisa com um toast).
 */
export function registrarUso({ cliente, tarefa, uso }) {
  try {
    const doc = {
      clienteId: cliente?.id || null, clienteNome: cliente?.nome || '', tarefa, categoria: TAREFAS_IA[tarefa]?.[1] || 'outros', modelo: uso.modelo || '',
      tokensEntrada: uso.entrada || 0, tokensSaida: uso.saida || 0, tokensCacheEscrita: uso.cacheEscrita || 0, tokensCacheLeitura: uso.cacheLeitura || 0,
      buscasWeb: uso.buscasWeb || 0, custoUsd: uso.custoUsd || 0, moeda: 'USD', provedor: uso.provedor || 'api', mes: mesDe(), data: new Date().toISOString(),
    };
    // Acumulado já em memória: soma agora (o orçamento vale para a próxima chamada mesmo antes da gravação terminar).
    // Se não estiver em memória, a próxima leitura espera a fila e vem do banco já com este registro.
    if (acc && acc.mes === doc.mes) somar(acc, doc);
    escrevendo = escrevendo.then(() => db.criar(COL.usoApi, doc)).catch((e) => {
      console.warn('[custo] não foi possível registrar o uso da IA:', e);
      toast('Não consegui registrar o custo desta chamada de IA (a geração foi feita).', 'erro');
    });
  } catch (e) { console.warn('[custo] registro de uso ignorado:', e); }
}

/**
 * Antes de cada chamada de IA: se o orçamento do mês (global ou do cliente) já foi atingido, exige confirmação manual.
 * Lança um erro `cancelado` se o usuário recusar.
 */
export async function verificarOrcamento(cliente, cfg) {
  const orc = Number(cfg.orcamentoIaMensalUsd) > 0 ? Number(cfg.orcamentoIaMensalUsd) : null;
  const orcCli = Number(cliente?.orcamentoIaMensalUsd) > 0 ? Number(cliente.orcamentoIaMensalUsd) : null;
  if (!orc && !orcCli) return;
  const a = await carregarMes();
  let msg = null;
  if (orc && a.total >= orc) msg = `O orçamento mensal de IA (${usd(orc)}) já foi atingido: ${usd(a.total)} gastos neste mês.`;
  else if (orcCli && (a.porCliente[cliente.id] || 0) >= orcCli) msg = `O orçamento mensal de IA de "${cliente.nome}" (${usd(orcCli)}) já foi atingido: ${usd(a.porCliente[cliente.id])} gastos neste mês.`;
  if (!msg) return;
  if (!(await confirmar(`${msg} Continuar gerando com IA vai aumentar o custo. Deseja continuar mesmo assim?`, 'Continuar mesmo assim'))) {
    throw Object.assign(new Error('Geração cancelada: orçamento de IA do mês excedido.'), { cancelado: true });
  }
}

// ---------- resumos ----------
export function resumirUso(regs) {
  const r = { totalUsd: 0, chamadas: regs.length, entrada: 0, saida: 0, cacheLeitura: 0, porCategoria: {} };
  for (const x of regs) {
    r.totalUsd += x.custoUsd || 0; r.entrada += x.tokensEntrada || 0; r.saida += x.tokensSaida || 0; r.cacheLeitura += x.tokensCacheLeitura || 0;
    const c = (r.porCategoria[x.categoria] ||= { usd: 0, chamadas: 0, entrada: 0, saida: 0 });
    c.usd += x.custoUsd || 0; c.chamadas++; c.entrada += (x.tokensEntrada || 0) + (x.tokensCacheEscrita || 0) + (x.tokensCacheLeitura || 0); c.saida += x.tokensSaida || 0;
  }
  return r;
}

/** Situação do orçamento para o dashboard: total do mês, % do global e clientes que passaram do aviso. */
export function estadoOrcamento(cfg, clientes, regsMes) {
  const totalMes = regsMes.reduce((s, r) => s + (r.custoUsd || 0), 0);
  const orc = Number(cfg.orcamentoIaMensalUsd) > 0 ? Number(cfg.orcamentoIaMensalUsd) : null;
  const porCliente = {};
  regsMes.forEach((r) => { if (r.clienteId) porCliente[r.clienteId] = (porCliente[r.clienteId] || 0) + (r.custoUsd || 0); });
  const alertas = [];
  if (orc) {
    const pct = (totalMes / orc) * 100;
    if (pct >= AVISO_PCT) alertas.push({ escopo: 'global', nome: 'Orçamento geral de IA', gasto: totalMes, orc, pct });
  }
  for (const c of clientes) {
    const o = Number(c.orcamentoIaMensalUsd) > 0 ? Number(c.orcamentoIaMensalUsd) : null;
    if (!o) continue;
    const pct = ((porCliente[c.id] || 0) / o) * 100;
    if (pct >= AVISO_PCT) alertas.push({ escopo: 'cliente', clienteId: c.id, nome: c.nome, gasto: porCliente[c.id] || 0, orc: o, pct });
  }
  return { totalMes, orc, pct: orc ? (totalMes / orc) * 100 : null, alertas };
}

/** Card "Custo de IA" do perfil do cliente: acumulado total e por tipo de operação.
 * `arquivado` (opcional) = { usd, chamadas } já fechados em meses anteriores (ver totalArquivadoDoCliente). */
export function cartaoCusto(cliente, regs, cfg, arquivado = null) {
  const r = resumirUso(regs);
  const mes = mesDe();
  const gastoMes = regs.filter((x) => x.mes === mes).reduce((s, x) => s + (x.custoUsd || 0), 0);
  const orc = Number(cliente.orcamentoIaMensalUsd) > 0 ? Number(cliente.orcamentoIaMensalUsd) : null;
  // Meses fechados (rollup) somam ao total mas não têm mais o detalhe por operação — só os registros em aberto
  // (mês corrente e meses ainda não fechados) aparecem linha a linha na tabela abaixo.
  const totalGeral = r.totalUsd + (arquivado?.usd || 0);
  const chamadasGeral = r.chamadas + (arquivado?.chamadas || 0);
  const linhas = Object.entries(r.porCategoria).sort((a, b) => b[1].usd - a[1].usd).map(([cat, v]) => `<tr class="border-t border-slate-100">
    <td class="py-1.5">${esc(CATEGORIAS_CUSTO[cat] || cat)}</td><td class="text-right">${v.chamadas}</td><td class="text-right">${compacto(v.entrada)}</td><td class="text-right">${compacto(v.saida)}</td>
    <td class="text-right font-medium">${usd(v.usd)}</td></tr>`).join('');
  return `<details class="card mb-5" id="custo-ia">
    <summary class="cursor-pointer list-none"><div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-semibold"><i class="fa-solid fa-coins mr-1 text-slate-400"></i>Custo de IA acumulado: ${usd(totalGeral)} <span class="font-normal text-slate-500">(≈ ${brl(totalGeral, cfg.cotacaoUsd)})</span></span>
      <span class="caption">${chamadasGeral} chamada(s) · neste mês ${usd(gastoMes)}${orc ? ` de ${usd(orc)}` : ''}</span></div></summary>
    ${r.chamadas ? `<div class="mt-3 overflow-x-auto"><table class="w-full text-sm"><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-1">Operação</th><th class="text-right">Chamadas</th><th class="text-right">Tokens entrada</th><th class="text-right">Tokens saída</th><th class="text-right">Custo</th></tr></thead><tbody>${linhas}</tbody></table></div>
      ${r.cacheLeitura ? `<p class="hint">${compacto(r.cacheLeitura)} tokens de entrada foram lidos do cache (10x mais baratos).</p>` : ''}`
      : arquivado?.usd > 0 ? '' : '<p class="caption mt-3">Nenhuma chamada de IA registrada para este cliente ainda.</p>'}
    ${arquivado?.usd > 0 ? `<p class="hint mt-2">Inclui ${usd(arquivado.usd)} (${arquivado.chamadas} chamada(s)) já arquivados de meses fechados — o detalhe por operação desses meses não fica mais salvo, só o total.</p>` : ''}
    <p class="hint mt-2">Custo estimado pela tabela de preços por token; a fatura da Anthropic é a referência oficial. R$ usa a cotação de Configurações.</p></details>`;
}

// ---------- rollup mensal (arquivamento) ----------
// gcc_uso_api cresce um documento por chamada de IA, para sempre — o dashboard e o card de custo do cliente já
// leem essa coleção por inteiro a cada visita. Para não deixá-la crescer sem limite, um mês FECHADO (qualquer mês
// que não seja o atual) é resumido num único documento em `gcc_uso_api_resumo` e os registros individuais daquele
// mês são apagados. O mês corrente NUNCA é fechado, então o dashboard continua lendo `gcc_uso_api` normalmente
// para o gasto do mês em curso — nada muda aí.

/**
 * Agrega os registros de UM mês fechado num documento único e apaga os registros individuais desse mês.
 * Idempotente: se não houver registros crus para o mês (já foi fechado antes, ou nunca teve uso), não faz nada
 * e não sobrescreve um resumo existente. Devolve o resumo gravado, ou null se não havia nada a fechar.
 */
export async function fecharMes(mes) {
  const regs = await db.listar(COL.usoApi, { mes });
  if (!regs.length) return null;
  const porCliente = {}, porCategoria = {};
  let totalUsd = 0, entrada = 0, saida = 0, cacheEscrita = 0, cacheLeitura = 0, buscasWeb = 0;
  for (const r of regs) {
    totalUsd += r.custoUsd || 0; entrada += r.tokensEntrada || 0; saida += r.tokensSaida || 0;
    cacheEscrita += r.tokensCacheEscrita || 0; cacheLeitura += r.tokensCacheLeitura || 0; buscasWeb += r.buscasWeb || 0;
    if (r.clienteId) {
      const c = (porCliente[r.clienteId] ||= { nome: r.clienteNome || '', usd: 0, chamadas: 0 });
      c.usd += r.custoUsd || 0; c.chamadas++;
    }
    const cat = (porCategoria[r.categoria || 'outros'] ||= { usd: 0, chamadas: 0, entrada: 0, saida: 0 });
    cat.usd += r.custoUsd || 0; cat.chamadas++;
    cat.entrada += (r.tokensEntrada || 0) + (r.tokensCacheEscrita || 0) + (r.tokensCacheLeitura || 0); cat.saida += r.tokensSaida || 0;
  }
  const resumo = {
    mes, chamadas: regs.length, totalUsd, tokensEntrada: entrada, tokensSaida: saida, tokensCacheEscrita: cacheEscrita,
    tokensCacheLeitura: cacheLeitura, buscasWeb, porCliente, porCategoria, fechadoEm: new Date().toISOString(),
  };
  await db.definir(COL_USO_RESUMO, mes, resumo, { silencioso: true });
  await Promise.all(regs.map((r) => db.remover(COL.usoApi, r.id)));
  return resumo;
}

/**
 * Fecha, em segundo plano, os meses passados que ainda têm registros individuais soltos (últimos `meses` meses;
 * padrão 6 — cobre o caso comum de o admin não abrir o app por um tempo). Nunca fecha o mês atual. Chamado pelo
 * dashboard a cada carregamento; não bloqueia a tela e uma falha não aparece para quem usa (só no console).
 */
export async function fecharMesesPendentes(meses = 6) {
  const atual = mesDe();
  for (const mes of mesesAnteriores(meses)) {
    if (mes === atual) continue;
    try { await fecharMes(mes); } catch (e) { console.warn('[custo] não consegui fechar o mês', mes, e); }
  }
}

/** Soma o custo/chamadas de um cliente em TODOS os meses já fechados (lê os resumos, não os registros individuais). */
export async function totalArquivadoDoCliente(clienteId) {
  const resumos = await db.listar(COL_USO_RESUMO);
  return resumos.reduce((a, r) => {
    const c = r.porCliente?.[clienteId];
    if (c) { a.usd += c.usd || 0; a.chamadas += c.chamadas || 0; }
    return a;
  }, { usd: 0, chamadas: 0 });
}
