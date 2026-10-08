// Aba Criativos. Abre no fluxo guiado "Criar criativos" (modules/fluxo-criativos.js, 4 passos); a lista completa fica em
// "Todos os criativos" (#/c/<id>/criativos/todos): gerar (IA ou manual), refinar por chat com histórico de versões,
// aprovar, anexar arquivo final, arquivar/excluir.
import { db, COL, removerArquivo } from '../core/storage.js';
import { gerarCriativos, refinarCriativo, checarQualidade, acharTermosDoCliente } from '../core/ia.js';
import { obterConfig } from './configuracoes.js';
import { abrirEnvio, sincronizarAprovacoes, tagAprovacao, statusAposTrocarArquivo, legendaReaprovacao } from './aprovacao.js';
import { perguntarBuscaMercado } from './busca-mercado.js';
import { abrirEstudio } from './estudio.js';
import { abrirEspecialistas } from './especialistas.js';
import { abrirBiblioteca } from './modelos-prompt.js';
import { montarQuestionarioNaAba } from './perguntas-site.js';
import { apagarCriativoEmCascata } from '../lib/cascata.js';
import { enviarArquivoOuAvisar } from '../lib/uploads.js';
import { previaEmSegundoPlano, removerPrevia, previaAtual, tipoDaPeca } from '../lib/previa.js';
import { padroesDoNicho, sugestaoNaoTestada } from './insights.js';
import { NARRATIVAS, ETAPAS_FUNIL, rotuloNarrativa, linhaNarrativa } from '../lib/narrativas.js';
import { abrirMateriais } from './materiais-cliente.js';
import { AVISO_META_SAUDE, ehProdutoSaude, achadosSaude, motivoSaude } from '../lib/saude.js';
import { GANCHOS, GRUPOS_GANCHO, nomeGrupo, ganchoPorNumero, rotuloModelo, descricaoModelo, motivoGancho } from '../lib/ganchos.js';
import { acaoAoExcluir, planoCriativos, criativosVisiveis, semVersao, resultadosDoCriativo } from '../lib/exclusao.js';
import { produtoDoCriativo, contextoProdutoAtual } from '../lib/conexoes.js';
import { briefsAbertos, briefsHtml, textoDoBrief } from './tarefas-site.js';
import { viewFluxo } from './fluxo-criativos.js';
import { subRotaCriativos, rotaCriativos } from '../lib/etapas-criativos.js';
import { versaoNova } from '../lib/aplicar-especialista.js';
import {
  FRAMEWORKS, MODELOS_CRIATIVO, FORMATOS, STATUS_CRIATIVO, STATUS_COR, CHECKLIST_QUALIDADE,
} from '../lib/constantes.js';
import {
  esc, $, on, montar, cabecalho, iaNota, vazio, tag, dataBR, diasDesde, toast, modal, ocupado, lerForm, opcoes, copiar, confirmar, campoArquivo, mostrarResultado } from '../core/ui.js';

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
  const sub = typeof location !== 'undefined' ? subRotaCriativos(location.hash) : null;
  // Vindo da busca global ou de "Usar como base" (Referências): o pedido é para a lista, que abre o criativo/painel.
  let paraLista = false;
  try { paraLista = Boolean(sessionStorage.getItem('gcc_abrir_criativo') || sessionStorage.getItem('gcc_ref')); } catch { /* sem storage */ }
  if (sub !== 'todos' && !(sub === null && paraLista)) return viewFluxo(root, cliente, recarregar, sub);
  return viewTodos(root, cliente, recarregar);
});

/** "Todos os criativos": a lista de sempre, com arquivar/excluir, seleção múltipla e o painel "Novo criativo". */
async function viewTodos(root, cliente, recarregar) {
  const [criativos, referencias, resultados, produtos, cfg, materiais] = await Promise.all([
    db.listar(COL.criativos, { clienteId: cliente.id }), db.listar(COL.referencias, { clienteId: cliente.id }),
    db.listar(COL.resultados, { clienteId: cliente.id }), db.listar(COL.produtos, { clienteId: cliente.id }), obterConfig(),
    db.listar(COL.materiais, { clienteId: cliente.id }).catch(() => []),
  ]);
  const fonte = { produtos, materiais, cliente, resultados }; // produto, fotos e oferta lidos daqui (lib/conexoes.js)
  // Sugestão proativa (Insights): um ângulo/framework comprovado em clientes de nicho semelhante que este
  // cliente ainda não testou em nenhum criativo. Falha aqui não impede o resto da tela (é só uma sugestão).
  let sugestaoInsight = null;
  try {
    const nicho = await padroesDoNicho(cliente);
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
  let verArquivados = false; // "Mostrar arquivados": criativos com resultados que saíram da lista (continuam nos Insights)
  const selecionados = new Set();
  const qtdArquivados = () => criativos.filter((c) => c.arquivado).length;
  const barraSelecao = () => (selecionados.size ? `<div class="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm" data-barra-criativos>
      <span>${selecionados.size} criativo(s) selecionado(s)</span>
      ${verArquivados ? '<button type="button" class="btn-ghost btn-sm" data-desarquivar-sel><i class="fa-solid fa-box-open"></i> Desarquivar</button><button type="button" class="btn-danger btn-sm" data-excluir-def-sel><i class="fa-solid fa-trash"></i> Excluir definitivamente</button>'
        : '<button type="button" class="btn-danger btn-sm" data-excluir-sel><i class="fa-solid fa-trash"></i> Excluir ou arquivar</button>'}
      <button type="button" class="btn-ghost btn-sm" data-limpar-sel>Limpar seleção</button></div>` : '');
  const lista = () => {
    const itens = criativosVisiveis(criativos, { arquivados: verArquivados }).filter((c) => !filtro || c.status === filtro);
    if (verArquivados) return `${barraSelecao()}<p class="mb-2 rounded bg-slate-100 p-2 text-sm" data-aviso-arquivados><i class="fa-solid fa-box-archive"></i> Arquivados: criativos com resultados registrados. Não aparecem na lista nem na montagem de campanha, e continuam contando nos Insights. Excluir daqui apaga também os resultados deles.</p>
      ${itens.length ? `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${itens.map((c) => cartao(c, cfg, selecionados)).join('')}</div>` : '<p class="hint">Nenhum criativo arquivado.</p>'}`;
    return itens.length ? `${barraSelecao()}<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${itens.map((c) => cartao(c, cfg, selecionados)).join('')}</div>`
      : vazio('wand-magic-sparkles', 'Nenhum criativo aqui ainda', 'Comece gerando ideias a partir de um briefing curto.',
        '<button class="btn-primary" data-novo><i class="fa-solid fa-plus"></i> Criar primeiro criativo</button>');
  };

  root.innerHTML = `${cabecalho('Todos os criativos', 'Caminho de cada anúncio: 1. gerar ou escrever → 2. abrir, revisar e completar o checklist → 3. enviar ao cliente aprovar → 4. "Gerar foto e vídeo" → 5. vincular na aba Campanhas. Cada ajuste vira uma versão.',
    `<a class="btn-ghost" href="${rotaCriativos(cliente.id, 1)}" data-voltar-fluxo><i class="fa-solid fa-route"></i> Criar criativos (passo a passo)</a>
     <select class="input !w-auto" data-filtro title="Filtrar por status"><option value="">Todos os status</option>${opcoes(STATUS_CRIATIVO, '')}</select>
     <label class="flex items-center gap-1 text-sm" title="Criativos com resultados que foram arquivados"><input type="checkbox" data-ver-arquivados> Mostrar arquivados <span data-qtd-arquivados>(${criativos.filter((c) => c.arquivado).length})</span></label>
     <button class="btn-ghost" data-modelos-prompt title="Modelos prontos de prompt para editar ou gerar fotos de produto, preenchidos com os dados deste cliente"><i class="fa-solid fa-swatchbook"></i> Modelos de prompt</button>
     <button class="btn-ghost" data-materiais-cliente-btn title="Fotos, vídeos, logo e provas do cliente: enviar, ver e apagar (vão para o Estúdio e para o site)"><i class="fa-solid fa-photo-film"></i> Materiais do cliente${cliente.logoArquivo ? '' : ' <span class="tag tag-warn">sem logo</span>'}</button>
     <button class="btn-ghost" data-enviar title="Gera um link para o cliente final ver as peças e aprovar ou pedir ajuste, sem login"><i class="fa-solid fa-paper-plane"></i> Enviar para aprovação</button>
     <button class="btn-primary" data-novo title="Gerar ou escrever um criativo novo"><i class="fa-solid fa-plus"></i> Novo criativo</button>`)}
    <div class="mb-4" data-questionario></div><div data-briefs></div><div id="painel"></div><div id="lista">${lista()}</div>`;
  // Questionário único do cliente (o mesmo da aba Site/Loja): as respostas também alimentam os criativos.
  // Vindo de "Abrir o campo" (falta de dado do especialista): abre o questionário na pergunta pedida.
  const focarPergunta = () => {
    let id = null; try { id = sessionStorage.getItem('gcc_focar_pergunta'); sessionStorage.removeItem('gcc_focar_pergunta'); } catch { /* sem storage */ }
    if (!id) return;
    const card = $('[data-perguntas-site]', root); if (!card) return;
    card.open = true;
    const p = $(`[data-pergunta="${id}"]`, card) || card;
    p.scrollIntoView({ block: 'center' }); p.classList.add('ring-2', 'ring-amber-400'); setTimeout(() => p.classList.remove('ring-2', 'ring-amber-400'), 3000);
    p.querySelector?.('textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]), select')?.focus({ preventScroll: true });
  };
  montarQuestionarioNaAba($('[data-questionario]', root), cliente, recarregar).then(focarPergunta).catch((e) => console.warn('[questionário]', e));
  const aoFocar = () => { if (!root.isConnected) { document.removeEventListener('gcc:focar-campo', aoFocar); return; } focarPergunta(); };
  document.addEventListener('gcc:focar-campo', aoFocar);

  const atualizar = async () => {
    criativos.splice(0, criativos.length, ...(await db.listar(COL.criativos, { clienteId: cliente.id })));
    $('#lista', root).innerHTML = lista();
  };
  on(root, 'change', '[data-filtro]', (s) => { filtro = s.value; $('#lista', root).innerHTML = lista(); });
  const redesenharLista = () => { $('#lista', root).innerHTML = lista(); const q = $('[data-qtd-arquivados]', root); if (q) q.textContent = `(${qtdArquivados()})`; };
  on(root, 'change', '[data-ver-arquivados]', (c) => { verArquivados = c.checked; selecionados.clear(); redesenharLista(); });
  on(root, 'change', '[data-sel-criativo]', (c) => { if (c.checked) selecionados.add(c.dataset.selCriativo); else selecionados.delete(c.dataset.selCriativo); redesenharLista(); });
  on(root, 'click', '[data-limpar-sel]', () => { selecionados.clear(); redesenharLista(); });
  const escolhidos = () => criativos.filter((c) => selecionados.has(c.id));
  // Uma confirmação só, dizendo o que acontece com cada grupo (lib/exclusao.js planoCriativos).
  const executarPlano = async (plano) => {
    for (const c of [...plano.excluir, ...plano.excluirDefinitivo]) await apagarCriativoEmCascata(c.id, c.arquivoPath, c.previaPath, { manterArquivos: Boolean(c.aprovacaoToken), clienteId: cliente.id });
    for (const c of plano.arquivar) await db.atualizar(COL.criativos, c.id, { arquivado: true, arquivadoEm: new Date().toISOString() });
  };
  on(root, 'click', '[data-excluir-sel]', (b) => ocupado(b, async () => {
    const plano = planoCriativos(escolhidos(), resultados);
    if (!(await confirmar(plano.texto, 'Confirmar'))) return;
    await executarPlano(plano); selecionados.clear(); await atualizar(); redesenharLista();
    toast(`Pronto: ${plano.excluir.length} excluído(s), ${plano.arquivar.length} arquivado(s).`);
  }));
  on(root, 'click', '[data-excluir-def-sel]', (b) => ocupado(b, async () => {
    const plano = planoCriativos(escolhidos(), resultados, { definitivo: true });
    if (!(await confirmar(plano.texto, 'Excluir definitivamente'))) return;
    await executarPlano(plano); selecionados.clear(); await atualizar(); redesenharLista();
    toast(`${plano.excluirDefinitivo.length} criativo(s) excluído(s) de vez.`);
  }));
  on(root, 'click', '[data-desarquivar-sel]', (b) => ocupado(b, async () => {
    for (const c of escolhidos()) await db.atualizar(COL.criativos, c.id, { arquivado: false, arquivadoEm: null });
    const n = selecionados.size; selecionados.clear(); await atualizar(); redesenharLista(); toast(`${n} criativo(s) de volta à lista.`);
  }));
  on(root, 'click', '[data-modelos-prompt]', (b) => ocupado(b, () => abrirBiblioteca({ cliente })));
  on(root, 'click', '[data-materiais-cliente-btn]', (b) => ocupado(b, () => abrirMateriais(cliente)));
  // Briefs aceitos em "Analisar e recomendar" (aba Campanhas): o criativo só é gerado quando o operador clica.
  let briefs = [];
  briefsAbertos(cliente.id).then((l) => { if (!root.isConnected) return; briefs = l; $('[data-briefs]', root).innerHTML = briefsHtml(l); }).catch((e) => console.warn('[briefs]', e));
  on(root, 'click', '[data-usar-brief]', (b) => {
    const br = briefs.find((x) => x.id === b.dataset.usarBrief); if (!br) return;
    painelNovo($('#painel', root), cliente, referencias, resultados, recarregar, null, atualizar, cfg, produtos, sugestaoInsight);
    const f = $('#fg', root); if (!f) return;
    f.elements.briefing.value = textoDoBrief(br);
    if (br.brief?.produtoId && f.elements.produtoId) f.elements.produtoId.value = br.brief.produtoId;
    if (br.brief?.formato && f.elements.formato) f.elements.formato.value = br.brief.formato;
    if (br.brief?.narrativa && f.elements.narrativa) f.elements.narrativa.value = br.brief.narrativa;
    if (br.brief?.quantidade && f.elements.quantidade) f.elements.quantidade.value = String(br.brief.quantidade);
    $('#painel', root).scrollIntoView({ block: 'start' });
    toast('Brief colocado no formulário. Confira e clique em gerar.');
  });
  on(root, 'click', '[data-brief-feito]', async (b) => { await db.atualizar(COL.tarefas, b.dataset.briefFeito, { status: 'feita', feitaEm: new Date().toISOString() }); b.closest('[data-brief]')?.remove(); toast('Brief marcado como feito.'); });
  on(root, 'click', '[data-novo]', () => painelNovo($('#painel', root), cliente, referencias, resultados, recarregar, null, atualizar, cfg, produtos, sugestaoInsight));
  on(root, 'click', '[data-enviar]', () => abrirEnvio(cliente, criativos, { preSelecionar: criativos.filter((c) => ['rascunho', 'reaprovacao'].includes(c.status)).map((c) => c.id), aoMudar: recarregar }));

  // Vindo da aba Referências: abre já com a referência escolhida como ponto de partida.
  let preRef = null;
  try { preRef = sessionStorage.getItem('gcc_ref'); sessionStorage.removeItem('gcc_ref'); } catch { /* sem storage */ }
  const base = preRef && referencias.find((r) => r.id === preRef);
  if (base) painelNovo($('#painel', root), cliente, referencias, resultados, recarregar, base, atualizar, cfg, produtos, sugestaoInsight);
  on(root, 'click', '[data-abrir]', (b) => detalhe(criativos.find((c) => c.id === b.dataset.abrir), cliente, cfg, recarregar, fonte));

  // Vindo da busca global: abre direto o criativo encontrado.
  let abrirId = null;
  try { abrirId = sessionStorage.getItem('gcc_abrir_criativo'); sessionStorage.removeItem('gcc_abrir_criativo'); } catch { /* sem storage */ }
  const alvoBusca = abrirId && criativos.find((c) => c.id === abrirId);
  if (alvoBusca) detalhe(alvoBusca, cliente, cfg, recarregar, fonte);
}

function cartao(c, cfg, selecionados = new Set()) {
  const dias = c.status === 'em_uso' ? diasDesde(c.emUsoDesde) : null;
  const fadiga = dias != null && dias >= cfg.diasFadiga;
  return `<div class="card relative !p-0 transition hover:border-indigo-400 hover:shadow-md ${selecionados.has(c.id) ? 'ring-2 ring-rose-300' : ''}" data-cartao-criativo="${c.id}">
    <label class="absolute right-2 top-2 z-[1] rounded bg-white/90 px-1" title="Selecionar para excluir ou arquivar vários de uma vez"><input type="checkbox" data-sel-criativo="${c.id}" ${selecionados.has(c.id) ? 'checked' : ''} aria-label="Selecionar ${esc(c.nome)}"></label>
    <button data-abrir="${c.id}" class="block w-full p-4 pr-9 text-left">
    <div class="flex items-start justify-between gap-2"><h3 class="font-semibold leading-tight">${esc(c.nome)}</h3>${tag(rotulo(STATUS_CRIATIVO, c.status), STATUS_COR[c.status])}</div>${c.arquivado ? tag('arquivado') : ''}
    <p class="caption mt-1 line-clamp-2">“${esc(c.hook)}”</p>
    <div class="mt-3 flex flex-wrap gap-1">
      ${tagAprovacao(c)}${c.framework ? tag(c.framework, 'tag-info') : ''}${c.angulo ? tag(c.angulo) : ''}${tagNarrativa(c)}${tag(rotulo(FORMATOS, c.formato))}${tag(c.idioma || 'pt-BR')}
      ${c.arquivoUrl ? tag('com arquivo', 'tag-ok') : tag('sem arquivo', 'tag-warn')}
      ${(c.versoes?.length || 1) > 1 ? tag(`v${c.versoes.length}`) : ''}${c.referenciaId ? tag('de referência', 'tag-info') : ''}
      ${fadiga ? tag(`fadiga: ${dias}d no ar`, 'tag-bad') : ''}</div>
    <p class="hint mt-2">${dataBR(c.criadoEm)}</p></button></div>`;
}

// ---------------- painel de novo criativo ----------------
/** Descrição curta do produto para prefixar o briefing (editável depois) — nome, categoria, preço e descrição. */
export function resumoProduto(p) {
  return [p.nome, p.categoria && `(${p.categoria})`, p.preco && `R$ ${p.preco}`, p.descricao].filter(Boolean).join(' — ');
}

function painelNovo(alvo, cliente, referencias, resultados, recarregar, base = null, atualizar = null, cfg = {}, produtos = [], sugestaoInsight = null) {
  alvo.innerHTML = `<div class="card mb-5 space-y-4">
    <div class="flex items-center justify-between"><h3 class="font-semibold">Novo criativo</h3><button class="text-slate-400" data-x aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div>
    <form id="fg" class="space-y-3" data-aviso-sair>
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
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções (modelo, framework, formato, narrativa, gancho, variações, referência)</summary>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label class="label">Modelo pronto</label><select class="input" name="modelo">${opcoes(MODELOS_CRIATIVO, '')}</select></div>
          <div><label class="label">Framework de copy</label><select class="input" name="framework">${opcoes(FRAMEWORKS, 'livre')}</select><p class="hint">A estrutura do texto (ex.: problema → solução). Na dúvida, deixe "livre".</p></div>
          <div><label class="label">Formato</label><select class="input" name="formato">${opcoes(FORMATOS, 'video_curto')}</select></div>
          <div><label class="label">Narrativa (opcional)</label><select class="input" name="narrativa"><option value="">A IA escolhe</option>${Object.entries(ETAPAS_FUNIL).map(([e, nome]) => `<optgroup label="${nome} do funil">${NARRATIVAS.filter((n) => n.etapa === e).map((n) => `<option value="${n.id}">${esc(n.nome)}</option>`).join('')}</optgroup>`).join('')}</select>
            <p class="hint" data-aviso-narrativa>Referência da Metodologia Vortex. Na dúvida, deixe "A IA escolhe".</p></div>
          <div><label class="label" for="modelo-gancho">Modelo de gancho (opcional)</label><select class="input" id="modelo-gancho" name="modeloGancho"><option value="">A IA escolhe</option>${opcoesGancho()}</select>
            <p class="hint" data-aviso-gancho>${AVISO_GANCHO}</p></div>
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
  on(alvo, 'change', '[name=narrativa]', (s) => {
    const { motivo } = linhaNarrativa(s.value, cliente);
    $('[data-aviso-narrativa]', alvo).textContent = motivo === 'saude'
      ? `${AVISO_META_SAUDE}. A IA usa um ângulo permitido (experiência, rotina, como é usar, número de clientes) e explica a troca.`
      : motivo === 'prova' ? 'Este cliente não tem prova social real no perfil: a IA vai escolher outra abordagem, sem inventar resultado.'
        : 'Referência da Metodologia Vortex. Na dúvida, deixe "A IA escolhe".';
  });
  on(alvo, 'change', '[name=modeloGancho]', (s) => {
    const g = ganchoPorNumero(s.value);
    $('[data-aviso-gancho]', alvo).textContent = g?.cuidado && ehProdutoSaude(cliente)
      ? `Modelo com (*): ${AVISO_META_SAUDE}. A IA adapta sem resultado no corpo nem promessa de efeito (só experiência de uso, rotina, composição real); se sobrar resultado no corpo, o criativo fica bloqueado para aprovação.`
      : g ? `A variação 1 parte deste modelo, adaptado ao produto; as outras usam modelos diferentes.` : AVISO_GANCHO;
  });
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
    saida.innerHTML = `<form id="fm" class="space-y-3 border-t border-slate-200 pt-4" data-aviso-sair>
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
    await ocupado(f.querySelector('button'), async () => { await salvarNovo(cliente, { ...v, gatilho: '' }, {}); toast('Criativo salvo.'); recarregar(); perguntarBuscaMercado(cliente); });
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = lerForm(form);
    const ref = referencias.find((r) => r.id === v.referenciaId) || null;
    const produto = produtos.find((p) => p.id === v.produtoId) || null;
    if (!v.briefing && !v.modelo && !ref) return toast('Escreva um briefing curto, escolha um modelo, um produto ou uma referência.', 'erro');
    await ocupado(form.querySelector('.btn-ia'), async () => {
      const vars = await gerarCriativos({
        cliente, briefing: v.briefing, modelo: v.modelo, framework: v.framework, formato: v.formato, base: ref, produto, quantidade: Number(v.quantidade) || cfg.variacoesPadrao || 4, narrativa: v.narrativa || '', modeloGancho: Number(v.modeloGancho) || null,
        referencias: referencias.filter((r) => r.analise), resultados, catalogo: produtos, // produtos reais (alguns lidos do site do cliente)
      });
      if (!vars.length) throw new Error('A IA não devolveu variações. Tente reescrever o briefing.');
      saida.innerHTML = `<div class="space-y-3 border-t border-slate-200 pt-4">
        ${iaNota(`A IA criou ${vars.length} variações com hooks e ângulos diferentes, usando o perfil de marca${ref ? ' e a referência escolhida' : ''}. Salve as que gostar: elas vão para a lista abaixo como rascunho. Depois, abra cada uma para refinar, completar o checklist e enviar ao cliente.`)}
        ${vars.map((x, i) => variacao(x, i, cliente)).join('')}</div>`;
      saida._vars = vars;
      mostrarResultado(saida, `Pronto: ${vars.length} variação(ões) abaixo. Salve as que gostar.`);
      saida._ctx = { referenciaId: ref?.id || null, modelo: v.modelo || null, produtoId: v.produtoId || null };
      perguntarBuscaMercado(cliente); // 1º criativo gerado na sessão: oferece buscar novos exemplos de mercado (uma vez)
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
  on(saida, 'click', '[data-descartar-var]', async (b) => {
    if (!(await confirmar('Excluir esta variação gerada? Ela ainda não foi salva: some daqui e não volta.', 'Excluir'))) return;
    b.closest('.rounded-lg')?.remove(); toast('Variação excluída.');
  });
}

function variacao(x, i, cliente) {
  const texto = `${x.hook} ${x.copy} ${x.cta}`, proibidos = acharTermosDoCliente(texto, cliente);
  const saude = motivoSaude(texto, cliente) ? achadosSaude(texto) : [];
  return `<div class="rounded-lg border border-slate-200 p-3">
    <div class="flex flex-wrap items-center gap-1">${tag(x.angulo || 'ângulo', 'tag-info')}${tagNarrativa(x)}${x.gatilho ? tag('gatilho: ' + x.gatilho) : ''}${tag(x.framework)}${tag(rotulo(FORMATOS, x.formato))}
      ${proibidos.length ? tag('termos proibidos: ' + proibidos.join(', '), 'tag-bad') : ''}${saude.length ? `<span class="tag tag-bad" data-tag-saude title="${esc(motivoSaude(texto, cliente))}">saúde (Meta): ${esc(saude.join(', '))}</span>` : ''}${(x.avisosGancho || []).map((a) => tag(a, 'tag-bad')).join('')}</div>
    <p class="mt-2 font-semibold">“${esc(x.hook)}”</p>
    ${origemGancho(x)}
    <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">${esc(x.copy)}</p>
    <p class="mt-1 text-sm"><b>CTA:</b> ${esc(x.cta)}</p>
    ${x.porque ? `<p class="hint">Por quê: ${esc(x.porque)}</p>` : ''}
    <div class="mt-2 flex flex-wrap gap-2"><button class="btn-primary btn-sm" data-salvar-var="${i}"><i class="fa-solid fa-floppy-disk"></i> Salvar este criativo</button>
      <button class="btn-ghost btn-sm" data-copiar-var="${i}"><i class="fa-solid fa-copy"></i> Copiar texto</button>
      <button class="btn-ghost btn-sm text-rose-600" data-descartar-var="${i}"><i class="fa-solid fa-trash"></i> Excluir esta variação</button></div></div>`;
}

/** Etiqueta pequena com a narrativa e a etapa do funil — só quando o criativo segue uma das narrativas. */
const tagNarrativa = (c) => (c.narrativa && rotuloNarrativa(c.narrativa) ? tag(rotuloNarrativa(c.narrativa)) : '');
const AVISO_GANCHO = 'Biblioteca de 100 ganchos (Configurações > Documentos de referência). Na dúvida, deixe "A IA escolhe": ela usa quando couber, adaptado ao produto.';
/** Opções do select, por grupo; (*) = modelo de transformação, com cuidado em produto de saúde. */
const opcoesGancho = () => GRUPOS_GANCHO.map((g) => `<optgroup label="${esc(nomeGrupo(g))}">${GANCHOS.filter((x) => x.grupo === g).sort((a, b) => a.n - b.n).map((x) => `<option value="${x.n}">${x.n}. ${esc(x.texto)}${x.cuidado ? ' (*)' : ''}</option>`).join('')}</optgroup>`).join('');
/** De qual modelo da biblioteca o hook veio (só quando veio de um). */
const origemGancho = (c) => (c.modeloGancho && ganchoPorNumero(c.modeloGancho) ? `<p class="hint !mt-0.5" data-origem-gancho><i class="fa-solid fa-anchor mr-1" aria-hidden="true"></i>Gancho a partir do ${esc(descricaoModelo(c.modeloGancho))}</p>` : '');

export async function salvarNovo(cliente, x, ctx = {}) {
  const angulo = x.angulo || '', framework = x.framework || 'livre', gatilho = x.gatilho || '', formato = x.formato || 'video_curto';
  // A versão já nasce com ângulo/framework/gatilho/formato: é o que permite, mais tarde, saber com QUAL ângulo/framework
  // um resultado registrado foi gerado (ver versaoAtivaEm em resultados.js) mesmo que o criativo mude depois.
  const snap = { n: 1, hook: x.hook, copy: x.copy, cta: x.cta || '', angulo, framework, gatilho, formato, nota: 'Versão inicial', quando: new Date().toISOString() };
  return db.criar(COL.criativos, {
    clienteId: cliente.id, nome: x.nome, hook: x.hook, copy: x.copy, cta: x.cta || '', angulo, gatilho,
    framework, formato, idioma: cliente.marca?.idioma || 'pt-BR', ...(x.narrativa ? { narrativa: x.narrativa } : {}), ...(x.modeloGancho ? { modeloGancho: x.modeloGancho } : {}),
    status: 'rascunho', checklist: {}, versoes: [snap], referenciaId: ctx.referenciaId || null, modeloUsado: ctx.modelo || null,
    origem: ctx.referenciaId || ctx.modelo || x.porque ? 'ia' : 'manual', produtoId: ctx.produtoId || null,
    arquivoUrl: null, arquivoPath: null, arquivoNome: null, emUsoDesde: null, provaSocial: false,
  });
}


// ---------------- detalhe / refino ----------------
/** Abre o detalhe de um criativo (texto, checklist, versões, peça final) fora da lista (ex.: passo 3 do fluxo). */
export const abrirCriativo = (c, cliente, cfg, recarregar, fonte) => detalhe(c, cliente, cfg, recarregar, fonte);
function detalhe(c, cliente, cfg, recarregar, fonte = { produtos: [], materiais: [], cliente, resultados: [] }) {
  const conversa = [];
  const dadosProduto = () => produtoDoCriativo(c, fonte); // lido agora: preço, fotos e oferta da fonte
  const m = modal(c.nome, '<div id="d"></div>', { largo: true });
  const alvo = $('#d', m.el);

  const desenhar = () => {
    const proibidos = acharTermosDoCliente(`${c.hook} ${c.copy} ${c.cta}`, cliente);
    const saude = motivoSaude(`${c.hook} ${c.copy} ${c.cta}`, cliente);
    const versoes = c.versoes || [];
    const tudoOk = CHECKLIST_QUALIDADE.every(([k]) => c.checklist?.[k]);
    alvo.innerHTML = `
    <div class="mb-3 flex flex-wrap gap-1">${tag(rotulo(STATUS_CRIATIVO, c.status), STATUS_COR[c.status])}${c.framework ? tag(c.framework, 'tag-info') : ''}
      ${c.angulo ? tag(c.angulo) : ''}${tagNarrativa(c)}${c.modeloGancho ? tag(rotuloModelo(c.modeloGancho)) : ''}${c.gatilho ? tag('gatilho: ' + c.gatilho) : ''}${tag(rotulo(FORMATOS, c.formato))}${tag(c.idioma)}
      ${c.emUsoDesde ? tag(`em uso desde ${dataBR(c.emUsoDesde)}`, 'tag-ok') : ''}${tagAprovacao(c)}</div>
    ${c.status === 'reaprovacao' ? `<div class="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" data-aviso-reaprovacao><b><i class="fa-solid fa-rotate"></i> Aguardando nova aprovação</b>
      <p class="mt-1">${esc(legendaReaprovacao(c))}</p>
      <button class="btn-primary btn-sm mt-2" data-enviar-um><i class="fa-solid fa-paper-plane"></i> Gerar novo link de aprovação com o arquivo atual</button></div>` : ''}
    ${c.aprovacaoCliente ? `<div class="mb-3 rounded-lg border p-3 text-sm ${c.aprovacaoCliente.status === 'aprovado' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}"><b>${c.aprovacaoCliente.status === 'aprovado' ? '<i class="fa-solid fa-circle-check"></i> O cliente aprovou' : '<i class="fa-solid fa-pen"></i> O cliente pediu ajuste'}</b> em ${dataBR(c.aprovacaoCliente.em)}${c.aprovacaoCliente.arquivoNome ? ` · arquivo que ele viu: <b>${esc(c.aprovacaoCliente.arquivoNome)}</b>${c.aprovacaoCliente.arquivoPath !== c.arquivoPath ? ' (não é mais o arquivo atual)' : ''}` : ''}${c.aprovacaoCliente.comentario ? `<p class="mt-1 whitespace-pre-wrap">“${esc(c.aprovacaoCliente.comentario)}”</p>` : ''}</div>` : ''}
    ${proibidos.length ? `<div class="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700"><i class="fa-solid fa-triangle-exclamation"></i> Contém termos proibidos do cliente: <b>${esc(proibidos.join(', '))}</b>. Ajuste antes de aprovar.</div>` : ''}
    ${saude ? `<div class="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700" data-bloqueio-saude><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Não dá para aprovar nem enviar ao cliente: ${esc(saude)}.</div>` : ''}
    ${motivoGancho(c, cliente) ? `<div class="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700" data-bloqueio-gancho><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(motivoGancho(c, cliente))}. Ajuste antes de aprovar.</div>` : ''}
    ${origemGancho(c)}
    ${produtoHtml()}
    <form id="fe" class="space-y-3" data-aviso-sair>
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
      <button class="btn-primary btn-sm" data-estudio><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar foto e vídeo</button>
      <button class="btn-ghost btn-sm" type="button" data-pedir-especialista title="Abre os Especialistas com este criativo escolhido"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> Pedir opinião a um especialista</button></div>

    <details class="mt-5 rounded-lg border border-slate-200 p-3" ${c.arquivoUrl ? 'open' : ''}><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções (enviar a peça final e histórico)</summary>
    <div class="mt-3"><h4 class="mb-2 text-sm font-semibold">Peça final (arquivo)</h4>
      ${c.arquivoUrl ? `<p class="mb-2 flex flex-wrap items-center gap-2 text-sm">${/.(jpe?g|png|webp|gif)$/i.test(c.arquivoNome || '') ? `<img src="${esc(c.arquivoUrl)}" alt="" class="h-12 w-12 rounded object-cover">` : ''}${tag('com arquivo', 'tag-ok')} ${esc(c.arquivoNome || '')}</p>
        ${tipoDaPeca(c.arquivoNome) ? `<p class="hint mb-2">${previaAtual(c) ? '<i class="fa-solid fa-circle-check text-emerald-600"></i> Prévia reduzida para o link de aprovação: pronta.' : '<i class="fa-solid fa-hourglass-half"></i> Prévia reduzida para o link de aprovação: é gerada sozinha nos bastidores (ou ao enviar para aprovação).'} O original fica em qualidade total.</p>` : ''}
        <div class="flex flex-wrap gap-2"><a class="btn-ghost btn-sm" href="${esc(c.arquivoUrl)}" target="_blank" rel="noopener" download="${esc(c.arquivoNome || 'criativo')}"><i class="fa-solid fa-download"></i> Baixar</a>
        <button class="btn-ghost btn-sm" data-link><i class="fa-solid fa-link"></i> Copiar link compartilhável</button>
        <button class="btn-danger btn-sm" data-rm-arq><i class="fa-solid fa-trash"></i> Excluir peça final</button></div>`
        : `<p class="caption mb-2">${tag('sem arquivo', 'tag-warn')} Envie o vídeo ou imagem finalizado.</p>`}
      <div class="mt-2">${campoArquivo({ attrs: 'data-arq', accept: 'image/*,video/*,application/pdf', texto: c.arquivoUrl ? 'Substituir peça final (vídeo, imagem ou PDF)' : 'Enviar peça final (vídeo, imagem ou PDF)', destaque: !c.arquivoUrl, removivel: false, dica: 'Envie o arquivo final do anúncio em qualidade original (MP4/MOV, JPG/PNG ou PDF, sem passar pelo WhatsApp). É ele que o cliente vê no link de aprovação e que você baixa para subir no Gerenciador de Anúncios.' })}</div></div>

    <div class="mt-5"><h4 class="mb-2 text-sm font-semibold">Histórico de versões (${versoes.length})</h4>
      <ol class="space-y-2">${[...versoes].reverse().map((v) => `<li class="rounded-lg bg-slate-50 p-2 text-sm"><div class="flex justify-between"><b>v${v.n} · ${esc(v.nota || '')}</b><span class="hint">${dataBR(v.quando)}</span></div>
        <p class="line-clamp-2 text-slate-600">“${esc(v.hook)}”</p>
        ${v.aprovadaPeloCliente ? `<p class="mt-1 text-xs text-emerald-700" data-versao-aprovada><i class="fa-solid fa-circle-check"></i> O cliente aprovou esta versão em ${dataBR(v.aprovadaPeloCliente.em)}${v.aprovadaPeloCliente.arquivoNome ? `, vendo o arquivo <b>${esc(v.aprovadaPeloCliente.arquivoNome)}</b>` : ' (sem arquivo anexado, só o texto)'}${v.aprovadaPeloCliente.arquivoPath && v.aprovadaPeloCliente.arquivoPath !== c.arquivoPath ? ' — esse arquivo já foi substituído' : ''}.</p>` : ''}
        ${v.n !== Math.max(...versoes.map((x) => x.n)) ? `<div class="mt-1 flex flex-wrap gap-2"><button class="btn-ghost btn-sm" data-restaurar="${v.n}">Restaurar esta versão</button><button class="btn-ghost btn-sm text-rose-600" data-excluir-versao="${v.n}"><i class="fa-solid fa-trash"></i> Excluir esta versão</button></div>` : '<span class="tag tag-ok mt-1">atual</span>'}</li>`).join('')}</ol></div>
    ${botoesExcluir()}
    </details>`;
  };
  // Produto ligado: nome, preço, foto principal e oferta ativa lidos da fonte (aba Produtos, Materiais, perfil de marca).
  function produtoHtml() {
    const d = dadosProduto();
    const opts = (fonte.produtos || []).map((p) => `<option value="${esc(p.id)}" ${p.id === c.produtoId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
    return `<div class="mb-3 rounded-lg border border-slate-200 p-3 text-sm" data-produto-criativo>
      <div class="flex flex-wrap items-center gap-2"><label class="font-semibold" for="pc-${esc(c.id)}">Produto deste criativo</label>
        <select id="pc-${esc(c.id)}" class="input !w-auto !py-1" data-ligar-produto><option value="">Nenhum</option>${opts}</select></div>
      ${!d ? '<p class="hint mt-1">Ligue a um produto para o texto, as peças do Estúdio e os Insights usarem o preço, as fotos e a oferta dele.</p>'
        : d.excluido ? '<p class="mt-1 text-amber-700" data-produto-excluido><i class="fa-solid fa-triangle-exclamation"></i> O produto ligado foi excluído. Escolha outro ou "Nenhum".</p>'
        : `<div class="mt-2 flex flex-wrap items-center gap-3">${d.principal ? `<img src="${esc(d.principal.url)}" alt="" class="h-14 w-14 rounded object-cover" data-foto-principal-criativo>` : '<span class="tag tag-warn">sem foto principal</span>'}
          <div><p><b>${esc(d.produto.nome)}</b> · <span data-preco-criativo>${esc(d.precoTexto || 'sem preço')}</span> · ${d.fotos.length} foto(s)</p>
            <p class="text-slate-600" data-oferta-criativo>${d.oferta ? `Oferta ativa: ${esc(d.oferta)}` : 'Sem oferta ativa no perfil de marca.'}</p>
            <p class="hint">Lido agora da aba Produtos, dos Materiais e do perfil de marca.</p></div>
          <button type="button" class="btn-ia btn-sm" data-atualizar-produto title="A IA ajusta o texto (preço, nome, oferta) aos dados atuais do produto e salva como nova versão"><i class="fa-solid fa-arrows-rotate"></i> Atualizar o texto com os dados atuais</button></div>`}</div>`;
  }
  // Excluir x arquivar (lib/exclusao.js): com resultado registrado, arquiva; arquivado, só exclusão definitiva com aviso.
  function botoesExcluir() {
    const a = acaoAoExcluir(c, fonte.resultados);
    if (a.acao === 'arquivar') return `<div class="mt-5 flex flex-wrap items-center justify-end gap-2"><span class="hint">Tem ${a.resultados} resultado(s) registrado(s): em vez de excluir, arquive (fica nos Insights).</span>
      <button class="btn-ghost btn-sm" data-arquivar><i class="fa-solid fa-box-archive"></i> Arquivar</button></div>`;
    if (a.acao === 'excluirDefinitivo') return `<div class="mt-5 flex flex-wrap items-center justify-end gap-2"><button class="btn-ghost btn-sm" data-desarquivar><i class="fa-solid fa-box-open"></i> Desarquivar</button>
      <button class="btn-danger btn-sm" data-excluir-definitivo><i class="fa-solid fa-trash"></i> Excluir definitivamente</button></div>`;
    return '<div class="mt-5 flex justify-end"><button class="btn-danger btn-sm" data-apagar><i class="fa-solid fa-trash"></i> Excluir criativo</button></div>';
  }
  desenhar();

  on(alvo, 'change', '[data-ligar-produto]', async (s) => {
    const produtoId = s.value || null;
    await db.atualizar(COL.criativos, c.id, { produtoId }); c.produtoId = produtoId;
    toast(produtoId ? 'Criativo ligado ao produto. Estúdio, campanha e Insights passam a usar os dados dele.' : 'Criativo sem produto.'); desenhar(); recarregar();
  });
  on(alvo, 'click', '[data-atualizar-produto]', (b) => ocupado(b, async () => {
    const d = dadosProduto(); if (!d || d.excluido) return;
    const r = await refinarCriativo({ cliente, criativo: c, produtoAtual: contextoProdutoAtual(d), instrucao: 'Atualize o texto para os dados ATUAIS do produto (nome, preço e oferta ativa). Troque só o que estiver diferente; mantenha o resto igual. Se não houver oferta ativa, tire a menção a promoção.' });
    await novaVersao({ hook: r.hook || c.hook, copy: r.copy || c.copy, cta: r.cta || c.cta }, 'IA: atualizado com os dados atuais do produto');
    desenhar(); recarregar();
    mostrarResultado($('#fe', alvo), `Pronto: texto atualizado com o preço ${d.precoTexto || ''} (nova versão).`);
  }));
  on(alvo, 'click', '[data-excluir-versao]', async (b) => {
    const n = Number(b.dataset.excluirVersao); const v = c.versoes.find((x) => x.n === n);
    if (!(await confirmar(`Excluir a versão v${n} ("${v?.nota || ''}") do histórico?${v?.aprovadaPeloCliente ? ' O cliente aprovou esta versão: o registro dessa aprovação sai junto do histórico (a resposta continua no link de aprovação).' : ''} Resultados registrados continuam com o ângulo/framework que tinham.`, 'Excluir versão'))) return;
    try { const { versoes } = semVersao(c, n); await db.atualizar(COL.criativos, c.id, { versoes }); c.versoes = versoes; toast(`Versão v${n} excluída.`); desenhar(); recarregar(); }
    catch (e) { toast(e.message, 'erro'); }
  });
  on(alvo, 'click', '[data-arquivar]', async (b) => {
    if (!(await confirmar('Arquivar este criativo? Ele sai da lista e da montagem de campanha, e continua nos Insights com os resultados. Dá para desarquivar em "Mostrar arquivados".', 'Arquivar'))) return;
    await ocupado(b, async () => { await db.atualizar(COL.criativos, c.id, { arquivado: true, arquivadoEm: new Date().toISOString() }); m.fechar(); recarregar(); toast('Criativo arquivado. Os resultados continuam nos Insights.'); });
  });
  on(alvo, 'click', '[data-desarquivar]', (b) => ocupado(b, async () => { await db.atualizar(COL.criativos, c.id, { arquivado: false, arquivadoEm: null }); c.arquivado = false; desenhar(); recarregar(); toast('Criativo de volta à lista.'); }));
  on(alvo, 'click', '[data-excluir-definitivo]', async () => {
    const n = resultadosDoCriativo(c.id, fonte.resultados).length;
    if (!(await confirmar(`Excluir de vez este criativo arquivado? ${n ? `Os ${n} resultado(s) registrados para ele SAEM dos Insights e não voltam.` : ''} Também saem o arquivo e as respostas de aprovação. Esta ação não pode ser desfeita.`, 'Excluir definitivamente'))) return;
    await apagarCriativoEmCascata(c.id, c.arquivoPath, c.previaPath, { manterArquivos: Boolean(c.aprovacaoToken), clienteId: cliente.id }); m.fechar(); recarregar(); toast('Criativo excluído de vez.');
  });

  const novaVersao = async (patch, nota) => {
    // Sempre grava o ângulo/framework/gatilho/formato vigentes nesta versão (do patch, senão o que já estava no
    // criativo) — sem isso, um resultado registrado depois de uma edição seria atribuído ao ângulo/framework ERRADO.
    // Número = maior + 1 (versão excluída não repete). Mesma regra do "Aplicar" do especialista (lib/aplicar-especialista.js).
    const dados = versaoNova(c, patch, nota);
    await db.atualizar(COL.criativos, c.id, dados);
    Object.assign(c, dados);
  };

  on(alvo, 'submit', '#fe', async (f, ev) => {
    ev.preventDefault();
    const v = lerForm(f);
    await ocupado(f.querySelector('button'), async () => { await novaVersao({ hook: v.hook, copy: v.copy, cta: v.cta }, 'Edição manual'); toast('Nova versão salva.'); desenhar(); recarregar(); });
  });
  on(alvo, 'click', '[data-copiar]', () => copiar(`${c.hook}\n\n${c.copy}\n\n${c.cta}`));
  on(alvo, 'click', '[data-estudio]', () => abrirEstudio(c, cliente, fonte));
  on(alvo, 'click', '[data-pedir-especialista]', () => abrirEspecialistas(cliente, { alvoInicial: { tipo: 'criativo', id: c.id },
    // Ao fechar: relê o criativo (uma sugestão aceita vira nova versão) e redesenha o detalhe.
    aoFechar: async () => { const novo = await db.obter(COL.criativos, c.id).catch(() => null); if (novo && alvo.isConnected) { Object.assign(c, novo); desenhar(); recarregar(); } } }).catch((e) => toast(e.message || 'Não consegui abrir os especialistas.', 'erro')));
  on(alvo, 'submit', '#fc', async (f, ev) => {
    ev.preventDefault();
    const instrucao = lerForm(f).instrucao;
    if (!instrucao) return;
    await ocupado(f.querySelector('button'), async () => {
      const r = await refinarCriativo({ cliente, criativo: c, instrucao, produtoAtual: contextoProdutoAtual(dadosProduto()), conversa: conversa.map((t) => ({ role: t.role, content: t.content })) });
      conversa.push({ role: 'user', content: instrucao }, { role: 'assistant', content: r.explicacao || 'Ajuste aplicado.' });
      await novaVersao({ hook: r.hook || c.hook, copy: r.copy || c.copy, cta: r.cta || c.cta, ...(r.angulo ? { angulo: r.angulo } : {}), ...(r.gatilho ? { gatilho: r.gatilho } : {}) }, `IA: ${instrucao}`);
      desenhar(); recarregar();
      mostrarResultado($('#fe', alvo), 'Pronto: nova versão no texto (e no histórico de versões).');
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
      if (acharTermosDoCliente(`${c.hook} ${c.copy} ${c.cta}`, cliente).length) { toast('Remova os termos proibidos antes de aprovar.', 'erro'); return desenhar(); }
      const saude = motivoSaude(`${c.hook} ${c.copy} ${c.cta}`, cliente);
      if (saude) { toast(`Não dá para aprovar: ${saude}.`, 'erro'); return desenhar(); }
      if (motivoGancho(c, cliente)) { toast(`Não dá para aprovar: ${motivoGancho(c, cliente)}.`, 'erro'); return desenhar(); }
    }
    await definirStatus(c, s.value); toast('Status atualizado.'); desenhar(); recarregar();
  });
  on(alvo, 'change', '[data-arq]', async (inp) => {
    const f = inp.files[0]; if (!f) return;
    await ocupado(inp, async () => {
      const caminho = `gcc/${cliente.id}/criativos/${c.id}/${Date.now()}_${f.name.replace(/[^\w.-]/g, '_')}`;
      const r = await enviarArquivoOuAvisar(caminho, f);
      if (c.arquivoPath) await removerArquivo(c.arquivoPath); // o nome do arquivo que o cliente aprovou continua no histórico de versões
      const patch = { arquivoUrl: r.url, arquivoPath: r.path, arquivoNome: f.name, ...statusAposTrocarArquivo(c) };
      await db.atualizar(COL.criativos, c.id, patch); Object.assign(c, patch);
      toast(patch.status === 'reaprovacao' ? 'Arquivo enviado. Como o cliente não viu este arquivo novo, o status mudou para "Aguardando nova aprovação".' : 'Arquivo enviado.', patch.status === 'reaprovacao' ? 'info' : undefined);
      desenhar(); recarregar();
      previaEmSegundoPlano(cliente, c, f, desenhar); // versão reduzida para o link de aprovação, nos bastidores
    });
  });
  on(alvo, 'click', '[data-link]', () => copiar(c.arquivoUrl));
  on(alvo, 'click', '[data-rm-arq]', async () => {
    if (!(await confirmar(`Excluir a peça final ("${c.arquivoNome || 'arquivo'}") deste criativo?${c.aprovacaoToken ? ' Ele já foi para um link de aprovação: o link continua mostrando a peça que foi enviada.' : ''}`, 'Excluir peça'))) return;
    if (!c.aprovacaoToken) { await removerArquivo(c.arquivoPath); if (c.previaPath || c.previaUrl) await removerPrevia(c); } // link já enviado: o arquivo fica para ele
    const patch = { arquivoUrl: null, arquivoPath: null, arquivoNome: null };
    await db.atualizar(COL.criativos, c.id, patch); Object.assign(c, patch); desenhar(); recarregar();
  });
  on(alvo, 'click', '[data-apagar]', async () => {
    if (acaoAoExcluir(c, fonte.resultados).acao !== 'excluir') return; // com resultado: só arquivar (botão acima)
    if (!(await confirmar(`Excluir este criativo? Também sai o arquivo anexado e as respostas de aprovação recebidas${c.aprovacaoToken ? ' (o link já enviado continua mostrando a peça)' : ''}. Campanhas que usavam ele mostram "criativo excluído". Esta ação não pode ser desfeita.`, 'Excluir'))) return;
    await apagarCriativoEmCascata(c.id, c.arquivoPath, c.previaPath, { manterArquivos: Boolean(c.aprovacaoToken), clienteId: cliente.id }); m.fechar(); recarregar(); toast('Criativo excluído.');
  });
}
