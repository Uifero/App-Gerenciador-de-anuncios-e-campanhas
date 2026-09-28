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
  ['hero', 'Banner principal'], ['categorias', 'Categorias'], ['vendidos', 'Mais vendidos'], ['sale', 'Promoções (Sale)'],
  ['catalogo', 'Catálogo completo'], ['marca', 'Nossa história'], ['depoimentos', 'Depoimentos'], ['faq', 'Perguntas frequentes'], ['newsletter', 'Newsletter'],
];
export const ORDEM_PADRAO = BLOCOS.map(([k]) => k);
export const nomeBloco = (k) => (BLOCOS.find(([b]) => b === k) || [, k])[1];
/** Título padrão da seção no site (editável por bloco). */
export const TITULOS_PADRAO = { categorias: 'Categorias', vendidos: 'Mais vendidos', sale: 'Sale', catalogo: 'Catálogo completo', marca: 'Nossa história', depoimentos: 'Quem já usa', faq: 'Perguntas frequentes' };
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
  const ordem = [...new Set([...(Array.isArray(l.ordem) ? l.ordem : []).filter((k) => ORDEM_PADRAO.includes(k)), ...ORDEM_PADRAO])];
  return {
    ordem,
    ocultos: [...new Set((l.ocultos || []).filter((k) => ORDEM_PADRAO.includes(k)))],
    titulos: Object.fromEntries(Object.entries(l.titulos || {}).filter(([k, v]) => TITULOS_PADRAO[k] && String(v || '').trim())),
    variacoes: Object.fromEntries(Object.entries(l.variacoes || {}).filter(([k]) => VARIACOES[k])),
    imagens: Object.fromEntries(Object.entries(l.imagens || {}).filter(([k, v]) => BLOCOS_COM_IMAGEM.includes(k) && v?.url)),
    depoimentosOcultos: [...new Set(l.depoimentosOcultos || [])],
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
        faq.push({ p, r }); e.conteudo.faq = faq;
        return { mudanca: `Perguntas frequentes: nova pergunta "${corta(p)}"` };
      }
      if (!Number.isInteger(i) || !faq[i]) return { motivo: 'essa pergunta frequente não existe' };
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
      const chave = d.texto;
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
    default: return { motivo: `a operação "${op.op}" não existe neste site` };
  }
}

/** Uma operação no pacote (só CONTEÚDO: textos, cores sugeridas, ordem sugerida das seções, textos do CSV). */
function aplicarPacote(e, op) {
  const P = e.pacote;
  P.briefingTema = P.briefingTema || {}; P.textosPagina = P.textosPagina || {};
  const secoes = P.briefingTema.secoesHome || [];
  const layoutMsg = 'no pacote, o visual (tamanho, colunas, fontes, imagens do layout) é do tema da plataforma: mude no editor de temas da Nuvemshop/Shopify';
  switch (op.op) {
    case 'variacao': case 'imagem': return { motivo: layoutMsg };
    case 'mover': {
      const s = op.secao || op.bloco, ref = op.antesDe || op.depoisDe;
      if (!secoes.includes(s) || !secoes.includes(ref) || s === ref) return { motivo: 'essa seção não está na lista de seções sugeridas' };
      const antes = secoes.indexOf(s) + 1;
      const nova = secoes.filter((x) => x !== s); nova.splice(nova.indexOf(ref) + (op.depoisDe ? 1 : 0), 0, s);
      if (nova.join('|') === secoes.join('|')) return { motivo: 'a seção já está nessa posição' };
      P.briefingTema.secoesHome = nova;
      return { mudanca: `Seção sugerida "${s}": passa da posição ${antes} para a ${nova.indexOf(s) + 1}` };
    }
    case 'ocultar': {
      const s = op.secao || op.bloco;
      if (!secoes.includes(s)) return { motivo: 'essa seção não está na lista de seções sugeridas' };
      if (secoes.length <= 1) return { motivo: 'a home precisa ter ao menos uma seção sugerida' };
      P.briefingTema.secoesHome = secoes.filter((x) => x !== s); P.secoesOcultas = [...new Set([...(P.secoesOcultas || []), s])];
      return { mudanca: `Seção sugerida "${s}": sai da ordem sugerida da home` };
    }
    case 'mostrar': {
      const s = op.secao || op.bloco;
      if (!(P.secoesOcultas || []).includes(s)) return { motivo: 'essa seção não foi retirada antes' };
      P.briefingTema.secoesHome = [...secoes, s]; P.secoesOcultas = P.secoesOcultas.filter((x) => x !== s);
      return { mudanca: `Seção sugerida "${s}": volta para a ordem sugerida (no fim)` };
    }
    case 'texto': {
      const campo = String(op.campo || ''), valor = txt(op.valor);
      const mb = /^banner\.(\d+)\.(titulo|subtitulo|cta)$/.exec(campo);
      if (mb) {
        const b = (P.banners || [])[Number(mb[1])];
        if (!b) return { motivo: 'esse banner não existe no pacote' };
        const lim = { titulo: 80, subtitulo: 180, cta: 30 }[mb[2]];
        if (!valor || valor.length > lim) return { motivo: `o texto do banner precisa ter de 1 a ${lim} caracteres` };
        if (b[mb[2]] === valor) return { motivo: 'o banner já está com esse texto' };
        const antes = b[mb[2]]; P.banners = P.banners.map((x, i) => (i === Number(mb[1]) ? { ...x, [mb[2]]: valor } : x));
        return { mudanca: `Banner ${Number(mb[1]) + 1} (${b.uso || 'banner'}), ${{ titulo: 'título', subtitulo: 'subtítulo', cta: 'botão' }[mb[2]]}: "${corta(antes)}" → "${corta(valor)}"` };
      }
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
      if (op.acao === 'adicionar') { if (!p || !r) return { motivo: 'pergunta nova precisa de pergunta e resposta' }; if (faq.length >= MAX_FAQ) return { motivo: `o limite é de ${MAX_FAQ} perguntas` }; faq.push({ p, r }); P.textosPagina.faq = faq; return { mudanca: `FAQ do pacote: nova pergunta "${corta(p)}"` }; }
      if (!Number.isInteger(i) || !faq[i]) return { motivo: 'essa pergunta frequente não existe' };
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
 * Valida e aplica uma lista de operações sobre uma CÓPIA do estado. Nunca lança erro por operação ruim:
 * { estado, mudancas: [texto], aplicadas: [op], descartadas: [{ op, motivo }] }.
 */
export function aplicarOperacoes(estado, operacoes, { modo = 'custom', materiais = [] } = {}) {
  const e = clone(estado);
  if (modo === 'custom') { e.conteudo = e.conteudo || {}; e.config = e.config || {}; e.layout = normalizarLayout(e.layout); } else e.pacote = e.pacote || {};
  const mudancas = [], aplicadas = [], descartadas = [];
  for (const op of (Array.isArray(operacoes) ? operacoes : []).slice(0, 30)) {
    if (!op || typeof op !== 'object' || !op.op) { descartadas.push({ op, motivo: 'operação sem formato válido' }); continue; }
    const protegido = motivoProtegido(op);
    if (protegido) { descartadas.push({ op, motivo: protegido }); continue; }
    const r = modo === 'custom' ? aplicarCustom(e, op, { materiais }) : aplicarPacote(e, op);
    if (r.mudanca) { mudancas.push(r.mudanca); aplicadas.push(op); } else descartadas.push({ op, motivo: r.motivo || 'operação inválida' });
  }
  return { estado: e, mudancas, aplicadas, descartadas };
}

// ---------- versões ----------
export const MAX_VERSOES = 20;
/**
 * Acrescenta uma versão aceita. Na primeira vez, guarda antes a "Versão inicial" (o estado de antes dos ajustes),
 * para dar para voltar ao começo. Mantém só as últimas MAX_VERSOES (as mais antigas saem).
 * Devolve { versoesAjuste, proximaVersao }.
 */
export function registrarVersao(site, { modo, estadoAntes, estadoDepois, resumo, origem = 'manual' }) {
  let lista = [...(site?.versoesAjuste || [])];
  let n = site?.proximaVersao || (lista.length ? Math.max(...lista.map((v) => v.n)) + 1 : 1);
  const agora = new Date().toISOString();
  if (!lista.some((v) => v.modo === modo) && estadoAntes) { lista.push({ n, em: agora, modo, resumo: 'Versão inicial (antes dos ajustes)', origem: 'inicial', estado: estadoAntes }); n++; }
  lista.push({ n, em: agora, modo, resumo: String(resumo || 'Ajuste').slice(0, 200), origem, estado: estadoDepois }); n++;
  if (lista.length > MAX_VERSOES) lista = lista.slice(lista.length - MAX_VERSOES);
  return { versoesAjuste: lista, proximaVersao: n };
}
/** Versões de um modo, da mais nova para a mais antiga. A mais nova é a atual. */
export const versoesDoModo = (site, modo) => (site?.versoesAjuste || []).filter((v) => v.modo === modo).sort((a, b) => b.n - a.n);

/** Resumo de uma frase para a versão, a partir das mudanças. */
export const resumoMudancas = (mudancas) => (mudancas.length === 1 ? mudancas[0] : `${mudancas.length} mudanças: ${mudancas.map((m) => m.split(':')[0]).join('; ')}`).slice(0, 200);
