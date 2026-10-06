// Janela "Materiais do cliente": enviar fotos e vídeos (vários de uma vez, botão ou arrastar), ver tudo agrupado
// (Logo, Fotos, Vídeos, Provas sociais) e apagar. Usa salvarMaterial (lib/materiais.js): mesmo Storage, mesmas regras e
// mesmo limite de hoje; nada guardado em paralelo. Abre do passo 2 de "Montar site", da pergunta 8 e da aba
// Criativos. O Estúdio (etapa 1) e o "Ajustar este site" já leem esta mesma lista.
import { db, COL } from '../core/storage.js';
import { enviarMateriais, ACEITA_MATERIAL, limiteMaterialMB, garantirCodigos, salvarUsos } from '../lib/materiais.js';
import { excluirMateriais } from './excluir-material.js';
import { temCodigo, usosDe, mudarUso, mudarPessoa, comUsos, resumoUsos, DEFINIDO_TEXTO } from '../lib/fotos-site.js';
import { tipoMaterial, ETIQUETA_PROVA } from '../lib/prova-social.js';
import { logoHtml, ligarLogo } from './logo-cliente.js';
import { previasLugaresHtml, abrirFoco, ordemLugaresHtml, ligarOrdemLugares } from './fotos-lugares.js';
import { medidasDe, ehVertical, focoDe } from '../lib/medidas-site.js';
import { medirFoto } from '../lib/recortes-canvas.js';
import { plataformaDoSite } from '../lib/etapas-site.js';
import { esc, $, on, modal, campoArquivo, toast, ocupado, confirmar, mostrarResultado } from '../core/ui.js';

const GRUPOS = [['logo', 'Logo'], ['foto', 'Fotos'], ['video', 'Vídeos'], ['prova_social', 'Provas sociais']];
const XADREZ = 'background:repeating-conic-gradient(#cbd5e1 0% 25%,#ffffff 0% 50%) 50%/12px 12px';
const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : '');

/** `aoMudar(lista)` roda depois de cada envio ou exclusão, com a lista atual de materiais (para os contadores). */
export async function abrirMateriais(cliente, { aoMudar: aoMudarExtra = () => {} } = {}) {
  // Cada mudança avisa a tela de trás (painel do site, pergunta 8) para os contadores atualizarem na hora.
  const aoMudar = (lista) => { aoMudarExtra(lista); document.dispatchEvent(new CustomEvent('gcc:materiais', { detail: { clienteId: cliente.id, lista } })); };
  const limite = limiteMaterialMB();
  const m = modal(`Materiais do cliente — ${cliente.nome}`, `<div data-materiais-cliente>
    <p class="caption mb-2">Fotos e vídeos do cliente para as peças do Estúdio e para o site. Ficam salvos aqui e aparecem no Estúdio (etapa 1, "Materiais") e no "Ajustar este site".</p>
    <div class="rounded-lg border-2 border-dashed border-slate-300 p-3" data-soltar data-zona-materiais>
      ${campoArquivo({ attrs: 'data-materiais-arquivos', accept: ACEITA_MATERIAL, multiple: true, icone: 'upload', texto: 'Enviar fotos e vídeos', lista: true,
        dica: `Arraste os arquivos para esta área ou clique no botão. Vários de uma vez: fotos (PNG, JPG, WEBP) e vídeos (MP4, MOV); o tipo é detectado sozinho. Até ${limite} MB por arquivo.` })}
      <p class="hint mt-1" data-progresso-materiais></p></div>
    <div class="mt-3"><p class="text-sm font-semibold">Logo</p><div data-logo-materiais>${logoHtml(cliente)}</div></div>
    <div class="sticky top-0 z-10 mt-3 hidden flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm" data-barra-selecao>
      <span data-qtd-selecao></span><button type="button" class="btn-danger btn-sm" data-excluir-selecao><i class="fa-solid fa-trash"></i> Excluir selecionados</button>
      <button type="button" class="btn-ghost btn-sm" data-limpar-selecao>Limpar seleção</button></div>
    <div class="mt-3 space-y-3" data-grade-materiais><p class="caption"><i class="fa-solid fa-spinner fa-spin"></i> Carregando…</p></div></div>`, { largo: true });
  const raiz = $('[data-materiais-cliente]', m.el);
  let lista = [];
  const produtos = await db.listar(COL.produtos, { clienteId: cliente.id }).catch(() => []);
  // Tamanhos de cada lugar na plataforma/tema do site deste cliente (sem site ou sem plataforma: padrão do app).
  const site = (await db.listar(COL.sites, { clienteId: cliente.id }).catch(() => []))[0] || null;
  const plat = plataformaDoSite(site);
  const medidas = medidasDe(['shopify', 'nuvemshop'].includes(plat) ? plat : null, site?.tema);
  const abertos = new Set(); // "Usar em" aberto continua aberto depois de redesenhar
  const selecionados = new Set(); // seleção para excluir vários de uma vez

  const cartao = (x) => {
    const video = tipoMaterial(x) === 'video';
    const midia = video ? `<video src="${esc(x.url)}#t=0.1" muted preload="metadata" playsinline class="h-24 w-full rounded bg-black object-cover"></video>`
      : `<img src="${esc(x.url)}" alt="" loading="lazy" class="h-24 w-full rounded object-${tipoMaterial(x) === 'logo' ? 'contain' : 'cover'}" ${tipoMaterial(x) === 'logo' ? `style="${XADREZ}"` : ''}>`;
    const foco = focoDe(x), comFoco = temCodigo(x) && !video;
    const marca = comFoco && x.foco ? `<span class="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style="left:${foco.x * 100}%;top:${foco.y * 100}%;background:#e11d48" title="Ponto principal" data-marca-foco></span>` : '';
    const cod = temCodigo(x) && x.codigo ? `<span class="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[11px] font-bold" style="background:rgba(0,0,0,.78);color:#fff" data-codigo-foto>${esc(x.codigo)}</span>` : '';
    return `<div class="rounded-lg border ${selecionados.has(x.id) ? 'border-rose-400 ring-2 ring-rose-300' : 'border-slate-200'} p-1 text-xs" data-material="${esc(x.id)}"><div class="relative">${midia}${marca}${cod}
        <label class="absolute right-1 top-1 rounded bg-white/90 px-1" title="Selecionar para excluir vários de uma vez"><input type="checkbox" data-selecionar-material="${esc(x.id)}" ${selecionados.has(x.id) ? 'checked' : ''} aria-label="Selecionar"></label></div>
      <p class="mt-1 truncate" title="${esc(x.nomeOriginal || x.descricao || x.nome || '')}">${esc(x.nomeOriginal || x.descricao || x.nome || 'arquivo')}</p>
      <div class="flex items-center justify-between gap-1"><span class="text-slate-500">${esc(mb(x.tamanho))}</span>
        <button type="button" class="btn-danger btn-sm !px-2 !py-0.5" data-apagar-material="${esc(x.id)}" title="Excluir este arquivo"><i class="fa-solid fa-trash"></i> Excluir</button></div>
      ${x.origem === 'envio' && ['foto', 'prova_social'].includes(tipoMaterial(x)) ? `<button type="button" class="mt-1 w-full rounded border border-slate-200 px-1 py-0.5 text-[11px] ${tipoMaterial(x) === 'prova_social' ? 'bg-emerald-50 text-emerald-800' : ''}" data-print-cliente="${esc(x.id)}" title="Prints de clientes aparecem na seção Clientes reais do site">${tipoMaterial(x) === 'prova_social' ? '<i class="fa-solid fa-check"></i> Print de cliente' : 'É print de cliente?'}</button>` : ''}
      ${comFoco ? `<button type="button" class="mt-1 w-full rounded border border-slate-200 px-1 py-0.5 text-[11px]" data-foco-material="${esc(x.id)}" title="Clique no rosto ou no produto: nenhum recorte do site corta esse ponto"><i class="fa-solid fa-crosshairs"></i> ${x.foco ? 'Ponto principal marcado' : 'Marcar ponto principal'}</button>` : ''}
      ${temCodigo(x) && x.codigo ? usarEmHtml(x) : ''}</div>`;
  };
  // Seletor "Usar em": onde a foto vai no site. Escolha manual: vale mais que o texto "Como eu quero o site" e que a IA.
  const origem = (por) => (por === 'texto' ? ` <span class="text-amber-700" title="Veio de uma referência no texto 'Como eu quero o site'. Marcar ou desmarcar aqui vira escolha sua." data-definido-texto>(${DEFINIDO_TEXTO})</span>` : '');
  const usarEmHtml = (x) => {
    const u = usosDe(x), print = tipoMaterial(x) === 'prova_social';
    const resumo = resumoUsos(x, produtos);
    const caixa = (k, rot) => `<label class="flex items-start gap-1"><input type="checkbox" data-uso="${k}" data-mid="${esc(x.id)}" ${u[k] ? 'checked' : ''}> <span>${rot}${origem(u[k])}</span></label>`;
    const ligados = u.produtos.map((p) => `<div class="flex flex-wrap items-center gap-1 rounded bg-slate-50 px-1" data-produto-ligado="${esc(p.id)}"><span class="min-w-0 flex-1 truncate font-medium">${esc(produtos.find((y) => y.id === p.id)?.nome || 'produto apagado')}</span>
        <label title="Posição entre as fotos do produto">pos. <input type="number" min="1" max="99" class="w-10 rounded border border-slate-300 px-0.5" value="${p.ordem || ''}" data-ordem-produto="${esc(p.id)}" data-mid="${esc(x.id)}" aria-label="Posição"></label>
        <label><input type="checkbox" data-principal-produto="${esc(p.id)}" data-mid="${esc(x.id)}" ${p.principal ? 'checked' : ''}> Foto principal</label>${origem(p.por)}
        <button type="button" class="px-1 text-rose-600" data-tirar-produto="${esc(p.id)}" data-mid="${esc(x.id)}" title="Tirar deste produto" aria-label="Tirar deste produto">×</button></div>`).join('');
    const livres = produtos.filter((p) => !u.produtos.some((y) => y.id === p.id));
    return `<details class="mt-1 rounded border border-indigo-100 p-1" data-usar-em="${esc(x.id)}" ${abertos.has(x.id) ? 'open' : ''}>
      <summary class="cursor-pointer text-[11px] text-indigo-700">Usar em: <b data-resumo-usos>${resumo.length ? esc(resumo.map((r) => r.texto + (r.por === 'texto' ? '*' : '')).join(' · ')) : 'escolher'}</b></summary>
      <div class="mt-1 space-y-0.5 text-[11px]">${caixa('banner', 'Banner')}
        ${print && !u.nao ? '<p class="text-slate-500"><i class="fa-solid fa-check"></i> Clientes reais (print de cliente)</p>' : caixa('clientes', 'Clientes reais')}
        ${u.clientes && !print ? `<label class="ml-4 flex items-start gap-1"><input type="checkbox" data-pessoa="${esc(x.id)}" ${u.pessoa ? 'checked' : ''}> <span>Mostra pessoa (pede autorização antes do link e do pacote)</span></label>` : ''}
        ${caixa('sobre', 'Sobre a loja/história')}${caixa('galeria', 'Galeria')}
        <p class="pt-1 font-medium">Produto</p>${ligados}
        ${produtos.length ? (livres.length ? `<select class="w-full rounded border border-slate-300 py-0.5 text-[11px]" data-add-produto="${esc(x.id)}"><option value="">+ usar no produto…</option>${livres.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select>` : '') : '<p class="hint">Cadastre produtos na aba Produtos.</p>'}
        <div class="border-t border-slate-100 pt-1">${caixa('nao', 'Não usar no site')}</div>
        <button type="button" class="mt-1 text-rose-600 underline" data-apagar-material="${esc(x.id)}">Excluir esta foto</button>
        ${resumo.some((r) => r.por === 'texto') ? `<p class="text-amber-700">* ${DEFINIDO_TEXTO}</p>` : ''}
        ${resumo.length && !u.nao ? `<p class="pt-1 font-medium">Como fica em cada lugar</p>${previasLugaresHtml(x, { produtos, medidas })}` : ''}</div></details>`;
  };
  const gradeHtml = () => ordemLugaresHtml(lista, produtos) + GRUPOS.map(([k, titulo]) => {
      const itens = lista.filter((x) => tipoMaterial(x) === k);
      return `<section data-grupo-material="${k}"><p class="text-sm font-semibold">${titulo} <span class="font-normal text-slate-500">(${itens.length})</span></p>${k === 'foto' && itens.length ? '<p class="hint">Cada foto tem um código (F1, F2…) que não muda. Em "Usar em", escolha onde ela vai no site, ou escreva no "Como eu quero o site" (ex.: "F3 no banner, F5 no Thermora"). A escolha feita aqui vale mais que o texto e que a IA.</p>' : ''}
        ${itens.length ? `<div class="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">${itens.map(cartao).join('')}</div>` : '<p class="hint">Nenhum ainda.</p>'}</section>`;
    }).join('');
  const desenharGrade = async () => {
    lista = await garantirCodigos(cliente, await db.listar(COL.materiais, { clienteId: cliente.id }));
    $('[data-grade-materiais]', raiz).innerHTML = gradeHtml();
    medirFaltando();
    return lista;
  };
  // Largura/altura de cada foto (para saber se está em pé e sugerir "Juntar fotos"): medidas uma vez e guardadas.
  let medindo = false;
  const medirFaltando = async () => {
    if (medindo) return; medindo = true;
    try {
      let mudou = false;
      for (const x of lista.filter((y) => temCodigo(y) && tipoMaterial(y) !== 'video' && !y.largura)) {
        const d = await medirFoto(x.url); if (!d) continue;
        await db.atualizar(COL.materiais, x.id, d, { silencioso: true }).catch(() => {});
        lista = lista.map((y) => (y.id === x.id ? { ...y, ...d } : y)); mudou = true;
      }
      if (mudou && raiz.isConnected) $('[data-grade-materiais]', raiz).innerHTML = gradeHtml();
    } finally { medindo = false; }
  };

  on(raiz, 'change', '[data-materiais-arquivos]', (inp) => ocupado(inp, async () => {
    const arqs = [...(inp.files || [])]; if (!arqs.length) return;
    const prog = $('[data-progresso-materiais]', raiz);
    try {
      const { salvos, falhas } = await enviarMateriais(cliente, arqs, (i, n, nome) => { prog.textContent = `Enviando ${i + 1} de ${n}: ${nome}…`; });
      prog.textContent = '';
      await desenharGrade(); aoMudar(lista);
      if (falhas.length) toast(`${falhas.length} arquivo(s) não enviado(s):\n${falhas.join('\n')}`, 'erro');
      if (salvos.length) {
        const fotos = salvos.filter((x) => tipoMaterial(x) === 'foto').length, videos = salvos.filter((x) => tipoMaterial(x) === 'video').length;
        mostrarResultado($(`[data-grupo-material="${videos && !fotos ? 'video' : 'foto'}"]`, raiz), `Pronto: ${fotos} foto(s) e ${videos} vídeo(s) salvos nos materiais do cliente.`);
      }
    } finally { inp.value = ''; $('[data-upload-escolhido]', raiz)?.classList.add('hidden'); $('.upload-btn', raiz)?.classList.remove('hidden'); }
  }));
  // ---- "Usar em" ----
  const aplicarUsos = async (patches, aviso, alvo = null) => {
    if (!patches.length) return;
    await salvarUsos(patches);
    lista = comUsos(lista, patches);
    $('[data-grade-materiais]', raiz).innerHTML = gradeHtml(); aoMudar(lista);
    // Resultado à vista: no lugar que mudou (a lista foi redesenhada, então procura de novo pela chave).
    const chave = alvo?.dataset?.lugarOrdem || alvo?.dataset?.listaOrdem || alvo?.closest?.('[data-lugar-ordem]')?.dataset.lugarOrdem;
    const novo = chave && $(`[data-lugar-ordem="${CSS.escape(chave)}"]`, raiz);
    if (novo) mostrarResultado(novo, aviso); else toast(aviso);
  };
  ligarOrdemLugares(raiz, { lista: () => lista, aplicar: aplicarUsos });
  on(raiz, 'click', '[data-foco-material]', (b) => {
    const x = lista.find((y) => y.id === b.dataset.focoMaterial); if (!x) return;
    abrirFoco(cliente, x, { produtos, medidas, aoSalvar: (novo) => { lista = lista.map((y) => (y.id === novo.id ? novo : y)); $('[data-grade-materiais]', raiz).innerHTML = gradeHtml(); aoMudar(lista); } });
  });
  raiz.addEventListener('toggle', (e) => { const d = e.target.closest?.('[data-usar-em]'); if (d) (d.open ? abertos.add(d.dataset.usarEm) : abertos.delete(d.dataset.usarEm)); }, true);
  const codigoDe = (id) => lista.find((y) => y.id === id)?.codigo || 'Foto';
  const ONDE = { banner: 'no banner', clientes: 'em Clientes reais', sobre: 'em Sobre a loja', galeria: 'na Galeria' };
  on(raiz, 'change', '[data-uso]', (c) => ocupado(c, async () => {
    const x = lista.find((y) => y.id === c.dataset.mid);
    const emPe = c.dataset.uso === 'banner' && c.checked && ehVertical(x);
    await aplicarUsos(mudarUso(lista, c.dataset.mid, { uso: c.dataset.uso, ligado: c.checked }),
      c.dataset.uso === 'nao' ? `${codigoDe(c.dataset.mid)}: ${c.checked ? 'fora do site (Não usar).' : 'pode voltar a ser usada no site.'}`
        : `${codigoDe(c.dataset.mid)}: ${c.checked ? 'vai' : 'não vai mais'} ${ONDE[c.dataset.uso]}${c.dataset.uso === 'banner' && c.checked ? ' (entra no fim do carrossel)' : ''}. Vale na próxima prévia e na próxima geração.${emPe ? ' É uma foto em pé: no banner largo ela seria muito cortada. Use "Juntar com a próxima" em "Ordem em cada lugar" para pôr 2 ou 3 fotos em pé lado a lado.' : ''}`,
      c.dataset.uso === 'banner' && c.checked ? $('[data-lugar-ordem="banner"]', raiz) || { dataset: { lugarOrdem: 'banner' } } : null);
  }));
  on(raiz, 'change', '[data-pessoa]', (c) => ocupado(c, () => aplicarUsos(mudarPessoa(lista, c.dataset.pessoa, c.checked), c.checked ? 'Marcado: mostra pessoa. Antes do link de aprovação e do pacote, o app pede a autorização (ou borre o rosto).' : 'Desmarcado: não mostra pessoa.')));
  // Select e campo de número: o valor é lido ANTES (ocupado() troca o conteúdo do elemento e apagaria a escolha).
  const salvarSem = (fn) => fn().catch((e) => toast(e.message || 'Não consegui salvar a escolha.', 'erro'));
  on(raiz, 'change', '[data-add-produto]', (s) => { const pid = s.value, mid = s.dataset.addProduto; if (pid) salvarSem(() => aplicarUsos(mudarUso(lista, mid, { uso: 'produto', produtoId: pid }), `${codigoDe(mid)} ligada ao produto (o mesmo arquivo, sem cópia).`)); });
  on(raiz, 'change', '[data-ordem-produto]', (i) => { const n = Number(i.value); if (n > 0) salvarSem(() => aplicarUsos(mudarUso(lista, i.dataset.mid, { uso: 'produto', produtoId: i.dataset.ordemProduto, ordem: n }), 'Posição da foto no produto salva.')); });
  on(raiz, 'change', '[data-principal-produto]', (c) => ocupado(c, () => aplicarUsos(mudarUso(lista, c.dataset.mid, { uso: 'produto', produtoId: c.dataset.principalProduto, principal: c.checked }), c.checked ? `${codigoDe(c.dataset.mid)} é a foto principal do produto.` : 'Deixou de ser a foto principal.')));
  on(raiz, 'click', '[data-tirar-produto]', (b) => ocupado(b, () => aplicarUsos(mudarUso(lista, b.dataset.mid, { uso: 'produto', produtoId: b.dataset.tirarProduto, ligado: false }), `${codigoDe(b.dataset.mid)} saiu do produto (o arquivo continua guardado).`)));

  on(raiz, 'click', '[data-print-cliente]', (b) => ocupado(b, async () => {
    const x = lista.find((y) => y.id === b.dataset.printCliente); if (!x) return;
    const eh = tipoMaterial(x) === 'prova_social';
    // Desmarcar tira o print de "Provas sociais" (vai para Fotos): pede confirmação para não sumir com um clique.
    if (eh && !(await confirmar(`Tirar "${x.nomeOriginal || x.nome}" de Provas sociais? O arquivo continua guardado, em Fotos, e sai da seção Clientes reais do site.`, 'Tirar de Provas sociais'))) return;
    const etiquetas = eh ? (x.etiquetas || []).filter((t) => t !== ETIQUETA_PROVA) : [...new Set([...(x.etiquetas || []), ETIQUETA_PROVA])];
    await db.atualizar(COL.materiais, x.id, { etiquetas });
    await desenharGrade(); aoMudar(lista);
    toast(eh ? 'Não é mais print de cliente: sai da seção Clientes reais.' : 'Marcado como print de cliente: entra na seção Clientes reais do site. Borre nome e número antes de publicar.');
  }));
  // Excluir: um ou vários. A confirmação (uma só) lista onde cada arquivo está em uso (modules/excluir-material.js).
  const depoisDeExcluir = async () => { $('[data-logo-materiais]', raiz).innerHTML = logoHtml(cliente); selecionados.clear(); await desenharGrade(); aoMudarExtra(lista); pintarSelecao(); };
  const pintarSelecao = () => {
    const barra = $('[data-barra-selecao]', raiz); barra.classList.toggle('hidden', !selecionados.size); barra.classList.toggle('flex', selecionados.size > 0);
    $('[data-qtd-selecao]', raiz).textContent = `${selecionados.size} arquivo(s) selecionado(s)`;
  };
  on(raiz, 'click', '[data-apagar-material]', (b) => ocupado(b, async () => {
    const x = lista.find((y) => y.id === b.dataset.apagarMaterial); if (!x) return;
    await excluirMateriais(cliente, [x], { aoExcluir: depoisDeExcluir });
  }));
  on(raiz, 'change', '[data-selecionar-material]', (c) => {
    if (c.checked) selecionados.add(c.dataset.selecionarMaterial); else selecionados.delete(c.dataset.selecionarMaterial);
    c.closest('[data-material]')?.classList.toggle('ring-2', c.checked); pintarSelecao();
  });
  on(raiz, 'click', '[data-limpar-selecao]', async () => { selecionados.clear(); await desenharGrade(); pintarSelecao(); });
  on(raiz, 'click', '[data-excluir-selecao]', (b) => ocupado(b, async () => {
    await excluirMateriais(cliente, lista.filter((x) => selecionados.has(x.id)), { aoExcluir: depoisDeExcluir });
  }));
  ligarLogo($('[data-logo-materiais]', raiz), cliente, async () => { await desenharGrade(); aoMudar(lista); });
  await desenharGrade();
  return m;
}
