// Narração do Estúdio: regras puras (sem DOM), testáveis na suíte normal.
// O roteiro de narração segue a MESMA linha do tempo de cenas do "Gerar vídeo" (uma cena = um trecho de fala),
// com o tempo de cada trecho, o tom e o ritmo — pronto para colar numa IA de voz externa (ElevenLabs, TTSMaker…).

/** Fala natural em português: ~2,5 palavras por segundo. Usado para dizer quantas palavras cabem numa cena. */
export const PALAVRAS_POR_SEGUNDO = 2.5;
export const LIMITE_GRAVACAO_S = 120;

export const tempo = (s) => { const n = Math.max(0, Number(s) || 0); return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`; };
export const contarPalavras = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
export const palavrasQueCabem = (dur) => Math.max(1, Math.round((Number(dur) || 0) * PALAVRAS_POR_SEGUNDO));

/** Ritmo sugerido para caber a fala no tempo da cena. */
export function ritmoPara(fala, dur) {
  const pps = contarPalavras(fala) / Math.max(0.5, Number(dur) || 0.5);
  if (pps > 3.2) return 'rápido (texto longo para o tempo: encurte ou aumente a cena)';
  if (pps > 2.6) return 'ágil';
  if (pps >= 1.6) return 'natural';
  return 'pausado, com respiros';
}

/** Tom padrão pela posição da cena: gancho chama atenção, meio conversa, final pede a ação. */
export function tomPadrao(cena, i) {
  if (cena.tipo === 'cta') return 'firme e claro, convidando à ação';
  if (i === 0) return 'animado, chamando a atenção logo no início';
  return 'conversado e próximo, como quem indica para um amigo';
}

/**
 * Linhas do roteiro a partir das cenas. `ia` (opcional) traz falas/tons/ritmos escritos pela IA, na mesma ordem;
 * sem ela (ou onde ela faltar), a fala é o texto da própria cena. Cenas sem texto viram "(sem fala)".
 */
export function montarRoteiroNarracao(cenas = [], ia = null) {
  let t = 0;
  return cenas.map((c, i) => {
    const dur = Number(c.dur) || 0, inicio = t; t += dur;
    const x = ia?.[i] || {};
    const fala = String(x.fala ?? c.texto ?? '').trim();
    return {
      n: i + 1, final: c.tipo === 'cta', inicio, fim: t, dur, fala,
      tom: String(x.tom || '').trim() || tomPadrao(c, i),
      ritmo: String(x.ritmo || '').trim() || ritmoPara(fala, dur),
      cabem: palavrasQueCabem(dur),
    };
  });
}

/** Roteiro completo (com tempos, tom e ritmo), para quem vai gravar ou para conferir. */
export function textoRoteiro(linhas, direcao = '') {
  const total = linhas.length ? linhas[linhas.length - 1].fim : 0;
  return [
    `ROTEIRO DE NARRAÇÃO — duração total ${tempo(total)} (${total.toFixed(1)} s)`,
    direcao ? `Direção geral: ${direcao}` : '',
    ...linhas.map((l) => `\n[${l.final ? 'Final' : 'Cena ' + l.n} · ${tempo(l.inicio)}–${tempo(l.fim)} · ${l.dur.toFixed(1)} s · cabem ~${l.cabem} palavras]\nTom: ${l.tom} · Ritmo: ${l.ritmo}\n${l.fala || '(sem fala: deixe um respiro)'}`),
  ].filter(Boolean).join('\n');
}

/** Só a fala, um trecho por parágrafo — é ISSO que se cola na ferramenta de voz (senão ela lê as marcações em voz alta). */
export const textoSoFala = (linhas) => linhas.map((l) => l.fala).filter(Boolean).join('\n\n');

/**
 * Ajusta a duração das cenas à duração da narração (proporcionalmente), respeitando 1 s por cena e o limite do
 * vídeo. Devolve NOVAS cenas (não altera as recebidas). Arredonda em 0,5 s e corrige a sobra na última cena.
 */
export function ajustarCenasANarracao(cenas, duracaoNarracao, limite = 30) {
  const total = cenas.reduce((a, c) => a + (Number(c.dur) || 0), 0);
  const alvo = Math.min(limite, Math.max(cenas.length, Number(duracaoNarracao) || 0));
  if (!cenas.length || !total || !alvo) return cenas.map((c) => ({ ...c }));
  const novas = cenas.map((c) => ({ ...c, dur: Math.max(1, Math.round(((Number(c.dur) || 0) / total) * alvo * 2) / 2) }));
  const soma = novas.reduce((a, c) => a + c.dur, 0), ultima = novas[novas.length - 1];
  ultima.dur = Math.max(1, Math.round((ultima.dur + (alvo - soma)) * 2) / 2);
  return novas;
}

/** Normaliza a resposta da IA: uma entrada por cena, sempre strings (o que faltar cai na regra sem IA). */
export function normalizarRoteiroIa(d, nCenas) {
  const lista = Array.isArray(d?.cenas) ? d.cenas : [];
  return {
    direcao: String(d?.direcao || '').trim(),
    cenas: Array.from({ length: nCenas }, (_, i) => {
      const x = lista[i] || {};
      return { fala: typeof x.fala === 'string' ? x.fala.trim() : undefined, tom: String(x.tom || ''), ritmo: String(x.ritmo || '') };
    }),
  };
}
