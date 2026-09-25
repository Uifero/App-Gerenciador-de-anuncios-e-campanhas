// Cadastro de cliente (wizard em 3 etapas) e tela do cliente com abas conforme o escopo.
import { db, COL } from '../core/storage.js';
import { IDIOMAS, ESTAGIOS, MODULOS, ESCOPO_PADRAO } from '../lib/constantes.js';
import { $, $$, esc, on, lerForm, cabecalho, toast, confirmar, ocupado, opcoes, tag, dataBR, num, modal } from '../core/ui.js';
import { obterConfig } from './configuracoes.js';
import { resumoCliente, semaforoHtml, cartaoProgresso } from './alertas.js';
import { aplicarPlaybook, rascunhoDeCliente, abrirEditor } from './playbooks.js';
import { resumoBase, copiarEstrutura } from './duplicar.js';
import { cartaoCusto, totalArquivadoDoCliente } from './custo.js';
import { exportarDados } from './backup.js';
import { contarDependentesCliente, apagarClienteEmCascata } from '../lib/cascata.js';
import { abrirDiagnostico } from './diagnostico.js';
import { pedirBuscaInicial, consumirBuscaInicial, deveBuscarAutomatico, iniciouBusca, terminouBusca, buscaEmAndamento, marcarPerguntado } from './busca-mercado.js';
import { buscarExemplosMercado } from './referencias.js';
import { marcasQueContinuam, textoMarca } from '../lib/leitura.js';
import { normalizarRastreamento, indicadorPixel } from '../lib/rastreamento.js';

/**
 * Busca de exemplos de mercado do primeiro uso: roda sozinha na tela do cliente recém-cadastrado, mostra o que está
 * fazendo num cartão e abre os resultados na mesma janela de revisão da busca manual. Se falhar (servidor de IA fora,
 * orçamento recusado), o cliente continua com buscaMercadoFeita=false e o cartão oferece tentar de novo.
 */
async function buscaInicial(c) {
  // Procura o cartão na hora de escrever: se a pessoa trocou de aba no meio da busca, a tela foi redesenhada (e se
  // foi para outro cliente, não há cartão deste — a janela com os resultados abre do mesmo jeito).
  const cartao = (html, cor = 'border-indigo-200 bg-indigo-50/50') => { const caixa = document.querySelector(`#busca-inicial[data-cliente="${c.id}"]`); if (caixa) caixa.innerHTML = `<div class="card mb-5 ${cor} text-sm" data-busca-inicial>${html}</div>`; };
  cartao(`<p class="font-semibold"><i class="fa-solid fa-spinner fa-spin mr-1 text-indigo-500"></i>Buscando exemplos de mercado do nicho "${esc(c.nicho)}" automaticamente, só na primeira vez…</p>
    <p class="hint">A IA pesquisa na web anúncios que estão dando certo nesse nicho (leva de 1 a 3 minutos). Os resultados abrem para você revisar e escolher o que salvar em Referências. Pode continuar usando o app enquanto isso, só não recarregue nem feche a página.</p>`);
  iniciouBusca(c.id);
  try {
    const cfg = await obterConfig();
    await buscarExemplosMercado(c, cfg, {
      aoFechar: (salvas) => {
        // Se a pessoa já está na aba Referências deste cliente, a lista na tela é anterior às salvas: redesenha (a própria
        // lista confirma o que foi salvo). Em outra aba, o cartão avisa e leva até lá.
        if (salvas && location.hash === `#/c/${c.id}/referencias`) { window.dispatchEvent(new Event('hashchange')); toast(`Busca inicial concluída: ${salvas} referência(s) salva(s). Da próxima vez, o app pergunta antes de buscar.`); return; }
        cartao(`<div class="flex flex-wrap items-center justify-between gap-2"><p><i class="fa-solid fa-circle-check mr-1 text-emerald-500"></i><b>Busca inicial concluída:</b> ${salvas} referência(s) salva(s). Da próxima vez, a busca não roda sozinha: o app pergunta antes.</p>
          <span class="flex gap-2">${salvas ? `<a class="btn-primary btn-sm" href="#/c/${c.id}/referencias">Ver em Referências</a>` : ''}<button class="btn-ghost btn-sm" data-ok-busca>Ok</button></span></div>`, 'border-emerald-200 bg-emerald-50/50');
      },
    });
    // Acabou de buscar: o convite "Buscar novos exemplos agora?" só volta numa próxima sessão, não logo em seguida.
    marcarPerguntado(c.id);
    cartao(`<p><i class="fa-solid fa-list-check mr-1 text-indigo-500"></i>Resultados abertos para revisão: salve os que fizerem sentido e feche a janela.</p>`);
  } catch (e) {
    cartao(`<div class="flex flex-wrap items-center justify-between gap-2"><p class="text-amber-800"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Não foi possível buscar exemplos de mercado agora: ${esc(e.message || 'erro desconhecido')}</p>
      <span class="flex gap-2"><button class="btn-primary btn-sm" data-tentar-busca>Tentar de novo</button><button class="btn-ghost btn-sm" data-ok-busca>Agora não</button></span></div>`, 'border-amber-300 bg-amber-50');
  } finally { terminouBusca(c.id); }
}

/** Etiqueta discreta "preenchido automaticamente do site" ao lado do rótulo (some quando a pessoa edita e salva). */
const etiquetaAuto = (c, campo) => (c?.autoPreenchido?.[campo] ? `<span class="tag tag-warn font-normal">${esc(textoMarca(c.autoPreenchido[campo]))}</span>` : '');

export const abasDoCliente = (c) => MODULOS.filter((m) => (c.escopo || ESCOPO_PADRAO)[m.id]);

/** Converte os campos do formulário/assistente no documento do cliente (mesma função para os dois caminhos). */
export function montarDadosCliente(v, escopo) {
  const metaCpa = num(v.metaCpa), metaRoas = num(v.metaRoas);
  return {
    nome: v.nome, nicho: v.nicho, estagio: v.estagio, siteReferencia: v.siteReferencia || '', escopo,
    metas: { cpa: metaCpa > 0 ? metaCpa : null, roas: metaRoas > 0 ? metaRoas : null },
    orcamentoIaMensalUsd: num(v.orcamentoIa) > 0 ? num(v.orcamentoIa) : null,
    // Pixel do Meta / tag do Google Ads (opcionais). Só vão para o código do site gerado; o app não envia nada a ninguém.
    rastreamento: normalizarRastreamento({ metaPixelId: v.metaPixelId, googleAdsId: v.googleAdsId }).valor,
    historico: v.estagio === 'rodando' ? { cpaMedio: num(v.cpaMedio), orcamentoDiario: num(v.orcamentoDiario), publicos: v.publicosHist || '' } : {},
    marca: {
      tomDeVoz: v.tomDeVoz || '', linguagemDor: v.linguagemDor || '', objecoes: v.objecoes || '', provasSociais: v.provasSociais || '',
      usp: v.usp || '', idioma: v.idioma || 'pt-BR', termosProibidos: v.termosProibidos || '', estetica: v.estetica || '',
    },
  };
}

/**
 * Cria o cliente e, opcionalmente, aplica um playbook (hooks + ângulos) e/ou copia a estrutura de um cliente base.
 * opts: { playbook, baseId, copiar: { hooks, campanhas } }
 */
export async function criarCliente(v, escopo, opts = {}) {
  // buscaMercadoFeita só existe a partir da criação (a edição usa montarDadosCliente e não mexe nele): false = a tela
  // do cliente, logo depois do cadastro, dispara a busca de exemplos de mercado sozinha (ver busca-mercado.js).
  const novo = await db.criar(COL.clientes, { ...montarDadosCliente(v, escopo), buscaMercadoFeita: false });
  pedirBuscaInicial(novo.id);
  if (opts.baseId) {
    const r = await copiarEstrutura(opts.baseId, novo, opts.copiar);
    if (r.hooks || r.campanhas) toast(`Copiado do cliente base: ${r.hooks} hook(s) e ${r.campanhas} estrutura(s) de campanha.`);
  }
  if (opts.playbook) {
    const n = await aplicarPlaybook(novo, opts.playbook);
    toast(`Playbook "${opts.playbook.nome}" aplicado: ${n} hook(s) adicionados.`);
  }
  return novo;
}

export function cartaoCliente(c, extra = '', indicador = '') {
  const abas = abasDoCliente(c);
  return `<a href="#/c/${c.id}" class="card block transition hover:border-indigo-400 hover:shadow-md">
    <div class="flex items-start justify-between gap-2"><h3 class="font-semibold text-slate-900">${esc(c.nome)}</h3>
      ${tag(c.estagio === 'rodando' ? 'Rodando' : 'Novo', c.estagio === 'rodando' ? 'tag-ok' : 'tag-info')}</div>
    <p class="caption mt-1">${esc(c.nicho)}</p>
    ${indicador ? `<div class="mt-2">${indicador}</div>` : ''}
    <div class="mt-3 flex flex-wrap gap-1">${abas.map((a) => tag(a.nome)).join('')}</div>
    ${extra}
    <p class="hint mt-3">Cadastrado em ${dataBR(c.criadoEm)}</p></a>`;
}

// ---------------- escolha do modo de cadastro ----------------
export async function viewNovo(el) {
  el.innerHTML = `${cabecalho('Novo cliente', 'Como você prefere cadastrar?')}
  <div class="grid max-w-3xl gap-4 md:grid-cols-2">
    <a href="#/clientes/novo/assistente" class="card block transition hover:border-indigo-400 hover:shadow-md"><div class="mb-2 text-2xl text-indigo-500"><i class="fa-solid fa-comments"></i></div>
      <h3 class="font-semibold">Assistente <span class="tag tag-info">recomendado</span></h3><p class="caption">Uma pergunta por vez, com dicas. Ideal para o primeiro cadastro.</p></a>
    <a href="#/clientes/novo/completo" class="card block transition hover:border-indigo-400 hover:shadow-md"><div class="mb-2 text-2xl text-indigo-500"><i class="fa-solid fa-table-list"></i></div>
      <h3 class="font-semibold">Preencher tudo de uma vez</h3><p class="caption">Formulário completo em 3 etapas. Mais rápido para quem já sabe o que quer.</p></a></div>`;
}

// ---------------- formulário em etapas ----------------
export async function viewForm(el, id, { baseId = null } = {}) {
  const c = id ? await db.obter(COL.clientes, id) : null;
  if (id && !c) { el.innerHTML = '<p class="caption">Cliente não encontrado.</p>'; return; }
  // "Duplicar como base": pré-preenche perfil, escopo e metas do cliente base (nome vazio; histórico e resultados NÃO vêm).
  const base = !c && baseId ? await db.obter(COL.clientes, baseId) : null;
  const fonte = c || base;
  const playbooks = c ? [] : await db.listar(COL.playbooks);
  const cont = base ? await resumoBase(base.id) : null;
  const m = fonte?.marca || {}, h = c?.historico || {}, esc_ = fonte?.escopo || ESCOPO_PADRAO, metas = fonte?.metas || {};
  const passos = ['Dados básicos', 'Perfil de marca', 'O que entregar'];
  el.innerHTML = `${cabecalho(c ? 'Editar cliente' : base ? 'Novo cliente a partir de uma base' : 'Novo cliente', 'Preencha em 3 etapas rápidas. Dá para ajustar tudo depois.')}
  ${base ? `<div class="card mb-4 max-w-2xl border-indigo-300"><p class="text-sm"><i class="fa-solid fa-copy mr-1 text-indigo-500"></i>Usando <b>${esc(base.nome)}</b> como base. O perfil de marca, o escopo e as metas já vieram preenchidos; escolha o que mais copiar:</p>
    <div class="mt-2 space-y-1 text-sm"><label class="flex items-center gap-2"><input type="checkbox" name="copiarHooks" form="f" checked> Hooks (${cont.hooks}) — sem as notas de performance</label>
    <label class="flex items-center gap-2"><input type="checkbox" name="copiarCampanhas" form="f" checked> Estruturas de campanha (${cont.campanhas}) — sem criativos vinculados</label></div>
    <p class="hint">Resultados, criativos finalizados e arquivos não são copiados.</p></div>` : ''}
  <form id="f" class="card max-w-2xl" novalidate>
    <ol class="mb-5 flex gap-2 text-xs">${passos.map((p, i) => `<li data-ind="${i}" class="flex-1 rounded-full px-3 py-1 text-center">${i + 1}. ${p}</li>`).join('')}</ol>

    <section data-passo="0" class="space-y-4">
      <div><label class="label">Nome do cliente *</label><input class="input" name="nome" value="${esc(c?.nome)}" placeholder="Ex.: Loja da Ana"></div>
      <div><label class="label">Nicho / produto *</label><input class="input" name="nicho" value="${esc(fonte?.nicho)}" placeholder="Ex.: moda fitness feminina"></div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="label">Estágio</label><select class="input" name="estagio">${opcoes(ESTAGIOS, c?.estagio || 'novo')}</select></div>
        <div><label class="label">Idioma dos criativos</label><select class="input" name="idioma">${opcoes(IDIOMAS, m.idioma || 'pt-BR')}</select></div>
      </div>
      <div data-rodando class="grid gap-3 sm:grid-cols-2 ${(c?.estagio || 'novo') === 'rodando' ? '' : 'hidden'}">
        <div><label class="label">CPA médio (R$)</label><input class="input" type="number" step="0.01" name="cpaMedio" value="${esc(h.cpaMedio)}"></div>
        <div><label class="label">Orçamento diário (R$)</label><input class="input" type="number" step="0.01" name="orcamentoDiario" value="${esc(h.orcamentoDiario)}"></div>
        <div class="sm:col-span-2"><label class="label">Públicos que convertem</label><input class="input" name="publicosHist" value="${esc(h.publicos)}" placeholder="Ex.: mulheres 25-40, lookalike compradores"></div>
        <p class="hint sm:col-span-2">Números de hoje, do Gerenciador de Anúncios (CPA = custo médio de cada venda). A IA parte deles nas sugestões e o "Diagnosticar campanha" já vem preenchido com eles.</p>
      </div>
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600" title="Ativa o semáforo verde/amarelo/vermelho e o alerta de hora de escalar">Meta de resultado (opcional)</summary>
        <div class="mt-3 grid gap-3 sm:grid-cols-2"><div><label class="label">Meta de CPA (R$)</label><input class="input" type="number" step="0.01" min="0" name="metaCpa" value="${esc(metas.cpa)}"></div>
          <div><label class="label">Meta de ROAS</label><input class="input" type="number" step="0.01" min="0" name="metaRoas" value="${esc(metas.roas)}"></div></div>
        <p class="hint">CPA = quanto o cliente aceita pagar por venda (ex.: 40). ROAS = quanto precisa voltar em vendas para cada R$ 1 de anúncio (ex.: 3 = R$ 3 em vendas). O semáforo verde/amarelo/vermelho compara os resultados recentes com essa meta. Deixe em branco para não usar.</p></details>
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600" title="Limite de gasto com IA só para este cliente">Orçamento mensal de IA deste cliente (opcional)</summary>
        <div class="mt-3"><label class="label">Limite por mês (US$)</label><input class="input" type="number" step="0.01" min="0" name="orcamentoIa" value="${esc(fonte?.orcamentoIaMensalUsd)}" placeholder="Sem limite">
        <p class="hint">Ao passar do limite, cada geração de IA para este cliente pede confirmação. O limite geral fica em Configurações.</p></div></details>
      <details class="rounded-lg border border-slate-200 p-3" data-rastreamento ${fonte?.rastreamento?.metaPixelId || fonte?.rastreamento?.googleAdsId ? 'open' : ''}><summary class="cursor-pointer text-sm font-medium text-slate-600" title="Pixel do Meta e tag do Google Ads no site do cliente">Rastreamento: Pixel do Meta e Google Ads (opcional)</summary>
        <p class="hint mt-2">Cole aqui o ID do Pixel/tag de conversão da sua conta de anúncios. Isso é necessário para a plataforma saber quem visitou o site e comprou, sem isso a campanha não consegue otimizar por conversão real.</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label class="label">ID do Pixel do Meta</label><input class="input" name="metaPixelId" inputmode="numeric" value="${esc(fonte?.rastreamento?.metaPixelId)}" placeholder="Ex.: 123456789012345">
            <p class="hint">Onde achar: Gerenciador de Eventos do Meta > Pixels (o número abaixo do nome do pixel).</p></div>
          <div><label class="label">ID de acompanhamento do Google Ads</label><input class="input" name="googleAdsId" value="${esc([fonte?.rastreamento?.googleAdsId, fonte?.rastreamento?.googleAdsRotulo].filter(Boolean).join('/'))}" placeholder="Ex.: AW-123456789">
            <p class="hint">Onde achar: Google Ads > Ferramentas > Medição > Conversões. Se quiser contar a conversão no botão de compra, cole com o rótulo: AW-123456789/AbCdEf.</p></div></div>
        <p class="hint">Em branco: o site é gerado normalmente, sem nenhum código de rastreamento. Preenchido: o site personalizado já sai com o código, e o manual do pacote Nuvemshop/Shopify traz os IDs para colar na loja. O app não envia esses dados a ninguém.</p></details>
    </section>

    <section data-passo="1" class="hidden space-y-4">
      <p class="caption">Isso é o que faz a IA soar como a marca. Quanto mais real, melhor.</p>
      <div><label class="label">Tom de voz ${etiquetaAuto(c, 'tomDeVoz')}</label><input class="input" name="tomDeVoz" value="${esc(m.tomDeVoz)}" placeholder="Ex.: próximo, bem-humorado, sem formalidade"></div>
      <div><label class="label">Como o público descreve a própria dor</label><textarea class="input" rows="2" name="linguagemDor" placeholder="Nas palavras deles: 'minha roupa nunca serve direito'">${esc(m.linguagemDor)}</textarea></div>
      <div><label class="label">Diferencial (USP) ${etiquetaAuto(c, 'usp')}</label><input class="input" name="usp" value="${esc(m.usp)}"></div>
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Mais opções (objeções, provas, termos proibidos, site de referência)</summary>
        <div class="mt-3 space-y-4">
          <div><label class="label">Objeções comuns</label><textarea class="input" rows="2" name="objecoes">${esc(m.objecoes)}</textarea></div>
          <div><label class="label">Provas sociais disponíveis (reais) ${etiquetaAuto(c, 'provasSociais')}</label><textarea class="input" rows="2" name="provasSociais">${esc(m.provasSociais)}</textarea></div>
          <div><label class="label">Estética / paleta de cor ${etiquetaAuto(c, 'estetica')}</label><textarea class="input" rows="2" name="estetica" placeholder="Ex.: tons terrosos, fundo claro, luz natural">${esc(m.estetica)}</textarea></div>
          <div><label class="label">Termos proibidos/restritos do nicho</label><textarea class="input" rows="2" name="termosProibidos" placeholder="Separe por vírgula. Ex.: cura, garantido, emagreça">${esc(m.termosProibidos)}</textarea>
            <p class="hint">A IA evita esses termos e o app avisa se algum aparecer no texto.</p></div>
          <div><label class="label">Site de referência (opcional)</label><input class="input" name="siteReferencia" value="${esc(fonte?.siteReferencia)}" placeholder="https://…"></div>
        </div></details>
    </section>

    <section data-passo="2" class="hidden space-y-3">
      <p class="caption">Marque o que será entregue. Só essas abas aparecem dentro do cliente.</p>
      ${MODULOS.map((mod) => `<label class="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer">
        <input type="checkbox" name="esc_${mod.id}" class="mt-1" ${esc_[mod.id] ? 'checked' : ''}>
        <span><span class="font-medium"><i class="fa-solid fa-${mod.icone} mr-1 text-slate-400"></i>${mod.nome}</span><br><span class="caption">${mod.legenda}</span></span></label>`).join('')}
      ${!c ? `<details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Partir de um playbook (opcional)</summary>
        <div class="mt-3">${playbooks.length ? `<select class="input" name="playbookId"><option value="">Nenhum</option>${playbooks.map((p) => `<option value="${p.id}">${esc(p.nome)} — ${esc(p.tipoProduto)}</option>`).join('')}</select>
          <p class="hint">Cria hooks e ângulos sugeridos que costumam funcionar nesse tipo de produto.</p>` : '<p class="caption">Ainda não há playbooks. Crie na tela Playbooks.</p>'}</div></details>` : ''}
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

  /** ID de pixel com formato errado: avisa e abre a seção (em branco é sempre aceito). */
  const rastreamentoOk = (v) => {
    const { erros } = normalizarRastreamento({ metaPixelId: v.metaPixelId, googleAdsId: v.googleAdsId });
    if (!erros.length) return true;
    $('[data-rastreamento]', form).open = true;
    toast(erros.join(' '), 'erro');
    return false;
  };
  on(form, 'change', '[name=estagio]', (s) => $('[data-rodando]', form).classList.toggle('hidden', s.value !== 'rodando'));
  on(form, 'click', '[data-voltar]', () => { passo = Math.max(0, passo - 1); mostrar(); });
  on(form, 'click', '[data-avancar]', () => {
    if (passo === 0) {
      const v = lerForm(form);
      if (!v.nome || !v.nicho) return toast('Preencha o nome e o nicho para continuar.', 'erro');
      if (!rastreamentoOk(v)) return;
    }
    passo = Math.min(2, passo + 1); mostrar();
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = lerForm(form);
    if (!v.nome || !v.nicho) { passo = 0; mostrar(); return toast('Preencha o nome e o nicho.', 'erro'); }
    if (!rastreamentoOk(v)) { passo = 0; mostrar(); return; }
    const escopo = Object.fromEntries(MODULOS.map((mod) => [mod.id, form.elements['esc_' + mod.id].checked]));
    await ocupado($('[data-salvar]', form), async () => {
      if (c) {
        const dados = montarDadosCliente(v, escopo);
        if (c.autoPreenchido) dados.autoPreenchido = marcasQueContinuam(c.autoPreenchido, c.marca, dados.marca); // editou = confirmou
        await db.atualizar(COL.clientes, c.id, dados); toast('Cliente atualizado.'); location.hash = `#/c/${c.id}`; return;
      }
      const novo = await criarCliente(v, escopo, {
        playbook: playbooks.find((p) => p.id === v.playbookId),
        baseId: base?.id, copiar: { hooks: !!form.elements.copiarHooks?.checked, campanhas: !!form.elements.copiarCampanhas?.checked },
      });
      toast('Cliente criado! Agora é só começar pelos criativos.'); location.hash = `#/c/${novo.id}`;
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
  const calcularResumo = async () => {
    const filtro = { clienteId: id };
    const [cfg, criativos, resultados, campanhas, sites, uso, usoArquivado] = await Promise.all([
      obterConfig(), db.listar(COL.criativos, filtro), db.listar(COL.resultados, filtro), db.listar(COL.campanhas, filtro), db.listar(COL.sites, filtro),
      db.listar(COL.usoApi, filtro), totalArquivadoDoCliente(id),
    ]);
    return { ...resumoCliente(c, { criativos, resultados, campanhas, sites }, cfg), uso, usoArquivado, cfg };
  };
  const resumoP = calcularResumo(); // começa já; a aba abaixo carrega em paralelo, sem esperar os cards

  el.innerHTML = `<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
    <div><a href="#/" class="caption hover:text-indigo-600"><i class="fa-solid fa-arrow-left"></i> Todos os clientes</a>
      <h1 class="text-2xl font-bold text-slate-900">${esc(c.nome)} <span class="text-base font-normal text-slate-500">· ${esc(c.nicho)}</span></h1>
      ${indicadorPixel(c, id)}</div>
    <div class="flex flex-wrap gap-2"><a class="btn-ghost btn-sm" href="#/c/${id}/editar" title="Editar dados, marca, metas e escopo"><i class="fa-solid fa-pen"></i> Editar</a>
      <button class="btn-ghost btn-sm" data-exportar title="Baixa um arquivo JSON com todos os dados deste cliente (backup)"><i class="fa-solid fa-file-export"></i> Baixar backup</button>
      <button class="btn-ghost btn-sm" data-mais title="Duplicar como base, playbooks e outras ações"><i class="fa-solid fa-ellipsis"></i> Mais ações</button>
      <button class="btn-danger btn-sm" data-excluir title="Apagar este cliente"><i class="fa-solid fa-trash"></i></button></div></div>
    <div id="busca-inicial" data-cliente="${esc(id)}">${buscaEmAndamento(id) ? `<div class="card mb-5 border-indigo-200 bg-indigo-50/50 text-sm"><i class="fa-solid fa-spinner fa-spin mr-1 text-indigo-500"></i>Busca inicial de exemplos de mercado em andamento… os resultados abrem numa janela assim que chegarem.</div>` : ''}</div>
    <div id="cards"><div class="card mb-5 h-16 animate-pulse" aria-hidden="true"></div></div>
    <nav class="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Abas do cliente">
      ${abas.map((a) => `<a href="#/c/${id}/${a.id}" title="${esc(a.legenda)}" class="whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${a.id === atual.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}"><i class="fa-solid fa-${a.icone} mr-1"></i>${a.nome}</a>`).join('')}
    </nav><div id="aba"></div>`;

  on(el, 'click', '[data-excluir]', async (btn) => {
    const n = await contarDependentesCliente(id);
    const partes = [
      n.criativos && `${n.criativos} criativo(s)`, n.hooks && `${n.hooks} hook(s)`, n.referencias && `${n.referencias} referência(s)`,
      n.campanhas && `${n.campanhas} campanha(s)`, n.resultados && `${n.resultados} resultado(s)`, n.produtos && `${n.produtos} produto(s)`,
      n.sites && `${n.sites} site(s)`, n.aprovacoes && `${n.aprovacoes} link(s) de aprovação`, n.respostas && `${n.respostas} resposta(s) de cliente`, n.diagnosticos && `${n.diagnosticos} diagnóstico(s)`, n.materiais && `${n.materiais} foto(s) salva(s) em Materiais`,
    ].filter(Boolean);
    const msg = partes.length
      ? `Apagar "${c.nome}" e tudo o que está ligado a ele — ${partes.join(', ')}? Esta ação não pode ser desfeita. Se quiser guardar esses dados, exporte um backup antes.`
      : `Apagar "${c.nome}"? Esta ação não pode ser desfeita.`;
    if (!(await confirmar(msg, 'Apagar tudo'))) return;
    await ocupado(btn, async () => { await apagarClienteEmCascata(id); toast('Cliente e todos os dados ligados a ele foram apagados.'); location.hash = '#/'; });
  });

  // Mantém o card de progresso/semáforo em dia quando qualquer aba grava algo (só recalcula o card, não a aba).
  let timer;
  const aoMudar = () => {
    if (!el.isConnected) { window.removeEventListener('gcc:mudou', aoMudar); return; }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const cartao = $('#lancamento', el); if (!cartao) return;
      const abertoP = cartao.open, abertoC = $('#custo-ia', el)?.open;
      const r = await calcularResumo();
      if (!el.isConnected || !$('#lancamento', el)) return; // saiu da tela enquanto calculava
      $('#lancamento', el).outerHTML = cartaoProgresso(c, r);
      const custo = $('#custo-ia', el); if (custo) custo.outerHTML = cartaoCusto(c, r.uso, r.cfg, r.usoArquivado);
      if (abertoP) $('#lancamento', el).open = true;
      if (abertoC && $('#custo-ia', el)) $('#custo-ia', el).open = true;
    }, 300);
  };
  window.addEventListener('gcc:mudou', aoMudar);

  on(el, 'click', '[data-exportar]', (b) => ocupado(b, () => exportarDados(c)));

  // Primeiro uso: logo após o cadastro, busca exemplos de mercado sem precisar clicar em nada.
  if (consumirBuscaInicial(id) && deveBuscarAutomatico(c)) buscaInicial(c);
  on(el, 'click', '[data-ok-busca]', () => { $('#busca-inicial', el).innerHTML = ''; });
  on(el, 'click', '[data-tentar-busca]', () => buscaInicial(c));

  on(el, 'click', '[data-mais]', async () => {
    const pbs = await db.listar(COL.playbooks);
    const m = modal('Mais ações', `<div class="space-y-3">
      ${c.estagio === 'rodando' ? `<div><button class="btn-ia w-full" data-diagnostico><i class="fa-solid fa-stethoscope"></i> Diagnosticar campanha atual</button>
        <p class="hint">Cruza o que já está no ar com os padrões do motor de Insights e as referências de mercado salvas, pra sugerir o que manter e o que mudar.</p></div>` : ''}
      <div><button class="btn-ghost w-full" data-duplicar><i class="fa-solid fa-copy"></i> Duplicar como base para novo cliente</button>
        <p class="hint">Abre um cadastro novo já com o perfil de marca, as metas, o escopo, os hooks e as estruturas de campanha deste cliente. Resultados e criativos finalizados não vão junto.</p></div>
      <div><button class="btn-ghost w-full" data-salvar-pb><i class="fa-solid fa-book-open"></i> Salvar como playbook</button>
        <p class="hint">Guarda os ângulos e hooks que funcionaram aqui como receita reaproveitável em novos clientes.</p></div>
      <div><label class="label">Aplicar um playbook a este cliente</label><div class="flex gap-2"><select class="input" data-pb>${pbs.length ? pbs.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('') : '<option value="">Nenhum playbook ainda</option>'}</select>
        <button class="btn-primary" data-aplicar-pb ${pbs.length ? '' : 'disabled'}>Aplicar playbook</button></div>
        <p class="hint">Adiciona os hooks do playbook à biblioteca deste cliente e sugere os ângulos na hora de criar criativos.</p></div></div>`);
    on(m.el, 'click', '[data-diagnostico]', () => { m.fechar(); abrirDiagnostico(c); });
    on(m.el, 'click', '[data-duplicar]', () => { try { sessionStorage.setItem('gcc_base', id); } catch { /* sem storage */ } m.fechar(); location.hash = '#/clientes/novo/completo'; });
    on(m.el, 'click', '[data-salvar-pb]', async (b) => {
      await ocupado(b, async () => { const r = await rascunhoDeCliente(c); m.fechar(); abrirEditor(r, () => toast('Playbook salvo na biblioteca.'), 'Salvar como playbook (revise antes)'); });
    });
    on(m.el, 'click', '[data-aplicar-pb]', async (b) => {
      const pb = pbs.find((p) => p.id === m.el.querySelector('[data-pb]').value);
      await ocupado(b, async () => { const n = await aplicarPlaybook(c, pb); toast(`Playbook aplicado: ${n} hook(s) adicionados.`); m.fechar(); window.dispatchEvent(new Event('hashchange')); /* re-renderiza a aba atual */ });
    });
  });

  const cartoes = resumoP.then((r) => {
    if (!el.isConnected) return;
    $('#cards', el).innerHTML = cartaoProgresso(c, r) + cartaoCusto(c, r.uso, r.cfg, r.usoArquivado);
  }).catch((e) => { console.error(e); if (el.isConnected) $('#cards', el).innerHTML = ''; });

  const modulo = abasMap[atual.id];
  const alvo = $('#aba', el);
  alvo.innerHTML = `<p class="caption">${esc(atual.legenda)}</p>`;
  try { await Promise.all([modulo(alvo, c), cartoes]); }
  catch (e) { console.error(e); alvo.innerHTML = `<div class="card text-rose-700">Erro ao carregar esta aba: ${esc(e.message)}</div>`; }
}
