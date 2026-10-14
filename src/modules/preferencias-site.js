// "Como eu quero o site" e o que o operador gostou no site de referência (passo 3 de "Montar site").
// Fica em cliente.preferenciasSite e entra em TODA geração e ajuste do site, nos dois modos (core/ia.js
// contextoPreferencias), acima dos padrões da IA e abaixo das regras do app. Da referência: só estrutura e estilo.
import { db, COL } from '../core/storage.js';
import { salvarMaterial, removerMaterial, garantirCodigos, salvarUsos } from '../lib/materiais.js';
import { temCodigo, lerReferencias, nomeUso, porCodigo, aplicarReferencias, resolverEscolha, comUsos, dividirSecoes } from '../lib/fotos-site.js';
import { MODELO_PEDIDO_SITE } from '../lib/modelo-pedido-site.js';
import { lerReferenciaPrint } from '../core/ia.js';
import { prepararImagem } from './diagnostico.js';
import { esc, $, on, toast, ocupado, campoArquivo, mostrarResultado } from '../core/ui.js';
import { contadorTexto, LIMITE_TEXTO_SITE } from '../lib/textos-site.js';

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

// Contador do texto "Como eu quero o site": a partir de 90% avisa; o campo não corta nada sem avisar (maxlength = limite da IA).
const textoContador = (texto) => { const c = contadorTexto(texto); return { classe: `mt-1 text-xs ${c.perto ? 'font-medium text-amber-800' : 'text-slate-500'}`, texto: `${c.rotulo}${c.passou ? ': passou do limite, encurte o texto' : c.perto ? ': perto do limite, encurte se puder' : ''}` }; };
const contadorHtml = (texto) => { const c = textoContador(texto); return `<p class="${c.classe}" id="pref-texto-contador" aria-live="polite" data-contador-texto>${esc(c.texto)}</p>`; };

const temDitado = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const botaoDitado = (alvo) => (temDitado() ? `<button type="button" class="btn-ghost btn-sm" data-ditar="${alvo}" title="Falar em vez de digitar (o navegador transcreve)"><i class="fa-solid fa-microphone"></i> Ditar</button>` : '');

/** Bloco do topo do painel. */
export function preferenciasHtml(cliente, fotosTexto = null) {
  return `<div class="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3" data-preferencias-site>
    <div class="flex flex-wrap items-center justify-between gap-2"><label class="text-sm font-semibold" for="pref-texto"><i class="fa-solid fa-pen-to-square text-indigo-500"></i> Como eu quero o site</label>${botaoDitado('texto')}</div>
    <p class="hint !mt-0">Escreva do seu jeito. Ex: banner com a foto do produto, fotos inteiras sem cortar, poucas seções, tudo em fundo branco.</p>
    ${DICA_ESCREVER}
    ${MODELO_BOTOES}
    <textarea id="pref-texto" class="input mt-1" rows="5" maxlength="${LIMITE_TEXTO_SITE}" aria-describedby="pref-texto-contador" data-pref="texto">${esc(prefs(cliente).texto || '')}</textarea>
    ${contadorHtml(prefs(cliente).texto || '')}
    <p class="hint" data-pref-salvo>Vale para toda geração e todo ajuste do site (nos dois modos). Fica abaixo das regras do app: nada de prova inventada nem promessa que o Meta proíbe.</p>
    <div class="mt-2" data-fotos-codigos><p class="hint"><i class="fa-solid fa-spinner fa-spin"></i> Carregando as fotos…</p></div>
    <div data-leitura-referencias></div>${resultadoFotosTextoHtml(fotosTexto, { soAplicadas: true })}</div>`;
}

// Modelo pronto (lib/modelo-pedido-site.js): "Usar modelo" põe no campo (nunca apaga o texto dele); "Copiar modelo" copia.
const MODELO_BOTOES = `<div class="mt-1" data-modelo-pedido><div class="flex flex-wrap gap-2">
    <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-usar-modelo aria-controls="pref-texto"><i class="fa-solid fa-file-lines"></i> Usar modelo</button>
    <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-copiar-modelo><i class="fa-regular fa-copy"></i> Copiar modelo</button></div>
  <div class="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800" role="group" aria-labelledby="modelo-pergunta" data-modelo-confirmar hidden>
    <p id="modelo-pergunta" class="font-medium">O campo já tem texto. Colocar o modelo no fim?</p>
    <div class="mt-1 flex flex-wrap gap-2"><button type="button" class="btn-primary btn-sm min-h-[44px]" data-modelo-no-fim>Colocar no fim</button>
      <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-modelo-cancelar>Cancelar</button></div></div>
  <p class="text-xs text-slate-600" aria-live="polite" data-modelo-status></p></div>`;

// Dica opcional (nunca obrigatória) para o texto ser entendido melhor, com e sem IA.
const DICA_ESCREVER = `<details class="mt-1 text-xs" data-dica-escrever><summary class="flex min-h-[44px] cursor-pointer items-center font-medium text-indigo-700">Como escrever para a IA entender melhor</summary>
  <ul class="list-disc space-y-1 pb-2 pl-5 text-slate-700"><li>Um título por seção: "Página do produto:", "Depoimentos:", "Carrinho:".</li><li>Fotos com o lugar junto: "F27, F28, F29 na galeria do produto".</li><li>Um desejo por linha.</li><li>É só uma ajuda: pode escrever do seu jeito.</li></ul></details>`;

/** Linha única do que a leitura sem IA não entendeu (com "ver quais") e dos códigos que não existem. Amarelo: não é erro. */
export function naoEntendidasHtml(r) {
  if (!r) return '';
  const ine = (r.avisos || []).find((a) => /^Não existe esse código/.test(a));
  return `${r.resumo && r.naoEntendidas?.length ? `<div class="mt-1 rounded border border-amber-200 bg-amber-50 px-2 text-xs text-amber-800" data-resumo-nao-entendidas><p class="pt-2"><i class="fa-solid fa-circle-info"></i> ${esc(r.resumo)}</p>
    <details><summary class="flex min-h-[44px] cursor-pointer items-center font-medium">ver quais</summary><ul class="list-disc space-y-0.5 pb-2 pl-5" data-lista-nao-entendidas>${r.naoEntendidas.map((x) => `<li><b>${esc(x.codigos.join(', '))}</b>: ${esc(x.motivo)} <span class="text-slate-600">("${esc(x.trecho)}")</span></li>`).join('')}</ul></details></div>` : ''}
    ${ine ? `<p class="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800" data-codigos-inexistentes><i class="fa-solid fa-triangle-exclamation"></i> ${esc(ine)}</p>` : ''}`;
}

/** Conflitos do texto com o seletor, cada um com a escolha em um clique ("Usar F27" muda o seletor; "Manter F41" esconde). */
export function escolhasHtml(escolhas = [], mantidos = []) {
  const lista = escolhas.filter((e) => !mantidos.includes(e.chave));
  if (!lista.length) return '';
  return `<div class="mt-2 space-y-2" data-conflitos-escolha>${lista.map((e) => `<div class="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-700" data-conflito-foto="${esc(e.chave)}" role="group" aria-label="Conflito entre o texto e o seletor Usar em">
    <p class="font-medium"><i class="fa-solid fa-scale-balanced"></i> ${esc(e.texto)}</p>
    <div class="mt-1 flex flex-wrap gap-2"><button type="button" class="btn-primary btn-sm min-h-[44px]" data-usar-escolha="${esc(JSON.stringify(e.usar))}" data-chave="${esc(e.chave)}">${esc(e.usar.rotulo)}</button>
      <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-manter-escolha="${esc(e.chave)}">${esc(e.manter.rotulo)}</button></div></div>`).join('')}</div>`;
}

/**
 * Resultado da última aplicação das referências do texto (fica no site até a próxima: o aviso não some). Conflito vem
 * com os botões de escolha; o que não foi entendido sem IA vira uma linha só. `soAplicadas`: no passo 3 a leitura ao
 * vivo já mostra conflitos e resumo, então aqui só o que foi aplicado.
 */
export function resultadoFotosTextoHtml(r, { soAplicadas = false, mantidos = [] } = {}) {
  const temEscolha = (r?.escolhas || []).some((e) => !mantidos.includes(e.chave));
  if (!r || !(r.aplicadas?.length || (!soAplicadas && (r.avisos?.length || r.conflitos?.length || temEscolha)))) return '<div data-fotos-texto-resultado></div>';
  const conflitos = soAplicadas ? '' : r.escolhas ? escolhasHtml(r.escolhas, mantidos)
    : (r.conflitos || []).map((c) => `<p class="mt-1 text-amber-800" data-conflito-foto><i class="fa-solid fa-scale-balanced"></i> ${esc(c)}</p>`).join('');
  const avisos = soAplicadas ? '' : r.naoEntendidas ? naoEntendidasHtml(r)
    : (r.avisos || []).map((a) => `<p class="mt-1 text-amber-800" data-aviso-codigo><i class="fa-solid fa-triangle-exclamation"></i> ${esc(a)}</p>`).join('');
  return `<div class="mt-2 rounded border border-slate-200 bg-white p-2 text-xs" data-fotos-texto-resultado>
    <p class="font-semibold">Fotos pelo texto (última aplicação)</p>
    ${r.aplicadas?.length ? `<p class="text-emerald-800" data-fotos-aplicadas><i class="fa-solid fa-check"></i> Aplicado: ${esc(r.aplicadas.join(' · '))} (aparece em "Usar em" como "definido pelo texto")</p>` : ''}
    ${conflitos}${avisos}</div>`;
}

/**
 * Botões dos conflitos (passo 3 e passo 4). "Usar F27": a escolha vira do seletor (manual) e os painéis de fotos são
 * avisados (gcc:materiais). "Manter F41": fica guardado nas preferências e o conflito some. `depois({ chave, acao })`.
 */
export function ligarEscolhas(alvo, cliente, { depois = async () => {} } = {}) {
  on(alvo, 'click', '[data-usar-escolha]', (b) => ocupado(b, async () => {
    const usar = JSON.parse(b.dataset.usarEscolha), chave = b.dataset.chave;
    const lista = await db.listar(COL.materiais, { clienteId: cliente.id });
    const patches = resolverEscolha(lista, usar);
    await salvarUsos(patches);
    const antes = prefs(cliente).conflitosMantidos || [];
    if (antes.includes(chave)) await salvarPrefs(cliente, { conflitosMantidos: antes.filter((k) => k !== chave) });
    const nova = comUsos(lista, patches);
    document.dispatchEvent(new CustomEvent('gcc:materiais', { detail: { clienteId: cliente.id, lista: nova } }));
    await depois({ chave, acao: 'usar', lista: nova });
    toast(`Feito: ${usar.rotulo}. O seletor "Usar em" já mostra essa escolha.`);
  }));
  on(alvo, 'click', '[data-manter-escolha]', (b) => ocupado(b, async () => {
    const chave = b.dataset.manterEscolha;
    await salvarPrefs(cliente, { conflitosMantidos: [...new Set([...(prefs(cliente).conflitosMantidos || []), chave])] });
    b.closest('[data-conflito-foto]')?.remove();
    await depois({ chave, acao: 'manter' });
    toast('Mantido como está no seletor.');
  }));
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
  // Leitura sem IA, ao vivo: o que entendeu (por lugar), UMA linha do que não entendeu e os conflitos com botão.
  const lerTexto = () => {
    if (!leitura) return;
    const valor = $('[data-pref="texto"]', alvo)?.value || '';
    const r = lerReferencias(valor, { materiais: fotos, produtos });
    const vazias = dividirSecoes(valor).filter((x) => x.naoPreenchido);
    const naoPreenchidas = vazias.length ? `<p class="mt-1 text-slate-500" data-nao-preenchidas><b>Não preenchido</b> (fica de fora até você escrever): ${vazias.map((x) => `<span class="tag">${esc(x.titulo)}</span>`).join(' ')}</p>` : '';

    const { escolhas } = r.refs.length ? aplicarReferencias(fotos, r.refs, { produtos }) : { escolhas: [] };
    const lugares = new Map();
    for (const x of r.refs) { const k = x.uso === 'produto' ? x.produtoNome : nomeUso(x.uso); lugares.set(k, [...(lugares.get(k) || []), `${x.codigo}${x.principal ? ' (principal)' : ''}`]); }
    leitura.innerHTML = r.refs.length || r.avisos.length || escolhas.length || vazias.length ? `<div class="mt-1 text-xs" data-referencias-lidas>
      ${r.refs.length ? `<p class="text-slate-700"><b>Entendi sem IA:</b> ${esc([...lugares].map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · '))}. Vale ao gerar o site${aplicarFotosTexto ? ' ou em "Aplicar agora"' : ''}; a escolha feita em "Usar em" vence.</p>` : ''}
      ${naoEntendidasHtml(r)}${escolhasHtml(escolhas, prefs(cliente).conflitosMantidos || [])}
      ${naoPreenchidas}${r.refs.length && aplicarFotosTexto ? '<button type="button" class="btn-ghost btn-sm mt-1 min-h-[44px]" data-aplicar-fotos-texto><i class="fa-solid fa-images"></i> Aplicar agora (sem IA)</button>' : ''}</div>` : '';
  };
  let espera = null;
  const lerTextoDepois = () => { clearTimeout(espera); espera = setTimeout(lerTexto, 250); };
  ligarEscolhas(alvo, cliente, { depois: async ({ acao }) => { if (acao === 'manter') lerTexto(); } });
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
  const contar = () => { const campo = $('[data-pref="texto"]', alvo), cont = $('[data-contador-texto]', alvo); if (!campo || !cont) return; const c = textoContador(campo.value); cont.className = c.classe; cont.textContent = c.texto; };
  on(alvo, 'input', '[data-pref="texto"]', () => { lerTextoDepois(); contar(); });
  on(alvo, 'click', '[data-inserir-codigo]', (b) => {
    const campo = $('[data-pref="texto"]', alvo); if (!campo) return;
    const ini = campo.selectionStart ?? campo.value.length, fim = campo.selectionEnd ?? ini;
    const antes = campo.value.slice(0, ini), depois = campo.value.slice(fim);
    const ins = `${antes && !/\s$/.test(antes) ? ' ' : ''}${b.dataset.inserirCodigo} `;
    campo.value = antes + ins + depois; campo.focus(); campo.selectionStart = campo.selectionEnd = (antes + ins).length;
    campo.dispatchEvent(new Event('change', { bubbles: true })); lerTexto(); contar();
  });
  // "Usar modelo": campo vazio recebe o modelo; com texto, pergunta antes e só põe no fim. O cursor vai para o 1º "[".
  const statusModelo = (msg) => { const st = $('[data-modelo-status]', alvo); if (st) st.textContent = msg; };
  const confirmar = (abrir) => { const c = $('[data-modelo-confirmar]', alvo); if (c) c.hidden = !abrir; if (abrir) $('[data-modelo-no-fim]', c)?.focus(); };
  const porModelo = (noFim) => {
    const campo = $('[data-pref="texto"]', alvo); if (!campo) return;
    const atual = campo.value.replace(/\s+$/, '');
    const antes = noFim && atual.trim() ? `${atual}\n\n` : '';
    const novo = antes + MODELO_PEDIDO_SITE;
    if (novo.length > LIMITE_TEXTO_SITE) { confirmar(false); toast(`O modelo não coube: o campo ficaria com ${novo.length.toLocaleString('pt-BR')} caracteres e o limite é ${LIMITE_TEXTO_SITE.toLocaleString('pt-BR')}. Encurte o texto e tente de novo.`, 'erro'); return; }
    campo.value = novo;
    const cursor = antes.length + MODELO_PEDIDO_SITE.indexOf('[');
    campo.focus(); campo.setSelectionRange(cursor, cursor);
    // o navegador deixa o campo rolado no fim: rola até a linha do cursor (a 1ª a preencher fica à vista)
    const linha = novo.slice(0, cursor).split('\n').length - 1, alt = parseFloat(getComputedStyle(campo).lineHeight) || 24;
    campo.scrollTop = Math.max(0, (linha - 1) * alt);
    campo.dispatchEvent(new Event('change', { bubbles: true })); lerTexto(); contar(); confirmar(false);
    statusModelo(noFim ? 'Modelo colocado no fim do seu texto. Troque o que está entre [ ]; o que ficar com [ ] não vai para a IA.' : 'Modelo no campo. Troque o que está entre [ ]; o que ficar com [ ] não vai para a IA.');
  };
  on(alvo, 'click', '[data-usar-modelo]', () => { const campo = $('[data-pref="texto"]', alvo); if (!campo) return; if (campo.value.trim()) confirmar(true); else porModelo(false); });
  on(alvo, 'click', '[data-modelo-no-fim]', () => porModelo(true));
  on(alvo, 'click', '[data-modelo-cancelar]', () => { confirmar(false); statusModelo('Nada mudou no seu texto.'); $('[data-usar-modelo]', alvo)?.focus(); });
  on(alvo, 'click', '[data-copiar-modelo]', async () => {
    try { await navigator.clipboard.writeText(MODELO_PEDIDO_SITE); } catch {
      const t = document.createElement('textarea'); t.value = MODELO_PEDIDO_SITE; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy'); t.remove();
      if (!ok) { toast('Não consegui copiar agora. Use "Usar modelo" para pôr o modelo direto no campo.', 'erro'); return; }
    }
    statusModelo('Modelo copiado.'); toast('Modelo copiado');
  });
  on(alvo, 'click', '[data-aplicar-fotos-texto]', (b) => ocupado(b, async () => {
    const campo = $('[data-pref="texto"]', alvo);
    if (campo && campo.value.trim() !== String(prefs(cliente).texto || '')) await salvarPrefs(cliente, { texto: campo.value.trim() });
    const r = await aplicarFotosTexto();
    const caixa = $('[data-fotos-texto-resultado]', alvo); if (caixa) caixa.outerHTML = resultadoFotosTextoHtml(r, { soAplicadas: true });
    const nova = $('[data-fotos-texto-resultado]', alvo);
    lerTexto();
    const atencao = r.conflitos?.length || r.avisos?.length;
    const alvoMsg = (atencao && $('[data-referencias-lidas]', alvo)) || nova;
    if (alvoMsg) mostrarResultado(alvoMsg, atencao ? 'Aplicado. Veja os pontos de atenção aqui.' : 'Pronto: fotos aplicadas pelo texto.');
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
    rec.onresult = (ev) => {
      const novo = [...ev.results].slice(ev.resultIndex).map((r) => r[0].transcript).join(' ').trim(); if (!novo) return;
      const junto = `${campo.value.trim()} ${novo}`.trim(), max = Number(campo.maxLength) > 0 ? Number(campo.maxLength) : Infinity;
      if (junto.length > max) { toast(`O texto ditado não coube: o campo tem limite de ${max} caracteres. Encurte o texto e dite de novo.`, 'erro'); return; }
      campo.value = junto; if (campo.dataset.pref === 'texto') contar();
    };
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
