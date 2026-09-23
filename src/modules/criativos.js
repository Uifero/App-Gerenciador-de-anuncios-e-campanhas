// Aba Criativos: gerar (IA ou manual), refinar por chat com histórico de versões, aprovar, anexar arquivo final.
import { db, COL, removerArquivo } from '../core/storage.js';
import { gerarCriativos, refinarCriativo, checarQualidade, acharTermosProibidos } from '../core/ia.js';
import { obterConfig } from './configuracoes.js';
import { abrirEnvio, sincronizarAprovacoes, tagAprovacao } from './aprovacao.js';
import { abrirEstudio } from './estudio.js';
import { apagarCriativoEmCascata } from '../lib/cascata.js';
import { enviarArquivoOuAvisar } from '../lib/uploads.js';
import { padroesPorNicho, sugestaoNaoTestada } from './insights.js';
import {
  FRAMEWORKS, MODELOS_CRIATIVO, FORMATOS, STATUS_CRIATIVO, STATUS_COR, CHECKLIST_QUALIDADE,
} from '../lib/constantes.js';
import {
  esc, $, on, montar, cabecalho, iaNota, vazio, tag, dataBR, diasDesde, toast, modal, ocupado, lerForm, opcoes, copiar, confirmar, campoArquivo,
} from '../core/ui.js';

const rotulo = (lista, v) => (lista.find(([k]) => k === v) || [, v])[1];
/** Status em que o criativo já passou pelo crivo interno — os mesmos usados em campanhas.js para "disponível". */
const APROVADOS = ['aprovado', 'em_uso', 'pausado'];

/** Muda o status; ao virar "em_uso" registra a data de início (base do alerta de fadiga). */
export async function definirStatus(criativo, status) {
  const patch = { status };
  if (status === 'em_uso' && !criativo.emUsoDesde) patch.emUsoDesde = new Date().toISOString();
  if (status !== 'em_uso' && status !== 'pausado') patch.emUsoDesde = null;
  await db.atualizar(COL.criativos, criativo.id, patch);
  Object.assign(criativo, patch);
  return patch;
}

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [criativos, referencias, resultados, produtos, cfg] = await Promise.all([
    db.listar(COL.criativos, { clienteId: cliente.id }), db.listar(COL.referencias, { clienteId: cliente.id }),
    db.listar(COL.resultados, { clienteId: cliente.id }), db.listar(COL.produtos, { clienteId: cliente.id }), obterConfig(),
  ]);
  // Sugestão proativa (Insights): um ângulo/framework comprovado em clientes de nicho semelhante que este
  // cliente ainda não testou em nenhum criativo. Falha aqui não impede o resto da tela (é só uma sugestão).
  let sugestaoInsight = null;
  try {
    const nicho = await padroesPorNicho(cliente.nicho, cliente.id);
    sugestaoInsight = sugestaoNaoTestada(nicho.padroes, criativos);
  } catch (e) { console.warn('[insights] sugestão de ângulo/framework indisponível:', e); }
  // Traz para o painel o que o cliente final respondeu pelo link de aprovação (falha aqui não impede de usar a aba,
  // mas fica visível em vez de silenciosa: uma resposta que não aparece aqui era a causa mais provável de "não confirmado").
  try {
    const r = await sincronizarAprovacoes(cliente, criativos);
    if (r.falhas.length) toast(`Não consegui atualizar ${r.falhas.length} resposta(s) de aprovação. Recarregue a página para tentar de novo.`, 'erro');
  } catch (e) {
    console.warn('[aprovação] não foi possível sincronizar as respostas:', e);
    toast('Não consegui verificar as respostas de aprovação do cliente agora (veja o console). As peças continuam com o último status salvo.', 'erro');
  }
  let filtro = '';

  const lista = () => {
    const itens = criativos.filter((c) => !filtro || c.status === filtro);
    return itens.length ? `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${itens.map((c) => cartao(c, cfg)).join('')}</div>`
      : vazio('wand-magic-sparkles', 'Nenhum criativo aqui ainda', 'Comece gerando ideias a partir de um briefing curto.',
        '<button class="btn-primary" data-novo><i class="fa-solid fa-plus"></i> Criar primeiro criativo</button>');
  };

  root.innerHTML = `${cabecalho('Criativos', 'Caminho de cada anúncio: 1. gerar ou escrever → 2. abrir, revisar e completar o checklist → 3. enviar ao cliente aprovar → 4. "Gerar foto e vídeo" → 5. vincular na aba Campanhas. Cada ajuste vira uma versão.',
    `<select class="input !w-auto" data-filtro title="Filtrar por status"><option value="">Todos os status</option>${opcoes(STATUS_CRIATIVO, '')}</select>
     <button class="btn-ghost" data-enviar title="Gera um link para o cliente final ver as peças e aprovar ou pedir ajuste, sem login"><i class="fa-solid fa-paper-plane"></i> Enviar para aprovação</button>
     <button class="btn-primary" data-novo title="Gerar ou escrever um criativo novo"><i class="fa-solid fa-plus"></i> Novo criativo</button>`)}
    <div id="painel"></div><div id="lista">${lista()}</div>`;

  const atualizar = async () => {
    criativos.splice(0, criativos.length, ...(await db.listar(COL.criativos, { clienteId: cliente.id })));
    $('#lista', root).innerHTML = lista();
  };
  on(root, 'change', '[data-filtro]', (s) => { filtro = s.value; $('#lista', root).innerHTML = lista(); });
  on(root, 'click', '[data-novo]', () => painelNovo($('#painel', root), cliente, referencias, resultados, recarregar, null, atualizar, cfg, produtos, sugestaoInsight));
  on(root, 'click', '[data-enviar]', () => abrirEnvio(cliente, criativos, { preSelecionar: criativos.filter((c) => c.status === 'rascunho').map((c) => c.id), aoMudar: recarregar }));

  // Vindo da aba Referências: abre já com a referência escolhida como ponto de partida.
  let preRef = null;
  try { preRef = sessionStorage.getItem('gcc_ref'); sessionStorage.removeItem('gcc_ref'); } catch { /* sem storage */ }
  const base = preRef && referencias.find((r) => r.id === preRef);
  if (base) painelNovo($('#painel', root), cliente, referencias, resultados, recarregar, base, atualizar, cfg, produtos, sugestaoInsight);
  on(root, 'click', '[data-abrir]', (b) => detalhe(criativos.find((c) => c.id === b.dataset.abrir), cliente, cfg, recarregar));

  // Vindo da busca global: abre direto o criativo encontrado.
  let abrirId = null;
  try { abrirId = sessionStorage.getItem('gcc_abrir_criativo'); sessionStorage.removeItem('gcc_abrir_criativo'); } catch { /* sem storage */ }
  const alvoBusca = abrirId && criativos.find((c) => c.id === abrirId);
  if (alvoBusca) detalhe(alvoBusca, cliente, cfg, recarregar);
});

function cartao(c, cfg) {
  const dias = c.status === 'em_uso' ? diasDesde(c.emUsoDesde) : null;
  const fadiga = dias != null && dias >= cfg.diasFadiga;
  return `<button data-abrir="${c.id}" class="card text-left transition hover:border-indigo-400 hover:shadow-md">
    <div class="flex items-start justify-between gap-2"><h3 class="font-semibold leading-tight">${esc(c.nome)}</h3>${tag(rotulo(STATUS_CRIATIVO, c.status), STATUS_COR[c.status])}</div>
    <p class="caption mt-1 line-clamp-2">“${esc(c.hook)}”</p>
    <div class="mt-3 flex flex-wrap gap-1">
      ${tagAprovacao(c)}${c.framework ? tag(c.framework, 'tag-info') : ''}${c.angulo ? tag(c.angulo) : ''}${tag(rotulo(FORMATOS, c.formato))}${tag(c.idioma || 'pt-BR')}
      ${c.arquivoUrl ? tag('com arquivo', 'tag-ok') : tag('sem arquivo', 'tag-warn')}
      ${(c.versoes?.length || 1) > 1 ? tag(`v${c.versoes.length}`) : ''}${c.referenciaId ? tag('de referência', 'tag-info') : ''}
      ${fadiga ? tag(`fadiga: ${dias}d no ar`, 'tag-bad') : ''}</div>
    <p class="hint mt-2">${dataBR(c.criadoEm)}</p></button>`;
}

// ---------------- painel de novo criativo ----------------
/** Descrição curta do produto para prefixar o briefing (editável depois) — nome, categoria, preço e descrição. */
export function resumoProduto(p) {
  return [p.nome, p.categoria && `(${p.categoria})`, p.preco && `R$ ${p.preco}`, p.descricao].filter(Boolean).join(' — ');
}

function painelNovo(alvo, cliente, referencias, resultados, recarregar, base = null, atualizar = null, cfg = {}, produtos = [], sugestaoInsight = null) {
  alvo.innerHTML = `<div class="card mb-5 space-y-4">
    <div class="flex items-center justify-between"><h3 class="font-semibold">Novo criativo</h3><button class="text-slate-400" data-x aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div>
    <form id="fg" class="space-y-3">
      ${produtos.length ? `<div><label class="label">Produto (opcional)</label><select class="input" name="produtoId" data-produto>
          <option value="">Nenhum — descrever no briefing</option>${produtos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
        <p class="hint">Preenche o briefing com os dados do produto (editável antes de gerar). Cadastrado na aba Produtos.</p></div>` : ''}
      <div><label class="label">O que você quer comunicar?</label>
        <textarea class="input" rows="3" name="briefing" placeholder="Ex.: legging nova que não fica transparente no agachamento — foco em quem tem vergonha de treinar na academia"></textarea>
        <p class="hint">Uma ou duas frases bastam. A IA usa o perfil de marca do cliente e as referências salvas.</p>
        ${(cliente.angulosSugeridos || []).length ? `<div class="mt-2 flex flex-wrap items-center gap-1" title="Ângulos do playbook aplicado a este cliente. Clique para acrescentar ao briefing."><span class="hint !mt-0">Ângulos sugeridos (${esc(cliente.playbookNome || 'playbook')}):</span>
          ${cliente.angulosSugeridos.map((a) => `<button type="button" class="tag hover:bg-indigo-100" data-ang="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}
        ${sugestaoInsight ? `<div class="mt-2 flex flex-wrap items-center gap-1" title="${esc(`Insights: ${sugestaoInsight.rotulo} "${sugestaoInsight.grupo.valor}" teve ROAS médio ${sugestaoInsight.grupo.roasMedio?.toFixed(2) ?? 'n/d'}x em ${sugestaoInsight.grupo.amostras} resultado(s) de clientes de nicho semelhante — e este cliente ainda não testou.`)}">
          <span class="hint !mt-0"><i class="fa-solid fa-chart-simple"></i> Insights sugere (ainda não testado aqui):</span>
          <button type="button" class="tag tag-info hover:bg-indigo-100" data-insight="${esc(sugestaoInsight.grupo.valor)}" data-insight-campo="${sugestaoInsight.campo}">${esc(sugestaoInsight.rotulo)}: ${esc(sugestaoInsight.grupo.valor)} (ROAS ${sugestaoInsight.grupo.roasMedio?.toFixed(2) ?? 'n/d'}x)</button></div>` : ''}</div>
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções (modelo, framework, formato, variações, referência)</summary>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label class="label">Modelo pronto</label><select class="input" name="modelo">${opcoes(MODELOS_CRIATIVO, '')}</select></div>
          <div><label class="label">Framework de copy</label><select class="input" name="framework">${opcoes(FRAMEWORKS, 'livre')}</select><p class="hint">A estrutura do texto (ex.: problema → solução). Na dúvida, deixe "livre".</p></div>
          <div><label class="label">Formato</label><select class="input" name="formato">${opcoes(FORMATOS, 'video_curto')}</select></div>
          <div><label class="label">Variações a gerar</label><select class="input" name="quantidade" title="Menos variações = menos custo de IA nesta geração">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === (Number(cfg.variacoesPadrao) || 4) ? 'selected' : ''}>${n}</option>`).join('')}</select><p class="hint">Menos variações = menos custo nesta geração.</p></div>
          <div><label class="label">Partir de uma referência salva</label><select class="input" name="referenciaId">
            <option value="">Nenhuma</option>${referencias.map((r) => `<option value="${r.id}" ${base?.id === r.id ? 'selected' : ''}>${esc(r.titulo || 'Referência')}${r.sinal ? ' · ' + r.sinal : ''}</option>`).join('')}</select></div>
        </div></details>
      <p class="caption"><b>Com IA:</b> cria <span data-qtd>${Number(cfg.variacoesPadrao) || 4}</span> versões diferentes (hook, texto e CTA) para você comparar e salvar as melhores. <b>Sem IA:</b> abre um formulário em branco para escrever.</p>
      <div class="flex flex-wrap gap-2">
        <button class="btn-ia" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar <span data-qtd>${Number(cfg.variacoesPadrao) || 4}</span> variações com IA</button>
        <button class="btn-ghost" type="button" data-manual title="Escreva o criativo você mesmo, sem usar IA">Escrever sem IA</button>
      </div>
    </form>
    <div id="saida"></div></div>`;
  const form = $('#fg', alvo), saida = $('#saida', alvo);
  on(alvo, 'click', '[data-x]', () => { alvo.innerHTML = ''; });
  on(alvo, 'change', '[name=quantidade]', (s) => { alvo.querySelectorAll('[data-qtd]').forEach((e) => { e.textContent = s.value; }); });
  on(alvo, 'click', '[data-ang]', (b) => { const t = form.elements.briefing; t.value = (t.value ? t.value + '\n' : '') + 'Ângulo: ' + b.dataset.ang; t.focus(); });
  on(alvo, 'click', '[data-insight]', (b) => {
    const rotulo = b.dataset.insightCampo === 'framework' ? 'Framework' : 'Ângulo';
    const t = form.elements.briefing; t.value = (t.value ? t.value + '\n' : '') + `${rotulo}: ${b.dataset.insight}`; t.focus();
    if (b.dataset.insightCampo === 'framework' && form.elements.framework) form.elements.framework.value = b.dataset.insight;
  });
  on(alvo, 'change', '[data-produto]', (s) => {
    const p = produtos.find((x) => x.id === s.value); if (!p) return;
    const t = form.elements.briefing; t.value = (t.value ? t.value + '\n' : '') + 'Produto: ' + resumoProduto(p); t.focus();
  });

  on(alvo, 'click', '[data-manual]', () => {
    const v = lerForm(form);
    saida.innerHTML = `<form id="fm" class="space-y-3 border-t border-slate-200 pt-4">
      <p class="caption">Formulário manual — preencha e salve, sem IA.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="label">Nome/legenda *</label><input class="input" name="nome"></div>
        <div><label class="label">Ângulo</label><input class="input" name="angulo" placeholder="Ex.: vergonha, economia de tempo"></div>
        <div><label class="label">Framework</label><select class="input" name="framework">${opcoes(FRAMEWORKS, v.framework || 'livre')}</select></div>
        <div><label class="label">Formato</label><select class="input" name="formato">${opcoes(FORMATOS, v.formato || 'video_curto')}</select></div></div>
      <div><label class="label">Hook *</label><input class="input" name="hook"></div>
      <div><label class="label">Copy / roteiro *</label><textarea class="input" rows="6" name="copy"></textarea></div>
      <div><label class="label">CTA</label><input class="input" name="cta"></div>
      <button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar criativo</button></form>`;
  });
  on(saida, 'submit', '#fm', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    if (!v.nome || !v.hook || !v.copy) return toast('Preencha nome, hook e copy.', 'erro');
    await ocupado(f.querySelector('button'), async () => { await salvarNovo(cliente, { ...v, gatilho: '' }, {}); toast('Criativo salvo.'); recarregar(); });
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = lerForm(form);
    const ref = referencias.find((r) => r.id === v.referenciaId) || null;
    const produto = produtos.find((p) => p.id === v.produtoId) || null;
    if (!v.briefing && !v.modelo && !ref) return toast('Escreva um briefing curto, escolha um modelo, um produto ou uma referência.', 'erro');
    await ocupado(form.querySelector('.btn-ia'), async () => {
      const vars = await gerarCriativos({
        cliente, briefing: v.briefing, modelo: v.modelo, framework: v.framework, formato: v.formato, base: ref, produto, quantidade: Number(v.quantidade) || cfg.variacoesPadrao || 4,
        referencias: referencias.filter((r) => r.analise), resultados,
      });
      if (!vars.length) throw new Error('A IA não devolveu variações. Tente reescrever o briefing.');
      saida.innerHTML = `<div class="space-y-3 border-t border-slate-200 pt-4">
        ${iaNota(`A IA criou ${vars.length} variações com hooks e ângulos diferentes, usando o perfil de marca${ref ? ' e a referência escolhida' : ''}. Salve as que gostar: elas vão para a lista abaixo como rascunho. Depois, abra cada uma para refinar, completar o checklist e enviar ao cliente.`)}
        ${vars.map((x, i) => variacao(x, i, cliente)).join('')}</div>`;
      saida._vars = vars;
      saida._ctx = { referenciaId: ref?.id || null, modelo: v.modelo || null, produtoId: v.produtoId || null };
    });
  });
  on(saida, 'click', '[data-salvar-var]', async (b) => {
    const x = saida._vars[Number(b.dataset.salvarVar)];
    await ocupado(b, async () => {
      await salvarNovo(cliente, x, saida._ctx);
      await atualizar?.();
      b.outerHTML = '<span class="tag tag-ok"><i class="fa-solid fa-check mr-1"></i>Salvo</span>';
      toast('Criativo salvo. Abra-o na lista para refinar ou aprovar.');
    });
  });
  on(saida, 'click', '[data-copiar-var]', (b) => { const x = saida._vars[Number(b.dataset.copiarVar)]; copiar(`${x.hook}\n\n${x.copy}\n\n${x.cta}`); });
}

function variacao(x, i, cliente) {
  const proibidos = acharTermosProibidos(`${x.hook} ${x.copy} ${x.cta}`, cliente);
  return `<div class="rounded-lg border border-slate-200 p-3">
    <div class="flex flex-wrap items-center gap-1">${tag(x.angulo || 'ângulo', 'tag-info')}${x.gatilho ? tag('gatilho: ' + x.gatilho) : ''}${tag(x.framework)}${tag(rotulo(FORMATOS, x.formato))}
      ${proibidos.length ? tag('termos proibidos: ' + proibidos.join(', '), 'tag-bad') : ''}</div>
    <p class="mt-2 font-semibold">“${esc(x.hook)}”</p>
    <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">${esc(x.copy)}</p>
    <p class="mt-1 text-sm"><b>CTA:</b> ${esc(x.cta)}</p>
    ${x.porque ? `<p class="hint">Por quê: ${esc(x.porque)}</p>` : ''}
    <div class="mt-2 flex gap-2"><button class="btn-primary btn-sm" data-salvar-var="${i}"><i class="fa-solid fa-floppy-disk"></i> Salvar este criativo</button>
      <button class="btn-ghost btn-sm" data-copiar-var="${i}"><i class="fa-solid fa-copy"></i> Copiar texto</button></div></div>`;
}

async function salvarNovo(cliente, x, ctx) {
  const angulo = x.angulo || '', framework = x.framework || 'livre', gatilho = x.gatilho || '', formato = x.formato || 'video_curto';
  // A versão já nasce com ângulo/framework/gatilho/formato: é o que permite, mais tarde, saber com QUAL ângulo/framework
  // um resultado registrado foi gerado (ver versaoAtivaEm em resultados.js) mesmo que o criativo mude depois.
  const snap = { n: 1, hook: x.hook, copy: x.copy, cta: x.cta || '', angulo, framework, gatilho, formato, nota: 'Versão inicial', quando: new Date().toISOString() };
  return db.criar(COL.criativos, {
    clienteId: cliente.id, nome: x.nome, hook: x.hook, copy: x.copy, cta: x.cta || '', angulo, gatilho,
    framework, formato, idioma: cliente.marca?.idioma || 'pt-BR',
    status: 'rascunho', checklist: {}, versoes: [snap], referenciaId: ctx.referenciaId || null, modeloUsado: ctx.modelo || null,
    origem: ctx.referenciaId || ctx.modelo || x.porque ? 'ia' : 'manual', produtoId: ctx.produtoId || null,
    arquivoUrl: null, arquivoPath: null, arquivoNome: null, emUsoDesde: null, provaSocial: false,
  });
}


// ---------------- detalhe / refino ----------------
function detalhe(c, cliente, cfg, recarregar) {
  const conversa = [];
  const m = modal(c.nome, '<div id="d"></div>', { largo: true });
  const alvo = $('#d', m.el);

  const desenhar = () => {
    const proibidos = acharTermosProibidos(`${c.hook} ${c.copy} ${c.cta}`, cliente);
    const versoes = c.versoes || [];
    const tudoOk = CHECKLIST_QUALIDADE.every(([k]) => c.checklist?.[k]);
    alvo.innerHTML = `
    <div class="mb-3 flex flex-wrap gap-1">${tag(rotulo(STATUS_CRIATIVO, c.status), STATUS_COR[c.status])}${c.framework ? tag(c.framework, 'tag-info') : ''}
      ${c.angulo ? tag(c.angulo) : ''}${c.gatilho ? tag('gatilho: ' + c.gatilho) : ''}${tag(rotulo(FORMATOS, c.formato))}${tag(c.idioma)}
      ${c.emUsoDesde ? tag(`em uso desde ${dataBR(c.emUsoDesde)}`, 'tag-ok') : ''}${tagAprovacao(c)}</div>
    ${c.aprovacaoCliente ? `<div class="mb-3 rounded-lg border p-3 text-sm ${c.aprovacaoCliente.status === 'aprovado' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}"><b>${c.aprovacaoCliente.status === 'aprovado' ? '<i class="fa-solid fa-circle-check"></i> O cliente aprovou' : '<i class="fa-solid fa-pen"></i> O cliente pediu ajuste'}</b> em ${dataBR(c.aprovacaoCliente.em)}${c.aprovacaoCliente.comentario ? `<p class="mt-1 whitespace-pre-wrap">“${esc(c.aprovacaoCliente.comentario)}”</p>` : ''}</div>` : ''}
    ${proibidos.length ? `<div class="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700"><i class="fa-solid fa-triangle-exclamation"></i> Contém termos proibidos do cliente: <b>${esc(proibidos.join(', '))}</b>. Ajuste antes de aprovar.</div>` : ''}
    <form id="fe" class="space-y-3">
      <p class="caption">Edite direto (sem IA) e salve como nova versão, ou peça um ajuste ao chat abaixo.</p>
      <div><label class="label">Hook</label><input class="input" name="hook" value="${esc(c.hook)}"></div>
      <div><label class="label">Copy / roteiro</label><textarea class="input" rows="7" name="copy">${esc(c.copy)}</textarea></div>
      <div><label class="label">CTA</label><input class="input" name="cta" value="${esc(c.cta)}"></div>
      <div class="flex gap-2"><button class="btn-primary btn-sm" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar como nova versão</button>
        <button class="btn-ghost btn-sm" type="button" data-copiar><i class="fa-solid fa-copy"></i> Copiar texto</button></div></form>

    <div class="mt-5 rounded-lg border border-violet-200 p-3"><h4 class="mb-1 text-sm font-semibold text-violet-800"><i class="fa-solid fa-comments"></i> Refinar com IA</h4>
      <p class="hint mb-2">Ex.: “mais curto”, “tom mais debochado”, “troque o hook por uma pergunta”. Cada ajuste vira uma versão.</p>
      <div id="chat" class="mb-2 space-y-1 text-sm">${conversa.map((t) => `<p class="${t.role === 'user' ? 'text-slate-600' : 'text-violet-700'}"><b>${t.role === 'user' ? 'Você' : 'IA'}:</b> ${esc(t.content)}</p>`).join('')}</div>
      <form id="fc" class="flex gap-2"><input class="input" name="instrucao" placeholder="O que ajustar?"><button class="btn-ia btn-sm" type="submit">Ajustar com IA</button></form></div>

    <div class="mt-5"><div class="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 class="text-sm font-semibold">Checklist de qualidade <span class="font-normal text-slate-500">— necessário para aprovar</span></h4>
      <button class="btn-ghost btn-sm" data-checar-ia title="A IA (modelo econômico) sugere as respostas e os motivos. Você revisa antes de aplicar."><i class="fa-solid fa-wand-magic-sparkles"></i> Sugerir respostas com IA</button></div>
      <div data-sugestoes></div>
      <div class="grid gap-1 sm:grid-cols-2">${CHECKLIST_QUALIDADE.map(([k, q]) => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" data-chk="${k}" ${c.checklist?.[k] ? 'checked' : ''}>${q}</label>`).join('')}</div></div>

    <div class="mt-5 flex flex-wrap items-end gap-3">
      <div><label class="label">Status</label><select class="input" data-status>${opcoes(STATUS_CRIATIVO, c.status)}</select>
        <p class="hint">${tudoOk ? 'Checklist completo.' : 'Complete o checklist para aprovar.'}</p></div>
      <button class="btn-ghost" data-enviar-um title="Gera um link para o cliente final aprovar ou pedir ajuste deste criativo"><i class="fa-solid fa-paper-plane"></i> Enviar para aprovação do cliente</button></div>

    ${APROVADOS.includes(c.status) ? `<label class="mt-3 flex items-start gap-2 text-sm" title="Quando marcado, este criativo entra como depoimento (com o vídeo/imagem anexado, se houver) ao atualizar a prova social na aba Site/Loja.">
      <input type="checkbox" data-prova-social ${c.provaSocial ? 'checked' : ''} class="mt-0.5"> Usar como prova social no site (aba Site/Loja)</label>` : ''}

    <div class="mt-5 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"><h4 class="mb-1 text-sm font-semibold"><i class="fa-solid fa-clapperboard"></i> Material para a campanha</h4>
      <p class="hint mb-2">Gera a foto (PNG) e o vídeo prontos para subir no gerenciador de anúncios, a partir deste criativo.</p>
      <button class="btn-primary btn-sm" data-estudio><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar foto e vídeo</button></div>

    <details class="mt-5 rounded-lg border border-slate-200 p-3" ${c.arquivoUrl ? 'open' : ''}><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções (anexo e histórico)</summary>
    <div class="mt-3"><h4 class="mb-2 text-sm font-semibold">Peça final (arquivo)</h4>
      ${c.arquivoUrl ? `<p class="mb-2 text-sm">${tag('com arquivo', 'tag-ok')} ${esc(c.arquivoNome || '')}</p>
        <div class="flex flex-wrap gap-2"><a class="btn-ghost btn-sm" href="${esc(c.arquivoUrl)}" target="_blank" rel="noopener" download="${esc(c.arquivoNome || 'criativo')}"><i class="fa-solid fa-download"></i> Baixar</a>
        <button class="btn-ghost btn-sm" data-link><i class="fa-solid fa-link"></i> Copiar link compartilhável</button>
        <button class="btn-danger btn-sm" data-rm-arq><i class="fa-solid fa-trash"></i> Remover</button></div>`
        : `<p class="caption mb-2">${tag('sem arquivo', 'tag-warn')} Envie o vídeo ou imagem finalizado.</p>`}
      <div class="mt-2">${campoArquivo({ attrs: 'data-arq', accept: 'image/*,video/*,application/pdf', texto: c.arquivoUrl ? 'Substituir peça final (vídeo, imagem ou PDF)' : 'Enviar peça final (vídeo, imagem ou PDF)', destaque: !c.arquivoUrl, removivel: false })}</div></div>

    <div class="mt-5"><h4 class="mb-2 text-sm font-semibold">Histórico de versões (${versoes.length})</h4>
      <ol class="space-y-2">${[...versoes].reverse().map((v) => `<li class="rounded-lg bg-slate-50 p-2 text-sm"><div class="flex justify-between"><b>v${v.n} · ${esc(v.nota || '')}</b><span class="hint">${dataBR(v.quando)}</span></div>
        <p class="line-clamp-2 text-slate-600">“${esc(v.hook)}”</p>
        ${v.n !== versoes.length ? `<button class="btn-ghost btn-sm mt-1" data-restaurar="${v.n}">Restaurar esta versão</button>` : '<span class="tag tag-ok mt-1">atual</span>'}</li>`).join('')}</ol></div>
    <div class="mt-5 flex justify-end"><button class="btn-danger btn-sm" data-apagar><i class="fa-solid fa-trash"></i> Apagar criativo</button></div>
    </details>`;
  };
  desenhar();

  const novaVersao = async (patch, nota) => {
    const versoes = [...(c.versoes || [])];
    // Sempre grava o ângulo/framework/gatilho/formato vigentes nesta versão (do patch, senão o que já estava no
    // criativo) — sem isso, um resultado registrado depois de uma edição seria atribuído ao ângulo/framework ERRADO.
    const angulo = patch.angulo ?? c.angulo, framework = patch.framework ?? c.framework, gatilho = patch.gatilho ?? c.gatilho, formato = patch.formato ?? c.formato;
    versoes.push({ n: versoes.length + 1, hook: patch.hook, copy: patch.copy, cta: patch.cta, angulo, framework, gatilho, formato, nota, quando: new Date().toISOString() });
    const dados = { ...patch, versoes };
    await db.atualizar(COL.criativos, c.id, dados);
    Object.assign(c, dados);
  };

  on(alvo, 'submit', '#fe', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    await ocupado(f.querySelector('button'), async () => { await novaVersao({ hook: v.hook, copy: v.copy, cta: v.cta }, 'Edição manual'); toast('Nova versão salva.'); desenhar(); recarregar(); });
  });
  on(alvo, 'click', '[data-copiar]', () => copiar(`${c.hook}\n\n${c.copy}\n\n${c.cta}`));
  on(alvo, 'click', '[data-estudio]', () => abrirEstudio(c, cliente));
  on(alvo, 'submit', '#fc', async (f, ev) => {
    ev.preventDefault();
    const instrucao = lerForm(f).instrucao;
    if (!instrucao) return;
    await ocupado(f.querySelector('button'), async () => {
      const r = await refinarCriativo({ cliente, criativo: c, instrucao, conversa: conversa.map((t) => ({ role: t.role, content: t.content })) });
      conversa.push({ role: 'user', content: instrucao }, { role: 'assistant', content: r.explicacao || 'Ajuste aplicado.' });
      await novaVersao({ hook: r.hook || c.hook, copy: r.copy || c.copy, cta: r.cta || c.cta, ...(r.angulo ? { angulo: r.angulo } : {}), ...(r.gatilho ? { gatilho: r.gatilho } : {}) }, `IA: ${instrucao}`);
      desenhar(); recarregar();
      toast('A IA criou uma nova versão — veja o histórico abaixo.');
    });
  });
  on(alvo, 'click', '[data-restaurar]', async (b) => {
    const v = c.versoes.find((x) => x.n === Number(b.dataset.restaurar));
    await novaVersao({ hook: v.hook, copy: v.copy, cta: v.cta }, `Restaurada a v${v.n}`); desenhar(); recarregar();
  });
  on(alvo, 'change', '[data-chk]', async (i) => {
    const checklist = { ...(c.checklist || {}), [i.dataset.chk]: i.checked };
    await db.atualizar(COL.criativos, c.id, { checklist }); c.checklist = checklist; desenhar();
  });
  const enviarEste = () => abrirEnvio(cliente, [c], { preSelecionar: [c.id], aoMudar: () => { desenhar(); recarregar(); } });
  on(alvo, 'click', '[data-enviar-um]', enviarEste);
  on(alvo, 'change', '[data-prova-social]', async (i) => {
    await db.atualizar(COL.criativos, c.id, { provaSocial: i.checked }); c.provaSocial = i.checked;
    toast(i.checked ? 'Marcado. Atualize a prova social na aba Site/Loja para refletir no site.' : 'Desmarcado.');
  });

  // Checklist por IA (Haiku): só sugere; a pessoa revisa e clica em aplicar.
  let sugestao = null;
  on(alvo, 'click', '[data-checar-ia]', async (b) => {
    await ocupado(b, async () => {
      sugestao = await checarQualidade({ cliente, criativo: c, perguntas: CHECKLIST_QUALIDADE });
      $('[data-sugestoes]', alvo).innerHTML = `<div class="mb-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
        <p class="mb-1"><i class="fa-solid fa-wand-magic-sparkles"></i> Sugestão da IA (modelo econômico) — revise antes de aplicar:</p>
        <ul class="space-y-0.5">${CHECKLIST_QUALIDADE.map(([k, q]) => `<li>${sugestao[k]?.ok ? '✅' : '❌'} ${esc(q)} <span class="text-violet-600">— ${esc(sugestao[k]?.motivo || '')}</span></li>`).join('')}</ul>
        <button class="btn-ia btn-sm mt-2" data-aplicar-sug>Aplicar estas respostas ao checklist</button></div>`;
    });
  });
  on(alvo, 'click', '[data-aplicar-sug]', async () => {
    const checklist = Object.fromEntries(CHECKLIST_QUALIDADE.map(([k]) => [k, !!sugestao?.[k]?.ok]));
    await db.atualizar(COL.criativos, c.id, { checklist }); c.checklist = checklist; toast('Checklist atualizado com a sugestão da IA.'); desenhar();
  });

  on(alvo, 'change', '[data-status]', async (s) => {
    if (s.value === 'pronto_aprovacao') { desenhar(); return enviarEste(); } // "aguardando cliente" só existe com um link gerado
    if (s.value === 'aprovado' || s.value === 'em_uso') {
      if (!CHECKLIST_QUALIDADE.every(([k]) => c.checklist?.[k])) { toast('Complete o checklist de qualidade antes de aprovar/usar.', 'erro'); return desenhar(); }
      if (acharTermosProibidos(`${c.hook} ${c.copy} ${c.cta}`, cliente).length) { toast('Remova os termos proibidos antes de aprovar.', 'erro'); return desenhar(); }
    }
    await definirStatus(c, s.value); toast('Status atualizado.'); desenhar(); recarregar();
  });
  on(alvo, 'change', '[data-arq]', async (inp) => {
    const f = inp.files[0]; if (!f) return;
    await ocupado(inp, async () => {
      const caminho = `gcc/${cliente.id}/criativos/${c.id}/${Date.now()}_${f.name.replace(/[^\w.-]/g, '_')}`;
      const r = await enviarArquivoOuAvisar(caminho, f);
      if (c.arquivoPath) await removerArquivo(c.arquivoPath);
      const patch = { arquivoUrl: r.url, arquivoPath: r.path, arquivoNome: f.name };
      await db.atualizar(COL.criativos, c.id, patch); Object.assign(c, patch);
      toast('Arquivo enviado.'); desenhar(); recarregar();
    });
  });
  on(alvo, 'click', '[data-link]', () => copiar(c.arquivoUrl));
  on(alvo, 'click', '[data-rm-arq]', async () => {
    if (!(await confirmar('Remover o arquivo deste criativo?', 'Remover'))) return;
    await removerArquivo(c.arquivoPath);
    const patch = { arquivoUrl: null, arquivoPath: null, arquivoNome: null };
    await db.atualizar(COL.criativos, c.id, patch); Object.assign(c, patch); desenhar(); recarregar();
  });
  on(alvo, 'click', '[data-apagar]', async () => {
    if (!(await confirmar('Apagar este criativo? Também apaga o arquivo anexado, os resultados registrados para ele e as respostas de aprovação recebidas. Esta ação não pode ser desfeita.', 'Apagar'))) return;
    await apagarCriativoEmCascata(c.id, c.arquivoPath); m.fechar(); recarregar(); toast('Criativo e os dados ligados a ele foram apagados.');
  });
}
