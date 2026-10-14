// "Checklist para publicar" (Frente 3): o que conferir ANTES de montar a campanha no Gerenciador de Anúncios do Meta,
// gerado por campanha e com botão de copiar em cada item: nomes (campanha, conjunto, anúncio), UTMs por anúncio,
// Pixel/evento de conversão, exclusões, orçamento por conjunto, posicionamentos, programação e o que NÃO mexer nos
// primeiros dias. Puro (sem banco nem tela). O app continua sem publicar nada no Meta: o operador monta lá.
import { comoAnunciaDe } from './anuncio.js';
import { rastreamentoDe } from './rastreamento.js';
import { alvoCustoVenda, REGRAS_MINIMAS } from './dados-minimos.js';

const txt = (v) => String(v ?? '').trim();
/** Parte de nome sem acento nem símbolo, curta (o Gerenciador aceita, mas nome limpo filtra e lê melhor no relatório). */
export const parteNome = (v, max = 24) => txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, max) || 'sem-nome';
const slugUtm = (v) => parteNome(v, 60).toLowerCase();
const brl = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const FORMATO_NOME = { video_curto: 'video-9x16', imagem: 'img-4x5', carrossel: 'carrossel-4x5', texto: 'texto' };
const REMARKETING = /remarketing|retarget|quente|visitant|engaj|carrinho|compradores/i;

/** Nome da campanha: CLIENTE | OBJETIVO | DESTINO | TESTE ou ESCALA | AAAA-MM. */
export function nomeCampanha({ cliente = {}, campanha = {}, data = new Date().toISOString() }) {
  const destino = comoAnunciaDe(cliente).destino;
  return [parteNome(cliente.nome, 20), parteNome(campanha.objetivo || 'Vendas', 14), destino === 'whatsapp' ? 'WhatsApp' : destino === 'site' ? 'Site' : 'Site-WhatsApp',
    cliente.estagio === 'rodando' ? 'Escala' : 'Teste', String(data).slice(0, 7)].join(' | ');
}
/** Nome do conjunto: PÚBLICO | POSICIONAMENTO | ORÇAMENTO. */
export const nomeConjunto = (k = {}, i = 0) => [parteNome(k.publico?.nome || k.nome || `Publico-${i + 1}`, 28), 'Advantage+', k.orcamentoDiario ? `${Math.round(k.orcamentoDiario)}-dia` : 'orc-a-definir'].join(' | ');
/** Nome do anúncio: CRIATIVO | FORMATO | GANCHO | VERSÃO. */
export const nomeAnuncio = (c = {}) => [parteNome(c.nome || 'criativo', 28), FORMATO_NOME[c.formato] || parteNome(c.formato || 'formato', 12), c.modeloGancho ? `G${c.modeloGancho}` : 'G-livre', `v${(c.versoes || []).length || 1}`].join(' | ');

/** URL com UTMs de UM anúncio (site). Sem URL válida, null. */
export function urlComUtms(url, { campanha, conjunto, anuncio }) {
  try {
    const u = new URL(txt(url));
    u.searchParams.set('utm_source', 'facebook'); u.searchParams.set('utm_medium', 'paid_social');
    u.searchParams.set('utm_campaign', slugUtm(campanha)); u.searchParams.set('utm_term', slugUtm(conjunto)); u.searchParams.set('utm_content', slugUtm(anuncio));
    return u.toString();
  } catch { return null; }
}
/** Parâmetros dinâmicos do Meta (campo "Parâmetros de URL" do anúncio): o Meta troca pelos nomes de verdade. */
export const UTM_DINAMICO = 'utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&utm_id={{campaign.id}}';

/** Primeiro dia útil de veiculação: amanhã à 00:00 (o primeiro dia já roda com o orçamento cheio). */
export function inicioSugerido(hoje = new Date()) {
  const d = new Date(hoje); d.setDate(d.getDate() + 1);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} às 00:00`;
}

/**
 * Checklist da campanha: [{ id, titulo, itens: [{ rotulo, valor, copiar }] }]. ctx: { campanha, cliente, criativos
 * (todos do cliente), hoje }. Cada item com `copiar: true` ganha o botão de copiar na tela.
 */
export function checklistPublicar({ campanha = {}, cliente = {}, criativos = [], hoje = new Date() } = {}) {
  const destino = comoAnunciaDe(cliente).destino;
  const r = rastreamentoDe(cliente);
  const nomeC = nomeCampanha({ cliente, campanha, data: hoje.toISOString?.() || String(hoje) });
  const doCriativo = (id) => criativos.find((c) => c.id === id) || null;
  const conjuntos = (campanha.conjuntos || []).length ? campanha.conjuntos
    : [{ nome: 'Conjunto 1', publico: { nome: (campanha.publicos || [])[0]?.nome || '' }, orcamentoDiario: campanha.orcamentoDiario || null, criativos: (campanha.criativos || []).map((k) => ({ criativoId: k.id })) }];
  const site = destino !== 'whatsapp';
  const secoes = [];

  secoes.push({ id: 'nomes', titulo: 'Nomes (campanha, conjunto e anúncio)', itens: [
    { rotulo: 'Campanha', valor: nomeC, copiar: true },
    ...conjuntos.map((k, i) => ({ rotulo: `Conjunto ${i + 1}`, valor: nomeConjunto(k, i), copiar: true })),
    ...conjuntos.flatMap((k) => (k.criativos || []).map((s) => doCriativo(s.criativoId)).filter(Boolean).map((c) => ({ rotulo: `Anúncio: ${c.nome}`, valor: nomeAnuncio(c), copiar: true }))),
    { rotulo: 'Padrão', valor: 'Campanha: CLIENTE | OBJETIVO | DESTINO | TESTE/ESCALA | MÊS. Conjunto: PÚBLICO | POSICIONAMENTO | ORÇAMENTO. Anúncio: CRIATIVO | FORMATO | GANCHO | VERSÃO. O mesmo padrão em todas as campanhas deixa o relatório legível.', copiar: false },
  ] });

  const url = txt(campanha.urlDestino);
  const utms = conjuntos.flatMap((k, i) => (k.criativos || []).map((s) => doCriativo(s.criativoId)).filter(Boolean).map((c) => {
    const u = site && url ? urlComUtms(url, { campanha: nomeC, conjunto: nomeConjunto(k, i), anuncio: nomeAnuncio(c) }) : null;
    return u ? { rotulo: `URL do anúncio "${c.nome}"`, valor: u, copiar: true } : null;
  })).filter(Boolean);
  secoes.push({ id: 'utm', titulo: 'UTMs por anúncio', itens: site ? [
    ...(url ? utms : [{ rotulo: 'URL de destino', valor: 'Preencha a URL de destino acima: as URLs com UTM de cada anúncio aparecem aqui.', copiar: false }]),
    { rotulo: 'Ou, no campo "Parâmetros de URL" de cada anúncio (o Meta preenche os nomes)', valor: UTM_DINAMICO, copiar: true },
  ] : [
    { rotulo: 'WhatsApp', valor: 'Anúncio de conversa não leva UTM. Para saber de qual anúncio veio cada conversa, use uma mensagem pré-preenchida diferente por anúncio (ex.: "Oi, vi o vídeo da rotina").', copiar: false },
  ] });

  secoes.push({ id: 'pixel', titulo: 'Pixel e conversão', itens: site ? [
    { rotulo: 'Pixel', valor: r.metaPixelId ? `Pixel ${r.metaPixelId} cadastrado. No Gerenciador de Eventos, use "Testar eventos" e faça uma compra de teste: o evento Compra (Purchase) precisa aparecer com o valor.` : 'Sem Pixel do Meta cadastrado: sem ele o Meta não vê a venda e não otimiza para compra. Instale antes de publicar.', copiar: false },
    { rotulo: 'Evento de otimização', valor: 'Compra (Purchase). Só use "Adicionar ao carrinho" se ainda não houver compras suficientes para o Meta aprender.', copiar: false },
  ] : [
    { rotulo: 'Conversão', valor: 'Objetivo com local de conversão "Apps de mensagem" (WhatsApp). O Meta conta conversas iniciadas; a venda fechada na conversa você registra na aba Resultados.', copiar: false },
    { rotulo: 'Número', valor: 'Confira se o WhatsApp Business ligado à página é o mesmo do atendimento e se a mensagem de boas-vindas está ativa.', copiar: false },
  ] });

  const remarketing = conjuntos.some((k) => REMARKETING.test(`${k.nome} ${k.publico?.nome || ''}`));
  secoes.push({ id: 'exclusoes', titulo: 'Exclusões de público', itens: [
    site && r.metaPixelId ? { rotulo: 'Compradores', valor: 'Exclua "Compradores dos últimos 180 dias" (público personalizado do Pixel, evento Compra) dos conjuntos de público frio.', copiar: false } : null,
    cliente.estagio === 'rodando' ? { rotulo: 'Clientes atuais', valor: 'Se tiver lista de clientes (e-mail/telefone), suba como público personalizado e exclua dos conjuntos de público novo.', copiar: false } : null,
    remarketing ? { rotulo: 'Remarketing', valor: 'Nos conjuntos de público quente, exclua só quem já comprou; não exclua os visitantes, que são o próprio público.', copiar: false } : null,
    { rotulo: 'Entre conjuntos', valor: 'Públicos de conjuntos diferentes não devem se sobrepor muito: use a ferramenta de sobreposição de públicos antes de publicar.', copiar: false },
  ].filter(Boolean) });

  const total = conjuntos.reduce((s, k) => s + (Number(k.orcamentoDiario) || 0), 0);
  secoes.push({ id: 'orcamento', titulo: 'Orçamento por conjunto', itens: [
    ...conjuntos.map((k, i) => ({ rotulo: nomeConjunto(k, i), valor: k.orcamentoDiario ? `${brl(k.orcamentoDiario)} por dia (orçamento do conjunto)` : 'a definir', copiar: false })),
    campanha.orcamentoDiario && total && Math.abs(total - campanha.orcamentoDiario) > 1 ? { rotulo: 'Atenção', valor: `Os conjuntos somam ${brl(total)}/dia e a campanha diz ${brl(campanha.orcamentoDiario)}/dia: acerte antes de publicar.`, copiar: false } : null,
  ].filter(Boolean) });

  secoes.push({ id: 'posicionamentos', titulo: 'Posicionamentos', itens: [
    { rotulo: 'Posicionamento', valor: 'Advantage+ (automático). Suba a versão 9:16 (Reels e Stories) e a 4:5 (Feed) de cada anúncio em "Personalizar mídia por posicionamento".', copiar: false },
    { rotulo: 'Zona segura', valor: 'Texto, preço e CTA longe das faixas de cima e de baixo do 9:16 (o Estúdio já confere).', copiar: false },
  ] });

  secoes.push({ id: 'programacao', titulo: 'Programação', itens: [
    { rotulo: 'Início', valor: inicioSugerido(hoje), copiar: true },
    { rotulo: 'Fim', valor: 'Sem data de término no teste. Revise em 3 dias (só olhar) e em 7 dias (decidir).', copiar: false },
  ] });

  const alvo = alvoCustoVenda(cliente);
  secoes.push({ id: 'nao-mexer', titulo: 'O que NÃO mexer nos primeiros dias', itens: [
    { rotulo: 'Aprendizado', valor: `Nos primeiros ${REGRAS_MINIMAS.diasAprendizado} dias, não edite público, posicionamento, criativo nem lance: cada edição grande reinicia o aprendizado.`, copiar: false },
    { rotulo: 'Orçamento', valor: 'Mudar no máximo ~20% por vez e com pelo menos 2 dias entre mudanças.', copiar: false },
    { rotulo: 'Pausar', valor: alvo ? `Não pause um anúncio antes de gastar ${brl(alvo.valor * REGRAS_MINIMAS.multiploPerdedor)} (2x o custo por venda alvo) sem vender.` : 'Não pause um anúncio antes de ele gastar 2x o custo por venda que o cliente aceita (preencha ticket e margem para o app calcular).', copiar: false },
    { rotulo: 'Duplicar', valor: 'Não duplique conjunto na primeira semana; duplique só o vencedor, depois de 7 dias e 10+ vendas.', copiar: false },
  ] });
  return secoes;
}

/** Texto inteiro para "Copiar tudo". */
export const textoChecklistPublicar = (secoes = [], nome = '') => `CHECKLIST PARA PUBLICAR${nome ? ` — ${nome}` : ''}\n\n` + secoes.map((s) => `${s.titulo.toUpperCase()}\n${s.itens.map((i) => `- ${i.rotulo}: ${i.valor}`).join('\n')}`).join('\n\n');
