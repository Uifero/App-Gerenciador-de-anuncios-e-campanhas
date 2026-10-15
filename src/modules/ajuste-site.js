// "Ajustar este site" (aba Site/Loja): pedido em palavras do operador + controles manuais + sugestões ("Fazer essa
// mudança"), todos gerando OPERAÇÕES validadas por lib/site-blocos.js. O pedido livre passa por duas etapas:
//  1. "Entendi assim": quais seções ele mexe (IA barata, ou sem IA quando a seção já é conhecida), com o custo estimado;
//  2. só essas seções vão para a IA (tarefa ajuste_secao; Sonnet só quando muda layout ou é o site todo), e o app recusa
//     operação fora delas (lib/ajuste-secoes.js).
// Toda mudança vira RASCUNHO ("Antes × Depois" por seção, prévia no celular primeiro, isolada num iframe sandbox) e só vai
// para o site em "Aplicar", criando uma versão (as últimas 20 ficam). Ao aplicar: link de aprovação enviado vira
// "Substituído", as conferências baratas rodam só nas seções mudadas e dá para "Voltar para a versão anterior".
// O .zip e o manual de entrega usam sempre o estado aceito (site.conteudo/config/layout ou site.pacote).
import { db, COL } from '../core/storage.js';
import { tipoMaterial } from '../lib/prova-social.js';
import { entenderAjuste, ajustarSecoes } from '../core/ia.js';
import {
  nomeBloco, tituloBloco, TITULOS_PADRAO, VARIACOES, BLOCOS_COM_IMAGEM, PALETAS_PRONTAS, MAX_VERSOES,
  estadoDoSite, aplicarOperacoes, registrarVersao, versoesDoModo, resumoMudancas, normalizarLayout, problemaPaleta,
} from '../lib/site-blocos.js';
import {
  secoesDoSite, nomeSecao, ANCORA_SECAO, mudancasPorSecao, juntarPorSecao, escolhasDeTexto, conferirSecoes, estimarCusto, textoCusto,
  resumoDasSecoes, secaoDoPrefixo, prefixoSecao, responderEntendimento, tarefaDoAjuste, LIMITE_PEDIDO_AJUSTE, TODO, FONTES_SUGESTAO,
} from '../lib/ajuste-secoes.js';
import { temCustom, temPacote, divergencias, aplicarBaseNoPacote, aplicarBaseNoCustom, baseDoCustom, baseDoPacote } from '../lib/site-modos.js';
import { esc, $, on, toast, ocupado, modal, confirmar, tag, dataBR, mostrarResultado } from '../core/ui.js';
import { salvarUsos } from '../lib/materiais.js';
import { ehProdutoSaude, achadosSaude } from '../lib/saude.js';
import { AVISO_SITE_SAUDE } from '../lib/textos-site.js';

const LEGENDA = 'Peça uma mudança em linguagem normal. Antes de mexer, o app mostra quais seções entendeu e o custo; depois, "Antes × Depois" de cada seção. Nada vai para o site antes de "Aplicar".';
const LEGENDA_PACOTE = 'Aqui você ajusta o conteúdo que será importado. O visual final depende do tema da plataforma escolhida, então mudanças de layout precisam ser feitas no editor da própria plataforma';
const SANDBOX = 'allow-scripts allow-popups allow-forms allow-modals'; // sem allow-same-origin: o site não enxerga nada do painel
// Última versão aceita por cliente+modo nesta sessão: a aba é redesenhada ao aceitar e o "próximo passo" precisa sobreviver.
const aceitoRecente = new Map();
const mostrarAplicado = new Set(); // depois de "Aplicar", o quadro do resultado ganha destaque ao redesenhar
const quando = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return dataBR(iso); } };
const RE_ESTRUTURA = /\b(ordem|mov[ea]|subir|descer|antes d[eo]|depois d[eo]|ocult|esconde|tira[r]? (a|o) (se[cç][aã]o|bloco)|mostra|altura|coluna|imagem)\b/i;

/** Abre um HTML de site numa aba nova, dentro de um iframe sandbox (mesma prévia isolada do botão "Ver prévia"). */
export function abrirPreviaIsolada(html, titulo) {
  const w = window.open('', '_blank');
  if (!w) { toast('O navegador bloqueou a nova aba. Libere pop-ups para este endereço e tente de novo.', 'erro'); return; }
  w.document.open();
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(titulo)}</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
<iframe sandbox="${SANDBOX}" srcdoc="${esc(html)}"></iframe>`);
  w.document.close();
}

/** Blocos do site personalizado em texto, para a IA do "Corrigir o que faltou" e da "Cara de IA" (correção de tudo). */
export function resumoBlocosSite(e) {
  const L = normalizarLayout(e.layout);
  return `Blocos do site, em ordem: ${L.ordem.map((k, i) => `${i + 1}. ${k} (${nomeBloco(k)}${TITULOS_PADRAO[k] ? `, título "${tituloBloco(L, k)}"` : ''})${L.ocultos.includes(k) ? ' [OCULTO]' : ''}`).join('; ')}.
Variações atuais: ${JSON.stringify(L.variacoes)}. Imagens: ${Object.entries(L.imagens).map(([k, v]) => `${k}: ${v.nome}`).join(', ') || 'nenhuma'}.
Fixos (fora dos blocos): cabeçalho com menu, rodapé com políticas, aviso de cookies, carrinho com "Finalizar compra" e selo de compra segura, botão de WhatsApp.`;
}

/** HTML do site com um script que rola até a seção (a prévia é um iframe sandbox com scripts, sem acesso ao painel). */
const comFoco = (html, secao) => { const id = ANCORA_SECAO[secao]; return id ? String(html).replace(/<\/body>/i, `<script>addEventListener('load',function(){var e=document.getElementById(${JSON.stringify(id)});if(e)e.scrollIntoView();});</script></body>`) : html; };

/**
 * ctx: { cliente, produtos, modo: 'custom'|'pacote', get site(), salvarSite(patch), recarregar(), htmlDe(estado), pacoteHTML(pacote),
 * previaPacote(pacote, usosFotos), depoisDeMudar({ usarIa }) (conferência do pedido), conferenciaDasSecoes(secoes) (linhas da
 * conferência nas seções mudadas), substituirLinks() (links de aprovação ativos -> "Substituído"; devolve quantos),
 * gerarLinkNovo() ({ criadoEm }), verPlano(planoId, versao) }
 * Devolve { redesenhar, prepararSugestao, proporOperacoes, proporLocal } para as sugestões ("Fazer essa mudança").
 */
export async function montarAjusteSite(alvo, ctx) {
  const { cliente, produtos, modo } = ctx;
  const custom = modo === 'custom';
  // Imagens dos Materiais do cliente (vídeo não serve como imagem do banner/história).
  const todosMateriais = await db.listar(COL.materiais, { clienteId: cliente.id }).catch(() => []);
  const materiais = todosMateriais.filter((m) => ['foto', 'logo', 'prova_social'].includes(tipoMaterial(m)));
  let aba = 'depois'; // prévia do rascunho: 'antes' ou 'depois'
  let largura = 'celular'; // celular primeiro
  let foco = null; // seção para a prévia rolar até ela
  const chave = `${cliente.id}:${modo}`;
  const saude = ehProdutoSaude(cliente, produtos);

  const site = () => ctx.site;
  const rascunho = () => (site().rascunhoAjuste?.modo === modo ? site().rascunhoAjuste : null);
  const entendido = () => (site().ajusteEntendido?.modo === modo ? site().ajusteEntendido : null);
  const ultimo = () => (site().ajusteUltimo?.modo === modo ? site().ajusteUltimo : null);
  const conversa = () => site().conversaAjuste?.[modo] || [];
  const estadoAtual = () => estadoDoSite(site(), modo);
  const estadoBase = () => rascunho()?.estado || estadoAtual();
  const historico = (x) => [...(site().historicoAjustes || []), { em: new Date().toISOString(), modo, ...x }].slice(-50);

  // ---------- rascunho ----------
  // Onde vai cada foto ("Usar em") mora nos Materiais, não no site: no rascunho fica à parte (usosFotos) e só é gravado
  // nos Materiais ao aplicar. Não entra nas versões ("Voltar para esta versão" nunca desfaz uma escolha de foto).
  async function salvarRascunho({ estado, usosFotos, porSecao = [], mudancas = [], descartadas = [], escolhas = [], origem, fonte, pedido }) {
    const atual = rascunho();
    await ctx.salvarSite({ rascunhoAjuste: {
      modo, estado, usosFotos: usosFotos || {}, origem: atual && atual.origem !== origem ? 'ia+manual' : origem, criadoEm: atual?.criadoEm || new Date().toISOString(),
      mudancas: [...(atual?.mudancas || []), ...mudancas], descartadas: [...(atual?.descartadas || []), ...descartadas],
      porSecao: juntarPorSecao(atual?.porSecao || [], porSecao), escolhas: [...(atual?.escolhas || []), ...escolhas],
      fontes: [...new Set([...(atual?.fontes || []), fonte || origem])], pedidos: [...(atual?.pedidos || []), pedido].filter(Boolean).slice(-10),
    } });
    aba = 'depois';
  }
  /** Operações -> rascunho. meta: { fonte, pedido, fora (recusadas fora das seções), recursos (patch de recursos da loja), textoRecursos, secaoRecursos }. */
  async function acrescentarAoRascunho(operacoes, origem, meta = {}) {
    const base = { ...estadoBase(), usosFotos: rascunho()?.usosFotos || {} };
    const extra = [];
    if (meta.recursos) {
      if (custom) base.config = { ...(base.config || {}), recursos: meta.recursos }; else base.pacote = { ...(base.pacote || {}), recursos: meta.recursos };
      extra.push({ secao: meta.secaoRecursos || 'produto', nome: nomeSecao(meta.secaoRecursos || 'produto', modo), mudancas: [meta.textoRecursos || 'Recursos da loja ajustados'] });
    }
    const r = aplicarOperacoes(base, operacoes, { modo, materiais, produtos });
    const descartadas = [...r.descartadas.map((d) => ({ op: d.op, motivo: d.motivo })), ...(meta.fora || []).map((d) => ({ op: d.op, motivo: d.motivo }))];
    const mudou = r.aplicadas.length > 0 || extra.length > 0;
    if (!mudou) return { ...r, mudou, descartadas };
    const { usosFotos, ...estado } = r.estado;
    await salvarRascunho({ estado, usosFotos, porSecao: [...mudancasPorSecao(r, modo), ...extra], mudancas: [...r.mudancas, ...extra.flatMap((x) => x.mudancas)], descartadas, escolhas: escolhasDeTexto(r.aplicadas, site(), modo), origem, fonte: meta.fonte, pedido: meta.pedido });
    foco = mudancasPorSecao(r, modo)[0]?.secao || foco;
    return { ...r, mudou, descartadas };
  }
  /** Correção feita pelo app sem IA (ex.: "Cara de IA" de um texto): fn(estado) -> { estado, mudancas }. */
  async function proporLocal(fn, meta = {}) {
    const base = estadoBase();
    const r = fn(base);
    if (!r?.mudancas?.length) return false;
    await salvarRascunho({ estado: { ...base, ...r.estado }, usosFotos: rascunho()?.usosFotos, porSecao: [{ secao: meta.secao || 'geral', nome: nomeSecao(meta.secao || 'geral', modo), mudancas: r.mudancas }], mudancas: r.mudancas, origem: 'manual', fonte: meta.fonte, pedido: meta.pedido });
    foco = meta.secao || foco;
    desenhar();
    return true;
  }
  async function escolherTexto(i, versao) {
    const d = rascunho(); const e = d?.escolhas?.[i]; if (!e) return;
    const valor = versao === 'original' ? e.original : e[versao];
    if (!valor) return toast('Essa versão não existe para este texto.', 'erro');
    const r = aplicarOperacoes({ ...d.estado, usosFotos: d.usosFotos }, [{ op: 'texto', campo: e.campo, valor }], { modo, materiais, produtos });
    const { usosFotos, ...estado } = r.estado;
    await ctx.salvarSite({ rascunhoAjuste: { ...d, estado: r.aplicadas.length ? estado : d.estado, usosFotos: d.usosFotos, escolhas: d.escolhas.map((x, k) => (k === i ? { ...x, escolha: versao } : x)) } });
    desenhar(); $('[data-escolhas-texto]', alvo)?.scrollIntoView({ block: 'nearest' });
  }
  async function aceitar() {
    const d = rascunho(); if (!d) return;
    if ((d.escolhas || []).some((e) => !e.escolha)) throw new Error('Escolha a versão de cada texto seu (Seu texto, Versão melhorada ou Versão segura) antes de aplicar.');
    const antes = estadoAtual();
    const v = registrarVersao(site(), { modo, estadoAntes: antes, estadoDepois: d.estado, resumo: resumoMudancas(d.mudancas), origem: d.origem });
    const n = v.proximaVersao - 1;
    const anterior = versoesDoModo({ versoesAjuste: v.versoesAjuste }, modo)[1]?.n || null;
    const secoes = [...new Set((d.porSecao || []).map((s) => s.secao))];
    await salvarUsos(Object.entries(d.usosFotos || {}).map(([id, usos]) => ({ id, usos }))); // fotos: escolha da pessoa, como no seletor
    await ctx.salvarSite({ ...d.estado, ...v, rascunhoAjuste: null, historicoAjustes: historico({ versao: n, pedidos: d.pedidos || [], fontes: d.fontes || [], secoes, resultado: 'aplicado' }) });
    aceitoRecente.set(chave, n);
    // Link de aprovação já enviado mostra uma versão velha: vira "Substituído" (um novo é oferecido logo abaixo).
    const links = await Promise.resolve(ctx.substituirLinks?.()).catch(() => 0) || 0;
    // Conferências baratas (sem IA) só nas seções mudadas.
    await ctx.depoisDeMudar?.({ usarIa: false });
    const checagens = conferirSecoes(d.estado, secoes, modo, { saude, produtos });
    const conferencia = ctx.conferenciaDasSecoes?.(secoes) || [];
    await ctx.salvarSite({ ajusteUltimo: { modo, versao: n, anterior, secoes, nomes: secoes.map((s) => nomeSecao(s, modo)), checagens, conferencia, links, em: new Date().toISOString() } });
    mostrarAplicado.add(chave);
    toast(`Aplicado (v${n}): só ${secoes.length === 1 ? 'a seção' : 'as seções'} ${secoes.map((s) => `"${nomeSecao(s, modo)}"`).join(', ')}.`);
    ctx.recarregar();
  }
  async function descartar() {
    const d = rascunho();
    await ctx.salvarSite({ rascunhoAjuste: null, historicoAjustes: historico({ pedidos: d?.pedidos || [], fontes: d?.fontes || [], secoes: (d?.porSecao || []).map((s) => s.secao), resultado: 'desfeito' }) });
    desenhar();
    mostrarResultado($('[data-form-ajuste]', alvo), 'Desfeito: nada mudou no site.');
  }
  async function voltarPara(n) {
    const v = (site().versoesAjuste || []).find((x) => x.n === n); if (!v) return;
    if (!(await confirmar(`Voltar o site para a v${n} ("${v.resumo}")? Isso cria uma versão nova igual à v${n}; o histórico continua todo aqui.`, `Voltar para a v${n}`))) return;
    const r = registrarVersao(site(), { modo, estadoAntes: estadoAtual(), estadoDepois: v.estado, resumo: `Voltou para a v${n}`, origem: 'voltar' });
    await ctx.salvarSite({ ...v.estado, ...r, rascunhoAjuste: null, ajusteUltimo: null, historicoAjustes: historico({ versao: r.proximaVersao - 1, secoes: [], resultado: `voltou para a v${n}` }) });
    aceitoRecente.set(chave, r.proximaVersao - 1);
    await Promise.resolve(ctx.substituirLinks?.()).catch(() => 0);
    toast(`Voltou para a v${n} (salvo como v${r.proximaVersao - 1}).`); await ctx.depoisDeMudar?.({ usarIa: false }); ctx.recarregar();
  }

  // ---------- 1ª etapa: "Entendi assim" ----------
  const instrucaoDe = (ent) => [ent.mensagem, ...(ent.complementos || []).map((c) => `Resposta do operador: ${c}`), ...ent.secoes.filter((s) => s.oque && s.oque !== ent.mensagem).map((s) => `Em ${s.nome}: ${s.oque}`)].join('\n');
  const comCusto = (ent) => {
    const tarefa = tarefaDoAjuste(ent);
    const chars = resumoDasSecoes(estadoBase(), ent.secoes.map((s) => s.id), modo, { materiais, produtos }).length + instrucaoDe(ent).length;
    return { ...ent, tarefa, custo: estimarCusto(tarefa, chars) };
  };
  async function guardarEntendido(ent) {
    await ctx.salvarSite({ ajusteEntendido: { modo, em: new Date().toISOString(), ...comCusto(ent) } });
    desenhar();
    const el = $('[data-entendi-ajuste]', alvo);
    if (el) mostrarResultado(el, ent.perguntas?.some((q) => !q.resposta) ? 'Entendi assim, mas preciso de uma resposta sua antes.' : 'Entendi assim: confira as seções e o custo, e clique em "Fazer essas mudanças".');
  }
  /** Pedido livre: seção já conhecida ("Mudar esta seção") = sem IA; senão a IA barata diz quais seções. */
  async function entender(mensagem) {
    const msg = String(mensagem || '').trim();
    if (!msg) throw new Error('Escreva o que quer mudar no site.');
    if (msg.length > LIMITE_PEDIDO_AJUSTE) throw new Error(`O pedido tem ${msg.length} caracteres; o limite é ${LIMITE_PEDIDO_AJUSTE}. Encurte e tente de novo.`);
    const pref = secaoDoPrefixo(msg, modo);
    const ent = pref
      ? { global: false, secoes: [{ id: pref, nome: nomeSecao(pref, modo), oque: msg.replace(/^\s*na seção\s+"[^"]+"\s*:\s*/i, ''), estrutura: RE_ESTRUTURA.test(msg) }], perguntas: [], fora: [], semIa: true }
      : await entenderAjuste({ cliente, modo, mensagem: msg, materiais });
    await guardarEntendido({ ...ent, mensagem: msg, fonte: 'pedido' });
  }
  /** Sugestão ("Fazer essa mudança") que precisa da IA: a seção já vem dela, então o "Entendi assim" sai sem IA. */
  async function prepararSugestao({ fonte, secoes, oque, instrucao, chaves = [] }) {
    const lista = [...new Set(secoes)].filter(Boolean);
    await guardarEntendido({ global: lista.includes(TODO), secoes: lista.map((id) => ({ id, nome: nomeSecao(id, modo), oque: oque || instrucao, estrutura: false })), perguntas: [], fora: [], semIa: true, mensagem: instrucao, fonte, chaves });
  }
  /** Sugestão que o app resolve sem IA (fotos pelo código, recursos da loja, seção mostrar/ocultar): direto para "Antes × Depois". */
  async function proporOperacoes(ops, meta = {}) {
    const r = await acrescentarAoRascunho(ops, 'manual', meta);
    desenhar();
    if (!r.mudou) { toast(`Não deu para fazer: ${r.descartadas.map((x) => x.motivo).join(' · ') || 'o site já está assim'}`, 'erro'); return false; }
    mostrarResultado($('[data-rascunho]', alvo), 'Antes × Depois: confira e clique em "Aplicar". Nada mudou no site ainda.');
    return true;
  }

  // ---------- 2ª etapa: muda só as seções ----------
  async function executar() {
    const ent = entendido(); if (!ent) return;
    if (ent.perguntas?.some((q) => !q.resposta)) throw new Error('Responda a pergunta do "Entendi assim" antes.');
    if (!ent.secoes.length) throw new Error('Nenhuma seção para mudar. Escreva o pedido de outro jeito.');
    const ids = ent.secoes.map((s) => s.id);
    const r = await ajustarSecoes({ cliente, modo, site: site(), estado: estadoBase(), secoes: ids, instrucao: instrucaoDe(ent), materiais, produtos, tarefa: ent.tarefa });
    const aplicado = r.tipo === 'proposta' ? await acrescentarAoRascunho(r.operacoes, 'ia', { fora: r.foraDasSecoes, fonte: ent.fonte, pedido: ent.mensagem }) : null;
    const mudou = Boolean(aplicado?.mudou);
    const recusadas = [...(aplicado?.descartadas || []), ...(aplicado ? [] : r.foraDasSecoes || [])].map((d) => d.motivo);
    const resposta = { role: 'assistant', content: r.resposta, em: new Date().toISOString(), tipo: mudou ? 'proposta' : r.tipo === 'recusa' ? 'recusa' : 'explicacao', mudancas: aplicado?.mudancas || [], recusadas, naoFeito: r.naoFeito, modelo: r.tarefa === 'ajuste_secao_amplo' ? 'forte' : 'leve', secoes: ent.secoes.map((s) => s.nome) };
    const lista = [...conversa(), { role: 'user', content: ent.mensagem, em: ent.em, fonte: ent.fonte }, resposta].slice(-30);
    await ctx.salvarSite({ ajusteEntendido: null, conversaAjuste: { ...(site().conversaAjuste || {}), [modo]: lista }, ...(mudou && ent.fonte === 'pedido' ? { pedidoAjusteTexto: { ...(site().pedidoAjusteTexto || {}), [modo]: '' } } : {}) });
    desenhar();
    if (mudou) mostrarResultado($('[data-rascunho]', alvo), 'Antes × Depois: confira cada seção e clique em "Aplicar". Nada mudou no site ainda.');
    else mostrarResultado($('[data-chat]', alvo), `Nada mudou: ${r.resposta}${recusadas.length ? ` (${recusadas.length} parte(s) recusada(s), veja abaixo)` : ''}`);
  }

  // ---------- HTML ----------
  const etiqueta = (t) => (t.tipo === 'proposta' ? tag('propôs uma mudança', 'tag-ok') : tag('só explicou, nada mudou', 'tag-info'));
  const itemChat = (t) => (t.role === 'user'
    ? `<p class="text-slate-600"><b>Você${t.fonte && t.fonte !== 'pedido' ? ` (sugestão da ${esc(FONTES_SUGESTAO[t.fonte] || t.fonte)})` : ''}:</b> ${esc(t.content)}</p>`
    : `<div class="rounded-lg bg-slate-50 p-2"><p class="mb-1 flex flex-wrap gap-1">${etiqueta(t)}${t.tipo === 'recusa' ? tag(custom ? 'não é possível neste site' : 'não é possível pelo pacote', 'tag-warn') : ''}${t.secoes?.length ? tag(`seções: ${t.secoes.join(', ')}`) : ''}</p>
        <p class="whitespace-pre-wrap text-slate-800"><b>IA:</b> ${esc(t.content)}</p>
        ${t.mudancas?.length ? `<ul class="mt-1 list-disc pl-5 text-xs text-slate-700">${t.mudancas.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${t.recusadas?.length ? `<p class="mt-1 text-xs text-amber-800" data-recusadas-chat><b>O app não aplicou ${t.recusadas.length} parte(s):</b> ${t.recusadas.map(esc).join(' · ')}</p>` : ''}
        ${t.naoFeito?.length ? `<p class="mt-1 text-xs text-amber-800"><b>Não foi feito:</b> ${t.naoFeito.map(esc).join(' · ')}</p>` : ''}</div>`);

  function previaHTML(d) {
    if (custom) {
      const html = comFoco(ctx.htmlDe(aba === 'antes' ? estadoAtual() : { ...d.estado, usosFotos: d.usosFotos }), foco);
      return `<div class="${largura === 'celular' ? 'mx-auto max-w-[390px]' : ''}"><iframe sandbox="${SANDBOX}" srcdoc="${esc(html)}" class="${largura === 'celular' ? 'h-[640px]' : 'h-[520px]'} w-full rounded-lg border border-slate-200 bg-white" title="Prévia do site: ${aba === 'antes' ? 'antes' : 'depois'}${foco ? `, seção ${esc(nomeSecao(foco, modo))}` : ''}" data-previa-rascunho data-previa-lado="${aba}"></iframe></div>`;
    }
    // Pacote: a prévia com cara de loja (mesmo molde do painel e do link de aprovação), sem script; o resumo em texto embaixo.
    const pac = aba === 'antes' ? estadoAtual().pacote : d.estado.pacote;
    return `<div data-previa-rascunho data-previa-lado="${aba}">${ctx.previaPacote ? `<div class="${largura === 'celular' ? 'mx-auto max-w-[390px]' : ''}"><iframe sandbox="" srcdoc="${esc(ctx.previaPacote(pac, aba === 'antes' ? null : d.usosFotos))}" class="h-[640px] w-full rounded-lg border border-slate-200 bg-white" title="Prévia da loja: ${aba === 'antes' ? 'antes' : 'depois'}" data-previa-loja-ajuste></iframe></div>` : ''}<details class="mt-2 rounded-lg border border-slate-200 p-2"><summary class="flex min-h-[44px] cursor-pointer items-center text-xs text-slate-600">Textos do pacote</summary>${ctx.pacoteHTML(pac)}</details></div>`;
  }
  // No site, alegação de efeito pode ficar (decisão do operador): só avisa, em amarelo, sem bloquear.
  const avisoAlegacao = (d) => {
    const ach = saude ? [...new Set(achadosSaude([...d.mudancas.map((m) => String(m).split('→').pop()), ...(d.escolhas || []).map((e) => (e.escolha === 'original' ? e.original : e[e.escolha] || e.melhorada))].join(' ')))] : [];
    return ach.length ? `<p class="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800" data-aviso-alegacao-ajuste><i class="fa-solid fa-triangle-exclamation"></i> ${esc(AVISO_SITE_SAUDE)} Trecho: ${ach.map((a) => `"${esc(a)}"`).join(', ')}.</p>` : '';
  };
  const VERSOES = [['original', 'Seu texto'], ['melhorada', 'Versão melhorada'], ['segura', 'Versão segura']];
  function escolhasHTML(d) {
    if (!d.escolhas?.length) return '';
    return `<div class="mb-2 space-y-2" data-escolhas-texto>${d.escolhas.map((e, i) => `<fieldset class="rounded border border-indigo-200 bg-white p-2 text-sm" data-escolha-texto="${i}"><legend class="px-1 text-xs font-semibold">Texto seu (${esc(e.campo)}): escolha a versão</legend>
      ${VERSOES.filter(([k]) => e[k]).map(([k, rot]) => `<label class="mt-1 flex min-h-[44px] cursor-pointer items-start gap-2 rounded border ${e.escolha === k ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200'} p-2"><input type="radio" class="mt-1 h-4 w-4" name="escolha-${i}" data-escolher-versao="${i}" value="${k}" ${e.escolha === k ? 'checked' : ''}><span><b class="block text-xs">${rot}</b>${esc(e[k])}</span></label>`).join('')}
      ${e.escolha ? '' : '<p class="mt-1 text-xs text-amber-800" data-escolha-pendente>Escolha uma versão para poder aplicar.</p>'}</fieldset>`).join('')}</div>`;
  }
  function rascunhoHTML(d) {
    const pendente = (d.escolhas || []).some((e) => !e.escolha);
    const porSecao = d.porSecao?.length ? d.porSecao : [{ secao: 'geral', nome: 'Mudanças', mudancas: d.mudancas }];
    return `<div class="mt-4 rounded-lg border-2 border-emerald-300 bg-emerald-50/40 p-3" data-rascunho>
      <h4 class="text-sm font-semibold"><i class="fa-solid fa-code-compare mr-1" aria-hidden="true"></i> Antes × Depois: ainda NÃO está no site</h4>
      <p class="hint mb-2">Só ${porSecao.length === 1 ? 'esta seção muda' : `estas ${porSecao.length} seções mudam`}; o resto do site fica igual. "Aplicar" cria uma versão nova; "Desfazer" deixa tudo como estava.</p>
      ${avisoAlegacao(d)}${escolhasHTML(d)}
      <div class="space-y-2" data-secoes-mudadas>${porSecao.map((s) => `<section class="rounded border border-slate-200 bg-white p-2" data-secao-mudada="${esc(s.secao)}"><p class="text-sm font-semibold">${esc(s.nome)}</p>
        <ul class="list-disc pl-5 text-sm">${s.mudancas.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
        ${custom && ANCORA_SECAO[s.secao] ? `<div class="mt-1 flex flex-wrap gap-2"><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-ver-secao="${esc(s.secao)}" data-lado="antes">Ver antes</button><button type="button" class="btn-ghost btn-sm min-h-[44px]" data-ver-secao="${esc(s.secao)}" data-lado="depois">Ver depois</button></div>` : ''}</section>`).join('')}</div>
      ${d.descartadas?.length ? `<p class="mt-2 text-xs text-amber-800" data-recusadas-rascunho><b>Recusado pelo app (não entra):</b> ${d.descartadas.map((x) => esc(x.motivo)).join(' · ')}</p>` : ''}
      <div class="my-2 flex flex-wrap items-center gap-2"><span class="text-sm">Prévia:</span>
        <button type="button" class="${aba === 'antes' ? 'btn-primary' : 'btn-ghost'} btn-sm min-h-[44px]" data-aba="antes" aria-pressed="${aba === 'antes'}">Antes</button>
        <button type="button" class="${aba === 'depois' ? 'btn-primary' : 'btn-ghost'} btn-sm min-h-[44px]" data-aba="depois" aria-pressed="${aba === 'depois'}">Depois</button>
        <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-largura="${largura === 'celular' ? 'computador' : 'celular'}">${largura === 'celular' ? 'Ver como no computador' : 'Ver como no celular'}</button>
        ${custom ? '<button type="button" class="btn-ghost btn-sm min-h-[44px]" data-previa-aba title="Abre numa aba separada, isolada do painel"><i class="fa-solid fa-up-right-from-square"></i> Nova aba</button>' : ''}</div>
      ${previaHTML(d)}
      <div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn-primary min-h-[44px]" data-aceitar ${pendente ? 'disabled aria-describedby="aplicar-pendente"' : ''}><i class="fa-solid fa-check"></i> Aplicar</button>
        <button type="button" class="btn-ghost min-h-[44px]" data-descartar><i class="fa-solid fa-rotate-left"></i> Desfazer</button>
        <button type="button" class="btn-ghost min-h-[44px]" data-outro-ajuste><i class="fa-solid fa-pen"></i> Pedir outro ajuste</button></div>
      ${pendente ? '<p class="mt-1 text-xs text-amber-800" id="aplicar-pendente">Escolha a versão dos seus textos (acima) para aplicar.</p>' : ''}</div>`;
  }
  function entendidoHTML(ent) {
    const abertas = ent.perguntas?.filter((q) => !q.resposta) || [];
    const pode = ent.secoes.length && !abertas.length;
    return `<div class="mt-3 rounded-lg border-2 border-indigo-300 bg-indigo-50/40 p-3" data-entendi-ajuste>
      <h4 class="text-sm font-semibold"><i class="fa-solid fa-list-check mr-1" aria-hidden="true"></i> Entendi assim${ent.fonte && ent.fonte !== 'pedido' ? ` <span class="font-normal text-slate-600">(sugestão da ${esc(FONTES_SUGESTAO[ent.fonte] || ent.fonte)})</span>` : ''}</h4>
      <p class="mt-1 text-sm text-slate-700"><b>Pedido:</b> ${esc(ent.mensagem)}</p>
      ${ent.secoes.some((s) => s.id === TODO) ? '<p class="mt-1 rounded bg-amber-50 p-2 text-sm text-amber-800" data-mudanca-global><i class="fa-solid fa-globe"></i> <b>Mudança no site todo:</b> todas as seções vão para a IA.</p>' : ''}
      ${ent.secoes.length ? `<ul class="mt-2 space-y-1 text-sm" data-secoes-entendidas>${ent.secoes.map((s) => `<li class="rounded border border-slate-200 bg-white px-2 py-1" data-secao-entendida="${esc(s.id)}"><b>${esc(s.nome)}</b>: ${esc(s.oque || '')}</li>`).join('')}</ul><p class="hint">Só ${ent.secoes.length === 1 ? 'essa seção vai' : 'essas seções vão'} para a IA; o resto do site não muda.</p>` : ent.perguntas?.length ? '<p class="mt-1 text-sm text-slate-700" data-sem-secao>Responda a pergunta abaixo para eu saber qual parte do site mudar.</p>' : '<p class="mt-1 text-sm text-amber-800" data-sem-secao>Não identifiquei qual parte do site o pedido mexe. Escreva de outro jeito ou use "Mudar esta seção".</p>'}
      ${(ent.perguntas || []).map((q) => `<div class="mt-2 rounded bg-amber-50 p-2" data-pergunta-ajuste="${esc(q.id)}"><p class="text-sm font-semibold text-amber-800"><i class="fa-solid fa-circle-question"></i> ${esc(q.texto)}</p>
        ${q.resposta ? `<p class="text-xs text-emerald-800"><i class="fa-solid fa-reply"></i> Sua resposta: ${esc(q.resposta)}</p>` : `<div class="mt-1 flex flex-wrap gap-2">${q.opcoes.map((o, i) => `<button type="button" class="btn-ghost btn-sm min-h-[44px]" data-responder-ajuste="${esc(q.id)}" data-opcao="${i}">${esc(o.texto)}</button>`).join('')}</div>`}</div>`).join('')}
      ${ent.fora?.length ? `<p class="mt-2 text-xs text-amber-800"><b>Não muda por aqui:</b> ${ent.fora.map(esc).join(' · ')}</p>` : ''}
      <p class="mt-2 text-xs text-slate-700" data-custo-ajuste><i class="fa-solid fa-coins" aria-hidden="true"></i> Custo estimado: ${esc(textoCusto(ent.custo))}${ent.semIa ? ' · este "Entendi assim" não usou IA' : ''}. O gasto real aparece em Configurações > Custos de IA.</p>
      <div class="mt-2 flex flex-wrap gap-2"><button type="button" class="btn-ia min-h-[44px]" data-executar-ajuste ${pode ? '' : 'disabled'}><i class="fa-solid fa-wand-magic-sparkles"></i> Fazer essas mudanças</button>
        <button type="button" class="btn-ghost min-h-[44px]" data-cancelar-ajuste>Cancelar</button></div></div>`;
  }
  function aplicadoHTML(u) {
    const ok = (x) => `<li class="flex items-start gap-1 ${x.ok ? 'text-emerald-800' : 'text-amber-800'}"><i class="fa-solid ${x.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'} mt-1" aria-hidden="true"></i><span>${esc(x.texto)}</span></li>`;
    return `<div class="mt-3 rounded-lg border-2 border-emerald-300 bg-emerald-50/40 p-3" data-aplicado>
      <p class="text-sm font-semibold text-emerald-800"><i class="fa-solid fa-circle-check"></i> Aplicado (v${u.versao}) em ${esc(quando(u.em))}: mudou só ${u.nomes.map((x) => `"${esc(x)}"`).join(', ')}.</p>
      ${u.links ? `<p class="mt-1 text-sm text-slate-700" data-link-substituido>O link de aprovação enviado antes agora aparece como <b>"Substituído"</b> (mostrava a versão anterior).</p>` : ''}
      ${u.linkNovo ? `<p class="mt-1 text-sm text-emerald-800" data-link-novo>Link novo criado em ${esc(u.linkNovo)} (horário de Brasília). Copie e envie em "Aprovar" (passo 5).</p>` : ''}
      <p class="mt-2 text-xs font-semibold">Conferência das seções mudadas (sem IA)</p>
      <div class="mt-1 space-y-1 text-xs" data-checagens-secoes>${u.checagens.map((s) => `<div><b>${esc(s.nome)}</b><ul class="ml-1">${s.itens.map(ok).join('')}</ul></div>`).join('') || '<p class="hint">Nada para conferir nessas seções.</p>'}
        ${u.conferencia?.length ? `<div data-conferencia-secoes-mudadas><b>Conferência do pedido</b><ul class="ml-1">${u.conferencia.map((c) => ok({ ok: c.status === 'atendido', texto: `${c.pedido}: ${c.motivo}` })).join('')}</ul></div>` : ''}</div>
      <div class="mt-2 flex flex-wrap gap-2">${u.anterior ? `<button type="button" class="btn-ghost btn-sm min-h-[44px]" data-voltar="${u.anterior}"><i class="fa-solid fa-clock-rotate-left"></i> Voltar para a versão anterior (v${u.anterior})</button>` : ''}
        ${u.links && !u.linkNovo && ctx.gerarLinkNovo ? '<button type="button" class="btn-primary btn-sm min-h-[44px]" data-gerar-link-novo><i class="fa-solid fa-link"></i> Gerar link novo para o cliente</button>' : ''}
        <button type="button" class="btn-ghost btn-sm min-h-[44px]" data-fechar-aplicado>Fechar</button></div></div>`;
  }

  function manuaisHTML(e) {
    if (!custom) {
      const P = e.pacote || {};
      const secoes = P.briefingTema?.secoesHome || [];
      return `<p class="hint mb-2">Cada botão monta a mesma mudança "Antes × Depois" do pedido, com prévia e versão. Nada muda no pacote até "Aplicar".</p>
        <p class="text-sm font-medium">Ordem sugerida das seções da home</p>
        <ol class="mb-3 space-y-1 text-sm">${secoes.map((s, i) => `<li class="flex flex-wrap items-center gap-2 rounded border border-slate-200 px-2 py-1"><span class="flex-1">${i + 1}. ${esc(s)}</span>
          <button type="button" class="btn-ghost btn-sm" data-m-pac="subir" data-i="${i}" ${i === 0 ? 'disabled' : ''}>Subir</button><button type="button" class="btn-ghost btn-sm" data-m-pac="descer" data-i="${i}" ${i === secoes.length - 1 ? 'disabled' : ''}>Descer</button>
          <button type="button" class="btn-ghost btn-sm" data-m-pac="ocultar" data-i="${i}">Tirar da home</button></li>`).join('')}
          ${(P.secoesOcultas || []).map((s) => `<li class="flex items-center gap-2 rounded border border-dashed border-slate-300 px-2 py-1 text-slate-500"><span class="flex-1">${esc(s)} (retirada)</span><button type="button" class="btn-ghost btn-sm" data-m-pac-mostrar="${esc(s)}">Voltar para a home</button></li>`).join('')}</ol>
        <p class="text-sm font-medium">Textos dos banners</p>
        <div class="mb-3 flex flex-wrap gap-2">${(P.banners || []).map((b, i) => `<button type="button" class="btn-ghost btn-sm" data-m-banner="${i}">Editar texto do banner ${i + 1}</button>`).join('') || '<span class="hint">Gere o pacote primeiro.</span>'}</div>
        <p class="text-sm font-medium">Paleta sugerida</p><div class="flex flex-wrap gap-2">${PALETAS_PRONTAS.map(([n, a, b]) => `<button type="button" class="btn-ghost btn-sm" data-m-paleta="${a},${b}"><span class="inline-block h-3 w-3 rounded-full" style="background:${a}"></span> ${esc(n)}</button>`).join('')}</div>`;
    }
    const L = normalizarLayout(e.layout);
    const cfg = e.config || {};
    return `<p class="hint mb-2">Cada botão monta a mesma mudança "Antes × Depois" do pedido, com prévia e versão, e passa pelas mesmas regras. Nada muda no site até "Aplicar".</p>
      <ol class="mb-3 space-y-1 text-sm" data-lista-blocos>${L.ordem.map((k, i) => {
        const oculto = L.ocultos.includes(k);
        return `<li class="flex flex-wrap items-center gap-2 rounded border ${oculto ? 'border-dashed border-slate-300 text-slate-500' : 'border-slate-200'} px-2 py-1" data-bloco="${k}">
          <span class="min-w-[10rem] flex-1">${i + 1}. ${esc(nomeBloco(k))}${oculto ? ' (oculto)' : ''}</span>
          <button type="button" class="btn-ghost btn-sm" data-m="subir" data-b="${k}" ${i === 0 ? 'disabled' : ''}>Subir</button>
          <button type="button" class="btn-ghost btn-sm" data-m="descer" data-b="${k}" ${i === L.ordem.length - 1 ? 'disabled' : ''}>Descer</button>
          <button type="button" class="btn-ghost btn-sm" data-m="${oculto ? 'mostrar' : 'ocultar'}" data-b="${k}">${oculto ? 'Mostrar' : 'Ocultar'}</button>
          ${['hero', 'marca', 'newsletter'].includes(k) || TITULOS_PADRAO[k] ? `<button type="button" class="btn-ghost btn-sm" data-m="texto" data-b="${k}">Editar texto</button>` : ''}
          ${VARIACOES[k] ? Object.entries(VARIACOES[k]).map(([opc, vals]) => `<select class="input !w-auto !py-1 text-xs" data-m-var="${k}" data-opc="${opc}" title="${opc === 'altura' ? 'Altura do banner' : 'Colunas de produtos'}"><option value="">${opc === 'altura' ? 'Altura' : 'Colunas'}: ${esc(L.variacoes[k]?.[opc] ?? (opc === 'altura' ? 'normal' : 'automático'))}</option>${vals.map((v) => `<option value="${v}">${v}</option>`).join('')}</select>`).join('') : ''}
          ${BLOCOS_COM_IMAGEM.includes(k) ? `<select class="input !w-auto !py-1 text-xs" data-m-img="${k}" title="Imagem dos Materiais do cliente"><option value="__">Imagem: ${esc(L.imagens[k]?.nome || 'nenhuma')}</option>${L.imagens[k] ? '<option value="">Tirar a imagem</option>' : ''}${materiais.map((m) => `<option value="${esc(m.id)}">${esc(m.nomeOriginal || m.descricao || m.nome || 'imagem')}</option>`).join('')}</select>` : ''}</li>`;
      }).join('')}</ol>
      ${materiais.length ? '' : '<p class="hint mb-2">Para usar imagem no banner ou na história, guarde fotos em Materiais do cliente (pergunta 0 acima, ou Estúdio).</p>'}
      <p class="text-sm font-medium">Cores</p>
      <p class="hint mb-1">Paletas prontas (todas legíveis). Atual: principal ${esc(cfg.corPrimaria || '#4f46e5')}, fundo ${esc(cfg.corFundo || '#ffffff')}.</p>
      <div class="mb-2 flex flex-wrap gap-2">${PALETAS_PRONTAS.map(([n, a, b]) => `<button type="button" class="btn-ghost btn-sm" data-m-paleta="${a},${b}"><span class="inline-block h-3 w-3 rounded-full" style="background:${a}"></span> ${esc(n)}</button>`).join('')}</div>
      <div class="flex flex-wrap items-end gap-2"><label class="text-xs">Principal<input type="color" class="block h-9 w-16 rounded" data-cor-prim value="${esc(cfg.corPrimaria || '#4f46e5')}"></label>
        <label class="text-xs">Fundo<input type="color" class="block h-9 w-16 rounded" data-cor-fundo value="${esc(cfg.corFundo || '#ffffff')}"></label>
        <button type="button" class="btn-ghost btn-sm" data-m-cores>Usar estas cores (o app confere se ficam legíveis)</button></div>`;
  }

  function versoesHTML() {
    const vs = versoesDoModo(site(), modo);
    return `<details class="mt-4 rounded-lg border border-slate-200 p-3" data-versoes><summary class="flex min-h-[44px] cursor-pointer items-center text-sm font-medium text-slate-600">Histórico de versões (${vs.length})</summary>
      <p class="hint mt-2">Cada mudança aplicada vira uma versão. "Voltar para esta versão" cria uma versão nova igual à escolhida, sem apagar nada. Guardamos as últimas ${MAX_VERSOES} versões deste site; as mais antigas saem sozinhas.</p>
      ${vs.length ? `<ol class="mt-2 space-y-1 text-sm">${vs.map((v, i) => `<li class="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1" data-versao="${v.n}">
        <span><b>v${v.n}</b> · ${esc(quando(v.em))} · ${esc(v.resumo)}</span>
        <span class="flex flex-wrap gap-1">${v.planoId && ctx.verPlano ? `<button type="button" class="btn-ghost btn-sm" data-ver-plano-versao="${esc(v.planoId)}" data-versao-plano="${v.n}"><i class="fa-solid fa-list-check"></i> Ver plano desta versão</button>` : ''}${i === 0 ? '<span class="tag tag-ok">atual</span>' : `<button type="button" class="btn-ghost btn-sm" data-voltar="${v.n}">Voltar para esta versão</button>`}</span></li>`).join('')}</ol>`
        : '<p class="hint mt-2">Nenhuma mudança aplicada ainda. A primeira cria também a "Versão inicial", para dar para voltar ao começo.</p>'}</details>`;
  }

  function outroModoHTML() {
    const s = site();
    if (!(temCustom(s) && temPacote(s)) || !divergencias(s).length) return '';
    return `<div class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800" data-outro-modo>
      <p><b>Este cliente também tem ${custom ? 'o pacote Nuvemshop/Shopify' : 'o site personalizado'}</b>, que agora está diferente em: ${esc(divergencias(s).join(', '))}. Nada é copiado sozinho.</p>
      <button type="button" class="btn-primary btn-sm mt-1" data-aplicar-outro><i class="fa-solid fa-arrows-rotate"></i> Aplicar também ${custom ? 'no pacote' : 'no site personalizado'}</button></div>`;
  }

  const contador = (t) => `${String(t || '').length.toLocaleString('pt-BR')} de ${LIMITE_PEDIDO_AJUSTE.toLocaleString('pt-BR')} caracteres`;
  function desenhar() {
    const d = rascunho(), ent = entendido(), u = ultimo();
    const e = estadoBase();
    const nAceito = aceitoRecente.get(chave);
    const aposAceitar = nAceito && versoesDoModo(site(), modo)[0]?.n === nAceito ? { n: nAceito } : null;
    const texto = site().pedidoAjusteTexto?.[modo] || '';
    alvo.innerHTML = `<div class="card mt-4 border-violet-200" data-ajuste-site>
      <h3 class="mb-1 font-semibold text-violet-800"><i class="fa-solid fa-comments mr-1"></i> Ajustar ${custom ? 'este site' : 'o conteúdo deste pacote'}</h3>
      <p class="caption">${LEGENDA}</p>
      ${custom ? '' : `<p class="mt-1 rounded bg-slate-50 p-2 text-sm text-slate-700"><i class="fa-solid fa-circle-info mr-1"></i>${LEGENDA_PACOTE}.</p>`}
      ${u ? aplicadoHTML(u) : ''}
      ${aposAceitar && !d && !u ? `<p class="mt-2 rounded bg-emerald-50 p-2 text-sm text-emerald-800" data-aceito><i class="fa-solid fa-circle-check"></i> <b>Aplicado (v${aposAceitar.n}).</b> Próximo passo: ${custom ? 'baixe a pasta do site de novo (botão "Baixar pasta do site…") e publique por cima da versão antiga na hospedagem' : 'baixe o catálogo (CSV), os banners e o manual de novo para entregar a versão nova'}.</p>` : ''}
      ${aposAceitar ? outroModoHTML() : ''}
      <div class="mt-3 space-y-2 text-sm" data-chat>${conversa().map(itemChat).join('') || '<p class="hint">Exemplos: “troca a F12 pela F27 na galeria do produto”, “deixa o banner mais curto”, “coloca os depoimentos antes dos produtos”, “deixa o site em tons de verde”.</p>'}</div>
      <form class="mt-2" data-form-ajuste><label class="label" for="pedido-ajuste-${modo}">O que quer mudar ${custom ? 'no site' : 'no pacote'}?</label>
        <textarea id="pedido-ajuste-${modo}" class="input min-h-[6rem] text-base" name="pedido" rows="3" maxlength="${LIMITE_PEDIDO_AJUSTE}" aria-describedby="contador-ajuste-${modo}" placeholder="Ex.: troca a F12 pela F27 na galeria; deixa o banner mais curto" data-pedido-ajuste>${esc(texto)}</textarea>
        <p class="mt-1 text-xs text-slate-500" id="contador-ajuste-${modo}" aria-live="polite" data-contador-ajuste>${contador(texto)}</p>
        <div class="mt-1 flex flex-wrap gap-2"><button class="btn-ia min-h-[44px]" type="submit"><i class="fa-solid fa-list-check"></i> Ver o que vai mudar</button></div></form>
      <details class="mt-2 rounded-lg border border-slate-200 p-2" data-mudar-secao><summary class="flex min-h-[44px] cursor-pointer items-center text-sm font-medium text-slate-600">Mudar esta seção</summary>
        <p class="hint">Escolha a seção: o pedido já começa com o nome dela e vai só ela (o "Entendi assim" sai sem IA).</p>
        <div class="mt-1 flex flex-wrap gap-2">${secoesDoSite(modo).map((s) => `<button type="button" class="btn-ghost btn-sm min-h-[44px]" data-mudar-secao-btn="${esc(s.id)}">${esc(s.nome)}</button>`).join('')}</div></details>
      ${ent ? entendidoHTML(ent) : ''}
      ${d ? rascunhoHTML(d) : ''}
      <details class="mt-4 rounded-lg border border-slate-200 p-3" data-manuais><summary class="flex min-h-[44px] cursor-pointer items-center text-sm font-medium text-slate-600">Ajustar à mão (sem IA)</summary><div class="mt-2">${manuaisHTML(e)}</div></details>
      ${versoesHTML()}</div>`;
    if (mostrarAplicado.has(chave) && u) { mostrarAplicado.delete(chave); const el = $('[data-aplicado]', alvo); if (el) mostrarResultado(el, `Aplicado (v${u.versao}). Veja a conferência das seções mudadas.`); }
  }

  // ---------- eventos ----------
  const manual = async (ops, b) => {
    const r = await acrescentarAoRascunho(ops, 'manual');
    if (!r.mudou) return toast(`Não aplicado: ${r.descartadas.map((x) => x.motivo).join(' · ') || 'nada mudou'}`, 'erro');
    desenhar(); $('[data-manuais]', alvo).open = true;
    mostrarResultado($('[data-rascunho]', alvo), 'Mudança adicionada ao "Antes × Depois". Confira e clique em "Aplicar".');
    b?.blur?.();
  };
  let esperaTexto = null;
  const guardarTexto = (valor) => ctx.salvarSite({ pedidoAjusteTexto: { ...(site().pedidoAjusteTexto || {}), [modo]: valor } });
  on(alvo, 'input', '[data-pedido-ajuste]', (t) => {
    const c = $('[data-contador-ajuste]', alvo); if (c) c.textContent = contador(t.value);
    clearTimeout(esperaTexto); esperaTexto = setTimeout(() => guardarTexto(t.value).catch(() => {}), 600);
  });
  on(alvo, 'submit', '[data-form-ajuste]', (f, ev) => {
    ev.preventDefault(); clearTimeout(esperaTexto);
    const p = f.elements.pedido.value.trim(); if (!p) return;
    ocupado(f.querySelector('button[type=submit]'), async () => { await guardarTexto(p); await entender(p); });
  });
  on(alvo, 'click', '[data-mudar-secao-btn]', async (b) => {
    const campo = $('[data-pedido-ajuste]', alvo); if (!campo) return;
    const resto = campo.value.replace(/^\s*na seção\s+"[^"]+"\s*:\s*/i, '');
    campo.value = prefixoSecao(b.dataset.mudarSecaoBtn, modo) + resto;
    campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length);
    const c = $('[data-contador-ajuste]', alvo); if (c) c.textContent = contador(campo.value);
    await guardarTexto(campo.value).catch(() => {});
  });
  on(alvo, 'click', '[data-responder-ajuste]', (b) => ocupado(b, async () => {
    const ent = entendido(); if (!ent) return;
    await guardarEntendido(responderEntendimento(ent, b.dataset.responderAjuste, Number(b.dataset.opcao), modo));
  }));
  on(alvo, 'click', '[data-executar-ajuste]', (b) => ocupado(b, executar));
  on(alvo, 'click', '[data-cancelar-ajuste]', (b) => ocupado(b, async () => { await ctx.salvarSite({ ajusteEntendido: null }); desenhar(); mostrarResultado($('[data-form-ajuste]', alvo), 'Cancelado: nada mudou.'); }));
  on(alvo, 'change', '[data-escolher-versao]', (r) => ocupado(r, () => escolherTexto(Number(r.dataset.escolherVersao), r.value)));
  on(alvo, 'click', '[data-ver-secao]', (b) => { foco = b.dataset.verSecao; aba = b.dataset.lado; desenhar(); $('[data-previa-rascunho]', alvo)?.scrollIntoView({ block: 'nearest' }); });
  on(alvo, 'click', '[data-largura]', (b) => { largura = b.dataset.largura; desenhar(); $('[data-previa-rascunho]', alvo)?.scrollIntoView({ block: 'nearest' }); });
  on(alvo, 'click', '[data-outro-ajuste]', () => { const c = $('[data-pedido-ajuste]', alvo); if (c) { c.focus(); c.scrollIntoView({ block: 'center' }); } });
  on(alvo, 'click', '[data-aba]', (b) => { aba = b.dataset.aba; desenhar(); $('[data-rascunho]', alvo)?.scrollIntoView({ block: 'nearest' }); });
  on(alvo, 'click', '[data-previa-aba]', () => abrirPreviaIsolada(comFoco(ctx.htmlDe(aba === 'antes' ? estadoAtual() : { ...rascunho().estado, usosFotos: rascunho().usosFotos }), foco), `Prévia (${aba}) — ${cliente.nome}`));
  on(alvo, 'click', '[data-aceitar]', (b) => ocupado(b, aceitar));
  on(alvo, 'click', '[data-descartar]', (b) => ocupado(b, descartar));
  on(alvo, 'click', '[data-voltar]', (b) => voltarPara(Number(b.dataset.voltar)));
  on(alvo, 'click', '[data-fechar-aplicado]', (b) => ocupado(b, async () => { await ctx.salvarSite({ ajusteUltimo: null }); desenhar(); }));
  on(alvo, 'click', '[data-gerar-link-novo]', (b) => ocupado(b, async () => {
    const r = await ctx.gerarLinkNovo();
    await ctx.salvarSite({ ajusteUltimo: { ...ultimo(), linkNovo: r.quando } });
    desenhar(); mostrarResultado($('[data-link-novo]', alvo), `Link novo criado (${r.quando}). Está no topo da lista em "Aprovar".`);
  }));
  on(alvo, 'click', '[data-ver-plano-versao]', (b) => ctx.verPlano?.(b.dataset.verPlanoVersao, Number(b.dataset.versaoPlano)));
  on(alvo, 'click', '[data-aplicar-outro]', (b) => ocupado(b, async () => {
    const s = site();
    const patch = custom ? { pacote: aplicarBaseNoPacote(s.pacote, baseDoCustom(s)) } : aplicarBaseNoCustom(s.conteudo || {}, s.config || {}, baseDoPacote(s));
    const outro = custom ? 'pacote' : 'custom';
    const v = registrarVersao(s, { modo: outro, estadoAntes: estadoDoSite(s, outro), estadoDepois: estadoDoSite({ ...s, ...patch }, outro), resumo: `Recebeu as mudanças do ${custom ? 'site personalizado' : 'pacote'}`, origem: 'sincronizar' });
    await ctx.salvarSite({ ...patch, ...v });
    toast(`Aplicado também ${custom ? 'no pacote' : 'no site personalizado'}.`); ctx.recarregar();
  }));
  // manuais — site personalizado
  on(alvo, 'click', '[data-m]', async (b) => {
    const k = b.dataset.b, acao = b.dataset.m;
    const L = normalizarLayout(estadoBase().layout); const i = L.ordem.indexOf(k);
    if (acao === 'subir') return manual([{ op: 'mover', bloco: k, antesDe: L.ordem[i - 1] }], b);
    if (acao === 'descer') return manual([{ op: 'mover', bloco: k, depoisDe: L.ordem[i + 1] }], b);
    if (acao === 'ocultar' || acao === 'mostrar') return manual([{ op: acao, bloco: k }], b);
    if (acao === 'texto') return editarTexto(k);
  });
  on(alvo, 'change', '[data-m-var]', (s) => { if (s.value) manual([{ op: 'variacao', bloco: s.dataset.mVar, opcao: s.dataset.opc, valor: s.dataset.opc === 'colunas' ? Number(s.value) : s.value }], s); });
  on(alvo, 'change', '[data-m-img]', (s) => { if (s.value !== '__') manual([{ op: 'imagem', bloco: s.dataset.mImg, materialId: s.value || null }], s); });
  on(alvo, 'click', '[data-m-paleta]', (b) => { const [a, c] = b.dataset.mPaleta.split(','); manual([custom ? { op: 'paleta', corPrimaria: a, corFundo: c } : { op: 'paleta', cores: [a, c, ...(estadoBase().pacote?.briefingTema?.paletaSugerida || []).slice(2)] }], b); });
  on(alvo, 'click', '[data-m-cores]', (b) => {
    const a = $('[data-cor-prim]', alvo).value, c = $('[data-cor-fundo]', alvo).value;
    const prob = problemaPaleta(a, c);
    if (prob) return toast(`Essas cores não foram usadas porque ${prob}`, 'erro');
    manual([{ op: 'paleta', corPrimaria: a, corFundo: c }], b);
  });
  // manuais — pacote
  on(alvo, 'click', '[data-m-pac]', (b) => {
    const secoes = estadoBase().pacote?.briefingTema?.secoesHome || []; const i = Number(b.dataset.i); const s = secoes[i];
    if (b.dataset.mPac === 'subir') return manual([{ op: 'mover', secao: s, antesDe: secoes[i - 1] }], b);
    if (b.dataset.mPac === 'descer') return manual([{ op: 'mover', secao: s, depoisDe: secoes[i + 1] }], b);
    return manual([{ op: 'ocultar', secao: s }], b);
  });
  on(alvo, 'click', '[data-m-pac-mostrar]', (b) => manual([{ op: 'mostrar', secao: b.dataset.mPacMostrar }], b));
  on(alvo, 'click', '[data-m-banner]', (b) => {
    const i = Number(b.dataset.mBanner); const ban = estadoBase().pacote?.banners?.[i] || {};
    formularioTexto(`Banner ${i + 1} (${ban.uso || 'banner'})`, [['titulo', 'Título', ban.titulo, 80], ['subtitulo', 'Subtítulo', ban.subtitulo, 180], ['cta', 'Texto do botão', ban.cta, 30]],
      (v) => Object.entries(v).filter(([c, val]) => val !== (ban[c] || '')).map(([c, val]) => ({ op: 'texto', campo: `banner.${i}.${c}`, valor: val })));
  });

  function editarTexto(k) {
    const e = estadoBase(); const c = e.conteudo || {}; const L = normalizarLayout(e.layout);
    const campos = {
      hero: [['heroTitulo', 'Título do banner', c.heroTitulo, 80], ['heroSubtitulo', 'Subtítulo', c.heroSubtitulo, 180], ['heroCta', 'Texto do botão', c.heroCta, 30]],
      marca: [['titulo.marca', 'Título da seção', tituloBloco(L, 'marca'), 60], ['storytelling', 'Texto da história', c.storytelling, 2500, true]],
      newsletter: [['newsletterTitulo', 'Título', c.newsletterTitulo, 80], ['newsletterTexto', 'Texto', c.newsletterTexto, 300]],
    }[k] || [[`titulo.${k}`, 'Título da seção', tituloBloco(L, k), 60]];
    const atual = Object.fromEntries(campos.map(([id, , val]) => [id, val || '']));
    formularioTexto(nomeBloco(k), campos, (v) => Object.entries(v).filter(([id, val]) => val !== atual[id]).map(([id, val]) => ({ op: 'texto', campo: id, valor: val })),
      k === 'faq' || k === 'depoimentos' ? `As perguntas e os depoimentos em si ficam no formulário "Conteúdo da loja" (ou peça no campo acima: “oculta o depoimento da Ana”, “reescreve a resposta da pergunta 2”).` : '');
  }
  function formularioTexto(titulo, campos, paraOps, nota = '') {
    const m = modal(`Editar texto: ${titulo}`, `<form class="space-y-3" data-f-texto><p class="caption">Vira uma mudança "Antes × Depois", com prévia antes de ir para o site.</p>${nota ? `<p class="hint">${esc(nota)}</p>` : ''}
      ${campos.map(([id, rot, val, max, grande]) => `<div><label class="label">${esc(rot)}</label>${grande ? `<textarea class="input" rows="5" name="${esc(id)}" maxlength="${max}">${esc(val || '')}</textarea>` : `<input class="input" name="${esc(id)}" maxlength="${max}" value="${esc(val || '')}">`}</div>`).join('')}
      <div class="flex gap-2"><button class="btn-primary" type="submit">Ver na prévia</button></div></form>`);
    on(m.el, 'submit', '[data-f-texto]', async (f, ev) => {
      ev.preventDefault();
      const v = Object.fromEntries(campos.map(([id]) => [id, f.elements[id].value.trim()]));
      const ops = paraOps(v);
      if (!ops.length) { toast('Nada mudou no texto.', 'info'); return; }
      m.fechar(); await manual(ops);
    });
  }

  desenhar();
  return { redesenhar: desenhar, prepararSugestao, proporOperacoes, proporLocal };
}
