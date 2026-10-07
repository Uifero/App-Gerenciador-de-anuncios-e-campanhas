// Como cada item de uma análise aparece na tela (recomendação e plano de otimização): o que fazer, "Por quê",
// "Fontes" separadas por tipo, "Resultado esperado" (faixa + confiança + do que depende, nunca promessa) e avisos.
import { esc, tag } from '../core/ui.js';
import { ROTULO_CONFIANCA, SEM_FONTE } from '../lib/fontes-analise.js';
import { TIPOS_MUDANCA } from '../lib/recomendacao.js';
import { FORMATOS } from '../lib/constantes.js';
import { narrativaPorId } from '../lib/narrativas.js';
import { dataBR } from '../core/ui.js';

const brl = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const COR_CONF = { alta: 'tag-ok', media: 'tag-warn', baixa: 'tag-bad' };
const num = (v, u) => (v == null ? '' : u === 'R$' ? `R$ ${Number(v).toFixed(2).replace('.', ',')}` : `${String(v).replace('.', ',')}${u === '%' ? '%' : u === 'x' ? 'x' : u ? ' ' + u : ''}`);

/** Fontes por tipo (Documentos, Web, Anúncios do nicho, Resultados do cliente, Resultados do nicho, Política). */
export function fontesHtml(it) {
  const f = it.fontes || {};
  const linhas = [
    (f.politica || []).length && `<li><b>Política do Meta / regras do app:</b> ${f.politica.map((p) => esc(p.descricao)).join('; ')}</li>`,
    (f.resultadosCliente || []).length && `<li><b>Resultados do cliente:</b> ${f.resultadosCliente.map((r) => esc([r.periodo, r.campanha && `campanha "${r.campanha}"`, r.destino].filter(Boolean).join(' · '))).join('; ')}</li>`,
    (f.resultadosNicho || []).length && `<li><b>Resultados do nicho</b> (outros clientes do mesmo nicho, sem nomes): ${f.resultadosNicho.map((r) => esc(r.descricao)).join('; ')}</li>`,
    (f.documentos || []).length && `<li><b>Documentos:</b> ${f.documentos.map((d) => `${esc(d.titulo)}${d.parte ? ` — parte "${esc(d.parte)}"` : ''}`).join('; ')}</li>`,
    (f.anuncios || []).length && `<li><b>Anúncios do nicho:</b> ${f.anuncios.map((a) => `"${esc(a.titulo)}" (${a.diasNoAr != null ? `${esc(a.diasNoAr)} dias no ar` : 'tempo no ar n/d'})`).join('; ')}</li>`,
    (f.web || []).length && `<li><b>Web:</b> ${f.web.map((w) => `<a class="text-indigo-600 underline" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(w.site || w.url)}</a> (${w.data ? esc(w.data) : 'data não informada'})${w.desatualizada === true ? ' <span class="tag tag-warn">mais de 12 meses: pode estar desatualizada</span>' : ''}`).join('; ')}</li>`,
  ].filter(Boolean);
  if (it.regraApp) return '<p class="text-xs text-slate-600" data-fontes><b>Fontes:</b> regra do app com os dados deste cliente (sem IA).</p>';
  return linhas.length ? `<div class="text-xs text-slate-700" data-fontes><b>Fontes</b><ul class="ml-4 list-disc">${linhas.join('')}</ul></div>`
    : `<p class="text-xs font-medium text-amber-800" data-sem-fonte><i class="fa-solid fa-triangle-exclamation"></i> Fontes: ${SEM_FONTE} (confiança menor).</p>`;
}

/** Resultado esperado: faixa e confiança; sem número quando nenhuma fonte trouxe número. Nunca promessa. */
export function esperadoHtml(it) {
  const r = it.resultadoEsperado;
  const conf = r?.confianca || it.confianca || 'baixa';
  if (!r) return `<p class="text-xs" data-esperado><b>Resultado esperado:</b> sem estimativa ${tag('confiança ' + ROTULO_CONFIANCA[conf], COR_CONF[conf])}</p>`;
  const faixa = r.min != null || r.max != null ? `${esc(r.metrica || 'métrica')}: ${r.min != null ? num(r.min, r.unidade) : '?'} a ${r.max != null ? num(r.max, r.unidade) : '?'}` : `${esc(r.metrica || 'métrica')}: sem número (nenhuma fonte trouxe um número para isso)`;
  return `<p class="text-xs" data-esperado><b>Resultado esperado</b> (estimativa, não promessa): ${faixa} ${tag('confiança ' + ROTULO_CONFIANCA[conf], COR_CONF[conf])}${r.dependeDe ? ` · depende de: ${esc(r.dependeDe)}` : ''}${conf === 'baixa' ? ' <span class="text-amber-800">— pouco dado: a faixa real pode ser bem diferente.</span>' : ''}</p>`;
}

/** O conteúdo de cada tipo de item (destino, estrutura, criativo, métrica, escala, ação). */
function corpoDados(it) {
  const d = it.dados || {};
  if (it.tipo === 'estrutura') return `<p class="text-sm">Objetivo: <b>${esc(d.objetivo?.nome)}</b> · Local de conversão: <b>${esc(d.localConversao?.nome)}</b> · ${esc(d.conjuntos)} conjunto(s)${d.orcamentoDiario ? ` · ${esc(brl(d.orcamentoDiario))}/dia` : ' · orçamento a definir'}${d.duracaoDias ? ` · ${esc(d.duracaoDias)} dias` : ''}</p>
    ${(d.conjuntosDetalhe || []).length ? `<ul class="ml-4 list-disc text-sm">${d.conjuntosDetalhe.map((k) => `<li>${esc(k.nome)}: ${esc(k.localConversao?.nome)}${k.orcamentoDiario ? `, ${esc(brl(k.orcamentoDiario))}/dia` : ''}${k.publico ? `, público ${esc(k.publico)}` : ''}</li>`).join('')}</ul>` : ''}`;
  if (it.tipo === 'criativo') return `<p class="text-sm">${d.quantidade > 1 ? `${esc(d.quantidade)} variações · ` : ''}Formato: ${esc(FORMATOS.find(([k]) => k === d.formato)?.[1] || 'a definir')} · Narrativa: ${esc(narrativaPorId(d.narrativa)?.nome || 'a IA escolhe ao gerar')} · Produto: ${esc(d.produtoNome || 'escolher ao gerar')} · CTA: <b>${esc(d.cta)}</b> (${d.destino === 'whatsapp' ? 'conversa' : 'compra'})</p>${d.descricao ? `<p class="text-sm text-slate-600">${esc(d.descricao)}</p>` : ''}`;
  if (it.tipo === 'metrica') return `<p class="text-sm">Escalar: <b>${esc(d.escalar || '—')}</b> · Manter: ${esc(d.manter || '—')} · Pausar: <b>${esc(d.pausar || '—')}</b></p>`;
  if (it.tipo === 'escala') return `<p class="text-sm whitespace-pre-wrap">${esc(d.plano)}</p>`;
  if (it.area) return `<p class="text-sm"><b>O que o número mostra:</b> ${esc(it.numero || '—')}</p><p class="text-sm"><b>Como medir no próximo período:</b> ${esc(it.medir || '—')}</p>${it.passoSite ? `<p class="text-xs text-indigo-700"><i class="fa-solid fa-store"></i> Aparece no "Montar site", passo ${it.passoSite} (${it.passoSite === 4 ? 'sugestão de ajuste' : 'tarefa da loja'}).</p>` : ''}`;
  return '';
}

/**
 * Um item com caixa "Aceitar" (`aceitavel`). `jaAplicado` = já virou campanha/brief/tarefa (a caixa fica marcada e travada).
 */
export function itemHtml(it, { aceitavel = true, jaAplicado = false } = {}) {
  const titulo = it.area ? `${it.prioridade}. ${esc(it.mudar)} ${tag(TIPOS_MUDANCA[it.tipo] || it.tipo)}` : `<span class="text-xs uppercase text-slate-500">${esc({ destino: 'Destino', estrutura: 'Estrutura', criativo: 'Criativo', metrica: 'Métrica', escala: 'Escala' }[it.tipo] || '')}</span> ${esc(it.titulo)}`;
  return `<li class="rounded-lg border ${it.semFonte ? 'border-amber-300' : 'border-slate-200'} bg-white p-3" data-item-analise="${esc(it.id)}">
    <div class="flex items-start gap-2">${aceitavel ? `<input type="checkbox" class="mt-1" data-aceitar="${esc(it.id)}" ${jaAplicado ? 'checked disabled' : ''} aria-label="Aceitar este item" title="${jaAplicado ? 'Já aplicado' : 'Aceitar este item'}">` : ''}
      <div class="min-w-0 flex-1 space-y-1"><p class="font-semibold">${titulo} ${it.semFonte ? tag(SEM_FONTE, 'tag-warn') : ''}${it.regraApp ? tag('regra do app', 'tag-info') : ''}${jaAplicado ? tag('aplicado', 'tag-ok') : ''}</p>
        ${corpoDados(it)}
        ${it.porque ? `<p class="text-sm" data-porque><b>Por quê:</b> ${esc(it.porque)}</p>` : '<p class="text-sm text-slate-500" data-porque><b>Por quê:</b> a IA não explicou.</p>'}
        ${fontesHtml(it)}${esperadoHtml(it)}
        ${(it.avisos || []).length ? `<ul class="text-xs text-amber-800">${it.avisos.map((a) => `<li><i class="fa-solid fa-triangle-exclamation"></i> ${esc(a)}</li>`).join('')}</ul>` : ''}</div></div></li>`;
}

/** O que a IA tinha em mãos (contado pelo app). */
export function fontesUsadasHtml(f) {
  if (!f) return '';
  const p = f.pesquisa;
  return `<details class="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs" data-fontes-usadas><summary class="cursor-pointer font-semibold">O que a análise tinha em mãos (contado pelo app)</summary>
    <ul class="ml-4 mt-1 list-disc"><li>Documentos: ${esc(f.documentos.join(', ') || 'nenhum')}</li><li>Anúncios do nicho: ${esc(f.anuncios)} (${esc(f.anunciosNivel)})</li>
    <li>Resultados do cliente: ${esc(f.resultadosCliente)} registro(s)</li><li>Resultados do nicho: ${esc(f.nicho)}</li>
    <li>Pesquisa web: ${p ? `${p.doCache ? 'do cache' : 'nova'}, de ${dataBR(p.em)}${p.encontrou ? '' : ' — não achou nada útil'}${p.noNicho ? '' : ' — sem dado específico do nicho'}` : 'não usada'}</li></ul></details>`;
}
