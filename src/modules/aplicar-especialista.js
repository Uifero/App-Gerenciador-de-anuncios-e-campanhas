// "Aplicar" nas ações de um especialista (card do resultado em modules/especialistas.js). Nada é salvo sem o clique do
// operador: a reescrita aparece como "Atual × Com a mudança" e só vira nova versão do criativo em "Aceitar"; ação de
// campanha/oferta/WhatsApp vira tarefa só em "Criar tarefa"; falta de dado só abre o campo. Texto com problema de saúde
// (Meta) ou colchete do modelo de gancho é bloqueado e não é salvo. O que foi feito com cada ação fica na consulta
// (COL.analises, campo aplicacoes) e aparece no "Histórico de consultas".
import { db, COL } from '../core/storage.js';
import { refinarCriativo } from '../core/ia.js';
import {
  classificarAcao, instrucaoDaAcao, propostaDeMudanca, motivoBloqueioTexto, versaoNova, tarefaDaAcao, CAMPOS_FALTA, STATUS_APLICACAO,
} from '../lib/aplicar-especialista.js';
import { produtoDoCriativo, contextoProdutoAtual } from '../lib/conexoes.js';
import { abrirEstudio } from './estudio.js';
import { abrirProduto } from './produtos.js';
import { esc, $, on, ocupado, toast, tag, mostrarResultado, fecharModais } from '../core/ui.js';

const NO_TEXTO = { hook: 'no gancho', copy: 'no texto', cta: 'no CTA', roteiro: 'no roteiro' };
const ROTULO_CAMPO = { hook: 'Gancho (hook)', copy: 'Texto / roteiro', cta: 'CTA' };
const COR_STATUS = { aceita: 'tag-ok', descartada: '', bloqueada: 'tag-bad', tarefa: 'tag-info', peca: 'tag-ok' };

/** Abre o campo que falta (o app nunca preenche: só leva até ele). */
export function abrirCampo(cliente, campo, { produtos = [], produtoId = null } = {}) {
  const info = CAMPOS_FALTA[campo]; if (!info) return;
  const ir = (hash, chave, valor) => {
    try { sessionStorage.setItem(chave, valor); } catch { /* sem storage: só navega */ }
    if (location.hash === hash) { fecharModais(); document.dispatchEvent(new CustomEvent('gcc:focar-campo')); } else location.hash = hash;
  };
  if (info.onde.tipo === 'pergunta') return ir(`#/c/${cliente.id}/criativos/todos`, 'gcc_focar_pergunta', info.onde.alvo);
  if (info.onde.tipo === 'anuncio') return ir(`#/c/${cliente.id}/campanhas`, 'gcc_focar_campo_anuncio', info.onde.alvo);
  if (info.onde.tipo === 'produto') return abrirProduto(cliente, produtos.find((p) => p.id === produtoId) || produtos[0] || null, () => {});
  location.hash = `#/c/${cliente.id}/${info.onde.alvo}`;
}

/**
 * Prepara a reescrita (1 chamada de IA) e devolve a proposta "Atual × Com a mudança". NÃO grava nada.
 * `refinar` é refinarCriativo (trocável nos testes).
 */
export async function prepararReescrita({ cliente, criativo, acao, tipo, produtos = [], refinar = refinarCriativo }) {
  const r = await refinar({ cliente, criativo, instrucao: instrucaoDaAcao(acao, tipo), produtoAtual: contextoProdutoAtual(produtoDoCriativo(criativo, { produtos, materiais: [], cliente })) });
  return propostaDeMudanca(criativo, r, cliente);
}

/**
 * "Aceitar": confere de novo (saúde e colchete) e só então grava a nova versão do criativo. Bloqueado = erro, nada gravado.
 * Devolve { versao, patch }.
 */
export async function aceitarReescrita({ cliente, criativo, proposta, nota }) {
  const bloqueio = motivoBloqueioTexto(proposta.depois, cliente, criativo.modeloGancho);
  if (bloqueio) throw Object.assign(new Error(bloqueio), { bloqueio });
  if (!proposta.campos.length) throw new Error('A mudança não alterou o texto: nada a salvar.');
  const patch = versaoNova(criativo, proposta.depois, nota);
  await db.atualizar(COL.criativos, criativo.id, patch);
  Object.assign(criativo, patch);
  return { versao: patch.versoes[patch.versoes.length - 1].n, patch };
}

/** Grava o que foi feito com a ação `i` na consulta (COL.analises, campo aplicacoes). */
export async function registrarAplicacao(consulta, i, info) {
  consulta.aplicacoes = { ...(consulta.aplicacoes || {}), [i]: { ...info, acao: consulta.resultado?.acoes?.[i]?.acao || '', em: new Date().toISOString() } };
  await db.atualizar(COL.analises, consulta.id, { aplicacoes: consulta.aplicacoes });
  return consulta.aplicacoes[i];
}

/**
 * Liga os botões de aplicar no card. ctx: { cliente, consulta (registro em COL.analises, com resultado normalizado),
 * especialista, dados: { criativos, produtos, pecas }, aoMudar }.
 */
export function ligarAplicacao(card, { cliente, consulta, especialista, dados, aoMudar = () => {} }) {
  if (!card) return;
  const acoes = consulta.resultado?.acoes || [];
  const alvo = consulta.alvo || {};
  const peca = alvo.tipo === 'peca' ? (dados.pecas || []).find((p) => p.id === alvo.id) : null;
  const criativoId = alvo.tipo === 'criativo' ? alvo.id : alvo.tipo === 'peca' ? (alvo.criativoId || peca?.criativoId) : null;
  const criativo = () => (dados.criativos || []).find((c) => c.id === criativoId) || null;
  const classes = acoes.map((a) => classificarAcao(a, { alvoTipo: alvo.tipo, area: especialista.area, temCriativo: Boolean(criativo()) && (alvo.tipo !== 'peca' || Boolean(peca)) }));
  const selecionadas = new Set();
  consulta.aplicacoes ||= {};
  const feita = (i) => ['aceita', 'descartada', 'bloqueada', 'tarefa', 'peca'].includes(consulta.aplicacoes[i]?.status);

  const desenharSlot = (i) => {
    const slot = $(`[data-aplicar-slot="${i}"]`, card); if (!slot) return;
    const k = classes[i], ap = consulta.aplicacoes[i];
    const chip = ap?.status ? `${tag(STATUS_APLICACAO[ap.status] || ap.status, COR_STATUS[ap.status])}${ap.versao ? ` <span class="hint !mt-0">(versão v${ap.versao})</span>` : ''}${ap.motivo ? ` <span class="text-xs text-rose-700">${esc(ap.motivo)}</span>` : ''}` : '';
    if (!k.modo) { slot.innerHTML = `${chip}<p class="hint !mt-0" data-sem-aplicar>${esc(k.motivo)}</p>`; return; }
    if (k.modo === 'falta_dado') {
      const info = CAMPOS_FALTA[k.campo];
      slot.innerHTML = info ? `<p class="text-xs text-slate-600">Falta: <b>${esc(info.rotulo)}</b>. O app não inventa: preencha o dado real.</p>
        <button type="button" class="btn-ghost btn-sm mt-1 min-h-[44px]" data-abrir-campo="${i}"><i class="fa-solid fa-pen-to-square"></i> Abrir o campo</button>` : `<p class="hint !mt-0" data-sem-aplicar>${esc(k.motivo)}</p>`;
      return;
    }
    const rot = k.modo === 'tarefa' ? 'Aplicar (vira tarefa)' : k.modo === 'peca' ? 'Aplicar (texto novo + nova peça)' : `Aplicar ${NO_TEXTO[k.tipo] || 'no texto'}`;
    slot.innerHTML = `<div class="flex flex-wrap items-center gap-2">${feita(i) ? chip : `<label class="flex min-h-[44px] items-center gap-2 text-xs"><input type="checkbox" class="h-5 w-5" data-sel-acao="${i}" ${selecionadas.has(i) ? 'checked' : ''}> Selecionar</label>
      <button type="button" class="btn-ia btn-sm min-h-[44px]" data-aplicar-acao="${i}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(rot)}</button>${chip}`}</div>`;
  };
  const desenharLote = () => {
    const lote = $('[data-aplicar-lote]', card); if (!lote) return;
    const possiveis = classes.some((k, i) => ['reescrever', 'peca', 'tarefa'].includes(k.modo) && !feita(i));
    lote.innerHTML = possiveis ? `<button type="button" class="btn-primary btn-sm min-h-[44px]" data-aplicar-lote-btn ${selecionadas.size ? '' : 'disabled'}><i class="fa-solid fa-list-check"></i> Aplicar as selecionadas (${selecionadas.size})</button>
      <span class="hint !mt-0">Uma de cada vez: cada mudança aparece como "Atual × Com a mudança" antes de salvar.</span>` : '';
  };
  acoes.forEach((_, i) => desenharSlot(i)); desenharLote();

  const registrar = async (i, info) => {
    await registrarAplicacao(consulta, i, info);
    selecionadas.delete(i); desenharSlot(i); desenharLote(); aoMudar();
  };

  // Cada execução devolve uma promessa que só termina quando o operador decide (Aceitar/Descartar/Criar tarefa).
  const decisoes = new Map();
  const esperarDecisao = (i) => new Promise((ok) => decisoes.set(i, ok));
  const decidir = (i) => { decisoes.get(i)?.(); decisoes.delete(i); };

  async function executar(i) {
    const k = classes[i], acao = acoes[i], zona = $(`[data-proposta="${i}"]`, card);
    if (!k.modo || feita(i)) return;
    if (k.modo === 'falta_dado') { abrirCampo(cliente, k.campo, { produtos: dados.produtos, produtoId: criativo()?.produtoId }); return; }
    if (k.modo === 'tarefa') {
      const t = tarefaDaAcao(acao, k.tipo, { clienteId: cliente.id, analiseId: consulta.id, especialista: especialista.nome, alvo });
      zona.innerHTML = `<div class="mt-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2 text-sm" data-proposta-tarefa="${i}">
        <p class="font-semibold"><i class="fa-solid fa-list-check"></i> Vira esta tarefa (aba Campanhas, "Tarefas aceitas"):</p>
        <p class="mt-1"><b>${esc(t.titulo)}</b></p><p class="whitespace-pre-wrap text-xs text-slate-700">${esc(t.texto)}</p>
        <p class="hint">Nada é mudado no Meta nem no perfil do cliente.</p>
        <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-primary btn-sm min-h-[44px]" data-criar-tarefa="${i}">Criar tarefa</button><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-descartar-acao="${i}">Descartar</button></div></div>`;
      zona._tarefa = t;
      mostrarResultado(zona.firstElementChild, 'Confira a tarefa antes de criar.');
      return esperarDecisao(i);
    }
    const c = criativo(); if (!c) return toast('O criativo desta consulta foi excluído.', 'erro');
    zona.innerHTML = '<p class="caption mt-2" role="status"><i class="fa-solid fa-spinner fa-spin"></i> Reescrevendo só o que a ação pede…</p>';
    let prop;
    try {
      prop = await prepararReescrita({ cliente, criativo: c, acao, tipo: k.tipo, produtos: dados.produtos || [] });
    } catch (e) {
      zona.innerHTML = `<p class="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700" role="alert">Não consegui reescrever: ${esc(e.message || e)}. Nada foi mudado.</p>`;
      return;
    }
    zona._proposta = prop;
    const linhas = (prop.campos.length ? prop.campos : ['hook']).map((campo) => `<div class="grid gap-2 sm:grid-cols-2" data-comparar-campo="${campo}">
      <div class="rounded border border-slate-200 bg-slate-50 p-2"><p class="text-xs font-semibold text-slate-600">${ROTULO_CAMPO[campo]} · Atual</p><p class="whitespace-pre-wrap text-sm">${esc(prop.antes[campo])}</p></div>
      <div class="rounded border border-emerald-300 bg-emerald-50/60 p-2"><p class="text-xs font-semibold text-emerald-800">${ROTULO_CAMPO[campo]} · Com a mudança</p><p class="whitespace-pre-wrap text-sm">${esc(prop.depois[campo])}</p></div></div>`).join('');
    zona.innerHTML = `<div class="mt-2 space-y-2 rounded-lg border border-violet-200 p-2" data-proposta-texto="${i}">
      <p class="text-sm font-semibold">Atual × Com a mudança</p>
      ${!prop.campos.length ? '<p class="text-sm text-amber-800">A IA não mudou nada no texto. Descarte ou peça de novo.</p>' : linhas}
      ${prop.explicacao ? `<p class="hint">IA: ${esc(prop.explicacao)}</p>` : ''}
      ${prop.bloqueio ? `<p class="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700" role="alert" data-bloqueio-aplicar>${esc(prop.bloqueio)} Nada foi salvo.</p>` : ''}
      <div class="flex flex-wrap gap-2">${prop.campos.length && !prop.bloqueio ? `<button type="button" class="btn-primary btn-sm min-h-[44px]" data-aceitar-acao="${i}"><i class="fa-solid fa-check"></i> ${k.modo === 'peca' ? 'Aceitar e produzir a nova peça' : 'Aceitar (nova versão)'}</button>` : ''}
        <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-descartar-acao="${i}">Descartar</button></div></div>`;
    if (prop.bloqueio) { zona.firstElementChild.scrollIntoView({ block: 'center' }); toast(`Mudança bloqueada e não salva. ${prop.bloqueio}`, 'erro'); }
    else mostrarResultado(zona.firstElementChild, 'Confira "Atual × Com a mudança".');
    if (prop.bloqueio) { await registrar(i, { status: 'bloqueada', motivo: prop.bloqueio, criativoId: c.id }); return; }
    return esperarDecisao(i);
  }

  on(card, 'change', '[data-sel-acao]', (c) => { const i = Number(c.dataset.selAcao); if (c.checked) selecionadas.add(i); else selecionadas.delete(i); desenharLote(); });
  on(card, 'click', '[data-aplicar-acao]', (b) => ocupado(b, () => executar(Number(b.dataset.aplicarAcao))));
  on(card, 'click', '[data-abrir-campo]', (b) => { const k = classes[Number(b.dataset.abrirCampo)]; abrirCampo(cliente, k.campo, { produtos: dados.produtos, produtoId: criativo()?.produtoId }); });
  on(card, 'click', '[data-aplicar-lote-btn]', (b) => ocupado(b, async () => {
    const fila = [...selecionadas].sort((a, z) => a - z);
    for (const [n, i] of fila.entries()) { b.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Ação ${n + 1} de ${fila.length}…`; await executar(i); }
  }));
  on(card, 'click', '[data-descartar-acao]', (b) => ocupado(b, async () => {
    const i = Number(b.dataset.descartarAcao);
    await registrar(i, { status: 'descartada' });
    $(`[data-proposta="${i}"]`, card).innerHTML = '<p class="hint">Descartada: nada foi mudado.</p>';
    decidir(i);
  }));
  on(card, 'click', '[data-criar-tarefa]', (b) => ocupado(b, async () => {
    const i = Number(b.dataset.criarTarefa), zona = $(`[data-proposta="${i}"]`, card);
    const t = await db.criar(COL.tarefas, zona._tarefa);
    await registrar(i, { status: 'tarefa', tarefaId: t.id });
    zona.innerHTML = `<p class="mt-1 text-sm text-emerald-700" data-tarefa-criada><i class="fa-solid fa-circle-check"></i> Tarefa criada: aparece na aba <a class="underline" href="#/c/${esc(cliente.id)}/campanhas">Campanhas</a>, em "Tarefas aceitas".</p>`;
    decidir(i);
  }));
  on(card, 'click', '[data-aceitar-acao]', (b) => ocupado(b, async () => {
    const i = Number(b.dataset.aceitarAcao), zona = $(`[data-proposta="${i}"]`, card), prop = zona._proposta, c = criativo();
    // Confere de novo na hora de salvar (o texto que vai para o banco é o que passou pela conferência).
    let versao;
    try { ({ versao } = await aceitarReescrita({ cliente, criativo: c, proposta: prop, nota: `Especialista (${especialista.nome}): ${acoes[i].acao}`.slice(0, 160) })); }
    catch (e) { if (e.bloqueio) { await registrar(i, { status: 'bloqueada', motivo: e.bloqueio, criativoId: c.id }); decidir(i); } throw e; }
    await registrar(i, { status: 'aceita', criativoId: c.id, versao });
    zona.innerHTML = `<p class="mt-1 text-sm text-emerald-700" data-versao-salva><i class="fa-solid fa-circle-check"></i> Salvo como versão v${versao} do criativo. A anterior continua no histórico de versões.</p>`;
    toast(`Nova versão (v${versao}) salva.`);
    if (classes[i].modo === 'peca' && peca) {
      abrirEstudio(c, cliente, { produtos: dados.produtos || [] }, {
        tipo: peca.tipo, formato: peca.formato, config: peca.config, baseadaEm: peca.id, especialista: { consultaId: consulta.id, acao: acoes[i].acao },
        aoFinalizar: async (nova) => { (dados.pecas ||= []).unshift(nova); await registrar(i, { status: 'peca', criativoId: c.id, versao, pecaId: nova.id }); },
      });
    }
    decidir(i);
  }));
}
