// Peças finalizadas (Galeria): guardar a peça do Estúdio no Storage (gcc/<cliente>/pecas/<peça>/), listar, comparar lado
// a lado, marcar Nova/Usar/Descartar, mandar uma peça "Usar" para o link de aprovação que já existe, baixar com o
// formato no nome e excluir as descartadas (com confirmação; peça que já foi num link enviado mantém o arquivo, como
// os demais arquivos de link). O que é puro (nome, registro, filtros, cota) está em lib/pecas.js.
import { db, COL, enviarArquivoComProgresso, removerArquivo } from '../core/storage.js';
import {
  STATUS_PECA, STATUS_PECA_COR, statusDaPeca, caminhoPeca, novoIdPeca, registroPeca, filtrarPecas, planoExclusaoPecas, pecaEmLinkEnviado,
  usoArmazenamento, situacaoCota, formatarBytes, planoCompressaoVideo, COTA_STORAGE,
} from '../lib/pecas.js';
import { comprimirVideoPeca } from '../lib/video.js';
import { rotuloModelo } from '../lib/ganchos.js';
import { statusAposTrocarArquivo } from './aprovacao.js';
import { esc, $, on, modal, toast, ocupado, confirmar, tag, dataBR, opcoes, mostrarResultado } from '../core/ui.js';

const avisarPecas = (clienteId) => { try { document.dispatchEvent(new CustomEvent('gcc:pecas', { detail: { clienteId } })); } catch { /* fora do navegador */ } };

// ---------- miniatura ----------
const LARGURA_MINI = 270;
function canvasMini(fonte, w, h) {
  const e = Math.min(1, LARGURA_MINI / w), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * e)); c.height = Math.max(1, Math.round(h * e));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(fonte, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}
/** Miniatura pequena (JPEG ~270 px) gravada no próprio registro: a Galeria abre sem baixar as peças. */
export async function gerarMiniatura(blob, tipo) {
  if (tipo === 'imagem') {
    const bmp = await createImageBitmap(blob);
    try { return canvasMini(bmp, bmp.width, bmp.height); } finally { bmp.close?.(); }
  }
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
    await new Promise((ok, falha) => { v.onloadeddata = ok; v.onerror = () => falha(new Error('Não consegui abrir o vídeo para a miniatura.')); v.src = url; });
    await new Promise((ok) => { v.onseeked = ok; v.currentTime = Math.min(0.5, (v.duration || 1) / 2); setTimeout(ok, 1500); });
    return canvasMini(v, v.videoWidth || 1080, v.videoHeight || 1920);
  } finally { URL.revokeObjectURL(url); }
}

// ---------- guardar ----------
/**
 * Guarda a peça finalizada. `peca` = { blob, tipo: 'imagem'|'video', formato, ext, duracao, config, baseadaEm, especialista }.
 * aoEtapa(texto, fracao) recebe o andamento (comprimir, miniatura, enviar). Devolve o registro criado.
 * Vídeo é comprimido antes (H.264/MP4 ~5 Mbps) quando está pesado ou em WebM; se a compressão falhar, guarda o original
 * e avisa (o aviso fica no registro e na tela).
 */
export async function salvarPeca(cliente, criativo, peca, { aoEtapa = () => {} } = {}) {
  let { blob, ext } = peca;
  let comprimido = false, avisoCompressao = '';
  if (peca.tipo === 'video') {
    const plano = planoCompressaoVideo({ bytes: blob.size, duracao: peca.duracao, ext });
    if (plano.comprimir) {
      aoEtapa(`Comprimindo o vídeo (${plano.motivo})…`, 0);
      try {
        blob = await comprimirVideoPeca({ arquivo: new File([blob], `entrada.${ext}`, { type: blob.type }), aoProgresso: (p) => aoEtapa('Comprimindo o vídeo…', p) });
        ext = 'mp4'; comprimido = true;
      } catch (e) { avisoCompressao = `Não consegui comprimir (${e.message || e}); guardei o vídeo como foi gravado.`; }
    }
  }
  aoEtapa('Gerando a miniatura…', 0);
  const miniatura = await gerarMiniatura(blob, peca.tipo).catch(() => '');
  const id = novoIdPeca();
  const reg = registroPeca({ cliente, criativo, tipo: peca.tipo, formato: peca.formato, ext, tamanho: blob.size, duracao: peca.duracao ?? null, miniatura, config: peca.config || {}, comprimido, baseadaEm: peca.baseadaEm || null, especialista: peca.especialista || null });
  const caminho = caminhoPeca(cliente.id, id, reg.nomeArquivo);
  aoEtapa('Enviando…', 0);
  const r = await enviarArquivoComProgresso(caminho, blob, { tipo: peca.tipo === 'video' ? 'video/mp4' : 'image/jpeg', nomeDownload: reg.nomeArquivo, aoProgresso: (p) => aoEtapa('Enviando…', p) });
  try {
    const salvo = await db.criar(COL.pecas, { ...reg, url: r.url, path: r.path, ...(avisoCompressao ? { avisoCompressao } : {}) }, id);
    avisarPecas(cliente.id);
    return salvo;
  } catch (e) { await removerArquivo(r.path, { peca: true }); throw e; } // sem registro, o arquivo não fica órfão
}

export async function definirStatusPeca(peca, status) {
  await db.atualizar(COL.pecas, peca.id, { status });
  peca.status = status;
  avisarPecas(peca.clienteId);
}

/** Exclui as peças "Descartar" do plano (lib/pecas.js). Arquivo de peça num link enviado fica (cliente.arquivosRetidos). */
export async function excluirPecas(cliente, pecas, criativos) {
  const plano = planoExclusaoPecas(pecas, criativos);
  if (plano.manter.length) {
    const cli = await db.obter(COL.clientes, cliente.id).catch(() => null);
    const atuais = cli?.arquivosRetidos || [];
    const novos = plano.manter.filter((p) => p.path && !atuais.some((a) => a.path === p.path)).map((p) => ({ path: p.path, motivo: 'peça da Galeria num link de aprovação já enviado', em: new Date().toISOString() }));
    if (novos.length) await db.atualizar(COL.clientes, cliente.id, { arquivosRetidos: [...atuais, ...novos] });
  }
  for (const p of plano.apagar) await removerArquivo(p.path, { peca: true });
  for (const p of [...plano.apagar, ...plano.manter]) {
    // Era a peça final de um criativo (sem link enviado): o criativo volta a ficar sem arquivo, em vez de apontar para nada.
    const c = criativos.find((x) => x.arquivoPath && x.arquivoPath === p.path);
    if (c && !plano.manter.includes(p)) { const patch = { arquivoUrl: null, arquivoPath: null, arquivoNome: null }; await db.atualizar(COL.criativos, c.id, patch); Object.assign(c, patch); }
    await db.remover(COL.pecas, p.id);
  }
  avisarPecas(cliente.id);
  return plano;
}

/** A peça vira a peça final do criativo (é o arquivo que o link de aprovação mostra). */
export async function usarComoPecaFinal(criativo, peca) {
  if (criativo.arquivoPath === peca.path) return {};
  const patch = { arquivoUrl: peca.url, arquivoPath: peca.path, arquivoNome: peca.nomeArquivo, ...statusAposTrocarArquivo(criativo) };
  await db.atualizar(COL.criativos, criativo.id, patch);
  Object.assign(criativo, patch);
  return patch;
}

/** Baixa com o formato no nome. Sem CORS no bucket, abre o link (o arquivo já foi enviado com o nome de download). */
export async function baixarPeca(peca) {
  const nome = peca.nomeArquivo || `peca.${peca.ext || 'jpg'}`;
  try {
    const r = await fetch(peca.url); if (!r.ok) throw new Error();
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch { window.open(peca.url, '_blank', 'noopener'); }
}

// ---------- tela ----------
const midiaHtml = (p, cls = '') => (p.tipo === 'video'
  ? `<video src="${esc(p.url)}" controls playsinline preload="metadata" ${p.miniatura ? `poster="${esc(p.miniatura)}"` : ''} class="${cls} bg-black"></video>`
  : `<img src="${esc(p.url)}" alt="Peça ${esc(p.formatoNome)} de ${esc(p.criativoNome)}" class="${cls} object-contain">`);
const proporcao = (p) => (p.formatoNome?.includes('9x16') ? 'aspect-[9/16]' : p.formatoNome?.includes('1x1') ? 'aspect-square' : 'aspect-[4/5]');
const rotStatus = (s) => STATUS_PECA.find(([k]) => k === s)?.[1] || s;

const botoesStatus = (p) => `<div class="flex flex-wrap gap-1" role="group" aria-label="Status da peça">${STATUS_PECA.map(([k, r]) => `<button type="button" class="btn-sm ${statusDaPeca(p) === k ? 'btn-primary' : 'btn-ghost'} min-h-[44px] min-w-[4.25rem] flex-1 justify-center !px-1 text-xs" data-status-peca="${esc(p.id)}" data-valor="${k}" aria-pressed="${statusDaPeca(p) === k}">${r}</button>`).join('')}</div>`;

/** Uso do armazenamento pelas peças (cliente ou geral) e a cota gratuita, numa linha. */
export function linhaUso(pecas) {
  const u = usoArmazenamento(pecas), s = situacaoCota(u.bytes);
  return `<span data-uso-pecas>${u.quantidade} peça(s) · ${formatarBytes(u.bytes)} no Storage</span>${s.perto || s.passou ? ` <span class="tag ${s.passou ? 'tag-bad' : 'tag-warn'}">${s.passou ? 'passou' : 'perto'} da cota gratuita de ${formatarBytes(COTA_STORAGE.gratisBytes)}</span>` : ''}`;
}

/**
 * Galeria do cliente. ctx: { cliente, pecas, produtos, criativos, aoMudar, aoPedirEspecialista(peca), aoEnviarAprovacao(criativos, pecas) }.
 */
export function montarGaleria(alvo, ctx) {
  const { cliente, produtos = [], criativos = [] } = ctx;
  const pecas = ctx.pecas;
  const filtro = { produtoId: '', formato: '', status: '' };
  const comparar = new Set();
  const formatos = [...new Set(pecas.map((p) => p.formatoNome).filter(Boolean))];
  const nomeProduto = (id) => produtos.find((p) => p.id === id)?.nome || '';

  const cartao = (p) => {
    const st = statusDaPeca(p);
    return `<li class="card scroll-mt-36 !p-2 ${comparar.has(p.id) ? 'ring-2 ring-indigo-500' : ''}" data-peca="${esc(p.id)}" data-status="${st}">
      <button type="button" class="relative block w-full overflow-hidden rounded-lg bg-slate-100 ${proporcao(p)}" data-abrir-peca="${esc(p.id)}" aria-label="Abrir em tamanho real: ${esc(p.formatoNome)} de ${esc(p.criativoNome)}">
        ${p.miniatura ? `<img src="${esc(p.miniatura)}" alt="" class="h-full w-full object-cover" loading="lazy">` : `<span class="flex h-full items-center justify-center text-slate-400"><i class="fa-solid fa-${p.tipo === 'video' ? 'film' : 'image'} text-2xl"></i></span>`}
        ${p.tipo === 'video' ? '<span class="absolute inset-0 flex items-center justify-center"><i class="fa-solid fa-circle-play text-4xl text-white drop-shadow"></i></span>' : ''}</button>
      <div class="mt-2 flex flex-wrap items-center gap-1 text-xs">${tag(rotStatus(st), STATUS_PECA_COR[st])}${tag(p.formatoNome || p.formato)}${p.tipo === 'video' ? tag(`vídeo${p.duracao ? ` ${Math.round(p.duracao)} s` : ''}`) : ''}${p.modeloGancho ? tag(rotuloModelo(p.modeloGancho)) : ''}${p.baseadaEm ? tag('nova versão', 'tag-info') : ''}</div>
      <p class="mt-1 line-clamp-2 text-sm font-medium">${esc(p.criativoNome || 'Criativo')}</p>
      <p class="hint !mt-0">${esc(nomeProduto(p.produtoId) || 'sem produto')} · ${dataBR(p.criadoEm)} · ${formatarBytes(p.tamanho)}</p>
      ${p.avisoCompressao ? `<p class="mt-1 text-xs text-amber-700" data-aviso-compressao>${esc(p.avisoCompressao)}</p>` : ''}
      <div class="mt-2 space-y-1">${botoesStatus(p)}
        <label class="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" class="h-5 w-5" data-comparar="${esc(p.id)}" ${comparar.has(p.id) ? 'checked' : ''}> Comparar</label>
        ${st === 'usar' ? `<div class="flex flex-wrap gap-1"><button type="button" class="btn-ghost btn-sm min-h-[44px] flex-1" data-baixar-peca="${esc(p.id)}"><i class="fa-solid fa-download"></i> Baixar</button>
          <button type="button" class="btn-ghost btn-sm min-h-[44px] flex-1" data-aprovar-peca="${esc(p.id)}"><i class="fa-solid fa-paper-plane"></i> Aprovação</button></div>` : ''}
        ${st === 'descartar' ? `<button type="button" class="btn-danger btn-sm min-h-[44px] w-full" data-excluir-peca="${esc(p.id)}"><i class="fa-solid fa-trash"></i> Excluir</button>` : ''}
        ${ctx.aoPedirEspecialista ? `<button type="button" class="btn-ghost btn-sm min-h-[44px] w-full" data-especialista-peca="${esc(p.id)}"><i class="fa-solid fa-user-tie"></i> Pedir opinião a um especialista</button>` : ''}</div></li>`;
  };

  const desenhar = () => {
    const itens = filtrarPecas(pecas, filtro);
    const descartadas = pecas.filter((p) => statusDaPeca(p) === 'descartar');
    alvo.innerHTML = `<div data-galeria>
      <p class="caption mb-2">${linhaUso(pecas)}</p>
      ${pecas.length ? `<div class="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div><label class="label" for="g-prod">Produto</label><select class="input" id="g-prod" data-filtro-galeria="produtoId"><option value="">Todos</option>${opcoes(produtos.map((p) => [p.id, p.nome]), filtro.produtoId)}</select></div>
        <div><label class="label" for="g-fmt">Formato</label><select class="input" id="g-fmt" data-filtro-galeria="formato"><option value="">Todos</option>${opcoes(formatos.map((f) => [f, f]), filtro.formato)}</select></div>
        <div><label class="label" for="g-st">Status</label><select class="input" id="g-st" data-filtro-galeria="status"><option value="">Todos</option>${opcoes(STATUS_PECA, filtro.status)}</select></div></div>
      <div class="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-sm" data-barra-galeria>
        <button type="button" class="btn-primary btn-sm min-h-[44px]" data-comparar-ir ${comparar.size >= 2 ? '' : 'disabled'}><i class="fa-solid fa-table-columns"></i> Comparar lado a lado (${comparar.size}/4)</button>
        ${descartadas.length ? `<button type="button" class="btn-danger btn-sm min-h-[44px]" data-excluir-descartadas><i class="fa-solid fa-trash"></i> Excluir descartadas (${descartadas.length})</button>` : ''}
        ${comparar.size ? '<button type="button" class="btn-ghost btn-sm min-h-[44px]" data-limpar-comparar>Limpar seleção</button>' : ''}</div>` : ''}
      ${itens.length ? `<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-grade-pecas>${itens.map(cartao).join('')}</ul>`
        : `<p class="hint" data-galeria-vazia>${pecas.length ? 'Nenhuma peça com esses filtros.' : 'Nenhuma peça finalizada ainda. No passo 3, abra o Estúdio e clique em "Finalizar peça".'}</p>`}</div>`;
  };
  desenhar();

  const acharPeca = (id) => pecas.find((p) => p.id === id);
  on(alvo, 'change', '[data-filtro-galeria]', (s) => { filtro[s.dataset.filtroGaleria] = s.value; desenhar(); });
  on(alvo, 'change', '[data-comparar]', (c) => {
    if (c.checked && comparar.size >= 4) { c.checked = false; toast('Compare até 4 peças de cada vez.', 'erro'); return; }
    if (c.checked) comparar.add(c.dataset.comparar); else comparar.delete(c.dataset.comparar);
    desenhar();
  });
  on(alvo, 'click', '[data-limpar-comparar]', () => { comparar.clear(); desenhar(); });
  on(alvo, 'click', '[data-status-peca]', (b) => ocupado(b, async () => {
    const p = acharPeca(b.dataset.statusPeca); if (!p) return;
    await definirStatusPeca(p, b.dataset.valor); desenhar(); ctx.aoMudar?.();
  }));
  on(alvo, 'click', '[data-abrir-peca]', (b) => abrirPeca(acharPeca(b.dataset.abrirPeca)));
  on(alvo, 'click', '[data-comparar-ir]', () => abrirComparacao());
  on(alvo, 'click', '[data-baixar-peca]', (b) => ocupado(b, () => baixarPeca(acharPeca(b.dataset.baixarPeca))));
  on(alvo, 'click', '[data-aprovar-peca]', (b) => enviarAprovacao([acharPeca(b.dataset.aprovarPeca)]));
  on(alvo, 'click', '[data-especialista-peca]', (b) => ctx.aoPedirEspecialista?.(acharPeca(b.dataset.especialistaPeca)));
  const excluir = async (lista) => {
    const plano = planoExclusaoPecas(lista, criativos);
    if (!plano.apagar.length && !plano.manter.length) return toast('Só dá para excluir peça marcada como "Descartar".', 'erro');
    if (!(await confirmar(plano.texto, 'Excluir'))) return;
    await excluirPecas(cliente, lista, criativos);
    for (const p of [...plano.apagar, ...plano.manter]) { pecas.splice(pecas.indexOf(p), 1); comparar.delete(p.id); }
    desenhar(); ctx.aoMudar?.();
    toast(`${plano.apagar.length + plano.manter.length} peça(s) excluída(s)${plano.manter.length ? ` (${plano.manter.length} arquivo(s) guardado(s) para o link de aprovação)` : ''}.`);
  };
  on(alvo, 'click', '[data-excluir-peca]', (b) => excluir([acharPeca(b.dataset.excluirPeca)]));
  on(alvo, 'click', '[data-excluir-descartadas]', () => excluir(pecas.filter((p) => statusDaPeca(p) === 'descartar')));

  async function enviarAprovacao(lista) {
    // Um link mostra um arquivo por criativo: cada peça vira a peça final do criativo dela (a anterior fica na Galeria).
    const porCriativo = new Map();
    for (const p of lista) if (p && !porCriativo.has(p.criativoId)) porCriativo.set(p.criativoId, p);
    const pares = [...porCriativo.entries()].map(([id, p]) => [criativos.find((c) => c.id === id), p]).filter(([c]) => c);
    if (!pares.length) return toast('O criativo desta peça foi excluído: não dá para enviar ao link de aprovação.', 'erro');
    for (const [c, p] of pares) await usarComoPecaFinal(c, p);
    ctx.aoEnviarAprovacao?.(pares.map(([c]) => c), pares.map(([, p]) => p));
  }

  function abrirPeca(p) {
    if (!p) return;
    const m = modal(`${p.criativoNome || 'Peça'} · ${p.formatoNome}`, `<div data-peca-cheia="${esc(p.id)}">
      <div class="flex justify-center rounded-lg bg-slate-100 p-1">${midiaHtml(p, 'max-h-[75vh] w-auto max-w-full rounded')}</div>
      <p class="mt-2 text-sm"><b>Gancho:</b> ${esc(p.texto?.hook || '')}${p.texto?.cta ? ` · <b>CTA:</b> ${esc(p.texto.cta)}` : ''}</p>
      <p class="hint">${dataBR(p.criadoEm)} · ${formatarBytes(p.tamanho)}${p.comprimido ? ' · comprimido para o Instagram' : ''}${pecaEmLinkEnviado(p, criativos) ? ' · já foi num link de aprovação' : ''}</p>
      <div class="mt-2">${botoesStatus(p)}</div>
      <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-baixar-cheia><i class="fa-solid fa-download"></i> Baixar (${esc(p.nomeArquivo)})</button></div></div>`, { largo: true });
    on(m.el, 'click', '[data-status-peca]', (b) => ocupado(b, async () => { await definirStatusPeca(p, b.dataset.valor); m.el.querySelectorAll('[data-status-peca]').forEach((x) => { const sel = x.dataset.valor === p.status; x.classList.toggle('btn-primary', sel); x.classList.toggle('btn-ghost', !sel); x.setAttribute('aria-pressed', sel); }); desenhar(); ctx.aoMudar?.(); }));
    on(m.el, 'click', '[data-baixar-cheia]', (b) => ocupado(b, () => baixarPeca(p)));
  }

  function abrirComparacao() {
    const lista = [...comparar].map(acharPeca).filter(Boolean);
    if (lista.length < 2) return;
    const m = modal(`Comparar ${lista.length} peças`, `<div class="grid grid-cols-2 gap-2 ${lista.length > 2 ? 'lg:grid-cols-4' : ''}" data-comparacao>${lista.map((p) => `<div class="min-w-0" data-comparada="${esc(p.id)}">
      <div class="overflow-hidden rounded-lg bg-slate-100 ${proporcao(p)}">${midiaHtml(p, 'h-full w-full')}</div>
      <p class="mt-1 line-clamp-2 text-sm font-medium">${esc(p.criativoNome)}</p><p class="hint !mt-0">${esc(p.formatoNome)}${p.modeloGancho ? ` · ${esc(rotuloModelo(p.modeloGancho))}` : ''}</p>
      <div class="mt-1">${botoesStatus(p)}</div></div>`).join('')}</div>`, { largo: true });
    on(m.el, 'click', '[data-status-peca]', (b) => ocupado(b, async () => {
      const p = acharPeca(b.dataset.statusPeca); await definirStatusPeca(p, b.dataset.valor);
      const caixa = m.el.querySelector(`[data-comparada="${CSS.escape(p.id)}"]`);
      caixa.querySelectorAll('[data-status-peca]').forEach((x) => { const sel = x.dataset.valor === p.status; x.classList.toggle('btn-primary', sel); x.classList.toggle('btn-ghost', !sel); x.setAttribute('aria-pressed', sel); });
      desenhar(); ctx.aoMudar?.();
    }));
  }

  return { redesenhar: desenhar, mostrar: (texto) => mostrarResultado($('[data-galeria]', alvo), texto) };
}
