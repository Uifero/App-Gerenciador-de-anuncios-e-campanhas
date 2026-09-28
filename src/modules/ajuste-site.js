// "Ajustar este site" (aba Site/Loja): chat com a IA + controles manuais, os dois gerando OPERAÇÕES validadas por
// lib/site-blocos.js. Toda mudança vira RASCUNHO (prévia "Atual" x "Com a mudança", isolada do painel num iframe
// sandbox) e só vai para o site ao clicar em "Aceitar mudança", criando uma versão (v1, v2...; as últimas 20 ficam).
// O .zip e o manual de entrega usam sempre o estado aceito (site.conteudo/config/layout ou site.pacote).
import { db, COL } from '../core/storage.js';
import { ajustarSite } from '../core/ia.js';
import {
  nomeBloco, tituloBloco, TITULOS_PADRAO, VARIACOES, BLOCOS_COM_IMAGEM, PALETAS_PRONTAS, MAX_VERSOES,
  estadoDoSite, aplicarOperacoes, registrarVersao, versoesDoModo, resumoMudancas, normalizarLayout, problemaPaleta,
} from '../lib/site-blocos.js';
import { temCustom, temPacote, divergencias, aplicarBaseNoPacote, aplicarBaseNoCustom, baseDoCustom, baseDoPacote } from '../lib/site-modos.js';
import { esc, $, on, toast, ocupado, modal, confirmar, tag, dataBR } from '../core/ui.js';

const LEGENDA = 'Peça uma mudança em linguagem normal. Você vê uma prévia antes de aceitar, e pode voltar para qualquer versão anterior.';
const LEGENDA_PACOTE = 'Aqui você ajusta o conteúdo que será importado. O visual final depende do tema da plataforma escolhida, então mudanças de layout precisam ser feitas no editor da própria plataforma';
const SANDBOX = 'allow-scripts allow-popups allow-forms allow-modals'; // sem allow-same-origin: o site não enxerga nada do painel
// Última versão aceita por cliente+modo nesta sessão: a aba é redesenhada ao aceitar e o "próximo passo" precisa sobreviver.
const aceitoRecente = new Map();
const quando = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return dataBR(iso); } };

/** Abre um HTML de site numa aba nova, dentro de um iframe sandbox (mesma prévia isolada do botão "Ver prévia"). */
export function abrirPreviaIsolada(html, titulo) {
  const w = window.open('', '_blank');
  if (!w) { toast('O navegador bloqueou a nova aba. Libere pop-ups para este endereço e tente de novo.', 'erro'); return; }
  w.document.open();
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(titulo)}</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
<iframe sandbox="${SANDBOX}" srcdoc="${esc(html)}"></iframe>`);
  w.document.close();
}

/**
 * ctx: { cliente, produtos, modo: 'custom'|'pacote', get site(), salvarSite(patch), recarregar(), htmlDe(estado), pacoteHTML(pacote) }
 */
export async function montarAjusteSite(alvo, ctx) {
  const { cliente, produtos, modo } = ctx;
  const custom = modo === 'custom';
  const materiais = custom ? await db.listar(COL.materiais, { clienteId: cliente.id }).catch(() => []) : [];
  let aba = 'depois'; // prévia do rascunho: 'antes' (Atual) ou 'depois' (Com a mudança)
  const chave = `${cliente.id}:${modo}`;

  const site = () => ctx.site;
  const rascunho = () => (site().rascunhoAjuste?.modo === modo ? site().rascunhoAjuste : null);
  const conversa = () => site().conversaAjuste?.[modo] || [];
  const estadoAtual = () => estadoDoSite(site(), modo);
  const estadoBase = () => rascunho()?.estado || estadoAtual();

  // ---------- rascunho ----------
  async function acrescentarAoRascunho(operacoes, origem) {
    const r = aplicarOperacoes(estadoBase(), operacoes, { modo, materiais });
    if (!r.aplicadas.length) return r;
    const atual = rascunho();
    await ctx.salvarSite({ rascunhoAjuste: {
      modo, estado: r.estado, origem: atual && atual.origem !== origem ? 'ia+manual' : origem, criadoEm: atual?.criadoEm || new Date().toISOString(),
      mudancas: [...(atual?.mudancas || []), ...r.mudancas], descartadas: [...(atual?.descartadas || []), ...r.descartadas.map((d) => ({ op: d.op, motivo: d.motivo }))],
    } });
    aba = 'depois';
    return r;
  }
  async function aceitar() {
    const d = rascunho(); if (!d) return;
    const antes = estadoAtual();
    const v = registrarVersao(site(), { modo, estadoAntes: antes, estadoDepois: d.estado, resumo: resumoMudancas(d.mudancas), origem: d.origem });
    await ctx.salvarSite({ ...d.estado, ...v, rascunhoAjuste: null });
    aceitoRecente.set(chave, v.proximaVersao - 1);
    toast(`Mudança aplicada (v${v.proximaVersao - 1}).`);
    ctx.recarregar();
  }
  async function descartar() {
    await ctx.salvarSite({ rascunhoAjuste: null });
    toast('Mudança descartada. O site continua como estava.', 'info'); desenhar();
  }
  async function voltarPara(n) {
    const v = (site().versoesAjuste || []).find((x) => x.n === n); if (!v) return;
    if (!(await confirmar(`Voltar o site para a v${n} ("${v.resumo}")? Isso cria uma versão nova igual à v${n}; o histórico continua todo aqui.`, `Voltar para a v${n}`))) return;
    const r = registrarVersao(site(), { modo, estadoAntes: estadoAtual(), estadoDepois: v.estado, resumo: `Voltou para a v${n}`, origem: 'voltar' });
    await ctx.salvarSite({ ...v.estado, ...r, rascunhoAjuste: null });
    aceitoRecente.set(chave, r.proximaVersao - 1);
    toast(`Voltou para a v${n} (salvo como v${r.proximaVersao - 1}).`); ctx.recarregar();
  }

  // ---------- chat ----------
  function resumoBlocos(e) {
    const L = normalizarLayout(e.layout);
    return `Blocos do site, em ordem: ${L.ordem.map((k, i) => `${i + 1}. ${k} (${nomeBloco(k)}${TITULOS_PADRAO[k] ? `, título "${tituloBloco(L, k)}"` : ''})${L.ocultos.includes(k) ? ' [OCULTO]' : ''}`).join('; ')}.
Variações atuais: ${JSON.stringify(L.variacoes)}. Imagens: ${Object.entries(L.imagens).map(([k, v]) => `${k}: ${v.nome}`).join(', ') || 'nenhuma'}.
Fixos (fora dos blocos): cabeçalho com menu, rodapé com políticas, aviso de cookies, carrinho com "Finalizar compra" e selo de compra segura, botão de WhatsApp.`;
  }
  async function perguntar(mensagem, botao) {
    await ocupado(botao, async () => {
      const e = estadoBase();
      const r = await ajustarSite({ cliente, modo, estado: e, mensagem, conversa: conversa(), materiais, produtos, resumoBlocos: custom ? resumoBlocos(e) : '' });
      let aplicado = null;
      if (r.tipo === 'proposta') aplicado = await acrescentarAoRascunho(r.operacoes, 'ia');
      const mudou = Boolean(aplicado?.aplicadas.length);
      const resposta = {
        role: 'assistant', content: r.resposta, em: new Date().toISOString(), tipo: mudou ? 'proposta' : r.tipo === 'recusa' ? 'recusa' : 'explicacao',
        mudancas: aplicado?.mudancas || [], recusadas: (aplicado?.descartadas || []).map((d) => d.motivo), naoFeito: r.naoFeito, modelo: r.tarefa === 'ajuste_site_amplo' ? 'forte' : 'leve',
      };
      const lista = [...conversa(), { role: 'user', content: mensagem, em: new Date().toISOString() }, resposta].slice(-30);
      await ctx.salvarSite({ conversaAjuste: { ...(site().conversaAjuste || {}), [modo]: lista } });
      desenhar();
      if (mudou) $('[data-rascunho]', alvo)?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ---------- HTML ----------
  const etiqueta = (t) => (t.tipo === 'proposta' ? tag('propôs uma mudança', 'tag-ok') : tag('só explicou, nada mudou', 'tag-info'));
  const itemChat = (t) => (t.role === 'user'
    ? `<p class="text-slate-600"><b>Você:</b> ${esc(t.content)}</p>`
    : `<div class="rounded-lg bg-slate-50 p-2"><p class="mb-1 flex flex-wrap gap-1">${etiqueta(t)}${t.tipo === 'recusa' ? tag(custom ? 'não é possível neste site' : 'não é possível pelo pacote', 'tag-warn') : ''}</p>
        <p class="whitespace-pre-wrap text-slate-800"><b>IA:</b> ${esc(t.content)}</p>
        ${t.mudancas?.length ? `<ul class="mt-1 list-disc pl-5 text-xs text-slate-700">${t.mudancas.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${t.recusadas?.length ? `<p class="mt-1 text-xs text-amber-800"><b>O app não aplicou ${t.recusadas.length} parte(s):</b> ${t.recusadas.map(esc).join(' · ')}</p>` : ''}
        ${t.naoFeito?.length ? `<p class="mt-1 text-xs text-amber-800"><b>Não foi feito:</b> ${t.naoFeito.map(esc).join(' · ')}</p>` : ''}</div>`);

  function previaHTML(d) {
    if (custom) {
      const html = ctx.htmlDe(aba === 'antes' ? estadoAtual() : d.estado);
      return `<iframe sandbox="${SANDBOX}" srcdoc="${esc(html)}" class="h-[520px] w-full rounded-lg border border-slate-200 bg-white" title="Prévia do site: ${aba === 'antes' ? 'atual' : 'com a mudança'}" data-previa-rascunho></iframe>`;
    }
    return `<div class="rounded-lg border border-slate-200 p-3" data-previa-rascunho>${ctx.pacoteHTML(aba === 'antes' ? estadoAtual().pacote : d.estado.pacote)}</div>`;
  }
  function rascunhoHTML(d) {
    return `<div class="mt-4 rounded-lg border-2 border-emerald-300 bg-emerald-50/40 p-3" data-rascunho>
      <h4 class="text-sm font-semibold"><i class="fa-solid fa-eye mr-1"></i> Mudança proposta: ainda NÃO está no site</h4>
      <p class="hint mb-2">Confira a prévia. "Aceitar mudança" aplica ao site e cria uma versão nova; "Descartar" deixa tudo como estava. Enquanto isso, novos pedidos (IA ou manuais) somam a esta mesma mudança.</p>
      <p class="text-sm font-medium">O que muda (antes → depois):</p>
      <ul class="mb-2 list-disc pl-5 text-sm">${d.mudancas.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
      ${d.descartadas?.length ? `<p class="mb-2 text-xs text-amber-800"><b>Recusado pelo app (não entra):</b> ${d.descartadas.map((x) => esc(x.motivo)).join(' · ')}</p>` : ''}
      <div class="mb-2 flex flex-wrap items-center gap-2"><span class="text-sm">Prévia:</span>
        <button type="button" class="${aba === 'antes' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-aba="antes">Atual</button>
        <button type="button" class="${aba === 'depois' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-aba="depois">Com a mudança</button>
        ${custom ? '<button type="button" class="btn-ghost btn-sm" data-previa-aba title="Abre numa aba separada, isolada do painel"><i class="fa-solid fa-up-right-from-square"></i> Abrir em nova aba</button>' : ''}</div>
      ${previaHTML(d)}
      <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn-primary" data-aceitar><i class="fa-solid fa-check"></i> Aceitar mudança</button>
        <button type="button" class="btn-ghost" data-descartar><i class="fa-solid fa-xmark"></i> Descartar</button></div></div>`;
  }

  function manuaisHTML(e) {
    if (!custom) {
      const P = e.pacote || {};
      const secoes = P.briefingTema?.secoesHome || [];
      return `<p class="hint mb-2">Cada botão monta a mesma "mudança proposta" do chat, com prévia e versão. Nada muda no pacote até "Aceitar mudança".</p>
        <p class="text-sm font-medium">Ordem sugerida das seções da home</p>
        <ol class="mb-3 space-y-1 text-sm">${secoes.map((s, i) => `<li class="flex flex-wrap items-center gap-2 rounded border border-slate-200 px-2 py-1"><span class="flex-1">${i + 1}. ${esc(s)}</span>
          <button type="button" class="btn-ghost btn-sm" data-m-pac="subir" data-i="${i}" ${i === 0 ? 'disabled' : ''}>Subir</button><button type="button" class="btn-ghost btn-sm" data-m-pac="descer" data-i="${i}" ${i === secoes.length - 1 ? 'disabled' : ''}>Descer</button>
          <button type="button" class="btn-ghost btn-sm" data-m-pac="ocultar" data-i="${i}">Tirar da home</button></li>`).join('')}
          ${(P.secoesOcultas || []).map((s) => `<li class="flex items-center gap-2 rounded border border-dashed border-slate-300 px-2 py-1 text-slate-500"><span class="flex-1">${esc(s)} (retirada)</span><button type="button" class="btn-ghost btn-sm" data-m-pac-mostrar="${esc(s)}">Voltar para a home</button></li>`).join('')}</ol>
        <p class="text-sm font-medium">Textos dos banners</p>
        <div class="mb-3 flex flex-wrap gap-2">${(P.banners || []).map((b, i) => `<button type="button" class="btn-ghost btn-sm" data-m-banner="${i}">Editar texto do banner ${i + 1}</button>`).join('') || '<span class="hint">Gere o pacote primeiro.</span>'}</div>
        <p class="text-sm font-medium">Paleta sugerida</p><div class="flex flex-wrap gap-2">${PALETAS_PRONTAS.map(([n, a, b]) => `<button type="button" class="btn-ghost btn-sm" data-m-paleta="${a},${b}"><span class="inline-block h-3 w-3 rounded-full" style="background:${a}"></span> ${esc(n)}</button>`).join('')}</div>`;
    }
    const L = normalizarLayout(e.layout);
    const cfg = e.config || {};
    return `<p class="hint mb-2">Cada botão monta a mesma "mudança proposta" do chat, com prévia e versão, e passa pelas mesmas regras. Nada muda no site até "Aceitar mudança".</p>
      <ol class="mb-3 space-y-1 text-sm" data-lista-blocos>${L.ordem.map((k, i) => {
        const oculto = L.ocultos.includes(k);
        return `<li class="flex flex-wrap items-center gap-2 rounded border ${oculto ? 'border-dashed border-slate-300 text-slate-500' : 'border-slate-200'} px-2 py-1" data-bloco="${k}">
          <span class="min-w-[10rem] flex-1">${i + 1}. ${esc(nomeBloco(k))}${oculto ? ' (oculto)' : ''}</span>
          <button type="button" class="btn-ghost btn-sm" data-m="subir" data-b="${k}" ${i === 0 ? 'disabled' : ''}>Subir</button>
          <button type="button" class="btn-ghost btn-sm" data-m="descer" data-b="${k}" ${i === L.ordem.length - 1 ? 'disabled' : ''}>Descer</button>
          <button type="button" class="btn-ghost btn-sm" data-m="${oculto ? 'mostrar' : 'ocultar'}" data-b="${k}">${oculto ? 'Mostrar' : 'Ocultar'}</button>
          ${['hero', 'marca', 'newsletter'].includes(k) || TITULOS_PADRAO[k] ? `<button type="button" class="btn-ghost btn-sm" data-m="texto" data-b="${k}">Editar texto</button>` : ''}
          ${VARIACOES[k] ? Object.entries(VARIACOES[k]).map(([opc, vals]) => `<select class="input !w-auto !py-1 text-xs" data-m-var="${k}" data-opc="${opc}" title="${opc === 'altura' ? 'Altura do banner' : 'Colunas de produtos'}"><option value="">${opc === 'altura' ? 'Altura' : 'Colunas'}: ${esc(L.variacoes[k]?.[opc] ?? (opc === 'altura' ? 'normal' : 'automático'))}</option>${vals.map((v) => `<option value="${v}">${v}</option>`).join('')}</select>`).join('') : ''}
          ${BLOCOS_COM_IMAGEM.includes(k) ? `<select class="input !w-auto !py-1 text-xs" data-m-img="${k}" title="Imagem dos Materiais do cliente"><option value="__">Imagem: ${esc(L.imagens[k]?.nome || 'nenhuma')}</option>${L.imagens[k] ? '<option value="">Tirar a imagem</option>' : ''}${materiais.map((m) => `<option value="${esc(m.id)}">${esc(m.nome || 'imagem')}</option>`).join('')}</select>` : ''}</li>`;
      }).join('')}</ol>
      ${materiais.length ? '' : '<p class="hint mb-2">Para usar imagem no banner ou na história, guarde fotos em Materiais do cliente (pergunta 0 acima, ou Estúdio).</p>'}
      <p class="text-sm font-medium">Cores</p>
      <p class="hint mb-1">Paletas prontas (todas legíveis). Atual: principal ${esc(cfg.corPrimaria || '#4f46e5')}, fundo ${esc(cfg.corFundo || '#ffffff')}.</p>
      <div class="mb-2 flex flex-wrap gap-2">${PALETAS_PRONTAS.map(([n, a, b]) => `<button type="button" class="btn-ghost btn-sm" data-m-paleta="${a},${b}"><span class="inline-block h-3 w-3 rounded-full" style="background:${a}"></span> ${esc(n)}</button>`).join('')}</div>
      <div class="flex flex-wrap items-end gap-2"><label class="text-xs">Principal<input type="color" class="block h-9 w-16 rounded" data-cor-prim value="${esc(cfg.corPrimaria || '#4f46e5')}"></label>
        <label class="text-xs">Fundo<input type="color" class="block h-9 w-16 rounded" data-cor-fundo value="${esc(cfg.corFundo || '#ffffff')}"></label>
        <button type="button" class="btn-ghost btn-sm" data-m-cores>Usar estas cores (o app confere se ficam legíveis)</button></div>`;
  }

  function versoesHTML() {
    const vs = versoesDoModo(site(), modo);
    return `<details class="mt-4 rounded-lg border border-slate-200 p-3" data-versoes ${vs.length ? '' : ''}><summary class="cursor-pointer text-sm font-medium text-slate-600">Histórico de versões (${vs.length})</summary>
      <p class="hint mt-2">Cada mudança aceita vira uma versão. "Voltar para esta versão" cria uma versão nova igual à escolhida, sem apagar nada. Guardamos as últimas ${MAX_VERSOES} versões deste site; as mais antigas saem sozinhas.</p>
      ${vs.length ? `<ol class="mt-2 space-y-1 text-sm">${vs.map((v, i) => `<li class="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1" data-versao="${v.n}">
        <span><b>v${v.n}</b> · ${esc(quando(v.em))} · ${esc(v.resumo)}</span>
        ${i === 0 ? '<span class="tag tag-ok">atual</span>' : `<button type="button" class="btn-ghost btn-sm" data-voltar="${v.n}">Voltar para esta versão</button>`}</li>`).join('')}</ol>`
        : '<p class="hint mt-2">Nenhuma mudança aceita ainda. A primeira cria também a "Versão inicial", para dar para voltar ao começo.</p>'}</details>`;
  }

  function outroModoHTML() {
    const s = site();
    if (!(temCustom(s) && temPacote(s)) || !divergencias(s).length) return '';
    return `<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-outro-modo>
      <p><b>Este cliente também tem ${custom ? 'o pacote Nuvemshop/Shopify' : 'o site personalizado'}</b>, que agora está diferente em: ${esc(divergencias(s).join(', '))}. Nada é copiado sozinho.</p>
      <button type="button" class="btn-primary btn-sm mt-1" data-aplicar-outro><i class="fa-solid fa-arrows-rotate"></i> Aplicar também ${custom ? 'no pacote' : 'no site personalizado'}</button></div>`;
  }

  function desenhar() {
    const d = rascunho();
    const e = estadoBase();
    const nAceito = aceitoRecente.get(chave);
    const aposAceitar = nAceito && versoesDoModo(site(), modo)[0]?.n === nAceito ? { n: nAceito } : null;
    alvo.innerHTML = `<div class="card mt-4 border-violet-200" data-ajuste-site>
      <h3 class="mb-1 font-semibold text-violet-800"><i class="fa-solid fa-comments mr-1"></i> Ajustar ${custom ? 'este site' : 'o conteúdo deste pacote'}</h3>
      <p class="caption">${LEGENDA}</p>
      ${custom ? '' : `<p class="mt-1 rounded bg-slate-50 p-2 text-sm text-slate-700"><i class="fa-solid fa-circle-info mr-1"></i>${LEGENDA_PACOTE}.</p>`}
      <p class="hint mt-1">O que dá para mudar: ${custom ? 'ordem dos blocos, mostrar/ocultar, textos (banner, títulos, história, perguntas frequentes, newsletter), quais depoimentos aparecem, cores, altura do banner, colunas de produtos e imagem do banner/história (dos Materiais)' : 'textos dos banners e da página Sobre, perguntas frequentes, paleta sugerida, ordem sugerida das seções da home e descrições/SEO dos produtos no CSV'}. <b>O que nunca muda por aqui:</b> Pixel, Hotjar e Tawk.to, aviso de cookies, carrinho e pagamento, selo de compra segura e políticas.</p>
      ${aposAceitar && !d ? `<p class="mt-2 rounded bg-emerald-50 p-2 text-sm text-emerald-800" data-aceito><i class="fa-solid fa-circle-check"></i> <b>Aplicado (v${aposAceitar.n}).</b> Próximo passo: ${custom ? 'baixe a pasta do site de novo (botão "Baixar pasta do site…") e publique por cima da versão antiga na hospedagem' : 'baixe o catálogo (CSV), os banners e o manual de novo para entregar a versão nova'}.</p>` : ''}
      ${aposAceitar ? outroModoHTML() : ''}
      <div class="mt-3 space-y-2 text-sm" data-chat>${conversa().map(itemChat).join('') || '<p class="hint">Exemplos: “coloca os depoimentos antes dos produtos”, “troca o título do banner para algo mais direto”, “deixa o site em tons de verde”, “esconde a newsletter”.</p>'}</div>
      <form class="mt-2 flex flex-wrap gap-2" data-form-ajuste><input class="input min-w-0 flex-1" name="pedido" maxlength="600" placeholder="O que você quer mudar${custom ? ' no site' : ' no pacote'}?" required>
        <button class="btn-ia" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i> Pedir mudança à IA</button></form>
      <p class="hint">A IA responde marcando se <b>só explicou (nada mudou)</b> ou se <b>propôs uma mudança</b>; a mudança aparece abaixo com prévia. Pedidos simples levam ~15 s; pedidos amplos ~40 s.</p>
      ${d ? rascunhoHTML(d) : ''}
      <details class="mt-4 rounded-lg border border-slate-200 p-3" data-manuais><summary class="cursor-pointer text-sm font-medium text-slate-600">Ajustar à mão (sem IA)</summary><div class="mt-2">${manuaisHTML(e)}</div></details>
      ${versoesHTML()}</div>`;
  }

  // ---------- eventos ----------
  const manual = async (ops, b) => {
    const r = await acrescentarAoRascunho(ops, 'manual');
    if (!r.aplicadas.length) return toast(`Não aplicado: ${r.descartadas.map((x) => x.motivo).join(' · ') || 'nada mudou'}`, 'erro');
    desenhar(); $('[data-manuais]', alvo).open = true;
    toast('Mudança adicionada à prévia. Confira e clique em "Aceitar mudança".', 'info');
    b?.blur?.();
  };
  on(alvo, 'submit', '[data-form-ajuste]', (f, ev) => { ev.preventDefault(); const p = f.elements.pedido.value.trim(); if (p) perguntar(p, f.querySelector('button')); });
  on(alvo, 'click', '[data-aba]', (b) => { aba = b.dataset.aba; desenhar(); $('[data-rascunho]', alvo)?.scrollIntoView({ block: 'nearest' }); });
  on(alvo, 'click', '[data-previa-aba]', () => abrirPreviaIsolada(ctx.htmlDe(aba === 'antes' ? estadoAtual() : rascunho().estado), `Prévia (${aba === 'antes' ? 'atual' : 'com a mudança'}) — ${cliente.nome}`));
  on(alvo, 'click', '[data-aceitar]', (b) => ocupado(b, aceitar));
  on(alvo, 'click', '[data-descartar]', (b) => ocupado(b, descartar));
  on(alvo, 'click', '[data-voltar]', (b) => voltarPara(Number(b.dataset.voltar)));
  on(alvo, 'click', '[data-aplicar-outro]', (b) => ocupado(b, async () => {
    const s = site();
    const patch = custom ? { pacote: aplicarBaseNoPacote(s.pacote, baseDoCustom(s)) } : aplicarBaseNoCustom(s.conteudo || {}, s.config || {}, baseDoPacote(s));
    const outro = custom ? 'pacote' : 'custom';
    const v = registrarVersao(s, { modo: outro, estadoAntes: estadoDoSite(s, outro), estadoDepois: estadoDoSite({ ...s, ...patch }, outro), resumo: `Recebeu as mudanças do ${custom ? 'site personalizado' : 'pacote'}`, origem: 'sincronizar' });
    await ctx.salvarSite({ ...patch, ...v });
    toast(`Aplicado também ${custom ? 'no pacote' : 'no site personalizado'}.`); ctx.recarregar();
  }));
  // manuais — site personalizado
  on(alvo, 'click', '[data-m]', async (b) => {
    const k = b.dataset.b, acao = b.dataset.m;
    const L = normalizarLayout(estadoBase().layout); const i = L.ordem.indexOf(k);
    if (acao === 'subir') return manual([{ op: 'mover', bloco: k, antesDe: L.ordem[i - 1] }], b);
    if (acao === 'descer') return manual([{ op: 'mover', bloco: k, depoisDe: L.ordem[i + 1] }], b);
    if (acao === 'ocultar' || acao === 'mostrar') return manual([{ op: acao, bloco: k }], b);
    if (acao === 'texto') return editarTexto(k);
  });
  on(alvo, 'change', '[data-m-var]', (s) => { if (s.value) manual([{ op: 'variacao', bloco: s.dataset.mVar, opcao: s.dataset.opc, valor: s.dataset.opc === 'colunas' ? Number(s.value) : s.value }], s); });
  on(alvo, 'change', '[data-m-img]', (s) => { if (s.value !== '__') manual([{ op: 'imagem', bloco: s.dataset.mImg, materialId: s.value || null }], s); });
  on(alvo, 'click', '[data-m-paleta]', (b) => { const [a, c] = b.dataset.mPaleta.split(','); manual([custom ? { op: 'paleta', corPrimaria: a, corFundo: c } : { op: 'paleta', cores: [a, c, ...(estadoBase().pacote?.briefingTema?.paletaSugerida || []).slice(2)] }], b); });
  on(alvo, 'click', '[data-m-cores]', (b) => {
    const a = $('[data-cor-prim]', alvo).value, c = $('[data-cor-fundo]', alvo).value;
    const prob = problemaPaleta(a, c);
    if (prob) return toast(`Essas cores não foram usadas porque ${prob}`, 'erro');
    manual([{ op: 'paleta', corPrimaria: a, corFundo: c }], b);
  });
  // manuais — pacote
  on(alvo, 'click', '[data-m-pac]', (b) => {
    const secoes = estadoBase().pacote?.briefingTema?.secoesHome || []; const i = Number(b.dataset.i); const s = secoes[i];
    if (b.dataset.mPac === 'subir') return manual([{ op: 'mover', secao: s, antesDe: secoes[i - 1] }], b);
    if (b.dataset.mPac === 'descer') return manual([{ op: 'mover', secao: s, depoisDe: secoes[i + 1] }], b);
    return manual([{ op: 'ocultar', secao: s }], b);
  });
  on(alvo, 'click', '[data-m-pac-mostrar]', (b) => manual([{ op: 'mostrar', secao: b.dataset.mPacMostrar }], b));
  on(alvo, 'click', '[data-m-banner]', (b) => {
    const i = Number(b.dataset.mBanner); const ban = estadoBase().pacote?.banners?.[i] || {};
    formularioTexto(`Banner ${i + 1} (${ban.uso || 'banner'})`, [['titulo', 'Título', ban.titulo, 80], ['subtitulo', 'Subtítulo', ban.subtitulo, 180], ['cta', 'Texto do botão', ban.cta, 30]],
      (v) => Object.entries(v).filter(([c, val]) => val !== (ban[c] || '')).map(([c, val]) => ({ op: 'texto', campo: `banner.${i}.${c}`, valor: val })));
  });

  function editarTexto(k) {
    const e = estadoBase(); const c = e.conteudo || {}; const L = normalizarLayout(e.layout);
    const campos = {
      hero: [['heroTitulo', 'Título do banner', c.heroTitulo, 80], ['heroSubtitulo', 'Subtítulo', c.heroSubtitulo, 180], ['heroCta', 'Texto do botão', c.heroCta, 30]],
      marca: [['titulo.marca', 'Título da seção', tituloBloco(L, 'marca'), 60], ['storytelling', 'Texto da história', c.storytelling, 2500, true]],
      newsletter: [['newsletterTitulo', 'Título', c.newsletterTitulo, 80], ['newsletterTexto', 'Texto', c.newsletterTexto, 300]],
    }[k] || [[`titulo.${k}`, 'Título da seção', tituloBloco(L, k), 60]];
    const atual = Object.fromEntries(campos.map(([id, , val]) => [id, val || '']));
    formularioTexto(nomeBloco(k), campos, (v) => Object.entries(v).filter(([id, val]) => val !== atual[id]).map(([id, val]) => ({ op: 'texto', campo: id, valor: val })),
      k === 'faq' || k === 'depoimentos' ? `As perguntas e os depoimentos em si ficam no formulário "Conteúdo da loja" (ou peça ao chat: “oculta o depoimento da Ana”, “reescreve a resposta da pergunta 2”).` : '');
  }
  function formularioTexto(titulo, campos, paraOps, nota = '') {
    const m = modal(`Editar texto: ${titulo}`, `<form class="space-y-3" data-f-texto><p class="caption">Vira uma mudança proposta, com prévia antes de ir para o site.</p>${nota ? `<p class="hint">${esc(nota)}</p>` : ''}
      ${campos.map(([id, rot, val, max, grande]) => `<div><label class="label">${esc(rot)}</label>${grande ? `<textarea class="input" rows="5" name="${esc(id)}" maxlength="${max}">${esc(val || '')}</textarea>` : `<input class="input" name="${esc(id)}" maxlength="${max}" value="${esc(val || '')}">`}</div>`).join('')}
      <div class="flex gap-2"><button class="btn-primary" type="submit">Ver na prévia</button></div></form>`);
    on(m.el, 'submit', '[data-f-texto]', async (f, ev) => {
      ev.preventDefault();
      const v = Object.fromEntries(campos.map(([id]) => [id, f.elements[id].value.trim()]));
      const ops = paraOps(v);
      if (!ops.length) { toast('Nada mudou no texto.', 'info'); return; }
      m.fechar(); await manual(ops);
    });
  }

  desenhar();
  return { redesenhar: desenhar };
}
