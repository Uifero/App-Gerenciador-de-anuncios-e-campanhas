// "Montar site": os 6 passos da aba Site/Loja e o que falta em cada um. Puro (sem banco nem tela): só lê o dado que já
// existe (cliente, site, produtos com as fotos de "Usar em", materiais, links de aprovação). Nenhum passo é trancado:
// o status só diz o que falta, em linguagem simples, com a ação que resolve.
import { rastreamentoDe } from './rastreamento.js';
import { printsDoCliente, printsSemAutorizacao } from './visual-site.js';
import { linhasDeProva, provasEmImagem, ehModelo } from './prova-social.js';
import { temCustom, temPacote } from './site-modos.js';


export const ETAPAS = [
  { n: 1, id: 'informacoes', titulo: 'Informações', icone: 'clipboard-question', legenda: 'Questionário, perfil de marca e rastreamento' },
  { n: 2, id: 'materiais', titulo: 'Materiais', icone: 'images', legenda: 'Logo, fotos com "Usar em", prints de clientes e produtos' },
  { n: 3, id: 'como', titulo: 'Como quero', icone: 'pen-to-square', legenda: 'Plataforma, tema, "Como eu quero o site" e referência' },
  { n: 4, id: 'gerar', titulo: 'Gerar e ajustar', icone: 'wand-magic-sparkles', legenda: 'Gerar, ver a prévia, ajustar e versões' },
  { n: 5, id: 'aprovar', titulo: 'Aprovar', icone: 'circle-check', legenda: 'Link de aprovação para o cliente' },
  { n: 6, id: 'subir', titulo: 'Subir na plataforma', icone: 'upload', legenda: 'O que colocar onde, downloads e checklist final' },
];
export const STATUS_ETAPA = { completo: 'Completo', falta: 'Falta algo', opcional: 'Opcional' };

// ---------- plataforma e tema (um só lugar: o documento do site do cliente) ----------
export const PLATAFORMAS_SITE = [['shopify', 'Shopify'], ['nuvemshop', 'Nuvemshop'], ['custom', 'Site personalizado']];
export const TEMAS_SHOPIFY = [['horizon', 'Horizon'], ['dawn', 'Dawn'], ['outro', 'Outro']];
/**
 * Plataforma escolhida pelo operador: 'shopify' | 'nuvemshop' | 'custom' | null (ainda não escolhida). "Nuvemshop" que
 * o app antigo marcava sozinho ao escolher "pacote" não conta como escolha: só com `plataformaConfirmada` (passo 3 ou
 * pergunta 18). Shopify nunca era padrão, então é escolha da pessoa.
 */
export function plataformaDoSite(site) {
  if (!site?.modo) return null;
  if (site.modo === 'custom') return 'custom';
  if (site.plataforma === 'shopify') return 'shopify';
  return site.plataforma === 'nuvemshop' && site.plataformaConfirmada ? 'nuvemshop' : null;
}
/** Patch do site para a plataforma escolhida (o modo segue a plataforma). */
export function patchPlataforma(plataforma) {
  if (plataforma === 'custom') return { modo: 'custom', plataformaConfirmada: true };
  if (['shopify', 'nuvemshop'].includes(plataforma)) return { modo: 'pacote_plataforma', plataforma, plataformaConfirmada: true };
  return {};
}
export const nomeTema = (site) => {
  const t = String(site?.tema || '').trim();
  if (plataformaDoSite(site) === 'shopify') return (TEMAS_SHOPIFY.find(([k]) => k === t) || [, t])[1] || '';
  return t;
};

const cheio = (v) => Boolean(String(v ?? '').trim());
const falta = (texto, acao) => ({ texto, acao });

/**
 * Status de cada passo. ctx: { cliente, site, produtos (com as fotos de "Usar em": produtosComFotos), materiais,
 * etiquetaAprov (lib/aprovacao-site.js etiquetaSite) }. Devolve ETAPAS com { status, faltas: [{ texto, acao }], dicas }.
 * acao: { tipo: 'pergunta'|'etapa'|'rota'|'produto'|'novoProduto'|'materiais'|'ancora', alvo }.
 */
export function statusEtapas({ cliente = {}, site = null, produtos = [], materiais = [], etiquetaAprov = null } = {}) {
  const m = cliente.marca || {}, r = rastreamentoDe(cliente);
  const plat = plataformaDoSite(site);
  const modo = plat === 'custom' ? 'custom' : 'pacote';
  const prints = printsDoCliente(materiais);
  const semAut = printsSemAutorizacao(prints);
  const temLogo = Boolean(cliente.logoArquivo?.url || materiais.some((x) => x?.origem === 'logo' && x.url));
  const semPixel = !r.metaPixelId && !r.googleAdsId && !site?.semPixel;
  const semPreco = produtos.filter((p) => !(Number(p.preco) > 0));
  const semFoto = produtos.filter((p) => !(p.fotos || []).length);
  const gerado = plat ? (plat === 'custom' ? temCustom(site) : temPacote(site)) : false;
  const deps = (site?.conteudo?.depoimentos || []).concat(site?.pacote?.depoimentos || []);
  const soModelos = deps.length > 0 && deps.every(ehModelo) && !linhasDeProva(m.provasSociais).length && !provasEmImagem(materiais).length;

  const e = {};
  // 1. Informações
  const perfil = [['negocio', 'o que vende e para quem', 'negocio'], ['usp', 'o diferencial', 'usp'], ['tomDeVoz', 'o tom de voz', 'tom'], ['objecoes', 'as dúvidas/objeções dos clientes', 'objecoes'], ['linguagemDor', 'como o público fala do problema', 'linguagemDor']];
  e[1] = {
    faltas: [
      ...perfil.filter(([k]) => !cheio(m[k])).map(([, rot, id]) => falta(`Falta preencher ${rot} (perfil de marca).`, { tipo: 'pergunta', alvo: id })),
      semPixel && falta('Sem Pixel do Meta nem Google Ads: o site não vai medir as vendas dos anúncios. Cadastre, ou marque "ainda não tem".', { tipo: 'pergunta', alvo: 'pixel' }),
    ].filter(Boolean),
    dicas: [],
  };
  // 2. Materiais
  e[2] = {
    faltas: [
      !produtos.length && falta('Nenhum produto cadastrado: o site precisa de pelo menos um.', { tipo: 'novoProduto' }),
      ...semPreco.map((p) => falta(`"${p.nome}" está sem preço.`, { tipo: 'produto', alvo: p.id })),
      ...semFoto.map((p) => falta(`"${p.nome}" está sem foto: envie no produto ou ligue uma foto em "Usar em".`, { tipo: 'produto', alvo: p.id })),
      !temLogo && falta('Sem logo: envie o arquivo (PNG com fundo transparente é o melhor).', { tipo: 'ancora', alvo: 'logo' }),
      semAut.length && falta(`${semAut.length} print(s)/foto(s) de cliente sem borrar e sem autorização: borre nome, número e rosto, ou confirme a autorização.`, { tipo: 'ancora', alvo: 'prints' }),
    ].filter(Boolean),
    dicas: [!linhasDeProva(m.provasSociais).length && !provasEmImagem(materiais).length && 'Sem provas sociais: sem elas, os depoimentos do site saem como modelos para trocar.'].filter(Boolean),
  };
  // 3. Como quero
  e[3] = {
    faltas: [
      !plat && falta(site?.modo === 'pacote_plataforma' ? 'Confirme a plataforma da loja (Shopify ou Nuvemshop): o app não adivinha.' : 'Escolha a plataforma: Shopify, Nuvemshop ou site personalizado.', { tipo: 'ancora', alvo: 'plataforma' }),
      plat === 'shopify' && !cheio(site?.tema) && falta('Escolha o tema da Shopify (Horizon, Dawn ou outro): os caminhos do passo 6 dependem dele.', { tipo: 'ancora', alvo: 'plataforma' }),
    ].filter(Boolean),
    dicas: [!cheio(cliente.preferenciasSite?.texto) && 'Opcional: "Como eu quero o site" (ex.: "F3 no banner, fotos inteiras").', !cheio(cliente.siteReferencia) && 'Opcional: um site de referência de visual.'].filter(Boolean),
  };
  // 4. Gerar e ajustar
  e[4] = {
    faltas: [
      !plat && falta('Escolha a plataforma no passo 3 antes de gerar.', { tipo: 'etapa', alvo: 3 }),
      plat && !gerado && falta('O site ainda não foi gerado.', { tipo: 'ancora', alvo: 'gerar' }),
      site?.rascunhoAjuste?.modo === modo && falta('Há uma mudança proposta em "Ajustar este site" esperando "Aceitar" ou "Descartar".', { tipo: 'ancora', alvo: 'ajuste' }),
      gerado && soModelos && falta('Os depoimentos ainda são modelos: cadastre provas reais (passo 2) e gere de novo.', { tipo: 'etapa', alvo: 2 }),
    ].filter(Boolean),
    dicas: [...(site?.fotosTexto?.avisos || []), ...(site?.fotosTexto?.conflitos || [])],
  };
  // 5. Aprovar (opcional até existir link)
  const et = etiquetaAprov;
  e[5] = {
    faltas: [
      et?.tipo === 'ajuste' && falta(`${et.texto}: veja o pedido e ajuste no passo 4.`, { tipo: 'etapa', alvo: 4 }),
      et?.tipo === 'aguardando' && falta(`${et.texto}: aguardando a resposta do cliente.`, null),
      et && !['aprovado', 'ajuste', 'aguardando'].includes(et.tipo) && falta(`${et.texto}.`, null),
    ].filter(Boolean),
    dicas: [],
    opcional: !et,
  };
  // 6. Subir: checklist final
  const checklist = checklistFinal({ cliente, site, produtos, materiais, temLogo, semAut, semPixel, plat });
  e[6] = { faltas: checklist.filter((c) => !c.ok).map((c) => falta(c.falta, c.acao)), dicas: [], checklist };

  return ETAPAS.map((x) => {
    const s = e[x.n];
    const status = s.faltas.length ? 'falta' : s.opcional ? 'opcional' : 'completo';
    return { ...x, status, faltas: s.faltas, dicas: s.dicas, ...(s.checklist ? { checklist: s.checklist } : {}) };
  });
}

/** Checklist final do passo 6: logo, preços, foto principal, prints protegidos, Pixel, plataforma e publicado. */
export function checklistFinal({ cliente = {}, site = null, produtos = [], temLogo, semAut, semPixel, plat }) {
  return [
    { id: 'plataforma', texto: 'Plataforma escolhida', ok: Boolean(plat), falta: 'Escolha a plataforma no passo 3.', acao: { tipo: 'etapa', alvo: 3 } },
    { id: 'logo', texto: 'Logo enviado', ok: temLogo, falta: 'Falta o logo (passo 2).', acao: { tipo: 'etapa', alvo: 2 } },
    { id: 'precos', texto: 'Todos os produtos com preço', ok: produtos.length > 0 && produtos.every((p) => Number(p.preco) > 0), falta: 'Há produto sem preço (ou nenhum produto).', acao: { tipo: 'etapa', alvo: 2 } },
    { id: 'fotos', texto: 'Todos os produtos com foto principal', ok: produtos.length > 0 && produtos.every((p) => (p.fotos || []).length > 0), falta: 'Há produto sem foto principal.', acao: { tipo: 'etapa', alvo: 2 } },
    { id: 'prints', texto: 'Prints e fotos de clientes borrados ou autorizados', ok: !semAut.length, falta: 'Há print/foto de cliente sem borrar e sem autorização.', acao: { tipo: 'etapa', alvo: 2 } },
    { id: 'pixel', texto: 'Pixel do Meta ou Google Ads (ou marcado "ainda não tem")', ok: !semPixel, falta: 'Sem Pixel do Meta nem Google Ads.', acao: { tipo: 'etapa', alvo: 1 } },
    { id: 'publicado', texto: 'Loja no ar (endereço colado abaixo ou status "publicado")', ok: cheio(site?.linkPublicado) || site?.status === 'publicado', falta: 'Quando a loja estiver no ar, cole o endereço abaixo.', acao: { tipo: 'ancora', alvo: 'publicado' } },
  ];
}

/** Passo em que a aba abre: o primeiro com "Falta algo"; com tudo certo, o último. */
export const primeiraEtapaComFalta = (etapas) => (etapas.find((x) => x.status === 'falta') || etapas[etapas.length - 1]).n;

/** Rotas antigas da área do site -> o fluxo "Montar site". null = não é rota antiga. */
export function redirecionarRotaAntiga(id, aba) {
  if (aba === 'aprovacoes' || aba === 'aprovacoes-site') return `#/c/${id}/site/5`;
  if (aba === 'sites') return `#/c/${id}/site`;
  return null;
}
