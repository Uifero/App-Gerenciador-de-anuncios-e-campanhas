// Aba "Aprovações do site" (dentro do cliente, ao lado de Site/Loja) e a página pública do link do site.
// Usa a mesma estrutura do link de aprovação dos criativos (aprovacao.js): o link é um SNAPSHOT em gcc_aprovacoes
// (tipo 'site', itensIds ['site']) e a resposta do cliente vai para gcc_aprovacao_respostas (id "<token>_site"),
// com as mesmas regras do Firestore. Regras de data, status e "substituído": lib/aprovacao-site.js.
import { db, COL } from '../core/storage.js';
import { gerarSiteHTML } from '../lib/sitegen.js';
import { versoesDoModo } from '../lib/site-blocos.js';
import {
  dataHoraBR, statusDoLink, ordenarLinks, idMaisRecente, aSubstituir, mensagemParaCliente, modoRotulo, novaValidade, respostaValida,
  linkAtivo, SECOES_SITE, comentarioComSecao, lerSecao,
} from '../lib/aprovacao-site.js';
import { novoToken, linkDe, linkSoLocal } from './aprovacao.js';
import { pacoteTexto } from './sites.js';
import { esc, $, on, montar, cabecalho, tag, toast, copiar, ocupado, confirmar, vazio } from '../core/ui.js';

const COR = { aprovado: 'tag-ok', ajuste: 'tag-bad', aguardando: 'tag-info', substituido: '', expirado: 'tag-warn', desativado: '' };
const LIMITE_SNAPSHOT = 900 * 1024; // documento do Firestore: até 1 MB

/** Versão atual do site no modo dele (a mesma numeração de "Ajustar este site"; sem ajustes ainda = v1). */
const versaoAtual = (site, modo) => versoesDoModo(site, modo === 'custom' ? 'custom' : 'pacote')[0]?.n || 1;
/**
 * Versão mostrada no link: a de "Ajustar este site" ou, se o site mudou por outro caminho (formulário, IA) desde o
 * último link, a do último link + 1. Site igual ao do último link = mesma versão.
 */
const versaoDoLink = (site, anteriores, conteudo) => {
  const ult = anteriores[0];
  const mudou = !ult || (ult.html || ult.texto || '') !== conteudo;
  return Math.max(versaoAtual(site, site.modo), (ult?.versao || 0) + (mudou ? 1 : 0));
};

/** Cria o link a partir do site COMO ESTÁ AGORA e marca os anteriores ativos como substituídos. */
export async function gerarLinkSite(cliente, site, produtos) {
  const custom = site?.modo === 'custom';
  if (!site?.modo || (custom ? !site.conteudo : !site.pacote)) throw new Error(custom ? 'Monte o site primeiro (aba Site/Loja: conteúdo da loja).' : 'Gere o pacote primeiro (aba Site/Loja).');
  const html = custom ? gerarSiteHTML({ cliente, produtos, conteudo: site.conteudo || {}, config: site.config || {}, layout: site.layout || null, url: site.linkPublicado || '' }) : '';
  const texto = custom ? '' : pacoteTexto(site.pacote);
  if ((html || texto).length > LIMITE_SNAPSHOT) throw new Error('O site ficou grande demais para o link (fotos coladas dentro do texto?). Use fotos enviadas pela aba Produtos.');
  const anteriores = ordenarLinks(await db.listar(COL.aprovacoes, { clienteId: cliente.id }));
  const token = novoToken();
  const novo = await db.criar(COL.aprovacoes, {
    tipo: 'site', clienteId: cliente.id, clienteNome: cliente.nome, itensIds: ['site'], expiraMs: novaValidade(),
    modo: custom ? 'custom' : 'pacote', plataforma: custom ? null : site.plataforma || null, versao: versaoDoLink(site, anteriores, html || texto), html, texto,
  }, token);
  const criadoEm = novo?.criadoEm || new Date().toISOString();
  for (const l of aSubstituir(anteriores, token)) await db.atualizar(COL.aprovacoes, l.id, { substituidoEm: criadoEm, substituidoPorEm: criadoEm, substituidoPor: token });
  return { token, criadoEm };
}

// ---------------- aba do cliente ----------------
export const view = (el, cliente) => montar(el, async (root, recarregar) => {
  const [sites, produtos, todos, respostas] = await Promise.all([
    db.listar(COL.sites, { clienteId: cliente.id }), db.listar(COL.produtos, { clienteId: cliente.id }),
    db.listar(COL.aprovacoes, { clienteId: cliente.id }), db.listar(COL.respostas, { clienteId: cliente.id }),
  ]);
  const site = sites[0] || null;
  const links = ordenarLinks(todos);
  const resp = (l) => respostas.find((r) => r.token === l.id && r.criativoId === 'site') || null;
  // Copia a resposta válida para o próprio link: é o que vai no backup (o arquivo não guarda o token da resposta).
  for (const l of links) {
    const r = respostaValida(l, resp(l));
    if (r && r.em !== l.resposta?.em) { const resposta = { status: r.status, comentario: r.comentario || '', em: r.em }; await db.atualizar(COL.aprovacoes, l.id, { resposta }, { silencioso: true }).catch(() => {}); l.resposta = resposta; }
  }
  const recente = idMaisRecente(links);

  const linha = (l) => {
    const s = statusDoLink(l, resp(l));
    return `<li class="rounded-lg border ${l.id === recente ? 'border-indigo-300' : 'border-slate-200'} p-3" data-link-site="${esc(l.id)}">
      <div class="flex flex-wrap items-center gap-2"><b data-criado>${esc(dataHoraBR(l.criadoEm))}</b>${tag(`v${l.versao || 1} · ${modoRotulo(l.modo)}`)}${tag(s.texto, COR[s.tipo])}${l.id === recente ? tag('Mais recente', 'tag-ok') : ''}</div>
      ${s.tipo === 'ajuste' ? `<div class="mt-2 rounded bg-rose-50 p-2 text-sm text-rose-800" data-ajuste-pedido>${s.secao ? `<b>Seção:</b> ${esc(s.secao)}<br>` : ''}${esc(s.comentario || '(sem comentário)')}</div>` : ''}
      ${s.tipo === 'aprovado' && s.comentario ? `<p class="mt-2 text-sm text-emerald-800">Comentário: ${esc(s.comentario)}</p>` : ''}
      <div class="mt-2 flex flex-wrap gap-2">
        <button class="btn-ghost btn-sm" data-copiar-link="${esc(l.id)}"><i class="fa-solid fa-copy"></i> Copiar link</button>
        <button class="btn-ghost btn-sm" data-copiar-msg="${esc(l.id)}"><i class="fa-brands fa-whatsapp"></i> Copiar mensagem para o cliente</button>
        <a class="btn-ghost btn-sm" href="${esc(linkDe(l.id))}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> Abrir</a>
        ${s.tipo === 'expirado' ? `<button class="btn-primary btn-sm" data-renovar="${esc(l.id)}" title="Mais ${30} dias, mesmo endereço"><i class="fa-solid fa-rotate"></i> Renovar</button>` : ''}
        ${!l.desativadoEm ? `<button class="btn-danger btn-sm" data-desativar="${esc(l.id)}" title="O link deixa de abrir"><i class="fa-solid fa-ban"></i> Desativar</button>` : ''}</div></li>`;
  };

  root.innerHTML = `${cabecalho('Aprovações do site', 'Cada vez que o site muda, gere um link novo. O mais recente fica no topo.',
    `<button class="btn-primary" data-gerar-link-site ${site?.modo ? '' : 'disabled'}><i class="fa-solid fa-link"></i> Gerar novo link</button>`)}
    ${linkSoLocal() ? '<div class="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800"><i class="fa-solid fa-triangle-exclamation"></i> Você está usando o painel em <b>localhost</b>: o link só abre neste computador. Defina <code>VITE_URL_PUBLICA</code> (veja o README) para o cliente conseguir abrir.</div>' : ''}
    <p class="caption mb-3">O link mostra o site como está na hora em que é gerado (${site?.modo ? `site ${modoRotulo(site.modo === 'custom' ? 'custom' : 'pacote')}` : 'escolha antes o modo na aba Site/Loja'}). O cliente abre sem login, navega e clica em Aprovar ou Pedir ajuste. Gerar um link novo desativa as respostas dos anteriores: ninguém aprova uma versão antiga.</p>
    ${links.length ? `<ul class="space-y-2" data-lista-links-site>${links.map(linha).join('')}</ul>` : vazio('link', 'Nenhum link ainda', 'Clique em "Gerar novo link" para mandar a prévia do site ao cliente.')}`;

  const achar = (id) => links.find((l) => l.id === id);
  on(root, 'click', '[data-gerar-link-site]', (b) => ocupado(b, async () => {
    await gerarLinkSite(cliente, site, produtos);
    toast('Link novo criado. Os anteriores passaram a "Substituído".'); recarregar();
  }));
  on(root, 'click', '[data-copiar-link]', (b) => copiar(linkDe(b.dataset.copiarLink)));
  on(root, 'click', '[data-copiar-msg]', (b) => copiar(mensagemParaCliente(achar(b.dataset.copiarMsg), linkDe(b.dataset.copiarMsg))));
  on(root, 'click', '[data-renovar]', (b) => ocupado(b, async () => {
    await db.atualizar(COL.aprovacoes, b.dataset.renovar, { expiraMs: novaValidade() }); toast('Link renovado por mais 30 dias (mesmo endereço).'); recarregar();
  }));
  on(root, 'click', '[data-desativar]', async (b) => {
    if (!(await confirmar('Desativar este link? Ele deixa de abrir para o cliente. A resposta que ele já deu continua guardada.', 'Desativar'))) return;
    await db.atualizar(COL.aprovacoes, b.dataset.desativar, { desativadoEm: new Date().toISOString(), expiraMs: 0 }); toast('Link desativado.'); recarregar();
  });
});

// ---------------- página pública (sem login) ----------------
/** `doc` = snapshot já lido por viewPublica (aprovacao.js). */
export async function viewPublicaSite(app, token, doc) {
  document.title = 'Aprovação do site';
  const rid = `${token}_site`;
  let r = null;
  try { r = respostaValida(doc, await db.obter(COL.respostas, rid)); } catch { r = null; }
  let editando = false;
  const ativo = linkAtivo(doc);

  const corpo = doc.modo === 'custom'
    ? `<iframe title="Prévia do site" sandbox="allow-scripts allow-popups allow-forms" class="h-[75vh] w-full rounded-lg border border-slate-200 bg-white" data-site-previa></iframe>`
    : `<pre class="max-h-[75vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm" data-site-previa>${esc(doc.texto || '')}</pre>`;

  const blocoResposta = () => {
    if (!ativo) {
      return `<div class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800" data-aviso-versao><b><i class="fa-solid fa-clock-rotate-left"></i> Existe uma versão mais nova deste site. Peça o link atualizado.</b></div>
        <div class="mt-2 flex flex-wrap gap-2 opacity-60"><button class="btn-primary" disabled><i class="fa-solid fa-check"></i> Aprovar</button><button class="btn-ghost" disabled><i class="fa-solid fa-pen"></i> Pedir ajuste</button></div>`;
    }
    if (r && !editando) {
      const { secao, texto } = lerSecao(r.comentario);
      return `<div class="rounded-lg p-3 text-sm ${r.status === 'aprovado' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}" data-resposta-dada>
        ${r.status === 'aprovado' ? '<b><i class="fa-solid fa-circle-check"></i> Você aprovou este site.</b>' : '<b><i class="fa-solid fa-pen"></i> Você pediu ajuste.</b>'}
        ${secao ? `<p class="mt-1"><b>Seção:</b> ${esc(secao)}</p>` : ''}${texto ? `<p class="mt-1 whitespace-pre-wrap">${esc(texto)}</p>` : ''}
        <button class="btn-ghost btn-sm mt-2" data-alterar>Alterar resposta</button></div>`;
    }
    return `<label class="label" for="secao">Seção <span class="font-normal text-slate-500">(ao pedir ajuste)</span></label>
      <select id="secao" class="input" data-secao>${SECOES_SITE.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
      <label class="label mt-2" for="coment">Comentário <span class="font-normal text-slate-500">(opcional ao aprovar; explique o ajuste ao pedir)</span></label>
      <textarea id="coment" class="input" rows="3" maxlength="900" data-comentario></textarea><p class="hint" data-erro role="alert"></p>
      <div class="mt-2 flex flex-wrap gap-2"><button class="btn-primary" data-responder="aprovado"><i class="fa-solid fa-check"></i> Aprovar</button>
        <button class="btn-ghost" data-responder="ajuste"><i class="fa-solid fa-pen"></i> Pedir ajuste</button></div>`;
  };

  app.innerHTML = `<div class="mx-auto max-w-5xl p-4 sm:p-6">
    <header class="mb-4"><p class="caption">${esc(doc.clienteNome)}</p><h1 class="text-2xl font-bold">Prévia do seu site</h1>
      <p class="mt-1 inline-block rounded bg-indigo-50 px-2 py-1 text-sm font-semibold text-indigo-800" data-versao-publica>Versão de ${esc(dataHoraBR(doc.criadoEm))}</p>
      <p class="caption mt-1">Navegue pela prévia abaixo e, no fim da página, clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.${doc.modo === 'custom' ? '' : ' Este é o conteúdo (textos e banners) que vai para a sua loja na plataforma.'}</p></header>
    ${ativo ? '' : '<div class="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" data-aviso-topo><b>Existe uma versão mais nova deste site. Peça o link atualizado.</b></div>'}
    ${corpo}
    <section class="card mt-4" data-bloco-resposta>${blocoResposta()}</section>
    <p class="hint mt-3 text-center">Este link é pessoal. Ele permite apenas ver esta prévia e responder sobre ela.</p></div>`;
  const ifr = $('iframe[data-site-previa]', app); if (ifr) ifr.srcdoc = doc.html || '';

  const redesenhar = () => { $('[data-bloco-resposta]', app).innerHTML = blocoResposta(); };
  on(app, 'click', '[data-alterar]', () => { editando = true; redesenhar(); });
  on(app, 'click', '[data-responder]', async (b) => {
    if (!linkAtivo(doc)) return;
    const status = b.dataset.responder;
    const texto = $('[data-comentario]', app).value.trim(), secao = $('[data-secao]', app).value;
    if (status === 'ajuste' && !texto) { const e = $('[data-erro]', app); e.textContent = 'Conte o que precisa ser ajustado.'; e.className = 'hint text-rose-600'; return; }
    await ocupado(b, async () => {
      const resp = { token, clienteId: doc.clienteId, criativoId: 'site', status, comentario: status === 'ajuste' ? comentarioComSecao(secao, texto) : texto.slice(0, 1000), em: new Date().toISOString() };
      try { await db.definir(COL.respostas, rid, resp, { silencioso: true }); }
      catch { throw new Error('Não foi possível enviar sua resposta. O link pode ter expirado ou sido trocado por uma versão mais nova; peça um novo link a quem o enviou.'); }
      r = resp; editando = false; redesenhar();
    });
  });
}
