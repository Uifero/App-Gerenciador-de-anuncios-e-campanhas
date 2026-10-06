// Fotos por lugar, dentro de "Materiais do cliente":
//  - Ponto principal (foco): o operador clica no rosto/produto da foto; todo recorte (banner, produto, Clientes reais,
//    Sobre, Galeria, computador e celular) mantém esse ponto visível. Padrão: centro. A IA só SUGERE; o clique confirma.
//  - Prévias pequenas de como a foto fica em cada lugar em que está, no computador e no celular.
//  - Ordem em cada lugar (banner = slides do carrossel, Clientes reais, cada produto, Sobre, Galeria): arrastar ou setas.
//  - "Juntar fotos": 2 ou 3 fotos em pé lado a lado num slide do banner (sugerido quando há foto em pé no banner).
// As regras ficam em lib/fotos-site.js e lib/medidas-site.js; aqui é só a tela.
import { db, COL } from '../core/storage.js';
import { medidasDe, posicaoCss, focoDe, normalizarFoco, ehVertical, nomeLugar, textoMedida } from '../lib/medidas-site.js';
import { usosDe, slidesDoBanner, fotosDoUso, fotosDoProduto, reordenar, juntarNoBanner, separarNoBanner, sugestoesJuntar, rotuloFoto } from '../lib/fotos-site.js';
import { printsDoCliente } from '../lib/visual-site.js';
import { tipoMaterial } from '../lib/prova-social.js';
import { sugerirFocoFoto } from '../core/ia.js';
import { prepararImagem } from './diagnostico.js';
import { esc, $, $$, on, modal, toast, ocupado, mostrarResultado } from '../core/ui.js';

// ---------- prévias por lugar ----------
/** Lugares em que a foto está: [{ lugar, rotulo, contain? }]. */
export function lugaresDaFoto(m, produtos = []) {
  const u = usosDe(m), out = [];
  if (u.nao) return out;
  if (u.banner) out.push({ lugar: 'banner', rotulo: 'Banner' });
  u.produtos.forEach((p) => out.push({ lugar: 'produto', rotulo: produtos.find((x) => x.id === p.id)?.nome || 'Produto' }));
  if (u.clientes || tipoMaterial(m) === 'prova_social') out.push({ lugar: 'clientes', rotulo: 'Clientes reais', contain: tipoMaterial(m) === 'prova_social' });
  if (u.sobre) out.push({ lugar: 'sobre', rotulo: 'Sobre' });
  if (u.galeria) out.push({ lugar: 'galeria', rotulo: 'Galeria' });
  return out;
}
const quadro = (url, foco, med, legenda, alt = 56, contain = false) => `<figure class="m-0 shrink-0 text-center" title="${esc(legenda)} (${textoMedida(med)})">
  <div class="overflow-hidden rounded border border-slate-300 bg-white" style="height:${alt}px;aspect-ratio:${med.l}/${med.a}"><img src="${esc(url)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:${contain ? 'contain' : 'cover'};object-position:${posicaoCss(foco)}" data-previa-recorte></div>
  <figcaption class="text-[10px] leading-tight text-slate-500">${esc(legenda)}</figcaption></figure>`;
/** Prévias de recorte da foto em cada lugar (computador e celular). `medidas` = medidasDe(plataforma, tema). */
export function previasLugaresHtml(m, { produtos = [], medidas = medidasDe(null), foco = focoDe(m), alt = 56 } = {}) {
  const lugares = lugaresDaFoto(m, produtos);
  if (!lugares.length) return '';
  return `<div class="flex flex-wrap items-end gap-2" data-previas-lugares>${lugares.map((l) => {
    const md = medidas[l.lugar];
    return `<div class="flex items-end gap-1 rounded bg-slate-50 p-1" data-previa-lugar="${l.lugar}"><span class="self-center text-[10px] font-medium">${esc(l.rotulo)}</span>
      ${quadro(m.url, foco, md.desktop, md.mobile ? 'computador' : 'computador e celular', alt, l.contain)}${md.mobile ? quadro(m.url, foco, md.mobile, 'celular', alt, l.contain) : ''}</div>`;
  }).join('')}</div>`;
}

// ---------- ponto principal ----------
/**
 * Janela do ponto principal: foto grande (clique marca o ponto), prévias de todos os lugares em que ela está, "Sugerir
 * com IA" (sugestão aparece, o operador confirma com "Salvar") e "Voltar ao centro". `aoSalvar(material)` depois de gravar.
 */
export function abrirFoco(cliente, m, { produtos = [], medidas = medidasDe(null), aoSalvar = () => {} } = {}) {
  let foco = focoDe(m);
  const todos = { ...m, usos: { ...usosDe(m), banner: 'manual', galeria: 'manual', sobre: 'manual', clientes: 'manual', produtos: [{ id: '_', ordem: 1, por: 'manual' }] } };
  const w = modal(`Ponto principal — ${rotuloFoto(m)}`, `<div data-foco-janela>
    <p class="caption">Clique no ponto que não pode ser cortado (o rosto, ou o produto). Todos os recortes do site, no computador e no celular, mantêm esse ponto visível.</p>
    <div class="relative mt-2 inline-block max-w-full cursor-crosshair select-none" data-foco-area><img src="${esc(m.url)}" alt="" class="block max-h-[55vh] max-w-full rounded" draggable="false">
      <span class="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white" style="box-shadow:0 0 0 2px #e11d48,0 0 6px #000a;background:#e11d4855" data-foco-marca></span></div>
    <p class="mt-1 text-sm" data-foco-estado></p>
    <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-primary btn-sm" data-foco-salvar><i class="fa-solid fa-check"></i> Salvar ponto</button>
      <button type="button" class="btn-ghost btn-sm" data-foco-ia><i class="fa-solid fa-wand-magic-sparkles"></i> Sugerir com IA</button>
      <button type="button" class="btn-ghost btn-sm" data-foco-centro>Voltar ao centro</button></div>
    <p class="mt-3 text-sm font-medium">Como fica em cada lugar</p><p class="hint">Mostra todos os lugares possíveis (computador e celular), nos tamanhos da plataforma do site.</p>
    <div class="mt-1" data-foco-previas></div></div>`, { largo: true });
  const raiz = $('[data-foco-janela]', w.el);
  const pintar = (estado) => {
    const mk = $('[data-foco-marca]', raiz); mk.style.left = `${foco.x * 100}%`; mk.style.top = `${foco.y * 100}%`;
    $('[data-foco-previas]', raiz).innerHTML = previasLugaresHtml(todos, { produtos: [{ id: '_', nome: 'Produto' }], medidas, foco, alt: 64 });
    if (estado) $('[data-foco-estado]', raiz).innerHTML = estado;
  };
  pintar(m.foco ? 'Ponto salvo antes. Clique em outro lugar para mudar.' : 'Sem ponto marcado: vale o centro da foto.');
  on(raiz, 'click', '[data-foco-area]', (area, e) => {
    const r = $('img', area).getBoundingClientRect();
    foco = normalizarFoco({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    pintar('Ponto marcado. Confira as prévias abaixo e clique em <b>Salvar ponto</b>.');
  });
  on(raiz, 'click', '[data-foco-centro]', () => { foco = { x: 0.5, y: 0.5 }; pintar('Centro da foto. Clique em <b>Salvar ponto</b> para guardar.'); });
  on(raiz, 'click', '[data-foco-ia]', (b) => ocupado(b, async () => {
    const bl = await (await fetch(m.url)).blob();
    const prep = await prepararImagem(new File([bl], m.nomeOriginal || 'foto.jpg', { type: bl.type || 'image/jpeg' }), 1024, 0.85);
    const s = await sugerirFocoFoto({ cliente, imagem: { media_type: prep.media_type, data: prep.data } });
    if (!s) throw new Error('A IA não conseguiu apontar o ponto principal agora. Clique na foto para marcar.');
    foco = normalizarFoco(s);
    pintar(`<span class="text-indigo-700"><i class="fa-solid fa-wand-magic-sparkles"></i> Sugestão da IA (${s.oque === 'rosto' ? 'rosto' : s.oque === 'produto' ? 'produto' : 'ponto principal'}).</span> Confira as prévias: se estiver certo, clique em <b>Salvar ponto</b>; se não, clique no ponto certo.`);
    mostrarResultado($('[data-foco-estado]', raiz), 'Sugestão da IA marcada na foto: confirme com "Salvar ponto".');
  }));
  on(raiz, 'click', '[data-foco-salvar]', (b) => ocupado(b, async () => {
    await db.atualizar(COL.materiais, m.id, { foco });
    toast(`${m.codigo || 'Foto'}: ponto principal salvo. Vale na prévia, no link de aprovação, no site e no .zip.`);
    aoSalvar({ ...m, foco }); w.fechar();
  }));
  return w;
}

// ---------- ordem em cada lugar + "Juntar fotos" ----------
/** Listas ordenáveis: [{ chave, titulo, itens: [{ ids, fotos, junto }] }]. Banner: um item por slide. */
export function listasDeLugar(lista = [], produtos = []) {
  const item = (f) => ({ ids: [f.materialId || f.id], fotos: [f], junto: false });
  const out = [];
  const slides = slidesDoBanner(lista);
  if (slides.length) out.push({ chave: 'banner', titulo: `Banner (carrossel: ${slides.length} slide${slides.length > 1 ? 's' : ''})`, itens: slides.map((s) => ({ ids: s.fotos.map((f) => f.materialId), fotos: s.fotos, junto: s.junto })), slides });
  const clientes = printsDoCliente(lista);
  if (clientes.length) out.push({ chave: 'clientes', titulo: 'Clientes reais', itens: clientes.map((p) => item({ ...p, materialId: p.id })) });
  for (const p of produtos) {
    const fs = fotosDoProduto({ id: p.id, fotosMigradas: true }, lista);
    if (fs.length) out.push({ chave: `produto:${p.id}`, titulo: `Produto: ${p.nome} (a 1ª é a foto principal)`, itens: fs.map(item) });
  }
  for (const k of ['sobre', 'galeria']) { const fs = fotosDoUso(lista, k); if (fs.length) out.push({ chave: k, titulo: nomeLugar(k), itens: fs.map(item) }); }
  return out;
}

export function ordemLugaresHtml(lista = [], produtos = []) {
  const listas = listasDeLugar(lista, produtos);
  if (!listas.length) return '';
  const porId = new Map(lista.map((m) => [m.id, m]));
  const miniatura = (f) => `<img src="${esc(f.url)}" alt="" class="h-16 w-12 rounded object-cover" style="object-position:${posicaoCss(f.foco)}" draggable="false">`;
  const sugestoes = (l) => (l.chave === 'banner' ? sugestoesJuntar(l.slides.map((s) => ({ ...s, fotos: s.fotos.map((f) => ({ ...f, ...(porId.get(f.materialId) ? { largura: porId.get(f.materialId).largura, altura: porId.get(f.materialId).altura } : {}) })) }))) : []);
  return `<details class="mt-3 rounded-lg border border-indigo-200 p-2" open data-ordem-lugares><summary class="cursor-pointer text-sm font-semibold"><i class="fa-solid fa-arrows-left-right"></i> Ordem em cada lugar</summary>
    <p class="hint mt-1">Arraste as fotos (ou use as setas) para mudar a ordem no site. Arrastar é escolha sua: vale mais que o texto "Como eu quero o site".</p>
    ${listas.map((l) => {
      const sug = sugestoes(l);
      return `<div class="mt-2" data-lugar-ordem="${esc(l.chave)}"><p class="text-xs font-semibold">${esc(l.titulo)}</p>
      ${sug.map((s) => `<p class="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-800" data-sugestao-juntar><i class="fa-solid fa-lightbulb"></i> ${esc(s.codigos.join(', '))} são fotos em pé: no banner largo cada uma seria muito cortada. Sugestão:
        <button type="button" class="underline" data-juntar="${esc(s.ids.slice(0, 2).join(','))}">Juntar 2 lado a lado</button>${s.ids.length > 2 ? ` · <button type="button" class="underline" data-juntar="${esc(s.ids.join(','))}">Juntar as 3</button>` : ''}</p>`).join('')}
      <div class="mt-1 flex flex-wrap gap-2" data-lista-ordem="${esc(l.chave)}">${l.itens.map((it, i) => `<div class="rounded border ${it.junto ? 'border-2 border-indigo-500' : 'border-slate-200'} p-1 text-center text-[10px]" draggable="true" data-item-ordem="${esc(it.ids.join(','))}" title="Arraste para mudar a ordem">
        <div class="flex gap-0.5">${it.fotos.map(miniatura).join('')}</div>
        <div class="mt-0.5 font-semibold">${i + 1}. ${esc(it.fotos.map((f) => f.codigo || 'foto').join(' + '))}${l.chave === 'banner' && it.fotos.length === 1 && ehVertical(porId.get(it.ids[0])) ? ' <span class="text-amber-700" title="Foto em pé">↕</span>' : ''}</div>
        <div class="mt-0.5 flex justify-center gap-1"><button type="button" class="btn-ghost btn-sm !px-2 !py-0" data-mover-ordem="-1" ${i ? '' : 'disabled'} aria-label="Mover para antes">‹</button><button type="button" class="btn-ghost btn-sm !px-2 !py-0" data-mover-ordem="1" ${i < l.itens.length - 1 ? '' : 'disabled'} aria-label="Mover para depois">›</button></div>
        ${l.chave === 'banner' ? (it.junto ? `<button type="button" class="text-indigo-700 underline" data-separar="${esc(it.ids[0])}">Separar</button>`
          : i < l.itens.length - 1 && l.itens[i + 1].fotos.length + 1 <= 3 ? `<button type="button" class="text-indigo-700 underline" data-juntar="${esc([...it.ids, ...l.itens[i + 1].ids].join(','))}" title="Juntar fotos: esta e a próxima lado a lado no mesmo slide">Juntar com a próxima</button>` : '') : ''}
        ${it.junto && it.fotos.length < 3 && i < l.itens.length - 1 && l.itens[i + 1].fotos.length === 1 ? `<button type="button" class="block w-full text-indigo-700 underline" data-juntar="${esc([...it.ids, ...l.itens[i + 1].ids].join(','))}">+ a próxima</button>` : ''}</div>`).join('')}</div></div>`;
    }).join('')}</details>`;
}

/**
 * Liga arrastar/setas/juntar/separar. `ctx`: { lista: () => materiais atuais, aplicar(patches, aviso, alvoResultado) }.
 */
export function ligarOrdemLugares(raiz, ctx) {
  const ordemNova = (box, movido, alvo, depois) => {
    const itens = $$('[data-item-ordem]', box).map((x) => x.dataset.itemOrdem);
    const de = itens.indexOf(movido); itens.splice(de, 1);
    let para = alvo == null ? itens.length : itens.indexOf(alvo) + (depois ? 1 : 0);
    itens.splice(para, 0, movido);
    return itens;
  };
  const salvar = (chave, itens, onde) => {
    const ids = itens.flatMap((x) => x.split(','));
    const [lugar, produtoId] = chave.startsWith('produto:') ? ['produto', chave.slice(8)] : [chave, null];
    return ctx.aplicar(reordenar(ctx.lista(), lugar, ids, produtoId), `Nova ordem salva (${chave === 'banner' ? 'slides do banner' : chave.startsWith('produto:') ? 'fotos do produto; a 1ª é a principal' : nomeLugar(lugar)}). Vale na próxima prévia e no .zip.`, onde);
  };
  let arrastando = null;
  raiz.addEventListener('dragstart', (e) => { const it = e.target.closest?.('[data-item-ordem]'); if (!it) return; arrastando = it; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.dataset.itemOrdem); it.classList.add('opacity-50'); });
  raiz.addEventListener('dragend', () => { arrastando?.classList.remove('opacity-50'); arrastando = null; });
  raiz.addEventListener('dragover', (e) => { const box = e.target.closest?.('[data-lista-ordem]'); if (box && arrastando && box.contains(arrastando)) e.preventDefault(); });
  raiz.addEventListener('drop', (e) => {
    const box = e.target.closest?.('[data-lista-ordem]'); if (!box || !arrastando || !box.contains(arrastando)) return;
    e.preventDefault();
    const alvo = e.target.closest('[data-item-ordem]');
    if (alvo === arrastando) return;
    const r = alvo?.getBoundingClientRect();
    const itens = ordemNova(box, arrastando.dataset.itemOrdem, alvo?.dataset.itemOrdem ?? null, r ? e.clientX > r.left + r.width / 2 : true);
    salvar(box.dataset.listaOrdem, itens, box).catch((er) => toast(er.message || 'Não consegui salvar a ordem.', 'erro'));
  });
  on(raiz, 'click', '[data-mover-ordem]', (b) => {
    const it = b.closest('[data-item-ordem]'), box = b.closest('[data-lista-ordem]');
    const itens = $$('[data-item-ordem]', box).map((x) => x.dataset.itemOrdem);
    const i = itens.indexOf(it.dataset.itemOrdem), j = i + Number(b.dataset.moverOrdem);
    if (j < 0 || j >= itens.length) return;
    [itens[i], itens[j]] = [itens[j], itens[i]];
    salvar(box.dataset.listaOrdem, itens, box).catch((er) => toast(er.message || 'Não consegui salvar a ordem.', 'erro'));
  });
  on(raiz, 'click', '[data-juntar]', (b) => ocupado(b, async () => {
    const ids = b.dataset.juntar.split(','); const box = b.closest('[data-lugar-ordem]');
    await ctx.aplicar(juntarNoBanner(ctx.lista(), ids), `Juntar fotos: ${ids.length} fotos lado a lado no mesmo slide do banner (computador e celular). Confira na prévia.`, box);
  }));
  on(raiz, 'click', '[data-separar]', (b) => ocupado(b, async () => {
    const box = b.closest('[data-lugar-ordem]');
    await ctx.aplicar(separarNoBanner(ctx.lista(), b.dataset.separar), 'Fotos separadas: cada uma volta a ser um slide do banner.', box);
  }));
}
