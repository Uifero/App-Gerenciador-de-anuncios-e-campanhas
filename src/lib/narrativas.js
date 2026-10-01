// Narrativas da referência "Metodologia Vortex" (server/referencias/metodologia-vortex.js), para o select opcional
// "Narrativa" na geração de criativos e para a etiqueta no criativo. É referência, não regra: em "A IA escolhe" nada
// muda no pedido. As narrativas que dependem de prova (Antes e Depois, Resultado/Depoimento) só valem com prova REAL
// do perfil de marca; sem ela a IA escolhe outra abordagem e nunca inventa resultado.
import { linhasDeProva } from './prova-social.js';

export const ETAPAS_FUNIL = { topo: 'Topo', meio: 'Meio', fundo: 'Fundo' };

export const NARRATIVAS = [
  { id: 'dor_solucao', nome: 'Dor vs Solução', etapa: 'topo' },
  { id: 'quebra_crenca', nome: 'Quebra de Crença', etapa: 'topo' },
  { id: 'nos_vs_eles', nome: 'Nós vs Eles', etapa: 'meio' },
  { id: 'por_que_funciona', nome: 'Por que usar / Por que funciona', etapa: 'meio' },
  { id: 'antes_depois', nome: 'Antes e Depois', etapa: 'fundo', exigeProva: true },
  { id: 'resultado_depoimento', nome: 'Resultado / Depoimento', etapa: 'fundo', exigeProva: true },
  { id: 'oferta', nome: 'Oferta', etapa: 'fundo' },
];
export const narrativaPorId = (id) => NARRATIVAS.find((n) => n.id === id) || null;

/** O perfil tem prova social real (as únicas que a IA pode citar)? */
export const temProvaNoPerfil = (cliente) => linhasDeProva(cliente?.marca?.provasSociais).length > 0;

/** A narrativa pode ser usada com este cliente? (as que exigem prova, só com prova real) */
export const narrativaPermitida = (n, cliente) => Boolean(n) && (!n.exigeProva || temProvaNoPerfil(cliente));

/**
 * Linha do pedido para a IA conforme o select. '' (A IA escolhe) = nenhuma linha (pedido igual ao de antes).
 * Devolve { linha, bloqueada } — bloqueada = o gestor escolheu narrativa de prova e o cliente não tem prova real.
 */
export function linhaNarrativa(id, cliente) {
  const n = narrativaPorId(id);
  if (!n) return { linha: '', bloqueada: false };
  if (!narrativaPermitida(n, cliente)) {
    return { bloqueada: true, linha: `O gestor pediu a narrativa "${n.nome}", mas o cliente NÃO tem prova social real no perfil. Não use essa narrativa e não invente resultado, número, foto de antes/depois nem depoimento: escolha outra abordagem que funcione sem prova e diga no "porque" que trocou por falta de prova real.` };
  }
  return { bloqueada: false, linha: `Narrativa escolhida pelo gestor (etapa ${ETAPAS_FUNIL[n.etapa].toLowerCase()} do funil): ${n.nome}. Use-a em todas as variações, variando hook e formato.${n.exigeProva ? ' Use SÓ as provas reais do perfil, sem inventar nada.' : ''}` };
}

/** Narrativa que a IA disse ter usado: só fica se existe e é permitida (sem prova real, não aparece etiqueta de prova). */
export function narrativaDevolvida(id, cliente) {
  const n = narrativaPorId(String(id || '').trim());
  return narrativaPermitida(n, cliente) ? n.id : null;
}

export const rotuloNarrativa = (id) => { const n = narrativaPorId(id); return n ? `${n.nome} · ${ETAPAS_FUNIL[n.etapa]}` : ''; };
