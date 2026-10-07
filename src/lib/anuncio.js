// "Sobre como esse cliente anuncia" (cliente.comoAnuncia): o texto livre do operador + campos estruturados que a IA
// preenche só quando estão vazios. É UMA fonte, lida na hora por criativos, campanhas, diagnóstico e pela análise
// "Analisar e recomendar" (core/ia.js contextoCliente) — nada é copiado para outro lugar.
// Também: tabela de objetivos/locais de conversão do Meta (a IA nunca inventa nome), CTA por destino, avisos do
// destino e o endereço da Biblioteca de Anúncios do nicho (sem raspagem: o operador abre e tira print). Puro.
import { avisosCampanha } from './conexoes.js';
import { infoPais, paisDoCliente } from './pais.js';

const txt = (v) => String(v ?? '').trim();
const vazioCampo = (v) => v == null || txt(v) === '';
/** Número positivo a partir de "R$ 1.234,56", "40%", 1234 (pt-BR: ponto = milhar, vírgula = decimal). */
export function numeroBR(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.500" = mil e quinhentos
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const positivo = (v) => { const n = numeroBR(v); return n != null && n > 0 ? n : null; };

// ---------- campos ----------
export const DESTINOS = [['whatsapp', 'WhatsApp'], ['site', 'Site'], ['ambos', 'Os dois']];
export const ATENDIMENTO = [['imediato', 'Responde em até 5 min'], ['rapido', 'Responde em até 30 min'], ['lento', 'Leva horas para responder'], ['ninguem', 'Ninguém atende com regularidade']];
/** Campos estruturados (a ordem é a da tela). */
export const CAMPOS_ANUNCIO = [
  ['destino', 'Destino de venda'], ['ticketMedio', 'Ticket médio (R$)'], ['margem', 'Margem (%)'], ['verbaMensal', 'Verba mensal de anúncio (R$)'], ['atendimento', 'Atendimento no WhatsApp'],
];
export const LEGENDA_TEXTO = 'Conte do seu jeito: vende pelo WhatsApp, pelo site ou pelos dois? Quem atende o WhatsApp e em quanto tempo? Ticket médio, verba, o que já rodou e o resultado.';
export const AVISO_AUTO = 'preenchido automaticamente, confirme ou edite';

/** Dados do cliente com padrões (cliente antigo não tem o campo). */
export const comoAnunciaDe = (c) => ({ texto: '', destino: '', ticketMedio: null, margem: null, verbaMensal: null, atendimento: '', quemAtende: '', auto: {}, palavrasBiblioteca: [], ...(c?.comoAnuncia || {}) });

/** Destino falado de vários jeitos -> chave. */
export function normalizarDestino(v) {
  const s = txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!s) return '';
  if (/ambos|os dois|dois|whats.*site|site.*whats|teste/.test(s)) return 'ambos';
  if (/whats|zap|conversa|mensage/.test(s)) return 'whatsapp';
  if (/site|loja|e-?commerce|checkout/.test(s)) return 'site';
  return '';
}
export function normalizarAtendimento(v) {
  const s = txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (ATENDIMENTO.some(([k]) => k === s)) return s;
  if (!s) return '';
  if (/ningu|sem atend|nao tem/.test(s)) return 'ninguem';
  if (/hora|dia|demor|lent/.test(s)) return 'lento';
  if (/imediat|na hora|segundo|ate 5|5 min/.test(s)) return 'imediato';
  if (/min|rapid/.test(s)) return 'rapido';
  return '';
}

/** Campos devolvidos pela IA (ou digitados) -> valores válidos; o que não dá para validar vira vazio. */
export function normalizarCamposAnuncio(d = {}) {
  const margem = numeroBR(d.margem);
  return {
    destino: normalizarDestino(d.destino),
    ticketMedio: positivo(d.ticketMedio),
    margem: margem != null && margem > 0 && margem < 100 ? margem : null,
    verbaMensal: positivo(d.verbaMensal),
    atendimento: normalizarAtendimento(d.atendimento),
    quemAtende: txt(d.quemAtende).slice(0, 120),
  };
}

/**
 * Regra "só preenche o vazio": devolve { patch, preenchidos } com os campos sugeridos que estavam vazios no cliente.
 * Campo que o operador já preencheu nunca muda. Cada campo preenchido fica marcado em `auto` até o operador confirmar.
 */
export function preencherVazios(atual = {}, sugeridos = {}) {
  const base = { ...comoAnunciaDe({ comoAnuncia: atual }) };
  const novos = normalizarCamposAnuncio(sugeridos);
  const patch = {}, preenchidos = [];
  for (const k of [...CAMPOS_ANUNCIO.map(([c]) => c), 'quemAtende']) {
    if (!vazioCampo(base[k]) || vazioCampo(novos[k])) continue;
    patch[k] = novos[k]; preenchidos.push(k);
  }
  if (preenchidos.length) patch.auto = { ...(base.auto || {}), ...Object.fromEntries(preenchidos.map((k) => [k, true])) };
  return { patch, preenchidos };
}

/** Linhas para a IA (contextoCliente): o que o operador contou e os campos confirmados/sugeridos. */
export function textoComoAnuncia(c) {
  const a = comoAnunciaDe(c);
  const auto = (k) => (a.auto?.[k] ? ' (sugerido pela IA a partir do texto; o operador ainda não confirmou)' : '');
  const nome = (lista, k) => (lista.find(([x]) => x === k) || [, ''])[1];
  const l = [
    a.texto && `Como o cliente anuncia (palavras do operador): "${txt(a.texto).slice(0, 1500)}"`,
    a.destino && `Destino de venda${auto('destino')}: ${nome(DESTINOS, a.destino)}`,
    a.ticketMedio && `Ticket médio${auto('ticketMedio')}: R$ ${a.ticketMedio}`,
    a.margem && `Margem${auto('margem')}: ${a.margem}%`,
    a.verbaMensal && `Verba mensal de anúncio${auto('verbaMensal')}: R$ ${a.verbaMensal}`,
    a.atendimento && `Atendimento no WhatsApp${auto('atendimento')}: ${nome(ATENDIMENTO, a.atendimento)}${a.quemAtende ? ` (${a.quemAtende})` : ''}`,
    c?.subnicho && `Subnicho: ${c.subnicho}`,
  ].filter(Boolean);
  return l.join('\n');
}

// ---------- contas do ticket e da margem (sem benchmark: só os números do próprio cliente) ----------
/**
 * Pontos de decisão calculados com o ticket e a margem DO CLIENTE: custo por venda de empate (ticket × margem) e
 * ROAS de empate (100 ÷ margem). Escalar = custo por venda até 70% do empate (folga de 30%); pausar = acima do empate.
 * É regra do app (conta), não benchmark de mercado. Sem margem ou sem ticket: devolve o que falta.
 */
export function limitesDoCliente({ ticketMedio, margem } = {}) {
  const t = positivo(ticketMedio), m = numeroBR(margem);
  if (!t || !(m > 0 && m < 100)) return { ok: false, falta: [!t && 'ticket médio', !(m > 0 && m < 100) && 'margem'].filter(Boolean) };
  const empate = (t * m) / 100;
  const r2 = (n) => Math.round(n * 100) / 100;
  return { ok: true, custoVendaEmpate: r2(empate), custoVendaEscalar: r2(empate * 0.7), roasEmpate: r2(100 / m), roasEscalar: r2(100 / (m * 0.7)) };
}

// ---------- objetivos e locais de conversão do Meta (a IA escolhe pela chave; o nome sai daqui) ----------
export const CONFIRA = 'confira no Gerenciador de Anúncios';
export const OBJETIVOS_META = {
  vendas: { nome: 'Vendas' }, engajamento: { nome: 'Engajamento' }, cadastros: { nome: 'Cadastros' }, trafego: { nome: 'Tráfego' }, reconhecimento: { nome: 'Reconhecimento' },
};
/** `certeza: 'confira'` = combinação que muda com frequência no Gerenciador: o app avisa para conferir lá. */
export const LOCAIS_CONVERSAO = {
  site: { nome: 'Site', destino: 'site', objetivos: ['vendas', 'cadastros', 'trafego', 'engajamento'] },
  apps_mensagem: { nome: 'Apps de mensagem (WhatsApp)', destino: 'whatsapp', objetivos: ['vendas', 'engajamento', 'cadastros', 'trafego'] },
  site_e_apps: { nome: 'Site e apps de mensagem', destino: 'ambos', objetivos: ['vendas'], certeza: 'confira' },
  formulario: { nome: 'Formulários instantâneos', destino: null, objetivos: ['cadastros'] },
};
const chaveDe = (tabela, v) => { const s = txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s-]+/g, '_');
  if (tabela[s]) return s;
  return Object.keys(tabela).find((k) => tabela[k].nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()) || null; };
/**
 * Objetivo + local de conversão vindos da IA -> nomes da tabela. Fora da tabela, ou combinação que não existe, vira
 * { nome: CONFIRA } com aviso: o app nunca mostra um nome que a IA inventou.
 */
export function validarObjetivo(objetivo, local) {
  const o = chaveDe(OBJETIVOS_META, objetivo), l = chaveDe(LOCAIS_CONVERSAO, local);
  const avisos = [];
  if (!o) avisos.push(`Objetivo "${txt(objetivo) || 'vazio'}" não está na tabela do app: ${CONFIRA}.`);
  if (!l) avisos.push(`Local de conversão "${txt(local) || 'vazio'}" não está na tabela do app: ${CONFIRA}.`);
  else if (o && !LOCAIS_CONVERSAO[l].objetivos.includes(o)) avisos.push(`"${LOCAIS_CONVERSAO[l].nome}" não costuma existir no objetivo ${OBJETIVOS_META[o].nome}: ${CONFIRA}.`);
  else if (LOCAIS_CONVERSAO[l].certeza === 'confira') avisos.push(`"${LOCAIS_CONVERSAO[l].nome}" muda com frequência no Gerenciador: ${CONFIRA}.`);
  return {
    objetivo: o ? { chave: o, nome: OBJETIVOS_META[o].nome } : { chave: null, nome: CONFIRA },
    local: l ? { chave: l, nome: LOCAIS_CONVERSAO[l].nome } : { chave: null, nome: CONFIRA },
    avisos,
  };
}

// ---------- CTA por destino ----------
export const CTAS = { whatsapp: ['Enviar mensagem pelo WhatsApp', 'Enviar mensagem'], site: ['Comprar agora', 'Saiba mais', 'Ver produto'] };
const normCta = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** CTA que combina com o destino (conversa x compra). Se a IA mandou um CTA do outro destino, troca e avisa. */
export function ctaParaDestino(cta, destino) {
  const d = destino === 'whatsapp' ? 'whatsapp' : 'site';
  const outro = d === 'whatsapp' ? 'site' : 'whatsapp';
  const c = normCta(cta);
  const doDestino = CTAS[d].find((x) => normCta(x) === c);
  if (doDestino) return { cta: doDestino, ajustado: false };
  const conversa = /whats|mensag|convers|chama|fale/.test(c), compra = /compr|carrinho|loja|site|produto|saiba/.test(c);
  if (c && ((d === 'whatsapp' && conversa) || (d === 'site' && compra && !conversa))) return { cta: txt(cta), ajustado: false };
  return { cta: CTAS[d][0], ajustado: Boolean(c), aviso: c ? `CTA "${txt(cta)}" é de ${outro === 'site' ? 'compra no site' : 'conversa'}; trocado por "${CTAS[d][0]}" (destino ${d === 'whatsapp' ? 'WhatsApp' : 'site'}).` : '' };
}

// ---------- avisos do destino ----------
/**
 * Avisos de "Analisar e recomendar" (não bloqueiam): WhatsApp sem ninguém para responder rápido; site sem Pixel ou
 * loja não publicada (os mesmos avisos da montagem de campanha, lib/conexoes.js avisosCampanha).
 */
export function avisosDestino({ cliente = {}, site = null, etiquetaAprov = null, produtos = [] } = {}) {
  const a = comoAnunciaDe(cliente);
  const out = [];
  const whats = ['whatsapp', 'ambos'].includes(a.destino), noSite = ['site', 'ambos'].includes(a.destino);
  if (whats && (!a.atendimento || ['lento', 'ninguem'].includes(a.atendimento))) {
    out.push({ id: 'whatsapp_atendimento', texto: a.atendimento
      ? `Destino WhatsApp, mas o atendimento ${a.atendimento === 'ninguem' ? 'não tem ninguém com regularidade' : 'leva horas'}: conversa que espera esfria e a verba vira conversa sem venda. Combine quem responde e em quanto tempo antes de subir.`
      : 'Destino WhatsApp sem saber quem responde e em quanto tempo: preencha "Atendimento no WhatsApp". Sem alguém respondendo rápido, a conversa esfria.' });
  }
  if (noSite) out.push(...avisosCampanha({ cliente, site, etiquetaAprov, produtos }).filter((x) => ['pixel', 'loja', 'aprovacao'].includes(x.id)));
  return out;
}

// ---------- nicho ----------
/** Sugestão de nicho a partir do perfil e dos produtos (o operador confirma). '' se não der para sugerir. */
export function sugerirNicho(cliente = {}, produtos = []) {
  const cats = produtos.map((p) => txt(p.categoria)).filter(Boolean);
  if (cats.length) {
    const cont = {}; for (const c of cats) cont[c.toLowerCase()] = (cont[c.toLowerCase()] || 0) + 1;
    const [top] = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
    return cats.find((c) => c.toLowerCase() === top);
  }
  const neg = txt(cliente.marca?.negocio).split(/[.;\n]| para | pra /i)[0].trim();
  return neg.length >= 3 && neg.length <= 60 ? neg : '';
}

// ---------- Biblioteca de Anúncios do Meta (sem raspagem) ----------
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'para', 'pra', 'com', 'em', 'a', 'o', 'as', 'os', 'loja', 'produtos']);
/** Palavras-chave padrão (sem IA): subnicho e nicho, sem repetição. O operador edita. */
export function palavrasPadrao(cliente = {}) {
  const frases = [txt(cliente.subnicho), txt(cliente.nicho)].filter(Boolean);
  const out = [];
  for (const f of frases) if (!out.some((x) => x.toLowerCase() === f.toLowerCase())) out.push(f);
  // Nicho longo ("Moda feminina para mulheres de 30 a 50 anos"): fica só com as palavras que buscam algo.
  return out.map((f) => (f.split(/\s+/).length > 4 ? f.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !PARADAS.has(w)).slice(0, 4).join(' ') : f));
}
/** Limpa a lista (texto separado por vírgula ou lista) -> até 5 termos, sem repetição. */
export const limparPalavras = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,;\n]/)).map(txt).filter(Boolean))].slice(0, 5);
/**
 * Endereço da Biblioteca de Anúncios filtrado por país (BR por padrão), só anúncios ativos e as palavras do nicho.
 * O app só abre a página: quem olha e tira print é o operador (raspar a Biblioteca viola os termos do Meta).
 */
export function urlBibliotecaAnuncios({ palavras = [], pais = 'BR' } = {}) {
  const termos = limparPalavras(palavras);
  const u = new URL('https://www.facebook.com/ads/library/');
  u.searchParams.set('active_status', 'active');
  u.searchParams.set('ad_type', 'all');
  u.searchParams.set('country', String(pais || 'BR').toUpperCase());
  u.searchParams.set('q', termos.join(' '));
  u.searchParams.set('search_type', 'keyword_unordered');
  u.searchParams.set('media_type', 'all');
  return u.toString();
}
/** Código do país do cliente para a Biblioteca (BR quando o país não está na lista). */
export const isoDoCliente = (c) => infoPais(paisDoCliente(c))?.iso || 'BR';
