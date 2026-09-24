// Seção "B-roll" do Estúdio: busca vídeos e fotos de banco gratuito (Pexels e Pixabay) sem sair do app.
// A busca e o download passam pelo servidor (/api/broll), que guarda as chaves; o navegador nunca as vê.
// Clicar num resultado baixa o arquivo e o coloca em "1. Materiais" (o mesmo fluxo de um upload), já ligado à cena
// escolhida, se houver. Sem as chaves no .env, a seção só explica como configurar.
import { tokenAtual } from '../core/auth.js';
import { db, COL } from '../core/storage.js';
import { sugestoesBroll, orientacaoDoFormato, nomeArquivoBroll } from '../lib/broll.js';
import { $, esc, on, toast, ocupado } from '../core/ui.js';

const cabecalhos = async () => ({ Authorization: `Bearer ${await tokenAtual()}` });

/**
 * Monta a seção dentro de `raiz`. `cenas()` devolve a linha do tempo do vídeo; `formatoVideo()` o formato escolhido
 * ("1080x1920"); `aoAnexar(file, indiceCena|null)` coloca o arquivo nos Materiais do Estúdio. Devolve { cenasMudaram }.
 */
export function montarBroll(raiz, { cliente, criativo, cenas, formatoVideo, aoAnexar }) {
  const est = { termo: '', tipo: 'video', fonte: 'todos', pagina: 1, itens: [], produto: '', status: null };

  raiz.innerHTML = `<div data-broll-status><p class="hint"><i class="fa-solid fa-spinner fa-spin"></i> Verificando os bancos de imagens…</p></div><div data-broll-corpo class="hidden">
    <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <input class="input" data-broll-termo placeholder="O que procurar? Ex.: mulher correndo, café, cozinha" maxlength="100">
      <select class="input !w-auto" data-broll-tipo title="Tipo de material"><option value="video">Vídeos</option><option value="foto">Fotos</option></select>
      <select class="input !w-auto" data-broll-fonte title="Banco"><option value="todos">Pexels + Pixabay</option><option value="pexels">Só Pexels</option><option value="pixabay">Só Pixabay</option></select>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-1 text-xs" data-broll-sugestoes></div>
    <div class="mt-2 flex flex-wrap items-end gap-2">
      <label class="text-xs text-slate-500">Ligar o resultado à cena<select class="input mt-0.5 !w-60" data-broll-cena></select></label>
      <button class="btn-primary btn-sm" data-broll-buscar><i class="fa-solid fa-magnifying-glass"></i> Buscar</button></div>
    <p class="hint mt-1">Clique num resultado para colocá-lo em "1. Materiais"${' '}(e na cena escolhida acima). A busca segue o formato do vídeo (vertical, quadrado ou horizontal).</p>
    <p class="hint text-amber-700" data-broll-avisos></p>
    <div data-broll-grade class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"></div>
    <div class="mt-2 hidden text-center" data-broll-mais><button class="btn-ghost btn-sm" data-broll-carregar-mais>Carregar mais resultados</button></div>
    <p class="hint mt-2">Material gratuito do <a class="underline" href="https://www.pexels.com/pt-br/licenca/" target="_blank" rel="noopener noreferrer">Pexels</a> e do <a class="underline" href="https://pixabay.com/pt/service/license-summary/" target="_blank" rel="noopener noreferrer">Pixabay</a>: pode usar em anúncios sem pagar e sem dar crédito; não use para mostrar como se fosse o produto real do cliente, nem pessoas reconhecíveis endossando a marca.</p>
  </div>`;

  const selCena = () => $('[data-broll-cena]', raiz);
  const textoCenaEscolhida = () => { const i = selCena().value; return i === '' ? '' : cenas()[Number(i)]?.texto || ''; };
  const desenharSugestoes = () => {
    const s = sugestoesBroll({ textoCena: textoCenaEscolhida(), produto: est.produto, nicho: cliente.nicho, hook: criativo.hook });
    $('[data-broll-sugestoes]', raiz).innerHTML = s.length ? `<span class="text-slate-500">Sugestões:</span> ${s.map((t) => `<button class="tag hover:bg-indigo-100" data-broll-sugestao="${esc(t)}">${esc(t)}</button>`).join(' ')}` : '';
    const termo = $('[data-broll-termo]', raiz);
    if (!termo.value && s[0]) termo.value = s[0];
  };
  const cenasMudaram = () => {
    const sel = selCena(); if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">(nenhuma: só colocar nos materiais)</option>' + cenas().map((c, i) => `<option value="${i}" ${String(i) === atual ? 'selected' : ''}>${c.tipo === 'cta' ? 'Final' : 'Cena ' + (i + 1)}${c.texto ? ': ' + esc(c.texto).slice(0, 30) : ''}</option>`).join('');
  };

  const cartao = (x, k) => `<button class="group relative aspect-[3/4] overflow-hidden rounded-lg border bg-slate-100 text-left" data-broll-item="${k}" title="${esc(`${x.fonte}${x.autor ? ' · ' + x.autor : ''} — clique para usar`)}">
      <img src="${esc(x.miniatura)}" alt="" loading="lazy" class="h-full w-full object-cover transition group-hover:scale-105" referrerpolicy="no-referrer">
      ${x.tipo === 'video' ? `<span class="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-xs text-white"><i class="fa-solid fa-play"></i> ${x.duracao ? Math.round(x.duracao) + ' s' : 'vídeo'}</span>` : ''}
      <span class="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-[11px] text-white">${esc(x.fonte)}${x.largura ? ` · ${x.largura}×${x.altura}` : ''}</span>
      <span class="absolute inset-0 hidden items-center justify-center bg-indigo-900/60 text-sm font-semibold text-white group-hover:flex"><i class="fa-solid fa-plus mr-1"></i> Usar</span></button>`;

  async function buscar(mais = false) {
    const termo = $('[data-broll-termo]', raiz).value.trim();
    if (!termo) throw new Error('Digite o que procurar (ou clique numa sugestão).');
    est.pagina = mais ? est.pagina + 1 : 1;
    const q = new URLSearchParams({ termo, tipo: $('[data-broll-tipo]', raiz).value, fonte: $('[data-broll-fonte]', raiz).value, pagina: String(est.pagina), orientacao: orientacaoDoFormato(formatoVideo()) });
    const r = await fetch(`/api/broll?${q}`, { headers: await cabecalhos() }).catch(() => { throw new Error('Servidor indisponível (rode npm run dev).'); });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Falha na busca de B-roll.');
    est.itens = mais ? [...est.itens, ...j.itens] : j.itens;
    $('[data-broll-avisos]', raiz).textContent = (j.avisos || []).join(' · ');
    $('[data-broll-grade]', raiz).innerHTML = est.itens.map(cartao).join('') || `<p class="hint col-span-full">Nada encontrado para "${esc(termo)}". Tente outra palavra (termos simples funcionam melhor, ex.: "praia", "academia").</p>`;
    $('[data-broll-mais]', raiz).classList.toggle('hidden', !j.itens.length || est.pagina >= 20);
  }
  on(raiz, 'click', '[data-broll-buscar]', (b) => ocupado(b, () => buscar(false)));
  on(raiz, 'click', '[data-broll-carregar-mais]', (b) => ocupado(b, () => buscar(true)));
  on(raiz, 'keydown', '[data-broll-termo]', (i, ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('[data-broll-buscar]', raiz).click(); } });
  on(raiz, 'click', '[data-broll-sugestao]', (b) => { $('[data-broll-termo]', raiz).value = b.dataset.brollSugestao; $('[data-broll-buscar]', raiz).click(); });
  on(raiz, 'change', '[data-broll-cena]', () => { $('[data-broll-termo]', raiz).value = ''; desenharSugestoes(); });

  on(raiz, 'click', '[data-broll-item]', (b) => ocupado(b, async () => {
    const x = est.itens[Number(b.dataset.brollItem)];
    const r = await fetch('/api/broll/arquivo', { method: 'POST', headers: { ...(await cabecalhos()), 'Content-Type': 'application/json' }, body: JSON.stringify({ url: x.url }) })
      .catch(() => { throw new Error('Servidor indisponível (rode npm run dev).'); });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não consegui baixar este arquivo. Tente outro.');
    const blob = await r.blob();
    const cena = selCena().value === '' ? null : Number(selCena().value);
    await aoAnexar(new File([blob], nomeArquivoBroll(x, blob.type), { type: blob.type }), cena);
    b.classList.add('ring-4', 'ring-emerald-500');
    toast(`${x.tipo === 'video' ? 'Vídeo' : 'Foto'} do ${x.fonte} ${x.tipo === 'video' ? 'adicionado' : 'adicionada'} aos materiais${cena !== null ? ` e ${x.tipo === 'video' ? 'ligado' : 'ligada'} à ${cenas()[cena]?.tipo === 'cta' ? 'cena final' : 'cena ' + (cena + 1)}` : ''}.`);
  }));

  (async () => {
    const st = $('[data-broll-status]', raiz);
    try {
      const r = await fetch('/api/broll/status', { headers: await cabecalhos() });
      if (!r.ok) throw new Error();
      est.status = await r.json();
    } catch { st.innerHTML = '<p class="text-sm text-amber-700"><i class="fa-solid fa-plug-circle-xmark"></i> Servidor indisponível: a busca de B-roll precisa do servidor do app rodando (npm run dev).</p>'; return; }
    if (!est.status.pexels && !est.status.pixabay) {
      st.innerHTML = `<div class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><p class="font-semibold"><i class="fa-solid fa-key"></i> Configure as chaves gratuitas do Pexels/Pixabay para usar.</p>
        <p class="mt-1">1) Crie a conta grátis e copie a chave em <a class="underline" href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer">pexels.com/api</a> e/ou <a class="underline" href="https://pixabay.com/api/docs/" target="_blank" rel="noopener noreferrer">pixabay.com/api</a>.
        2) No arquivo <code>.env</code> do servidor, preencha <code>PEXELS_API_KEY=</code> e/ou <code>PIXABAY_API_KEY=</code>. 3) Reinicie o servidor. Basta uma das duas para funcionar.</p></div>`;
      return;
    }
    st.innerHTML = !est.status.pexels || !est.status.pixabay ? `<p class="hint mb-2">Buscando só no ${est.status.pexels ? 'Pexels' : 'Pixabay'} (a chave do ${est.status.pexels ? 'Pixabay' : 'Pexels'} não está no .env).</p>` : '';
    const fonte = $('[data-broll-fonte]', raiz);
    if (!est.status.pexels || !est.status.pixabay) { fonte.value = est.status.pexels ? 'pexels' : 'pixabay'; fonte.disabled = true; }
    $('[data-broll-corpo]', raiz).classList.remove('hidden');
    if (criativo.produtoId) { try { est.produto = (await db.obter(COL.produtos, criativo.produtoId))?.nome || ''; } catch { /* sem produto: segue com nicho/hook */ } }
    cenasMudaram(); desenharSugestoes();
  })();

  cenasMudaram();
  return { cenasMudaram };
}
