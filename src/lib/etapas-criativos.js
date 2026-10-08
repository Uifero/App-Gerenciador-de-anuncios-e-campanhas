// "Criar criativos": os 4 passos da aba Criativos e o que falta em cada um (mesmo padrão do "Montar site",
// lib/etapas-site.js). Puro: só lê o que já existe (cliente.fluxoCriativos, produtos, peças). Nenhum passo é trancado.
// O fluxo em andamento fica em cliente.fluxoCriativos: { produtoId, destino, pedido, ideias: [...], iniciadoEm, concluidoEm }.
// O produto e o destino vêm da fonte (aba Produtos e "Sobre como esse cliente anuncia"); o fluxo guarda só a escolha.
import { comoAnunciaDe } from './anuncio.js';
import { FORMATO_IMAGEM_PADRAO, FORMATO_VIDEO_PADRAO } from './formatos-instagram.js';

export const ETAPAS_CRIATIVOS = [
  { n: 1, id: 'produto', titulo: 'Produto e objetivo', icone: 'box-open', legenda: 'Produto, destino e o que você quer' },
  { n: 2, id: 'ideias', titulo: 'Ideias', icone: 'lightbulb', legenda: 'Gerar ideias e marcar quais produzir' },
  { n: 3, id: 'produzir', titulo: 'Produzir', icone: 'clapperboard', legenda: 'Estúdio já ajustado para cada ideia' },
  { n: 4, id: 'galeria', titulo: 'Galeria', icone: 'images', legenda: 'Peças finalizadas: comparar, usar, descartar' },
];
export const DESTINOS_FLUXO = [['whatsapp', 'Conversa no WhatsApp'], ['site', 'Compra no site']];

/** Destino do fluxo: o escolhido nele; sem escolha, o de "Sobre como esse cliente anuncia" ("os dois" fica para escolher). */
export function destinoDoFluxo(fluxo, cliente) {
  if (['whatsapp', 'site'].includes(fluxo?.destino)) return fluxo.destino;
  const d = comoAnunciaDe(cliente).destino;
  return ['whatsapp', 'site'].includes(d) ? d : '';
}

/** Ideias marcadas para produzir. */
export const ideiasMarcadas = (fluxo) => (fluxo?.ideias || []).filter((i) => i.marcada);

/**
 * Formato em que a ideia é produzida: vídeo vai para Reels 9:16; imagem/carrossel/texto, para o feed 4:5. A IA às vezes
 * devolve o formato em texto livre ("Reels 9:16, a dona fala…", "Estático 4:5 em carrossel"): lido pelas palavras.
 */
export function formatoDaIdeia(ideia) {
  const f = String(ideia?.formato || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const imagem = ['imagem', 'carrossel', 'texto'].includes(f) || (!/video|reels|9:16|stories|ugc/.test(f) && /imagem|estatic|carrossel|card|4:5|feed|foto/.test(f));
  return imagem ? { tipo: 'imagem', formato: FORMATO_IMAGEM_PADRAO } : { tipo: 'video', formato: FORMATO_VIDEO_PADRAO };
}

/** Há fluxo em andamento? (começado e não concluído, com alguma escolha feita) */
export const fluxoEmAndamento = (fluxo) => Boolean(fluxo && !fluxo.concluidoEm && (fluxo.produtoId || fluxo.pedido || (fluxo.ideias || []).length));

const falta = (texto, acao = null) => ({ texto, acao });

/**
 * Status de cada passo. ctx: { cliente, fluxo, produtos, pecas }. Devolve ETAPAS_CRIATIVOS com { status, faltas, dicas }.
 * acao: { tipo: 'etapa'|'novoProduto'|'ancora', alvo }.
 */
export function statusEtapasCriativos({ cliente = {}, fluxo = null, produtos = [], pecas = [] } = {}) {
  const f = fluxo || {};
  const ativos = produtos.filter((p) => !p.arquivado);
  const produto = ativos.find((p) => p.id === f.produtoId) || null;
  const destino = destinoDoFluxo(f, cliente);
  const ideias = f.ideias || [];
  const marcadas = ideiasMarcadas(f);
  const e = {};
  e[1] = {
    faltas: [
      !ativos.length && falta('Nenhum produto cadastrado: cadastre o produto que o anúncio vai vender.', { tipo: 'novoProduto' }),
      ativos.length && !produto && falta(f.produtoId ? 'O produto escolhido foi excluído: escolha outro.' : 'Escolha o produto do anúncio.', { tipo: 'ancora', alvo: 'produto' }),
      !destino && falta('Escolha para onde o anúncio leva: conversa no WhatsApp ou compra no site.', { tipo: 'ancora', alvo: 'destino' }),
    ].filter(Boolean),
    dicas: [],
  };
  e[2] = {
    faltas: [
      !ideias.length && falta('Ainda não há ideias: clique em "Gerar ideias" (ou escreva uma sem IA).', { tipo: 'ancora', alvo: 'gerar' }),
      ideias.length && !marcadas.length && falta('Marque pelo menos uma ideia para produzir.', { tipo: 'ancora', alvo: 'ideias' }),
    ].filter(Boolean),
    dicas: [],
  };
  const semPeca = marcadas.filter((i) => !pecas.some((p) => p.criativoId && p.criativoId === i.criativoId));
  e[3] = {
    faltas: [
      !marcadas.length && falta('Nenhuma ideia marcada no passo 2.', { tipo: 'etapa', alvo: 2 }),
      ...semPeca.map((i) => falta(`"${i.nome || i.hook}" ainda não tem peça finalizada.`, { tipo: 'ancora', alvo: `ideia-${i.id}` })),
    ].filter(Boolean),
    dicas: [],
  };
  const novas = pecas.filter((p) => (p.status || 'nova') === 'nova');
  e[4] = {
    faltas: [
      !pecas.length && falta('Nenhuma peça finalizada ainda: produza no passo 3.', { tipo: 'etapa', alvo: 3 }),
      novas.length && falta(`${novas.length} peça(s) nova(s) para revisar: marque "Usar" ou "Descartar".`, { tipo: 'ancora', alvo: 'galeria' }),
    ].filter(Boolean),
    dicas: [],
  };
  return ETAPAS_CRIATIVOS.map((x) => ({ ...x, status: e[x.n].faltas.length ? 'falta' : 'completo', faltas: e[x.n].faltas, dicas: e[x.n].dicas }));
}

/** Passo em que a aba abre: com fluxo em andamento, o 1º com falta; sem fluxo e com peças, a Galeria; senão o 1º com falta. */
export function passoInicialCriativos(etapas, { fluxo = null, pecas = [] } = {}) {
  if (!fluxoEmAndamento(fluxo) && pecas.length) return 4;
  return (etapas.find((x) => x.status === 'falta') || etapas[etapas.length - 1]).n;
}

/** Rota da aba: #/c/<id>/criativos/<1-4> ou #/c/<id>/criativos/todos. */
export const rotaCriativos = (clienteId, sub) => `#/c/${clienteId}/criativos/${sub}`;
/** Sub-rota pedida: número 1-4, 'todos' ou null. */
export function subRotaCriativos(hash = '') {
  const m = /^#\/c\/[^/]+\/criativos\/([^/?]+)/.exec(hash);
  if (!m) return null;
  if (m[1] === 'todos') return 'todos';
  const n = Number(m[1]);
  return n >= 1 && n <= 4 ? n : null;
}

/** Briefing que vai para a IA a partir do passo 1 (o resto vem do perfil do cliente). */
export function briefingDoFluxo({ fluxo = {}, produto = null, cliente = {} } = {}) {
  const destino = destinoDoFluxo(fluxo, cliente);
  return [
    produto && `Produto: ${produto.nome}`,
    destino === 'whatsapp' ? 'Objetivo: levar a pessoa a chamar no WhatsApp (o CTA convida para a conversa).' : destino === 'site' ? 'Objetivo: levar a pessoa a comprar no site (o CTA leva para a página do produto).' : '',
    String(fluxo.pedido || '').trim() && `O que o gestor quer: ${String(fluxo.pedido).trim()}`,
  ].filter(Boolean).join('\n');
}

/** Ideia guardada no fluxo, a partir de uma variação da IA (ou escrita à mão). */
export function ideiaDe(x, id) {
  return {
    id, nome: x.nome || '', hook: x.hook || '', copy: x.copy || '', cta: x.cta || '', angulo: x.angulo || '', gatilho: x.gatilho || '',
    framework: x.framework || 'livre', formato: x.formato || 'video_curto', porque: x.porque || '', narrativa: x.narrativa || null,
    modeloGancho: x.modeloGancho || null, avisosGancho: x.avisosGancho || [], marcada: false, criativoId: null,
  };
}
