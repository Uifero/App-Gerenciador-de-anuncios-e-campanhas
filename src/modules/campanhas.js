// Aba Campanhas: estrutura de teste (IA ou manual), criativos vinculados, alerta de fadiga e checklist p/ o Meta.
import { db, COL } from '../core/storage.js';
import { gerarEstruturaCampanha } from '../core/ia.js';
import { obterConfig } from './configuracoes.js';
import { definirStatus } from './criativos.js';
import { STATUS_CAMPANHA } from '../lib/constantes.js';
import {
  esc, $, on, montar, cabecalho, iaNota, vazio, tag, dataBR, diasDesde, moeda, toast, modal, ocupado, lerForm, opcoes, copiar,
  listaDeLinhas, num, confirmar,
} from '../core/ui.js';

const COR_STATUS = { planejada: '', ativa: 'tag-ok', pausada: 'tag-warn', encerrada: 'tag-bad' };
const nomeStatus = (v) => (STATUS_CAMPANHA.find(([k]) => k === v) || [, v])[1];

/** URL de destino com parâmetros UTM básicos (fonte/campanha), só para o checklist — a pessoa pode ajustar na hora. */
function urlComUtm(url, nomeCampanha) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'meta'); u.searchParams.set('utm_medium', 'paid'); u.searchParams.set('utm_campaign', nomeCampanha || '');
    return u.toString();
  } catch { return url; } // URL sem protocolo válido: devolve como veio, sem travar o checklist
}

/** Checklist padrão (usado no modo manual e como complemento quando a IA não traz um). */
export function checklistPadrao(c, cliente) {
  const e = c.estruturaTeste || {};
  const pubs = (c.publicos || []).map((p) => p.nome).join(', ') || 'a definir';
  const destino = urlComUtm(c.urlDestino, c.nome);
  return [
    `Criar campanha "${c.nome}" com objetivo ${c.objetivo || 'Vendas'} (${cliente.estagio === 'novo' ? 'teste inicial' : 'otimização/escala'}).`,
    `Definir orçamento diário total: ${c.orcamentoDiario ? 'R$ ' + c.orcamentoDiario : 'a definir'}${c.orcamentoNota ? ' — ' + c.orcamentoNota : ''}.`,
    `Criar ${e.conjuntos || 'os conjuntos de anúncios'} com os públicos: ${pubs}.`,
    `Subir os criativos aprovados (${(c.criativos || []).length}) ${e.criativosPorConjunto ? '— ' + e.criativosPorConjunto : 'em conjuntos separados para testar cada ângulo'}.`,
    destino ? `Conferir pixel/evento de conversão. URL de destino (já com UTM): ${destino}` : 'Conferir pixel/evento de conversão e URL de destino com parâmetros UTM (nenhum site publicado ainda para sugerir o link).',
    `Deixar rodar ${e.duracaoDias || 3}+ dias antes de mexer${e.criterioDecisao ? '. Critério: ' + e.criterioDecisao : ''}.`,
    'Marcar cada criativo como "em uso" aqui no app para acompanhar a fadiga.',
  ];
}
const checklistFinal = (c, cliente) => (c.checklistMeta?.length ? c.checklistMeta : checklistPadrao(c, cliente));
const textoChecklist = (c, cliente) => `CHECKLIST — ${c.nome}\n` + checklistFinal(c, cliente).map((t, i) => `${i + 1}. ${t}`).join('\n');

/** Site publicado do cliente, se houver: custom (link salvo) ou pacote de plataforma (plataforma configurada + link salvo). */
export function siteDestino(sites) {
  const site = sites.find((s) => s.linkPublicado);
  return site ? { url: site.linkPublicado, modo: site.modo } : null;
}

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [campanhas, criativos, sites, cfg] = await Promise.all([
    db.listar(COL.campanhas, { clienteId: cliente.id }), db.listar(COL.criativos, { clienteId: cliente.id }),
    db.listar(COL.sites, { clienteId: cliente.id }), obterConfig(),
  ]);
  const destino = siteDestino(sites);
  const fadigados = criativos.filter((c) => c.status === 'em_uso' && (diasDesde(c.emUsoDesde) ?? 0) >= cfg.diasFadiga);

  root.innerHTML = `${cabecalho('Campanhas', 'Estrutura de teste, públicos e orçamento — pronta para replicar no Gerenciador de Anúncios do Meta.',
    '<button class="btn-primary" data-nova title="Cria uma campanha nova, com IA ou manualmente"><i class="fa-solid fa-plus"></i> Nova campanha</button>')}
    ${fadigados.length ? `<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i>
      <b>Alerta de fadiga:</b> ${fadigados.map((c) => `“${esc(c.nome)}” (${diasDesde(c.emUsoDesde)} dias no ar)`).join('; ')} — passou de ${cfg.diasFadiga} dias. Considere trocar ou renovar o criativo.</div>` : ''}
    ${campanhas.length ? `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${campanhas.map((c) => `<button data-abrir="${c.id}" class="card text-left transition hover:border-indigo-400 hover:shadow-md">
      <div class="flex items-start justify-between gap-2"><h3 class="font-semibold">${esc(c.nome)}</h3>${tag(nomeStatus(c.status), COR_STATUS[c.status])}</div>
      <p class="caption mt-1">${esc(c.resumo || c.objetivo || '')}</p>
      <div class="mt-3 flex flex-wrap gap-1">${tag(moeda(c.orcamentoDiario) + '/dia')}${tag((c.criativos || []).length + ' criativos')}${(c.publicos || []).slice(0, 2).map((p) => tag(p.nome, 'tag-info')).join('')}${c.origem === 'ia' ? tag('estrutura por IA', 'tag-info') : ''}</div>
      <p class="hint mt-2">${dataBR(c.criadoEm)}</p></button>`).join('')}</div>`
      : vazio('bullseye', 'Nenhuma campanha ainda', 'Crie a primeira: a estrutura sai pronta com públicos, orçamento e plano de teste.')}`;

  // ---------- nova campanha ----------
  on(root, 'click', '[data-nova]', () => {
    const m = modal('Nova campanha', `<form id="fn" class="space-y-3">
      <p class="caption">${cliente.estagio === 'novo' ? 'Cliente novo: a estrutura será de primeiro teste.' : 'Cliente rodando: a estrutura considera o histórico dele.'}</p>
      <div><label class="label">Nome *</label><input class="input" name="nome" placeholder="Ex.: Teste de ângulos — Legging"></div>
      <div class="grid gap-3 sm:grid-cols-2"><div><label class="label">Objetivo</label><input class="input" name="objetivo" value="Vendas"></div>
        <div><label class="label">Orçamento diário (R$)</label><input class="input" type="number" step="0.01" name="orcamento" value="${esc(cliente.historico?.orcamentoDiario)}"></div></div>
      <div><label class="label">URL de destino</label><input class="input" name="urlDestino" value="${esc(destino?.url || '')}" placeholder="https://…">
        ${destino ? `<p class="hint">Preenchido com o site publicado deste cliente (${destino.modo === 'custom' ? 'site personalizado' : 'pacote de plataforma'}). Ajuste se quiser apontar para outra página.</p>`
          : `<p class="hint text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i> Nenhum site publicado ainda para este cliente — preencha manualmente ou publique um link na aba Site/Loja.</p>`}</div>
      <details class="rounded-lg border border-slate-200 p-3"><summary class="cursor-pointer text-sm font-medium text-slate-600">Estrutura manual (usada no botão "sem IA")</summary>
        <div class="mt-3 space-y-3"><div><label class="label">Públicos (um por linha)</label><textarea class="input" rows="3" name="publicos" placeholder="Interesse fitness feminino&#10;Lookalike 1% compradores"></textarea></div>
          <div class="grid gap-3 sm:grid-cols-2"><div><label class="label">Conjuntos de anúncios</label><input class="input" name="conjuntos" placeholder="Ex.: 3 conjuntos, 1 por público"></div>
            <div><label class="label">Duração do teste (dias)</label><input class="input" type="number" name="duracao" value="3"></div></div>
          <div><label class="label">Critério de decisão</label><input class="input" name="criterio" placeholder="Ex.: pausar quem gastar 2x o CPA alvo sem venda"></div></div></details>
      <div class="flex flex-wrap gap-2"><button class="btn-ia" type="submit" data-modo="ia"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar estrutura com IA</button>
        <button class="btn-ghost" type="submit" data-modo="manual">Criar sem IA</button></div></form>`);
    on(m.el, 'submit', '#fn', async (f, ev) => {
      ev.preventDefault();
      const btn = ev.submitter; const v = lerForm(f);
      if (!v.nome) return toast('Dê um nome à campanha.', 'erro');
      await ocupado(btn, async () => {
        const base = { clienteId: cliente.id, nome: v.nome, objetivo: v.objetivo, orcamentoDiario: num(v.orcamento), urlDestino: v.urlDestino || null, status: 'planejada', criativos: [] };
        if (btn.dataset.modo === 'ia') {
          const aprovados = criativos.filter((c) => ['aprovado', 'em_uso', 'pausado'].includes(c.status));
          const e = await gerarEstruturaCampanha({ cliente, criativos: aprovados, objetivo: v.objetivo, orcamentoDiario: v.orcamento });
          await db.criar(COL.campanhas, {
            ...base, origem: 'ia', resumo: e.resumo || '', publicos: e.publicos || [], estruturaTeste: e.estruturaTeste || {},
            orcamentoDiario: num(e.orcamento?.diario) ?? base.orcamentoDiario, orcamentoNota: e.orcamento?.distribuicao || '', checklistMeta: e.checklistMeta || [],
          });
          toast('A IA montou a estrutura. Revise os detalhes na campanha.');
        } else {
          await db.criar(COL.campanhas, {
            ...base, origem: 'manual', resumo: '',
            publicos: listaDeLinhas(v.publicos).map((nome) => ({ nome, descricao: '' })),
            estruturaTeste: { conjuntos: v.conjuntos, duracaoDias: num(v.duracao), criterioDecisao: v.criterio }, checklistMeta: [],
          });
          toast('Campanha criada.');
        }
        m.fechar(); recarregar();
      });
    });
  });

  on(root, 'click', '[data-abrir]', (b) => detalhe(campanhas.find((c) => c.id === b.dataset.abrir), cliente, criativos, cfg, recarregar));
});

// ---------- detalhe ----------
function detalhe(c, cliente, criativos, cfg, recarregar) {
  const m = modal(c.nome, '<div id="d"></div>', { largo: true });
  const alvo = $('#d', m.el);
  const doCli = (id) => criativos.find((x) => x.id === id);

  const desenhar = () => {
    const e = c.estruturaTeste || {};
    const disponiveis = criativos.filter((x) => ['aprovado', 'em_uso', 'pausado'].includes(x.status) && !(c.criativos || []).some((k) => k.id === x.id));
    alvo.innerHTML = `
    ${c.origem === 'ia' ? iaNota('Estrutura criada pela IA a partir do perfil do cliente e do estágio dele. Ajuste o que quiser abaixo.') : ''}
    ${c.resumo ? `<p class="mt-2 text-sm">${esc(c.resumo)}</p>` : ''}
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div class="card"><h4 class="mb-1 text-sm font-semibold">Públicos</h4>${(c.publicos || []).length ? `<ul class="list-disc pl-5 text-sm">${c.publicos.map((p) => `<li><b>${esc(p.nome)}</b>${p.descricao ? ' — ' + esc(p.descricao) : ''}</li>`).join('')}</ul>` : '<p class="hint">Nenhum público definido.</p>'}</div>
      <div class="card"><h4 class="mb-1 text-sm font-semibold">Orçamento e teste</h4><p class="text-sm">Diário: <b>${moeda(c.orcamentoDiario)}</b></p>
        ${c.orcamentoNota ? `<p class="text-sm">${esc(c.orcamentoNota)}</p>` : ''}
        <p class="text-sm">${e.campanhas ? `Campanhas: ${esc(e.campanhas)} · ` : ''}${e.conjuntos ? `Conjuntos: ${esc(e.conjuntos)}` : ''}</p>
        ${e.duracaoDias ? `<p class="text-sm">Duração: ${esc(e.duracaoDias)} dias</p>` : ''}${e.criterioDecisao ? `<p class="text-sm">Decisão: ${esc(e.criterioDecisao)}</p>` : ''}</div></div>

    <div class="mt-3"><label class="label">URL de destino</label><input class="input" data-url-destino value="${esc(c.urlDestino || '')}" placeholder="https://…">
      <p class="hint">${c.urlDestino ? 'Usada no checklist abaixo, já com parâmetros UTM.' : 'Sem link ainda — publique o site do cliente ou preencha manualmente.'}</p></div>

    <div class="mt-4"><h4 class="mb-2 text-sm font-semibold">Criativos desta campanha</h4>
      ${(c.criativos || []).length ? `<div class="space-y-2">${c.criativos.map((k) => {
        const cr = doCli(k.id); if (!cr) return '';
        const dias = cr.status === 'em_uso' ? diasDesde(cr.emUsoDesde) : null; const fadiga = dias != null && dias >= cfg.diasFadiga;
        return `<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
          <span><b>${esc(cr.nome)}</b> ${cr.emUsoDesde ? tag('início ' + dataBR(k.inicio || cr.emUsoDesde), 'tag-ok') : tag('ainda não subiu')} ${fadiga ? tag(`fadiga · ${dias} dias`, 'tag-bad') : ''}</span>
          <span class="flex gap-1">${cr.status !== 'em_uso' ? `<button class="btn-primary btn-sm" data-uso="${cr.id}" title="Registra a data de início e passa a contar a fadiga">Marcar em uso</button>` : `<button class="btn-ghost btn-sm" data-pausar="${cr.id}">Pausar</button>`}
          <button class="btn-danger btn-sm" data-tirar="${cr.id}" title="Remover da campanha"><i class="fa-solid fa-xmark"></i></button></span></div>`;
      }).join('')}</div>` : '<p class="hint">Nenhum criativo vinculado ainda.</p>'}
      ${disponiveis.length ? `<div class="mt-2 flex gap-2"><select class="input" data-add>${'<option value="">Adicionar criativo aprovado…</option>' + disponiveis.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select></div>`
        : '<p class="hint mt-2">Só criativos aprovados (checklist completo) podem ser vinculados.</p>'}</div>

    <div class="mt-4 card"><div class="mb-2 flex items-center justify-between"><h4 class="text-sm font-semibold">Checklist para o Gerenciador de Anúncios do Meta</h4>
      <button class="btn-primary btn-sm" data-copiar><i class="fa-solid fa-copy"></i> Copiar checklist</button></div>
      <ol class="list-decimal space-y-1 pl-5 text-sm">${checklistFinal(c, cliente).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>

    <div class="mt-4 flex flex-wrap items-end justify-between gap-2"><div><label class="label">Status da campanha</label>
      <select class="input" data-status>${opcoes(STATUS_CAMPANHA, c.status)}</select></div>
      <button class="btn-danger btn-sm" data-apagar><i class="fa-solid fa-trash"></i> Apagar campanha</button></div>`;
  };
  desenhar();

  const salvar = async (patch) => { await db.atualizar(COL.campanhas, c.id, patch); Object.assign(c, patch); desenhar(); recarregar(); };

  on(alvo, 'change', '[data-add]', async (s) => { if (s.value) await salvar({ criativos: [...(c.criativos || []), { id: s.value, inicio: null }] }); });
  on(alvo, 'click', '[data-tirar]', (b) => salvar({ criativos: c.criativos.filter((k) => k.id !== b.dataset.tirar) }));
  on(alvo, 'click', '[data-uso]', async (b) => {
    const cr = doCli(b.dataset.uso);
    await definirStatus(cr, 'em_uso');
    await salvar({ criativos: c.criativos.map((k) => (k.id === cr.id ? { ...k, inicio: cr.emUsoDesde } : k)) });
    toast('Marcado em uso. A data de início foi registrada.');
  });
  on(alvo, 'click', '[data-pausar]', async (b) => { await definirStatus(doCli(b.dataset.pausar), 'pausado'); desenhar(); recarregar(); });
  on(alvo, 'click', '[data-copiar]', () => copiar(textoChecklist(c, cliente)));
  on(alvo, 'change', '[data-url-destino]', (i) => salvar({ urlDestino: i.value.trim() || null }));
  on(alvo, 'change', '[data-status]', (s) => salvar({ status: s.value }));
  on(alvo, 'click', '[data-apagar]', async () => {
    if (!(await confirmar('Apagar esta campanha?', 'Apagar'))) return;
    await db.remover(COL.campanhas, c.id); m.fechar(); recarregar(); toast('Campanha apagada.');
  });
}
