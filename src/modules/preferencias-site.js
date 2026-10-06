// "Como eu quero o site" e o que o operador gostou no site de referência (passo 3 de "Montar site").
// Fica em cliente.preferenciasSite e entra em TODA geração e ajuste do site, nos dois modos (core/ia.js
// contextoPreferencias), acima dos padrões da IA e abaixo das regras do app. Da referência: só estrutura e estilo.
import { db, COL } from '../core/storage.js';
import { salvarMaterial, removerMaterial, garantirCodigos } from '../lib/materiais.js';
import { temCodigo, lerReferencias, nomeUso, porCodigo } from '../lib/fotos-site.js';
import { lerReferenciaPrint } from '../core/ia.js';
import { prepararImagem } from './diagnostico.js';
import { esc, $, on, toast, ocupado, campoArquivo, mostrarResultado } from '../core/ui.js';

const prefs = (cliente) => cliente.preferenciasSite || {};
/** Tira o print de referência antigo: só apaga se o registro for mesmo um print de referência (nunca outro material). */
async function tirarReferencia(cliente, p) {
  const mat = p?.materialId ? await db.obter(COL.materiais, p.materialId).catch(() => null) : null;
  if (mat?.origem === 'referencia') await removerMaterial(cliente, mat, { trocando: 'referencia' });
}
async function salvarPrefs(cliente, patch) {
  const preferenciasSite = { ...prefs(cliente), ...patch };
  await db.atualizar(COL.clientes, cliente.id, { preferenciasSite }, { silencioso: true });
  cliente.preferenciasSite = preferenciasSite;
}

const temDitado = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const botaoDitado = (alvo) => (temDitado() ? `<button type="button" class="btn-ghost btn-sm" data-ditar="${alvo}" title="Falar em vez de digitar (o navegador transcreve)"><i class="fa-solid fa-microphone"></i> Ditar</button>` : '');

/** Bloco do topo do painel. */
export function preferenciasHtml(cliente, fotosTexto = null) {
  return `<div class="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3" data-preferencias-site>
    <div class="flex flex-wrap items-center justify-between gap-2"><label class="text-sm font-semibold" for="pref-texto"><i class="fa-solid fa-pen-to-square text-indigo-500"></i> Como eu quero o site</label>${botaoDitado('texto')}</div>
    <p class="hint !mt-0">Escreva do seu jeito. Ex: banner com a foto do produto, fotos inteiras sem cortar, poucas seções, tudo em fundo branco.</p>
    <textarea id="pref-texto" class="input mt-1" rows="3" maxlength="1500" data-pref="texto">${esc(prefs(cliente).texto || '')}</textarea>
    <p class="hint" data-pref-salvo>Vale para toda geração e todo ajuste do site (nos dois modos). Fica abaixo das regras do app: nada de prova inventada nem promessa que o Meta proíbe.</p>
    <div class="mt-2" data-fotos-codigos><p class="hint"><i class="fa-solid fa-spinner fa-spin"></i> Carregando as fotos…</p></div>
    <div data-leitura-referencias></div>${resultadoFotosTextoHtml(fotosTexto)}</div>`;
}

/** Resultado da última aplicação das referências do texto (fica no site até a próxima: o aviso não some). */
export function resultadoFotosTextoHtml(r) {
  if (!r || !(r.aplicadas?.length || r.avisos?.length || r.conflitos?.length)) return '<div data-fotos-texto-resultado></div>';
  return `<div class="mt-2 rounded border border-slate-200 bg-white p-2 text-xs" data-fotos-texto-resultado>
    <p class="font-semibold">Fotos pelo texto (última geração)</p>
    ${r.aplicadas?.length ? `<p class="text-emerald-800" data-fotos-aplicadas><i class="fa-solid fa-check"></i> Aplicado: ${esc(r.aplicadas.join(' · '))} (aparece em "Usar em" como "definido pelo texto")</p>` : ''}
    ${(r.conflitos || []).map((c) => `<p class="mt-1 text-amber-800" data-conflito-foto><i class="fa-solid fa-scale-balanced"></i> ${esc(c)}</p>`).join('')}
    ${(r.avisos || []).map((a) => `<p class="mt-1 font-medium text-rose-700" data-aviso-codigo><i class="fa-solid fa-triangle-exclamation"></i> ${esc(a)}</p>`).join('')}</div>`;
}

/** Complemento da linha "Site de referência": o que gostou + print (sites costumam bloquear a leitura). */
export function referenciaExtraHtml(cliente) {
  const p = prefs(cliente);
  return `<div class="mt-2 space-y-2 rounded-lg bg-slate-50 p-2" data-referencia-extra>
    <div><div class="flex flex-wrap items-center justify-between gap-2"><label class="text-xs font-semibold" for="pref-gostei">O que eu gostei nesse site</label>${botaoDitado('gostei')}</div>
      <textarea id="pref-gostei" class="input mt-1" rows="2" maxlength="800" data-pref="gostei" placeholder="Ex.: banner grande com foto, 3 produtos por linha, bastante espaço em branco">${esc(p.gostei || '')}</textarea></div>
    <div data-ref-print>${p.referenciaPrint?.url ? `<div class="flex flex-wrap items-start gap-2"><img src="${esc(p.referenciaPrint.url)}" alt="Print do site de referência" class="h-24 rounded border border-slate-200 object-contain">
        <div class="min-w-0 flex-1 text-xs"><p class="font-semibold">Print da referência</p>${p.referenciaLeitura ? `<p class="mt-1 whitespace-pre-wrap text-slate-700" data-ref-leitura>${esc(p.referenciaLeitura)}</p>` : '<p class="hint">Ainda não lido.</p>'}
          <div class="mt-1 flex flex-wrap gap-2"><button type="button" class="btn-ia btn-sm" data-ler-ref-print><i class="fa-solid fa-wand-magic-sparkles"></i> ${p.referenciaLeitura ? 'Ler de novo' : 'Ler estrutura e estilo'}</button>
          <button type="button" class="btn-ghost btn-sm" data-tirar-ref-print>Tirar o print</button></div></div></div>`
      : campoArquivo({ attrs: 'data-ref-arquivo', accept: 'image/png,image/jpeg,image/webp', icone: 'camera', texto: 'Enviar print do site de referência', destaque: false, removivel: false,
        dica: 'Quando o site não deixa ler, um print da página resolve. A IA usa só a estrutura e o estilo (ordem das seções, banner, grade, espaços): nunca textos, imagens ou marca dele.' })}</div></div>`;
}

/** Liga os campos dentro de `alvo`. `aoMudar()` redesenha a linha do print. */
export function ligarPreferencias(alvo, cliente, aoMudar = () => {}, { aplicarFotosTexto = null } = {}) {
  // Faixa de miniaturas com os códigos (F1, F2...): para escrever ou ditar "F3 no banner, F5 no Thermora".
  let fotos = [], produtos = [];
  const faixa = $('[data-fotos-codigos]', alvo), leitura = $('[data-leitura-referencias]', alvo);
  const lerTexto = () => {
    if (!leitura) return;
    const { refs, avisos } = lerReferencias($('[data-pref="texto"]', alvo)?.value || '', { materiais: fotos, produtos });
    leitura.innerHTML = refs.length || avisos.length ? `<div class="mt-1 text-xs" data-referencias-lidas>
      ${refs.length ? `<p class="text-slate-700"><b>Entendi:</b> ${esc(refs.map((r) => `${r.codigo} → ${r.uso === 'produto' ? `${r.produtoNome}${r.principal ? ' (principal)' : ''}` : nomeUso(r.uso)}`).join(' · '))}. Vale ao gerar o site${aplicarFotosTexto ? ' ou em "Aplicar agora"' : ''}; a escolha feita em "Usar em" vence.</p>` : ''}
      ${avisos.map((a) => `<p class="mt-0.5 font-medium text-rose-700" data-aviso-codigo-vivo><i class="fa-solid fa-triangle-exclamation"></i> ${esc(a)}</p>`).join('')}
      ${refs.length && aplicarFotosTexto ? '<button type="button" class="btn-ghost btn-sm mt-1" data-aplicar-fotos-texto><i class="fa-solid fa-images"></i> Aplicar agora (sem IA)</button>' : ''}</div>` : '';
  };
  const desenharFaixa = (lista) => {
    fotos = lista.filter((m) => temCodigo(m) && m.codigo).sort(porCodigo);
    if (!faixa) return;
    faixa.innerHTML = fotos.length ? `<p class="text-xs font-semibold">Fotos do cliente (toque para pôr o código no texto)</p>
      <div class="mt-1 flex gap-2 overflow-x-auto pb-1" data-faixa-fotos>${fotos.map((m) => `<button type="button" class="relative shrink-0" data-inserir-codigo="${esc(m.codigo)}" title="${esc(m.codigo)}: ${esc(m.nomeOriginal || m.nome || '')}">
        <img src="${esc(m.url)}" alt="${esc(m.codigo)}" loading="lazy" class="h-14 w-14 rounded border border-slate-200 object-cover">
        <span class="absolute left-0.5 top-0.5 rounded px-1 text-[10px] font-bold" style="background:rgba(0,0,0,.78);color:#fff">${esc(m.codigo)}</span></button>`).join('')}</div>`
      : '<p class="hint">Sem fotos nos Materiais do cliente ainda. Ao enviar, cada uma ganha um código (F1, F2…) para usar aqui.</p>';
    lerTexto();
  };
  (async () => {
    try {
      produtos = await db.listar(COL.produtos, { clienteId: cliente.id }).catch(() => []);
      desenharFaixa(await garantirCodigos(cliente, await db.listar(COL.materiais, { clienteId: cliente.id })));
    } catch (e) { if (faixa) faixa.innerHTML = `<p class="hint text-rose-600">Não consegui carregar as fotos (${esc(e.message)}).</p>`; }
  })();
  const ouvir = async (e) => {
    if (e.detail?.clienteId !== cliente.id) return;
    if (!alvo.isConnected) { document.removeEventListener('gcc:materiais', ouvir); return; }
    desenharFaixa(await garantirCodigos(cliente, e.detail.lista || []));
  };
  if (typeof document !== 'undefined') document.addEventListener('gcc:materiais', ouvir);
  on(alvo, 'input', '[data-pref="texto"]', () => lerTexto());
  on(alvo, 'click', '[data-inserir-codigo]', (b) => {
    const campo = $('[data-pref="texto"]', alvo); if (!campo) return;
    const ini = campo.selectionStart ?? campo.value.length, fim = campo.selectionEnd ?? ini;
    const antes = campo.value.slice(0, ini), depois = campo.value.slice(fim);
    const ins = `${antes && !/\s$/.test(antes) ? ' ' : ''}${b.dataset.inserirCodigo} `;
    campo.value = antes + ins + depois; campo.focus(); campo.selectionStart = campo.selectionEnd = (antes + ins).length;
    campo.dispatchEvent(new Event('change', { bubbles: true })); lerTexto();
  });
  on(alvo, 'click', '[data-aplicar-fotos-texto]', (b) => ocupado(b, async () => {
    const campo = $('[data-pref="texto"]', alvo);
    if (campo && campo.value.trim() !== String(prefs(cliente).texto || '')) await salvarPrefs(cliente, { texto: campo.value.trim() });
    const r = await aplicarFotosTexto();
    const caixa = $('[data-fotos-texto-resultado]', alvo); if (caixa) caixa.outerHTML = resultadoFotosTextoHtml(r);
    const nova = $('[data-fotos-texto-resultado]', alvo);
    if (nova) mostrarResultado(nova, r.conflitos?.length || r.avisos?.length ? 'Aplicado, com pontos de atenção abaixo.' : 'Pronto: fotos aplicadas pelo texto.');
  }));
  on(alvo, 'change', '[data-pref]', async (t) => {
    await salvarPrefs(cliente, { [t.dataset.pref]: t.value.trim() });
    const s = $('[data-pref-salvo]', alvo); if (s && t.dataset.pref === 'texto') s.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600"></i> Salvo. Vale para a próxima geração e para os ajustes.';
    toast('Preferência do site salva.');
  });
  // Ditado (reconhecimento de voz do navegador, o mesmo do editor de vídeo): o texto falado entra no fim do campo.
  on(alvo, 'click', '[data-ditar]', (b) => {
    const campo = $(`[data-pref="${b.dataset.ditar}"]`, alvo); const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!campo || !R) return;
    if (b._rec) { b._rec.stop(); return; }
    const rec = new R(); rec.lang = 'pt-BR'; rec.interimResults = false; rec.continuous = true; b._rec = rec;
    rec.onresult = (ev) => { const novo = [...ev.results].slice(ev.resultIndex).map((r) => r[0].transcript).join(' ').trim(); if (novo) campo.value = `${campo.value.trim()} ${novo}`.trim(); };
    rec.onend = () => { b._rec = null; b.innerHTML = '<i class="fa-solid fa-microphone"></i> Ditar'; campo.dispatchEvent(new Event('change', { bubbles: true })); };
    rec.onerror = (ev) => toast(ev.error === 'not-allowed' ? 'O navegador não liberou o microfone. Permita o microfone para este site e tente de novo.' : `O ditado parou (${ev.error}). Tente de novo ou digite.`, 'erro');
    rec.start(); b.innerHTML = '<i class="fa-solid fa-stop"></i> Parar';
  });
  on(alvo, 'change', '[data-ref-arquivo]', (inp) => ocupado(inp, async () => {
    const f = inp.files?.[0]; if (!f) return;
    const antigo = prefs(cliente).referenciaPrint;
    const m = await salvarMaterial(cliente, new Blob([f], { type: f.type || 'image/jpeg' }), 'referencia', { nomeOriginal: f.name, tamanho: f.size });
    await tirarReferencia(cliente, antigo);
    await salvarPrefs(cliente, { referenciaPrint: { materialId: m.id, url: m.url, path: m.path, nome: f.name }, referenciaLeitura: '' });
    aoMudar(); await lerPrint(); // já tenta ler a estrutura (sem IA, o texto "O que eu gostei" continua valendo)
  }));
  async function lerPrint() {
    const caixa = $('[data-ref-print]', alvo); const p = prefs(cliente).referenciaPrint; if (!p?.url) return;
    const btn = $('[data-ler-ref-print]', alvo);
    await ocupado(btn || caixa, async () => {
      const bl = await (await fetch(p.url)).blob();
      const prep = await prepararImagem(new File([bl], p.nome || 'referencia.jpg', { type: bl.type || 'image/jpeg' }), 1092, 0.85); // só estrutura e estilo (nada de texto miúdo): 1092 px usa ~metade dos tokens de 1568
      const estrutura = await lerReferenciaPrint({ cliente, imagem: { media_type: prep.media_type, data: prep.data } });
      if (!estrutura) throw new Error('Não consegui ler o print agora. Descreva no campo "O que eu gostei nesse site".');
      await salvarPrefs(cliente, { referenciaLeitura: estrutura });
      aoMudar(); toast('Estrutura e estilo da referência lidos. Valem para a próxima geração e para os ajustes.');
    });
  }
  on(alvo, 'click', '[data-ler-ref-print]', () => lerPrint());
  on(alvo, 'click', '[data-tirar-ref-print]', (b) => ocupado(b, async () => {
    const p = prefs(cliente).referenciaPrint; if (!p) return;
    await tirarReferencia(cliente, p);
    await salvarPrefs(cliente, { referenciaPrint: null, referenciaLeitura: '' }); aoMudar();
  }));
}
