// Custo da IA: registra cada chamada em gcc_uso_api (vinculada ao cliente), resume por tipo de operação,
// controla o orçamento mensal (aviso a 80%, confirmação manual ao estourar) e monta os cards de custo.
// Valores em US$ (é como a Anthropic cobra); o equivalente em R$ usa a cotação editável de Configurações e é só estimativa.
import { db, COL } from '../core/storage.js';
import { TAREFAS_IA, CATEGORIAS_CUSTO } from '../lib/constantes.js';
import { esc, confirmar, toast } from '../core/ui.js';

export const AVISO_PCT = 80;

/** "2026-09" no fuso local (o orçamento vira no dia 1 do mês do usuário). */
export const mesDe = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

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
      buscasWeb: uso.buscasWeb || 0, custoUsd: uso.custoUsd || 0, moeda: 'USD', mes: mesDe(), data: new Date().toISOString(),
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

/** Card "Custo de IA" do perfil do cliente: acumulado total e por tipo de operação. */
export function cartaoCusto(cliente, regs, cfg) {
  const r = resumirUso(regs);
  const mes = mesDe();
  const gastoMes = regs.filter((x) => x.mes === mes).reduce((s, x) => s + (x.custoUsd || 0), 0);
  const orc = Number(cliente.orcamentoIaMensalUsd) > 0 ? Number(cliente.orcamentoIaMensalUsd) : null;
  const linhas = Object.entries(r.porCategoria).sort((a, b) => b[1].usd - a[1].usd).map(([cat, v]) => `<tr class="border-t border-slate-100">
    <td class="py-1.5">${esc(CATEGORIAS_CUSTO[cat] || cat)}</td><td class="text-right">${v.chamadas}</td><td class="text-right">${compacto(v.entrada)}</td><td class="text-right">${compacto(v.saida)}</td>
    <td class="text-right font-medium">${usd(v.usd)}</td></tr>`).join('');
  return `<details class="card mb-5" id="custo-ia">
    <summary class="cursor-pointer list-none"><div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-semibold"><i class="fa-solid fa-coins mr-1 text-slate-400"></i>Custo de IA acumulado: ${usd(r.totalUsd)} <span class="font-normal text-slate-500">(≈ ${brl(r.totalUsd, cfg.cotacaoUsd)})</span></span>
      <span class="caption">${r.chamadas} chamada(s) · neste mês ${usd(gastoMes)}${orc ? ` de ${usd(orc)}` : ''}</span></div></summary>
    ${r.chamadas ? `<div class="mt-3 overflow-x-auto"><table class="w-full text-sm"><thead class="text-left text-xs uppercase text-slate-500"><tr><th class="py-1">Operação</th><th class="text-right">Chamadas</th><th class="text-right">Tokens entrada</th><th class="text-right">Tokens saída</th><th class="text-right">Custo</th></tr></thead><tbody>${linhas}</tbody></table></div>
      ${r.cacheLeitura ? `<p class="hint">${compacto(r.cacheLeitura)} tokens de entrada foram lidos do cache (10x mais baratos).</p>` : ''}`
      : '<p class="caption mt-3">Nenhuma chamada de IA registrada para este cliente ainda.</p>'}
    <p class="hint mt-2">Custo estimado pela tabela de preços por token; a fatura da Anthropic é a referência oficial. R$ usa a cotação de Configurações.</p></details>`;
}
