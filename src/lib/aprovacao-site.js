// Link de aprovação do SITE (aba "Aprovações do site"): regras puras, sem banco nem tela.
//  - Datas sempre no horário de Brasília (America/Sao_Paulo), qualquer que seja o fuso do computador. Um link criado
//    às 22h em Brasília já é o dia seguinte em UTC: formatar pelo fuso certo evita o erro de um dia.
//  - Um link novo SUBSTITUI os anteriores ativos do cliente: continuam abrindo, mas sem Aprovar/Pedir ajuste. Resposta
//    gravada num link depois de ele ser substituído não vale (o cliente nunca aprova uma versão desatualizada).

export const FUSO = 'America/Sao_Paulo';
export const VALIDADE_DIAS = 30;
const DIA = 864e5;

const partes = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return p;
};
/** "dd/mm/aaaa às HH:mm" no horário de Brasília. */
export function dataHoraBR(iso) { const p = partes(iso); return p ? `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}` : '—'; }
/** "dd/mm às HH:mm" no horário de Brasília. */
export function dataHoraCurta(iso) { const p = partes(iso); return p ? `${p.day}/${p.month} às ${p.hour}:${p.minute}` : '—'; }

export const SECOES_SITE = ['Topo / banner', 'Produtos', 'Nossa história', 'Depoimentos', 'Perguntas frequentes', 'Políticas e rodapé', 'Cores e visual', 'Outro'];

/** A seção vai no começo do comentário ("Seção: Produtos" + linha), para caber nas regras de resposta que já existem. */
export const comentarioComSecao = (secao, texto) => `Seção: ${String(secao || 'Outro').slice(0, 40)}\n${String(texto || '').trim()}`.slice(0, 1000);
export function lerSecao(comentario = '') {
  const m = /^Seção: ([^\n]*)\n?([\s\S]*)$/.exec(String(comentario));
  return m ? { secao: m[1].trim(), texto: m[2].trim() } : { secao: '', texto: String(comentario).trim() };
}

export const modoRotulo = (modo) => (modo === 'custom' ? 'personalizado' : 'pacote');

/** A resposta vale para este link? Não vale se chegou depois de o link ser substituído ou desativado. */
export function respostaValida(link, resposta) {
  if (!resposta) return null;
  const limite = link?.substituidoEm || link?.desativadoEm;
  return limite && String(resposta.em) > String(limite) ? null : resposta;
}

/**
 * Status de um link para a aba: { tipo, texto, secao?, comentario? }.
 * tipo: 'aprovado' | 'ajuste' | 'desativado' | 'substituido' | 'expirado' | 'aguardando'.
 */
export function statusDoLink(link, resposta, agora = Date.now()) {
  const r = respostaValida(link, resposta);
  if (r?.status === 'aprovado') return { tipo: 'aprovado', texto: `Aprovado em ${dataHoraCurta(r.em)}`, comentario: lerSecao(r.comentario).texto };
  if (r?.status === 'ajuste') { const { secao, texto } = lerSecao(r.comentario); return { tipo: 'ajuste', texto: `Ajuste pedido em ${dataHoraCurta(r.em)}`, secao, comentario: texto }; }
  if (link.desativadoEm) return { tipo: 'desativado', texto: `Desativado em ${dataHoraCurta(link.desativadoEm)}` };
  if (link.substituidoEm) return { tipo: 'substituido', texto: `Substituído por link de ${dataHoraCurta(link.substituidoPorEm || link.substituidoEm)}` };
  if (!(link.expiraMs > agora)) return { tipo: 'expirado', texto: 'Expirado' };
  return { tipo: 'aguardando', texto: 'Aguardando cliente' };
}

/** Pode receber resposta agora? (ativo = não substituído, não desativado, dentro da validade) */
export const linkAtivo = (link, agora = Date.now()) => Boolean(link) && !link.substituidoEm && !link.desativadoEm && link.expiraMs > agora;

/** Links do site do cliente, do mais novo para o mais antigo. */
export const ordenarLinks = (links = []) => links.filter((l) => l?.tipo === 'site').sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));

/** Id do link que leva a etiqueta "Mais recente": o mais novo que ainda está ativo. */
export const idMaisRecente = (links = [], agora = Date.now()) => ordenarLinks(links).find((l) => linkAtivo(l, agora))?.id || null;

/** Quais links passam a "Substituído" quando nasce um novo: os ativos do site do cliente (exceto o novo). */
export function aSubstituir(links = [], novoId, agora = Date.now()) {
  return links.filter((l) => l?.tipo === 'site' && l.id !== novoId && !l.substituidoEm && !l.desativadoEm);
}

/** Texto pronto para o WhatsApp. */
export const mensagemParaCliente = (link, url) => `Prévia do seu site (versão de ${dataHoraBR(link.criadoEm)}): ${url}. Abra, navegue e clique em Aprovar ou Pedir ajuste.`;

/** Etiqueta da aba Site/Loja a partir do link mais novo e da resposta dele. null = nenhum link ainda. */
export function etiquetaSite(links = [], respostas = [], agora = Date.now()) {
  const l = ordenarLinks(links)[0];
  if (!l) return null;
  const s = statusDoLink(l, respostas.find((r) => r.token === l.id), agora);
  const v = `v${l.versao || 1}`;
  const textos = { aprovado: `Aprovado ${v}`, ajuste: `Ajuste pedido ${v}`, aguardando: `Aguardando cliente ${v}`, expirado: `Link expirado ${v}`, desativado: `Link desativado ${v}`, substituido: `Substituído ${v}` };
  return { texto: textos[s.tipo], tipo: s.tipo };
}

export const novaValidade = (agora = Date.now(), dias = VALIDADE_DIAS) => agora + dias * DIA;
