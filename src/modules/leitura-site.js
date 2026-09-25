// Pergunta 0 de "Perguntas para montar o site": o que o cliente JÁ tem publicado.
//  - Site: "Puxar automaticamente" — o servidor lê a página (server/leitura-site.js) e a IA interpreta só aquele
//    texto; se o site bloquear, cai na busca web (a mesma da busca de mercado).
//  - Instagram: por PRINT (a plataforma não permite leitura automática) — a IA lê as imagens, como no Diagnóstico.
// Regras de preenchimento/marcação em lib/leitura.js; prints e fotos do site viram Materiais do cliente (Estúdio).
import { db, COL, enviarArquivo } from '../core/storage.js';
import { tokenAtual } from '../core/auth.js';
import { interpretarSite, lerSitePelaBusca, analisarPrintsInstagram } from '../core/ia.js';
import { tipoLink, sugestoesSite, sugestoesPrints, aplicarLeitura, CAMPOS_AUTO, LEGENDA_PRINTS, MAX_PRINTS, textoMarca } from '../lib/leitura.js';
import { prepararImagem } from './diagnostico.js';
import { esc, $, on, toast, ocupado, dataBR, campoArquivo } from '../core/ui.js';

const rotuloCampo = (k) => (CAMPOS_AUTO.find(([c]) => c === k) || [, k])[1];

async function postServidor(caminho, corpo) {
  const token = await tokenAtual();
  let r;
  try { r = await fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(corpo) }); }
  catch { throw Object.assign(new Error('Não consegui falar com o servidor. Ele está rodando?'), { status: 0 }); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.erro || `Erro ${r.status}.`), { status: r.status }); }
  return r;
}

/** HTML da pergunta 0 (fica antes da pergunta "a"). */
export function perguntaZeroHtml(cliente) {
  const ls = cliente.leituraSite; const li = cliente.leituraInstagram;
  return `<li class="rounded-lg border border-indigo-200 bg-indigo-50/30 p-3" data-pergunta="presenca">
    <div class="flex items-start justify-between gap-2"><p class="text-sm font-semibold">0) O cliente já tem site ou Instagram?</p><span data-ok="presenca"></span></div>
    <p class="hint mb-2">Comece por aqui: o app lê o que já existe e preenche sozinho tom de voz, diferencial, provas sociais, estética e produtos — cada campo fica marcado para você confirmar ou editar. Só material do <b>próprio cliente</b>, nunca de concorrente.</p>

    <div class="rounded-lg border border-slate-200 bg-white p-2">
      <p class="text-sm font-medium"><i class="fa-solid fa-globe text-indigo-500"></i> Site</p>
      <div class="mt-1 flex flex-wrap gap-2"><input class="input min-w-0 flex-1" data-link-presenca value="${esc(ls?.url || '')}" placeholder="https://www.lojadocliente.com.br">
        <button type="button" class="btn-ia btn-sm" data-puxar title="Lê a página do site e preenche o que encontrar"><i class="fa-solid fa-wand-magic-sparkles"></i> Puxar automaticamente</button></div>
      <label class="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" data-proprio ${ls?.url ? 'checked' : ''}> Confirmo que é o site do próprio cliente</label>
      <p class="hint">Leva de 30 s a 1 min. Se o site bloquear a leitura direta, o app tenta pela busca na web (1 a 2 min).</p>
      <div data-resultado-leitura class="mt-2">${resultadoHtml(cliente, 'site')}</div></div>

    <div class="mt-2 rounded-lg border border-slate-200 bg-white p-2">
      <p class="text-sm font-medium"><i class="fa-brands fa-instagram text-pink-500"></i> O cliente já tem Instagram? Envie prints do perfil e de alguns posts</p>
      <p class="hint mb-1">${esc(LEGENDA_PRINTS)}. Até ${MAX_PRINTS} imagens.</p>
      ${campoArquivo({ attrs: 'data-prints', accept: 'image/*', multiple: true, icone: 'camera', texto: 'Enviar prints do Instagram', destaque: false, lista: true })}
      <label class="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" data-prints-proprio> Confirmo que são prints do Instagram do próprio cliente</label>
      <button type="button" class="btn-ia btn-sm mt-1" data-analisar-prints><i class="fa-solid fa-wand-magic-sparkles"></i> Ler prints com IA</button>
      <p class="hint">Leva cerca de 1 min. Os prints também ficam salvos em Materiais do cliente (Estúdio), para usar como referência visual ou prova social.</p>
      <div data-resultado-prints class="mt-2">${resultadoHtml(cliente, 'instagram')}</div></div></li>`;
}

function resultadoHtml(cliente, fonte) {
  const insta = fonte === 'instagram';
  const ls = insta ? cliente.leituraInstagram : cliente.leituraSite;
  if (!ls) return '';
  const importadas = new Set(ls.importadas || []);
  const marca = cliente.autoPreenchido?.estetica;
  return `<div class="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
      <p class="hint">Última leitura: ${insta ? `${ls.total} print(s)` : esc(ls.url)} · ${dataBR(ls.em)}${ls.via === 'busca' ? ' · o site bloqueou a leitura direta, usei a busca na web' : ''}</p>
      ${ls.encontrado === false ? `<p class="mt-1 text-amber-800"><i class="fa-solid fa-circle-info"></i> <b>Nada relevante encontrado</b> ${insta ? 'nos prints' : 'no site'} — nenhum campo foi preenchido.${ls.observacao ? ` ${esc(ls.observacao)}` : ''} ${insta ? 'Tente prints mais nítidos da bio e de posts com legenda, ou preencha as perguntas abaixo à mão.' : 'Preencha as perguntas abaixo à mão.'}</p>` : ''}
      ${ls.resumo ? `<p class="mt-1 text-slate-700">${esc(ls.resumo)}</p>` : ''}
      ${insta && (ls.imagens || []).length ? `<ul class="mt-1 space-y-0.5 text-xs">${ls.imagens.map((im) => `<li class="${im.legivel ? 'text-slate-600' : 'text-amber-800'}"><b>Print ${im.numero}:</b> ${esc(im.conteudo)}</li>`).join('')}</ul>` : ''}
      ${ls.preenchidos?.length || ls.produtosCriados ? `<p class="mt-1 text-emerald-700"><i class="fa-solid fa-circle-check"></i> Preenchido: ${[...(ls.preenchidos || []).map(rotuloCampo), ls.produtosCriados ? `${ls.produtosCriados} produto(s)` : ''].filter(Boolean).join(', ')} — marcados como automáticos.</p>` : ''}
      ${insta && cliente.marca?.estetica ? `<div class="mt-2"><label class="label">Estética / paleta de cor</label><textarea class="input" rows="2" data-marca="estetica">${esc(cliente.marca.estetica)}</textarea>
        ${marca ? `<span class="mt-1 inline-flex flex-wrap items-center gap-1"><span class="tag tag-warn"><i class="fa-solid fa-robot mr-1"></i>${esc(textoMarca(marca))}</span><button type="button" class="text-xs text-indigo-600 underline" data-confirmar-campo="estetica">Confirmar</button></span>` : ''}
        <p class="hint">Vai para o perfil de marca; a geração de criativos usa como estética real da marca.</p></div>` : ''}
      ${(ls.conflitos || []).map((c, i) => `<div class="mt-2 rounded border border-amber-200 bg-white p-2"><p><b>${esc(rotuloCampo(c.campo))}</b>: você já tinha preenchido, então não troquei. Sugestão ${insta ? 'dos prints' : 'do site'}:</p>
        <p class="text-slate-600">“${esc(c.sugerido)}”</p><div class="mt-1 flex gap-2"><button type="button" class="btn-ghost btn-sm" data-usar-sugestao="${i}" data-fonte="${fonte}">Usar a sugestão</button><button type="button" class="btn-ghost btn-sm" data-ignorar-sugestao="${i}" data-fonte="${fonte}">Manter o meu</button></div></div>`).join('')}
      ${(ls.descartados || []).length ? `<details class="mt-2"><summary class="cursor-pointer text-xs text-slate-500">${ls.descartados.length} item(ns) recusado(s) por falta de base</summary><ul class="list-disc pl-5 text-xs text-slate-500">${ls.descartados.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}
      ${!insta && (ls.imagens || []).length ? `<div class="mt-3 border-t border-slate-200 pt-2"><p class="font-medium">Fotos encontradas no site do cliente</p>
        <p class="hint mb-1">São fotos do próprio site dele (pertencem ao cliente, não a terceiros). Marque as que quer guardar: elas vão para os <b>Materiais do cliente</b> e aparecem no Estúdio (Gerar foto e vídeo).</p>
        <div class="flex flex-wrap gap-2">${ls.imagens.map((im, i) => `<label class="relative cursor-pointer" title="${esc(im.alt || '')}"><img src="${esc(im.url)}" alt="${esc(im.alt || '')}" class="h-16 w-16 rounded border object-cover" loading="lazy" referrerpolicy="no-referrer">
          ${importadas.has(im.url) ? '<span class="absolute bottom-0 left-0 right-0 bg-emerald-600/90 text-center text-[10px] text-white">salva</span>' : `<input type="checkbox" class="absolute left-1 top-1" data-foto-site="${i}">`}</label>`).join('')}</div>
        <button type="button" class="btn-ghost btn-sm mt-2" data-importar-fotos><i class="fa-solid fa-download"></i> Importar selecionadas como Materiais do cliente</button></div>` : ''}
    </div>`;
}

const chaveLeitura = (fonte) => (fonte === 'instagram' ? 'leituraInstagram' : 'leituraSite');

/** Liga os botões da pergunta 0. ctx = { cliente, produtos, recarregar } (o mesmo das perguntas). */
export function ligarPerguntaZero(alvo, ctx) {
  const { cliente } = ctx;
  on(alvo, 'click', '[data-puxar]', (b) => {
    const link = tipoLink($('[data-link-presenca]', alvo).value);
    if (link?.tipo === 'instagram') return toast('Instagram não permite leitura automática: envie prints do perfil no campo "Instagram", logo abaixo.', 'erro');
    if (!link) return toast('Cole o link do site (ex.: https://www.lojadocliente.com.br).', 'erro');
    if (!$('[data-proprio]', alvo).checked) return toast('Confirme que o site é do próprio cliente. A leitura não é feita em site de concorrente.', 'erro');
    return ocupado(b, () => puxarSite(link, ctx));
  });
  on(alvo, 'click', '[data-analisar-prints]', (b) => {
    const arqs = [...($('[data-prints]', alvo).files || [])].filter((f) => f.type.startsWith('image/'));
    if (!arqs.length) return toast('Envie ao menos um print (bio, grid ou post).', 'erro');
    if (arqs.length > MAX_PRINTS) return toast(`Envie no máximo ${MAX_PRINTS} prints por vez.`, 'erro');
    if (!$('[data-prints-proprio]', alvo).checked) return toast('Confirme que os prints são do Instagram do próprio cliente.', 'erro');
    return ocupado(b, () => lerPrints(arqs, ctx));
  });
  on(alvo, 'click', '[data-usar-sugestao]', async (b) => {
    const k = chaveLeitura(b.dataset.fonte); const ls = cliente[k]; const c = ls.conflitos[Number(b.dataset.usarSugestao)];
    const meta = { origem: b.dataset.fonte === 'instagram' ? 'instagram' : 'site', url: ls.url || null, em: ls.em };
    await salvarCliente(cliente, { marca: { ...cliente.marca, [c.campo]: c.sugerido }, autoPreenchido: { ...(cliente.autoPreenchido || {}), [c.campo]: meta },
      [k]: { ...ls, conflitos: ls.conflitos.filter((x) => x !== c) } });
    toast(`${rotuloCampo(c.campo)} trocado pela sugestão (marcado como automático).`); ctx.recarregar();
  });
  on(alvo, 'click', '[data-ignorar-sugestao]', async (b) => {
    const k = chaveLeitura(b.dataset.fonte); const ls = cliente[k]; const c = ls.conflitos[Number(b.dataset.ignorarSugestao)];
    await salvarCliente(cliente, { [k]: { ...ls, conflitos: ls.conflitos.filter((x) => x !== c) } }); ctx.recarregar();
  });
  on(alvo, 'click', '[data-importar-fotos]', (b) => ocupado(b, async () => {
    const ls = cliente.leituraSite;
    const escolhidas = [...alvo.querySelectorAll('[data-foto-site]:checked')].map((i) => ls.imagens[Number(i.dataset.fotoSite)]);
    if (!escolhidas.length) throw new Error('Marque ao menos uma foto.');
    let ok = 0; const falhas = [];
    for (const im of escolhidas) {
      try {
        const blob = await (await postServidor('/api/leitura-site/imagem', { url: im.url, site: ls.url })).blob();
        await salvarMaterial(cliente, blob, 'site', { fonte: ls.url, fonteImagem: im.url, descricao: im.alt || '' });
        ok++; ls.importadas = [...(ls.importadas || []), im.url];
      } catch (e) { falhas.push(e.message); }
    }
    await salvarCliente(cliente, { leituraSite: { ...ls } });
    toast(ok ? `${ok} foto(s) salva(s) em Materiais do cliente — use no Estúdio.${falhas.length ? ` ${falhas.length} falharam (${falhas[0]}).` : ''}` : `Nenhuma foto importada: ${falhas[0] || 'erro'}`, ok ? 'ok' : 'erro');
    ctx.recarregar();
  }));
}

async function salvarCliente(cliente, patch) {
  Object.assign(cliente, patch);
  await db.atualizar(COL.clientes, cliente.id, patch);
}

/** Guarda uma imagem em Materiais do cliente (Storage + gcc_materiais), para o Estúdio. */
async function salvarMaterial(cliente, blob, origem, extra = {}) {
  const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[blob.type] || 'jpg';
  const nome = `${origem}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const env = await enviarArquivo(`gcc/${cliente.id}/materiais/${nome}`, new File([blob], nome, { type: blob.type || 'image/jpeg' }));
  await db.criar(COL.materiais, { clienteId: cliente.id, url: env.url, path: env.path, nome, origem, ...extra });
}

/** Aplica as sugestões (só em campo vazio), cria os produtos novos e grava o resumo em cliente[chave]. */
async function aplicarEGravar(ctx, sug, meta, chave, extras) {
  const { cliente } = ctx;
  const encontrado = sug.encontrado !== false;
  const produtosAtuais = await db.listar(COL.produtos, { clienteId: cliente.id });
  const ap = encontrado ? aplicarLeitura(cliente, produtosAtuais, sug, meta) : { patch: {}, preenchidos: [], conflitos: [], novosProdutos: [] };
  for (const p of ap.novosProdutos) await db.criar(COL.produtos, { clienteId: cliente.id, ...p });
  await salvarCliente(cliente, {
    ...ap.patch,
    [chave]: { em: meta.em, encontrado, resumo: sug.resumo || '', observacao: sug.observacao || '', preenchidos: ap.preenchidos, conflitos: ap.conflitos,
      descartados: sug.descartados || [], produtosCriados: ap.novosProdutos.length, ...extras },
  });
  toast(!encontrado ? 'Nada relevante encontrado — nenhum campo foi preenchido.' : `Leitura pronta: ${ap.preenchidos.length} campo(s) e ${ap.novosProdutos.length} produto(s) preenchidos. Confira as marcas "automático".`, encontrado ? 'ok' : 'info');
  ctx.recarregar();
}

async function puxarSite(link, ctx) {
  const { cliente } = ctx;
  const em = new Date().toISOString();
  let sug, via = 'pagina', imagens = [], leitura = null;
  try { leitura = await (await postServidor('/api/leitura-site', { url: link.url })).json(); }
  catch (e) {
    // Site bloqueou/robô recusado: tenta a busca web (mesmo mecanismo da busca de mercado). Erro de endereço: para aqui.
    if (![424, 502].includes(e.status)) throw e;
    via = 'busca';
    toast('O site não deixou ler a página direto. Tentando pela busca na web (1 a 2 min)…', 'info');
  }
  if (leitura) {
    sug = sugestoesSite({ leitura, interpretacao: await interpretarSite({ cliente, leitura }), via });
    imagens = leitura.imagens || [];
    if (!sug.resumo && !Object.keys(sug.campos).length && !sug.produtos.length) sug.encontrado = false;
  } else {
    const r = await lerSitePelaBusca({ cliente, url: link.url });
    sug = r.encontrado ? sugestoesSite({ interpretacao: r, via }) : { campos: {}, produtos: [], descartados: [], resumo: '', encontrado: false, observacao: r.observacao };
  }
  await aplicarEGravar(ctx, sug, { origem: 'site', url: link.url, em }, 'leituraSite', { tipo: 'site', url: link.url, via, imagens: imagens.slice(0, 24), importadas: [] });
}

async function lerPrints(arqs, ctx) {
  const { cliente } = ctx;
  const em = new Date().toISOString();
  const preparados = await Promise.all(arqs.map((f) => prepararImagem(f, 1568, 0.88))); // mesmo tamanho do Diagnóstico
  const resposta = await analisarPrintsInstagram({ cliente, imagens: preparados.map(({ media_type, data }) => ({ media_type, data })) });
  const sug = sugestoesPrints({ resposta, total: arqs.length });
  // Os prints ficam em Materiais do cliente (referência visual / prova social no Estúdio), achando algo ou não.
  let salvos = 0;
  for (const [i, p] of preparados.entries()) {
    try { await salvarMaterial(cliente, await (await fetch(p.dataUrl)).blob(), 'instagram', { descricao: `Print ${i + 1} do Instagram${sug.imagens[i]?.conteudo ? ` — ${sug.imagens[i].conteudo.slice(0, 120)}` : ''}` }); salvos++; }
    catch { /* segue: a leitura já foi feita */ }
  }
  await aplicarEGravar(ctx, sug, { origem: 'instagram', url: null, em }, 'leituraInstagram', { tipo: 'instagram', total: arqs.length, imagens: sug.imagens, materiaisSalvos: salvos });
}
