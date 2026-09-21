// Cadastro de cliente (wizard em 3 etapas) e tela do cliente com abas conforme o escopo.
import { db, COL } from '../core/storage.js';
import { IDIOMAS, ESTAGIOS, MODULOS } from '../lib/constantes.js';
import { $, $$, esc, on, lerForm, cabecalho, toast, confirmar, ocupado, opcoes, tag, dataBR, num } from '../core/ui.js';

const ESCOPO_PADRAO = { criativos: true, hooks: true, referencias: true, campanhas: true, resultados: true, produtos: false, site: false, relatorio: true };

export const abasDoCliente = (c) => MODULOS.filter((m) => (c.escopo || ESCOPO_PADRAO)[m.id]);

export function cartaoCliente(c, extra = '') {
  const abas = abasDoCliente(c);
  return `<a href="#/c/${c.id}" class="card block transition hover:border-indigo-400 hover:shadow-md">
    <div class="flex items-start justify-between gap-2"><h3 class="font-semibold text-slate-900">${esc(c.nome)}</h3>
      ${tag(c.estagio === 'rodando' ? 'Rodando' : 'Novo', c.estagio === 'rodando' ? 'tag-ok' : 'tag-info')}</div>
    <p class="caption mt-1">${esc(c.nicho)}</p>
    <div class="mt-3 flex flex-wrap gap-1">${abas.map((a) => tag(a.nome)).join('')}</div>
    ${extra}
    <p class="hint mt-3">Cadastrado em ${dataBR(c.criadoEm)}</p></a>`;
}

// ---------------- formulário em etapas ----------------
export async function viewForm(el, id) {
  const c = id ? await db.obter(COL.clientes, id) : null;
  if (id && !c) { el.innerHTML = '<p class="caption">Cliente não encontrado.</p>'; return; }
  const m = c?.marca || {}, h = c?.historico || {}, esc_ = c?.escopo || ESCOPO_PADRAO;
  const passos = ['Dados básicos', 'Perfil de marca', 'O que entregar'];
  el.innerHTML = `${cabecalho(c ? 'Editar cliente' : 'Novo cliente', 'Preencha em 3 etapas rápidas. Dá para ajustar tudo depois.')}
  <form id="f" class="card max-w-2xl" novalidate>
    <ol class="mb-5 flex gap-2 text-xs">${passos.map((p, i) => `<li data-ind="${i}" class="flex-1 rounded-full px-3 py-1 text-center">${i + 1}. ${p}</li>`).join('')}</ol>

    <section data-passo="0" class="space-y-4">
      <div><label class="label">Nome do cliente *</label><input class="input" name="nome" value="${esc(c?.nome)}" placeholder="Ex.: Loja da Ana"></div>
      <div><label class="label">Nicho / produto *</label><input class="input" name="nicho" value="${esc(c?.nicho)}" placeholder="Ex.: moda fitness feminina"></div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="label">Estágio</label><select class="input" name="estagio">${opcoes(ESTAGIOS, c?.estagio || 'novo')}</select></div>
        <div><label class="label">Idioma dos criativos</label><select class="input" name="idioma">${opcoes(IDIOMAS, m.idioma || 'pt-BR')}</select></div>
      </div>
      <div data-rodando class="grid gap-3 sm:grid-cols-2 ${(c?.estagio || 'novo') === 'rodando' ? '' : 'hidden'}">
        <div><label class="label">CPA médio (R$)</label><input class="input" type="number" step="0.01" name="cpaMedio" value="${esc(h.cpaMedio)}"></div>
        <div><label class="label">Orçamento diário (R$)</label><input class="input" type="number" step="0.01" name="orcamentoDiario" value="${esc(h.orcamentoDiario)}"></div>
        <div class="sm:col-span-2"><label class="label">Públicos que convertem</label><input class="input" name="publicosHist" value="${esc(h.publicos)}" placeholder="Ex.: mulheres 25-40, lookalike compradores"></div>
      </div>
    </section>

    <section data-passo="1" class="hidden space-y-4">
      <p class="caption">Isso é o que faz a IA soar como a marca. Quanto mais real, melhor.</p>
      <div><label class="label">Tom de voz</label><input class="input" name="tomDeVoz" value="${esc(m.tomDeVoz)}" placeholder="Ex.: próximo, bem-humorado, sem formalidade"></div>
      <div><label class="label">Como o público descreve a própria dor</label><textarea class="input" rows="2" name="linguagemDor" placeholder="Nas palavras deles: 'minha roupa nunca serve direito'">${esc(m.linguagemDor)}</textarea></div>
      <div><label class="label">Diferencial (USP)</label><input class="input" name="usp" value="${esc(m.usp)}"></div>
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções (objeções, provas, termos proibidos, site de referência)</summary>
        <div class="mt-3 space-y-4">
          <div><label class="label">Objeções comuns</label><textarea class="input" rows="2" name="objecoes">${esc(m.objecoes)}</textarea></div>
          <div><label class="label">Provas sociais disponíveis (reais)</label><textarea class="input" rows="2" name="provasSociais">${esc(m.provasSociais)}</textarea></div>
          <div><label class="label">Termos proibidos/restritos do nicho</label><textarea class="input" rows="2" name="termosProibidos" placeholder="Separe por vírgula. Ex.: cura, garantido, emagreça">${esc(m.termosProibidos)}</textarea>
            <p class="hint">A IA evita esses termos e o app avisa se algum aparecer no texto.</p></div>
          <div><label class="label">Site de referência (opcional)</label><input class="input" name="siteReferencia" value="${esc(c?.siteReferencia)}" placeholder="https://…"></div>
        </div></details>
    </section>

    <section data-passo="2" class="hidden space-y-3">
      <p class="caption">Marque o que será entregue. Só essas abas aparecem dentro do cliente.</p>
      ${MODULOS.map((mod) => `<label class="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer">
        <input type="checkbox" name="esc_${mod.id}" class="mt-1" ${esc_[mod.id] ? 'checked' : ''}>
        <span><span class="font-medium"><i class="fa-solid fa-${mod.icone} mr-1 text-slate-400"></i>${mod.nome}</span><br><span class="caption">${mod.legenda}</span></span></label>`).join('')}
    </section>

    <div class="mt-6 flex justify-between">
      <button type="button" class="btn-ghost" data-voltar>Voltar</button>
      <button type="button" class="btn-primary" data-avancar>Continuar</button>
      <button type="submit" class="btn-primary hidden" data-salvar><i class="fa-solid fa-check"></i> Salvar cliente</button>
    </div>
  </form>`;

  const form = $('#f', el);
  let passo = 0;
  const mostrar = () => {
    $$('[data-passo]', form).forEach((s) => s.classList.toggle('hidden', Number(s.dataset.passo) !== passo));
    $$('[data-ind]', form).forEach((li) => {
      const on_ = Number(li.dataset.ind) === passo;
      li.className = `flex-1 rounded-full px-3 py-1 text-center ${on_ ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`;
    });
    $('[data-voltar]', form).classList.toggle('invisible', passo === 0);
    $('[data-avancar]', form).classList.toggle('hidden', passo === 2);
    $('[data-salvar]', form).classList.toggle('hidden', passo !== 2);
  };
  mostrar();

  on(form, 'change', '[name=estagio]', (s) => $('[data-rodando]', form).classList.toggle('hidden', s.value !== 'rodando'));
  on(form, 'click', '[data-voltar]', () => { passo = Math.max(0, passo - 1); mostrar(); });
  on(form, 'click', '[data-avancar]', () => {
    if (passo === 0) {
      const v = lerForm(form);
      if (!v.nome || !v.nicho) return toast('Preencha o nome e o nicho para continuar.', 'erro');
    }
    passo = Math.min(2, passo + 1); mostrar();
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = lerForm(form);
    if (!v.nome || !v.nicho) { passo = 0; mostrar(); return toast('Preencha o nome e o nicho.', 'erro'); }
    const escopo = Object.fromEntries(MODULOS.map((mod) => [mod.id, form.elements['esc_' + mod.id].checked]));
    const dados = {
      nome: v.nome, nicho: v.nicho, estagio: v.estagio, siteReferencia: v.siteReferencia || '', escopo,
      historico: v.estagio === 'rodando' ? { cpaMedio: num(v.cpaMedio), orcamentoDiario: num(v.orcamentoDiario), publicos: v.publicosHist || '' } : {},
      marca: {
        tomDeVoz: v.tomDeVoz || '', linguagemDor: v.linguagemDor || '', objecoes: v.objecoes || '', provasSociais: v.provasSociais || '',
        usp: v.usp || '', idioma: v.idioma, termosProibidos: v.termosProibidos || '',
      },
    };
    await ocupado($('[data-salvar]', form), async () => {
      if (c) { await db.atualizar(COL.clientes, c.id, dados); toast('Cliente atualizado.'); location.hash = `#/c/${c.id}`; }
      else { const novo = await db.criar(COL.clientes, dados); toast('Cliente criado! Agora é só começar pelos criativos.'); location.hash = `#/c/${novo.id}`; }
    });
  });
}

// ---------------- tela do cliente ----------------
export async function viewCliente(el, id, aba, abasMap) {
  const c = await db.obter(COL.clientes, id);
  if (!c) { el.innerHTML = '<p class="caption">Cliente não encontrado. <a class="text-indigo-600" href="#/">Voltar ao início</a></p>'; return; }
  const abas = abasDoCliente(c);
  if (!abas.length) { el.innerHTML = cabecalho(c.nome, 'Nenhum módulo marcado no escopo.', `<a class="btn-primary" href="#/c/${id}/editar">Editar escopo</a>`); return; }
  const atual = abas.find((a) => a.id === aba) || abas[0];

  el.innerHTML = `<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
    <div><a href="#/" class="caption hover:text-indigo-600"><i class="fa-solid fa-arrow-left"></i> Todos os clientes</a>
      <h1 class="text-2xl font-bold text-slate-900">${esc(c.nome)} <span class="text-base font-normal text-slate-500">· ${esc(c.nicho)}</span></h1></div>
    <div class="flex gap-2"><a class="btn-ghost btn-sm" href="#/c/${id}/editar" title="Editar dados, marca e escopo"><i class="fa-solid fa-pen"></i> Editar</a>
      <button class="btn-danger btn-sm" data-excluir title="Apagar este cliente"><i class="fa-solid fa-trash"></i></button></div></div>
    <nav class="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Abas do cliente">
      ${abas.map((a) => `<a href="#/c/${id}/${a.id}" title="${esc(a.legenda)}" class="whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${a.id === atual.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}"><i class="fa-solid fa-${a.icone} mr-1"></i>${a.nome}</a>`).join('')}
    </nav><div id="aba"></div>`;

  on(el, 'click', '[data-excluir]', async () => {
    if (!(await confirmar(`Apagar "${c.nome}"? Os criativos, hooks e demais dados ligados a ele ficam órfãos e deixam de aparecer.`, 'Apagar'))) return;
    await db.remover(COL.clientes, id); toast('Cliente apagado.'); location.hash = '#/';
  });

  const modulo = abasMap[atual.id];
  const alvo = $('#aba', el);
  alvo.innerHTML = `<p class="caption">${esc(atual.legenda)}</p>`;
  try { await modulo(alvo, c); }
  catch (e) { console.error(e); alvo.innerHTML = `<div class="card text-rose-700">Erro ao carregar esta aba: ${esc(e.message)}</div>`; }
}
