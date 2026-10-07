// Tarefas aceitas no "Plano de otimização" que mexem no site: aparecem no "Montar site" — passo 4 (sugestão de ajuste
// de página/texto) e passo 6 (tarefa da loja: frete, checkout, pixel). E os briefs de criativo aceitos na recomendação,
// na aba Criativos (o criativo só é gerado quando o operador clica).
import { db, COL } from '../core/storage.js';
import { esc, on, toast, copiar } from '../core/ui.js';

/** Cartão das tarefas de site do passo (4 ou 6). Vazio quando não há tarefa aberta. */
export async function tarefasSiteHtml(clienteId, passo) {
  const t = (await db.listar(COL.tarefas, { clienteId }).catch(() => [])).filter((x) => x.area === 'site' && x.status !== 'feita' && Number(x.passoSite) === passo);
  if (!t.length) return '';
  return `<div class="card mb-4 border-emerald-300 bg-emerald-50/40" data-tarefas-site="${passo}"><h3 class="font-semibold"><i class="fa-solid fa-list-check text-emerald-600"></i> ${passo === 4 ? 'Sugestões de ajuste vindas do plano de otimização' : 'Tarefas da loja vindas do plano de otimização'}</h3>
    <p class="hint">Ações que você aceitou na aba Campanhas (Plano de otimização, parte Site).${passo === 4 ? ' Copie a sugestão para o "Ajustar este site", se quiser.' : ''}</p>
    <ul class="mt-2 space-y-1">${t.map((x) => `<li class="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-200 bg-white p-2 text-sm" data-tarefa-site="${esc(x.id)}"><div class="min-w-0"><p><b>${esc(x.titulo)}</b></p>${x.texto ? `<p class="text-xs text-slate-600">Número: ${esc(x.texto)}</p>` : ''}${x.medir ? `<p class="text-xs">Medir: ${esc(x.medir)}</p>` : ''}</div>
      <span class="flex gap-1">${passo === 4 ? `<button type="button" class="btn-ghost btn-sm" data-copiar-tarefa="${esc(x.id)}"><i class="fa-solid fa-copy"></i> Copiar</button>` : ''}<button type="button" class="btn-ghost btn-sm" data-tarefa-site-feita="${esc(x.id)}"><i class="fa-solid fa-check"></i> Feito</button></span></li>`).join('')}</ul></div>`;
}
// Um ouvinte só, no documento (os passos do site se redesenham várias vezes no mesmo lugar).
let ligado = false;
export function ligarTarefasSite(raiz = document) {
  if (ligado) return; ligado = true;
  on(raiz, 'click', '[data-tarefa-site-feita]', async (b) => { await db.atualizar(COL.tarefas, b.dataset.tarefaSiteFeita, { status: 'feita', feitaEm: new Date().toISOString() }); b.closest('[data-tarefa-site]')?.remove(); toast('Tarefa marcada como feita.'); });
  on(raiz, 'click', '[data-copiar-tarefa]', (b) => copiar(b.closest('[data-tarefa-site]')?.querySelector('b')?.textContent || ''));
}

/** Briefs de criativo aceitos (aba Criativos). */
export async function briefsAbertos(clienteId) {
  return (await db.listar(COL.tarefas, { clienteId }).catch(() => [])).filter((x) => x.tipo === 'brief_criativo' && x.status !== 'feita');
}
export function briefsHtml(briefs) {
  if (!briefs.length) return '';
  return `<div class="card mb-4 border-violet-200" data-briefs-criativos><h3 class="font-semibold"><i class="fa-solid fa-clipboard-list text-violet-600"></i> Briefs aceitos na recomendação (${briefs.length})</h3>
    <p class="hint">Vieram de "Analisar e recomendar" (aba Campanhas). O criativo só é gerado quando você clicar.</p>
    <ul class="mt-2 space-y-1">${briefs.map((b) => `<li class="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-200 p-2 text-sm" data-brief="${esc(b.id)}"><div class="min-w-0"><p><b>${esc(b.titulo)}</b></p><p class="whitespace-pre-wrap text-xs text-slate-600">${esc(b.texto)}</p></div>
      <span class="flex gap-1"><button type="button" class="btn-ia btn-sm" data-usar-brief="${esc(b.id)}"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar com este brief</button><button type="button" class="btn-ghost btn-sm" data-brief-feito="${esc(b.id)}">Feito</button></span></li>`).join('')}</ul></div>`;
}
/** Texto do briefing do criativo a partir do brief aceito (o operador ainda edita antes de gerar). */
export const textoDoBrief = (b) => [b.brief?.angulo && `Ângulo: ${b.brief.angulo}`, b.brief?.descricao, b.brief?.cta && `CTA: ${b.brief.cta} (${b.brief.destino === 'whatsapp' ? 'conversa no WhatsApp' : 'compra no site'})`].filter(Boolean).join('\n');
