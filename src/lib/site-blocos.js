import { normalizarVisual, ORDEM_LOJA, nomeSecaoLoja, AJUSTES_FOTO, TITULOS_LOJA, ELEMENTOS_OCULTAVEIS_LOJA, tituloSecaoLoja } from './visual-site.js';
import { mudarUso, comUsos, imagemDoLugar, nomeUso, USOS_FOTO } from './fotos-site.js';
import { elementoValido, ehLegal, ehSecao, nomeElemento, limitar, ORDENAVEIS, MOTIVO_LEGAL, ESPACOS, TIPOS_EXTRA, secaoDoElemento } from './elementos-site.js';
import { CAMPOS_DADOS_LOJA, tipoDocumento } from './legal-loja.js';
import { chaveDepoimento } from './prova-social.js';
// "Ajustar este site": modelo de blocos do site personalizado + validador de operações + versões.
// A IA (ou os controles manuais) NUNCA escreve HTML: ela devolve operações ({ op, ... }) sobre este modelo. O app confere
// cada operação aqui, aplica numa CÓPIA do estado (rascunho) e só grava no site quando a pessoa aceita.
// Estado editável:  custom  -> { conteudo, config, layout }   (os mesmos campos do formulário "Conteúdo da loja")
//                   pacote  -> { pacote }                      (o mesmo documento do pacote Nuvemshop/Shopify)
// `layout` é o único campo novo: ordem/ocultos/títulos/variações/imagens dos blocos. Sem layout, o site sai como sempre saiu.
// Fora do alcance (nem IA nem controles manuais): Pixel/Google/Hotjar/Tawk.to, aviso de cookies, carrinho e checkout,
// selo de compra segura, políticas (trocas/envio/privacidade), cabeçalho e rodapé.

/** Blocos móveis do site personalizado, na ordem padrão (a mesma de antes desta função existir). */
export const BLOCOS = [
  ['hero', 'Banner principal'], ['provas', 'Clientes reais'], ['categorias', 'Categorias'], ['vendidos', 'Mais vendidos'], ['sale', 'Promoções (Sale)'],
  ['catalogo', 'Catálogo completo'], ['marca', 'Nossa história'], ['galeria', 'Galeria'], ['depoimentos', 'Depoimentos'], ['faq', 'Perguntas frequentes'], ['newsletter', 'Newsletter'],
];
export const ORDEM_PADRAO = BLOCOS.map(([k]) => k);
export const nomeBloco = (k) => (BLOCOS.find(([b]) => b === k) || [, k])[1];
/** Título padrão da seção no site (editável por bloco). */
export const TITULOS_PADRAO = { provas: 'Clientes reais', categorias: 'Categorias', vendidos: 'Mais vendidos', sale: 'Sale', catalogo: 'Catálogo completo', marca: 'Nossa história', galeria: 'Galeria', depoimentos: 'Quem já usa', faq: 'Perguntas frequentes' };
/** Variações permitidas por bloco. */
export const VARIACOES = {
  hero: { altura: ['curto', 'normal', 'alto'] },
  vendidos: { colunas: [2, 3, 4] }, sale: { colunas: [2, 3, 4] }, catalogo: { colunas: [2, 3, 4] },
};
const ROTULO_VAR = { altura: 'altura', colunas: 'colunas de produtos' };
/** Blocos que aceitam imagem dos Materiais do cliente. */
export const BLOCOS_COM_IMAGEM = ['hero', 'marca'];
/** Campos de texto editáveis e o limite de tamanho de cada um. */
export const CAMPOS_TEXTO = {
  heroTitulo: ['Banner principal: título', 80], heroSubtitulo: ['Banner principal: subtítulo', 180], heroCta: ['Banner principal: texto do botão', 30],
  storytelling: ['Nossa história: texto', 2500], newsletterTitulo: ['Newsletter: título', 80], newsletterTexto: ['Newsletter: texto', 300],
};
const OBRIGATORIOS = ['heroTitulo', 'heroCta'];
const MAX_FAQ = 15;

/** Paletas prontas (todas passam no teste de contraste). */
export const PALETAS_PRONTAS = [
  ['Índigo (padrão)', '#4f46e5', '#ffffff'], ['Vinho', '#9f1239', '#fff7f7'], ['Verde mata', '#166534', '#f7fbf5'],
  ['Azul petróleo', '#0f5c6e', '#f5fafb'], ['Grafite', '#27272a', '#fafafa'], ['Terracota', '#9a3412', '#fffaf5'],
];

// ---------- contraste (WCAG) ----------
const HEX = /^#[0-9a-f]{6}$/i;
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export const COR_TEXTO = '#1f2937'; // cor fixa do texto do site (sitegen.js)
export const CONTRASTE_MIN = 4.5;
/** null quando a paleta é legível; senão, o motivo em linguagem simples. */
export function problemaPaleta(corPrimaria, corFundo) {
  if (!HEX.test(corPrimaria || '') || !HEX.test(corFundo || '')) return 'as cores precisam estar no formato #RRGGBB (ex.: #4f46e5).';
  if (contraste(COR_TEXTO, corFundo) < CONTRASTE_MIN) return `o texto do site (cinza-escuro) ficaria difícil de ler sobre o fundo ${corFundo} (contraste ${contraste(COR_TEXTO, corFundo).toFixed(1)}, o mínimo é ${CONTRASTE_MIN}). Use um fundo mais claro.`;
  if (contraste('#ffffff', corPrimaria) < CONTRASTE_MIN) return `o texto branco dos botões ficaria difícil de ler sobre ${corPrimaria} (contraste ${contraste('#ffffff', corPrimaria).toFixed(1)}, o mínimo é ${CONTRASTE_MIN}). Use uma cor principal mais escura.`;
  return null;
}

// ---------- layout ----------
export function normalizarLayout(l = {}) {
  const ordem = [...new Set((Array.isArray(l.ordem) ? l.ordem : []).filter((k) => ORDEM_PADRAO.includes(k)))];
  // Bloco que ainda não estava na ordem salva (ex.: "Clientes reais", novo) entra logo depois do vizinho padrão.
  ORDEM_PADRAO.forEach((k, i) => { if (!ordem.includes(k)) { const antes = ORDEM_PADRAO.slice(0, i).reverse().find((x) => ordem.includes(x)); ordem.splice(antes ? ordem.indexOf(antes) + 1 : 0, 0, k); } });
  return {
    ordem,
    ajusteFotos: l.ajusteFotos === 'contain' ? 'contain' : 'cover',
    ocultos: [...new Set((l.ocultos || []).filter((k) => ORDEM_PADRAO.includes(k)))],
    titulos: Object.fromEntries(Object.entries(l.titulos || {}).filter(([k, v]) => TITULOS_PADRAO[k] && String(v || '').trim())),
    variacoes: Object.fromEntries(Object.entries(l.variacoes || {}).filter(([k]) => VARIACOES[k])),
    imagens: Object.fromEntries(Object.entries(l.imagens || {}).filter(([k, v]) => BLOCOS_COM_IMAGEM.includes(k) && v?.url)),
    depoimentosOcultos: [...new Set(l.depoimentosOcultos || [])],
    // "Apontar no site" (lib/elementos-site.js): o que o operador mudou em cada elemento, a ordem dentro da seção e os acréscimos.
    elementos: Object.fromEntries(Object.entries(l.elementos || {}).filter(([k, v]) => elementoValido(k) && v && typeof v === 'object').map(([k, v]) => [k, { ...(v.oculto ? { oculto: true } : {}), ...(v.espaco ? { espaco: limitar(v.espaco, -1, 2) } : {}), ...(v.tamanho ? { tamanho: limitar(v.tamanho, -2, 2) } : {}) }]).filter(([, v]) => Object.keys(v).length)),
    ordemElementos: Object.fromEntries(Object.entries(l.ordemElementos || {}).filter(([g, v]) => ORDENAVEIS[g] && Array.isArray(v)).map(([g, v]) => [g, [...new Set(v.filter((k) => ORDENAVEIS[g].includes(k)))]])),
    extras: (Array.isArray(l.extras) ? l.extras : []).filter((x) => x?.id && x.apos && TIPOS_EXTRA[x.tipo]).slice(0, 30),
  };
}
export const tituloBloco = (layout, k) => layout?.titulos?.[k] || TITULOS_PADRAO[k] || nomeBloco(k);

// ---------- estado editável ----------
const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
export function estadoDoSite(site, modo) {
  if (modo === 'pacote') return { pacote: clone(site?.pacote || {}) };
  return { conteudo: clone(site?.conteudo || {}), config: clone(site?.config || {}), layout: normalizarLayout(site?.layout) };
}

// ---------- proteções ----------
const PROTEGIDOS = [
  [/pixel|google ?ads|gtag|fbq|hotjar|tawk|rastre|analytics|script/i, 'os códigos de rastreamento (Pixel, Google Ads, Hotjar e Tawk.to) só mudam no cadastro do cliente (Editar > Rastreamento), nunca pelo ajuste do site'],
  [/cookie|consentimento|lgpd/i, 'o aviso de cookies e a regra de só carregar rastreadores depois do "Aceitar" protegem o cliente perante a LGPD e não podem ser alterados'],
  [/checkout|pagamento|carrinho|finalizar|selo|compra segura/i, 'o carrinho, o botão "Finalizar compra" (ponto de ligação do pagamento) e o selo de compra segura ficam fixos para o pagamento funcionar e continuar confiável'],
  [/pol[ií]tica|privacidade|troca|devolu|envio|entrega|frete/i, 'as políticas (trocas, envio e privacidade) são texto com valor legal: só mudam no formulário "Conteúdo da loja", revisadas por alguém responsável'],
  [/rodap|footer|cabe[çc]alho|header|menu|whatsapp/i, 'o cabeçalho, o rodapé e o botão de WhatsApp são fixos neste modelo de site'],
];
/** Motivo quando uma operação mira algo protegido (null = não é protegido). */
export function motivoProtegido(op) {
  // Nome de seção sugerida do pacote (ex.: "Frete e trocas") não entra: é só a ordem sugerida da home, não a política em si.
  const alvo = [op?.op === 'mover' || op?.op === 'ocultar' || op?.op === 'mostrar' ? (op?.secao ? '' : op?.bloco) : op?.bloco, op?.campo, op?.alvo].filter(Boolean).join(' ');
  if (!alvo) return null;
  for (const [re, motivo] of PROTEGIDOS) if (re.test(alvo)) return motivo;
  return null;
}

// ---------- validador + aplicação ----------
const txt = (v) => String(v ?? '').replace(/\s+\n/g, '\n').trim();
const posTexto = (ordem, k) => {
  const i = ordem.indexOf(k);
  return i <= 0 ? 'no topo da página' : `depois de "${nomeBloco(ordem[i - 1])}"`;
};
const corta = (s, n = 70) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t || '(vazio)'; };

/** Uma operação no site personalizado. Devolve { ok, motivo } ou { ok, mudanca } e altera `e` (a cópia). */
function aplicarCustom(e, op, ctx) {
  const L = e.layout;
  const bloco = op.bloco;
  const blocoValido = () => ORDEM_PADRAO.includes(bloco);
  switch (op.op) {
    case 'mover': {
      if (!blocoValido()) return { motivo: `não existe o bloco "${bloco}" neste site` };
      const ref = op.antesDe || op.depoisDe;
      if (!ORDEM_PADRAO.includes(ref) || ref === bloco) return { motivo: 'o bloco de referência para a nova posição não existe' };
      const antes = posTexto(L.ordem, bloco);
      const ordem = L.ordem.filter((k) => k !== bloco);
      const i = ordem.indexOf(ref) + (op.depoisDe ? 1 : 0);
      ordem.splice(i, 0, bloco);
      if (ordem.join() === L.ordem.join()) return { motivo: `"${nomeBloco(bloco)}" já está nessa posição` };
      L.ordem = ordem;
      return { mudanca: `Bloco ${nomeBloco(bloco)}: passa de ${antes} para ${posTexto(ordem, bloco)}` };
    }
    case 'ocultar': {
      if (!blocoValido()) return { motivo: `não existe o bloco "${bloco}" neste site` };
      if (L.ocultos.includes(bloco)) return { motivo: `"${nomeBloco(bloco)}" já está oculto` };
      const ocultos = [...L.ocultos, bloco];
      if (ocultos.includes('vendidos') && ocultos.includes('catalogo')) return { motivo: 'o site precisa mostrar os produtos em algum lugar para vender: "Mais vendidos" e "Catálogo completo" não podem ficar ocultos ao mesmo tempo' };
      L.ocultos = ocultos;
      return { mudanca: `Bloco ${nomeBloco(bloco)}: passa de visível para oculto (continua guardado, dá para mostrar de novo)` };
    }
    case 'mostrar': {
      if (!blocoValido()) return { motivo: `não existe o bloco "${bloco}" neste site` };
      if (!L.ocultos.includes(bloco)) return { motivo: `"${nomeBloco(bloco)}" já está visível` };
      L.ocultos = L.ocultos.filter((k) => k !== bloco);
      const nota = { sale: ' (só aparece quando houver produto com preço promocional)', faq: ' (só aparece quando houver pergunta com resposta)', depoimentos: ' (só aparece quando houver depoimento)', marca: ' (só aparece quando houver texto da história)', categorias: ' (só aparece quando os produtos tiverem categoria)' }[bloco] || '';
      return { mudanca: `Bloco ${nomeBloco(bloco)}: passa de oculto para visível${nota}` };
    }
    case 'texto': {
      const campo = String(op.campo || '');
      const valor = txt(op.valor);
      const mTitulo = /^titulo\.(\w+)$/.exec(campo);
      if (mTitulo) {
        const k = mTitulo[1];
        if (!TITULOS_PADRAO[k]) return { motivo: `o bloco "${nomeBloco(k)}" não tem título editável` };
        if (!valor || valor.length > 60) return { motivo: 'o título da seção precisa ter de 1 a 60 caracteres' };
        const antes = tituloBloco(L, k);
        if (antes === valor) return { motivo: 'o título já é esse' };
        L.titulos = { ...L.titulos, [k]: valor };
        return { mudanca: `Título da seção ${nomeBloco(k)}: "${corta(antes)}" → "${corta(valor)}"` };
      }
      const mPol = /^politicas\.(trocas|envio|privacidade)$/.exec(campo);
      if (mPol) {
        const NOMES = { trocas: 'Política de trocas e arrependimento', envio: 'Política de envio', privacidade: 'Política de privacidade' };
        if (valor.length < 20) return { motivo: `"${NOMES[mPol[1]]}" não pode ficar vazia nem curta demais: ${MOTIVO_LEGAL}` };
        if (valor.length > 3000) return { motivo: `"${NOMES[mPol[1]]}" pode ter no máximo 3.000 caracteres` };
        const antes = e.conteudo.politicas?.[mPol[1]] || '';
        if (antes === valor) return { motivo: 'a política já está com esse texto' };
        e.conteudo.politicas = { ...(e.conteudo.politicas || {}), [mPol[1]]: valor };
        return { mudanca: `${NOMES[mPol[1]]} (rodapé): "${corta(antes)}" → "${corta(valor)}"` };
      }
      const def = CAMPOS_TEXTO[campo];
      if (!def) return { motivo: `o texto "${campo}" não pode ser editado por aqui` };
      if (!valor && OBRIGATORIOS.includes(campo)) return { motivo: `"${def[0]}" não pode ficar vazio` };
      if (valor.length > def[1]) return { motivo: `"${def[0]}" pode ter no máximo ${def[1]} caracteres` };
      const antes = e.conteudo[campo] || '';
      if (antes === valor) return { motivo: `"${def[0]}" já está com esse texto` };
      e.conteudo[campo] = valor;
      return { mudanca: `${def[0]}: "${corta(antes)}" → "${corta(valor)}"` };
    }
    case 'faq': {
      const faq = [...(e.conteudo.faq || [])];
      const i = Number(op.indice);
      const p = txt(op.p), r = txt(op.r);
      if (op.acao === 'adicionar') {
        if (!p || !r) return { motivo: 'pergunta nova precisa de pergunta e resposta' };
        if (faq.length >= MAX_FAQ) return { motivo: `o limite é de ${MAX_FAQ} perguntas` };
        const depois = Number.isInteger(Number(op.depoisDe)) && faq[Number(op.depoisDe)] ? Number(op.depoisDe) + 1 : faq.length;
        faq.splice(depois, 0, { p, r }); e.conteudo.faq = faq;
        return { mudanca: `Perguntas frequentes: nova pergunta "${corta(p)}"` };
      }
      if (!Number.isInteger(i) || !faq[i]) return { motivo: 'essa pergunta frequente não existe' };
      if (op.acao === 'mover') {
        const j = i + (op.direcao === 'subir' ? -1 : 1);
        if (!faq[j]) return { motivo: `a pergunta já está ${op.direcao === 'subir' ? 'no topo' : 'no fim'}` };
        [faq[i], faq[j]] = [faq[j], faq[i]]; e.conteudo.faq = faq;
        return { mudanca: `Perguntas frequentes: "${corta(faq[j].p)}" ${op.direcao === 'subir' ? 'sobe' : 'desce'} uma posição` };
      }
      if (op.acao === 'remover') { const [x] = faq.splice(i, 1); e.conteudo.faq = faq; return { mudanca: `Perguntas frequentes: sai "${corta(x.p)}"` }; }
      if (op.acao === 'editar') {
        const novo = { p: p || faq[i].p, r: r || faq[i].r };
        if (novo.p === faq[i].p && novo.r === faq[i].r) return { motivo: 'a pergunta já está assim' };
        const antes = faq[i]; faq[i] = novo; e.conteudo.faq = faq;
        return { mudanca: `Pergunta frequente ${i + 1}: "${corta(antes.p)} / ${corta(antes.r, 40)}" → "${corta(novo.p)} / ${corta(novo.r, 40)}"` };
      }
      return { motivo: 'ação de pergunta frequente desconhecida' };
    }
    case 'depoimento': {
      const deps = e.conteudo.depoimentos || [];
      const d = deps[Number(op.indice)];
      if (!d) return { motivo: 'esse depoimento não existe' };
      if (op.acao === 'editar') return { motivo: 'depoimento é a fala de um cliente real: não reescrevemos. Dá para escolher quais aparecem (ocultar/mostrar) ou trocar o texto no formulário "Conteúdo da loja"' };
      const chave = chaveDepoimento(d);
      if (op.acao === 'ocultar') {
        if (L.depoimentosOcultos.includes(chave)) return { motivo: 'esse depoimento já está oculto' };
        L.depoimentosOcultos = [...L.depoimentosOcultos, chave];
        return { mudanca: `Depoimento de ${d.nome || 'cliente'} ("${corta(d.texto, 40)}"): passa de visível para oculto` };
      }
      if (op.acao === 'mostrar') {
        if (!L.depoimentosOcultos.includes(chave)) return { motivo: 'esse depoimento já aparece' };
        L.depoimentosOcultos = L.depoimentosOcultos.filter((x) => x !== chave);
        return { mudanca: `Depoimento de ${d.nome || 'cliente'} ("${corta(d.texto, 40)}"): passa de oculto para visível` };
      }
      return { motivo: 'ação de depoimento desconhecida' };
    }
    case 'paleta': {
      const prim = String(op.corPrimaria || e.config.corPrimaria || '#4f46e5').toLowerCase();
      const fundo = String(op.corFundo || e.config.corFundo || '#ffffff').toLowerCase();
      const prob = problemaPaleta(prim, fundo);
      if (prob) return { motivo: `essa combinação não foi aplicada porque ${prob}` };
      const antes = `${e.config.corPrimaria || '#4f46e5'} / ${e.config.corFundo || '#ffffff'}`;
      if (antes.toLowerCase() === `${prim} / ${fundo}`) return { motivo: 'o site já usa essas cores' };
      e.config.corPrimaria = prim; e.config.corFundo = fundo;
      return { mudanca: `Cores (principal / fundo): ${antes} → ${prim} / ${fundo}` };
    }
    case 'variacao': {
      const opcoes = VARIACOES[bloco]?.[op.opcao];
      if (!opcoes) return { motivo: `o bloco "${nomeBloco(bloco)}" não tem a variação "${op.opcao}"${VARIACOES[bloco] ? ` (só: ${Object.keys(VARIACOES[bloco]).map((k) => ROTULO_VAR[k]).join(', ')})` : ''}` };
      const valor = typeof opcoes[0] === 'number' ? Number(op.valor) : String(op.valor || '');
      if (!opcoes.includes(valor)) return { motivo: `para ${ROTULO_VAR[op.opcao]}, os valores possíveis são: ${opcoes.join(', ')}` };
      const antes = L.variacoes?.[bloco]?.[op.opcao] ?? (op.opcao === 'altura' ? 'normal' : 'automático');
      if (antes === valor) return { motivo: 'o bloco já está assim' };
      L.variacoes = { ...L.variacoes, [bloco]: { ...(L.variacoes?.[bloco] || {}), [op.opcao]: valor } };
      return { mudanca: `Bloco ${nomeBloco(bloco)} (${ROTULO_VAR[op.opcao]}): ${antes} → ${valor}` };
    }
    case 'fotos': {
      const ajuste = op.ajuste === 'contain' ? 'contain' : op.ajuste === 'cover' ? 'cover' : null;
      if (!ajuste) return { motivo: 'as fotos dos produtos podem ficar "inteiras" (contain) ou "preenchendo o espaço" (cover)' };
      if ((L.ajusteFotos || 'cover') === ajuste) return { motivo: `as fotos dos produtos já estão "${AJUSTES_FOTO[ajuste]}"` };
      const antes = AJUSTES_FOTO[L.ajusteFotos || 'cover']; L.ajusteFotos = ajuste;
      return { mudanca: `Fotos dos produtos: ${antes} → ${AJUSTES_FOTO[ajuste]}` };
    }
    case 'imagem': {
      if (!BLOCOS_COM_IMAGEM.includes(bloco)) return { motivo: `só ${BLOCOS_COM_IMAGEM.map(nomeBloco).join(' e ')} aceitam imagem` };
      if (op.materialId == null || op.materialId === '') {
        if (!L.imagens[bloco]) return { motivo: 'esse bloco já está sem imagem' };
        const { [bloco]: _x, ...resto } = L.imagens; L.imagens = resto;
        return { mudanca: `Bloco ${nomeBloco(bloco)}: sai a imagem (volta ao fundo de cor)` };
      }
      const m = (ctx.materiais || []).find((x) => x.id === op.materialId);
      if (!m?.url) return { motivo: 'a imagem precisa ser uma das que já estão nos Materiais do cliente (Estúdio)' };
      const antes = L.imagens[bloco]?.nome || 'sem imagem';
      L.imagens = { ...L.imagens, [bloco]: { materialId: m.id, url: m.url, nome: m.nome || 'imagem' } };
      return { mudanca: `Bloco ${nomeBloco(bloco)}: imagem "${antes}" → "${m.nome || 'imagem dos Materiais'}"` };
    }
    case 'elemento': return aplicarElemento(e, op);
    case 'extra': return aplicarExtra(e, op, ctx);
    case 'destaque': {
      const r = aplicarDestaque(e.conteudo.destaques, op);
      if (!r.lista) return r;
      e.conteudo.destaques = r.lista;
      return { mudanca: `${r.mudanca}${op.acao === 'criar' && (op.antesDe || op.depoisDe) ? ' (neste site, os destaques ficam logo depois do banner)' : ''}` };
    }
    default: return { motivo: `a operação "${op.op}" não existe neste site` };
  }
}

/** Um elemento ("Apontar no site"): tirar/voltar, espaço (P/M/G/GG), tamanho (-2..+2) e ordem dentro da seção. */
function aplicarElemento(e, op) {
  const L = e.layout, id = String(op.id || '');
  if (!elementoValido(id)) return { motivo: `não existe o elemento "${id}" neste site` };
  const nome = nomeElemento(id, { layout: L, estado: e });
  const atual = { ...(L.elementos?.[id] || {}) };
  const gravar = (x) => { const limpo = Object.fromEntries(Object.entries(x).filter(([, v]) => v)); const el = { ...(L.elementos || {}) }; if (Object.keys(limpo).length) el[id] = limpo; else delete el[id]; L.elementos = el; };
  if (op.acao === 'ocultar' || op.acao === 'mostrar') {
    if (ehSecao(id)) return { motivo: 'para tirar a seção inteira, use ocultar o bloco' };
    if (op.acao === 'ocultar' && ehLegal(id)) return { motivo: `${nome} ${MOTIVO_LEGAL}` };
    if (Boolean(atual.oculto) === (op.acao === 'ocultar')) return { motivo: `${nome} já está ${op.acao === 'ocultar' ? 'fora do site' : 'no site'}` };
    gravar({ ...atual, oculto: op.acao === 'ocultar' });
    return { mudanca: `${nome}: ${op.acao === 'ocultar' ? 'sai do site' : 'volta para o site'}` };
  }
  if (op.acao === 'espaco' || op.acao === 'tamanho') {
    const [min, max] = op.acao === 'espaco' ? [-1, 2] : [-2, 2];
    const antes = atual[op.acao] || 0, depois = limitar(antes + (Number(op.passo) || 0), min, max);
    if (depois === antes) return { motivo: `${nome}: já está no ${op.acao === 'espaco' ? 'espaço' : 'tamanho'} ${depois < 0 ? 'mínimo' : 'máximo'}` };
    gravar({ ...atual, [op.acao]: depois });
    if (op.acao === 'espaco') return { mudanca: `${nome}: espaço ${ehSecao(id) ? 'entre seções' : 'em volta'} ${ESPACOS[antes]} → ${ESPACOS[depois]}` };
    return { mudanca: `${nome}: tamanho ${antes > 0 ? '+' : ''}${antes} → ${depois > 0 ? '+' : ''}${depois}` };
  }
  if (op.acao === 'mover') {
    const [g, k] = id.split('.');
    const base = ORDENAVEIS[g];
    if (!base?.includes(k)) return { motivo: `${nome} não muda de ordem dentro da seção` };
    const lista = [...(L.ordemElementos?.[g]?.length ? L.ordemElementos[g] : base)];
    for (const x of base) if (!lista.includes(x)) lista.push(x);
    const i = lista.indexOf(k), passo = op.direcao === 'subir' ? -1 : 1;
    // Vizinho que aparece na página (op.visiveis, vindo da prévia): pula o que não está lá.
    const conta = (x) => !Array.isArray(op.visiveis) || !op.visiveis.length || op.visiveis.includes(x);
    let j = i + passo; while (j >= 0 && j < lista.length && !conta(lista[j])) j += passo;
    if (j < 0 || j >= lista.length) return { motivo: `${nome} já está ${op.direcao === 'subir' ? 'em cima' : 'embaixo'} na seção` };
    [lista[i], lista[j]] = [lista[j], lista[i]];
    L.ordemElementos = { ...(L.ordemElementos || {}), [g]: lista };
    return { mudanca: `${nome}: ${op.direcao === 'subir' ? 'sobe' : 'desce'} uma posição na seção` };
  }
  return { motivo: 'ação de elemento desconhecida' };
}

/** "Adicionar abaixo": texto, selo, foto (pelo código, lida dos Materiais) ou botão, logo depois de um elemento. */
function aplicarExtra(e, op, ctx) {
  const L = e.layout, extras = [...(L.extras || [])];
  if (op.acao === 'adicionar') {
    if (!elementoValido(op.apos) || String(op.apos).startsWith('extra.')) return { motivo: 'o lugar do acréscimo não existe neste site' };
    if (ehLegal(op.apos) && !ehSecao(op.apos)) return { motivo: 'no rodapé legal não entra acréscimo' };
    if (!TIPOS_EXTRA[op.tipo] || op.tipo === 'pergunta') return { motivo: 'dá para acrescentar texto, selo, foto ou botão' };
    if (extras.length >= 30) return { motivo: 'o limite é de 30 acréscimos no site' };
    const texto = txt(op.texto);
    if (op.tipo === 'foto') {
      const cod = String(op.codigo || '').toUpperCase();
      if (!(ctx.materiais || []).some((m) => String(m.codigo || '').toUpperCase() === cod)) return { motivo: `a foto "${cod || '?'}" não existe nos Materiais do cliente` };
    } else if (!texto || texto.length > (op.tipo === 'texto' ? 600 : 60)) return { motivo: `o ${TIPOS_EXTRA[op.tipo]} precisa ter de 1 a ${op.tipo === 'texto' ? 600 : 60} caracteres` };
    const n = Math.max(0, ...extras.map((x) => Number(String(x.id).split('.')[1]) || 0)) + 1;
    const id = `extra.${n}`; op.id = id; // a escolha de versão (texto da IA) acha o acréscimo por este id
    extras.push({ id, apos: op.apos, tipo: op.tipo, ...(op.tipo === 'foto' ? { codigo: String(op.codigo).toUpperCase() } : { texto }) });
    L.extras = extras;
    return { mudanca: `${nomeElemento(op.apos, { layout: L, estado: e })}: entra ${TIPOS_EXTRA[op.tipo]} abaixo${op.tipo === 'foto' ? ` (${String(op.codigo).toUpperCase()})` : ` ("${corta(texto)}")`}` };
  }
  const i = extras.findIndex((x) => x.id === op.id);
  if (i < 0) return { motivo: 'esse acréscimo não existe mais' };
  if (op.acao === 'remover') { const [x] = extras.splice(i, 1); L.extras = extras; return { mudanca: `${TIPOS_EXTRA[x.tipo]} acrescentado sai${x.texto ? ` ("${corta(x.texto)}")` : ''}` }; }
  if (op.acao === 'editar') {
    const texto = txt(op.texto);
    if (!texto || extras[i].tipo === 'foto') return { motivo: 'escreva o texto novo' };
    if (extras[i].texto === texto) return { motivo: 'o acréscimo já está com esse texto' };
    const antes = extras[i].texto; extras[i] = { ...extras[i], texto }; L.extras = extras;
    return { mudanca: `${TIPOS_EXTRA[extras[i].tipo]} acrescentado: "${corta(antes)}" → "${corta(texto)}"` };
  }
  return { motivo: 'ação de acréscimo desconhecida' };
}

// ---------- "Destaques": os textos do operador (ex.: "5 motivos"), nos dois modos ----------
const MAX_LINHAS_DESTAQUE = 10, MAX_LETRAS_DESTAQUE = 220;
/** Seção nova com texto, edição do título, das linhas e saída de linha/seção. Devolve { lista, mudanca } | { motivo }. */
function aplicarDestaque(lista0 = [], op = {}) {
  const lista = clone(lista0 || []).filter((g) => g && Array.isArray(g.linhas));
  const linhaOk = (t) => t && t.length <= MAX_LETRAS_DESTAQUE;
  const i = Number.isInteger(Number(op.grupo)) ? Number(op.grupo) : 0;
  if (op.acao === 'criar') {
    const titulo = txt(op.titulo), linhas = (Array.isArray(op.linhas) ? op.linhas : []).map(txt).filter(Boolean);
    if (!titulo || titulo.length > 80) return { motivo: 'a seção nova precisa de um título de 1 a 80 caracteres' };
    if (!linhas.length || linhas.length > MAX_LINHAS_DESTAQUE || !linhas.every(linhaOk)) return { motivo: `a seção nova precisa de 1 a ${MAX_LINHAS_DESTAQUE} textos, cada um com até ${MAX_LETRAS_DESTAQUE} caracteres` };
    lista.push({ itemId: `ajuste-${Date.now().toString(36)}`, titulo, linhas: linhas.map((t) => ({ texto: t, versao: 'original' })) });
    return { lista, mudanca: `Seção nova "${corta(titulo)}" com ${linhas.length} texto(s): ${linhas.map((t) => `"${corta(t, 40)}"`).join(', ')}` };
  }
  const g = lista[i];
  if (!g) return { motivo: lista.length ? 'esse grupo de destaques não existe' : 'ainda não há seção de destaques: peça para criar (título + textos)' };
  if (op.acao === 'titulo') {
    const t = txt(op.texto ?? op.titulo); if (!t || t.length > 80) return { motivo: 'o título precisa ter de 1 a 80 caracteres' };
    if (txt(g.titulo) === t) return { motivo: 'o título já é esse' };
    const antes = g.titulo; g.titulo = t; return { lista, mudanca: `Destaques, título: "${corta(antes)}" → "${corta(t)}"` };
  }
  if (op.acao === 'linha' || op.acao === 'editarLinha') {
    const k = Number(op.indice), l = g.linhas[k], t = txt(op.texto);
    if (!Number.isInteger(k) || !l) return { motivo: 'esse texto dos destaques não existe' };
    if (!linhaOk(t)) return { motivo: `o texto precisa ter de 1 a ${MAX_LETRAS_DESTAQUE} caracteres` };
    if (txt(l.texto) === t) return { motivo: 'o texto já é esse' };
    const antes = l.texto; g.linhas[k] = { ...l, texto: t, versao: 'original', alegacao: [], confirmado: null };
    return { lista, mudanca: `Destaques, texto ${k + 1}: "${corta(antes)}" → "${corta(t)}"` };
  }
  if (op.acao === 'adicionarLinha') {
    const t = txt(op.texto); if (!linhaOk(t)) return { motivo: `o texto precisa ter de 1 a ${MAX_LETRAS_DESTAQUE} caracteres` };
    if (g.linhas.length >= MAX_LINHAS_DESTAQUE) return { motivo: `o limite é de ${MAX_LINHAS_DESTAQUE} textos por seção` };
    const dep = Number.isInteger(Number(op.depoisDe)) && g.linhas[Number(op.depoisDe)] ? Number(op.depoisDe) + 1 : g.linhas.length;
    g.linhas.splice(dep, 0, { texto: t, versao: 'original' });
    return { lista, mudanca: `Destaques: entra o texto "${corta(t)}"` };
  }
  if (op.acao === 'removerLinha') {
    const k = Number(op.indice); if (!Number.isInteger(k) || !g.linhas[k]) return { motivo: 'esse texto dos destaques não existe' };
    if (g.linhas.length <= 1) return { motivo: 'é o último texto da seção: para tirar tudo, tire a seção' };
    const [x] = g.linhas.splice(k, 1); return { lista, mudanca: `Destaques: sai o texto "${corta(x.texto)}"` };
  }
  if (op.acao === 'moverLinha') {
    const k = Number(op.indice), j = k + (op.direcao === 'subir' ? -1 : 1);
    if (!g.linhas[k] || !g.linhas[j]) return { motivo: 'o texto já está na ponta' };
    [g.linhas[k], g.linhas[j]] = [g.linhas[j], g.linhas[k]]; return { lista, mudanca: `Destaques: "${corta(g.linhas[j].texto)}" ${op.direcao === 'subir' ? 'sobe' : 'desce'} uma posição` };
  }
  if (op.acao === 'remover') { lista.splice(i, 1); return { lista, mudanca: `Sai a seção de destaques "${corta(g.titulo)}"` }; }
  return { motivo: 'ação de destaques desconhecida' };
}

// Nome da seção escrito pela IA ou pelo briefing ("Depoimentos", "Quem já comprou", "5 motivos") -> seção da prévia.
const SINONIMOS_LOJA = [
  ['banner', /^(banner|topo|hero|capa)/], ['destaques', /destaque|motivo|beneficio|vantage|por que/], ['provas', /clientes reais|prints?\b|provas?\b/],
  ['depoimentos', /depoiment|quem ja (comprou|usa)|avalia|prova social|ja comprou/], ['produtos', /produto|vitrine|vendido|catalogo/],
  ['confianca', /compra segura|confian|selo|garantia/], ['sobre', /sobre|historia|quem somos|marca/], ['galeria', /galeria|fotos/], ['faq', /faq|pergunta|duvida/],
];
const semAc = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const secaoLojaDoNome = (nome) => { const n = semAc(nome); if (ORDEM_LOJA.includes(n)) return n; return (SINONIMOS_LOJA.find(([, re]) => re.test(n)) || [])[0] || null; };
export const MOTIVO_CONFIANCA = '"Compra segura" é uma faixa fixa (exigência legal): mostra o pagamento pela plataforma e um resumo das suas políticas de envio e trocas. O texto dela muda nas políticas ("Conteúdo da loja" > Mais opções). Para uma lista sua (ex.: "5 motivos"), use a seção Destaques';

/**
 * Uma operação no pacote: conteúdo (textos, cores sugeridas, ordem sugerida das seções para o tema, textos do CSV) e as
 * escolhas da prévia (imagem do banner, fotos inteiras/preenchendo, ordem e visibilidade das seções do molde), que o
 * painel "O que colocar na plataforma" traduz para o tema.
 */
function aplicarPacote(e, op, ctx = {}) {
  const P = e.pacote;
  P.briefingTema = P.briefingTema || {}; P.textosPagina = P.textosPagina || {};
  const secoes = P.briefingTema.secoesHome || [];
  const V = normalizarVisual(P.visual);
  const salvarV = () => { P.visual = V; };
  // Uma fonte só para as seções: a da prévia (visual). Nome do briefing ("Depoimentos", "5 motivos") vira a seção da prévia.
  const blocoLoja = ORDEM_LOJA.includes(op.bloco) ? op.bloco : ['mover', 'ocultar', 'mostrar'].includes(op.op) ? secaoLojaDoNome(op.secao || op.bloco) : null;
  if (['mover', 'ocultar', 'mostrar'].includes(op.op) && !blocoLoja) return { motivo: `não existe a seção "${op.secao || op.bloco || '?'}" na loja; as seções são: ${ORDEM_LOJA.map(nomeSecaoLoja).join(', ')}` };
  if (op.op === 'mover' && (op.antesDe || op.depoisDe) && !ORDEM_LOJA.includes(op.antesDe || op.depoisDe)) {
    const ref = secaoLojaDoNome(op.antesDe || op.depoisDe);
    if (ref) op = { ...op, ...(op.antesDe ? { antesDe: ref } : { depoisDe: ref }) };
  }
  switch (op.op) {
    case 'destaque': {
      const r = aplicarDestaque(P.destaques, op);
      if (!r.lista) return r;
      P.destaques = r.lista;
      // Seção nova com "antesDe"/"depoisDe": a seção Destaques vai para esse lugar (e aparece, se estava oculta).
      if (op.acao === 'criar') {
        const ref = secaoLojaDoNome(op.antesDe || op.depoisDe || '');
        if (ref && ref !== 'destaques') { const nova = V.ordem.filter((x) => x !== 'destaques'); nova.splice(nova.indexOf(ref) + (op.depoisDe ? 1 : 0), 0, 'destaques'); V.ordem = nova; }
        V.ocultas = V.ocultas.filter((x) => x !== 'destaques'); salvarV();
        return { mudanca: `${r.mudanca}${ref ? `, ${op.depoisDe ? 'depois de' : 'antes de'} "${nomeSecaoLoja(ref)}"` : ''}` };
      }
      return { mudanca: r.mudanca };
    }
    case 'elemento': {
      const id = String(op.id || '');
      if (!ELEMENTOS_OCULTAVEIS_LOJA.includes(id)) return { motivo: ehSecao(id) ? 'para tirar a seção inteira, use ocultar a seção' : `no pacote, "${id}" muda no editor do tema (anote em "Ajustar no tema", passo 6)` };
      if (op.acao !== 'ocultar' && op.acao !== 'mostrar') return { motivo: 'no pacote, espaço, tamanho e ordem dentro da seção são do tema: anote em "Ajustar no tema" (passo 6)' };
      const oculto = Boolean(V.elementos?.[id]?.oculto);
      if (oculto === (op.acao === 'ocultar')) return { motivo: `${nomeElemento(id)} já está ${oculto ? 'fora da loja' : 'na loja'}` };
      const el = { ...(V.elementos || {}) }; if (op.acao === 'ocultar') el[id] = { oculto: true }; else delete el[id];
      V.elementos = el; salvarV();
      return { mudanca: `${nomeElemento(id)}: ${op.acao === 'ocultar' ? 'sai da loja (a seção continua)' : 'volta para a loja'}` };
    }
    case 'variacao': return { motivo: 'altura do banner e número de colunas dependem do tema escolhido na Nuvemshop/Shopify (o mais próximo aqui é mostrar as fotos inteiras ou preenchendo o espaço, e reordenar ou ocultar seções); no editor do tema dá para mudar' };
    case 'imagem': {
      if (op.bloco && op.bloco !== 'banner' && op.bloco !== 'hero') return { motivo: 'na prévia do pacote só o banner recebe imagem dos Materiais (as fotos dos produtos vêm da aba Produtos)' };
      if (op.materialId == null || op.materialId === '') { if (!V.banner) return { motivo: 'o banner já está sem imagem' }; V.banner = null; salvarV(); return { mudanca: 'Banner: sai a imagem (volta ao fundo de cor)' }; }
      const m = (ctx.materiais || []).find((x) => x.id === op.materialId);
      if (!m?.url) return { motivo: 'a imagem do banner precisa ser uma das que estão em Materiais do cliente (envie lá primeiro)' };
      const antes = V.banner?.nome || 'sem imagem'; V.banner = { materialId: m.id, url: m.url, nome: m.nomeOriginal || m.nome || 'imagem' }; salvarV();
      return { mudanca: `Banner: imagem "${antes}" → "${V.banner.nome}"` };
    }
    case 'fotos': {
      const ajuste = op.ajuste === 'contain' ? 'contain' : op.ajuste === 'cover' ? 'cover' : null;
      if (!ajuste) return { motivo: 'as fotos dos produtos podem ficar "inteiras" (contain) ou "preenchendo o espaço" (cover)' };
      if (V.ajusteFotos === ajuste) return { motivo: `as fotos dos produtos já estão "${AJUSTES_FOTO[ajuste]}"` };
      const antes = AJUSTES_FOTO[V.ajusteFotos]; V.ajusteFotos = ajuste; salvarV();
      return { mudanca: `Fotos dos produtos: ${antes} → ${AJUSTES_FOTO[ajuste]}` };
    }
    case 'mover': {
      const ref = op.antesDe || op.depoisDe;
      if (!ORDEM_LOJA.includes(ref) || ref === blocoLoja) return { motivo: `a seção de referência precisa ser uma destas: ${ORDEM_LOJA.map(nomeSecaoLoja).join(', ')}` };
      const antes = V.ordem.indexOf(blocoLoja) + 1;
      const nova = V.ordem.filter((x) => x !== blocoLoja); nova.splice(nova.indexOf(ref) + (op.depoisDe ? 1 : 0), 0, blocoLoja);
      if (nova.join('|') === V.ordem.join('|')) return { motivo: 'a seção já está nessa posição' };
      V.ordem = nova; salvarV();
      return { mudanca: `Seção "${nomeSecaoLoja(blocoLoja)}": passa da posição ${antes} para a ${nova.indexOf(blocoLoja) + 1}` };
    }
    case 'ocultar': {
      if (V.ocultas.includes(blocoLoja)) return { motivo: 'essa seção já está oculta' };
      if (blocoLoja === 'produtos') return { motivo: 'a loja precisa mostrar os produtos em algum lugar para vender' };
      if (blocoLoja === 'confianca') return { motivo: MOTIVO_CONFIANCA };
      V.ocultas = [...V.ocultas, blocoLoja]; salvarV();
      return { mudanca: `Seção "${nomeSecaoLoja(blocoLoja)}": sai da loja (prévia e arquivos do pacote; continua guardada)` };
    }
    case 'mostrar': {
      if (!V.ocultas.includes(blocoLoja)) return { motivo: 'essa seção já aparece' };
      V.ocultas = V.ocultas.filter((x) => x !== blocoLoja); salvarV();
      return { mudanca: `Seção "${nomeSecaoLoja(blocoLoja)}": passa de oculta para visível` };
    }
    case 'texto': {
      const campo = String(op.campo || ''), valor = txt(op.valor);
      const mb = /^banner\.(\d+)\.(titulo|subtitulo|cta)$/.exec(campo);
      if (mb) {
        const b = (P.banners || [])[Number(mb[1])];
        if (!b) return { motivo: 'esse banner não existe no pacote' };
        const lim = { titulo: 80, subtitulo: 180, cta: 30 }[mb[2]];
        if (/\*\*/.test(valor)) return { motivo: 'o banner do tema não aceita negrito em parte do texto: escreva sem ** (o título já sai em destaque)' };
        if (!valor || valor.length > lim) return { motivo: `o texto do banner precisa ter de 1 a ${lim} caracteres` };
        if (b[mb[2]] === valor) return { motivo: 'o banner já está com esse texto' };
        const antes = b[mb[2]]; P.banners = P.banners.map((x, i) => (i === Number(mb[1]) ? { ...x, [mb[2]]: valor } : x));
        return { mudanca: `Banner ${Number(mb[1]) + 1} (${b.uso || 'banner'}), ${{ titulo: 'título', subtitulo: 'subtítulo', cta: 'botão' }[mb[2]]}: "${corta(antes)}" → "${corta(valor)}"` };
      }
      // Título de cada seção da loja (o que aparece em cima dela).
      const mt = /^titulo\.(\w+)$/.exec(campo);
      if (mt) {
        if (mt[1] === 'destaques') return aplicarPacote(e, { op: 'destaque', acao: 'titulo', grupo: 0, texto: valor }, ctx);
        if (!TITULOS_LOJA[mt[1]]) return { motivo: mt[1] === 'confianca' ? MOTIVO_CONFIANCA : `a seção "${nomeSecaoLoja(mt[1])}" não tem título` };
        if (!valor || valor.length > 80) return { motivo: 'o título da seção precisa ter de 1 a 80 caracteres' };
        const antes = tituloSecaoLoja(V, mt[1]);
        if (antes === valor) return { motivo: 'o título já é esse' };
        V.titulos = { ...(V.titulos || {}), [mt[1]]: valor }; salvarV();
        return { mudanca: `Título da seção ${nomeSecaoLoja(mt[1])}: "${corta(antes)}" → "${corta(valor)}"` };
      }
      // Textos dos Destaques pelo nome do campo (destaques.0.titulo, destaques.0.linha.2).
      const md = /^destaques\.(\d+)\.(titulo|linha\.(\d+))$/.exec(campo);
      if (md) return aplicarPacote(e, md[2] === 'titulo' ? { op: 'destaque', acao: 'titulo', grupo: Number(md[1]), texto: valor } : { op: 'destaque', acao: 'linha', grupo: Number(md[1]), indice: Number(md[3]), texto: valor }, ctx);
      if (/^confianca\b/.test(campo)) return { motivo: MOTIVO_CONFIANCA };
      const CAMPOS = { sobre: ['Página Sobre', 3000], 'tema.estilo': ['Briefing do tema: estilo', 800], 'tema.tipografia': ['Briefing do tema: tipografia', 300], 'tema.observacoes': ['Briefing do tema: observações', 1000] };
      const def = CAMPOS[campo];
      if (!def) return { motivo: `o texto "${campo}" não pode ser editado no pacote` };
      if (!valor || valor.length > def[1]) return { motivo: `"${def[0]}" precisa ter de 1 a ${def[1]} caracteres` };
      const onde = campo === 'sobre' ? P.textosPagina : P.briefingTema; const chave = campo === 'sobre' ? 'sobre' : campo.split('.')[1];
      if (onde[chave] === valor) return { motivo: `"${def[0]}" já está com esse texto` };
      const antes = onde[chave]; onde[chave] = valor;
      return { mudanca: `${def[0]}: "${corta(antes)}" → "${corta(valor)}"` };
    }
    case 'faq': {
      const faq = [...(P.textosPagina.faq || [])], i = Number(op.indice), p = txt(op.p), r = txt(op.r);
      if (op.acao === 'adicionar') { if (!p || !r) return { motivo: 'pergunta nova precisa de pergunta e resposta' }; if (faq.length >= MAX_FAQ) return { motivo: `o limite é de ${MAX_FAQ} perguntas` }; const dep = Number.isInteger(Number(op.depoisDe)) && faq[Number(op.depoisDe)] ? Number(op.depoisDe) + 1 : faq.length; faq.splice(dep, 0, { p, r }); P.textosPagina.faq = faq; return { mudanca: `FAQ do pacote: nova pergunta "${corta(p)}"` }; }
      if (!Number.isInteger(i) || !faq[i]) return { motivo: 'essa pergunta frequente não existe' };
      if (op.acao === 'mover') { const j = i + (op.direcao === 'subir' ? -1 : 1); if (!faq[j]) return { motivo: 'a pergunta já está na ponta' }; [faq[i], faq[j]] = [faq[j], faq[i]]; P.textosPagina.faq = faq; return { mudanca: `FAQ do pacote: "${corta(faq[j].p)}" ${op.direcao === 'subir' ? 'sobe' : 'desce'} uma posição` }; }
      if (op.acao === 'remover') { const [x] = faq.splice(i, 1); P.textosPagina.faq = faq; return { mudanca: `FAQ do pacote: sai "${corta(x.p)}"` }; }
      if (op.acao === 'editar') { const novo = { p: p || faq[i].p, r: r || faq[i].r }; if (novo.p === faq[i].p && novo.r === faq[i].r) return { motivo: 'a pergunta já está assim' }; const antes = faq[i]; faq[i] = novo; P.textosPagina.faq = faq; return { mudanca: `FAQ do pacote, pergunta ${i + 1}: "${corta(antes.p)}" → "${corta(novo.p)}"` }; }
      return { motivo: 'ação de pergunta frequente desconhecida' };
    }
    case 'paleta': {
      const cores = (Array.isArray(op.cores) ? op.cores : [op.corPrimaria, op.corFundo]).filter(Boolean).map((c) => String(c).toLowerCase());
      if (cores.length < 2 || cores.length > 6 || !cores.every((c) => HEX.test(c))) return { motivo: 'a paleta sugerida precisa ter de 2 a 6 cores no formato #RRGGBB' };
      const antes = (P.briefingTema.paletaSugerida || []).join(', ') || '(nenhuma)';
      if (antes.toLowerCase() === cores.join(', ')) return { motivo: 'a paleta já é essa' };
      P.briefingTema.paletaSugerida = cores;
      return { mudanca: `Paleta sugerida do tema: ${antes} → ${cores.join(', ')}` };
    }
    case 'produto': {
      const lista = P.descricoesProdutos || [];
      const i = lista.findIndex((d) => String(d.nome).toLowerCase() === String(op.nome || '').toLowerCase());
      const campo = { descricao: ['descrição', 3000], seoTitulo: ['título para SEO', 70], seoDescricao: ['descrição para SEO', 160] }[op.campo];
      if (i < 0) return { motivo: 'esse produto não está nas descrições do pacote (gere o pacote de novo depois de cadastrá-lo em Produtos)' };
      if (!campo) return { motivo: 'no produto, só dá para ajustar descrição, título para SEO e descrição para SEO. Nome, preço e variações mudam na aba Produtos' };
      const valor = txt(op.valor);
      if (!valor || valor.length > campo[1]) return { motivo: `a ${campo[0]} precisa ter de 1 a ${campo[1]} caracteres` };
      if (lista[i][op.campo] === valor) return { motivo: 'o produto já está com esse texto' };
      const antes = lista[i][op.campo]; P.descricoesProdutos = lista.map((d, k) => (k === i ? { ...d, [op.campo]: valor } : d));
      return { mudanca: `Produto "${lista[i].nome}" (${campo[0]}, vai no CSV): "${corta(antes)}" → "${corta(valor)}"` };
    }
    default: return { motivo: `a operação "${op.op}" não existe no pacote` };
  }
}

/**
 * Onde vai uma foto ("Usar em", lib/fotos-site.js), igual nos dois modos. Só quando a pessoa pede de forma explícita
 * (a IA é instruída assim); vira escolha manual, como no seletor. Fica em `e.usosFotos` ({ materialId: usos }): os
 * vínculos moram nos Materiais, não no site, e só são gravados lá ao aceitar a mudança.
 */
function aplicarFoto(e, op, ctx) {
  e.usosFotos = e.usosFotos || {};
  const mats = comUsos(ctx.materiais || [], Object.entries(e.usosFotos).map(([id, usos]) => ({ id, usos })));
  const cod = String(op.codigo || '').trim().toUpperCase();
  const m = mats.find((x) => String(x.codigo || '').toUpperCase() === cod);
  if (!m) return { motivo: `a foto "${cod || '?'}" não existe nos Materiais do cliente (use o código mostrado na miniatura, ex.: F3)` };
  if (!USOS_FOTO.some(([k]) => k === op.uso)) return { motivo: `a foto pode ir em: ${USOS_FOTO.map(([, t]) => t).join(', ')}` };
  let produto = null;
  if (op.uso === 'produto') {
    const n = String(op.produto || '').trim().toLowerCase();
    const lista = (ctx.produtos || []).filter((p) => String(p.nome || '').toLowerCase() === n);
    produto = lista.length === 1 ? lista[0] : (ctx.produtos || []).filter((p) => n && String(p.nome || '').toLowerCase().includes(n)).length === 1 ? (ctx.produtos || []).find((p) => String(p.nome || '').toLowerCase().includes(n)) : null;
    if (!produto) return { motivo: `o produto "${op.produto || ''}" não está cadastrado na aba Produtos` };
  }
  const ligado = op.acao !== 'tirar';
  const patches = mudarUso(mats, m.id, { uso: op.uso, ligado, produtoId: produto?.id, ordem: op.ordem, principal: op.principal === undefined ? undefined : Boolean(op.principal) });
  if (!patches.length) return { motivo: `${m.codigo} já está assim` };
  for (const p of patches) e.usosFotos[p.id] = p.usos;
  const onde = op.uso === 'produto' ? `no produto ${produto.nome}${op.principal ? ' (foto principal)' : ''}` : `em "${nomeUso(op.uso)}"`;
  return { mudanca: `Foto ${m.codigo}: ${ligado ? 'passa a ir' : 'sai de'} ${onde} (escolha sua, igual ao seletor "Usar em")` };
}

/**
 * Valida e aplica uma lista de operações sobre uma CÓPIA do estado. Nunca lança erro por operação ruim:
 * { estado, mudancas: [texto], aplicadas: [op], descartadas: [{ op, motivo }] }.
 */
/**
 * Dado da loja (rodapé: razão social, CNPJ, endereço, e-mail, telefone). Mora no cliente (cliente.dadosLoja): no
 * rascunho fica à parte (e.dadosLoja) e só é gravado no cliente ao aplicar. Nunca vazio (é exigência legal).
 */
function aplicarDadoLoja(e, op, atuais = {}) {
  const campo = String(op.campo || ''), def = CAMPOS_DADOS_LOJA.find(([k]) => k === campo), valor = txt(op.valor);
  if (!def) return { motivo: `o dado "${campo}" não existe nos dados da loja` };
  if (!valor) return { motivo: `${def[1]} não pode ficar vazio: ${MOTIVO_LEGAL}` };
  if (campo === 'cnpj' && !tipoDocumento(valor)) return { motivo: 'os dígitos desse CNPJ/CPF não conferem: confira com o cliente' };
  if (campo === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)) return { motivo: 'esse e-mail não parece válido' };
  const antes = { ...atuais, ...(e.dadosLoja || {}) }[campo] || '';
  if (antes === valor) return { motivo: `${def[1]} já está assim` };
  e.dadosLoja = { ...(e.dadosLoja || {}), [campo]: valor };
  return { mudanca: `Rodapé › ${def[1]}: "${corta(antes)}" → "${corta(valor)}"` };
}

export function aplicarOperacoes(estado, operacoes, { modo = 'custom', materiais = [], produtos = [], dadosLoja = {} } = {}) {
  const e = clone(estado);
  if (modo === 'custom') { e.conteudo = e.conteudo || {}; e.config = e.config || {}; e.layout = normalizarLayout(e.layout); } else e.pacote = e.pacote || {};
  const mudancas = [], aplicadas = [], descartadas = [];
  for (const op of (Array.isArray(operacoes) ? operacoes : []).slice(0, 30)) {
    if (!op || typeof op !== 'object' || !op.op) { descartadas.push({ op, motivo: 'operação sem formato válido' }); continue; }
    // Política com texto (nunca vazia) e dado da loja são EDITÁVEIS; o que não pode é tirar do site.
    const editavelLegal = (op.op === 'texto' && /^politicas\.(trocas|envio|privacidade)$/.test(String(op.campo || '')) && modo === 'custom') || op.op === 'dadoLoja';
    const protegido = editavelLegal ? null : motivoProtegido(op);
    if (protegido) { descartadas.push({ op, motivo: protegido }); continue; }
    // Imagem do banner/história escolhida em "Usar em" (seletor) vence: só muda pedindo a foto pelo código.
    const usoImg = op.op === 'imagem' ? ({ hero: 'banner', banner: 'banner', marca: 'sobre' }[op.bloco || (modo === 'custom' ? '' : 'banner')]) : null;
    const matsAgora = comUsos(materiais, Object.entries(e.usosFotos || {}).map(([id, usos]) => ({ id, usos })));
    const fixa = usoImg && imagemDoLugar(matsAgora, usoImg);
    // A IA não troca sozinha a escolha do seletor. O pedido explícito do operador ("foto do Thermora no banner", "F5 no
    // banner") é resolvido pelo app antes (lib/fotos-site.js fotosPorNome) e chega como operação "foto" (escolha manual).
    if (fixa?.por === 'manual') { descartadas.push({ op, motivo: `a imagem ${usoImg === 'banner' ? 'do banner' : 'da história'} foi escolhida em Materiais do cliente (${fixa.codigo}, "Usar em") e a IA não troca escolha sua sozinha; para trocar, diga qual foto quer lá: pelo produto ("foto do Thermora no banner") ou pelo código ("F5 no banner")` }); continue; }
    const r = op.op === 'foto' ? aplicarFoto(e, op, { materiais, produtos }) : op.op === 'dadoLoja' ? aplicarDadoLoja(e, op, dadosLoja) : modo === 'custom' ? aplicarCustom(e, op, { materiais }) : aplicarPacote(e, op, { materiais });
    if (r.mudanca) { mudancas.push(r.mudanca); aplicadas.push(op); } else descartadas.push({ op, motivo: r.motivo || 'operação inválida' });
  }
  return { estado: e, mudancas, aplicadas, descartadas };
}

// ---------- versões ----------
export const MAX_VERSOES = 20;
/**
 * Acrescenta uma versão aceita. Na primeira vez, guarda antes a "Versão inicial" (o estado de antes dos ajustes),
 * para dar para voltar ao começo. Mantém só as últimas MAX_VERSOES (as mais antigas saem). O campo extra vai junto na versão
 * (ex.: planoId do plano que a produziu, para "Ver plano desta versão").
 * Devolve { versoesAjuste, proximaVersao }.
 */
export function registrarVersao(site, { modo, estadoAntes, estadoDepois, resumo, origem = 'manual', extra = {} }) {
  let lista = [...(site?.versoesAjuste || [])];
  let n = site?.proximaVersao || (lista.length ? Math.max(...lista.map((v) => v.n)) + 1 : 1);
  const agora = new Date().toISOString();
  if (!lista.some((v) => v.modo === modo) && estadoAntes) { lista.push({ n, em: agora, modo, resumo: 'Versão inicial (antes dos ajustes)', origem: 'inicial', estado: estadoAntes }); n++; }
  lista.push({ n, em: agora, modo, resumo: String(resumo || 'Ajuste').slice(0, 200), origem, estado: estadoDepois, ...extra }); n++;
  if (lista.length > MAX_VERSOES) lista = lista.slice(lista.length - MAX_VERSOES);
  return { versoesAjuste: lista, proximaVersao: n };
}
/** Versões de um modo, da mais nova para a mais antiga. A mais nova é a atual. */
export const versoesDoModo = (site, modo) => (site?.versoesAjuste || []).filter((v) => v.modo === modo).sort((a, b) => b.n - a.n);

/** Resumo de uma frase para a versão, a partir das mudanças. */
export const resumoMudancas = (mudancas) => (mudancas.length === 1 ? mudancas[0] : `${mudancas.length} mudanças: ${mudancas.map((m) => m.split(':')[0]).join('; ')}`).slice(0, 200);
