// Questionário único do cliente (site + criativos): 18 perguntas com ids ESTÁVEIS (nunca renumerar nem renomear:
// respostas antigas e o texto já enviado ao cliente dependem deles). Tudo aqui é puro (sem banco, sem IA):
//  - PERGUNTAS: texto para o operador, texto leigo para o cliente, e para onde vai cada resposta;
//  - textoParaCliente: o texto do botão "Copiar perguntas para enviar ao cliente";
//  - lerRespostaLocal: separa a resposta colada pela numeração (sem IA e sem custo);
//  - protegerSensivel: mascara senha/token/chave/cartão ANTES de guardar ou mandar para a IA;
//  - interpretar: transforma o trecho de cada pergunta no valor do campo (pixel, pagamento, números...);
//  - planoDeRevisao: uma linha por pergunta, com o estado "campo vazio / valor diferente (sugestão) / sem resposta".
// Regra herdada da leitura de site/prints: só preenche campo VAZIO; valor diferente vira sugestão, nunca sobrescreve.
import { normalizarRastreamento, rastreamentoDe } from './rastreamento.js';

export const PAGAMENTOS_PRETENDIDOS = [['mercado_pago', 'Mercado Pago'], ['shopify', 'Shopify'], ['stripe', 'Stripe'], ['nativa', 'Nativa da plataforma (Nuvemshop/Shopify)'], ['nao_sei', 'Ainda não sabe']];
/** Resposta de "loja completa ou site simples" -> modo do site + plataforma. */
export const FORMATOS_SITE = [['custom', 'Site simples que eu hospedo', { modo: 'custom', plataforma: null }], ['nuvemshop', 'Loja completa na Nuvemshop', { modo: 'pacote_plataforma', plataforma: 'nuvemshop' }], ['shopify', 'Loja completa na Shopify', { modo: 'pacote_plataforma', plataforma: 'shopify' }]];
export const formatoAtual = (site) => (!site?.modo ? '' : site.modo === 'custom' ? 'custom' : site.plataforma === 'shopify' ? 'shopify' : 'nuvemshop');

export const BLOCOS_Q = [['negocio', 'Sobre o negócio'], ['produtos', 'Produtos'], ['provas', 'Provas e referências'], ['anuncios', 'Anúncios e vendas']];

/**
 * id (estável) · n (número mostrado e usado na numeração do texto) · bloco · titulo (painel) · cliente (texto leigo) ·
 * destino (onde a resposta vai, em palavras) · tipo (como interpretar) · campo (marca.<x> quando é texto do perfil).
 */
export const PERGUNTAS = [
  { id: 'negocio', n: 1, bloco: 'negocio', tipo: 'texto', campo: 'negocio', titulo: 'O que vende e para quem?', destino: 'perfil de marca → o que vende e para quem',
    cliente: 'O que você vende e para quem? (ex.: "roupas de academia para mulheres de 25 a 45 anos")' },
  { id: 'usp', n: 2, bloco: 'negocio', tipo: 'texto', campo: 'usp', titulo: 'Qual é o diferencial do seu produto/loja?', destino: 'perfil de marca → diferencial (USP)',
    cliente: 'O que faz o seu produto ou a sua loja ser diferente dos concorrentes?' },
  { id: 'tom', n: 3, bloco: 'negocio', tipo: 'texto', campo: 'tomDeVoz', titulo: 'Como você descreveria o tom da sua marca? (descontraído, premium, técnico…)', destino: 'perfil de marca → tom de voz',
    cliente: 'Como é o jeito da sua marca falar? (ex.: descontraído, sério, acolhedor, divertido)' },
  { id: 'objecoes', n: 4, bloco: 'negocio', tipo: 'texto', campo: 'objecoes', titulo: 'Quais dúvidas ou objeções os clientes mais têm antes de comprar?', destino: 'perfil de marca → objeções (vira a seção "Perguntas frequentes" do site)',
    cliente: 'Quais dúvidas as pessoas mais têm antes de comprar de você?' },
  { id: 'linguagemDor', n: 5, bloco: 'negocio', tipo: 'texto', campo: 'linguagemDor', titulo: 'Com que palavras o cliente fala do problema que o produto resolve?', destino: 'perfil de marca → como o público descreve a própria dor',
    cliente: 'Com que palavras os seus clientes costumam contar o problema que o seu produto resolve? (do jeito que eles falam)' },
  { id: 'termosProibidos', n: 6, bloco: 'negocio', tipo: 'texto', campo: 'termosProibidos', titulo: 'O que NÃO pode ser dito nos anúncios?', destino: 'perfil de marca → termos proibidos',
    cliente: 'Tem alguma coisa que NÃO pode ser dita nos anúncios? (palavras proibidas, promessas que você não pode fazer)' },
  { id: 'produtos', n: 7, bloco: 'produtos', tipo: 'produtos', titulo: 'Quais produtos você quer no site?', destino: 'aba Produtos (nome, descrição, preço, variações)',
    cliente: 'Quais produtos você quer vender? Para cada um: nome, uma descrição curta, preço e variações (cor, tamanho), um produto por linha.' },
  { id: 'materiais', n: 8, bloco: 'produtos', tipo: 'texto', campo: 'materiaisOriginais', titulo: 'Tem fotos e vídeos originais dos produtos?', destino: 'perfil de marca → link das fotos e vídeos (os arquivos entram em Materiais do cliente, no Estúdio)',
    cliente: 'Você tem fotos e vídeos originais dos produtos? Envie por Google Drive ou WeTransfer (pelo WhatsApp a qualidade cai) e mande só o link aqui.' },
  { id: 'logo', n: 9, bloco: 'produtos', tipo: 'texto', campo: 'logo', titulo: 'Tem o logo em PNG?', destino: 'perfil de marca → logo (o arquivo entra em Materiais do cliente)',
    cliente: 'Tem o logo da marca em PNG (de preferência com fundo transparente)? Mande junto com as fotos, pelo mesmo link.' },
  { id: 'provas', n: 10, bloco: 'provas', tipo: 'texto', campo: 'provasSociais', titulo: 'Tem depoimentos, avaliações ou números para mostrar?', destino: 'perfil de marca → provas sociais',
    cliente: 'Tem depoimentos de clientes, avaliações ou números para mostrar? (ex.: "500 clientes atendidos", "nota 4,9")' },
  { id: 'presenca', n: 11, bloco: 'provas', tipo: 'links', titulo: 'O cliente já tem site ou Instagram?', destino: 'leitura do site (botão "Ler o site e preencher o perfil") e prints do Instagram (envio manual)',
    cliente: 'Você já tem site ou Instagram? Mande o endereço. Do Instagram, se puder, mande prints da bio e de alguns posts.' },
  { id: 'referencia', n: 12, bloco: 'provas', tipo: 'url', titulo: 'Tem algum site que gosta como referência de visual?', destino: 'cadastro do cliente → site de referência',
    cliente: 'Tem algum site que você acha bonito e gostaria de usar como referência?' },
  { id: 'anuncios', n: 13, bloco: 'anuncios', tipo: 'anuncios', titulo: 'Já anuncia? Quanto investe por dia e quanto custa cada venda?', destino: 'cadastro do cliente → estágio "rodando", orçamento diário e CPA médio',
    cliente: 'Você já faz anúncios pagos? Se sim, quanto investe por dia e quanto custa, em média, cada venda?' },
  { id: 'publicoCompra', n: 14, bloco: 'anuncios', tipo: 'texto', campo: 'publicoCompra', titulo: 'Quem mais compra hoje?', destino: 'perfil de marca → quem mais compra',
    cliente: 'Quem mais compra de você hoje? (idade, perfil, cidade, o que você souber)' },
  { id: 'oferta', n: 15, bloco: 'anuncios', tipo: 'texto', campo: 'ofertaAtiva', titulo: 'Tem promoção ou oferta ativa agora?', destino: 'perfil de marca → oferta ativa',
    cliente: 'Tem alguma promoção ou oferta valendo agora? (ex.: frete grátis, desconto, brinde)' },
  { id: 'pixel', n: 16, bloco: 'anuncios', tipo: 'pixel', titulo: 'Você já tem Pixel do Meta ou conversão do Google Ads configurados?', destino: 'cadastro do cliente → Rastreamento (entra sozinho no site gerado)',
    cliente: 'Você já tem o Pixel do Meta ou a conversão do Google Ads? (o Pixel é um código que avisa o Facebook e o Instagram quando alguém compra no seu site). Se tiver, mande só os números de identificação (ID). Se preferir, me convide como administrador pelo Gerenciador de Negócios do Meta. Nunca mande login nem senha.' },
  { id: 'pagamento', n: 17, bloco: 'anuncios', tipo: 'pagamento', titulo: 'Qual plataforma de pagamento você pretende usar?', destino: 'só informativo: o manual de entrega mostra primeiro o passo a passo dessa opção',
    cliente: 'Como você quer receber os pagamentos? (ex.: Mercado Pago, Stripe, Shopify, a própria plataforma da loja, ou ainda não sei)' },
  { id: 'formato', n: 18, bloco: 'anuncios', tipo: 'formato', titulo: 'Prefere loja completa numa plataforma pronta (Nuvemshop/Shopify) ou um site simples que eu hospedo?', destino: 'modo do site deste cliente (site personalizado ou pacote de plataforma)',
    cliente: 'Prefere uma loja completa numa plataforma pronta (Nuvemshop ou Shopify, com mensalidade) ou um site mais simples que eu monto e publico para você?' },
];
export const TOTAL_PERGUNTAS = PERGUNTAS.length;
export const perguntaPorId = (id) => PERGUNTAS.find((p) => p.id === id);
export const perguntaPorNumero = (n) => PERGUNTAS.find((p) => p.n === Number(n));

const cheio = (v) => Boolean(String(v ?? '').trim());

/** Quais perguntas já têm resposta no dado real (cadastro, perfil, produtos, site). ctx.materiais = nº de materiais. */
export function respondidas(cliente, site, produtos = [], materiais = 0) {
  const m = cliente?.marca || {}; const r = rastreamentoDe(cliente); const h = cliente?.historico || {};
  return {
    negocio: cheio(m.negocio), usp: cheio(m.usp), tom: cheio(m.tomDeVoz), objecoes: cheio(m.objecoes), linguagemDor: cheio(m.linguagemDor), termosProibidos: cheio(m.termosProibidos),
    produtos: produtos.length > 0, materiais: cheio(m.materiaisOriginais) || materiais > 0, logo: cheio(m.logo),
    provas: cheio(m.provasSociais), presenca: cheio(cliente?.leituraSite?.url) || Boolean(cliente?.leituraInstagram), referencia: cheio(cliente?.siteReferencia),
    anuncios: cliente?.estagio === 'rodando' || m.jaAnuncia === 'nao', publicoCompra: cheio(m.publicoCompra) || cheio(h.publicos), oferta: cheio(m.ofertaAtiva),
    pixel: Boolean(r.metaPixelId || r.googleAdsId || site?.semPixel), pagamento: cheio(site?.pagamentoPreferido), formato: Boolean(site?.modo),
  };
}
export const progresso = (...a) => Object.values(respondidas(...a)).filter(Boolean).length;

// ---------- texto para o cliente ----------
export const ABERTURA = 'Para montar seu site e seus anúncios, preciso de algumas informações. Responda do seu jeito, pode ser por texto. O que não souber, deixe em branco.';
export const FECHO = 'Responda mantendo os números das perguntas. O que não souber, pode deixar em branco.';

/**
 * Texto pronto para WhatsApp/e-mail. modo 'todas' | 'faltam' (pula o que já está preenchido). A numeração é SEMPRE a
 * original (1 a 18), mesmo pulando perguntas: é ela que a leitura local usa para saber o que é resposta de quê.
 * `nomeContato` = como cumprimentar (padrão: o nome do cliente cadastrado).
 */
export function textoParaCliente({ cliente, site, produtos = [], materiais = 0, modo = 'todas', nomeContato = '' }) {
  const feitas = respondidas(cliente, site, produtos, materiais);
  const lista = PERGUNTAS.filter((p) => modo !== 'faltam' || !feitas[p.id]);
  const nome = nomeContato || cliente?.nome || '';
  const partes = [`Olá${nome ? `, ${nome}` : ''}! Tudo bem?`, '', ABERTURA];
  for (const [b, titulo] of BLOCOS_Q) {
    const doBloco = lista.filter((p) => p.bloco === b);
    if (!doBloco.length) continue;
    partes.push('', `*${titulo.toUpperCase()}*`, ...doBloco.map((p) => `${p.n}. ${p.cliente}`));
  }
  if (!lista.length) partes.push('', '(Já tenho todas as informações. Obrigado!)');
  partes.push('', FECHO);
  return { texto: partes.join('\n'), quantidade: lista.length };
}

// ---------- dado sensível ----------
const luhn = (d) => { let s = 0; for (let i = 0; i < d.length; i++) { let n = Number(d[d.length - 1 - i]); if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; };
const MASCARA = '•••••';
/**
 * Mascara o que parece senha, token/chave de API ou número de cartão. Devolve { texto, achados: ['senha'|'token'|'cartão'] }.
 * Links (Drive, site) ficam intactos. ID de Pixel (15-16 dígitos colados, sem "cartão" por perto) não é confundido com cartão.
 */
export function protegerSensivel(texto) {
  const achados = new Set();
  const urls = [];
  let t = String(texto || '').replace(/https?:\/\/\S+|www\.\S+/gi, (u) => { urls.push(u); return `\u0000${urls.length - 1}\u0000`; });
  // Valor depois de "é", ":" ou "="; sem esses sinais, só se o valor tiver número (evita "não mando senha nenhuma").
  t = t.replace(/\b(senha|password|passwd|pwd)\b((?:\s+(?:do|da|de|dele|dela)\s+[\wÀ-ú]{1,15})?)\s*(?:(?:é|eh|:|=)\s*(\S{3,})|\s+(?=\S*\d)(\S{4,}))/gi, (all, rot, meio = '') => { achados.add('senha'); return `${rot}${meio}: ${MASCARA}`; });
  t = t.replace(/\b(token|chave(?:\s+de\s+api|\s+secreta)?|api[ _-]?key|access[ _-]?token|c[oó]digo\s+de\s+(?:acesso|verifica[cç][aã]o|seguran[cç]a)|cvv|cvc)\b\s*(?:(?:é|eh|:|=)\s*([A-Za-z0-9_\-.]{3,})|\s+(?=\S*\d)([A-Za-z0-9_\-.]{3,}))/gi, (all, rot) => { achados.add('token'); return `${rot}: ${MASCARA}`; });
  t = t.replace(/\b(sk-[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9]{10,}|EAA[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, () => { achados.add('token'); return MASCARA; });
  t = t.replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, () => { achados.add('token'); return MASCARA; });
  t = t.replace(/(\S*.{0,25})?\b(\d(?:[ .-]?\d){12,18})\b/g, (all, antes = '', num) => {
    const d = num.replace(/\D/g, '');
    const separado = /[ .-]/.test(num);
    const contexto = /cart|card|cr[eé]dito|d[eé]bito/i.test(antes);
    if (d.length < 13 || d.length > 19 || !luhn(d) || (!separado && !contexto)) return all;
    achados.add('cartão'); return `${antes}${MASCARA}`;
  });
  t = t.replace(/\u0000(\d+)\u0000/g, (a, i) => urls[Number(i)]);
  return { texto: t, achados: [...achados] };
}
export const AVISO_SENSIVEL = 'Encontrei o que parece uma senha ou dado sensível. Não foi salvo. Peça ao cliente para nunca enviar isso por mensagem';

// ---------- leitura local por numeração ----------
export const LIMITE_TEXTO = 20000;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const VAZIAS = new Set(['', '-', '--', '.', 'x', 'n/a', 'na', 'nada', 'nao sei', 'não sei', 'sem resposta', '?', 'em branco', 'ok']);
const semResposta = (s) => VAZIAS.has(norm(s).replace(/[.!]+$/, ''));

/** Tira do começo da resposta a pergunta copiada de volta (o cliente costuma responder embaixo da própria pergunta). */
function tirarPergunta(p, trecho) {
  let t = String(trecho || '').trim();
  const q = norm(p.cliente);
  const [primeira, ...resto] = t.split('\n');
  if (q && norm(primeira).startsWith(q.slice(0, Math.min(35, q.length)))) {
    // Pergunta copiada inteira: corta ela; se a linha era só a pergunta (com o exemplo), descarta a linha toda.
    t = t.startsWith(p.cliente) ? t.slice(p.cliente.length) : norm(primeira).length <= q.length + 3 ? resto.join('\n') : primeira.slice(p.cliente.length) + '\n' + resto.join('\n');
    t = t.replace(/^[\s)\].:–-]+/, '');
  }
  return t.replace(/^\*[^*\n]+\*\s*$/gm, '').trim(); // títulos de bloco (*SOBRE O NEGÓCIO*)
}

/**
 * Separa pelo número no começo da linha ("1.", "2)", "3 -", "4:", "Pergunta 5:", "5º"). Considera numerada quando acha
 * pelo menos 2 números válidos (1 a 18) em ordem crescente. Devolve { numerada, respostas: { id: trecho } }.
 */
export function lerRespostaLocal(texto) {
  const t = String(texto || '').replace(/\r\n/g, '\n');
  const re = /^[ \t>*_-]*(?:pergunta\s*)?(\d{1,2})\s*(?:[.):\-–º°]|\s-\s)\s*/gim;
  const marcas = [];
  let m;
  while ((m = re.exec(t))) { const n = Number(m[1]); if (n >= 1 && n <= TOTAL_PERGUNTAS) marcas.push({ n, ini: m.index, fimMarca: m.index + m[0].length }); }
  // Só a sequência crescente (um "3 camisetas" no meio de uma resposta não vira pergunta 3 se vier depois da 7).
  const seq = [];
  for (const mk of marcas) if (!seq.length || mk.n > seq[seq.length - 1].n) seq.push(mk);
  if (seq.length < 2) return { numerada: false, respostas: {} };
  const respostas = {};
  seq.forEach((mk, i) => {
    const p = perguntaPorNumero(mk.n);
    const bruto = t.slice(mk.fimMarca, i + 1 < seq.length ? seq[i + 1].ini : t.length);
    const limpo = tirarPergunta(p, bruto).replace(new RegExp(`\\n?\\s*${FECHO.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*$`), '').trim();
    if (!semResposta(limpo)) respostas[p.id] = limpo;
  });
  return { numerada: true, respostas };
}

// ---------- interpretação (sem IA) ----------
const numero = (s) => { const v = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };
const RE_PRECO = /R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)\b/i;

/** Produtos, um por linha: "Nome - descrição - R$ 99 - tamanhos P, M, G". Preço só se vier escrito (nunca inventado). */
export function produtosLocais(texto) {
  return String(texto || '').split(/\n|;/).map((l) => l.replace(/^[\s•*·-]+|\s+$/g, '').replace(/^\d+[.)]\s*/, '')).filter((l) => l.length > 1).slice(0, 40).map((l) => {
    const pm = RE_PRECO.exec(l);
    const preco = pm ? numero(pm[1] || pm[2]) : null;
    let resto = pm ? l.replace(pm[0], ' ') : l;
    const variacoes = [];
    resto = resto.replace(/\b(tamanhos?|cor(?:es)?|sabor(?:es)?|modelos?)\s*:?\s*([^;\n|–-]+)/gi, (all, nome, vals) => {
      const valores = vals.split(/,|\/|\be\b/).map((v) => v.trim()).filter(Boolean).slice(0, 20);
      if (valores.length) variacoes.push({ nome: nome.toLowerCase().startsWith('cor') ? 'Cor' : nome.toLowerCase().startsWith('tam') ? 'Tamanho' : nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase(), valores });
      return ' ';
    });
    const partes = resto.split(/\s[-–|]\s|:\s|,\s/).map((x) => x.trim()).filter(Boolean);
    return { nome: (partes[0] || l).slice(0, 120), descricao: partes.slice(1).join(', ').slice(0, 500), preco, variacoes };
  }).filter((p) => p.nome);
}

/** Valor "entendido" a partir do trecho de uma pergunta, por tipo. */
export function interpretar(p, trecho) {
  const t = String(trecho || '').trim();
  if (!t) return null;
  switch (p.tipo) {
    case 'texto': return t.slice(0, 3000);
    case 'produtos': return produtosLocais(t);
    case 'url': { const u = /https?:\/\/\S+|www\.\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|com\.br|net|br|store|shop|org)(?:\/\S*)?/i.exec(t); return u ? (u[0].startsWith('http') ? u[0] : `https://${u[0]}`).replace(/[).,]+$/, '') : t.slice(0, 300); }
    case 'links': {
      const site = (/https?:\/\/(?!(?:www\.)?instagram\.com)\S+|www\.(?!instagram)\S+/i.exec(t) || [])[0] || '';
      const insta = (/instagram\.com\/([\w.]+)|@([\w.]{2,30})/i.exec(t) || []).slice(1).find(Boolean) || '';
      return { site: site.replace(/[).,]+$/, ''), instagram: insta ? `@${insta}` : '' };
    }
    case 'anuncios': {
      const n = norm(t);
      if (/\b(nao|nunca)\b.{0,25}anunc|ainda nao|^nao\b/.test(n)) return { anuncia: false, orcamentoDiario: null, cpaMedio: null };
      const dia = /(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(?:reais\s*)?(?:por|ao|\/)\s*dia|dia(?:rio)?\D{0,15}(\d+(?:[.,]\d+)?)/.exec(n);
      const venda = /(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(?:reais\s*)?(?:por|cada)\s*venda|(?:cpa|custo por venda|cada venda|venda sai)\D{0,20}(\d+(?:[.,]\d+)?)/.exec(n);
      return { anuncia: true, orcamentoDiario: dia ? numero(dia[1] || dia[2]) : null, cpaMedio: venda ? numero(venda[1] || venda[2]) : null };
    }
    case 'pixel': {
      if (/\b(nao|nunca)\b.{0,15}(tenho|tem|sei|uso|configur)/.test(norm(t)) && !/\d{8,}/.test(t)) return { semPixel: true };
      const meta = (/\b\d{8,20}\b/.exec(t) || [])[0] || '';
      const google = (/\bAW-\d{6,15}(?:\/[\w-]+)?/i.exec(t) || [])[0] || '';
      if (!meta && !google) return { invalido: t.slice(0, 120) };
      return { metaPixelId: meta, googleAdsId: google };
    }
    case 'pagamento': {
      const n = norm(t);
      if (/mercado ?pago/.test(n)) return 'mercado_pago';
      if (/stripe/.test(n)) return 'stripe';
      if (/nuvem ?(pago|shop)|propria plataforma|da plataforma|nativ/.test(n)) return 'nativa';
      if (/shopify/.test(n)) return 'shopify';
      if (/nao sei|ainda nao|tanto faz|indecis/.test(n)) return 'nao_sei';
      return null;
    }
    case 'formato': {
      const n = norm(t);
      if (/nuvem ?shop/.test(n)) return 'nuvemshop';
      if (/shopify/.test(n)) return 'shopify';
      if (/simples|voce (monta|hosped|publica)|site (mais )?simples|custom|personaliz/.test(n)) return 'custom';
      return null;
    }
    default: return t;
  }
}

/** "129,90", "1.299,90", "129.90" ou "129.9" -> número. Com vírgula, o ponto é separador de milhar; sem vírgula, é decimal. */
export const precoDigitado = (t) => {
  const s = String(t || '').replace(/[^\d.,]/g, '');
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ---------- revisão ----------
const txtCampo = (v) => String(v ?? '').trim();
/**
 * Uma linha por pergunta: { pergunta, escrito, entendido, estado, atual, motivo }.
 * estado: 'vazio' (será preenchido) | 'conflito' (já existe valor diferente: vira sugestão) | 'igual' (já está assim)
 *       | 'invalido' (formato errado, não salva) | 'manual' (só orienta, ex.: link de site) | 'sem_resposta'.
 */
export function planoDeRevisao({ cliente, site, produtos = [] }, respostas = {}, entendidos = {}) {
  const m = cliente?.marca || {}; const r = rastreamentoDe(cliente);
  return PERGUNTAS.map((p) => {
    const escrito = respostas[p.id] || '';
    const entendido = p.id in entendidos ? entendidos[p.id] : interpretar(p, escrito);
    const linha = { pergunta: p, escrito, entendido, estado: 'sem_resposta', atual: '', motivo: '' };
    if (!escrito || entendido == null || (Array.isArray(entendido) && !entendido.length)) return linha;
    const compara = (atual, novo) => { linha.atual = atual; linha.estado = !txtCampo(atual) ? 'vazio' : norm(atual) === norm(novo) ? 'igual' : 'conflito'; };
    switch (p.tipo) {
      case 'texto': compara(m[p.campo], entendido); break;
      case 'url': compara(cliente?.siteReferencia, entendido); break;
      case 'produtos': {
        const nomes = new Set(produtos.map((x) => norm(x.nome)));
        const novos = entendido.filter((x) => !nomes.has(norm(x.nome)));
        linha.atual = produtos.length ? `${produtos.length} produto(s) já cadastrado(s)` : '';
        linha.estado = novos.length ? 'vazio' : 'igual';
        linha.motivo = novos.length < entendido.length ? `${entendido.length - novos.length} produto(s) com o mesmo nome já existem e não serão duplicados.` : '';
        break;
      }
      case 'links': linha.estado = 'manual'; linha.motivo = 'O app não lê o site sozinho: confira o endereço e clique em "Ler o site e preencher o perfil". Os prints do Instagram continuam sendo enviados à mão.'; break;
      case 'anuncios': {
        const antes = cliente?.estagio === 'rodando' ? `anuncia · R$ ${cliente.historico?.orcamentoDiario || '?'} por dia · CPA R$ ${cliente.historico?.cpaMedio || '?'}` : m.jaAnuncia === 'nao' ? 'não anuncia' : '';
        const depois = entendido.anuncia ? `anuncia · R$ ${entendido.orcamentoDiario || '?'} por dia · CPA R$ ${entendido.cpaMedio || '?'}` : 'não anuncia';
        compara(antes, depois); break;
      }
      case 'pixel': {
        if (entendido.semPixel) { linha.estado = r.metaPixelId || r.googleAdsId ? 'conflito' : 'vazio'; linha.atual = [r.metaPixelId, r.googleAdsId].filter(Boolean).join(' / '); break; }
        if (entendido.invalido) { linha.estado = 'invalido'; linha.motivo = 'Não achei um ID de Pixel (só números, ex.: 123456789012345) nem de Google Ads (AW-123456789). Nada foi salvo: peça ao cliente o número certo.'; break; }
        const { erros, valor } = normalizarRastreamento({ metaPixelId: entendido.metaPixelId, googleAdsId: entendido.googleAdsId });
        if (erros.length) { linha.estado = 'invalido'; linha.motivo = `${erros.join(' ')} Esse valor não será salvo.`; break; }
        const novo = [valor.metaPixelId, valor.googleAdsId && [valor.googleAdsId, valor.googleAdsRotulo].filter(Boolean).join('/')].filter(Boolean).join(' / ');
        compara([r.metaPixelId, r.googleAdsId && [r.googleAdsId, r.googleAdsRotulo].filter(Boolean).join('/')].filter(Boolean).join(' / '), novo); break;
      }
      case 'pagamento': compara(site?.pagamentoPreferido, entendido); break;
      case 'formato': compara(formatoAtual(site), entendido); break;
      default: break;
    }
    return linha;
  });
}

/** Texto curto do valor (painel de revisão e sugestões). */
export function mostrarValor(p, v) {
  if (v == null || v === '') return '';
  if (p.tipo === 'produtos') return v.map((x) => `${x.nome}${x.preco ? ` (R$ ${x.preco})` : ' (sem preço)'}`).join('; ');
  if (p.tipo === 'anuncios') return v.anuncia ? `anuncia · R$ ${v.orcamentoDiario || '?'} por dia · CPA R$ ${v.cpaMedio || '?'}` : 'não anuncia';
  if (p.tipo === 'pixel') return v.semPixel ? 'ainda não tem' : [v.metaPixelId && `Meta ${v.metaPixelId}`, v.googleAdsId && `Google ${v.googleAdsId}`].filter(Boolean).join(' · ');
  if (p.tipo === 'pagamento') return (PAGAMENTOS_PRETENDIDOS.find(([k]) => k === v) || [, v])[1];
  if (p.tipo === 'formato') return (FORMATOS_SITE.find(([k]) => k === v) || [, v])[1];
  if (p.tipo === 'links') return [v.site, v.instagram].filter(Boolean).join(' · ');
  return String(v);
}
