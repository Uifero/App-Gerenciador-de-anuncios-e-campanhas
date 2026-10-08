// Modelos de gancho de abertura (server/referencias/ganchos.js): conferência LOCAL do que a IA devolveu em criativos e
// hooks, sem depender dela. O modelo vem só se existir na biblioteca; repetido no lote vira aviso; colchete que sobrou do
// modelo e modelo (*) que virou resultado no corpo em cliente de saúde bloqueiam a aprovação (política do Meta).
import { GANCHOS, ganchoPorNumero } from '../../server/referencias/ganchos.js';
import { ehProdutoSaude } from './saude.js';

export { GANCHOS, ganchoPorNumero };
export { GRUPOS_GANCHO } from '../../server/referencias/ganchos.js';

/** Nome do grupo sem a observação entre parênteses: "PROMESSA E RESULTADO (cuidado...)" -> "PROMESSA E RESULTADO". */
export const nomeGrupo = (g) => String(g || '').replace(/\s*\(.*\)$/, '');

/** Número do modelo devolvido pela IA (37, "37", "modelo 37") -> número da biblioteca ou null. */
export function numeroModelo(v) {
  const m = /\d{1,3}/.exec(String(v ?? ''));
  return m && ganchoPorNumero(m[0]) ? Number(m[0]) : null;
}

/** "[algo]", "[X]": sobra do modelo que não foi trocada pelo texto do produto. */
export const temColchete = (texto) => /\[[^\]\n]{0,40}\]/.test(String(texto || ''));

// Resultado no corpo: peso/medidas, emagrecer, partes do corpo de "transformação", antes e depois.
const RE_CORPO = /\b(emagre\w*|engord\w*|peso|kg|quilos?|barriga|cintura|medidas|gordura|celulite|flacidez|culote|pochete|manequim|sequei|secou|secar)\b|antes\s*(?:e|x|\/|vs\.?)\s*depois|corpo\s+(?:dos sonhos|novo|mudou|mudar|transformad\w*)|meu corpo/i;
export const resultadoNoCorpo = (texto) => RE_CORPO.exec(String(texto || ''))?.[0].toLowerCase() || '';

/**
 * Motivo que impede aprovar/enviar o texto por causa do modelo de gancho, ou ''.
 * `c` = criativo ({ modeloGancho, hook, copy, cta }) ou hook ({ modeloGancho, texto }).
 */
export function motivoGancho(c, cliente) {
  const texto = [c?.hook, c?.copy, c?.cta, c?.texto].filter(Boolean).join(' ');
  if (temColchete(texto)) return 'sobrou colchete do modelo de gancho: escreva no lugar o texto do produto';
  const g = ganchoPorNumero(c?.modeloGancho);
  if (g?.cuidado && ehProdutoSaude(cliente)) {
    const achado = resultadoNoCorpo(texto);
    if (achado) return `modelo ${g.n} (*) virou resultado no corpo ("${achado}"): proibido para produto de saúde; remova esse trecho ou escolha outro modelo`;
  }
  return '';
}

/** Confere o lote devolvido pela IA: modelo válido, sem repetir no lote, e os avisos de cada item. */
export function conferirGanchos(lista = [], cliente) {
  const vistos = new Set();
  return lista.map((x) => {
    const modeloGancho = numeroModelo(x.modeloGancho);
    const avisosGancho = [];
    if (modeloGancho && vistos.has(modeloGancho)) avisosGancho.push(`modelo ${modeloGancho} repetido no lote`);
    if (modeloGancho) vistos.add(modeloGancho);
    const motivo = motivoGancho({ ...x, modeloGancho }, cliente);
    if (motivo) avisosGancho.push(motivo);
    return { ...x, modeloGancho, avisosGancho };
  });
}

/** Rótulo curto para a etiqueta: "gancho: modelo 37 (*)". */
export const rotuloModelo = (n) => { const g = ganchoPorNumero(n); return g ? `gancho: modelo ${g.n}${g.cuidado ? ' (*)' : ''}` : ''; };

/** Texto do modelo para mostrar de onde veio: `Modelo 37 (Experiência pessoal e teste): "Eu testei..."`. */
export const descricaoModelo = (n) => { const g = ganchoPorNumero(n); return g ? `Modelo ${g.n}${g.cuidado ? ' (*)' : ''}, ${nomeGrupo(g.grupo).toLowerCase()}: “${g.texto}”` : ''; };

/** Linha do pedido para a IA. `fixo` = número escolhido pelo operador (vai na 1ª variação). */
export function linhaGanchos({ fixo = null, quantidade = 1, cliente } = {}) {
  const g = ganchoPorNumero(fixo);
  const base = `Modelos de gancho: quando couber, parta de um modelo da biblioteca de ganchos, adaptado a este produto (sem colchetes), ${quantidade > 1 ? 'um modelo diferente em cada item, ' : ''}e informe o número em "modeloGancho" (null se não usou nenhum).`;
  if (!g) return base;
  const saude = g.cuidado && ehProdutoSaude(cliente) ? ' Este modelo tem (*) e o produto é de saúde: adapte sem resultado no corpo (peso, medidas, antes e depois, transformação física); o resultado citado só pode ser experiência de uso, rotina, disposição ou praticidade.' : '';
  return `${base} ${quantidade > 1 ? 'A variação 1 usa' : 'Use'} o modelo de gancho ${g.n}: "${g.texto}".${saude}`;
}
