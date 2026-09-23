// Aba Referências: swipe file de anúncios de mercado — cadastro manual ou busca web com IA, análise estratégica e sinal.
import { db, COL } from '../core/storage.js';
import { buscarReferencias, analisarReferencia } from '../core/ia.js';
import { obterConfig, classificarSinal } from './configuracoes.js';
import { esc, $, on, montar, cabecalho, iaNota, vazio, tag, dataBR, toast, ocupado, lerForm, num, modal, campoArquivo } from '../core/ui.js';

const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Antes de gastar tokens numa busca nova: há referências salvas do MESMO nicho nos últimos N dias (de qualquer cliente)?
 * Se houver, oferece usá-las. Retorna 'buscar' (segue com a busca) ou 'usou' (o usuário optou pelas salvas).
 */
async function oferecerReuso(cliente, cfg, aoCopiar) {
  const dias = Number(cfg.diasReutilizarBusca) || 0;
  if (!dias) return 'buscar';
  const corte = Date.now() - dias * 864e5;
  const alvo = norm(cliente.nicho);
  const recentes = (await db.listar(COL.referencias)).filter((r) => norm(r.nicho) === alvo && new Date(r.criadoEm).getTime() >= corte);
  if (!recentes.length) return 'buscar';
  const jaTem = (r) => recentes.some((d) => d.clienteId === cliente.id && ((d.link && d.link === r.link) || d.titulo === r.titulo));
  const copiaveis = recentes.filter((r) => r.clienteId !== cliente.id && !jaTem(r));
  const deste = recentes.filter((r) => r.clienteId === cliente.id).length;
  return new Promise((ok) => {
    const m = modal('Já existem referências recentes deste nicho', `<div class="space-y-3">
      <p class="text-sm">Encontrei <b>${recentes.length}</b> referência(s) de "<b>${esc(cliente.nicho)}</b>" salvas nos últimos ${dias} dias${deste ? ` (${deste} já estão neste cliente)` : ''}. Uma busca nova gasta tokens de IA e busca na web.</p>
      <div class="flex flex-wrap gap-2">
        ${copiaveis.length ? `<button class="btn-primary" data-copiar title="Copia as referências de outros clientes para este, sem custo de IA"><i class="fa-solid fa-copy"></i> Usar as salvas (copiar ${copiaveis.length} para este cliente)</button>`
          : `<button class="btn-primary" data-ver><i class="fa-solid fa-eye"></i> Usar as que já estão salvas</button>`}
        <button class="btn-ghost" data-buscar-mesmo title="Faz a busca na web mesmo assim (consome tokens)"><i class="fa-solid fa-magnifying-glass"></i> Buscar mesmo assim</button></div></div>`);
    let decidido = false;
    const fim = (v) => { if (!decidido) { decidido = true; ok(v); } m.fechar(); };
    on(m.el, 'click', '[data-buscar-mesmo]', () => fim('buscar'));
    on(m.el, 'click', '[data-ver]', () => fim('usou'));
    on(m.el, 'click', '[data-copiar]', async (b) => {
      await ocupado(b, async () => {
        await Promise.all(copiaveis.map((r) => { const { id, clienteId, criadoEm, atualizadoEm, ...resto } = r; return db.criar(COL.referencias, { ...resto, clienteId: cliente.id, copiadaDe: clienteId }); }));
        toast(`${copiaveis.length} referência(s) copiadas para este cliente.`);
        aoCopiar?.();
      });
      fim('usou');
    });
    on(m.el, 'click', '[data-fechar]', () => { if (!decidido) { decidido = true; ok('usou'); } }); // fechar no X = cancelar a busca
    m.el.addEventListener('mousedown', (e) => { if (e.target === m.el && !decidido) { decidido = true; ok('usou'); } });
  });
}

const COR_SINAL = { forte: 'tag-ok', moderado: 'tag-warn', fraco: '' };

function blocoAnalise(a) {
  if (!a) return '<p class="hint">Sem análise estratégica ainda.</p>';
  return `<dl class="mt-2 grid gap-1 text-sm"><div><dt class="inline font-semibold">Ângulo/gatilho: </dt><dd class="inline">${esc(a.angulo)}</dd></div>
    <div><dt class="inline font-semibold">Framework: </dt><dd class="inline">${esc(a.framework)}</dd></div>
    <div><dt class="inline font-semibold">Formato: </dt><dd class="inline">${esc(a.formato)}</dd></div>
    <div><dt class="inline font-semibold">Público provável: </dt><dd class="inline">${esc(a.publico)}</dd></div>
    <div><dt class="inline font-semibold">O que replicar: </dt><dd class="inline">${esc(a.replicar)}</dd></div></dl>`;
}

export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [refs, cfg] = await Promise.all([db.listar(COL.referencias, { clienteId: cliente.id }), obterConfig()]);

  const cartao = (r) => `<div class="card">
    <div class="flex items-start justify-between gap-2"><h3 class="font-semibold leading-tight">${esc(r.titulo || 'Anúncio de referência')}</h3>
      ${r.sinal ? tag('sinal ' + r.sinal, COR_SINAL[r.sinal]) : tag('sinal n/d')}</div>
    <div class="mt-2 flex flex-wrap gap-1">${r.empresa ? tag(r.empresa) : ''}${r.categoria ? tag(r.categoria, 'tag-info') : ''}${tag(r.origem === 'busca' ? 'busca de mercado' : 'manual')}
      ${r.diasNoAr != null ? tag(r.diasNoAr + ' dias no ar') : ''}${r.nicho ? tag(r.nicho) : ''}</div>
    ${r.texto ? `<p class="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">${esc(r.texto)}</p>` : ''}
    ${r.imagemUrl ? `<img src="${esc(r.imagemUrl)}" alt="Anúncio" class="mt-2 max-h-40 rounded-lg" loading="lazy">` : ''}
    ${blocoAnalise(r.analise)}
    <p class="hint mt-2">${r.link ? `<a class="text-indigo-600" href="${esc(r.link)}" target="_blank" rel="noopener">abrir anúncio</a> · ` : ''}${dataBR(r.criadoEm)}</p>
    <div class="mt-2 flex flex-wrap gap-1">
      <button class="btn-primary btn-sm" data-criativo="${r.id}" title="Abre a aba Criativos já usando esta referência como ponto de partida"><i class="fa-solid fa-wand-magic-sparkles"></i> Criar criativo a partir desta</button>
      ${!r.analise ? `<button class="btn-ia btn-sm" data-analisar="${r.id}" title="A IA identifica ângulo, framework, público e o que vale replicar">Analisar o que replicar (IA)</button>` : ''}
      <button class="btn-danger btn-sm" data-apagar="${r.id}" title="Apagar esta referência"><i class="fa-solid fa-trash"></i></button></div></div>`;

  root.innerHTML = `${cabecalho('Referências', `Anúncios de concorrentes que estão dando certo, com a análise do que copiar. As salvas alimentam a geração de criativos. "Sinal" = há quanto tempo o anúncio está no ar (forte: ${cfg.cortes.forte}+ dias, moderado: ${cfg.cortes.moderado}+): quem paga por um anúncio por muito tempo costuma estar vendendo.`,
    `<button class="btn-ia" data-buscar title="Pesquisa na web anúncios ativos de empresas de destaque no nicho (mínimo ${cfg.diasMinimosReferencia} dias no ar)"><i class="fa-solid fa-magnifying-glass"></i> Buscar exemplos de mercado</button>
     <button class="btn-ghost" data-manual title="Cadastre um anúncio de concorrente que você encontrou">Cadastrar anúncio que encontrei</button>`)}
    <div id="painel"></div>
    ${refs.length ? `<div class="grid gap-3 lg:grid-cols-2">${refs.map(cartao).join('')}</div>`
      : vazio('bookmark', 'Seu swipe file está vazio', 'Busque exemplos de mercado ou cadastre um anúncio que você achou bom.')}`;

  const salvar = async (r) => {
    const sinal = classificarSinal(r.diasNoAr, cfg);
    return db.criar(COL.referencias, { clienteId: cliente.id, nicho: cliente.nicho, sinal, origem: 'manual', ...r });
  };

  // ----- manual -----
  on(root, 'click', '[data-manual]', () => {
    $('#painel', root).innerHTML = `<form id="fm" class="card mb-5 space-y-3">
      <p class="caption">Cole o link e/ou o texto do anúncio. Se souber há quantos dias está no ar, informe para classificar o sinal.</p>
      <div class="grid gap-3 sm:grid-cols-2"><div><label class="label">Título/descrição *</label><input class="input" name="titulo"></div>
        <div><label class="label">Empresa</label><input class="input" name="empresa"></div>
        <div><label class="label">Link do anúncio</label><input class="input" name="link" placeholder="https://…"></div>
        <div><label class="label">Dias no ar</label><input class="input" type="number" min="0" name="diasNoAr"></div>
        <div><label class="label">Categoria/ângulo</label><input class="input" name="categoria"></div>
        <div><label class="label">Imagem do anúncio (opcional)</label>${campoArquivo({ attrs: 'name="imagem"', accept: 'image/*', icone: 'image', texto: 'Enviar print do anúncio (até 400 KB)', destaque: false })}</div></div>
      <div><label class="label">Texto do anúncio</label><textarea class="input" rows="4" name="texto"></textarea></div>
      <div class="flex gap-2"><button class="btn-primary" type="submit" data-modo="salvar">Salvar</button>
        <button class="btn-ia" type="submit" data-modo="analisar" title="Salva e pede à IA a análise estratégica">Salvar e analisar com IA</button></div></form>`;
  });
  on(root, 'submit', '#fm', async (f, ev) => {
    ev.preventDefault();
    const btn = ev.submitter || f.querySelector('button');
    const v = lerForm(f);
    if (!v.titulo && !v.texto && !v.link) return toast('Informe ao menos título, texto ou link.', 'erro');
    await ocupado(btn, async () => {
      const r = { titulo: v.titulo || v.link || 'Anúncio', empresa: v.empresa || '', link: v.link || '', texto: v.texto || '', categoria: v.categoria || '', diasNoAr: num(v.diasNoAr) };
      if (v.imagem && v.imagem.size) {
        // Imagem pequena guardada como data URL no documento (evita depender do Storage para um print).
        if (v.imagem.size > 400 * 1024) throw new Error('Imagem grande demais (máx. 400 KB). Reduza o print.');
        r.imagemUrl = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(v.imagem); });
      }
      const criado = await salvar(r);
      if (btn.dataset.modo === 'analisar') {
        const analise = await analisarReferencia({ cliente, ref: r });
        await db.atualizar(COL.referencias, criado.id, { analise });
      }
      toast('Referência salva.'); recarregar();
    });
  });

  // ----- busca de mercado -----
  on(root, 'click', '[data-buscar]', async (b) => {
    if ((await oferecerReuso(cliente, cfg, recarregar)) !== 'buscar') return;
    await ocupado(b, async () => {
      const { itens, fontes } = await buscarReferencias({ cliente, diasMinimos: cfg.diasMinimosReferencia });
      const enriquecidos = itens.map((i) => ({ ...i, sinal: classificarSinal(i.diasNoAr, cfg) }));
      const m = modal('Exemplos de mercado encontrados', `<div class="space-y-3">
        ${iaNota(`A IA pesquisou na web e encontrou ${enriquecidos.length} exemplo(s) no nicho "${cliente.nicho}", com análise estratégica de cada um. Confira o link antes de salvar: a busca pode não confirmar o tempo no ar — nesse caso aparece "sinal n/d" e você pode preencher depois.`)}
        ${enriquecidos.length ? enriquecidos.map((r, i) => `<div class="rounded-lg border border-slate-200 p-3">
          <div class="flex justify-between gap-2"><b>${esc(r.titulo)}</b>${r.sinal ? tag('sinal ' + r.sinal, COR_SINAL[r.sinal]) : tag('sinal n/d')}</div>
          <div class="mt-1 flex flex-wrap gap-1">${r.empresa ? tag(r.empresa) : ''}${r.diasNoAr != null ? tag(r.diasNoAr + ' dias no ar') : tag('tempo no ar não confirmado', 'tag-warn')}
          ${r.diasNoAr != null && r.diasNoAr < cfg.diasMinimosReferencia ? tag(`abaixo do mínimo (${cfg.diasMinimosReferencia}d)`, 'tag-bad') : ''}</div>
          ${r.evidencia ? `<p class="hint">Fonte da informação: ${esc(r.evidencia)}</p>` : ''}
          ${r.texto ? `<p class="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">${esc(r.texto)}</p>` : ''}
          ${blocoAnalise(r.analise)}
          <p class="hint">${r.link ? `<a class="text-indigo-600" href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link)}</a>` : 'sem link'}</p>
          <button class="btn-primary btn-sm mt-2" data-salvar-b="${i}"><i class="fa-solid fa-bookmark"></i> Salvar no swipe file</button></div>`).join('')
          : '<p class="caption">Nada encontrado desta vez. Tente de novo ou cadastre manualmente.</p>'}
        <p class="caption">Salve as que fizerem sentido: elas aparecem na aba Referências e entram na geração de criativos deste cliente. Para começar um criativo com base numa delas, use "Criar criativo a partir desta" no card.</p>
        ${fontes.length ? `<p class="hint">Fontes consultadas: ${fontes.slice(0, 6).map((f) => esc(f.titulo || f.url)).join(' · ')}</p>` : ''}</div>`, { largo: true });
      on(m.el, 'click', '[data-salvar-b]', async (btn) => {
        const r = enriquecidos[Number(btn.dataset.salvarB)];
        await ocupado(btn, async () => {
          await db.criar(COL.referencias, {
            clienteId: cliente.id, nicho: cliente.nicho, origem: 'busca', titulo: r.titulo || '', empresa: r.empresa || '', link: r.link || '',
            texto: r.texto || '', diasNoAr: r.diasNoAr ?? null, sinal: r.sinal, analise: r.analise || null, evidencia: r.evidencia || '',
          });
          btn.outerHTML = '<span class="tag tag-ok">Salvo</span>'; toast('Referência salva.');
        });
      });
      m.el.addEventListener('mousedown', (e) => { if (e.target === m.el) recarregar(); });
      on(m.el, 'click', '[data-fechar]', () => recarregar());
    });
  });

  on(root, 'click', '[data-analisar]', async (b) => {
    const r = refs.find((x) => x.id === b.dataset.analisar);
    await ocupado(b, async () => { const analise = await analisarReferencia({ cliente, ref: r }); await db.atualizar(COL.referencias, r.id, { analise }); toast('Análise criada pela IA.'); recarregar(); });
  });
  on(root, 'click', '[data-criativo]', (b) => {
    try { sessionStorage.setItem('gcc_ref', b.dataset.criativo); } catch { /* sem storage */ }
    location.hash = `#/c/${cliente.id}/criativos`;
  });
  on(root, 'click', '[data-apagar]', async (b) => { await db.remover(COL.referencias, b.dataset.apagar); toast('Referência apagada.'); recarregar(); });
});
