// Textos que o operador escreveu para o SITE (títulos, motivos, benefícios, alegações, números, texto de seção), no
// plano de "Analisar meu pedido". Regras puras, sem banco nem tela.
//  - Cada frase vira uma "parte" com três versões: "Seu texto" (o original, intocado), "Versão melhorada" (mesmo
//    sentido e as MESMAS alegações e números, mais clara para o celular) e "Versão segura" (sem efeito no corpo e sem
//    número sem fonte; serve também para anúncio). Padrão: "Seu texto". Nada é aplicado antes de "Aplicar o plano".
//  - No site, alegação de efeito (cliente de saúde) NÃO é bloqueada: fica com aviso amarelo e precisa do "Entendi e
//    quero manter no site" (quem e quando ficam guardados). Nos criativos continua bloqueada (lib/saude.js).
//  - Número escrito pelo operador ("mais de 5000 pessoas") pede a fonte; sem fonte o item fica pendente. A IA nunca
//    inventa número: versão que traz número ou alegação que o original não tinha é descartada aqui.
import { achadosSaude } from './saude.js';

const txt = (v) => String(v ?? '').trim();
const sem = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

// ---------- tamanho do texto "Como eu quero o site" ----------
export const LIMITE_TEXTO_SITE = 8000;
const fmt = (n) => Number(n).toLocaleString('pt-BR');
/** "X de Y caracteres", com aviso a partir de 90% e "passou" acima do limite. */
export function contadorTexto(texto, limite = LIMITE_TEXTO_SITE) {
  const n = String(texto ?? '').length;
  return { n, limite, perto: n >= Math.ceil(limite * 0.9), passou: n > limite, rotulo: `${fmt(n)} de ${fmt(limite)} caracteres` };
}
/** Nunca corta calado: texto acima do limite da chamada de IA vira erro pedindo para encurtar. */
export function exigirTamanho(texto, nome = '"Como eu quero o site"', limite = LIMITE_TEXTO_SITE) {
  const c = contadorTexto(texto, limite);
  if (c.passou) throw new Error(`O texto ${nome} tem ${fmt(c.n)} caracteres e o limite para a IA é ${fmt(limite)}. Encurte o texto e tente de novo (o app não corta nada sem avisar).`);
  return String(texto ?? '');
}

// ---------- avisos ----------
export const AVISO_SITE_SAUDE = 'No site é permitido, mas atenção: a Anvisa trata a página da loja como publicidade e o Meta revisa a página de destino dos anúncios; alegação de efeito pode reprovar anúncios que levam para cá. Nos criativos isso é bloqueado porque o Meta proíbe.';
export const VERSOES = { original: 'Seu texto', melhorada: 'Versão melhorada', segura: 'Versão segura', manual: 'Editar à mão' };
export const FONTES_NUMERO = { vendas_cliente: 'Vendas informadas pelo cliente', relatorio: 'Relatório da plataforma', outro: 'Outro' };
export const DESTINOS_TEXTO = { banner_titulo: 'Título do banner', banner_subtitulo: 'Subtítulo do banner', secao: 'Seção de destaques' };

// ---------- números que precisam de fonte ----------
// Quantidade de gente/vendas/avaliações/tempo/percentual ("mais de 5000 pessoas", "98% aprovam", "10 mil potes").
// Composição ("30 cápsulas"), preço e "5 motivos" não entram.
const RE_NUMERO = /(?:\b(?:mais de|acima de|cerca de|quase|mais do que)\s+|\+\s?)?\d[\d.]*(?:,\d+)?\s*(?:mil\s+)?(?:%|por cento\b|pessoas\b|clientes\b|vendas\b|vendid\w*|unidades\b|potes\b|frascos\b|caixas\b|pedidos\b|avalia\w*|estrelas\b|anos\b|compradores\b|usu[aá]ri\w*|consumidor\w*|brasileir\w*|mulheres\b|homens\b|fam[ií]lias\b)/gi;
export const numerosDe = (texto) => [...new Set((String(texto || '').match(RE_NUMERO) || []).map((x) => x.toLowerCase().replace(/\s+/g, ' ').trim()))];
const digitos = (texto) => new Set((String(texto || '').match(/\d[\d.,]*/g) || []).map((d) => d.replace(/[.,]/g, '')));

// ---------- partes ----------
/** Texto da versão escolhida (manual = o que o operador escreveu à mão). */
export const textoEscolhido = (p) => txt(p?.escolha === 'manual' ? p.manual : p?.[p?.escolha] || p?.original);

/**
 * Parte vinda da IA, conferida: o original é o do operador; a melhorada que acrescenta alegação ou número que o
 * original não tem é descartada; a segura que ainda traz alegação de efeito ou número é descartada.
 */
export function normalizarParte(x, id) {
  const original = txt(typeof x === 'string' ? x : x?.original);
  let melhorada = txt(x?.melhorada), segura = txt(x?.segura);
  const descartes = [];
  if (melhorada && sem(melhorada) === sem(original)) melhorada = ''; // igual ao original não é outra versão
  if (melhorada) {
    const novaAlegacao = achadosSaude(melhorada).filter((a) => !sem(original).includes(sem(a)));
    const dOrig = digitos(original), novoNumero = [...digitos(melhorada)].filter((d) => !dOrig.has(d));
    if (novaAlegacao.length || novoNumero.length) { descartes.push(`A versão melhorada foi descartada: trazia ${novaAlegacao.length ? `alegação nova (${novaAlegacao.join(', ')})` : `número novo (${novoNumero.join(', ')})`}.`); melhorada = ''; }
  }
  if (segura && (achadosSaude(segura).length || numerosDe(segura).length)) { descartes.push('A versão segura foi descartada: ainda trazia alegação de efeito ou número sem fonte.'); segura = ''; }
  return { id, original, melhorada, segura, escolha: 'original', manual: '', fonte: null, confirmado: null, descartes };
}

/** Pendências da parte na versão escolhida: 'vazio' | 'fonte' (número sem fonte) | 'confirmar' (alegação sem o "Entendi"). */
export function pendenciasParte(p, { saude = false } = {}) {
  const t = textoEscolhido(p);
  if (!t) return ['vazio'];
  const out = [];
  if (numerosDe(t).length && !(p.fonte?.tipo && (p.fonte.tipo !== 'outro' || txt(p.fonte.outro)))) out.push('fonte');
  if (saude && achadosSaude(t).length && p.confirmado?.texto !== t) out.push('confirmar');
  return out;
}
export const alegacoesDe = (p, { saude = false } = {}) => (saude ? achadosSaude(textoEscolhido(p)) : []);

/** Item de texto do plano: tem partes (ou pede o texto completo). */
export const ehItemTexto = (x) => Array.isArray(x?.partes) && (x.partes.length > 0 || x.pedeTexto);

/** Recalcula o status do item de texto pelas partes: pendência = "Precisa de resposta"; tudo resolvido = pronto e marcado. */
export function atualizarItemTexto(item, { saude = false } = {}) {
  if (!ehItemTexto(item)) return item;
  const pend = item.partes.flatMap((p) => pendenciasParte(p, { saude }));
  const pronto = item.partes.length > 0 && !pend.length;
  const eraPronto = item.status === 'pronto';
  return { ...item, status: pronto ? 'pronto' : 'pergunta', aceito: pronto ? (eraPronto ? item.aceito !== false : true) : false, motivo: '', alternativa: '' };
}

const mudaParte = (item, parteId, f, ctx) => atualizarItemTexto({ ...item, partes: item.partes.map((p) => (p.id === parteId ? f(p) : p)) }, ctx);
/** Escolhe a versão de uma parte (original | melhorada | segura | manual). */
export const escolherVersao = (item, parteId, escolha, ctx = {}) => mudaParte(item, parteId, (p) => ({ ...p, escolha: VERSOES[escolha] && (escolha === 'manual' || p[escolha]) ? escolha : p.escolha, ...(escolha === 'manual' && ctx.manual != null ? { manual: txt(ctx.manual) } : {}) }), ctx);
/** Fonte do número: { tipo: vendas_cliente | relatorio | outro, outro }. null tira a fonte. */
export const definirFonte = (item, parteId, fonte, ctx = {}) => mudaParte(item, parteId, (p) => ({ ...p, fonte: fonte && FONTES_NUMERO[fonte.tipo] ? { tipo: fonte.tipo, outro: fonte.tipo === 'outro' ? txt(fonte.outro).slice(0, 200) : '' } : null }), ctx);
/** "Entendi e quero manter no site": vale para o texto escolhido agora (trocar a versão pede de novo). */
export const confirmarAlegacao = (item, parteId, { marcado = true, por = '', em = new Date().toISOString() } = {}, ctx = {}) =>
  mudaParte(item, parteId, (p) => ({ ...p, confirmado: marcado ? { texto: textoEscolhido(p), por: txt(por) || 'operador', em } : null }), ctx);

/** Divide o texto completo colado pelo operador em partes (uma por linha; tira marcador e número do começo). */
export function partesDoTexto(texto, prefixo) {
  return String(texto || '').split(/\n+/).map((l) => l.replace(/^\s*(?:[-•*]|\d{1,2}[.)º°-])\s*/, '').trim()).filter(Boolean).slice(0, 20)
    .map((l, i) => normalizarParte({ original: l }, `${prefixo}t${i + 1}`));
}
/** O operador mandou o texto completo no campo do item: vira as partes (só "Seu texto"; "Sugerir de novo" traz as outras). */
export const receberTextoCompleto = (item, texto, ctx = {}) => atualizarItemTexto({ ...item, textoCompleto: txt(texto), partes: partesDoTexto(texto, item.id), resposta: 'Texto completo enviado' }, ctx);

/** "Sugerir de novo" de um item: troca só a melhorada/segura de cada parte (mesma ordem); escolha, fonte e "Entendi" ficam. */
export function mesclarSugestoes(item, sugeridas = [], ctx = {}) {
  const partes = item.partes.map((p, i) => {
    const s = normalizarParte({ original: p.original, melhorada: sugeridas[i]?.melhorada, segura: sugeridas[i]?.segura }, p.id);
    const escolha = (p.escolha === 'melhorada' && !s.melhorada) || (p.escolha === 'segura' && !s.segura) ? 'original' : p.escolha;
    return { ...p, melhorada: s.melhorada, segura: s.segura, descartes: s.descartes, escolha };
  });
  return atualizarItemTexto({ ...item, partes }, ctx);
}

// ---------- aplicar no site ----------
/** Linhas a aplicar de cada item de texto aceito: { itemId, destino, titulo, linhas: [{ texto, versao, fonte, alegacao, confirmado }] }. */
export function textosParaAplicar(itens = [], { saude = false } = {}) {
  return itens.filter((x) => ehItemTexto(x) && x.partes.length).map((x) => ({
    itemId: x.id, destino: DESTINOS_TEXTO[x.params?.destino] ? x.params.destino : 'secao', titulo: txt(x.params?.titulo) || txt(x.pedido).slice(0, 80),
    linhas: x.partes.map((p) => ({ id: p.id, texto: textoEscolhido(p), versao: p.escolha, segura: p.segura || '', fonte: numerosDe(textoEscolhido(p)).length ? p.fonte : null, alegacao: alegacoesDe(p, { saude }), confirmado: alegacoesDe(p, { saude }).length ? p.confirmado : null })),
  }));
}

/**
 * Põe os textos escolhidos no estado do site (por cima do que a IA escreveu): banner (título/subtítulo) e a seção
 * "Destaques" (conteudo.destaques no personalizado, pacote.destaques no pacote). Os destaques são sempre os do plano.
 */
export function aplicarTextosNoEstado(estado, itens = [], modo = 'pacote', ctx = {}) {
  const grupos = textosParaAplicar(itens, ctx);
  const juntar = (g) => g.linhas.map((l) => l.texto).join(' ');
  const destaques = grupos.filter((g) => g.destino === 'secao').map(({ destino, ...g }) => g);
  const titulo = grupos.find((g) => g.destino === 'banner_titulo'), sub = grupos.find((g) => g.destino === 'banner_subtitulo');
  if (modo === 'custom') {
    const conteudo = { ...(estado.conteudo || {}), destaques };
    if (titulo) conteudo.heroTitulo = juntar(titulo);
    if (sub) conteudo.heroSubtitulo = juntar(sub);
    return { ...estado, conteudo };
  }
  const pacote = { ...(estado.pacote || {}), destaques };
  if (titulo || sub) {
    const banners = [...(pacote.banners || [])];
    banners[0] = { uso: 'Banner principal', cta: '', ...(banners[0] || {}), ...(titulo ? { titulo: juntar(titulo) } : {}), ...(sub ? { subtitulo: juntar(sub) } : {}) };
    pacote.banners = banners;
  }
  return { ...estado, pacote };
}

/** Destaques gravados no site do modo. */
export const destaquesDoSite = (site, modo) => ((modo === 'custom' ? site?.conteudo?.destaques : site?.pacote?.destaques) || []).filter((g) => g && Array.isArray(g.linhas));

/** Confere um item de texto no site: o texto aplicado é o da versão escolhida? */
export function conferirTextoItem(item, site, modo) {
  const custom = modo === 'custom';
  const esperado = textosParaAplicar([item])[0];
  if (!esperado) return null;
  const nome = (l) => VERSOES[l.versao] || VERSOES.original;
  if (esperado.destino !== 'secao') {
    const atual = custom ? (esperado.destino === 'banner_titulo' ? site?.conteudo?.heroTitulo : site?.conteudo?.heroSubtitulo) : (esperado.destino === 'banner_titulo' ? site?.pacote?.banners?.[0]?.titulo : site?.pacote?.banners?.[0]?.subtitulo);
    const quer = esperado.linhas.map((l) => l.texto).join(' ');
    return sem(atual) === sem(quer) ? { status: 'atendido', motivo: `${DESTINOS_TEXTO[esperado.destino]}: "${quer}" (${nome(esperado.linhas[0])})` }
      : { status: 'nao', motivo: `${DESTINOS_TEXTO[esperado.destino]} está "${txt(atual) || '(vazio)'}", o escolhido é "${quer}"` };
  }
  const g = destaquesDoSite(site, modo).find((d) => d.itemId === item.id);
  if (!g) return { status: 'nao', motivo: 'a seção com estes textos não está no site' };
  const tem = new Set(g.linhas.map((l) => sem(l.texto)));
  const faltam = esperado.linhas.filter((l) => !tem.has(sem(l.texto)));
  const sobram = g.linhas.filter((l) => !esperado.linhas.some((e) => sem(e.texto) === sem(l.texto)));
  if (!faltam.length && !sobram.length) return { status: 'atendido', motivo: `${esperado.linhas.length} texto(s) como escolhido: ${[...new Set(esperado.linhas.map(nome))].join(', ')}` };
  if (faltam.length === esperado.linhas.length) return { status: 'nao', motivo: 'nenhum dos textos escolhidos está no site' };
  return { status: 'parcial', motivo: `diferente do escolhido: ${faltam.map((l) => `"${l.texto}"`).join(', ')}${sobram.length ? `; no site está ${sobram.map((l) => `"${l.texto}"`).join(', ')}` : ''}` };
}

/**
 * Alegações e números que o operador manteve no site (para o checklist do passo 6 e para os criativos):
 * [{ texto, segura, alegacao, fonte, confirmado, titulo }].
 */
export function alegacoesMantidas(site, modo) {
  return destaquesDoSite(site, modo).flatMap((g) => g.linhas.filter((l) => (l.alegacao || []).length || l.fonte).map((l) => ({ ...l, titulo: g.titulo })));
}
/** Forma guardada no cliente (cliente.alegacoesSite), lida pelos criativos (lib/saude.js motivoSaude). */
export const alegacoesParaCliente = (lista = []) => lista.map((l) => ({ texto: l.texto, segura: l.segura || '', alegacao: l.alegacao || [], fonte: l.fonte || null }));
export const nomeFonte = (f) => (f ? (f.tipo === 'outro' ? `Outro: ${f.outro}` : FONTES_NUMERO[f.tipo] || '') : '');

/** A seção "Destaques" fica fixa logo depois do banner (a chave do banner muda com o modo); sem banner na home, no começo. */
export const comDestaques = (ordem, banner) => (ordem.includes(banner) ? ordem.flatMap((k) => (k === banner ? [k, 'destaques'] : [k])) : ['destaques', ...ordem]);
