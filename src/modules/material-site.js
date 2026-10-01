// Painel "Material para montar o site" (topo da aba Site/Loja): uma visão única de tudo o que já existe do cliente —
// perfil de marca, provas sociais, produtos, site de referência, rastreamento, Materiais e o questionário — para
// revisar antes de gerar. É só uma camada de LEITURA: cada linha aponta ("Editar") para o campo/tela real; o painel
// nunca guarda cópia de nada. A exceção é o envio de prints de prova social, que grava no lugar de sempre
// (campo "provas sociais" + Materiais), pelo mesmo componente da pergunta 10, e o envio do logo (mesmo componente da
// pergunta 9), que aparece quando falta logo.
import { resumoMaterialSite, provasEmImagem } from '../lib/prova-social.js';
import { provaSocialHtml, ligarProvaSocial } from './prova-social.js';
import { logoHtml, ligarLogo } from './logo-cliente.js';
import { esc, $, on, toast } from '../core/ui.js';

const abertoPorCliente = new Map();

/**
 * Monta o painel em `alvo`. ctx = { cliente, produtos, materiais, site, respondidas, totalPerguntas, recarregar,
 * gerar(botao) | null, irParaPergunta(id) }. Sem `gerar` (modo do site ainda não escolhido), o botão explica o que falta.
 */
export function montarPainelMaterial(alvo, ctx) {
  const itens = resumoMaterialSite(ctx);
  const provas = provasEmImagem(ctx.materiais);
  const totalAvisos = itens.reduce((n, it) => n + it.avisos.length, 0);
  const aberto = abertoPorCliente.has(ctx.cliente.id) ? abertoPorCliente.get(ctx.cliente.id) : true;
  const editar = (it) => (it.editar.tipo === 'rota'
    ? `<a class="text-xs text-indigo-600 underline" href="${esc(it.editar.alvo)}">Editar</a>`
    : `<button type="button" class="text-xs text-indigo-600 underline" data-ir-pergunta="${esc(it.editar.alvo || '')}">Editar</button>`);
  const campos = (it) => (it.campos ? `<span class="flex flex-wrap gap-1">${it.campos.map((c) => `<span class="tag ${c.ok ? 'tag-ok' : ''}" ${c.pergunta ? `data-ir-pergunta="${esc(c.pergunta)}" role="button" title="Ir para a pergunta"` : ''}>${c.ok ? '<i class="fa-solid fa-check mr-1"></i>' : '<i class="fa-regular fa-circle mr-1"></i>'}${esc(c.rotulo)}${c.ok ? '' : ': não'}</span>`).join('')}</span>` : '');
  alvo.innerHTML = `<details class="card mb-4 border-indigo-200" data-painel-material ${aberto ? 'open' : ''}>
    <summary class="cursor-pointer"><span class="font-semibold"><i class="fa-solid fa-boxes-stacked mr-1 text-indigo-500"></i> Material para montar o site</span>
      <span class="ml-2 text-sm ${totalAvisos ? 'text-amber-700' : 'text-emerald-700'}">${totalAvisos ? `${totalAvisos} ponto(s) de atenção` : 'tudo certo'}</span></summary>
    <p class="caption mt-2">Tudo o que já temos deste cliente para montar o site. Revise antes de gerar. Nada aqui é uma cópia: "Editar" leva ao campo de verdade, e o que faltar não impede de gerar.</p>
    <ul class="mt-3 divide-y divide-slate-100 text-sm" data-itens-material>${itens.map((it) => `<li class="py-2" data-item-material="${it.chave}">
      <div class="flex flex-wrap items-start justify-between gap-2"><div class="min-w-0"><b>${esc(it.titulo)}</b>${it.linhas.length ? ` <span class="text-slate-600">· ${esc(it.linhas.join(' · '))}</span>` : ''}</div>${editar(it)}</div>
      ${campos(it) ? `<div class="mt-1">${campos(it)}</div>` : ''}
      ${it.chave === 'provas' && provas.length ? `<div class="mt-1 flex flex-wrap gap-1">${provas.slice(0, 8).map((p) => `<img src="${esc(p.url)}" alt="Print de prova social" title="${esc(p.descricao || '')}" class="h-10 w-10 rounded border object-cover" loading="lazy">`).join('')}${provas.length > 8 ? `<span class="hint self-center">+${provas.length - 8}</span>` : ''}</div>` : ''}
      ${it.avisos.map((a) => `<p class="mt-1 text-xs font-medium text-amber-700"><i class="fa-solid fa-circle-info"></i> ${esc(a)}</p>`).join('')}
      ${it.chave === 'materiais' && it.avisos.includes('Sem logo') ? `<div class="mt-1" data-logo-painel>${logoHtml(ctx.cliente)}</div>` : ''}
      ${it.chave === 'provas' ? `<details class="mt-1"><summary class="cursor-pointer text-xs text-indigo-600">Chegou prova nova? Enviar prints aqui</summary>${provaSocialHtml('painel')}</details>` : ''}</li>`).join('')}</ul>
    <div class="mt-3 rounded-lg bg-slate-50 p-3"><p class="caption mb-2"><b>Gerar site com este material:</b> é o mesmo "Gerar textos com IA" do formulário abaixo, no modo deste cliente (${ctx.site?.modo === 'custom' ? 'site personalizado' : ctx.site?.modo ? 'pacote de plataforma' : 'modo ainda não escolhido'}), usando tudo o que está listado acima. Depois é só revisar e baixar.</p>
      <button type="button" class="btn-ia" data-gerar-material><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar site com este material</button></div>
  </details>`;

  $('[data-painel-material]', alvo).addEventListener('toggle', (e) => abertoPorCliente.set(ctx.cliente.id, e.target.open));
  ligarProvaSocial($('[data-prova-img="painel"]', alvo), ctx);
  const caixaLogo = $('[data-logo-painel]', alvo);
  if (caixaLogo) ligarLogo(caixaLogo, ctx.cliente, () => ctx.recarregar());
  on(alvo, 'click', '[data-ir-pergunta]', (b) => ctx.irParaPergunta(b.dataset.irPergunta || null));
  on(alvo, 'click', '[data-gerar-material]', (b) => {
    if (!ctx.gerar) return toast('Escolha primeiro como a loja será entregue (site personalizado ou pacote), logo abaixo — ou responda a pergunta 18.', 'erro');
    if (!ctx.produtos.length && ctx.site?.modo !== 'custom') return toast('Cadastre pelo menos um produto antes de gerar o pacote.', 'erro');
    return ctx.gerar(b);
  });
}
