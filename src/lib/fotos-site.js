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

export const USOS_FOTO = [['banner', 'Banner'], ['produto', 'Produto'], ['clientes', 'Clientes reais'], ['sobre', 'Sobre a loja/história'], ['galeria', 'Galeria'], ['nao', 'Não usar no site']];
export const nomeUso = (k) => (USOS_FOTO.find(([u]) => u === k) || [, k])[1];
const SIMPLES = ['banner', 'clientes', 'sobre', 'galeria', 'nao'];
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
 * Banner é um só (marcar uma foto tira o banner das outras); "Foto principal" é uma só por produto; "Não usar" tira
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
        u[uso] = 'manual';
        if (uso === 'banner') for (const [outro, x] of mapa) if (outro !== id) delete x.banner;
      }
    }
  } else {
    if (uso === 'produto') u.produtos = u.produtos.filter((p) => p.id !== produtoId);
    else delete u[uso];
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
const mudados = (materiais, mapa) => materiais.filter((m) => mapa.has(m.id) && !igual(m.usos, mapa.get(m.id))).map((m) => ({ id: m.id, usos: normalizarUsos(mapa.get(m.id)) }));
/** Aplica os patches numa cópia da lista (para prévia e para atualizar a tela sem reler o banco). */
export const comUsos = (materiais = [], patches = []) => materiais.map((m) => { const p = patches.find((x) => x.id === m.id); return p ? { ...m, usos: p.usos } : m; });

// ---------- referências no texto ("F3 no banner, F5 e F6 no Thermora") ----------
const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20 };
const RE_COD = new RegExp(`\\b(?:f|efe)\\s*-?\\s*(\\d{1,3}|${Object.keys(NUMEROS).join('|')})\\b`, 'g');
const LIGA = /^[\s,&e]*$/; // só vírgula, "e" ou "&" entre dois códigos = mesmo grupo
const CONECTORES = /^(?:[\s,:-]|\b(?:no|na|nos|nas|em|de|do|da|dos|das|para|pra|pro|como|vai|vao|fica|ficam|usar|use|usa|coloca|colocar|coloque|e|o|a|os|as|foto|fotos)\b)+/;
const DESTINOS = [
  ['nao', /\b(nao usar|nao use|nao vai|nao vao|nao coloca|nao colocar|fora do site|nenhum lugar|ignorar|ignora)\b/],
  ['banner', /\b(banner|capa da loja|capa do site|topo|hero)\b/],
  ['clientes', /\b(depoimentos?|clientes? reais?|prova social|provas sociais|avaliac\w*|quem ja comprou)\b/],
  ['sobre', /\b(sobre|historia|quem somos|nossa marca|da marca)\b/],
  ['galeria', /\b(galeria)\b/],
];
const destinoTexto = (k, p) => (k === 'produto' ? `no ${p?.nome || 'produto'}` : { banner: 'no banner', clientes: 'em Clientes reais', sobre: 'em Sobre a loja', galeria: 'na Galeria', nao: 'fora do site (não usar)' }[k]);

function acharProduto(alvo, produtos) {
  const a = ` ${sem(alvo).replace(/[^a-z0-9]+/g, ' ')} `;
  const notas = produtos.map((p) => {
    const nome = sem(p.nome).replace(/[^a-z0-9]+/g, ' ').trim(); if (!nome) return 0;
    if (a.includes(` ${nome} `)) return 1000 + nome.length; // o nome inteiro está no texto
    return nome.split(' ').filter((w) => w.length >= 4 && a.includes(` ${w} `)).length; // palavras do nome
  });
  const max = Math.max(0, ...notas);
  const melhores = produtos.filter((_, i) => notas[i] === max);
  return max > 0 && melhores.length === 1 ? melhores[0] : null; // empate = ambíguo: não chuta
}
function classificar(alvo, produtos) {
  const t = sem(alvo);
  if (DESTINOS[0][1].test(t)) return { uso: 'nao' };
  const p = acharProduto(alvo, produtos);
  if (p) return { uso: 'produto', produto: p, principal: /\b(principal|capa)\b/.test(t) };
  for (const [k, re] of DESTINOS.slice(1)) if (re.test(t)) return { uso: k };
  return null;
}

/**
 * Lê as referências por código no texto. Devolve { refs: [{ codigo, materialId, uso, produtoId, produtoNome, principal,
 * ordem }], avisos: [texto] }. Código que não existe e destino que não deu para entender viram aviso (nada é inventado).
 */
export function lerReferencias(texto, { materiais = [], produtos = [] } = {}) {
  const t = sem(texto);
  const achados = [...t.matchAll(RE_COD)].map((x) => ({ n: /^\d+$/.test(x[1]) ? Number(x[1]) : NUMEROS[x[1]], ini: x.index, fim: x.index + x[0].length }));
  if (!achados.length) return { refs: [], avisos: [] };
  // Códigos seguidos (separados só por vírgula/"e") formam um grupo com o mesmo destino.
  const grupos = [];
  for (const a of achados) {
    const g = grupos[grupos.length - 1];
    if (g && LIGA.test(t.slice(g.fim, a.ini))) { g.ns.push(a.n); g.fim = a.fim; } else grupos.push({ ns: [a.n], ini: a.ini, fim: a.fim });
  }
  const codigos = new Map(materiais.filter(temCodigo).filter((m) => numeroCodigo(m.codigo)).map((m) => [numeroCodigo(m.codigo), m]));
  const existentes = [...codigos.keys()].sort((a, b) => a - b);
  const refs = [], avisos = [];
  const ordemPorProduto = new Map();
  grupos.forEach((g, i) => {
    const limite = grupos[i + 1]?.ini ?? t.length;
    const depois = t.slice(g.fim, limite).split(/[.;\n!?]/)[0].replace(/,\s*$/, '');
    const antesIni = Math.max(grupos[i - 1]?.fim ?? 0, t.lastIndexOf('\n', g.ini) + 1, t.lastIndexOf('.', g.ini) + 1, t.lastIndexOf(';', g.ini) + 1);
    const antes = t.slice(antesIni, g.ini);
    const alvo = depois.replace(CONECTORES, '').trim();
    const destino = alvo ? classificar(alvo, produtos) : antes.trim() ? classificar(antes, produtos) : null; // destino depois do código; sem nada depois, o que veio antes ("na galeria use F4")
    const nomes = g.ns.map((n) => `F${n}`).join(', ');
    if (!destino) { avisos.push(`Não entendi onde usar ${nomes}${alvo ? ` ("${alvo.slice(0, 40)}")` : ''}: nada foi feito. Escreva, por exemplo, "${g.ns.length > 1 ? nomes : `F${g.ns[0]}`} no banner", "no <nome do produto>", "nos depoimentos", "no sobre", "na galeria" ou "não usar".`); return; }
    g.ns.forEach((n, k) => {
      const m = codigos.get(n);
      if (!m) { avisos.push(`F${n} não existe nos Materiais do cliente${existentes.length ? ` (os códigos vão de F${existentes[0]} a F${existentes[existentes.length - 1]})` : ' (ainda não há fotos com código)'}: nada foi feito com ele.`); return; }
      const ref = { codigo: `F${n}`, materialId: m.id, uso: destino.uso, principal: false, ordem: 0 };
      if (destino.uso === 'produto') {
        const o = (ordemPorProduto.get(destino.produto.id) || 0) + 1; ordemPorProduto.set(destino.produto.id, o);
        Object.assign(ref, { produtoId: destino.produto.id, produtoNome: destino.produto.nome, principal: destino.principal && k === 0, ordem: o });
      }
      refs.push(ref);
    });
  });
  return { refs, avisos: [...new Set(avisos)] };
}

/**
 * Aplica as referências do texto como se fossem escolhidas no seletor, marcadas "texto". Antes, tira todas as marcas
 * "texto" anteriores (o texto atual é a fonte). O seletor sempre vence: conflito vira uma linha de explicação e a
 * referência não entra. `direta` = escolha direta do modo atual ({ banner, sobre }: { materialId, nome } | null).
 * Devolve { patches: [{ id, usos }], conflitos: [texto], aplicadas: [texto] }.
 */
export function aplicarReferencias(materiais = [], refs = [], { direta = {}, produtos = [] } = {}) {
  const mapa = new Map(materiais.map((m) => {
    const u = usosDe(m);
    for (const k of SIMPLES) if (u[k] === 'texto') delete u[k];
    u.produtos = u.produtos.filter((p) => p.por !== 'texto');
    return [m.id, u];
  }));
  const porId = new Map(materiais.map((m) => [m.id, m]));
  const cod = (id) => porId.get(id)?.codigo || 'a foto';
  const nomeProd = (pid) => produtos.find((p) => p.id === pid)?.nome || 'produto';
  const conflitos = [], aplicadas = [];
  for (const r of refs) {
    const u = mapa.get(r.materialId); if (!u) continue;
    const quer = `${r.codigo} ${destinoTexto(r.uso, { nome: r.produtoNome })}`;
    const chave = r.uso === 'produto' ? `produto:${r.produtoId}` : r.uso;
    if (u.bloqueados.includes(chave)) { conflitos.push(`O texto pede ${quer}, mas essa escolha foi tirada no seletor "Usar em": vale o seletor.`); continue; }
    if (r.uso !== 'nao' && u.nao === 'manual') { conflitos.push(`O texto pede ${quer}, mas no seletor ${r.codigo} está "Não usar no site": vale o seletor.`); continue; }
    if (r.uso === 'nao') {
      if (temUsoManual(u)) { conflitos.push(`O texto pede ${r.codigo} fora do site, mas no seletor ela tem uso marcado: vale o seletor.`); continue; }
      for (const k of SIMPLES) delete u[k]; u.produtos = []; u.nao = u.nao || 'texto'; aplicadas.push(`${r.codigo}: não usar no site`); continue;
    }
    if (u.nao === 'texto') delete u.nao;
    if (r.uso === 'produto') {
      const e = u.produtos.find((p) => p.id === r.produtoId);
      if (e) { if (r.principal && !e.principal) conflitos.push(`O texto pede ${r.codigo} como foto principal do ${nomeProd(r.produtoId)}, mas no seletor ela está nesse produto sem ser a principal: vale o seletor.`); continue; }
      let principal = r.principal;
      if (principal) {
        const outra = [...mapa].find(([id, x]) => id !== r.materialId && x.produtos.some((p) => p.id === r.produtoId && p.principal && p.por === 'manual'));
        if (outra) { conflitos.push(`O texto pede ${r.codigo} como foto principal do ${nomeProd(r.produtoId)}, mas no seletor a principal é ${cod(outra[0])}: vale o seletor (${r.codigo} entra sem ser a principal).`); principal = false; }
        else for (const [, x] of mapa) x.produtos.forEach((p) => { if (p.id === r.produtoId) p.principal = false; });
      }
      u.produtos.push({ id: r.produtoId, ordem: r.ordem, principal, por: 'texto' });
      aplicadas.push(`${r.codigo} → ${nomeProd(r.produtoId)}${principal ? ' (foto principal)' : ''}`); continue;
    }
    if (u[r.uso] === 'manual') continue; // já escolhido assim no seletor
    if (r.uso === 'banner' || r.uso === 'sobre') {
      const outraManual = [...mapa].find(([id, x]) => id !== r.materialId && x[r.uso] === 'manual');
      if (r.uso === 'banner' && outraManual) { conflitos.push(`O texto pede ${quer}, mas no seletor o banner é ${cod(outraManual[0])}: vale o seletor.`); continue; }
      const d = direta?.[r.uso];
      if (d && d.materialId !== r.materialId && !outraManual) { conflitos.push(`O texto pede ${quer}, mas ${r.uso === 'banner' ? 'a imagem do banner' : 'a imagem da história'} já foi escolhida à mão nos ajustes ("${d.nome || 'imagem'}"): vale essa escolha. Para trocar, marque ${r.codigo} em "Usar em" ou mude nos ajustes rápidos.`); continue; }
      if (r.uso === 'banner') {
        const outraTexto = [...mapa].find(([id, x]) => id !== r.materialId && x.banner === 'texto');
        if (outraTexto) { conflitos.push(`O texto pede mais de uma foto no banner: vale a primeira (${cod(outraTexto[0])}); ${r.codigo} ficou de fora.`); continue; }
      }
    }
    u[r.uso] = 'texto';
    aplicadas.push(`${r.codigo} → ${nomeUso(r.uso)}`);
  }
  return { patches: mudados(materiais, mapa), conflitos: [...new Set(conflitos)], aplicadas };
}

// ---------- o que vai para o site ----------
const usaveis = (materiais) => materiais.filter((m) => temCodigo(m) && !naoUsa(m));
const comoImagem = (m) => ({ materialId: m.id, url: m.url, nome: nomeArquivo(m), codigo: m.codigo || '' });

/**
 * Imagem de um lugar único (banner ou história): a do seletor; senão a escolha direta do modo (`direta`, fica como
 * está: devolve null); senão a do texto. Devolve { materialId, url, nome, codigo, por } ou null.
 */
export function imagemDoLugar(materiais = [], uso, direta = null) {
  const lista = usaveis(materiais).filter((m) => usosDe(m)[uso]).sort(porCodigo);
  const manual = lista.find((m) => usosDe(m)[uso] === 'manual');
  if (manual) return { ...comoImagem(manual), por: 'manual' };
  if (direta?.url) return null;
  const texto = lista[0];
  return texto ? { ...comoImagem(texto), por: 'texto' } : null;
}
/** Todas as fotos de um uso (Sobre, Galeria...), em ordem de código. */
export const fotosDoUso = (materiais = [], uso) => usaveis(materiais).filter((m) => usosDe(m)[uso]).sort(porCodigo).map(comoImagem);

const nomeDoCaminho = (s) => decodeURIComponent(String(s || '').split('?')[0].split('/').pop() || '').replace(/^\d{10,}_/, '') || 'foto';
/**
 * Fotos do produto na ordem do site: a "Foto principal" escolhida em Materiais (se houver), depois as fotos enviadas
 * na aba Produtos, depois as outras ligadas em Materiais (pela posição escolhida). Cada uma: { url, path, nome,
 * codigo?, materialId? }. Sem nenhuma ligação, devolve as fotos do produto como sempre.
 */
export function fotosDoProduto(produto, materiais = []) {
  const ligadas = usaveis(materiais).map((m) => ({ m, e: usosDe(m).produtos.find((p) => p.id === produto.id) })).filter((x) => x.e);
  const proprias = (produto.fotos || []).filter((f) => f?.url).map((f) => ({ ...f, nome: f.nome || nomeDoCaminho(f.path || f.url) }));
  if (!ligadas.length) return proprias;
  const principal = ligadas.filter((x) => x.e.principal).sort((a, b) => (a.e.por === 'manual' ? -1 : 0) - (b.e.por === 'manual' ? -1 : 0) || porCodigo(a.m, b.m))[0];
  const resto = ligadas.filter((x) => x !== principal).sort((a, b) => (a.e.por === 'manual' ? 0 : 1) - (b.e.por === 'manual' ? 0 : 1) || (a.e.ordem || 999) - (b.e.ordem || 999) || porCodigo(a.m, b.m)); // seletor antes do texto
  const f = ({ m }) => ({ url: m.url, path: m.path, nome: nomeArquivo(m), codigo: m.codigo || '', materialId: m.id });
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
const pastaSegura = (s) => sem(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
const extDe = (nome, url) => { const e = /\.([a-z0-9]{2,4})$/i.exec(String(nome || '').split('?')[0]) || /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(String(url || '').split('?')[0]); return e ? e[1].toLowerCase() : 'jpg'; };
const arquivoNoZip = (pasta, i, x) => {
  const base = pastaSegura(String(x.nome || 'foto').replace(/\.[a-z0-9]{2,4}$/i, ''));
  return `${pasta}/${String(i + 1).padStart(2, '0')}-${x.codigo ? `${x.codigo}-` : ''}${base}.${extDe(x.nome, x.url)}`;
};

/**
 * Lista de arquivos do .zip "Imagens por lugar": banner/, produtos/<nome do produto>/ (na ordem do site),
 * clientes-reais/ (a cópia borrada quando houver), sobre/ e galeria/. `d` = dadosDoPacote. Cada item:
 * { caminho, url, codigo, nome }.
 */
export function arquivosPorPasta(d) {
  const out = [];
  const add = (pasta, lista) => lista.filter((x) => x?.url).forEach((x, i) => out.push({ caminho: arquivoNoZip(pasta, i, x), url: x.url, codigo: x.codigo || '', nome: x.nome || '' }));
  if (d.visual?.banner?.url) add('banner', [d.visual.banner]);
  const usadas = new Set();
  for (const p of d.produtos || []) {
    let pasta = `produtos/${pastaSegura(p.nome)}`; while (usadas.has(pasta)) pasta += '-2'; usadas.add(pasta);
    add(pasta, p.arquivos || []);
  }
  add('clientes-reais', (d.provas || []).map((x) => ({ url: x.url, codigo: x.codigo, nome: x.nome || 'print' })));
  add('sobre', d.sobreImagens || []);
  add('galeria', d.galeria || []);
  return out;
}
