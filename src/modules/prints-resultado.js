// Aba Campanhas: "Enviar prints de resultado", revisão dos números ao lado do print, comparação WhatsApp x Site no
// mesmo período e "Plano de otimização" (Frentes 3 e 4). O print fica em Materiais do cliente (origem print_resultado:
// material INTERNO, nunca vai para o site nem para link de aprovação) e o registro em gcc_prints_resultado. Os números
// lidos NUNCA viram resultado sozinhos: só as linhas que o operador confirma na revisão.
import { db, COL } from '../core/storage.js';
import { analisesDoTipo } from '../lib/analises.js';
import { lerPrintsResultado } from '../core/ia.js';
import { salvarMaterial, hashArquivo } from '../lib/materiais.js';
import { prepararImagem } from './diagnostico.js';
import { normalizarLeituraPrints, avisoPeriodos, printDuplicado, vincularLinha, linhaParaResultado, CAMPOS_PRINT, TIPOS_PRINT, AVISO_PESSOAL } from '../lib/prints-resultado.js';
import { compararDestinos, faixa, textoPeriodo, nomeDestino } from '../lib/destinos.js';
import { acoesParaTarefas } from '../lib/recomendacao.js';
import { planoDeOtimizacao } from './analise-anuncio.js';
import { itemHtml, fontesUsadasHtml } from './itens-analise.js';
import { esc, $, on, toast, ocupado, modal, campoArquivo, dataBR, tag, mostrarResultado, confirmar } from '../core/ui.js';

export const ORIGEM_PRINT_RESULTADO = 'print_resultado';
const MAX_POR_LEITURA = 6;
const arquivos = new Map(); // printId -> File enviado nesta sessão (para a IA ler sem baixar de novo)
const rascunhos = new Map(); // printId -> leitura em revisão (com as edições do operador), até salvar

const fmt = (v, pre = '', suf = '') => (v == null ? '—' : `${pre}${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suf}`);
const num = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Imagem do print para a IA: o arquivo desta sessão ou o guardado (pode falhar se o Storage bloquear a leitura direta). */
async function imagemParaIA(p) {
  let fonte = arquivos.get(p.id);
  if (!fonte) {
    const r = await fetch(p.url).catch(() => null);
    if (!r?.ok) throw new Error(`Não consegui abrir o print "${p.nome}" guardado. Envie o mesmo print de novo nesta tela para a IA ler (ele não duplica).`);
    fonte = await r.blob();
  }
  const { media_type, data } = await prepararImagem(fonte, 1568, 0.88); // mesmo tratamento das imagens do diagnóstico
  return { media_type, data };
}

function tabelaComparacao(c) {
  const linha = (rot, k, f) => `<tr class="border-t border-slate-100"><td class="py-1 pr-2 text-slate-600">${rot}</td><td data-cmp-whatsapp="${k}">${f(c.whatsapp[k])}</td><td data-cmp-site="${k}">${f(c.site[k])}</td></tr>`;
  const r$ = (v) => fmt(v, 'R$ '), pct = (v) => fmt(v, '', '%'), x = (v) => fmt(v, '', 'x');
  return `<table class="mt-2 w-full text-sm" data-tabela-comparacao><thead class="text-left text-xs uppercase text-slate-500"><tr><th></th><th>WhatsApp</th><th>Site</th></tr></thead><tbody>
    ${linha('Registros', 'registros', (v) => fmt(v))}${linha('Gasto', 'gasto', r$)}${linha('Conversas', 'conversas', (v) => fmt(v))}${linha('Custo por conversa', 'custoConversa', r$)}
    ${linha('Vendas', 'vendas', (v) => fmt(v))}${linha('Custo por venda', 'custoVenda', r$)}${linha('ROAS', 'roas', x)}${linha('Taxa de conversão', 'taxaConversao', pct)}${linha('Ticket', 'ticket', r$)}</tbody></table>
    <p class="text-xs text-slate-500">Período WhatsApp: ${esc(textoPeriodo(c.periodos.whatsapp))} · Site: ${esc(textoPeriodo(c.periodos.site))}. Conversão no WhatsApp = vendas ÷ conversas; no site = compras ÷ cliques.</p>
    ${c.avisoPeriodo ? `<p class="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-aviso-periodo><i class="fa-solid fa-triangle-exclamation"></i> ${esc(c.avisoPeriodo)}</p>` : ''}
    ${c.mensagem ? `<p class="mt-1 text-sm ${c.nivel === 'venda' ? '' : 'text-amber-800'}" data-mensagem-comparacao>${esc(c.mensagem)}</p>` : ''}
    ${c.ondeVerba ? `<p class="mt-1 rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800" data-onde-verba><b>Onde colocar a próxima verba:</b> ${c.ondeVerba.destino === 'empate' ? 'manter a divisão' : esc(nomeDestino(c.ondeVerba.destino))} — ${esc(c.ondeVerba.motivo)}</p>` : ''}`;
}

function revisaoHtml(p, leitura, { campanhas, criativos, produtos }) {
  const sel = (nome, itens, atual, idx) => `<select class="input !py-1 text-xs" data-vinculo="${nome}" data-linha="${idx}"><option value="">${nome === 'campanhaId' ? 'campanha: não ligar' : nome === 'criativoId' ? 'criativo: não ligar' : 'produto: não ligar'}</option>${itens.map((x) => `<option value="${esc(x.id)}" ${x.id === atual ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>`;
  const campo = (l, i, k, rot) => `<label class="text-[11px] text-slate-600">${esc(rot)}<input class="input !py-1 text-sm" inputmode="decimal" data-valor="${k}" data-linha="${i}" value="${l[k] == null ? '' : esc(l[k])}"></label>`;
  return `<div class="mt-3 grid gap-3 rounded-lg border border-slate-200 p-2 md:grid-cols-[180px_1fr]" data-revisao-print="${esc(p.id)}">
    <div><button type="button" data-ver-print="${esc(p.id)}" title="Ver o print maior"><img src="${esc(p.url)}" alt="Print ${esc(p.nome)}" class="max-h-72 w-full rounded border border-slate-200 object-contain"></button>
      <p class="mt-1 text-xs">${tag(TIPOS_PRINT[leitura.tipo] || leitura.tipo, leitura.dadosPessoais ? 'tag-warn' : '')}</p>
      <div class="mt-1 grid grid-cols-2 gap-1 text-[11px]"><label>De<input type="date" class="input !py-1 text-xs" data-periodo="inicio" value="${esc(leitura.periodo?.inicio || '')}"></label><label>Até<input type="date" class="input !py-1 text-xs" data-periodo="fim" value="${esc(leitura.periodo?.fim || '')}"></label></div></div>
    <div class="min-w-0">${leitura.dadosPessoais ? `<p class="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-print-pessoal><i class="fa-solid fa-user-shield"></i> ${esc(AVISO_PESSOAL)}</p>` : ''}
      ${leitura.observacao && !leitura.dadosPessoais ? `<p class="text-xs text-slate-600">${esc(leitura.observacao)}</p>` : ''}
      ${leitura.linhas.map((l, i) => `<div class="mt-2 rounded border ${l.confirmada ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'} p-2" data-linha-print="${i}">
        <div class="flex flex-wrap items-center gap-2"><label class="flex items-center gap-1 text-sm font-medium"><input type="checkbox" data-confirmar-linha="${i}" ${l.confirmada ? 'checked' : ''}> Conferi, salvar esta linha</label>
          <span class="text-xs text-slate-600">${esc([l.campanha, l.conjunto, l.anuncio].filter(Boolean).join(' › ') || 'sem nome')}</span>
          <select class="input !w-auto !py-1 text-xs" data-valor="destino" data-linha="${i}"><option value="">destino?</option><option value="whatsapp" ${l.destino === 'whatsapp' ? 'selected' : ''}>WhatsApp</option><option value="site" ${l.destino === 'site' ? 'selected' : ''}>Site</option></select></div>
        <div class="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-6">${CAMPOS_PRINT.map(([k, rot]) => campo(l, i, k, rot)).join('')}</div>
        ${l.destino === 'whatsapp' ? `<div class="mt-1 grid grid-cols-2 gap-1 rounded bg-emerald-50 p-1 sm:grid-cols-3" data-vendas-whats="${i}"><p class="col-span-full text-[11px] text-emerald-800">O Meta não vê venda fechada na conversa: anote aqui (ou depois, em Resultados).</p>${campo(l, i, 'vendasConversa', 'Vendas fechadas na conversa')}${campo(l, i, 'faturamentoConversa', 'Faturamento dessas vendas (R$)')}</div>` : ''}
        <div class="mt-1 grid gap-1 sm:grid-cols-3">${sel('campanhaId', campanhas, l.campanhaId, i)}${sel('criativoId', criativos, l.criativoId, i)}${sel('produtoId', produtos, l.produtoId, i)}</div></div>`).join('')}
      <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-ghost btn-sm" data-add-linha="${esc(p.id)}"><i class="fa-solid fa-plus"></i> Adicionar linha à mão</button></div></div></div>`;
}

/** Monta a seção. `aoMudar` = redesenhar a área (ex.: tarefas novas). */
export async function montarPrintsResultado(el, { cliente, aoMudar = () => {} }) {
  const f = { clienteId: cliente.id };
  const [prints, resultados, campanhas, criativos, produtos, analises] = await Promise.all([
    db.listar(COL.printsResultado, f).catch(() => []), db.listar(COL.resultados, f), db.listar(COL.campanhas, f).then((l) => l.filter((c) => c.status !== 'rascunho')),
    db.listar(COL.criativos, f), db.listar(COL.produtos, f).catch(() => []), db.listar(COL.analises, f).catch(() => []),
  ]);
  const pendentes = prints.filter((p) => p.status !== 'salvo');
  const planos = analisesDoTipo(analises, 'otimizacao');
  const fx = faixa(resultados);
  let intervalo = { inicio: fx?.inicio || '', fim: fx?.fim || '' };
  const vinc = { campanhas, criativos: criativos.filter((c) => !c.arquivado), produtos };

  el.innerHTML = `<section class="card mb-5 border-emerald-200" data-secao-prints>
    <h3 class="font-semibold"><i class="fa-solid fa-chart-column text-emerald-600"></i> Prints de resultado e WhatsApp x Site</h3>
    <p class="caption mt-1">Envie prints do Gerenciador de Anúncios (campanhas de WhatsApp e de site). A IA lê cada número e você confere ao lado do print antes de virar resultado. Os prints são material interno: nunca aparecem no site nem em link de aprovação; print de conversa com nome ou telefone não tem nada extraído.</p>
    <div class="mt-2 rounded-lg border-2 border-dashed border-slate-300 p-3" data-soltar>${campoArquivo({ attrs: 'data-enviar-prints', accept: 'image/png,image/jpeg,image/webp', multiple: true, icone: 'image', texto: 'Enviar prints de resultado', destaque: false, dica: 'Print da tabela do Gerenciador de Anúncios com as colunas de valor usado, resultados e custo, e o período visível.' })}</div>
    <div data-prints-pendentes class="mt-3"></div>
    <div data-revisao class="mt-2"></div>
    <div class="mt-4 rounded-lg border border-slate-200 p-3" data-comparacao-destinos><div class="flex flex-wrap items-end gap-2"><h4 class="mr-auto font-semibold">WhatsApp x Site (mesmo período)</h4>
      <label class="text-xs">De<input type="date" class="input !py-1" data-cmp-de value="${esc(intervalo.inicio)}"></label><label class="text-xs">Até<input type="date" class="input !py-1" data-cmp-ate value="${esc(intervalo.fim)}"></label></div>
      <div data-cmp-corpo></div></div>
    <div class="mt-4 rounded-lg border border-violet-200 p-3" data-plano-otimizacao><h4 class="font-semibold">Plano de otimização</h4>
      <p class="caption">Duas partes (WhatsApp e Site), até 5 ações cada, e onde colocar a próxima verba pelo custo por venda. Ação aceita vira tarefa; as de site também aparecem no "Montar site".</p>
      <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-ia" data-plano-ia><i class="fa-solid fa-wand-magic-sparkles"></i> Montar plano com IA</button><button type="button" class="btn-ghost" data-plano-sem-ia>Plano sem IA (só contas)</button></div>
      <div data-plano-resultado></div>
      ${planos.length ? `<details class="mt-2"><summary class="cursor-pointer text-sm text-slate-600">Planos anteriores (${planos.length})</summary>${planos.map((a) => `<button type="button" class="btn-ghost btn-sm w-full text-left" data-ver-plano="${esc(a.id)}">${dataBR(a.criadoEm)} · ${a.origem === 'ia' ? 'com IA' : 'sem IA'}${(a.aceitos || []).length ? ` · ${a.aceitos.length} tarefa(s) criada(s)` : ''}</button>`).join('')}</details>` : ''}</div></section>`;

  // ----- comparação -----
  const desenharComparacao = () => { $('[data-cmp-corpo]', el).innerHTML = tabelaComparacao(compararDestinos(resultados, intervalo)); };
  desenharComparacao();
  on(el, 'change', '[data-cmp-de], [data-cmp-ate]', () => { intervalo = { inicio: $('[data-cmp-de]', el).value, fim: $('[data-cmp-ate]', el).value }; desenharComparacao(); });

  // ----- prints pendentes -----
  const desenharPendentes = () => {
    $('[data-prints-pendentes]', el).innerHTML = pendentes.length ? `<p class="text-sm font-semibold">Prints esperando conferência (${pendentes.length})</p>
      <div class="mt-1 flex flex-wrap gap-2">${pendentes.map((p) => `<label class="w-28 text-center text-[11px]" data-print-pendente="${esc(p.id)}"><img src="${esc(p.url)}" alt="" class="h-20 w-28 rounded border border-slate-200 object-cover"><span class="flex items-center justify-center gap-1"><input type="checkbox" data-sel-print="${esc(p.id)}" checked> ${p.leitura ? 'lido' : 'não lido'}</span>${p.dadosPessoais ? '<span class="tag tag-warn">dado pessoal</span>' : ''}</label>`).join('')}</div>
      <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-ia btn-sm" data-ler-prints><i class="fa-solid fa-wand-magic-sparkles"></i> Ler os marcados com IA</button><button type="button" class="btn-ghost btn-sm" data-manual-prints>Conferir/preencher à mão</button><button type="button" class="btn-danger btn-sm" data-apagar-prints title="Apaga o print marcado (o arquivo sai de Materiais)" aria-label="Apaga o print marcado (o arquivo sai de Materiais)"><i class="fa-solid fa-trash"></i></button></div>` : '';
  };
  desenharPendentes();
  const marcados = () => pendentes.filter((p) => $(`[data-sel-print="${p.id}"]`, el)?.checked);

  // ----- revisão -----
  const desenharRevisao = () => {
    const emRevisao = pendentes.filter((p) => rascunhos.has(p.id));
    if (!emRevisao.length) { $('[data-revisao]', el).innerHTML = ''; return; }
    const leituras = emRevisao.map((p) => rascunhos.get(p.id));
    const aviso = avisoPeriodos(leituras);
    $('[data-revisao]', el).innerHTML = `<div class="rounded-lg border border-emerald-300 p-3" data-area-revisao><h4 class="font-semibold">Conferir antes de salvar</h4>
      <p class="caption">Nada foi salvo como resultado ainda. Confira cada número ao lado do print, corrija o que precisar, marque "Conferi" nas linhas certas e salve.</p>
      ${aviso ? `<p class="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-aviso-periodos><i class="fa-solid fa-triangle-exclamation"></i> ${esc(aviso)}</p>` : ''}
      ${emRevisao.map((p) => revisaoHtml(p, rascunhos.get(p.id), vinc)).join('')}
      <div class="mt-3 flex flex-wrap items-center gap-2"><button type="button" class="btn-primary" data-salvar-revisao><i class="fa-solid fa-floppy-disk"></i> Salvar as linhas conferidas como resultados</button><span class="hint !mt-0" data-contagem-conferidas></span></div></div>`;
    contar();
  };
  const contar = () => { const n = [...rascunhos.values()].reduce((s, l) => s + l.linhas.filter((x) => x.confirmada).length, 0); const c = $('[data-contagem-conferidas]', el); if (c) c.textContent = `${n} linha(s) conferida(s).`; };
  const prepararRascunho = (p, leitura) => {
    const l = { ...leitura, linhas: leitura.linhas.map((x) => ({ ...x, ...vincularLinha(x, vinc), confirmada: false })) };
    rascunhos.set(p.id, l);
  };
  const linhaDe = (inp) => { const id = inp.closest('[data-revisao-print]')?.dataset.revisaoPrint; return { id, l: rascunhos.get(id), i: Number(inp.dataset.linha ?? inp.dataset.confirmarLinha) }; };
  on(el, 'change', '[data-revisao] [data-valor]', (inp) => {
    const { id, l, i } = linhaDe(inp); if (!l) return;
    const k = inp.dataset.valor;
    l.linhas[i][k] = k === 'destino' ? inp.value : num(inp.value);
    if (k === 'destino') { desenharRevisao(); return; } // mostra/esconde as vendas do WhatsApp
    rascunhos.set(id, l);
  });
  on(el, 'change', '[data-revisao] [data-vinculo]', (s) => { const { l, i } = linhaDe(s); if (l) l.linhas[i][s.dataset.vinculo] = s.value || null; });
  on(el, 'change', '[data-revisao] [data-periodo]', (inp) => { const id = inp.closest('[data-revisao-print]').dataset.revisaoPrint, l = rascunhos.get(id); const p = { ...(l.periodo || {}) }; p[inp.dataset.periodo] = inp.value || null; l.periodo = p.inicio || p.fim ? { inicio: p.inicio || p.fim, fim: p.fim || p.inicio } : null; desenharRevisao(); });
  on(el, 'change', '[data-confirmar-linha]', (c) => { const { l, i } = linhaDe(c); if (!l) return; l.linhas[i].confirmada = c.checked; c.closest('[data-linha-print]').className = `mt-2 rounded border ${c.checked ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'} p-2`; contar(); });
  on(el, 'click', '[data-add-linha]', (b) => { const l = rascunhos.get(b.dataset.addLinha); l.linhas.push({ nivel: 'campanha', campanha: '', destino: '', confirmada: false }); desenharRevisao(); });
  on(el, 'click', '[data-ver-print]', (b) => { const p = prints.find((x) => x.id === b.dataset.verPrint); if (p) modal(`Print — ${p.nome}`, `<img src="${esc(p.url)}" alt="" class="mx-auto max-h-[75vh] rounded-lg">`, { largo: true }); });

  // ----- envio (sem duplicar) -----
  on(el, 'change', '[data-enviar-prints]', (inp) => ocupado(inp, async () => {
    const files = [...inp.files].filter((x) => x.type.startsWith('image/')); inp.value = '';
    let novos = 0, repetidos = 0;
    for (const file of files) {
      const hash = await hashArquivo(file);
      const ja = printDuplicado(hash, prints);
      if (ja) { repetidos++; arquivos.set(ja.id, file); continue; } // mesmo print: ignorado (só guarda o arquivo para a IA ler nesta sessão)
      const reduzida = await prepararImagem(file, 1400, 0.82);
      const blob = await (await fetch(reduzida.dataUrl)).blob();
      const mat = await salvarMaterial(cliente, blob, ORIGEM_PRINT_RESULTADO, { nomeOriginal: file.name, tamanho: file.size, interno: true, ...(hash ? { hashOriginal: hash } : {}) });
      const p = await db.criar(COL.printsResultado, { clienteId: cliente.id, hash, materialId: mat.id, url: mat.url, path: mat.path, nome: file.name, status: 'enviado' });
      prints.push(p); pendentes.push(p); arquivos.set(p.id, file); novos++;
    }
    desenharPendentes();
    const msg = `${novos} print(s) guardado(s)${repetidos ? `; ${repetidos} repetido(s) ignorado(s) (já tinham sido enviados)` : ''}. Agora leia com IA ou confira à mão.`;
    if (repetidos && !novos) toast(msg, 'erro'); else toast(msg);
    mostrarResultado($('[data-prints-pendentes]', el) || el, msg);
  }));
  on(el, 'click', '[data-ler-prints]', (b) => ocupado(b, async () => {
    const sel = marcados();
    if (!sel.length) throw new Error('Marque pelo menos um print.');
    if (sel.length > MAX_POR_LEITURA) throw new Error(`Leia no máximo ${MAX_POR_LEITURA} prints de cada vez.`);
    const imagens = [];
    for (const p of sel) imagens.push(await imagemParaIA(p));
    const leituras = normalizarLeituraPrints(await lerPrintsResultado({ cliente, imagens }), sel.length);
    for (const [i, p] of sel.entries()) {
      const leitura = leituras[i];
      await db.atualizar(COL.printsResultado, p.id, { leitura, status: 'lido', dadosPessoais: leitura.dadosPessoais, periodo: leitura.periodo }, { silencioso: true });
      Object.assign(p, { leitura, status: 'lido', dadosPessoais: leitura.dadosPessoais });
      prepararRascunho(p, leitura);
    }
    desenharPendentes(); desenharRevisao();
    mostrarResultado($('[data-area-revisao]', el), 'Pronto: confira os números ao lado de cada print e marque "Conferi" antes de salvar.');
  }));
  on(el, 'click', '[data-manual-prints]', () => {
    const sel = marcados(); if (!sel.length) return toast('Marque pelo menos um print.', 'erro');
    for (const p of sel) if (!rascunhos.has(p.id)) prepararRascunho(p, p.leitura || { tipo: 'outro', periodo: null, linhas: [{ nivel: 'campanha', campanha: '', destino: '' }], dadosPessoais: false, observacao: 'Preenchido à mão.' });
    desenharRevisao();
    mostrarResultado($('[data-area-revisao]', el), 'Preencha os números lendo o print ao lado.');
  });
  on(el, 'click', '[data-apagar-prints]', async (b) => {
    const sel = marcados(); if (!sel.length) return toast('Marque o print a apagar.', 'erro');
    if (!(await confirmar(`Apagar ${sel.length} print(s)? Resultados já salvos a partir deles continuam.`, 'Apagar'))) return;
    await ocupado(b, async () => {
      const { removerMaterial } = await import('../lib/materiais.js');
      for (const p of sel) {
        const m = p.materialId ? await db.obter(COL.materiais, p.materialId).catch(() => null) : null;
        if (m) await removerMaterial(cliente, m, { confirmado: true });
        await db.remover(COL.printsResultado, p.id); rascunhos.delete(p.id); arquivos.delete(p.id);
        pendentes.splice(pendentes.indexOf(p), 1); prints.splice(prints.indexOf(p), 1);
      }
      desenharPendentes(); desenharRevisao(); toast('Print(s) apagado(s).');
    });
  });
  on(el, 'click', '[data-salvar-revisao]', (b) => ocupado(b, async () => {
    const lotes = pendentes.filter((p) => rascunhos.has(p.id)).map((p) => ({ p, l: rascunhos.get(p.id) }));
    const total = lotes.reduce((s, x) => s + x.l.linhas.filter((y) => y.confirmada).length, 0);
    if (!total) throw new Error('Marque "Conferi" nas linhas que estão certas. Nada é salvo sem conferência.');
    const semDestino = lotes.some((x) => x.l.linhas.some((y) => y.confirmada && !y.destino));
    if (semDestino) throw new Error('Escolha o destino (WhatsApp ou Site) de cada linha conferida.');
    let salvos = 0;
    for (const { p, l } of lotes) {
      const ids = [];
      for (const linha of l.linhas.filter((y) => y.confirmada)) {
        const r = await db.criar(COL.resultados, linhaParaResultado(linha, { clienteId: cliente.id, periodo: l.periodo, printId: p.id, criativos, campanhas, oferta: String(cliente.marca?.ofertaAtiva || '').trim() || null }));
        resultados.push(r); ids.push(r.id); salvos++;
      }
      if (ids.length) {
        await db.atualizar(COL.printsResultado, p.id, { status: 'salvo', resultadosIds: [...(p.resultadosIds || []), ...ids], periodo: l.periodo || null, leitura: { ...l, linhas: l.linhas.map(({ confirmada, ...x }) => x) } }, { silencioso: true });
        rascunhos.delete(p.id); pendentes.splice(pendentes.indexOf(p), 1);
      }
    }
    desenharPendentes(); desenharRevisao(); desenharComparacao();
    toast(`${salvos} resultado(s) salvo(s) a partir dos prints.`);
    mostrarResultado($('[data-comparacao-destinos]', el), `${salvos} resultado(s) salvo(s). Comparação WhatsApp x Site atualizada.`);
  }));

  // ----- plano de otimização -----
  const desenharPlano = (a) => {
    const r = a.resultado || {};
    const ov = r.ondeVerba;
    $('[data-plano-resultado]', el).innerHTML = `<div class="mt-3" data-plano="${esc(a.id)}"><p class="text-xs text-slate-500">Plano de ${dataBR(a.criadoEm)} · ${a.origem === 'ia' ? 'com IA' : 'sem IA (regras do app)'}</p>
      ${r.resumo ? `<p class="font-medium">${esc(r.resumo)}</p>` : ''}
      ${r.comparacao?.avisoPeriodo ? `<p class="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(r.comparacao.avisoPeriodo)}</p>` : ''}
      ${r.comparacao?.mensagem ? `<p class="mt-1 text-sm text-amber-800">${esc(r.comparacao.mensagem)}</p>` : ''}
      <div class="mt-2 grid gap-3 lg:grid-cols-2">${['whatsapp', 'site'].map((area) => `<div data-parte-plano="${area}"><h5 class="font-semibold">${area === 'whatsapp' ? '<i class="fa-brands fa-whatsapp text-emerald-600"></i> WhatsApp' : '<i class="fa-solid fa-store text-indigo-600"></i> Site'}</h5>
        <ul class="mt-1 space-y-2">${(r[area] || []).map((it) => itemHtml(it, { jaAplicado: (a.aceitos || []).includes(it.id) })).join('') || '<li class="hint">Nenhuma ação.</li>'}</ul></div>`).join('')}</div>
      ${ov ? `<div class="mt-3 rounded border border-emerald-300 bg-emerald-50/50 p-2" data-plano-onde-verba><p class="font-semibold">Onde colocar a próxima verba: ${ov.destino === 'indefinido' ? 'ainda não dá para decidir' : ov.destino === 'empate' ? 'manter a divisão' : esc(nomeDestino(ov.destino))}</p>${itemHtml({ ...ov, id: 'onde_verba', tipo: '', titulo: '' }, { aceitavel: false })}</div>` : ''}
      ${fontesUsadasHtml(r.fontesUsadas)}
      <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-violet-200 pt-3"><button type="button" class="btn-primary" data-criar-tarefas="${esc(a.id)}"><i class="fa-solid fa-list-check"></i> Criar tarefas das ações aceitas</button><span class="hint !mt-0">Só as marcadas viram tarefa.</span></div></div>`;
  };
  if (planos[0]) desenharPlano(planos[0]);
  const rodarPlano = (b, semIA) => ocupado(b, async () => {
    const { analise } = await planoDeOtimizacao(cliente, { semIA, intervalo });
    planos.unshift(analise); desenharPlano(analise);
    mostrarResultado($('[data-plano-resultado]', el), `Pronto: plano ${semIA ? 'sem IA' : 'com IA'} abaixo. Marque as ações que aceita e crie as tarefas.`);
  });
  on(el, 'click', '[data-plano-ia]', (b) => rodarPlano(b, false));
  on(el, 'click', '[data-plano-sem-ia]', (b) => rodarPlano(b, true));
  on(el, 'click', '[data-ver-plano]', (b) => { const a = planos.find((x) => x.id === b.dataset.verPlano); if (a) desenharPlano(a); });
  on(el, 'click', '[data-criar-tarefas]', (b) => ocupado(b, async () => {
    const a = planos.find((x) => x.id === b.dataset.criarTarefas); if (!a) return;
    const ok = [...el.querySelectorAll(`[data-plano="${a.id}"] [data-aceitar]:checked:not(:disabled)`)].map((c) => c.dataset.aceitar);
    if (!ok.length) throw new Error('Marque pelo menos uma ação (nada vira tarefa sem você aceitar).');
    const tarefas = acoesParaTarefas(a.resultado, ok, { clienteId: cliente.id, analiseId: a.id });
    for (const t of tarefas) await db.criar(COL.tarefas, t);
    a.aceitos = [...new Set([...(a.aceitos || []), ...ok])];
    await db.atualizar(COL.analises, a.id, { aceitos: a.aceitos });
    const site = tarefas.filter((t) => t.area === 'site').length;
    toast(`${tarefas.length} tarefa(s) criada(s)${site ? `; ${site} também no "Montar site"` : ''}.`);
    aoMudar();
  }));
}
