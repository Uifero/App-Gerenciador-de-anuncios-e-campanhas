// "Usar em" das fotos dos Materiais do cliente: o operador diz onde cada foto vai no site (banner, produto X, Clientes
// reais, Sobre, Galeria ou não usar). Regras puras, sem banco nem tela.
//  - Código estável por foto (F1, F2...): guardado no material (`codigo`), com o contador no cliente (`contadorFotos`).
//    Um código apagado nunca volta: o próximo é sempre maior que o maior já usado.
//  - Os usos ficam no próprio material (`usos`), apontando para o mesmo arquivo: nenhuma cópia. Apagar a foto apaga
//    os vínculos junto (o produto perde só aquela foto).
//  - Prioridade: escolha no seletor ("manual") > escolha direta do modo (ajustes rápidos: imagem do banner/história)
//    > referência no texto "Como eu quero o site" ("texto"). Gerar de novo só refaz as marcas "texto"; nunca mexe nas
//    "manual". Tirar uma escolha no seletor deixa a marca em `bloqueados`, para o texto não colocá-la de volta.
import { tipoMaterial } from './prova-social.js';
import { linhasSemModelo, limparModelo, tituloMaiusculo } from './modelo-pedido-site.js';
import { focoDe, ehVertical, planoArquivos } from './medidas-site.js';

export const USOS_FOTO = [['banner', 'Banner'], ['produto', 'Produto'], ['clientes', 'Clientes reais'], ['sobre', 'Sobre a loja/história'], ['galeria', 'Galeria'], ['nao', 'Não usar no site']];
export const nomeUso = (k) => (USOS_FOTO.find(([u]) => u === k) || [, k])[1];
const SIMPLES = ['banner', 'clientes', 'sobre', 'galeria', 'nao'];
const ORDENAVEIS = ['banner', 'clientes', 'sobre', 'galeria'];
export const DEFINIDO_TEXTO = 'definido pelo texto';

const txt = (v) => String(v ?? '').trim();
const sem = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- códigos ----------
/** Só imagens do cliente (fotos e prints) recebem código: logo, vídeo e o print da referência ficam de fora. */
export const temCodigo = (m) => ['foto', 'prova_social'].includes(tipoMaterial(m)) && Boolean(m?.url);
export const numeroCodigo = (c) => { const r = /^F(\d+)$/i.exec(txt(c)); return r ? Number(r[1]) : 0; };
export const porCodigo = (a, b) => (numeroCodigo(a.codigo) || 1e9) - (numeroCodigo(b.codigo) || 1e9);

/**
 * Códigos para as fotos que ainda não têm, continuando do maior já usado (o contador do cliente ou o maior código
 * existente, o que for maior). Devolve { atribuir: [{ id, codigo }], contador }.
 */
export function novosCodigos(materiais = [], contador = 0) {
  let n = Math.max(Number(contador) || 0, 0, ...materiais.map((m) => numeroCodigo(m?.codigo)));
  const semCodigo = materiais.filter((m) => temCodigo(m) && !numeroCodigo(m.codigo))
    .sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')) || String(a.id).localeCompare(String(b.id)));
  const atribuir = semCodigo.map((m) => ({ id: m.id, codigo: `F${++n}` }));
  return { atribuir, contador: n };
}
export const nomeArquivo = (m) => txt(m?.nomeOriginal) || txt(m?.descricao) || txt(m?.nome) || 'imagem';
/** "F3 — foto-frente.jpg" */
export const rotuloFoto = (m) => `${m?.codigo ? `${m.codigo} — ` : ''}${nomeArquivo(m)}`;

// ---------- usos ----------
export function normalizarUsos(u = {}) {
  const r = {};
  for (const k of SIMPLES) if (u?.[k] === 'manual' || u?.[k] === 'texto') r[k] = u[k];
  const vistos = new Set();
  r.produtos = (Array.isArray(u?.produtos) ? u.produtos : []).filter((p) => p?.id && !vistos.has(String(p.id)) && vistos.add(String(p.id))).map((p) => ({
    id: String(p.id), ordem: Number(p.ordem) > 0 ? Math.round(Number(p.ordem)) : 0, principal: Boolean(p.principal), por: p.por === 'texto' ? 'texto' : 'manual',
  }));
  r.pessoa = Boolean(u?.pessoa);
  r.bloqueados = [...new Set((Array.isArray(u?.bloqueados) ? u.bloqueados : []).map(String))];
  // Posição da foto em cada lugar com várias fotos (banner = ordem dos slides do carrossel). 0 = sem posição (vai no fim).
  r.ordem = {};
  for (const k of ORDENAVEIS) { const n = Number(u?.ordem?.[k]); if (n > 0) r.ordem[k] = Math.round(n); }
  // "Juntar fotos" no banner: esta foto abre o slide e as de `juntar` (1 ou 2) entram lado a lado com ela.
  r.juntar = [...new Set((Array.isArray(u?.juntar) ? u.juntar : []).map(String))].slice(0, 2);
  return r;
}
export const usosDe = (m) => normalizarUsos(m?.usos);
const naoUsa = (m) => Boolean(usosDe(m).nao);
/** Tem algum uso (qualquer origem)? */
export const temUso = (u) => SIMPLES.some((k) => u[k]) || u.produtos.length > 0;
const temUsoManual = (u) => SIMPLES.some((k) => k !== 'nao' && u[k] === 'manual') || u.produtos.some((p) => p.por === 'manual');
const igual = (a, b) => JSON.stringify(normalizarUsos(a)) === JSON.stringify(normalizarUsos(b));

/**
 * Mudança feita no seletor "Usar em" (escolha manual). `uso`: banner | produto | clientes | sobre | galeria | nao.
 * Para produto: `produtoId`, e opcionalmente `ordem` e `principal`. Devolve os materiais que mudaram: [{ id, usos }].
 * Banner aceita várias fotos (carrossel): a nova entra no fim. "Foto principal" é uma só por produto; "Não usar" tira
 * os outros usos da foto (e marcar outro uso tira o "Não usar").
 */
export function mudarUso(materiais = [], id, { uso, ligado = true, produtoId = null, ordem, principal } = {}) {
  const mapa = new Map(materiais.map((m) => [m.id, usosDe(m)]));
  const u = mapa.get(id); if (!u) return [];
  const chave = uso === 'produto' ? `produto:${produtoId}` : uso;
  if (uso === 'produto' && !produtoId) return [];
  if (ligado) {
    u.bloqueados = u.bloqueados.filter((b) => b !== chave);
    if (uso === 'nao') { for (const k of SIMPLES) delete u[k]; u.produtos = []; u.nao = 'manual'; }
    else {
      delete u.nao;
      if (uso === 'produto') {
        let e = u.produtos.find((p) => p.id === produtoId);
        if (!e) {
          const maior = Math.max(0, ...[...mapa.values()].flatMap((x) => x.produtos.filter((p) => p.id === produtoId).map((p) => p.ordem)));
          e = { id: produtoId, ordem: maior + 1, principal: false, por: 'manual' }; u.produtos.push(e);
        }
        e.por = 'manual';
        if (Number(ordem) > 0) e.ordem = Math.round(Number(ordem));
        if (principal !== undefined) e.principal = Boolean(principal);
        if (e.principal) for (const [outro, x] of mapa) if (outro !== id) x.produtos.forEach((p) => { if (p.id === produtoId) p.principal = false; });
      } else {
        if (ORDENAVEIS.includes(uso) && !u[uso]) u.ordem[uso] = proximaPosicao(mapa, uso);
        u[uso] = 'manual';
      }
    }
  } else {
    if (uso === 'produto') u.produtos = u.produtos.filter((p) => p.id !== produtoId);
    else { delete u[uso]; delete u.ordem[uso]; if (uso === 'banner') u.juntar = []; }
    if (!u.bloqueados.includes(chave)) u.bloqueados.push(chave);
  }
  return mudados(materiais, mapa);
}
/** "Mostra pessoa" (foto de Clientes reais): pede a mesma autorização dos prints antes de sair do app. */
export function mudarPessoa(materiais = [], id, pessoa) {
  const mapa = new Map(materiais.map((m) => [m.id, usosDe(m)]));
  if (!mapa.has(id)) return [];
  mapa.get(id).pessoa = Boolean(pessoa);
  return mudados(materiais, mapa);
}
/**
 * Nova ordem das fotos de um lugar (arrastar no seletor): `ids` na ordem desejada. `lugar`: banner | clientes | sobre |
 * galeria | produto (com `produtoId`; a 1ª vira a "Foto principal"). Fotos do lugar que não vieram em `ids` vão para o
 * fim, na ordem de antes. Arrastar é escolha do operador: as marcas desse lugar viram "manual" (o texto não as refaz).
 * Devolve [{ id, usos }].
 */
export function reordenar(materiais = [], lugar, ids = [], produtoId = null) {
  const mapa = new Map(materiais.map((m) => [m.id, usosDe(m)]));
  const atuais = lugar === 'produto'
    ? fotosDoProduto({ id: produtoId, fotosMigradas: true }, materiais).map((f) => f.materialId)
    : imagensDoUso(materiais, lugar).map((f) => f.materialId);
  // Clientes reais também tem os prints de prova social (entram pelo tipo, sem marca "Usar em"): valem os ids pedidos.
  if (lugar === 'clientes') ids.map(String).forEach((id) => { if (mapa.has(id) && !atuais.includes(id)) atuais.push(id); });
  const ordem = [...ids.map(String).filter((id) => atuais.includes(id)), ...atuais.filter((id) => !ids.map(String).includes(id))];
  ordem.forEach((id, i) => {
    const u = mapa.get(id);
    if (lugar === 'produto') { const e = u.produtos.find((p) => p.id === produtoId); if (e) { e.ordem = i + 1; e.principal = i === 0; e.por = 'manual'; } }
    else { u.ordem[lugar] = i + 1; if (u[lugar]) u[lugar] = 'manual'; }
  });
  return mudados(materiais, mapa);
}
/**
 * "Juntar fotos" no banner: `ids` (2 ou 3 fotos que já estão no banner) viram UM slide, lado a lado, na ordem dada.
 * A 1ª guarda as outras em `juntar`; nenhuma outra foto continua juntando estas. `ids` com 1 foto = separar.
 */
export function juntarNoBanner(materiais = [], ids = []) {
  const mapa = new Map(materiais.map((m) => [m.id, usosDe(m)]));
  const lista = [...new Set(ids.map(String))].filter((id) => mapa.get(id)?.banner).slice(0, 3);
  if (!lista.length) return [];
  for (const [, u] of mapa) u.juntar = u.juntar.filter((j) => !lista.includes(j));
  for (const id of lista) mapa.get(id).juntar = [];
  if (lista.length > 1) mapa.get(lista[0]).juntar = lista.slice(1);
  return mudados(materiais, mapa);
}
/** Separa o slide aberto por `id`: cada foto volta a ser um slide. */
export const separarNoBanner = (materiais = [], id) => juntarNoBanner(materiais, [id]);
/** Posição depois da última foto do lugar (fotos antigas sem posição também contam). */
const proximaPosicao = (mapa, uso) => { const no = [...mapa.values()].filter((x) => x[uso]); return 1 + Math.max(no.length, ...no.map((x) => x.ordem[uso] || 0)); };
const mudados = (materiais, mapa) => materiais.filter((m) => mapa.has(m.id) && !igual(m.usos, mapa.get(m.id))).map((m) => ({ id: m.id, usos: normalizarUsos(mapa.get(m.id)) }));
/** Aplica os patches numa cópia da lista (para prévia e para atualizar a tela sem reler o banco). */
export const comUsos = (materiais = [], patches = []) => materiais.map((m) => { const p = patches.find((x) => x.id === m.id); return p ? { ...m, usos: p.usos } : m; });

// ---------- referências no texto ("F3 no banner, F5 e F6 no Thermora", listas e títulos) ----------
// O operador escreve do jeito dele: listas ("F23, F26, F25", "f27/f28/f29", "F20 a F25"), títulos de seção ("### Página do
// produto", "**Carrinho:**", "Galeria:") e códigos no meio da frase ("nas perguntas frequentes usar F31"). Sem IA, o app
// entende o lugar pela própria frase ou, sem lugar na frase, pelo título mais próximo acima. "***" e "---" só separam.
// O que não der para entender vira UMA linha de resumo ("X fotos não foram entendidas sem IA"): a IA resolve no
// "Analisar meu pedido". Nada é inventado.
const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20 };
const COD = `\\b(?:f|efe)\\s*-?\\s*(\\d{1,3}|${Object.keys(NUMEROS).join('|')})\\b`;
const RE_COD = new RegExp(COD, 'g');
const TEM_COD = new RegExp(COD);
const numDe = (x) => (/^\d+$/.test(x) ? Number(x) : NUMEROS[x] || 0);
// Normaliza SEM mudar o tamanho do texto (as posições valem no original): acentos fora, tudo minúsculo.
const norm = (s) => String(s ?? '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Entre dois códigos só vírgula, barra, ponto e vírgula, "e", "&", espaço ou quebra de linha = a mesma lista.
const SO_SEPARADOR = /^(?:[\s,;/&+|]|\be\b)*$/;
// "F20 a F25", "F20-F25", "F20 até F25" = intervalo (até 40 fotos).
const INTERVALO = /^\s*(?:-|–|—|\ba\b|\bate\b)\s*$/;
const MAX_INTERVALO = 40;

/** Listas de códigos do texto (já normalizado): [{ ns: [números, sem repetir], ini, fim }]. */
function gruposDeCodigos(t) {
  const achados = [...t.matchAll(RE_COD)].map((x) => ({ n: numDe(x[1]), ini: x.index, fim: x.index + x[0].length })).filter((a) => a.n > 0);
  const grupos = [];
  for (const a of achados) {
    const g = grupos[grupos.length - 1];
    const gap = g ? t.slice(g.fim, a.ini) : null;
    const ult = g ? g.ns[g.ns.length - 1] : 0;
    if (g && INTERVALO.test(gap) && a.n > ult && a.n - ult <= MAX_INTERVALO) { for (let k = ult + 1; k <= a.n; k++) g.ns.push(k); g.fim = a.fim; }
    else if (g && SO_SEPARADOR.test(gap)) { g.ns.push(a.n); g.fim = a.fim; }
    else grupos.push({ ns: [a.n], ini: a.ini, fim: a.fim });
  }
  for (const g of grupos) g.ns = [...new Set(g.ns)];
  return grupos;
}
/** Todos os códigos citados, na ordem em que aparecem (listas e intervalos abertos, sem repetir): [{ codigo, pos }]. */
export function codigosDoTexto(texto) {
  const vistos = new Set(), out = [];
  for (const g of gruposDeCodigos(norm(texto))) for (const n of g.ns) if (!vistos.has(n)) { vistos.add(n); out.push({ codigo: `F${n}`, pos: g.ini }); }
  return out;
}

// ---------- títulos e seções do texto ----------
const RE_SEPARADOR = /^\s*(?:[*_\-–—=~]\s*){3,}$/;
const limparTitulo = (s) => String(s).replace(/[*_#`]+/g, '').replace(/\s*:\s*$/, '').trim();
/**
 * Título de uma linha: "### Página do produto" (nivel 1), "**Carrinho:**" (nivel 2, com ou sem texto depois) e
 * "Galeria do produto:" (nivel 3, subtítulo) valem para as linhas de baixo (fixo); "Galeria: F27, F28" (rótulo com
 * conteúdo) vale só para a própria linha. null = não é título.
 */
export function tituloDaLinha(linha) {
  const l = String(linha ?? '');
  if (RE_SEPARADOR.test(l)) return null;
  let m = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/.exec(l);
  if (m) return { titulo: limparTitulo(m[1]), resto: '', fixo: true, nivel: 1 };
  const caps = tituloMaiusculo(l); // "PÁGINA DO PRODUTO:" (títulos do modelo): seção, como "**...:**"
  if (caps) return { titulo: caps, resto: '', fixo: true, nivel: 2 };
  m = /^\s*(?:[-•]\s*)?\*{1,3}([^*\n]{1,80})\*{1,3}\s*(.*)$/.exec(l);
  if (m) {
    const dentro = m[1].trim(), depois = m[2];
    if (/:$/.test(dentro) || /^:/.test(depois) || !depois.trim()) return { titulo: limparTitulo(dentro), resto: depois.replace(/^:\s*/, ''), fixo: true, nivel: 2 };
  }
  m = /^\s*(?:[-•]\s*)?([^:.!?\n]{2,60}):(?!\/\/)\s*(.*)$/.exec(l);
  if (m && /[a-zà-ú]/i.test(m[1]) && !TEM_COD.test(norm(m[1])) && m[1].trim().split(/\s+/).length <= 6) return { titulo: limparTitulo(m[1]), resto: m[2], fixo: !m[2].trim(), nivel: 3 };
  return null;
}

/**
 * Linhas com os títulos que valem nelas: [{ ini, fim, secao, sub, rotulo }] (secao = título de seção acima; sub =
 * subtítulo dentro dela, como "Galeria do produto:"; rotulo = o da própria linha).
 */
function contextosDasLinhas(orig) {
  const out = [];
  let pos = 0, secao = null, sub = null;
  for (const linha of orig.split('\n')) {
    const ini = pos, fim = pos + linha.length; pos = fim + 1;
    if (RE_SEPARADOR.test(linha)) { secao = null; sub = null; out.push({ ini, fim }); continue; } // separador: o título de cima não vale mais
    const t = tituloDaLinha(linha);
    if (t?.fixo && t.nivel < 3) { secao = t.titulo; sub = null; } else if (t?.fixo) sub = t.titulo;
    out.push({ ini, fim, secao, sub, rotulo: t && !t.fixo ? t.titulo : null });
  }
  return out;
}

const MAX_SECOES = 30;
/**
 * Divide o texto nas seções do operador, na ordem dele: [{ id: 'S1', titulo, texto }]. Começa uma seção nos títulos mais
 * fortes que o texto usa ("###" e "**...:**"; sem eles, linha que termina em ":"; sem nenhum, cada rótulo "Banner: ...";
 * sem rótulo, cada parágrafo). Subtítulo fica dentro da seção. "***"/"---" só separam. Nada fica de fora: acima de 30
 * seções, o resto entra na última.
 */
export function dividirSecoes(texto) {
  const orig = String(texto ?? '').normalize('NFC').replace(/\r\n?/g, '\n');
  if (!orig.trim()) return [];
  // Linha que ainda tem "[...]" do modelo sai (não vai para a IA); a seção que ficou só com o título é "não preenchida".
  const linhas = linhasSemModelo(orig).map(({ linha: l, ignorada }) => ({ l, ign: ignorada, t: tituloDaLinha(l), sep: RE_SEPARADOR.test(l) }));
  const nivel = linhas.some((x) => x.t?.fixo && x.t.nivel < 3) ? 2 : linhas.some((x) => x.t?.fixo) ? 3 : 0;
  const temRotulo = linhas.some((x) => x.t);
  const secoes = [];
  let atual = null;
  const nova = (titulo) => { atual = { titulo, linhas: [], ignoradas: 0 }; secoes.push(atual); };
  linhas.forEach((x, i) => {
    if (x.sep) { atual = null; return; }
    const abre = nivel ? Boolean(x.t?.fixo && x.t.nivel <= nivel) : temRotulo ? Boolean(x.t) : Boolean(x.l.trim()) && (!atual || !linhas[i - 1]?.l.trim());
    if (abre) nova(x.t ? x.t.titulo : '');
    if (x.ign) { if (atual) atual.ignoradas++; return; }
    if (!x.l.trim() && !atual) return;
    if (!atual) nova('');
    atual.linhas.push(x.l);
  });
  const limpas = secoes.map((s) => ({ ...s, texto: s.linhas.join('\n').trim() })).filter((s) => s.texto);
  if (limpas.length > MAX_SECOES) { const resto = limpas.splice(MAX_SECOES - 1); limpas.push({ titulo: resto[0].titulo, texto: resto.map((s) => s.texto).join('\n\n'), ignoradas: 0 }); }
  return limpas.map((s, i) => {
    const primeira = s.texto.split('\n')[0].replace(/[*#_`]+/g, '').trim();
    const rotulo = tituloDaLinha(s.texto.split('\n')[0])?.titulo;
    const titulo = s.titulo || rotulo || (i === 0 && nivel ? 'Começo do texto' : primeira.length > 48 ? `${primeira.slice(0, 45).trim()}…` : primeira);
    const naoPreenchido = s.ignoradas > 0 && s.texto.split('\n').filter((l) => l.trim()).length <= 1 && Boolean(tituloDaLinha(s.texto)?.fixo);
    return { id: `S${i + 1}`, titulo, texto: s.texto, ...(naoPreenchido ? { naoPreenchido: true } : {}) };
  });
}

// ---------- lugar de cada lista ----------
const RE_NAO = /\b(nao usar|nao use|nao vai|nao vao|nao coloca|nao colocar|fora do site|nenhum lugar|ignorar|ignora)\b/;
const RE_PRINCIPAL = /\b(foto principal|imagem principal|capa do produto|como principal|principal d[oa])\b/;
const RE_PRODUTO = /\b(paginas? d[oe] produto|fotos? d[oe] produto|galeria d[oe] produto|carrossel d[oe] produto|produto)\b/;
// Lugares com vaga no seletor "Usar em" e lugares que o site não tem para foto (a IA decide o que fazer com eles).
const LUGARES = [
  ['banner', /\b(banner|topo|capa|hero)\b/],
  ['clientes', /\b(depoimentos?|clientes? reais?|prova social|provas sociais|avaliac\w*|quem ja comprou)\b/],
  ['faq', /\b(perguntas frequentes|perguntas e respostas|faq|duvidas)\b/],
  ['sobre', /\b(sobre|historia|quem somos|nossa marca|da marca)\b/],
  ['galeria', /\b(galeria|carrossel)\b/],
  ['carrinho', /\b(carrinho|checkout|finalizar compra)\b/],
  ['rodape', /\b(rodape)\b/],
  ['beneficios', /\b(beneficios|como usar|modo de uso|como tomar)\b/],
];
export const LUGARES_SEM_FOTO = { faq: 'perguntas frequentes', carrinho: 'carrinho', rodape: 'rodapé', beneficios: 'seção de benefícios/como usar' };
const destinoTexto = (k, p) => (k === 'produto' ? `no ${p?.nome || 'produto'}` : { banner: 'no banner', clientes: 'em Clientes reais', sobre: 'em Sobre a loja', galeria: 'na Galeria', nao: 'fora do site (não usar)' }[k]);

function acharProduto(alvo, produtos) {
  const a = ` ${norm(alvo).replace(/[^a-z0-9]+/g, ' ')} `;
  const notas = produtos.map((p) => {
    const nome = norm(p.nome).replace(/[^a-z0-9]+/g, ' ').trim(); if (!nome) return 0;
    if (a.includes(` ${nome} `)) return 1000 + nome.length; // o nome inteiro está no texto
    return nome.split(' ').filter((w) => w.length >= 4 && a.includes(` ${w} `)).length; // palavras do nome
  });
  const max = Math.max(0, ...notas);
  const melhores = produtos.filter((_, i) => notas[i] === max);
  return max > 0 && melhores.length === 1 ? melhores[0] : null; // empate = ambíguo: não chuta
}
/** Lugar de um trecho: { uso, produto?, principal?, lugar? } ou null. uso 'semlugar' = lugar sem foto no site. */
function classificar(alvo, produtos) {
  const t = norm(alvo);
  if (!t.trim()) return null;
  if (RE_NAO.test(t)) return { uso: 'nao' };
  const principal = RE_PRINCIPAL.test(t);
  const p = acharProduto(alvo, produtos);
  if (p) return { uso: 'produto', produto: p, principal };
  if (principal || RE_PRODUTO.test(t)) return { uso: 'produto', produto: produtos.length === 1 ? produtos[0] : null, principal };
  for (const [k, re] of LUGARES) if (re.test(t)) return LUGARES_SEM_FOTO[k] ? { uso: 'semlugar', lugar: LUGARES_SEM_FOTO[k] } : { uso: k };
  return null;
}
/** A frase manda; o título completa ("Galeria:" debaixo de "### Página do produto" = fotos do produto). */
function combinar(d, ctx) {
  if (!d) return ctx;
  if (ctx?.uso === 'produto' && d.uso === 'galeria') return { ...ctx, principal: false };
  if (ctx?.uso === 'produto' && d.uso === 'produto' && !d.produto) return { ...d, produto: ctx.produto };
  return d;
}

// Fim de frase ou começo da próxima instrução: o que vem depois disso no vão entre duas listas é da lista seguinte.
const CORTE = /[.;!?\n]|,|\s(?:e|mas|depois)\s/;
const CONECTORES = /^(?:[\s,:-]|\b(?:no|na|nos|nas|em|de|do|da|dos|das|para|pra|pro|como|vai|vao|fica|ficam|usar|use|usa|coloca|colocar|coloque|e|o|a|os|as|foto|fotos|quero|queria)\b)+/;

/**
 * Lê as referências por código no texto. Devolve { refs: [{ codigo, materialId, uso, produtoId, produtoNome, principal,
 * ordem }], naoEntendidas: [{ codigos, trecho, motivo }], inexistentes: ['F99'], resumo, avisos }. `resumo` é a linha
 * única do que não deu para entender sem IA; `avisos` junta o resumo e os códigos que não existem (nada é inventado).
 */
export function lerReferencias(texto, { materiais = [], produtos = [] } = {}) {
  const orig = limparModelo(String(texto ?? '').normalize('NFC')); // linha ainda com "[...]" do modelo não conta
  const t = norm(orig);
  const grupos = gruposDeCodigos(t);
  if (!grupos.length) return { refs: [], avisos: [], naoEntendidas: [], inexistentes: [], resumo: '' };
  const linhas = contextosDasLinhas(orig);
  const linhaDe = (pos) => linhas.find((l) => pos >= l.ini && pos <= l.fim) || {};
  const codigos = new Map(materiais.filter(temCodigo).filter((m) => numeroCodigo(m.codigo)).map((m) => [numeroCodigo(m.codigo), m]));
  const existentes = [...codigos.keys()].sort((a, b) => a - b);
  const refs = [], naoEntendidas = [], inexistentes = new Set(), vistos = new Set();
  const ordemPorProduto = new Map();
  // O vão entre duas listas é dividido no primeiro corte: o começo é o "depois" de uma, o resto é o "antes" da outra.
  const vaos = grupos.map((g, i) => {
    const fimVao = grupos[i + 1]?.ini ?? t.length;
    const vao = t.slice(g.fim, fimVao);
    const c = CORTE.exec(vao);
    return { depois: c ? vao.slice(0, c.index) : vao, sobra: c ? vao.slice(c.index) : '' };
  });
  grupos.forEach((g, i) => {
    const linha = linhaDe(g.ini);
    const iniFrase = Math.max(linha.ini ?? 0, t.lastIndexOf('.', g.ini - 1) + 1, t.lastIndexOf(';', g.ini - 1) + 1, t.lastIndexOf('!', g.ini - 1) + 1, t.lastIndexOf('?', g.ini - 1) + 1);
    const antes = i > 0 && grupos[i - 1].fim > iniFrase ? vaos[i - 1].sobra.replace(/^[\s,]*(?:e|mas|depois)?\s*/, '') : t.slice(iniFrase, g.ini);
    const depois = vaos[i].depois.replace(CONECTORES, '').trim();
    // Sem lugar na frase vale o título: o rótulo da linha ("Galeria: F27"), o subtítulo e o título da seção, nessa ordem.
    const cl = (x) => (x ? classificar(x, produtos) : null);
    const ctxTitulo = combinar(cl(linha.rotulo), combinar(cl(linha.sub), cl(linha.secao)));
    const daFrase = classificar(depois, produtos) || classificar(antes, produtos);
    const destino = combinar(daFrase, ctxTitulo);
    const fimTrecho = Math.min(linha.fim ?? t.length, g.fim + 60);
    const trecho = `${orig.slice(Math.max(iniFrase, g.ini - 60), fimTrecho).replace(/[*#_`]+/g, '').trim()}${fimTrecho < (linha.fim ?? 0) ? '…' : ''}`;
    const naoExiste = g.ns.filter((n) => !codigos.has(n));
    naoExiste.forEach((n) => inexistentes.add(`F${n}`));
    const ok = g.ns.filter((n) => codigos.has(n));
    if (!ok.length) return;
    if (!destino || destino.uso === 'semlugar' || (destino.uso === 'produto' && !destino.produto)) {
      const motivo = !destino ? 'o texto não diz o lugar' : destino.uso === 'semlugar' ? `${destino.lugar}: esse lugar não tem foto no seletor "Usar em"` : 'qual produto? há mais de um cadastrado';
      naoEntendidas.push({ codigos: ok.map((n) => `F${n}`), trecho, motivo });
      return;
    }
    ok.forEach((n, k) => {
      const m = codigos.get(n);
      const chave = `${n}|${destino.uso}|${destino.produto?.id || ''}`;
      if (vistos.has(chave)) return; // repetido no texto = uma vez só
      vistos.add(chave);
      const ref = { codigo: `F${n}`, materialId: m.id, uso: destino.uso, principal: false, ordem: 0 };
      if (destino.uso === 'produto') {
        const o = (ordemPorProduto.get(destino.produto.id) || 0) + 1; ordemPorProduto.set(destino.produto.id, o);
        Object.assign(ref, { produtoId: destino.produto.id, produtoNome: destino.produto.nome, principal: destino.principal && k === 0, ordem: o });
      }
      refs.push(ref);
    });
  });
  // Um código pode ir para dois lugares: o pedido de um lugar sem vaga conta mesmo que o outro tenha entrado.
  const naoEnt = naoEntendidas;
  const qtd = new Set(naoEnt.flatMap((x) => x.codigos)).size;
  const resumo = qtd ? `${qtd} foto${qtd > 1 ? 's' : ''} não ${qtd > 1 ? 'foram entendidas' : 'foi entendida'} sem IA. Clique em "Analisar meu pedido" para a IA resolver.` : '';
  const ine = [...inexistentes];
  const avisoIne = ine.length ? `Não existe esse código nos Materiais do cliente: ${ine.join(', ')}${existentes.length ? ` (os códigos vão de F${existentes[0]} a F${existentes[existentes.length - 1]})` : ' (ainda não há fotos com código)'}. Nada foi feito com ${ine.length > 1 ? 'eles' : 'ele'}.` : '';
  return { refs, naoEntendidas: naoEnt, inexistentes: ine, resumo, avisos: [resumo, avisoIne].filter(Boolean) };
}

/**
 * Aplica as referências do texto como se fossem escolhidas no seletor, marcadas "texto". Antes, tira todas as marcas
 * "texto" anteriores (o texto atual é a fonte). O seletor sempre vence: conflito vira uma linha de explicação e a
 * referência não entra, mas o operador resolve num clique (`escolhas`, uma por conflito: "Usar F27" muda o seletor,
 * "Manter F41" deixa como está). `direta` = escolha direta do modo atual ({ banner, sobre }: { materialId, nome } | null).
 * Devolve { patches: [{ id, usos }], conflitos: [texto], escolhas: [{ chave, texto, usar: { rotulo, materialId, uso,
 * produtoId?, principal? }, manter: { rotulo } }], aplicadas: [texto] }.
 */
export function aplicarReferencias(materiais = [], refs = [], { direta = {}, produtos = [] } = {}) {
  const mapa = new Map(materiais.map((m) => {
    const u = usosDe(m);
    for (const k of SIMPLES) if (u[k] === 'texto') { delete u[k]; delete u.ordem[k]; }
    u.produtos = u.produtos.filter((p) => p.por !== 'texto');
    return [m.id, u];
  }));
  const porId = new Map(materiais.map((m) => [m.id, m]));
  const cod = (id) => porId.get(id)?.codigo || 'a foto';
  const nomeProd = (pid) => produtos.find((p) => p.id === pid)?.nome || 'produto';
  const conflitos = [], escolhas = [], aplicadas = [];
  const conflito = (r, texto, curto, usar, manter) => {
    conflitos.push(texto);
    const chave = `${r.codigo}|${usar.uso}|${usar.produtoId || ''}|${usar.principal ? 'p' : ''}`;
    if (!escolhas.some((e) => e.chave === chave)) escolhas.push({ chave, texto: curto, usar: { materialId: r.materialId, ...usar }, manter: { rotulo: manter } });
  };
  for (const r of refs) {
    const u = mapa.get(r.materialId); if (!u) continue;
    const quer = `${r.codigo} ${destinoTexto(r.uso, { nome: r.produtoNome })}`;
    const chave = r.uso === 'produto' ? `produto:${r.produtoId}` : r.uso;
    const usarAssim = { rotulo: `Usar ${quer}`, uso: r.uso, ...(r.uso === 'produto' ? { produtoId: r.produtoId, principal: Boolean(r.principal) } : {}) };
    if (u.bloqueados.includes(chave)) { conflito(r, `O texto pede ${quer}, mas essa escolha foi tirada no seletor "Usar em": vale o seletor.`, `O texto pede ${quer}, mas essa escolha foi tirada no seletor "Usar em".`, usarAssim, 'Manter como está'); continue; }
    if (r.uso !== 'nao' && u.nao === 'manual') { conflito(r, `O texto pede ${quer}, mas no seletor ${r.codigo} está "Não usar no site": vale o seletor.`, `O texto pede ${quer}, mas no seletor ${r.codigo} está "Não usar no site".`, usarAssim, 'Manter fora do site'); continue; }
    if (r.uso === 'nao') {
      if (temUsoManual(u)) { conflito(r, `O texto pede ${r.codigo} fora do site, mas no seletor ela tem uso marcado: vale o seletor.`, `O texto pede ${r.codigo} fora do site, mas no seletor ela tem uso marcado.`, { rotulo: `Tirar ${r.codigo} do site`, uso: 'nao' }, 'Manter no site'); continue; }
      for (const k of SIMPLES) delete u[k]; u.produtos = []; u.nao = u.nao || 'texto'; aplicadas.push(`${r.codigo}: não usar no site`); continue;
    }
    if (u.nao === 'texto') delete u.nao;
    if (r.uso === 'produto') {
      const e = u.produtos.find((p) => p.id === r.produtoId);
      const usarPrincipal = { rotulo: `Usar ${r.codigo}`, uso: 'produto', produtoId: r.produtoId, principal: true };
      if (e) {
        if (r.principal && !e.principal) {
          const atual = [...mapa].find(([id, x]) => id !== r.materialId && x.produtos.some((p) => p.id === r.produtoId && p.principal));
          conflito(r, `O texto pede ${r.codigo} como foto principal do ${nomeProd(r.produtoId)}, mas no seletor ela está nesse produto sem ser a principal: vale o seletor.`,
            `O texto pede ${r.codigo} como foto principal do ${nomeProd(r.produtoId)}, mas no seletor ${atual ? `está ${cod(atual[0])}` : 'ela não é a principal'}.`, usarPrincipal, atual ? `Manter ${cod(atual[0])}` : 'Manter como está');
        }
        continue;
      }
      let principal = r.principal;
      if (principal) {
        const outra = [...mapa].find(([id, x]) => id !== r.materialId && x.produtos.some((p) => p.id === r.produtoId && p.principal && p.por === 'manual'));
        if (outra) { conflito(r, `O texto pede ${r.codigo} como foto principal do ${nomeProd(r.produtoId)}, mas no seletor a principal é ${cod(outra[0])}: vale o seletor (${r.codigo} entra sem ser a principal).`, `O texto pede ${r.codigo} como foto principal do ${nomeProd(r.produtoId)}, mas no seletor está ${cod(outra[0])}.`, usarPrincipal, `Manter ${cod(outra[0])}`); principal = false; }
        else for (const [, x] of mapa) x.produtos.forEach((p) => { if (p.id === r.produtoId) p.principal = false; });
      }
      u.produtos.push({ id: r.produtoId, ordem: r.ordem, principal, por: 'texto' });
      aplicadas.push(`${r.codigo} → ${nomeProd(r.produtoId)}${principal ? ' (foto principal)' : ''}`); continue;
    }
    if (u[r.uso] === 'manual') continue; // já escolhido assim no seletor
    if (r.uso === 'banner' || r.uso === 'sobre') {
      const outraManual = [...mapa].find(([id, x]) => id !== r.materialId && x[r.uso] === 'manual');
      if (r.uso === 'banner' && outraManual) {
        const ja = [...mapa].filter(([, x]) => x.banner === 'manual').map(([id]) => cod(id)).join(', ');
        conflito(r, `O texto pede ${quer}, mas o banner já foi escolhido no seletor (${ja}): vale o seletor. Para somar ao carrossel, marque ${r.codigo} em "Usar em: Banner".`, `O texto pede ${quer}, mas o banner já foi escolhido no seletor (${ja}).`, { rotulo: `Somar ${r.codigo} ao banner`, uso: 'banner' }, `Manter só ${ja}`);
        continue;
      }
      const d = direta?.[r.uso];
      if (d && d.materialId !== r.materialId && !outraManual) {
        const qual = r.uso === 'banner' ? 'a imagem do banner' : 'a imagem da história';
        conflito(r, `O texto pede ${quer}, mas ${qual} já foi escolhida à mão nos ajustes ("${d.nome || 'imagem'}"): vale essa escolha. Para trocar, marque ${r.codigo} em "Usar em" ou mude nos ajustes rápidos.`, `O texto pede ${quer}, mas ${qual} foi escolhida à mão nos ajustes ("${d.nome || 'imagem'}").`, { rotulo: `Usar ${r.codigo}`, uso: r.uso }, `Manter "${d.nome || 'imagem'}"`);
        continue;
      }
    }
    // Várias fotos no mesmo lugar (carrossel do banner, Clientes reais, Galeria): a ordem do texto vira a ordem do site.
    if (ORDENAVEIS.includes(r.uso)) u.ordem[r.uso] = proximaPosicao(mapa, r.uso);
    u[r.uso] = 'texto';
    aplicadas.push(`${r.codigo} → ${nomeUso(r.uso)}`);
  }
  return { patches: mudados(materiais, mapa), conflitos: [...new Set(conflitos)], escolhas, aplicadas };
}
/** "Usar F27" de um conflito: a escolha vira do seletor (manual). Devolve [{ id, usos }] (mudarUso). */
export const resolverEscolha = (materiais = [], usar = {}) => mudarUso(materiais, usar.materialId, { uso: usar.uso, ligado: true, produtoId: usar.produtoId || null, ...(usar.uso === 'produto' && usar.principal ? { principal: true } : {}) });

// ---------- o que vai para o site ----------
const usaveis = (materiais) => materiais.filter((m) => temCodigo(m) && !naoUsa(m));
// foco = ponto principal marcado em Materiais (lib/medidas-site.js); largura/altura medidas no envio (podem faltar).
const comoImagem = (m) => ({ materialId: m.id, url: m.url, nome: nomeArquivo(m), codigo: m.codigo || '', foco: focoDe(m), ...(m.largura ? { largura: m.largura, altura: m.altura } : {}) });
// Sem posição (fotos marcadas antes do carrossel) = antes das posicionadas, por código.
const porOrdem = (uso) => (a, b) => (usosDe(a).ordem[uso] || 0) - (usosDe(b).ordem[uso] || 0) || porCodigo(a, b);

/**
 * Fotos de um lugar, na ordem do site: as do seletor; sem nenhuma do seletor, as do texto. Em banner e Sobre, a escolha
 * direta do modo (`direta`, ajustes rápidos) vence o texto: devolve [] e quem chama usa a direta como está.
 * Cada uma: { materialId, url, nome, codigo, foco, largura?, altura?, por }.
 */
export function imagensDoUso(materiais = [], uso, direta = null) {
  const lista = usaveis(materiais).filter((m) => usosDe(m)[uso]).sort(porOrdem(uso));
  const manuais = lista.filter((m) => usosDe(m)[uso] === 'manual');
  if (manuais.length) return manuais.map((m) => ({ ...comoImagem(m), por: 'manual' }));
  if (direta?.url) return [];
  return lista.map((m) => ({ ...comoImagem(m), por: 'texto' }));
}
/** A 1ª imagem de um lugar (banner ou história), com a mesma prioridade de imagensDoUso; null quando vale a direta ou não há. */
export const imagemDoLugar = (materiais = [], uso, direta = null) => imagensDoUso(materiais, uso, direta)[0] || null;
/** Todas as fotos de um uso (Sobre, Galeria...), na ordem escolhida (arrastar / ordem do texto) e depois por código. */
export const fotosDoUso = (materiais = [], uso) => usaveis(materiais).filter((m) => usosDe(m)[uso]).sort(porOrdem(uso)).map(comoImagem);

/**
 * Slides do carrossel do banner: [{ fotos: [imagem, ...], junto }]. "Juntar fotos" põe 2 ou 3 fotos lado a lado num
 * slide só (as que entram juntas não viram slide próprio). Sem foto em "Usar em", a escolha direta (`direta`: a imagem
 * única dos ajustes rápidos, como nos sites antigos) vira um slide.
 */
export function slidesDoBanner(materiais = [], direta = null) {
  const fotos = imagensDoUso(materiais, 'banner', direta);
  if (!fotos.length) {
    if (!direta?.url) return [];
    const m = materiais.find((x) => x.id === direta.materialId);
    return [{ fotos: [{ ...direta, codigo: direta.codigo || m?.codigo || '', foco: focoDe(m || direta) }], junto: false }];
  }
  const porId = new Map(fotos.map((f) => [f.materialId, f]));
  const usos = new Map(materiais.map((m) => [m.id, usosDe(m)]));
  const dentro = new Set();
  for (const f of fotos) if (!dentro.has(f.materialId)) for (const j of usos.get(f.materialId).juntar) if (porId.has(j) && j !== f.materialId) dentro.add(j);
  return fotos.filter((f) => !dentro.has(f.materialId)).map((f) => {
    const juntas = usos.get(f.materialId).juntar.filter((j) => porId.has(j) && j !== f.materialId).map((j) => porId.get(j));
    return { fotos: [f, ...juntas], junto: juntas.length > 0 };
  });
}
/**
 * Sugestão de "Juntar fotos": slide com UMA foto em pé no banner (largo) seria muito cortado. Junta com a(s) próxima(s)
 * foto(s) em pé que estão sozinhas. Devolve [{ ids: [2 ou 3 ids], codigos }] (só sugere; o operador escolhe).
 */
export function sugestoesJuntar(slides = []) {
  const sozinhaEmPe = (s) => s.fotos.length === 1 && ehVertical(s.fotos[0]);
  const out = [];
  for (let i = 0; i < slides.length; i++) {
    if (!sozinhaEmPe(slides[i])) continue;
    const grupo = [slides[i]];
    for (let k = i + 1; k < slides.length && grupo.length < 3 && sozinhaEmPe(slides[k]); k++) grupo.push(slides[k]);
    if (grupo.length > 1) { out.push({ ids: grupo.map((s) => s.fotos[0].materialId), codigos: grupo.map((s) => s.fotos[0].codigo) }); i += grupo.length - 1; }
  }
  return out;
}

const nomeDoCaminho = (s) => decodeURIComponent(String(s || '').split('?')[0].split('/').pop() || '').replace(/^\d{10,}_/, '') || 'foto';
/**
 * Fotos do produto na ordem do site: a "Foto principal" escolhida em Materiais (se houver), depois as fotos enviadas
 * na aba Produtos, depois as outras ligadas em Materiais (pela posição escolhida). Cada uma: { url, path, nome,
 * codigo?, materialId? }. Sem nenhuma ligação, devolve as fotos do produto como sempre.
 */
export function fotosDoProduto(produto, materiais = []) {
  const ligadas = usaveis(materiais).map((m) => ({ m, e: usosDe(m).produtos.find((p) => p.id === produto.id) })).filter((x) => x.e);
  // Depois da migração (planoMigracao), as fotos do produto vivem em Materiais: o campo antigo fica guardado, sem uso.
  const proprias = produto.fotosMigradas ? [] : (produto.fotos || []).filter((f) => f?.url).map((f) => ({ ...f, nome: f.nome || nomeDoCaminho(f.path || f.url) }));
  if (!ligadas.length) return proprias;
  const principal = ligadas.filter((x) => x.e.principal).sort((a, b) => (a.e.por === 'manual' ? -1 : 0) - (b.e.por === 'manual' ? -1 : 0) || porCodigo(a.m, b.m))[0];
  const resto = ligadas.filter((x) => x !== principal).sort((a, b) => (a.e.por === 'manual' ? 0 : 1) - (b.e.por === 'manual' ? 0 : 1) || (a.e.ordem || 999) - (b.e.ordem || 999) || porCodigo(a.m, b.m)); // seletor antes do texto
  const f = ({ m }) => ({ url: m.url, path: m.path, nome: nomeArquivo(m), codigo: m.codigo || '', materialId: m.id, foco: focoDe(m) });
  return [...(principal ? [f(principal)] : []), ...proprias, ...resto.map(f)];
}
export const produtosComFotos = (produtos = [], materiais = []) => produtos.map((p) => ({ ...p, fotos: fotosDoProduto(p, materiais) }));

/** Resumo do card em Materiais: ["Banner", "Thermora (principal)", ...] com a origem. */
export function resumoUsos(m, produtos = []) {
  const u = usosDe(m), r = [];
  for (const [k, rot] of USOS_FOTO) {
    if (k === 'produto') { u.produtos.forEach((p) => r.push({ texto: `${produtos.find((x) => x.id === p.id)?.nome || 'produto apagado'}${p.principal ? ' (principal)' : p.ordem ? ` (posição ${p.ordem})` : ''}`, por: p.por })); continue; }
    if (u[k]) r.push({ texto: rot, por: u[k] });
  }
  return r;
}

// ---------- pacote: o que vai em cada lugar e as pastas do .zip ----------
const extDe = (nome, url) => { const e = /\.([a-z0-9]{2,4})$/i.exec(String(nome || '').split('?')[0]) || /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(String(url || '').split('?')[0]); return e ? e[1].toLowerCase() : 'jpg'; };

/**
 * Lista de arquivos do .zip "Imagens por lugar": banner/ (banner-1-desktop.jpg, banner-1-mobile.jpg...),
 * produtos/<nome do produto>/ (na ordem do site), clientes-reais/ (a cópia borrada quando houver), sobre/ e galeria/,
 * cada um já recortado no tamanho do lugar e do aparelho (lib/medidas-site.js planoArquivos). `d` = dadosDoPacote.
 */
export const arquivosPorPasta = (d) => planoArquivos(d);

// ---------- migração: fotos do campo do produto -> Materiais (um lugar só) ----------
const TIPO_EXT = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
/**
 * O que falta migrar: para cada foto do campo antigo `produto.fotos`, um registro em Materiais apontando para o MESMO
 * arquivo (mesma url e path: nada é copiado nem movido), já ligado ao produto na mesma ordem, com a 1ª como foto
 * principal (era a capa). Idempotente: produto já migrado ou foto que já tem registro migrado não entra de novo.
 * Devolve { criar: [dados do material], marcar: [produtoId], jaMigrados }.
 */
export function planoMigracao(produtos = [], materiais = [], clienteId = '') {
  const criar = [], marcar = []; let jaMigrados = 0;
  for (const p of produtos) {
    if (p.fotosMigradas) { jaMigrados++; continue; }
    (p.fotos || []).filter((f) => f?.url).forEach((f, i) => {
      if (materiais.some((m) => m.migradoDe?.produtoId === p.id && m.url === f.url)) return;
      const nome = nomeDoCaminho(f.path || f.url);
      criar.push({
        clienteId, url: f.url, path: f.path || null, nome, nomeOriginal: nome, origem: 'envio', tipo: TIPO_EXT[extDe(nome, f.url)] || 'image/jpeg',
        migradoDe: { produtoId: p.id, indice: i },
        usos: normalizarUsos({ produtos: [{ id: p.id, ordem: i + 1, principal: i === 0, por: 'manual' }] }),
      });
    });
    marcar.push(p.id);
  }
  return { criar, marcar, jaMigrados };
}
/** Ordem para a próxima foto ligada a um produto (depois da última). */
export const proximaOrdem = (materiais = [], produtoId) => 1 + Math.max(0, ...materiais.flatMap((m) => usosDe(m).produtos.filter((p) => p.id === produtoId).map((p) => p.ordem)));
/** Tira de todas as fotos o vínculo com um produto apagado (o arquivo continua em Materiais). [{ id, usos }]. */
export const semProduto = (materiais = [], produtoId) => materiais.filter((m) => usosDe(m).produtos.some((p) => p.id === produtoId))
  .map((m) => { const u = usosDe(m); u.produtos = u.produtos.filter((p) => p.id !== produtoId); return { id: m.id, usos: u }; });
