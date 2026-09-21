// Link de aprovação compartilhável.
//  - Admin: escolhe criativo(s) -> gera um link público (token aleatório) que aponta para um SNAPSHOT do que será exibido.
//  - Cliente final: abre o link sem login, vê só as peças selecionadas e pode apenas "Aprovar" ou "Pedir ajuste" (+ comentário).
//  - A resposta vai para gcc_aprovacao_respostas e volta ao painel pelo `sincronizarAprovacoes`.
// O snapshot (gcc_aprovacoes/{token}) contém só o necessário para exibir; nada mais do cliente/app é exposto pelo link.
// As regras do Firestore (firestore.rules) permitem ao público APENAS ler o documento do token e gravar a própria resposta.
import { db, COL } from '../core/storage.js';
import { acharTermosProibidos } from '../core/ia.js';
import { CHECKLIST_QUALIDADE, FORMATOS } from '../lib/constantes.js';
import { esc, $, on, modal, toast, copiar, ocupado, confirmar, dataBR, tag } from '../core/ui.js';

const rotuloFormato = (v) => (FORMATOS.find(([k]) => k === v) || [, v])[1];
const DIA = 864e5;

/** Token imprevisível (24 bytes aleatórios -> 32 caracteres url-safe). */
export function novoToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const linkDe = (token) => `${location.origin}${location.pathname}#/aprovar/${token}`;

/** Só vai para o cliente final o que passou no crivo interno: checklist completo e sem termos proibidos. */
export function motivoBloqueio(c, cliente) {
  if (!CHECKLIST_QUALIDADE.every(([k]) => c.checklist?.[k])) return 'checklist de qualidade incompleto';
  if (acharTermosProibidos(`${c.hook} ${c.copy} ${c.cta}`, cliente).length) return 'contém termos proibidos';
  return null;
}

/** Cria o link para um ou mais criativos e marca-os como "aguardando cliente". */
export async function criarLink(cliente, criativos, dias = 30) {
  const token = novoToken();
  await db.criar(COL.aprovacoes, {
    clienteId: cliente.id, clienteNome: cliente.nome, expiraMs: Date.now() + dias * DIA, itensIds: criativos.map((c) => c.id),
    // Snapshot: cópia do que será exibido. Editar o criativo depois NÃO altera o que o cliente vê.
    itens: criativos.map((c) => ({ id: c.id, nome: c.nome, hook: c.hook, copy: c.copy, cta: c.cta, formato: c.formato, framework: c.framework || '', arquivoUrl: c.arquivoUrl || null, arquivoNome: c.arquivoNome || null })),
  }, token);
  const quando = new Date().toISOString();
  await Promise.all(criativos.map((c) => {
    const patch = { status: 'pronto_aprovacao', aprovacaoToken: token, aprovacaoEnviadaEm: quando, aprovacaoCliente: null };
    Object.assign(c, patch);
    return db.atualizar(COL.criativos, c.id, patch);
  }));
  return { token, link: linkDe(token) };
}

export const revogarLink = (token) => db.remover(COL.aprovacoes, token);

/**
 * Traz as respostas do cliente final para o painel: guarda `aprovacaoCliente` no criativo e move o status
 * (aprovou -> "Aprovado"; pediu ajuste -> volta a "Rascunho"). Retorna quantos criativos mudaram.
 */
export async function sincronizarAprovacoes(cliente, criativos) {
  // Só criativos enviados nos últimos 60 dias (validade máxima do link): evita uma leitura extra a cada visita, para sempre.
  const comLink = criativos.filter((c) => c.aprovacaoToken && Date.now() - new Date(c.aprovacaoEnviadaEm || 0).getTime() < 60 * DIA);
  if (!comLink.length) return 0;
  const respostas = await db.listar(COL.respostas, { clienteId: cliente.id });
  let mudou = 0;
  for (const c of comLink) {
    const r = respostas.find((x) => x.token === c.aprovacaoToken && x.criativoId === c.id);
    if (!r || r.em === c.aprovacaoCliente?.em) continue;
    const anterior = c.aprovacaoCliente?.status;
    const seguePendente = c.status === 'pronto_aprovacao';
    const seguiaResposta = anterior && c.status === (anterior === 'aprovado' ? 'aprovado' : 'rascunho'); // cliente mudou de ideia e o admin não mexeu depois
    const patch = { aprovacaoCliente: { status: r.status, comentario: r.comentario || '', em: r.em } };
    if (seguePendente || seguiaResposta) patch.status = r.status === 'aprovado' ? 'aprovado' : 'rascunho';
    await db.atualizar(COL.criativos, c.id, patch);
    Object.assign(c, patch);
    mudou++;
  }
  return mudou;
}

/** Tag/resumo da resposta do cliente para os cards e o detalhe. */
export function tagAprovacao(c) {
  if (c.aprovacaoCliente?.status === 'aprovado') return tag('aprovado pelo cliente', 'tag-ok');
  if (c.aprovacaoCliente?.status === 'ajuste') return tag('cliente pediu ajuste', 'tag-bad');
  return '';
}

// ---------------- painel do admin: gerar e gerenciar links ----------------
export function abrirEnvio(cliente, criativos, { preSelecionar = [], aoMudar } = {}) {
  const elegiveis = criativos.filter((c) => !['em_uso', 'pausado', 'encerrado'].includes(c.status));
  const m = modal('Enviar para aprovação do cliente', '<div id="env"></div>', { largo: true });
  const alvo = $('#env', m.el);

  async function desenhar(novo = null) {
    const links = (await db.listar(COL.aprovacoes, { clienteId: cliente.id })).filter((l) => l.expiraMs > Date.now());
    const respostas = links.length ? await db.listar(COL.respostas, { clienteId: cliente.id }) : [];
    alvo.innerHTML = `
      ${novo ? `<div class="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800"><b>Link criado.</b> Envie ao cliente; ele abre sem login e só vê as peças selecionadas.
        <div class="mt-2 flex gap-2"><input class="input" readonly value="${esc(novo.link)}" data-link-novo><button class="btn-primary btn-sm shrink-0" data-copiar-novo><i class="fa-solid fa-copy"></i> Copiar</button></div>
        <p class="hint">Válido por ${novo.dias} dias. O cliente pode apenas aprovar ou pedir ajuste, com um comentário.</p></div>` : ''}
      <p class="caption mb-2">Escolha as peças. O cliente vê uma cópia do que está agora; editar depois não muda o que ele vê (gere um novo link).</p>
      <div class="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
        ${elegiveis.length ? elegiveis.map((c) => { const b = motivoBloqueio(c, cliente); return `<label class="flex items-start gap-2 rounded px-2 py-1.5 text-sm ${b ? 'opacity-60' : 'hover:bg-slate-50'}">
          <input type="checkbox" data-sel="${c.id}" class="mt-1" ${b ? 'disabled' : ''} ${preSelecionar.includes(c.id) && !b ? 'checked' : ''}>
          <span class="min-w-0"><b>${esc(c.nome)}</b> <span class="text-slate-500">— “${esc(c.hook)}”</span>${b ? `<br><span class="text-xs text-amber-600">Não pode ser enviado: ${b}</span>` : ''}</span></label>`; }).join('')
          : '<p class="p-2 text-sm text-slate-500">Nenhum criativo disponível para envio.</p>'}</div>
      <div class="mt-3 flex flex-wrap items-end gap-3"><div><label class="label">Validade do link</label>
        <select class="input" data-dias><option value="7">7 dias</option><option value="15">15 dias</option><option value="30" selected>30 dias</option><option value="60">60 dias</option></select></div>
        <button class="btn-primary" data-gerar><i class="fa-solid fa-link"></i> Gerar link de aprovação</button></div>
      ${links.length ? `<h4 class="mb-2 mt-5 text-sm font-semibold">Links ativos deste cliente</h4><ul class="space-y-2">${links.map((l) => {
        const rs = respostas.filter((r) => r.token === l.id);
        const ap = rs.filter((r) => r.status === 'aprovado').length, aj = rs.filter((r) => r.status === 'ajuste').length;
        return `<li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
          <span>${l.itensIds.length} peça(s) · criado em ${dataBR(l.criadoEm)} · expira em ${dataBR(new Date(l.expiraMs).toISOString())}
            <br>${tag(ap + ' aprovada(s)', ap ? 'tag-ok' : '')} ${tag(aj + ' com pedido de ajuste', aj ? 'tag-bad' : '')} ${tag((l.itensIds.length - rs.length) + ' sem resposta')}</span>
          <span class="flex gap-1"><button class="btn-ghost btn-sm" data-copiar-link="${l.id}"><i class="fa-solid fa-copy"></i> Copiar link</button>
            <button class="btn-danger btn-sm" data-revogar="${l.id}" title="O link deixa de funcionar imediatamente">Revogar</button></span></li>`; }).join('')}</ul>` : ''}`;
  }

  on(alvo, 'click', '[data-gerar]', async (b) => {
    const ids = [...alvo.querySelectorAll('[data-sel]:checked')].map((i) => i.dataset.sel);
    if (!ids.length) return toast('Selecione ao menos um criativo.', 'erro');
    const dias = Number($('[data-dias]', alvo).value) || 30;
    await ocupado(b, async () => {
      const r = await criarLink(cliente, elegiveis.filter((c) => ids.includes(c.id)), dias);
      aoMudar?.();
      await desenhar({ ...r, dias });
    });
  });
  on(alvo, 'click', '[data-copiar-novo]', () => copiar($('[data-link-novo]', alvo).value));
  on(alvo, 'click', '[data-copiar-link]', (b) => copiar(linkDe(b.dataset.copiarLink)));
  on(alvo, 'click', '[data-revogar]', async (b) => {
    if (!(await confirmar('Revogar este link? Quem o tiver não conseguirá mais abrir nem responder.', 'Revogar'))) return;
    await revogarLink(b.dataset.revogar); toast('Link revogado.'); await desenhar();
  });
  desenhar();
  return m;
}

// ---------------- página pública (sem login) ----------------
const ext = (nome) => String(nome || '').split('.').pop().toLowerCase();

function midia(i) {
  if (!i.arquivoUrl) return '';
  const e = ext(i.arquivoNome);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return `<img src="${esc(i.arquivoUrl)}" alt="${esc(i.nome)}" class="mb-3 max-h-96 w-full rounded-lg object-contain bg-slate-100">`;
  if (['mp4', 'mov', 'webm'].includes(e)) return `<video src="${esc(i.arquivoUrl)}" controls playsinline class="mb-3 max-h-96 w-full rounded-lg bg-black"></video>`;
  return `<a href="${esc(i.arquivoUrl)}" target="_blank" rel="noopener" class="mb-3 inline-block text-sm text-indigo-600 underline">Abrir arquivo da peça</a>`;
}

export async function viewPublica(host, token) {
  const app = document.createElement('div'); // contêiner novo: listeners não se acumulam se o link for aberto de novo
  host.replaceChildren(app);
  // Página pública: não indexar.
  if (!document.querySelector('meta[name=robots]')) document.head.insertAdjacentHTML('beforeend', '<meta name="robots" content="noindex,nofollow">');
  document.title = 'Aprovação de criativos';
  app.innerHTML = '<div class="mx-auto max-w-2xl p-6"><p class="caption"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</p></div>';

  let doc = null;
  try { doc = await db.obter(COL.aprovacoes, token); } catch { doc = null; } // regra nega leitura de link expirado
  if (!doc || !(doc.expiraMs > Date.now())) {
    app.innerHTML = '<div class="mx-auto max-w-2xl p-6"><div class="card text-center"><div class="mb-2 text-3xl text-slate-300"><i class="fa-solid fa-link-slash"></i></div><p class="font-semibold">Este link não está mais disponível.</p><p class="caption">Ele pode ter expirado ou sido cancelado. Peça um novo link a quem o enviou.</p></div></div>';
    return;
  }
  const estado = {}; // criativoId -> resposta
  await Promise.all(doc.itens.map(async (i) => { try { estado[i.id] = await db.obter(COL.respostas, `${token}_${i.id}`); } catch { estado[i.id] = null; } }));

  const cartao = (i) => {
    const r = estado[i.id];
    return `<article class="card mb-4" data-item="${esc(i.id)}">
      <div class="mb-2 flex flex-wrap items-center gap-2"><h2 class="text-lg font-semibold">${esc(i.nome)}</h2>${tag(rotuloFormato(i.formato))}${i.framework ? tag(i.framework, 'tag-info') : ''}</div>
      ${midia(i)}
      <p class="font-semibold">“${esc(i.hook)}”</p>
      <p class="mt-2 whitespace-pre-wrap text-sm">${esc(i.copy)}</p>
      ${i.cta ? `<p class="mt-2 text-sm"><b>Chamada para ação:</b> ${esc(i.cta)}</p>` : ''}
      <div class="mt-4 border-t border-slate-200 pt-3" data-resposta>${blocoResposta(i, r)}</div></article>`;
  };
  const blocoResposta = (i, r) => (r && !estado[`_editar_${i.id}`]
    ? `<div class="rounded-lg p-3 text-sm ${r.status === 'aprovado' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}">
        ${r.status === 'aprovado' ? '<b><i class="fa-solid fa-circle-check"></i> Você aprovou esta peça.</b>' : '<b><i class="fa-solid fa-pen"></i> Você pediu ajuste.</b>'}
        ${r.comentario ? `<p class="mt-1 whitespace-pre-wrap">${esc(r.comentario)}</p>` : ''}
        <button class="btn-ghost btn-sm mt-2" data-alterar="${esc(i.id)}">Alterar resposta</button></div>`
    : `<label class="label" for="c_${esc(i.id)}">Comentário <span class="font-normal text-slate-500">(opcional ao aprovar; explique o ajuste ao pedir)</span></label>
      <textarea id="c_${esc(i.id)}" class="input" rows="3" maxlength="1000" data-comentario>${esc(r?.comentario || '')}</textarea>
      <p class="hint" data-erro role="alert"></p>
      <div class="mt-2 flex flex-wrap gap-2"><button class="btn-primary" data-responder="aprovado" data-id="${esc(i.id)}"><i class="fa-solid fa-check"></i> Aprovar</button>
        <button class="btn-ghost" data-responder="ajuste" data-id="${esc(i.id)}"><i class="fa-solid fa-pen"></i> Pedir ajuste</button></div>`);

  const desenhar = () => {
    // O redesenho não pode apagar o comentário que a pessoa já digitou nas OUTRAS peças.
    const digitado = {};
    app.querySelectorAll('[data-item]').forEach((cx) => { const t = cx.querySelector('[data-comentario]'); if (t && t.value) digitado[cx.dataset.item] = t.value; });
    app.innerHTML = `<div class="mx-auto max-w-2xl p-4 sm:p-6">
      <header class="mb-5"><p class="caption">${esc(doc.clienteNome)}</p><h1 class="text-2xl font-bold">Aprovação de criativos</h1>
        <p class="caption">Confira ${doc.itens.length === 1 ? 'a peça abaixo' : 'as peças abaixo'} e escolha <b>Aprovar</b> ou <b>Pedir ajuste</b>. Você pode deixar um comentário.</p></header>
      ${doc.itens.map(cartao).join('')}
      <p class="hint text-center">Este link é pessoal. Ele permite apenas ver estas peças e responder sobre elas.</p></div>`;
    app.querySelectorAll('[data-item]').forEach((cx) => { const t = cx.querySelector('[data-comentario]'); if (t && digitado[cx.dataset.item] !== undefined) t.value = digitado[cx.dataset.item]; });
  };
  desenhar();

  on(app, 'click', '[data-alterar]', (b) => { estado[`_editar_${b.dataset.alterar}`] = true; desenhar(); });
  on(app, 'click', '[data-responder]', async (b) => {
    const id = b.dataset.id, status = b.dataset.responder;
    const cx = b.closest('[data-item]');
    const comentario = $('[data-comentario]', cx).value.trim();
    if (status === 'ajuste' && !comentario) { $('[data-erro]', cx).textContent = 'Conte o que precisa ser ajustado para pedirmos a alteração.'; $('[data-erro]', cx).className = 'hint text-rose-600'; return; }
    await ocupado(b, async () => {
      const resp = { token, clienteId: doc.clienteId, criativoId: id, status, comentario: comentario.slice(0, 1000), em: new Date().toISOString() };
      try { await db.definir(COL.respostas, `${token}_${id}`, resp); }
      catch { throw new Error('Não foi possível enviar sua resposta. O link pode ter expirado ou sido cancelado; peça um novo link a quem o enviou.'); }
      estado[id] = resp; delete estado[`_editar_${id}`];
      desenhar();
    });
  });
}
