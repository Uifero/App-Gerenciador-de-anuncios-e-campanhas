// Aba Criativos = "Criar criativos": fluxo guiado de 4 passos (lib/etapas-criativos.js), no mesmo padrão do "Montar
// site". Reorganiza o que já existia: geração em lote com a biblioteca de ganchos (gerarCriativos), Estúdio (já ajustado
// para cada ideia), especialistas e o link de aprovação; o que é avançado fica em "Mais opções" de cada passo (fechado).
// A lista completa continua em "Todos os criativos" (#/c/<id>/criativos/todos). Rota: #/c/<id>/criativos/<1-4>; sem
// número, abre no 1º passo com "Falta algo" (ou na Galeria, quando há peças e nenhum fluxo em andamento).
// O fluxo em andamento fica em cliente.fluxoCriativos (só as escolhas e as ideias ainda não salvas); a ideia marcada
// vira criativo ao produzir, e daí em diante o texto é lido do criativo (fonte única).
import { db, COL } from '../core/storage.js';
import { gerarCriativos } from '../core/ia.js';
import { obterConfig } from './configuracoes.js';
import { abrirEstudio } from './estudio.js';
import { montarEspecialistas, abrirEspecialistas } from './especialistas.js';
import { abrirBiblioteca } from './modelos-prompt.js';
import { abrirMateriais } from './materiais-cliente.js';
import { abrirProduto } from './produtos.js';
import { abrirEnvio } from './aprovacao.js';
import { montarQuestionarioNaAba } from './perguntas-site.js';
import { montarGaleria } from './pecas.js';
import { briefsAbertos } from './tarefas-site.js';
import { salvarNovo, abrirCriativo, resumoProduto } from './criativos.js';
import {
  ETAPAS_CRIATIVOS, DESTINOS_FLUXO, statusEtapasCriativos, passoInicialCriativos, rotaCriativos, destinoDoFluxo, ideiasMarcadas,
  formatoDaIdeia, briefingDoFluxo, ideiaDe, fluxoEmAndamento,
} from '../lib/etapas-criativos.js';
import { comoAnunciaDe } from '../lib/anuncio.js';
import { motivoSaude, achadosSaude, ehProdutoSaude, AVISO_META_SAUDE } from '../lib/saude.js';
import { GANCHOS, GRUPOS_GANCHO, nomeGrupo, rotuloModelo, motivoGancho } from '../lib/ganchos.js';
import { NARRATIVAS, ETAPAS_FUNIL } from '../lib/narrativas.js';
import { FRAMEWORKS, MODELOS_CRIATIVO, FORMATOS } from '../lib/constantes.js';
import { STATUS_ETAPA } from '../lib/etapas-site.js';
import { esc, $, on, cabecalho, tag, toast, ocupado, opcoes, confirmar, mostrarResultado, faixaRolavel, iaNota } from '../core/ui.js';

const COR_STATUS = { completo: 'bg-emerald-50 text-emerald-800 border-emerald-300', falta: 'bg-amber-50 text-amber-800 border-amber-300' };
const ICONE_STATUS = { completo: 'circle-check', falta: 'circle-exclamation' };
const rotulo = (lista, v) => (lista.find(([k]) => k === v) || [, v])[1];
const novoIdIdeia = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const opcoesGancho = () => GRUPOS_GANCHO.map((g) => `<optgroup label="${esc(nomeGrupo(g))}">${GANCHOS.filter((x) => x.grupo === g).sort((a, b) => a.n - b.n).map((x) => `<option value="${x.n}">${x.n}. ${esc(x.texto)}${x.cuidado ? ' (*)' : ''}</option>`).join('')}</optgroup>`).join('');

/** Ditado (reconhecimento de voz do navegador). Sem suporte: o botão some e a dica sugere o microfone do teclado. */
function ligarDitado(botao, campo) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) { botao.hidden = true; botao.nextElementSibling?.removeAttribute('hidden'); return; }
  let rec = null;
  botao.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = false; rec.continuous = false;
    botao.setAttribute('aria-pressed', 'true'); botao.innerHTML = '<i class="fa-solid fa-stop"></i> Parar';
    rec.onresult = (e) => { const t = [...e.results].map((r) => r[0].transcript).join(' ').trim(); if (t) { campo.value = `${campo.value ? `${campo.value} ` : ''}${t}`; campo.dispatchEvent(new Event('change', { bubbles: true })); } };
    rec.onerror = (e) => toast(`Não consegui ouvir (${e.error}). Confira a permissão do microfone.`, 'erro');
    rec.onend = () => { rec = null; botao.setAttribute('aria-pressed', 'false'); botao.innerHTML = '<i class="fa-solid fa-microphone"></i> Ditar'; };
    rec.start();
  });
}

export async function viewFluxo(root, cliente, recarregar, passoPedido = null) {
  const [produtosTodos, criativos, pecas, cfg, referencias, resultados, materiais] = await Promise.all([
    db.listar(COL.produtos, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }), db.listar(COL.pecas, { clienteId: cliente.id }).catch(() => []),
    obterConfig(), db.listar(COL.referencias, { clienteId: cliente.id }).catch(() => []), db.listar(COL.resultados, { clienteId: cliente.id }).catch(() => []),
    db.listar(COL.materiais, { clienteId: cliente.id }).catch(() => []),
  ]);
  const produtos = produtosTodos.filter((p) => !p.arquivado);
  const fonte = { produtos: produtosTodos, materiais, cliente, resultados };
  let fluxo = { ideias: [], ...(cliente.fluxoCriativos || {}) };
  const etapasAgora = () => statusEtapasCriativos({ cliente, fluxo, produtos, pecas });
  let etapas = etapasAgora();
  const passo = passoPedido || passoInicialCriativos(etapas, { fluxo, pecas });
  if (!passoPedido && typeof history !== 'undefined') history.replaceState(null, '', rotaCriativos(cliente.id, passo));
  const irPara = (n) => { location.hash = rotaCriativos(cliente.id, n); };

  const salvarFluxo = async (patch) => {
    fluxo = { ...fluxo, ...patch, iniciadoEm: fluxo.iniciadoEm || new Date().toISOString(), concluidoEm: patch.concluidoEm ?? null };
    await db.atualizar(COL.clientes, cliente.id, { fluxoCriativos: fluxo });
    cliente.fluxoCriativos = fluxo;
    atualizarStatus();
  };
  const criativoDaIdeia = (i) => (i.criativoId ? criativos.find((c) => c.id === i.criativoId) || null : null);
  /** Texto da ideia: depois de virar criativo, o do criativo (versão atual). */
  const textoIdeia = (i) => { const c = criativoDaIdeia(i); return c ? { ...i, nome: c.nome, hook: c.hook, copy: c.copy, cta: c.cta, modeloGancho: c.modeloGancho || i.modeloGancho } : i; };
  /** A ideia vira criativo (rascunho, ligado ao produto) na primeira vez que é produzida ou consultada. */
  const garantirCriativo = async (i) => {
    const existente = criativoDaIdeia(i); if (existente) return existente;
    const c = await salvarNovo(cliente, i, { produtoId: fluxo.produtoId || null });
    criativos.unshift(c);
    await salvarFluxo({ ideias: fluxo.ideias.map((x) => (x.id === i.id ? { ...x, criativoId: c.id } : x)) });
    return c;
  };

  // ---------- barra + o que falta ----------
  const barraHtml = (lista) => `<nav class="mb-4" aria-label="Passos para criar criativos" data-barra-passos><ol class="flex gap-2 overflow-x-auto pb-1" data-progresso-criativos>${lista.map((x) => `<li class="shrink-0">
      <a href="${rotaCriativos(cliente.id, x.n)}" class="flex min-h-[44px] min-w-[8.5rem] items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${x.n === passo ? 'ring-2 ring-indigo-500' : ''} ${COR_STATUS[x.status]}" data-ir-passo="${x.n}" data-status-passo="${x.status}" title="${esc(x.legenda)}" ${x.n === passo ? 'aria-current="step"' : ''}>
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current font-bold">${x.n}</span>
        <span class="min-w-0"><span class="block font-semibold leading-tight">${esc(x.titulo)}</span><span class="block"><i class="fa-solid fa-${ICONE_STATUS[x.status]}"></i> ${STATUS_ETAPA[x.status]}</span></span></a></li>`).join('')}</ol></nav>`;
  const rotAcao = (a) => ({ etapa: `Ir para o passo ${a.alvo}`, novoProduto: 'Cadastrar produto', ancora: 'Resolver aqui' }[a.tipo] || 'Resolver');
  const faltasHtml = (atual) => `<div data-faltas-wrap>${atual.faltas.length ? `<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" data-faltas-passo>
      <p class="font-semibold text-amber-800"><i class="fa-solid fa-list-check mr-1"></i> O que falta neste passo</p>
      <ul class="mt-1 space-y-1">${atual.faltas.map((f, i) => `<li class="flex flex-wrap items-center justify-between gap-2 text-amber-800" data-falta><span class="min-w-0 flex-1">${esc(f.texto)}</span>${f.acao ? `<button type="button" class="btn-ghost btn-sm min-h-[44px] shrink-0" data-resolver="${i}">${rotAcao(f.acao)}</button>` : ''}</li>`).join('')}</ul></div>`
    : '<p class="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800" data-passo-ok><i class="fa-solid fa-circle-check"></i> Nada faltando neste passo.</p>'}</div>`;
  let atual = etapas[passo - 1];
  function atualizarStatus() {
    if (!root.isConnected) return;
    etapas = etapasAgora(); atual = etapas[passo - 1];
    const barra = $('[data-barra-passos]', root); if (barra) { barra.outerHTML = barraHtml(etapas); faixaRolavel($('[data-progresso-criativos]', root)); }
    const f = $('[data-faltas-wrap]', root); if (f) f.outerHTML = faltasHtml(atual);
  }
  const continuar = passo < 4
    ? `<div class="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">${passo > 1 ? `<a class="btn-ghost min-h-[44px]" href="${rotaCriativos(cliente.id, passo - 1)}"><i class="fa-solid fa-arrow-left"></i> Voltar</a>` : '<span></span>'}
        <button type="button" class="btn-primary min-h-[44px]" data-continuar>Continuar <i class="fa-solid fa-arrow-right"></i></button></div>`
    : `<div class="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4"><a class="btn-ghost min-h-[44px]" href="${rotaCriativos(cliente.id, 3)}"><i class="fa-solid fa-arrow-left"></i> Voltar</a>
        ${fluxoEmAndamento(fluxo) ? '<button type="button" class="btn-primary min-h-[44px]" data-concluir-fluxo><i class="fa-solid fa-flag-checkered"></i> Concluir este fluxo</button>' : ''}</div>`;
  const ativos = criativos.filter((c) => !c.arquivado).length;
  root.innerHTML = `${cabecalho('Criar criativos', 'Quatro passos, na ordem que quiser: nenhum fica trancado. Cada passo diz o que falta e tem um botão principal.',
    `<a class="btn-ghost min-h-[44px]" href="${rotaCriativos(cliente.id, 'todos')}" data-todos-criativos><i class="fa-solid fa-list"></i> Todos os criativos (${ativos})</a>
     ${fluxoEmAndamento(fluxo) ? '<button type="button" class="btn-ghost min-h-[44px]" data-novo-fluxo><i class="fa-solid fa-plus"></i> Começar outro</button>' : ''}`)}
    ${barraHtml(etapas)}<div data-aviso-briefs></div>
    <section class="pb-24 sm:pb-16" data-passo="${passo}"><h2 class="mb-1 text-lg font-semibold"><span class="text-indigo-600">${passo}.</span> ${esc(atual.titulo)} <span class="text-sm font-normal text-slate-500">· ${esc(atual.legenda)}</span></h2>
      ${faltasHtml(atual)}<div data-conteudo-passo></div>${continuar}</section>`;
  faixaRolavel($('[data-progresso-criativos]', root));
  const alvo = $('[data-conteudo-passo]', root);

  on(root, 'click', '[data-continuar]', () => irPara(passo + 1));
  on(root, 'click', '[data-concluir-fluxo]', (b) => ocupado(b, async () => { await salvarFluxo({ concluidoEm: new Date().toISOString() }); toast('Fluxo concluído. As peças continuam na Galeria; a aba abre nela da próxima vez.'); recarregar(); }));
  on(root, 'click', '[data-novo-fluxo]', async (b) => {
    const soltas = (fluxo.ideias || []).filter((i) => !i.criativoId).length;
    if (!(await confirmar(`Começar outro fluxo do zero?${soltas ? ` ${soltas} ideia(s) que ainda não viraram criativo saem da lista.` : ''} Criativos e peças já feitos continuam em "Todos os criativos" e na Galeria.`, 'Começar outro'))) return;
    await ocupado(b, async () => { fluxo = { ideias: [] }; await db.atualizar(COL.clientes, cliente.id, { fluxoCriativos: null }); cliente.fluxoCriativos = null; location.hash = rotaCriativos(cliente.id, 1); });
  });
  on(root, 'click', '[data-resolver]', (b) => {
    const a = atual.faltas[Number(b.dataset.resolver)]?.acao; if (!a) return;
    if (a.tipo === 'etapa') return irPara(a.alvo);
    if (a.tipo === 'novoProduto') return abrirProduto(cliente, null, recarregar);
    const x = $(`[data-ancora="${a.alvo}"]`, root);
    if (x) { x.scrollIntoView({ block: 'center' }); x.classList.add('ring-2', 'ring-amber-400'); setTimeout(() => x.classList.remove('ring-2', 'ring-amber-400'), 2500); x.querySelector('select, textarea, input, button')?.focus({ preventScroll: true }); }
  });
  // Peça guardada em outro lugar (Estúdio aberto pelo especialista, outra aba): a barra se recalcula.
  const ouvirPecas = async (e) => {
    if (!root.isConnected) { document.removeEventListener('gcc:pecas', ouvirPecas); return; }
    if (e.detail?.clienteId !== cliente.id) return;
    pecas.splice(0, pecas.length, ...(await db.listar(COL.pecas, { clienteId: cliente.id }).catch(() => pecas)));
    atualizarStatus();
  };
  document.addEventListener('gcc:pecas', ouvirPecas);

  const maisOpcoes = (conteudo, extra = '') => `<details class="mt-4 rounded-lg border border-slate-200 p-3" data-mais-opcoes${extra}><summary class="min-h-[44px] cursor-pointer py-2 text-sm font-medium text-slate-600">Mais opções</summary><div class="mt-2 space-y-3">${conteudo}</div></details>`;
  const botoesGerais = `<div class="flex flex-wrap gap-2"><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-materiais-fluxo><i class="fa-solid fa-photo-film"></i> Materiais do cliente${cliente.logoArquivo ? '' : ' <span class="tag tag-warn">sem logo</span>'}</button>
      <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-modelos-fluxo><i class="fa-solid fa-swatchbook"></i> Modelos de prompt</button>
      <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-especialistas-fluxo><i class="fa-solid fa-user-tie"></i> Especialistas</button></div>`;
  on(root, 'click', '[data-materiais-fluxo]', (b) => ocupado(b, () => abrirMateriais(cliente)));
  on(root, 'click', '[data-modelos-fluxo]', (b) => ocupado(b, () => abrirBiblioteca({ cliente })));
  on(root, 'click', '[data-especialistas-fluxo]', (b) => ocupado(b, () => abrirEspecialistas(cliente, { aoMudar: () => {} })));

  // ==================== 1. Produto e objetivo ====================
  function passo1() {
    const destino = destinoDoFluxo(fluxo, cliente);
    const doPerfil = !['whatsapp', 'site'].includes(fluxo.destino) && destino;
    const a = comoAnunciaDe(cliente);
    alvo.innerHTML = `<div class="card space-y-4">
      <div data-ancora="produto"><label class="label" for="fx-produto">Produto do anúncio</label>
        ${produtos.length ? `<select class="input" id="fx-produto" data-fluxo-produto><option value="">Escolha o produto</option>${produtos.map((p) => `<option value="${esc(p.id)}" ${p.id === fluxo.produtoId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
          <p class="hint" data-resumo-produto>${esc(resumoProduto(produtos.find((p) => p.id === fluxo.produtoId) || {}) || 'Nome, preço e fotos vêm da aba Produtos.')}</p>`
          : '<p class="hint">Nenhum produto cadastrado.</p><button type="button" class="btn-primary btn-sm mt-1 min-h-[44px]" data-novo-produto><i class="fa-solid fa-plus"></i> Cadastrar produto</button>'}</div>
      <fieldset data-ancora="destino"><legend class="label">Para onde o anúncio leva</legend>
        <div class="mt-1 flex flex-wrap gap-2">${DESTINOS_FLUXO.map(([v, r]) => `<label class="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/60"><input type="radio" name="destino" value="${v}" class="h-4 w-4" data-fluxo-destino ${destino === v ? 'checked' : ''}> ${r}</label>`).join('')}</div>
        <p class="hint">${doPerfil ? 'Já marcado pelo que está em "Sobre como esse cliente anuncia" (aba Campanhas). Mude só para este fluxo, se quiser.' : a.destino === 'ambos' ? 'Este cliente vende pelos dois: escolha um para estes criativos.' : 'Dica: preencha "Sobre como esse cliente anuncia" (aba Campanhas) para vir marcado.'}</p></fieldset>
      <div><label class="label" for="fx-pedido">O que você quer <span class="font-normal text-slate-500">(opcional)</span></label>
        <textarea class="input" id="fx-pedido" rows="3" maxlength="800" data-fluxo-pedido placeholder="Ex.: mostrar que cabe na rotina corrida, foco em quem já tentou outro e desistiu">${esc(fluxo.pedido || '')}</textarea>
        <div class="mt-1 flex flex-wrap items-center gap-2"><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-ditar aria-pressed="false"><i class="fa-solid fa-microphone"></i> Ditar</button><span class="hint !mt-0" hidden>Para ditar, use o microfone do teclado do celular.</span></div>
        <p class="hint">O resto (público, tom, objeções, provas, oferta) vem do perfil do cliente.</p></div></div>
      ${maisOpcoes(`<p class="caption">Perfil do cliente (o mesmo questionário do site): as respostas alimentam as ideias.</p><div data-questionario-fluxo></div>${botoesGerais}`, ' data-mais-passo1')}`;
    ligarDitado($('[data-ditar]', alvo), $('[data-fluxo-pedido]', alvo));
    const det = $('[data-mais-passo1]', alvo);
    det.addEventListener('toggle', () => { if (det.open && !det._montado) { det._montado = true; montarQuestionarioNaAba($('[data-questionario-fluxo]', alvo), cliente, recarregar).catch((e) => console.warn('[questionário]', e)); } });
    on(alvo, 'change', '[data-fluxo-produto]', async (s) => { await salvarFluxo({ produtoId: s.value || null }); $('[data-resumo-produto]', alvo).textContent = resumoProduto(produtos.find((p) => p.id === s.value) || {}) || 'Nome, preço e fotos vêm da aba Produtos.'; });
    on(alvo, 'change', '[data-fluxo-destino]', (r) => salvarFluxo({ destino: r.value }));
    on(alvo, 'change', '[data-fluxo-pedido]', (t) => salvarFluxo({ pedido: t.value.trim() }));
    on(alvo, 'click', '[data-novo-produto]', () => abrirProduto(cliente, null, recarregar));
  }

  // ==================== 2. Ideias ====================
  const blocosIdeia = (i) => {
    const t = textoIdeia(i), texto = `${t.hook} ${t.copy} ${t.cta}`;
    const saude = motivoSaude(texto, cliente);
    const gancho = motivoGancho(t, cliente);
    return [saude && `<p class="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700" data-bloqueio-ideia="saude"><i class="fa-solid fa-triangle-exclamation"></i> Bloqueado para aprovar (Meta): ${esc(achadosSaude(texto).join(', '))}. Refaça a ideia ou ajuste o texto.</p>`,
      gancho && `<p class="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700" data-bloqueio-ideia="gancho"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(gancho)}.</p>`,
      ...(i.avisosGancho || []).filter((x) => x !== gancho && !String(x).startsWith('sobrou colchete')).map((x) => `<p class="text-xs text-amber-800">${esc(x)}</p>`)].filter(Boolean).join('');
  };
  const cartaoIdeia = (i) => {
    const t = textoIdeia(i), f = formatoDaIdeia(i);
    return `<li class="card !p-3 ${i.marcada ? 'ring-2 ring-indigo-500' : ''}" data-ideia="${esc(i.id)}">
      <label class="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" class="h-5 w-5" data-marcar-ideia="${esc(i.id)}" ${i.marcada ? 'checked' : ''}> Produzir esta ideia</label>
      <p class="mt-1 font-semibold leading-snug">“${esc(t.hook)}”</p>
      <div class="mt-1 flex flex-wrap gap-1">${tag(f.tipo === 'video' ? 'Reels 9:16 (vídeo)' : 'Feed 4:5 (imagem)', 'tag-info')}${t.modeloGancho ? tag(rotuloModelo(t.modeloGancho)) : ''}${i.angulo ? tag(i.angulo) : ''}${i.criativoId ? tag('já é criativo', 'tag-ok') : ''}</div>
      <p class="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-slate-700" data-roteiro-curto>${esc(t.copy)}</p>
      ${t.cta ? `<p class="mt-1 text-sm"><b>CTA:</b> ${esc(t.cta)}</p>` : ''}
      <div class="mt-2 space-y-1">${blocosIdeia(i)}</div>
      <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-refazer-ideia="${esc(i.id)}"><i class="fa-solid fa-rotate"></i> Refazer esta ideia</button>
        <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-especialista-ideia="${esc(i.id)}"><i class="fa-solid fa-user-tie"></i> Pedir opinião a um especialista</button>
        <button type="button" class="btn-ghost btn-sm min-h-[44px] text-rose-600" data-excluir-ideia="${esc(i.id)}" aria-label="Excluir esta ideia"><i class="fa-solid fa-trash"></i></button></div>
      <div data-painel-especialista="${esc(i.id)}"></div></li>`;
  };
  function passo2() {
    const produto = produtos.find((p) => p.id === fluxo.produtoId) || null;
    const destino = destinoDoFluxo(fluxo, cliente);
    const qtd = Number(cfg.variacoesPadrao) || 4;
    alvo.innerHTML = `<div class="card" data-ancora="gerar">
      <p class="text-sm">${produto ? `<b>${esc(produto.nome)}</b>` : '<span class="text-amber-700">Sem produto escolhido (passo 1)</span>'} · ${destino ? esc(rotulo(DESTINOS_FLUXO, destino)) : '<span class="text-amber-700">sem destino (passo 1)</span>'}${fluxo.pedido ? ` · “${esc(fluxo.pedido)}”` : ''}</p>
      ${ehProdutoSaude(cliente) ? `<p class="hint">${esc(AVISO_META_SAUDE)}: a IA escreve sem efeito no corpo, e o que escapar aparece bloqueado no cartão.</p>` : ''}
      <button type="button" class="btn-ia mt-3 min-h-[44px]" data-gerar-ideias><i class="fa-solid fa-wand-magic-sparkles"></i> ${(fluxo.ideias || []).length ? 'Gerar mais ideias' : 'Gerar ideias'}</button>
      <p class="hint">Cria <span data-qtd-ideias>${qtd}</span> ideias com ganchos de modelos diferentes da biblioteca. As marcadas ficam; as outras são trocadas.</p>
      ${maisOpcoes(`<form class="grid gap-3 sm:grid-cols-2" data-opcoes-ideias>
          <div><label class="label" for="fx-modelo">Modelo pronto</label><select class="input" id="fx-modelo" name="modelo">${opcoes(MODELOS_CRIATIVO, '')}</select></div>
          <div><label class="label" for="fx-framework">Framework de copy</label><select class="input" id="fx-framework" name="framework">${opcoes(FRAMEWORKS, 'livre')}</select></div>
          <div><label class="label" for="fx-formato">Formato</label><select class="input" id="fx-formato" name="formato"><option value="">A IA escolhe</option>${opcoes(FORMATOS, '')}</select></div>
          <div><label class="label" for="fx-narrativa">Narrativa / nível de consciência</label><select class="input" id="fx-narrativa" name="narrativa"><option value="">A IA escolhe</option>${Object.entries(ETAPAS_FUNIL).map(([e, nome]) => `<optgroup label="${nome} do funil">${NARRATIVAS.filter((n) => n.etapa === e).map((n) => `<option value="${n.id}">${esc(n.nome)}</option>`).join('')}</optgroup>`).join('')}</select></div>
          <div><label class="label" for="fx-gancho">Modelo de gancho</label><select class="input" id="fx-gancho" name="modeloGancho"><option value="">A IA escolhe</option>${opcoesGancho()}</select></div>
          <div><label class="label" for="fx-qtd">Quantas ideias</label><select class="input" id="fx-qtd" name="quantidade">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === qtd ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="sm:col-span-2"><label class="label" for="fx-ref">Partir de uma referência salva (swipe file)</label><select class="input" id="fx-ref" name="referenciaId"><option value="">Nenhuma</option>${referencias.map((r) => `<option value="${r.id}">${esc(r.titulo || 'Referência')}${r.sinal ? ` · ${r.sinal}` : ''}</option>`).join('')}</select></div></form>
        <details class="rounded-lg border border-slate-200 p-2" data-ideia-manual><summary class="min-h-[44px] cursor-pointer py-2 text-sm font-medium">Escrever uma ideia sem IA</summary>
          <form class="mt-2 space-y-2" data-form-ideia-manual>
            <div><label class="label" for="fx-m-hook">Gancho (hook) *</label><input class="input" id="fx-m-hook" name="hook" required></div>
            <div><label class="label" for="fx-m-copy">Texto / roteiro *</label><textarea class="input" id="fx-m-copy" name="copy" rows="4" required></textarea></div>
            <div class="grid gap-2 sm:grid-cols-2"><div><label class="label" for="fx-m-cta">CTA</label><input class="input" id="fx-m-cta" name="cta"></div>
              <div><label class="label" for="fx-m-fmt">Formato</label><select class="input" id="fx-m-fmt" name="formato">${opcoes(FORMATOS, 'video_curto')}</select></div></div>
            <button class="btn-primary btn-sm min-h-[44px]" type="submit">Adicionar ideia</button></form></details>
        ${botoesGerais}`)}</div>
      <div class="mt-4" data-ancora="ideias"><div data-saida-ideias aria-live="polite"></div>
        <ul class="grid gap-3 md:grid-cols-2" data-lista-ideias>${(fluxo.ideias || []).map(cartaoIdeia).join('')}</ul></div>`;
    const lista = $('[data-lista-ideias]', alvo);
    const redesenhar = () => { lista.innerHTML = (fluxo.ideias || []).map(cartaoIdeia).join(''); };
    on(alvo, 'change', '[name=quantidade]', (s) => { $('[data-qtd-ideias]', alvo).textContent = s.value; });
    const pedirIdeias = async ({ quantidade, extra = '' } = {}) => {
      const o = Object.fromEntries(new FormData($('[data-opcoes-ideias]', alvo)));
      const ref = referencias.find((r) => r.id === o.referenciaId) || null;
      const briefing = [briefingDoFluxo({ fluxo, produto, cliente }), extra].filter(Boolean).join('\n');
      if (!briefing && !o.modelo && !ref) throw new Error('Escolha o produto no passo 1 (ou escreva o que você quer).');
      return gerarCriativos({
        cliente, briefing, modelo: o.modelo, framework: o.framework, formato: o.formato || undefined, base: ref, produto, quantidade: quantidade || Number(o.quantidade) || qtd,
        narrativa: o.narrativa || '', modeloGancho: Number(o.modeloGancho) || null, referencias: referencias.filter((r) => r.analise), resultados, catalogo: produtos,
      });
    };
    on(alvo, 'click', '[data-gerar-ideias]', (b) => ocupado(b, async () => {
      const vars = await pedirIdeias();
      if (!vars.length) throw new Error('A IA não devolveu ideias. Tente de novo ou escreva uma sem IA (Mais opções).');
      const mantidas = (fluxo.ideias || []).filter((i) => i.marcada || i.criativoId);
      await salvarFluxo({ ideias: [...mantidas, ...vars.map((x) => ideiaDe(x, novoIdIdeia()))] });
      redesenhar();
      $('[data-saida-ideias]', alvo).innerHTML = iaNota(`A IA criou ${vars.length} ideia(s) usando o perfil do cliente${produto ? ` e o produto ${produto.nome}` : ''}. Marque "Produzir esta ideia" nas que quer levar ao Estúdio.`);
      mostrarResultado(lista, `Pronto: ${vars.length} ideia(s) abaixo. Marque as que quer produzir.`);
    }));
    on(alvo, 'submit', '[data-form-ideia-manual]', async (f, ev) => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      if (!v.hook?.trim() || !v.copy?.trim()) return toast('Preencha o gancho e o texto.', 'erro');
      await salvarFluxo({ ideias: [...(fluxo.ideias || []), { ...ideiaDe({ ...v, nome: v.hook.slice(0, 60) }, novoIdIdeia()), marcada: true }] });
      f.reset(); redesenhar(); mostrarResultado(lista, 'Ideia adicionada e marcada para produzir.');
    });
    on(alvo, 'change', '[data-marcar-ideia]', async (c) => {
      await salvarFluxo({ ideias: fluxo.ideias.map((i) => (i.id === c.dataset.marcarIdeia ? { ...i, marcada: c.checked } : i)) });
      c.closest('[data-ideia]')?.classList.toggle('ring-2', c.checked); c.closest('[data-ideia]')?.classList.toggle('ring-indigo-500', c.checked);
    });
    on(alvo, 'click', '[data-refazer-ideia]', (b) => ocupado(b, async () => {
      const i = fluxo.ideias.find((x) => x.id === b.dataset.refazerIdeia); if (!i) return;
      const [nova] = await pedirIdeias({ quantidade: 1, extra: `Refaça esta ideia com outro gancho e outro ângulo; não repita este gancho: "${textoIdeia(i).hook}".` });
      if (!nova) throw new Error('A IA não devolveu a ideia nova. Tente de novo.');
      const n = { ...ideiaDe(nova, novoIdIdeia()), marcada: i.marcada };
      await salvarFluxo({ ideias: fluxo.ideias.map((x) => (x.id === i.id ? n : x)) });
      redesenhar();
      mostrarResultado(lista.querySelector(`[data-ideia="${CSS.escape(n.id)}"]`), 'Ideia refeita.');
    }));
    on(alvo, 'click', '[data-excluir-ideia]', async (b) => {
      const i = fluxo.ideias.find((x) => x.id === b.dataset.excluirIdeia); if (!i) return;
      if (!(await confirmar(`Tirar esta ideia da lista?${i.criativoId ? ' Ela já virou criativo: o criativo continua em "Todos os criativos".' : ' Ela ainda não foi salva: some e não volta.'}`, 'Tirar'))) return;
      await salvarFluxo({ ideias: fluxo.ideias.filter((x) => x.id !== i.id) }); redesenhar();
    });
    on(alvo, 'click', '[data-especialista-ideia]', (b) => ocupado(b, async () => {
      const i = fluxo.ideias.find((x) => x.id === b.dataset.especialistaIdeia); if (!i) return;
      const c = await garantirCriativo(i);
      const painel = lista.querySelector(`[data-painel-especialista="${CSS.escape(i.id)}"]`);
      painel.innerHTML = '<div class="mt-3 rounded-lg border border-indigo-200 p-2" data-especialista-inline><p class="caption mb-2">A ideia foi salva como criativo (rascunho) para o especialista analisar. O que você aceitar vira nova versão dele.</p><div data-esp-inline></div></div>';
      await montarEspecialistas($('[data-esp-inline]', painel), cliente, { alvoInicial: { tipo: 'criativo', id: c.id }, compacto: true, dados: { criativos, campanhas: [], produtos: produtosTodos, resultados, analises: await db.listar(COL.analises, { clienteId: cliente.id }).catch(() => []), pecas },
        aoMudar: () => { const card = painel.closest('[data-ideia]'); const p = card?.querySelector('[data-roteiro-curto]'); if (p) p.textContent = textoIdeia(i).copy; const h = card?.querySelector('p.font-semibold'); if (h) h.textContent = `“${textoIdeia(i).hook}”`; } });
      mostrarResultado(painel.firstElementChild, 'Escolha o especialista e consulte.');
    }));
  }

  // ==================== 3. Produzir ====================
  function passo3() {
    const marcadas = ideiasMarcadas(fluxo);
    const pecasDe = (i) => (i.criativoId ? pecas.filter((p) => p.criativoId === i.criativoId) : []);
    alvo.innerHTML = marcadas.length ? `<p class="caption mb-3">O Estúdio abre já ajustado: formato do Instagram, fotos do produto carregadas e texto dentro da zona segura. Ajuste e clique em <b>"Finalizar peça"</b>: ela vai para a Galeria (passo 4).</p>
      <ul class="grid gap-3 md:grid-cols-2">${marcadas.map((i) => {
        const t = textoIdeia(i), f = formatoDaIdeia(i), ps = pecasDe(i);
        const btn = (tipo) => `<button type="button" class="${f.tipo === tipo ? 'btn-primary' : 'btn-ghost'} btn-sm min-h-[44px]" data-produzir="${esc(i.id)}" data-tipo="${tipo}"><i class="fa-solid fa-${tipo === 'video' ? 'film' : 'image'}"></i> ${tipo === 'video' ? 'Produzir vídeo (Reels 9:16)' : 'Produzir imagem (feed 4:5)'}</button>`;
        return `<li class="card !p-3" data-ancora="ideia-${esc(i.id)}" data-produzir-ideia="${esc(i.id)}">
          <p class="font-semibold leading-snug">“${esc(t.hook)}”</p>
          <p class="hint !mt-0.5">${ps.length ? `${ps.length} peça(s) finalizada(s)` : 'Nenhuma peça finalizada ainda'}${t.modeloGancho ? ` · ${esc(rotuloModelo(t.modeloGancho))}` : ''}</p>
          ${ps.length ? `<div class="mt-2 flex gap-1 overflow-x-auto">${ps.slice(0, 6).map((p) => `<img src="${esc(p.miniatura || '')}" alt="Peça ${esc(p.formatoNome)}" class="h-16 w-12 shrink-0 rounded object-cover">`).join('')}</div>` : ''}
          <div class="mt-2 flex flex-wrap gap-2">${btn(f.tipo)}${btn(f.tipo === 'video' ? 'imagem' : 'video')}</div>
          ${i.criativoId ? `<button type="button" class="btn-ghost btn-sm mt-1 min-h-[44px]" data-abrir-criativo="${esc(i.criativoId)}"><i class="fa-solid fa-pen"></i> Abrir o criativo (texto, checklist, versões)</button>` : ''}</li>`;
      }).join('')}</ul>
      ${maisOpcoes(botoesGerais)}`
      : `<p class="hint">Nenhuma ideia marcada. <a class="text-indigo-600 underline" href="${rotaCriativos(cliente.id, 2)}">Voltar ao passo 2</a> e marque "Produzir esta ideia".</p>${maisOpcoes(botoesGerais)}`;
    on(alvo, 'click', '[data-produzir]', (b) => ocupado(b, async () => {
      const i = fluxo.ideias.find((x) => x.id === b.dataset.produzir); if (!i) return;
      const c = await garantirCriativo(i);
      const tipo = b.dataset.tipo, f = tipo === 'video' ? { tipo, formato: '1080x1920' } : { tipo, formato: '1080x1350' };
      abrirEstudio(c, cliente, fonte, { ...f, aoFinalizar: (p) => { pecas.unshift(p); atualizarStatus(); const li = $(`[data-produzir-ideia="${CSS.escape(i.id)}"] .hint`, alvo); if (li) li.textContent = `${pecasDe({ ...i, criativoId: c.id }).length} peça(s) finalizada(s)`; } });
    }));
    on(alvo, 'click', '[data-abrir-criativo]', (b) => { const c = criativos.find((x) => x.id === b.dataset.abrirCriativo); if (c) abrirCriativo(c, cliente, cfg, recarregar, fonte); });
  }

  // ==================== 4. Galeria ====================
  async function passo4() {
    const usadas = pecas.filter((p) => p.status === 'usar').length;
    alvo.innerHTML = `<div data-ancora="galeria"><div data-painel-especialista-galeria></div><div data-galeria-fluxo></div></div>
      ${maisOpcoes(`<div class="flex flex-wrap gap-2"><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-enviar-todos><i class="fa-solid fa-paper-plane"></i> Enviar criativos para aprovação</button></div>${botoesGerais}
        <p class="hint">${usadas} peça(s) marcada(s) como "Usar". Para mandar ao cliente, use "Aprovação" na peça: ela vira a peça final do criativo e o link mostra ela.</p>`)}`;
    const painelEsp = $('[data-painel-especialista-galeria]', alvo);
    const galeria = montarGaleria($('[data-galeria-fluxo]', alvo), {
      cliente, pecas, produtos: produtosTodos, criativos, aoMudar: atualizarStatus,
      aoPedirEspecialista: async (p) => {
        painelEsp.innerHTML = `<div class="card mb-4 border-indigo-200" data-especialista-inline><div class="flex items-center justify-between gap-2"><p class="font-semibold"><i class="fa-solid fa-user-tie"></i> Especialista sobre a peça ${esc(p.formatoNome)} de ${esc(p.criativoNome)}</p><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-fechar-esp aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><div data-esp-inline></div></div>`;
        await montarEspecialistas($('[data-esp-inline]', painelEsp), cliente, { alvoInicial: { tipo: 'peca', id: p.id }, compacto: true,
          dados: { criativos, campanhas: [], produtos: produtosTodos, resultados, analises: await db.listar(COL.analises, { clienteId: cliente.id }).catch(() => []), pecas },
          aoMudar: () => { galeria.redesenhar(); atualizarStatus(); } });
        mostrarResultado(painelEsp.firstElementChild, 'Escolha o especialista e consulte: o resultado aparece aqui.');
      },
      aoEnviarAprovacao: (lista, pecasEnviadas) => abrirEnvio(cliente, criativos, {
        preSelecionar: lista.map((c) => c.id),
        aoMudar: async () => {
          // Link criado: a peça que foi nele guarda o token (o arquivo fica mesmo se a peça for excluída depois).
          for (const p of pecasEnviadas) {
            const c = criativos.find((x) => x.id === p.criativoId);
            if (c?.aprovacaoToken && c.aprovacaoArquivo?.path === p.path && p.aprovacaoToken !== c.aprovacaoToken) { await db.atualizar(COL.pecas, p.id, { aprovacaoToken: c.aprovacaoToken }); p.aprovacaoToken = c.aprovacaoToken; }
          }
          galeria.redesenhar();
        },
      }),
    });
    on(alvo, 'click', '[data-fechar-esp]', () => { painelEsp.innerHTML = ''; });
    on(alvo, 'click', '[data-enviar-todos]', () => abrirEnvio(cliente, criativos, { preSelecionar: criativos.filter((c) => ['rascunho', 'reaprovacao'].includes(c.status)).map((c) => c.id), aoMudar: recarregar }));
  }

  // Briefs aceitos em "Analisar e recomendar" continuam na lista (com "Gerar com este brief"): aviso curto aqui.
  briefsAbertos(cliente.id).then((l) => {
    if (!l.length || !root.isConnected) return;
    $('[data-aviso-briefs]', root).innerHTML = `<p class="mb-3 rounded-lg border border-violet-200 bg-violet-50/50 p-2 text-sm"><i class="fa-solid fa-clipboard-list text-violet-600"></i> ${l.length} brief(s) aceito(s) na recomendação esperando em <a class="text-indigo-600 underline" href="${rotaCriativos(cliente.id, 'todos')}">Todos os criativos</a>.</p>`;
  }).catch(() => { /* só um aviso */ });

  const PASSOS = { 1: passo1, 2: passo2, 3: passo3, 4: passo4 };
  await PASSOS[passo]();
}
