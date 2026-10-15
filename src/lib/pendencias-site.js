// "Para o cliente preencher": quando falta um dado que só o cliente tem (fórmula, benefícios, modo de uso, preço, kits,
// descrição, foto do produto), o site NÃO fica parado nem com a seção vazia: sai com um lugar marcado, que o cliente
// preenche depois na plataforma. Puro (sem banco e sem tela).
//  - A lista é CALCULADA na hora a partir da fonte única (aba Produtos + o que o plano pediu): preencheu o produto, a marca
//    some sozinha e o texto real entra no lugar. Nada é guardado como cópia; só a escolha "Deixar para o cliente"
//    (site.preencher.cliente = [ids]) e o que já foi visto (site.preencher.vistas, para o "Antes × Depois" do que foi preenchido).
//  - A IA nunca preenche estas marcas e elas nunca contam como alegação de saúde, dado inventado ou "cara de IA".
//  - Na prévia: bloco tracejado amarelo claro, nunca com cara de conteúdo. Nos arquivos do pacote: "[PREENCHER: …]" no
//    campo exato, para o cliente achar e trocar na plataforma.
import { normalizarRecursos, textoSecaoProduto, SECOES_PRODUTO } from './recursos-loja.js';

const txt = (v) => String(v ?? '').trim();
const sem = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Texto da marca que vai para os arquivos do pacote. */
export const marcaPreencher = (oque) => `[PREENCHER: ${txt(oque)}]`;
export const RE_MARCA_PREENCHER = /\[\s*PREENCHER\s*:[^\]]*\]/i;
export const temMarcaPreencher = (t) => RE_MARCA_PREENCHER.test(String(t || ''));

const COMO_PREENCHER = {
  formula: (n) => `fórmula e ingredientes do ${n} (copiar do rótulo)`,
  beneficios: (n) => `benefícios do ${n} (só o que o rótulo e o fabricante permitem dizer)`,
  modo_uso: (n) => `modo de uso do ${n} (copiar do rótulo)`,
};
const CAMPO_DO_PEDIDO = { formula: 'formula', beneficios: 'beneficios', modo_uso: 'modoUso' };
const RE_KITS = /\bkits?\b|\bcombos?\b|\bleve \d|\bpacotes? (?:com|de) \d/i;

/** Itens aceitos do plano aplicado (o mesmo critério de lib/plano-site.js itensAceitos, sem importar o plano aqui). */
export function itensDoPlanoAplicado(site = {}) {
  const p = (site?.planos || []).find((x) => x.id === site?.planoAplicado);
  return p ? [...(p.itens || []), ...(p.sugestoes || [])].filter((x) => x.aceito && x.status === 'pronto') : [];
}
/** O plano (itens aceitos) pede kits/combos? */
const pedeKits = (itens = []) => itens.some((x) => RE_KITS.test(`${x.pedido || ''} ${x.como || ''}`));
const temKit = (p) => (p?.variacoes || []).some((v) => RE_KITS.test(`${v?.nome || ''} ${(v?.valores || []).join(' ')}`));

/**
 * Lugares marcados para o cliente preencher. ctx: { site, modo, produtos (com fotos de "Usar em"), itens (aceitos do
 * plano), descricoes ({ nome|id: descricao } do pacote) }. Cada um: { id, secao, produtoId, produto, campo, tipo:
 * 'texto'|'foto', oque, onde (onde preencher no app), noTema (onde fica na plataforma), cliente (o operador deixou para o
 * cliente) }.
 */
export function pendenciasDoSite({ site = {}, modo = 'pacote', produtos = [], itens = [], descricoes = {} } = {}) {
  const rec = normalizarRecursos(modo === 'custom' ? site?.config?.recursos : site?.pacote?.recursos);
  const deixadas = new Set(site?.preencher?.cliente || []);
  const kits = pedeKits(itens);
  const out = [];
  const add = (x) => out.push({ ...x, cliente: deixadas.has(x.id) });
  for (const p of produtos) {
    const n = txt(p.nome) || 'produto';
    const pid = p.id || sem(n);
    for (const s of rec.secoesProduto) {
      if (textoSecaoProduto(p, s)) continue;
      add({ id: `${pid}:${s}`, secao: 'produto', produtoId: p.id, produto: n, campo: CAMPO_DO_PEDIDO[s], tipo: 'texto', oque: COMO_PREENCHER[s](n), titulo: SECOES_PRODUTO[s], onde: `aba Produtos › ${n} › ${SECOES_PRODUTO[s]}`, noTema: `na página do produto ${n}, bloco "${SECOES_PRODUTO[s]}"` });
    }
    if (!(Number(p.preco) > 0)) add({ id: `${pid}:preco`, secao: 'produto', produtoId: p.id, produto: n, campo: 'preco', tipo: 'texto', oque: `preço do ${n}`, titulo: 'Preço', onde: `aba Produtos › ${n} › Preço`, noTema: `no cadastro do produto ${n} (preço)` });
    if (kits && !temKit(p)) add({ id: `${pid}:kits`, secao: 'produto', produtoId: p.id, produto: n, campo: 'variacoes', tipo: 'texto', oque: `preços e kits do ${n} (ex.: 1 pote, kit com 3; só os que existem de verdade)`, titulo: 'Kits e ofertas', onde: `aba Produtos › ${n} › Variações`, noTema: `no cadastro do produto ${n} (variações/kits)` });
    const desc = txt(descricoes[p.id] || descricoes[sem(n)] || p.descricao);
    if (!desc) add({ id: `${pid}:descricao`, secao: 'produto', produtoId: p.id, produto: n, campo: 'descricao', tipo: 'texto', oque: `descrição do ${n} (o que é, para quem, como usar)`, titulo: 'Descrição', onde: `aba Produtos › ${n} › Descrição`, noTema: `no cadastro do produto ${n} (descrição)` });
    if (!(p.fotos || []).length) add({ id: `${pid}:foto`, secao: 'produto', produtoId: p.id, produto: n, campo: 'fotos', tipo: 'foto', oque: `foto do ${n}`, sugestao: 'foto do produto de frente, fundo claro', titulo: 'Foto', onde: `aba Produtos › ${n} › Fotos (ou Materiais › "Usar em")`, noTema: `no cadastro do produto ${n} (imagens)` });
  }
  return out;
}

/** Pendências por produto (para a prévia e os arquivos): { [produtoId|nome]: { [campo]: pendência } }. */
export function pendenciasPorProduto(lista = []) {
  const m = {};
  for (const x of lista) { const k = x.produtoId || sem(x.produto); (m[k] = m[k] || {})[x.campo] = x; }
  return m;
}

/**
 * O que foi preenchido desde a última vez (a marca sumiu porque o dado entrou na fonte): [{ id, oque, depois }].
 * `vistas` = site.preencher.vistas ([{ id, oque }]); `produtos` = os de agora, para mostrar o texto real que entrou.
 */
export function preenchidasDesde(vistas = [], atuais = [], produtos = []) {
  const ids = new Set(atuais.map((x) => x.id));
  return vistas.filter((v) => !ids.has(v.id)).map((v) => {
    const p = produtos.find((q) => (q.id || sem(q.nome)) === String(v.id).split(':')[0]);
    const campo = String(v.id).split(':')[1];
    const depois = !p ? '' : campo === 'preco' ? (Number(p.preco) > 0 ? `R$ ${Number(p.preco).toFixed(2).replace('.', ',')}` : '')
      : campo === 'foto' ? `${(p.fotos || []).length} foto(s)` : campo === 'kits' ? (p.variacoes || []).map((x) => `${x.nome}: ${(x.valores || []).join(', ')}`).join(' · ')
        : txt(p[CAMPO_DO_PEDIDO[campo] || campo]);
    return { id: v.id, oque: v.oque, depois };
  });
}
