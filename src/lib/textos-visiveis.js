// Todo texto que o cliente vê no site (banner, destaques, títulos, Sobre, FAQ, depoimentos, citações, descrições), para:
//  - o aviso de saúde valer para TUDO (antes só os textos do plano eram conferidos; depoimento e citação passavam);
//  - a auditoria de textos inventados (descrição de print, OCR, métrica de perfil mostrada como fala de cliente).
// Puro: sem banco e sem tela. Marca "[PREENCHER: …]" nunca conta.
import { achadosSaudeSite, semMarcasPreencher } from './saude.js';
import { dadosDoPacote } from './pacote-loja.js';
import { depoimentosVivos, ehTextoInterno, provasEmImagem, ORIGEM_PROVA } from './prova-social.js';
import { normalizarLayout, tituloBloco } from './site-blocos.js';
import { tituloSecaoLoja } from './visual-site.js';

const txt = (v) => String(v ?? '').trim();
const chave = (t) => txt(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

/**
 * Textos visíveis do site no modo: [{ secao, onde, texto }]. No pacote, lidos de dadosDoPacote (exatamente o que a prévia
 * e os arquivos mostram); no personalizado, do conteúdo + depoimentos lidos da fonte.
 */
export function textosVisiveis({ cliente = {}, site = {}, modo = 'pacote', produtos = [], materiais = [], provas = [] } = {}) {
  const out = [];
  const add = (secao, onde, texto) => { const t = semMarcasPreencher(texto).trim(); if (t) out.push({ secao, onde, texto: t }); };
  if (modo === 'pacote') {
    const d = dadosDoPacote({ cliente, site, produtos, provas, materiais });
    const vis = (k) => !d.visual.ocultas.includes(k);
    if (vis('banner')) (d.banners.length ? d.banners : [d.banner]).forEach((b, i) => { add('banner', `Banner ${i + 1}: título`, b.titulo); add('banner', `Banner ${i + 1}: subtítulo`, b.subtitulo); });
    if (vis('destaques')) d.destaques.forEach((g) => { add('destaques', 'Destaques: título', g.titulo); g.linhas.forEach((l, i) => add('destaques', `Destaques: texto ${i + 1}`, l)); });
    for (const k of ['provas', 'produtos', 'depoimentos', 'sobre', 'galeria', 'faq']) if (vis(k) && d.visual.titulos?.[k]) add(k, 'Título da seção', tituloSecaoLoja(d.visual, k));
    if (vis('depoimentos')) d.depoimentos.forEach((x, i) => add('depoimentos', `Depoimento ${i + 1}${i === 0 ? ' (citação em destaque)' : ''}`, x.texto));
    add('sobre', 'Sobre a marca', d.sobre);
    d.faq.forEach((f, i) => { add('faq', `Pergunta ${i + 1}`, f.p); add('faq', `Resposta ${i + 1}`, f.r); });
    d.produtos.forEach((p) => { add('produto', `${p.nome}: descrição`, p.descricao); add('produto', `${p.nome}: benefícios`, p.beneficios); });
    return out;
  }
  const c = site.conteudo || {}, L = normalizarLayout(site.layout);
  const vis = (k) => !L.ocultos.includes(k);
  if (vis('hero')) { add('hero', 'Banner: título', c.heroTitulo); add('hero', 'Banner: subtítulo', c.heroSubtitulo); }
  (c.destaques || []).forEach((g) => { add('destaques', 'Destaques: título', g.titulo); (g.linhas || []).forEach((l, i) => add('destaques', `Destaques: texto ${i + 1}`, l.texto)); });
  if (vis('marca')) add('marca', 'Nossa história', c.storytelling);
  if (vis('depoimentos')) depoimentosVivos({ cliente, materiais, guardados: c.depoimentos || [], provasOcultas: c.provasOcultas || [] }).filter((d) => !L.depoimentosOcultos.includes(d.texto))
    .forEach((x, i) => add('depoimentos', `Depoimento ${i + 1}`, x.texto));
  if (vis('faq')) (c.faq || []).forEach((f, i) => { add('faq', `Pergunta ${i + 1}`, f.p); add('faq', `Resposta ${i + 1}`, f.r); });
  for (const k of Object.keys(L.titulos || {})) if (vis(k)) add(k, 'Título da seção', tituloBloco(L, k));
  return out;
}

/** Alegações de saúde em todo o site: [{ secao, onde, texto, achados, chave, confirmado }]. */
export function alegacoesDoSite(args = {}) {
  const confirmadas = new Map((args.site?.alegacoesConfirmadas || []).map((x) => [x.chave, x]));
  return textosVisiveis(args).map((t) => ({ ...t, achados: achadosSaudeSite(t.texto), chave: chave(t.texto) })).filter((t) => t.achados.length)
    .map((t) => ({ ...t, confirmado: confirmadas.get(t.chave) || null }));
}

// ---------- auditoria: texto de descrição/OCR/métrica que virou conteúdo ----------
/** Depoimentos GUARDADOS (cópias no site) cujo texto é anotação interna. */
function depoimentosSuspeitos(lista = [], ctx) {
  return (lista || []).filter((d) => txt(d?.texto) && (d.origem === 'prova_texto' || d.origem === ORIGEM_PROVA || d.origem === 'criativo' || ehTextoInterno(d.texto, ctx))
    && (ehTextoInterno(d.texto, ctx) || (d.origem === ORIGEM_PROVA && !txt(ctx.materiais.find((m) => m.id === d.materialId)?.textoDepoimento)) || d.origem === 'criativo'));
}
/**
 * Lista do que foi (ou ainda está guardado como) texto inventado no site de um cliente: [{ cliente, versao, secao, texto,
 * origem }]. Olha o site atual, todas as versões guardadas e os links de aprovação ainda ativos. Só lê.
 */
export function auditarInventados({ cliente = {}, site = null, materiais = [], aprovacoes = [] } = {}) {
  if (!site) return [];
  const ctx = { materiais, cliente };
  const nome = cliente.nome || cliente.id || '?';
  const out = [];
  const ver = (estado, versao) => {
    const deps = [...(estado?.conteudo?.depoimentos || []), ...(estado?.pacote?.depoimentos || [])];
    for (const d of depoimentosSuspeitos(deps, ctx)) out.push({ cliente: nome, versao, secao: 'Quem já comprou / Depoimentos', texto: txt(d.texto), origem: d.origem === 'criativo' ? 'copy de criativo' : ehTextoInterno(d.texto, ctx) ? 'descrição/OCR de print ou métrica de perfil' : 'texto lido do print (não digitado)' });
  };
  ver(site, 'atual');
  for (const v of site.versoesAjuste || []) ver(v.estado, `v${v.n}`);
  // Linhas do perfil (provas sociais) que viravam depoimento antes desta correção.
  for (const l of txt(cliente.marca?.provasSociais).split('\n').map(txt).filter(Boolean)) if (ehTextoInterno(l, ctx)) out.push({ cliente: nome, versao: 'perfil (mostrado no site antes da correção)', secao: 'Quem já comprou / Depoimentos', texto: l.replace(/\s*\(do print enviado em [^)]*\)\s*$/i, ''), origem: 'provas sociais do perfil (lidas de print/Instagram)' });
  // Links ativos guardam o site como estava quando foram criados.
  for (const a of aprovacoes.filter((x) => x.tipo === 'site' && !x.substituidoEm)) {
    const html = `${a.html || ''}${a.previa || ''}${a.texto || ''}`;
    for (const l of [...txt(cliente.marca?.provasSociais).split('\n'), ...provasEmImagem(materiais).flatMap((m) => [m.descricao, m.citacao])].map((x) => txt(x).replace(/\s*\(do print enviado em [^)]*\)\s*$/i, '')).filter((x) => x.length > 12 && ehTextoInterno(x, ctx)))
      if (html.includes(l.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])))) out.push({ cliente: nome, versao: `link de aprovação de ${String(a.criadoEm || '').slice(0, 10)}`, secao: 'Quem já comprou / Depoimentos', texto: l, origem: 'mostrado no link enviado ao cliente' });
  }
  const vistos = new Set();
  return out.filter((x) => { const k = `${x.versao}|${chave(x.texto)}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

/** Criativos: textos que vieram de descrição/OCR de print (Frente "nada inventado" nos criativos). Só lê. */
export function auditarCriativos({ cliente = {}, criativos = [], materiais = [] } = {}) {
  const ctx = { materiais, cliente };
  const frases = provasEmImagem(materiais).flatMap((m) => [m.descricao, m.citacao]).map(txt).filter((x) => x.length > 12);
  const out = [];
  for (const c of criativos) for (const campo of ['hook', 'copy', 'cta', 'roteiro']) {
    const t = txt(c[campo]); if (!t) continue;
    const achou = frases.find((f) => chave(t).includes(chave(f))) || (ehTextoInterno(t, ctx) ? t : null);
    if (achou) out.push({ cliente: cliente.nome || '?', criativo: c.nome || c.id, campo, texto: achou.slice(0, 200) });
  }
  return out;
}

/** Tira dos depoimentos guardados os que são anotação interna (para o botão "Remover textos inventados"). */
export function semInventados(lista = [], { materiais = [], cliente = {} } = {}) {
  const ruins = new Set(depoimentosSuspeitos(lista, { materiais, cliente }).filter((d) => ehTextoInterno(d.texto, { materiais, cliente }) || d.origem === 'prova_texto'));
  const limpa = (lista || []).filter((d) => !ruins.has(d)).map((d) => (d.origem === ORIGEM_PROVA || d.origem === 'criativo') && txt(d.texto) && !txt(materiais.find((m) => m.id === d.materialId)?.textoDepoimento) ? { ...d, texto: '' } : d);
  return { lista: limpa, removidos: (lista || []).filter((d) => ruins.has(d) || ((d.origem === ORIGEM_PROVA || d.origem === 'criativo') && txt(d.texto) && !txt(materiais.find((m) => m.id === d.materialId)?.textoDepoimento))).map((d) => txt(d.texto)) };
}
