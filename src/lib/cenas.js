// Roteiro de vídeo em cenas com campos separados (criativo.cenas): cada cena tem
//   tempo   "0-3s"                      quando acontece
//   mostrar "Mão derruba um dos potes"  direção de filmagem/imagem: SÓ PARA O OPERADOR, nunca aparece no vídeo
//   texto   "Quantos potes você tem aí?" texto na tela (o que quem assiste lê; curto, até ~8 palavras)
//   fala    "..."                        fala/narração (opcional)
// Roteiro antigo (tudo no texto do criativo, "CENA 1 (0-3s) — direção. Texto na tela: "..."") é lido aqui sem mudar o
// texto guardado: a direção vai para "mostrar", só o que vem depois de "Texto na tela:" vai para a tela; sem "Texto na
// tela", a tela fica vazia (nunca a direção). A foto de cada cena é a escolhida pelo operador; sem escolha, a que combina
// com "O que mostrar"; sem nenhuma que combine, "Falta foto" (nunca uma foto sem relação).

const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const semAspas = (s) => txt(s).replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Palavras por tela no Reels: texto na tela acima disso vira aviso no editor. */
export const PALAVRAS_TELA = 8;
export const contarPalavras = (t) => txt(t).split(' ').filter(Boolean).length;

// "CENA 1 (0-3s) —", "Cena 2 [3-7s]:", "cena 3 - ", "**Cena 4 (7–11 s)**". Exige o número (o texto "cena real" não conta).
const RE_MARCA = /(?<=^|[\s"”'’.!?)*])cena\s*(\d+)\s*(?:[([]\s*([^)\]\n]*?)\s*[)\]])?(?:[\s*]*[:|—–-]+)?[\s*]*/gi;
// Rótulos dentro da cena. O valor vai até o próximo rótulo, a quebra de linha ou o fim.
// "Imagem:"/"Visual:" são direção; "Legenda do post:" é a legenda do anúncio (não é da cena) e sai.
const ROTULOS = [
  ['ignorar', /^legenda\s+do\s+post/i],
  ['texto', /^(?:texto(?:\s+na\s+tela)?|legenda\s+na\s+tela|lettering)/i],
  ['mostrar', /^(?:imagem|visual|mostrar|o\s+que\s+mostrar|filmagem|dire[cç][aã]o|take)/i],
  ['fala', /^(?:voz|fala|narra[cç][aã]o|locu[cç][aã]o)/i],
];
const RE_ROTULO = /(?<![a-zà-ú])(legenda\s+do\s+post|texto\s+na\s+tela|legenda\s+na\s+tela|texto|lettering|o\s+que\s+mostrar|imagem|visual|mostrar|filmagem|dire[cç][aã]o|take|voz|fala|narra[cç][aã]o|locu[cç][aã]o)(?:\s*\([^)]*\))?\s*:\s*/gi;

/** Tempo "0-3s" / "7–11 s" / "00:03-00:07" -> duração em segundos (1,5 a 12; sem número, 3). */
export function duracaoDoTempo(tempo) {
  const t = String(tempo || '');
  const seg = (v) => { const [a, b] = String(v).split(':'); return b != null ? Number(a) * 60 + Number(b) : Number(String(v).replace(',', '.')); };
  const m = t.match(/(\d+(?::\d+)?(?:[.,]\d+)?)\s*s?\s*(?:-|–|—|a|até)\s*(\d+(?::\d+)?(?:[.,]\d+)?)/i);
  const d = m ? seg(m[2]) - seg(m[1]) : 3;
  return Math.min(12, Math.max(1.5, d > 0 ? d : 3));
}

/** Uma cena do texto antigo: separa direção, texto na tela e fala. */
function lerCorpo(corpo) {
  const partes = { texto: '', fala: '' };
  const achados = [...String(corpo).matchAll(RE_ROTULO)];
  let direcao = achados.length ? String(corpo).slice(0, achados[0].index) : String(corpo);
  achados.forEach((m, i) => {
    const fim = i + 1 < achados.length ? achados[i + 1].index : corpo.length;
    let valor = corpo.slice(m.index + m[0].length, fim);
    const tipo = ROTULOS.find(([, re]) => re.test(m[1]))?.[0] || 'fala';
    if (tipo === 'ignorar') return;
    if (tipo === 'mostrar') { direcao += ' ' + valor; return; }
    const aspas = valor.match(/^\s*["“]([^"”]*)["”]/);
    // Valor entre aspas: só o que está nelas; o resto da linha volta para a direção.
    if (aspas) { direcao += ' ' + valor.slice(aspas[0].length); valor = aspas[1]; } else {
      const linha = valor.split('\n'); valor = linha[0]; direcao += ' ' + linha.slice(1).join(' ');
    }
    if (!partes[tipo]) partes[tipo] = semAspas(valor).replace(/[\s/|]+$/, '');
  });
  return { mostrar: txt(direcao).replace(/^[\s:*—–-]+/, '').replace(/[\s/|;,*—–-]+$/, '').trim(), ...partes };
}

/**
 * Lê o roteiro antigo (texto do criativo) e devolve [{ tempo, mostrar, texto, fala }]. Sem "CENA N" no texto: [].
 * O texto original não é mudado.
 */
export function lerRoteiro(copy) {
  const t = String(copy || '');
  const marcas = [...t.matchAll(RE_MARCA)];
  return marcas.map((m, i) => {
    const corpo = t.slice(m.index + m[0].length, i + 1 < marcas.length ? marcas[i + 1].index : undefined);
    return { tempo: txt(m[2]).replace(/\s+/g, ''), ...lerCorpo(corpo) };
  });
}

/** Cenas que vieram da IA ou do banco: só os quatro campos, texto. */
export const normalizarCenas = (lista) => (Array.isArray(lista) ? lista : [])
  .map((c) => ({ tempo: txt(c?.tempo), mostrar: txt(c?.mostrar), texto: semAspas(c?.texto), fala: semAspas(c?.fala) }))
  .filter((c) => c.mostrar || c.texto || c.fala);

/** Cenas do criativo: as guardadas (criativo.cenas) ou, sem elas, as lidas do roteiro antigo. */
export function cenasDoCriativo(c = {}) {
  const guardadas = normalizarCenas(c.cenas);
  if (guardadas.length) return { cenas: guardadas, origem: 'criativo' };
  const lidas = lerRoteiro(c.copy);
  return { cenas: lidas, origem: lidas.length ? 'roteiro' : '' };
}

// Direção, "CENA N" e marcação de tempo nunca vão para a tela, mesmo que tenham ido parar no campo por engano.
const RE_TEMPO = /\(?\s*\d+(?::\d+)?\s*s?\s*(?:-|–|—|a|até)\s*\d+(?::\d+)?\s*s\s*\)?|\(\s*\d+(?::\d+)?\s*(?:-|–|—)\s*\d+(?::\d+)?\s*\)/gi;
/** O que o vídeo escreve na tela: só o "Texto na tela" (vazio = nada). */
export function textoNaTela(cena = {}) {
  let t = String(cena.texto || '');
  if (/^\s*\**\s*cena\s*\d+/i.test(t)) t = lerRoteiro(t)[0]?.texto || ''; // direção colada no campo: fica só o texto na tela
  return txt(t.replace(/\bcena\s*\d+\b\s*[:—–-]?/gi, ' ').replace(RE_TEMPO, ' ').replace(/^[\s:—–-]+/, ''));
}

// ---------- foto de cada cena ----------
const VAZIAS = new Set(('cena real sem drama situacao camera celular natural mostrar video foto imagem close plano tela texto '
  + 'para com uma umas uns dos das pela pelo como mais muito sobre entre depois antes quando onde enquanto mesmo apenas outra outro '
  + 'esta este essa esse isso aqui tudo cada qualquer fundo frente lado parte vista ponto vertical horizontal enquadramento corte '
  + 'jpeg webp print borrado borrada copia').split(' '));
/** Palavras que identificam o que a cena pede / o que a foto mostra (sem acento, 4+ letras, plural reduzido). */
export function palavrasChave(t) {
  return new Set(semAcento(t).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !VAZIAS.has(p) && !/^\d+$/.test(p))
    .map((p) => (p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p)));
}
/** Texto guardado que descreve um material (nome, descrição, leitura do print, etiquetas). */
export const rotuloDoMaterial = (m = {}) => [m.nome, m.nomeOriginal, m.descricao, m.resumo, m.legenda, m.titulo, m.citacao, m.textoOcr, m.ocr,
  ...(Array.isArray(m.etiquetas) ? m.etiquetas : [])].map(txt).filter(Boolean).join(' · ');

/**
 * Foto/vídeo de uma cena. `midias` = [{ rotulo, nome, ... }]. Escolha manual (cena.midiaIdx) sempre vence; sem ela, a
 * que mais combina com "O que mostrar"; cena com direção e nenhuma foto que combine = falta (placeholder, nunca outra
 * foto). Cena sem direção (gancho/CTA montados à mão, cenas antigas só com legenda): os materiais em rodízio, como antes.
 * Devolve { midia, idx, como: 'manual' | 'combina' | 'rodizio' | 'falta' | 'sem' }.
 */
export function fotoDaCena(cena = {}, i = 0, midias = []) {
  if (cena.midiaIdx != null && midias[cena.midiaIdx]) return { midia: midias[cena.midiaIdx], idx: cena.midiaIdx, como: 'manual' };
  const pede = palavrasChave(cena.mostrar);
  if (!pede.size) {
    // Rodízio sem as fotos de resultado no corpo (balança, antes e depois...): essas só entram por escolha manual.
    const livres = midias.map((m, k) => k).filter((k) => !imagemResultadoCorpo(midias[k].rotulo));
    if (!livres.length) return { midia: null, idx: null, como: 'sem' };
    const k = livres[i % livres.length];
    return { midia: midias[k], idx: k, como: 'rodizio' };
  }
  let melhor = null, pontos = 0;
  midias.forEach((m, k) => {
    const tem = palavrasChave(`${m.rotulo || ''} ${m.nome || ''}`);
    const n = [...pede].filter((p) => tem.has(p)).length;
    if (n > pontos) { pontos = n; melhor = k; }
  });
  return melhor != null ? { midia: midias[melhor], idx: melhor, como: 'combina' } : { midia: null, idx: null, como: 'falta' };
}

// ---------- imagem de resultado no corpo (só aviso) ----------
export const NOTA_IMAGEM_CORPO = 'Imagem de resultado no corpo: o Meta costuma reprovar em suplemento.';
const RE_IMAGEM_CORPO = /balan[cç]a|\bpeso\b|\bpesagem\b|\d\s*(?:kg|quilos?)\b|\bkg\b|antes\s*(?:e|x|\/|&|vs\.?)\s*depois|\bmedidas?\b|\b(?:roupas?|jeans|cal[cç]as?|vestidos?|blusas?|shorts?)\b[^.]{0,30}?\b(?:larg|folgad)\w*|\bfoto comparativa\b|\bcomparativ/i;
/** A descrição/leitura guardada da foto mostra resultado no corpo (balança, kg, antes e depois, medidas, roupa larga)? */
export const imagemResultadoCorpo = (rotulo) => RE_IMAGEM_CORPO.test(String(rotulo || ''));
