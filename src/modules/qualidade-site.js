// Fase de qualidade do site (Frente 1), na aba Site/Loja:
//  - passo 4: "Fontes do site" (3 pares de fontes escolhidos para o cliente; troca na hora e a prévia muda) e a
//    conferência "Cara de IA" (sem IA; "Corrigir" faz o mecânico na hora e manda os clichês para "Ajustar este site",
//    que mostra Atual × Com a mudança antes de aceitar);
//  - passo 6: "Requisitos legais" (CNPJ, contato, endereço, arrependimento de 7 dias, trocas, privacidade, preço claro),
//    com os dados da loja preenchidos pelo operador (cliente.dadosLoja). O app nunca inventa CNPJ nem endereço.
import { db, COL } from '../core/storage.js';
import { esc, $, on, ocupado, toast, mostrarResultado, tag } from '../core/ui.js';
import { designDoSite, parPorId, textoPar, corDominante } from '../lib/design-site.js';
import { verificarCaraDeIa, corrigirLocal, pedidoClichesIa } from '../lib/cara-de-ia.js';
import { ANIMACOES_SITE, normalizarAnimacoes, prazoDaOferta } from '../lib/animacoes-site.js';
import { checklistLegal, CAMPOS_DADOS_LOJA, normalizarDadosLoja, TRECHO_ARREPENDIMENTO, tipoDocumento } from '../lib/legal-loja.js';

/** Cores do logo (lidas uma vez num canvas pequeno). Falha calada: sem permissão de leitura (CORS), fica sem. */
export async function lerCoresLogo(url) {
  if (!url || typeof document === 'undefined') return [];
  try {
    const img = new Image(); img.crossOrigin = 'anonymous';
    await new Promise((ok, falha) => { img.onload = ok; img.onerror = falha; img.src = url; });
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 48, 48);
    const cor = corDominante(ctx.getImageData(0, 0, 48, 48).data);
    return cor ? [cor] : [];
  } catch { return []; }
}

// ---------- passo 4: fontes ----------
export function designHtml(cliente, site) {
  const d = designDoSite({ cliente, site });
  const ORIGEM = { escolhida: 'escolhida por você', perfil: 'da estética do perfil', logo: 'tirada do logo', ia: 'sugerida pela IA', neutra: 'neutra (sem cor da marca)' };
  return `<fieldset class="mt-4 rounded-lg border border-slate-200 p-3" data-design-site><legend class="px-1 text-sm font-semibold">Fontes do site</legend>
    <p class="caption">Três pares escolhidos pelo nicho e pelo tom de voz do cliente. Toque para trocar: a prévia muda na hora.</p>
    <div class="mt-2 grid gap-2 sm:grid-cols-3">${d.opcoes.map((id) => { const p = parPorId(id); const ativo = p.id === d.par.id;
      return `<label class="flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-lg border p-2 ${ativo ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200'}" data-opcao-par="${esc(id)}">
        <span class="flex items-center gap-2 text-sm font-medium"><input type="radio" name="par-fontes" value="${esc(id)}" class="h-4 w-4" ${ativo ? 'checked' : ''} data-par-fontes> ${esc(p.nome)}</span>
        <span class="text-xs text-slate-600">${esc(textoPar(p))}</span></label>`; }).join('')}</div>
    <p class="hint mt-2">Cor de destaque <span class="inline-block h-3 w-3 rounded-sm border border-slate-300 align-middle" style="background:${esc(d.cores.acento)}"></span> ${esc(d.cores.acento)} (${ORIGEM[d.fonteCor]}); o resto do site usa neutros. Para trocar a cor, escreva o hex na estética do perfil ou, no site personalizado, em "Editar os textos à mão".</p></fieldset>`;
}
export function ligarDesign(el, { cliente, getSite, salvarSite, recarregar }) {
  on(el, 'change', '[data-par-fontes]', (r) => ocupado(r, async () => {
    const site = getSite();
    await salvarSite({ design: { ...(site?.design || {}), par: r.value, escolhidoEm: new Date().toISOString() } });
    toast(`Fontes: ${textoPar(parPorId(r.value))}.`);
    recarregar();
  }));
  // Cores do logo: lidas uma vez e guardadas no site (a cor da marca sai delas quando o perfil não diz a cor).
  const site = getSite();
  if (site && cliente.logoArquivo?.url && !site.design?.coresLogo) {
    lerCoresLogo(cliente.logoArquivo.url).then(async (cores) => {
      await salvarSite({ design: { ...(getSite()?.design || {}), coresLogo: cores } });
      if (cores.length) recarregar();
    }).catch(() => {});
  }
}

// ---------- passo 4: "Cara de IA" ----------
const ICONE = { cliche: 'quote-left', travessao: 'minus', exclamacao: 'exclamation', emoji: 'face-smile', parede: 'align-justify', cor: 'palette', banner: 'image' };
export function caraDeIaHtml({ cliente, site, modo, produtos }) {
  const design = designDoSite({ cliente, site });
  const achados = verificarCaraDeIa({ site, modo, design, produtos });
  const locais = achados.filter((a) => a.corrige === 'local').length, cliches = achados.filter((a) => a.tipo === 'cliche').length;
  return `<div class="mt-4 rounded-lg border-2 ${achados.length ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-300 bg-emerald-50/40'} p-3" data-cara-de-ia data-ancora="cara-de-ia" data-achados="${achados.length}">
    <h4 class="font-semibold"><i class="fa-solid fa-user-astronaut" aria-hidden="true"></i> Conferência: cara de IA</h4>
    <p class="caption">O app confere o texto e o visual contra o que denuncia site feito por IA (sem IA, sem custo). Seus textos do plano e os depoimentos reais não são mexidos.</p>
    ${achados.length ? `<ul class="mt-2 space-y-1 text-sm" data-lista-cara-de-ia>${achados.map((a) => `<li class="flex flex-wrap items-start gap-2 rounded bg-slate-50 px-2 py-1" data-achado="${esc(a.tipo)}">
        <i class="fa-solid fa-${ICONE[a.tipo] || 'circle'} mt-1 text-amber-700" aria-hidden="true"></i><span class="min-w-0 flex-1"><b>${esc(a.titulo)}</b> · ${esc(a.onde)}${a.trecho ? ` · <span class="text-slate-600">"${esc(a.trecho)}"</span>` : ''}<br><span class="text-xs text-slate-600">${esc(a.sugestao)}</span></span>
        ${tag(a.corrige === 'local' ? 'corrige na hora' : a.corrige === 'ia' ? 'reescrever' : 'você ajusta', a.corrige === 'manual' ? '' : 'tag-info')}</li>`).join('')}</ul>
      <div class="mt-2 flex flex-wrap gap-2">${locais ? `<button type="button" class="btn-primary btn-sm min-h-[44px]" data-corrigir-cara><i class="fa-solid fa-wand-sparkles"></i> Corrigir (${locais} na hora${cliches ? `, ${cliches} clichê(s) com IA` : ''})</button>` : ''}
        ${!locais && cliches ? `<button type="button" class="btn-ia btn-sm min-h-[44px]" data-corrigir-cara><i class="fa-solid fa-wand-magic-sparkles"></i> Corrigir ${cliches} clichê(s) com IA</button>` : ''}</div>
      <p class="hint">Clichê vira uma mudança proposta em "Ajustar este site" (Atual × Com a mudança): nada muda sem você aceitar. Sem IA: edite em "Editar os textos à mão".</p>`
      : '<p class="mt-1 text-sm text-emerald-800" data-sem-cara-de-ia><i class="fa-solid fa-circle-check"></i> Nada encontrado: sem clichê, travessão, exclamação em série, emoji em título nem parede de texto.</p>'}
    <p class="hint">O modelo do app já evita gradiente roxo, fileira de ícones genéricos e seções todas iguais; a foto real do produto vai no banner.</p></div>`;
}
/** ctx: { cliente, getSite, modo, produtos, salvarEVersionar, corrigirComIa (async (achados) => void), recarregar }. */
export function ligarCaraDeIa(el, ctx) {
  on(el, 'click', '[data-corrigir-cara]', (b) => ocupado(b, async () => {
    const site = ctx.getSite();
    const achados = verificarCaraDeIa({ site, modo: ctx.modo, design: designDoSite({ cliente: ctx.cliente, site }), produtos: ctx.produtos });
    const r = corrigirLocal({ conteudo: site.conteudo, pacote: site.pacote }, achados, { modo: ctx.modo });
    if (r.mudancas.length) {
      await ctx.salvarEVersionar(ctx.modo === 'custom' ? { conteudo: r.estado.conteudo } : { pacote: r.estado.pacote, conteudo: r.estado.conteudo }, `Cara de IA: ${r.mudancas.join('; ')}`.slice(0, 200));
    }
    const cliches = r.restantes.filter((a) => a.tipo === 'cliche');
    if (cliches.length) await ctx.corrigirComIa(cliches);
    ctx.recarregar();
    const msg = [r.mudancas.length && `Corrigido na hora: ${r.mudancas.join('; ')}.`, cliches.length && `${cliches.length} clichê(s) viraram uma mudança proposta em "Ajustar este site": confira e aceite.`].filter(Boolean).join(' ');
    setTimeout(() => mostrarResultado(cliches.length ? '[data-ajuste]' : '[data-cara-de-ia]', msg || 'Nada a corrigir.'), 50);
  }));
}

// ---------- passo 6: requisitos legais ----------
export function legalHtml({ cliente, site, produtos }) {
  const itens = checklistLegal({ cliente, site, produtos }), dl = cliente.dadosLoja || {};
  const doc = tipoDocumento(dl.cnpj);
  return `<div class="card mt-4" data-legal data-ancora="legal"><h3 class="font-semibold"><i class="fa-solid fa-scale-balanced mr-1 text-slate-400" aria-hidden="true"></i> Requisitos legais da loja</h3>
    <p class="caption">O que a lei pede numa loja online no Brasil (CDC, decreto do comércio eletrônico e LGPD). Resumo, não é parecer jurídico. O app não inventa CNPJ, endereço nem contato: preencha com os dados reais do cliente.</p>
    <ul class="mt-2 space-y-1 text-sm" data-lista-legal>${itens.map((x) => `<li class="flex flex-wrap items-center gap-2" data-legal-item="${esc(x.id)}" data-ok="${x.ok}"><i class="fa-solid ${x.ok ? 'fa-circle-check text-emerald-600' : 'fa-circle-xmark text-amber-600'}" aria-hidden="true"></i><span class="flex-1">${esc(x.texto)}</span>${x.ok ? '' : `<span class="w-full text-xs text-amber-800 sm:w-auto">${esc(x.falta)}</span>`}
      ${!x.ok && x.acao.tipo === 'arrependimento' ? '<button type="button" class="btn-ghost btn-sm min-h-[44px]" data-acrescentar-arrependimento>Acrescentar o trecho dos 7 dias</button>' : ''}</li>`).join('')}</ul>
    <form class="mt-3 grid gap-2 sm:grid-cols-2" data-form-dados-loja><p class="text-sm font-medium sm:col-span-2">Dados da loja (vão no rodapé do site e no "O que colocar na plataforma")</p>
      ${CAMPOS_DADOS_LOJA.map(([k, rot, ph]) => `<div${k === 'endereco' ? ' class="sm:col-span-2"' : ''}><label class="label" for="dl-${k}">${esc(rot)}</label><input class="input" id="dl-${k}" name="${k}" value="${esc(dl[k] || '')}" placeholder="${esc(ph)}" ${k === 'email' ? 'type="email" autocomplete="email" spellcheck="false"' : k === 'telefone' ? 'type="tel" autocomplete="tel"' : ''}>${k === 'cnpj' && dl.cnpj ? `<p class="hint">${doc ? `${doc.toUpperCase()} confere.` : 'Os dígitos não conferem: confira com o cliente.'}</p>` : ''}</div>`).join('')}
      <div class="sm:col-span-2"><button class="btn-primary min-h-[44px]" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar dados da loja</button></div></form></div>`;
}
/** ctx: { cliente, getSite, salvarEVersionar, recarregar }. */
export function ligarLegal(el, ctx) {
  on(el, 'submit', '[data-form-dados-loja]', async (f, ev) => {
    ev.preventDefault();
    await ocupado(f.querySelector('[type=submit]'), async () => {
      const dadosLoja = normalizarDadosLoja(Object.fromEntries(new FormData(f)));
      await db.atualizar(COL.clientes, ctx.cliente.id, { dadosLoja });
      ctx.cliente.dadosLoja = dadosLoja;
      ctx.recarregar();
      setTimeout(() => mostrarResultado('[data-legal]', 'Dados da loja salvos: já aparecem no rodapé da prévia.'), 50);
    });
  });
  on(el, 'click', '[data-acrescentar-arrependimento]', (b) => ocupado(b, async () => {
    const site = ctx.getSite(); const c = site?.conteudo || {};
    const trocas = [String(c.politicas?.trocas || '').trim(), TRECHO_ARREPENDIMENTO].filter(Boolean).join('\n\n');
    await ctx.salvarEVersionar({ conteudo: { ...c, politicas: { ...(c.politicas || {}), trocas } } }, 'Política de trocas: direito de arrependimento (7 dias)');
    ctx.recarregar();
    setTimeout(() => mostrarResultado('[data-legal]', 'Trecho do arrependimento acrescentado à política de trocas. Revise com o cliente.'), 50);
  }));
}

// ---------- passo 4: animações do site (lib/animacoes-site.js) ----------
export function animacoesHtml(cliente, site) {
  const prazo = prazoDaOferta(cliente), a = normalizarAnimacoes(site?.animacoes, { prazo });
  const custom = site?.modo === 'custom';
  return `<fieldset class="mt-4 rounded-lg border border-slate-200 p-3" data-animacoes-site><legend class="px-1 text-sm font-semibold">Animações do site</legend>
    <p class="caption">Efeitos leves, só com CSS: aparecem na prévia e no link de aprovação${custom ? ' e vão no site baixado' : '; no passo 6 viram instruções para o tema'}. Quem pede "menos movimento" no celular vê a página parada, e nada esconde o botão de compra.</p>
    <div class="mt-2 grid gap-2 sm:grid-cols-2">${ANIMACOES_SITE.map((x) => {
      const bloqueio = x.id === 'contador' && !prazo.fim ? prazo.motivo : '';
      return `<label class="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 ${bloqueio ? 'opacity-80' : ''}" data-opcao-anim="${x.id}">
        <input type="checkbox" class="mt-1 h-4 w-4" data-anim-site="${x.id}" ${a[x.id] ? 'checked' : ''} ${bloqueio ? 'disabled aria-describedby="motivo-contador"' : ''}>
        <span class="min-w-0"><span class="block text-sm font-medium">${esc(x.nome)}</span><span class="block text-xs text-slate-600">${esc(x.legenda)}</span>
          ${bloqueio ? `<span class="mt-1 block text-xs text-amber-800" id="motivo-contador" data-motivo-contador>${esc(bloqueio)}</span>` : x.id === 'contador' ? `<span class="mt-1 block text-xs text-emerald-800">${esc(prazo.texto)} (da oferta ativa do perfil).</span>` : ''}</span></label>`;
    }).join('')}</div></fieldset>`;
}
export function ligarAnimacoes(el, { cliente, getSite, salvarSite, recarregar }) {
  on(el, 'change', '[data-anim-site]', (c) => ocupado(c, async () => {
    const site = getSite();
    const atual = normalizarAnimacoes(site?.animacoes, { prazo: prazoDaOferta(cliente) });
    await salvarSite({ animacoes: { ...atual, [c.dataset.animSite]: c.checked } });
    toast(`${ANIMACOES_SITE.find((x) => x.id === c.dataset.animSite).nome}: ${c.checked ? 'ligado' : 'desligado'}.`);
    recarregar();
  }));
}
