// Motor de Insights: identifica, a partir dos resultados já registrados, qual ângulo/framework/formato performou
// melhor — primeiro por conta própria (números direto, sem IA, sempre disponível e sem custo), com uma opção de
// pedir à IA uma explicação em texto por cima dos mesmos números (nunca a IA inventa o padrão, só o explica).
// Também compara clientes de nicho semelhante SEM nunca expor de qual cliente veio cada número: o que passa daqui
// pra frente é só o padrão agregado (ex.: "ângulo X, ROAS médio 3.2x, 5 amostra(s)"), nunca um nome de cliente.
import { db, COL } from '../core/storage.js';
import { explicarInsights } from '../core/ia.js';
import { esc, tag, ocupado } from '../core/ui.js';
import { FORMATOS } from '../lib/constantes.js';

const DIMENSOES = [['angulo', 'Ângulo'], ['framework', 'Framework de copy'], ['formato', 'Formato']];
const normNicho = (s) => String(s || '').toLowerCase().trim();

function agruparPor(campo, resultados) {
  const grupos = {};
  for (const r of resultados) {
    const chave = String(r[campo] || '').trim();
    if (!chave || (r.roas == null && r.cpa == null)) continue;
    const g = (grupos[chave] ||= { valor: chave, amostras: 0, gasto: 0, roasSoma: 0, roasPeso: 0, cpaSoma: 0, cpaPeso: 0 });
    g.amostras++;
    const peso = r.gasto > 0 ? r.gasto : 1;
    if (r.roas != null) { g.roasSoma += r.roas * peso; g.roasPeso += peso; }
    if (r.cpa != null) { g.cpaSoma += r.cpa * peso; g.cpaPeso += peso; }
    g.gasto += r.gasto || 0;
  }
  return Object.values(grupos).map((g) => ({
    valor: g.valor, amostras: g.amostras, gasto: g.gasto,
    roasMedio: g.roasPeso ? g.roasSoma / g.roasPeso : null,
    cpaMedio: g.cpaPeso ? g.cpaSoma / g.cpaPeso : null,
  }));
}

/** Ordena do melhor pro pior: ROAS maior primeiro, CPA menor como critério de desempate/segundo (quando não há ROAS). */
const porDesempenho = (a, b) => (b.roasMedio ?? -Infinity) - (a.roasMedio ?? -Infinity) || (a.cpaMedio ?? Infinity) - (b.cpaMedio ?? Infinity);

/**
 * Padrões locais (SEM IA, só números): por dimensão (ângulo/framework/formato), agrupa e ordena do melhor pro
 * pior desempenho médio, só considerando grupos com pelo menos `minimoAmostras` resultados (padrão 2 — 1 amostra
 * não é padrão, é coincidência). É o equivalente manual do insight — sempre disponível, sem custo de IA.
 */
export function padroesLocais(resultados = [], minimoAmostras = 2) {
  const out = {};
  for (const [campo] of DIMENSOES) out[campo] = agruparPor(campo, resultados).filter((g) => g.amostras >= minimoAmostras).sort(porDesempenho);
  return out;
}

/**
 * Padrões agregados de clientes de nicho semelhante (nicho igual, ignorando maiúsculas/espaços), excluindo o
 * próprio cliente. Só o padrão agregado sai daqui — nunca o nome, id ou número isolado de um cliente específico.
 * Precisa de pelo menos 1 outro cliente do mesmo nicho com resultados; senão devolve padrões vazios.
 */
export async function padroesPorNicho(nicho, excluirClienteId, minimoAmostras = 2) {
  const clientes = await db.listar(COL.clientes);
  const doNicho = clientes.filter((c) => c.id !== excluirClienteId && normNicho(c.nicho) === normNicho(nicho) && normNicho(c.nicho));
  if (!doNicho.length) return { padroes: padroesLocais([], minimoAmostras), clientes: 0 };
  const porCliente = await Promise.all(doNicho.map((c) => db.listar(COL.resultados, { clienteId: c.id })));
  return { padroes: padroesLocais(porCliente.flat(), minimoAmostras), clientes: doNicho.length };
}

/** true se `valor` (ângulo/framework) já aparece em algum criativo do cliente — "já testado". */
const jaTestado = (valor, criativos, campo) => criativos.some((c) => String(c[campo] || '').trim().toLowerCase() === valor.toLowerCase());

/**
 * O melhor padrão (ângulo OU framework) comprovado em OUTROS clientes do mesmo nicho que este cliente ainda não
 * testou em nenhum criativo próprio. É a sugestão proativa oferecida ao criar um criativo novo e na Central de
 * Alertas. Devolve null se não houver nenhum padrão assim.
 */
export function sugestaoNaoTestada(padroesNicho, criativosDoCliente = []) {
  let melhor = null;
  for (const [campo, rotulo] of DIMENSOES) {
    if (campo === 'formato') continue; // formato não é algo que se "sugere testar" da mesma forma que ângulo/framework
    const candidato = (padroesNicho?.[campo] || []).find((g) => !jaTestado(g.valor, criativosDoCliente, campo));
    if (candidato && (!melhor || (candidato.roasMedio ?? 0) > (melhor.grupo.roasMedio ?? 0))) melhor = { campo, rotulo, grupo: candidato };
  }
  return melhor;
}

/**
 * Versão para o dashboard geral: computa a sugestão "ângulo/framework comprovado ainda não testado" para TODOS os
 * clientes de uma vez, a partir de dados que o dashboard já carregou (sem nenhuma leitura extra no Firestore).
 * Agrupa por nicho uma única vez e reaproveita entre os clientes do mesmo nicho.
 */
export function sugestoesDashboard(clientes, criativosTodos, resultadosTodos, minimoAmostras = 2) {
  const porNicho = {};
  for (const c of clientes) {
    const chave = normNicho(c.nicho);
    if (!chave) continue;
    (porNicho[chave] ||= []).push(c.id);
  }
  const out = [];
  for (const c of clientes) {
    const chave = normNicho(c.nicho);
    const idsDoNicho = (porNicho[chave] || []).filter((id) => id !== c.id);
    if (idsDoNicho.length < 1) continue;
    const resultadosOutros = resultadosTodos.filter((r) => idsDoNicho.includes(r.clienteId));
    const padroes = padroesLocais(resultadosOutros, minimoAmostras);
    const criativosDoCliente = criativosTodos.filter((x) => x.clienteId === c.id);
    const sugestao = sugestaoNaoTestada(padroes, criativosDoCliente);
    if (sugestao) out.push({ cliente: c, ...sugestao });
  }
  return out;
}

// ---------------- interface (card colapsável dentro da aba Resultados) ----------------

function linhaPadrao([campo, rotulo], grupos) {
  if (!grupos.length) return '';
  // Formato é guardado como chave ("video_curto"): mostra o nome legível.
  const nome = (v) => (campo === 'formato' ? FORMATOS.find(([k]) => k === v)?.[1] || v : v);
  const top = grupos.slice(0, 3).map((g) => `<li>${tag(nome(g.valor), 'tag-info')} ROAS ${g.roasMedio != null ? g.roasMedio.toFixed(2) + 'x' : '—'} · CPA ${g.cpaMedio != null ? 'R$ ' + g.cpaMedio.toFixed(2) : '—'} <span class="hint">(${g.amostras} resultado(s))</span></li>`).join('');
  return `<div><h5 class="text-xs font-semibold uppercase text-slate-500">${esc(rotulo)}</h5><ul class="mt-1 space-y-0.5 text-sm">${top}</ul></div>`;
}

/**
 * Card "Insights" da aba Resultados: monta os padrões locais (sem IA, imediato) e busca os padrões de nicho em
 * segundo plano (1 leitura por cliente do mesmo nicho — só quando há pelo menos 1). Devolve o HTML pronto.
 */
export async function cartaoInsights(cliente, resultados) {
  const locais = padroesLocais(resultados);
  const temLocal = DIMENSOES.some(([c]) => locais[c].length);
  let nicho = { padroes: padroesLocais([]), clientes: 0 };
  try { nicho = await padroesPorNicho(cliente.nicho, cliente.id); } catch (e) { console.warn('[insights] não consegui buscar padrões de nicho:', e); }
  const temNicho = DIMENSOES.some(([c]) => nicho.padroes[c].length);
  if (!temLocal && !temNicho) {
    return `<details class="card mb-5" id="insights-card"><summary class="cursor-pointer text-sm font-medium text-slate-600"><i class="fa-solid fa-chart-simple mr-1 text-slate-400"></i> Insights</summary>
      <p class="hint mt-2">Ainda não há resultados suficientes (mínimo 2 por ângulo/framework/formato) para identificar um padrão. Registre mais resultados aqui ou em clientes do mesmo nicho.</p></details>`;
  }
  return `<details class="card mb-5" id="insights-card" open><summary class="cursor-pointer text-sm font-medium text-slate-600"><i class="fa-solid fa-chart-simple mr-1 text-slate-400"></i> Insights <span class="tag tag-info">sem custo de IA</span></summary>
    <p class="hint mt-2">Calculado direto dos números registrados (média ponderada pelo gasto, só com pelo menos 2 resultados) — nenhuma IA envolvida até aqui.</p>
    <p class="caption mb-3"><b>Como usar:</b> em cada coluna, o primeiro item é o que mais deu retorno. No próximo criativo, escreva esse ângulo/framework no campo "O que você quer comunicar?" (aba Criativos). ROAS acima de 3x costuma ser bom; abaixo de 1x é prejuízo.</p>
    ${temLocal ? `<div><p class="text-xs font-semibold text-slate-500 mb-1">NESTE CLIENTE</p><div class="grid gap-3 sm:grid-cols-3">${DIMENSOES.map((d) => linhaPadrao(d, locais[d[0]])).join('')}</div></div>` : ''}
    ${temNicho ? `<div class="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"><p class="text-xs font-semibold text-indigo-700 mb-1" title="Agregado de ${nicho.clientes} outro(s) cliente(s) com o mesmo nicho — nunca mostra de qual cliente veio cada número">PADRÃO EM ${nicho.clientes} CLIENTE(S) DO MESMO NICHO (${esc(cliente.nicho || '')})</p>
      <div class="grid gap-3 sm:grid-cols-3">${DIMENSOES.map((d) => linhaPadrao(d, nicho.padroes[d[0]])).join('')}</div></div>` : ''}
    <div class="mt-3 flex flex-wrap items-center gap-2"><button class="btn-ia btn-sm" data-explicar-ia title="A IA lê estes mesmos números e escreve uma explicação e recomendações — não calcula nada novo"><i class="fa-solid fa-wand-magic-sparkles"></i> Pedir explicação à IA</button>
      <span data-explicacao-status class="hint"></span></div>
    <div data-explicacao class="mt-3"></div>
  </details>`;
}

/** Liga o botão "Pedir explicação à IA" do card acima (chamado depois de inserir o HTML no DOM). */
export function ligarExplicacaoIA(root, cliente, resultados) {
  const btn = root.querySelector('[data-explicar-ia]');
  if (!btn) return;
  btn.addEventListener('click', () => ocupado(btn, async () => {
    const padroes = padroesLocais(resultados);
    let nicho = { padroes: padroesLocais([]) };
    try { nicho = await padroesPorNicho(cliente.nicho, cliente.id); } catch { /* segue só com os locais */ }
    const r = await explicarInsights({ cliente, padroes, padroesNicho: nicho.padroes });
    root.querySelector('[data-explicacao]').innerHTML = `<div class="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
      <p class="mb-1 text-xs font-semibold text-violet-700"><i class="fa-solid fa-wand-magic-sparkles"></i> Explicação da IA — baseada só nos números acima</p>
      <p>${esc(r.resumo || '')}</p>
      ${(r.recomendacoes || []).length ? `<ul class="mt-2 list-disc space-y-0.5 pl-5">${r.recomendacoes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <p class="mt-2 text-xs text-violet-700"><b>Próximo passo:</b> aplique a recomendação no próximo criativo (aba Criativos) e registre o resultado aqui para confirmar se funcionou.</p></div>`;
  }));
}
