// Limite da assinatura do Claude (CLI `claude -p`). A CLI avisa com uma linha como
// "You've hit your session limit · resets 9:30pm (UTC)". Aqui: reconhecer a mensagem na hora (sem esperar o tempo
// limite de 3 minutos), descobrir quando volta e escrever isso em português, no horário de Brasília.

const RE_LIMITE = /(hit your (?:\w+[ -])*limit|(?:session|usage|weekly|daily|5-hour|five-hour) limit (?:reached|hit)|limit reached|out of (?:extra )?usage)/i;
const RE_VOLTA = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(([^)]+)\))?/i;

/** null quando o texto não é o aviso de limite; senão { volta: Date | null }. */
export function lerLimite(texto, agora = new Date()) {
  const t = String(texto || '');
  if (!RE_LIMITE.test(t)) return null;
  const m = RE_VOLTA.exec(t);
  return { volta: m ? proximaHora(m, agora) : null };
}

/** Diferença (ms) entre o relógio do fuso `tz` e o UTC num instante. */
function deslocamento(tz, instante) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(instante).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - instante.getTime();
  } catch { return null; }
}

/** Próximo instante (depois de agora) em que o relógio do fuso marca a hora lida. */
function proximaHora(m, agora) {
  let h = Number(m[1]) % 12; const min = Number(m[2] || 0);
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm') h += 12; else if (!ap) h = Number(m[1]) % 24;
  const tz = /^utc|gmt$/i.test(String(m[4] || '').trim()) || !m[4] ? 'UTC' : String(m[4]).trim();
  const off = deslocamento(tz, agora) ?? 0;
  const local = new Date(agora.getTime() + off); // relógio do fuso, guardado num Date "como se fosse UTC"
  let alvo = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, min) - off;
  if (alvo <= agora.getTime()) alvo += 24 * 3600_000;
  return new Date(alvo);
}

/** "18:30" no horário de Brasília. */
export const horaBrasilia = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

/** Mensagem para o operador quando a assinatura acabou e não há reserva (ou ela também falhou). */
export const mensagemLimite = (volta) => (volta
  ? `O limite da assinatura do Claude acabou. Volta às ${horaBrasilia(volta)} (horário de Brasília).`
  : 'O limite da assinatura do Claude acabou. Volta em algumas horas.');
