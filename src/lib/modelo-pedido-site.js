// Modelo pronto do "Como eu quero o site" (botões "Usar modelo" e "Copiar modelo" do passo 3 de "Montar site").
// Mudou o texto do modelo? É só aqui. Títulos em MAIÚSCULAS terminando em ":" viram seções (lib/fotos-site.js
// tituloDaLinha); linha que ainda tem "[...]" do modelo é ignorada pela leitura sem IA e não vai para a IA.

export const MODELO_PEDIDO_SITE = `VISÃO GERAL:
Loja: [nome da loja]
Produto principal: [nome do produto]
Público: [quem compra, ex: mulheres de 30 a 50 anos que ...]
Tom do site: [ex: próximo e simples, sem exagero]
Cores: [ex: seguir o logo / verde escuro e bege]
Site de referência: [link] (gosto de: [o que gosta nele])

BANNER:
Fotos: [F1, F2, F3] no banner, nessa ordem
Frase principal: [texto]
Frase de apoio: [texto ou "a IA sugere"]
Botão: [ex: Comprar agora]

PÁGINA DO PRODUTO:
Foto principal: [F10]
Galeria: [F11, F12, F13, F14] na galeria do produto, nessa ordem
Título: [nome como deve aparecer]
Preço: [de R$ ... por R$ ...]
Kits ou ofertas: [ex: 1 pote R$ ..., 3 potes R$ ...]
Benefícios: [um por linha, só o que for verdade e puder ser comprovado]
Como usar: [modo de uso]
Composição ou especificações: [texto ou "usar o rótulo F15"]

DEPOIMENTOS:
Prints: [F20, F21, F22] nos depoimentos, nessa ordem
Observação: [ex: borrar nome e foto das pessoas]

SOBRE A MARCA:
Foto: [F30] na seção sobre
Texto: [história curta da marca ou "a IA sugere a partir das informações"]

PERGUNTAS FREQUENTES:
[pergunta] | [resposta]
[pergunta] | [resposta]

FRETE E PAGAMENTO:
Frete grátis: [a partir de R$ ... ou "não tem"]
Prazo de entrega: [ex: 5 a 12 dias úteis]
Pagamento: [ex: Pix com 5% de desconto, cartão em até 12x]

CARRINHO:
[ex: mostrar resumo do pedido, selos de compra segura, oferta de kit maior]

RODAPÉ:
CNPJ: [número]
Contato: [WhatsApp, e-mail]
Políticas: [trocas, privacidade, frete; "a IA monta o modelo" se ainda não tiver]

NÃO QUERO NO SITE:
[ex: contador de estoque falso, pop-up ao entrar, cara de template]`;

const RE_COLCHETE = /\[[^\]\n]*\]/g;
const chave = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
// Os "[...]" do modelo, exatamente como estão nele (sem diferença de maiúscula e espaço).
const DO_MODELO = new Set((MODELO_PEDIDO_SITE.match(RE_COLCHETE) || []).map(chave));
/** "[...]" que ainda é do modelo: um dos colchetes do modelo, ou com "..."/"ex:" dentro (o operador copiou o jeito). */
export const ehMarcador = (s) => DO_MODELO.has(chave(s)) || /\.\.\.|…|^\[\s*ex\s*:/i.test(String(s));
// O que sobra de cada linha do modelo sem os colchetes ("Fotos: no banner, nessa ordem"): sobrou só isso = linha não preenchida.
const resto = (l) => chave(l.replace(RE_COLCHETE, ' ')).replace(/[^a-z0-9à-ú]+/g, ' ').trim();
const RESTOS_MODELO = new Set(MODELO_PEDIDO_SITE.split('\n').filter((l) => l.includes('[')).map(resto));

/**
 * Uma linha do texto do operador: { linha, ignorada }. Linha que ainda é só do modelo (ex.: "Preço: [de R$ ... por R$ ...]")
 * fica vazia e `ignorada`; linha preenchida em parte perde só os colchetes do modelo ("Site: x.com (gosto de: [..])" →
 * "Site: x.com"). Colchete que não é do modelo ("[F4, F5]") fica.
 */
export function limparLinhaModelo(linha) {
  const l = String(linha ?? '');
  const marcas = (l.match(RE_COLCHETE) || []).filter(ehMarcador);
  if (!marcas.length) return { linha: l, ignorada: false };
  let limpa = l;
  for (const m of marcas) limpa = limpa.replace(m, ' ');
  const r = resto(limpa);
  if (!r || RESTOS_MODELO.has(r)) return { linha: '', ignorada: true };
  limpa = limpa.replace(/\(\s*[^()]{0,30}:\s*\)/g, ' ').replace(/\(\s*\)/g, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;)])/g, '$1').replace(/[\s,;|]+$/, '');
  return { linha: limpa, ignorada: false };
}

/** Linhas do texto já sem o que ainda é do modelo (mesma quantidade de linhas: a posição de cada uma não muda). */
export const linhasSemModelo = (texto) => String(texto ?? '').replace(/\r\n?/g, '\n').split('\n').map(limparLinhaModelo);
/** O texto sem as linhas do modelo que não foram preenchidas (é o que a leitura sem IA e a IA recebem). */
export const limparModelo = (texto) => linhasSemModelo(texto).map((x) => x.linha).join('\n');

/** Título do modelo: linha só em MAIÚSCULAS terminando em ":" ("PÁGINA DO PRODUTO:"). Devolve o título ou null. */
export function tituloMaiusculo(linha) {
  const m = /^\s*([^\s:a-zà-ÿ][^:a-zà-ÿ]{0,58}?)\s*:\s*$/.exec(String(linha ?? ''));
  if (!m || !/[A-ZÀ-Þ]/.test(m[1]) || /\bF\d/.test(m[1])) return null;
  return m[1].trim();
}

const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const ehTituloFaq = (titulo) => /pergunta|faq|duvida/.test(sem(titulo));
/**
 * Pares de pergunta frequente "pergunta | resposta" do texto de uma seção: [{ p, r }]. Na seção de perguntas
 * frequentes vale qualquer linha com "|"; fora dela, só quando o lado da pergunta termina em "?".
 */
export function paresFaq(texto, titulo = '') {
  const daFaq = ehTituloFaq(titulo);
  const out = [];
  for (const bruta of linhasSemModelo(texto)) {
    const l = bruta.linha.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim();
    if (!l || /^\|/.test(l)) continue;
    const partes = l.split('|');
    if (partes.length !== 2) continue;
    const p = partes[0].trim(), r = partes[1].trim();
    if (!p || !r || (!daFaq && !/\?$/.test(p))) continue;
    out.push({ p: p.slice(0, 200), r: r.slice(0, 600) });
  }
  return out.slice(0, 15);
}

/** "não sei" escrito pelo operador: [{ trecho }] (a IA pergunta sobre esses pontos em vez de inventar). */
export const naoSeiDoTexto = (texto) => linhasSemModelo(texto).map((x) => x.linha.trim()).filter((l) => /\bn[aã]o sei\b/i.test(l)).map((trecho) => ({ trecho: trecho.slice(0, 160) }));
