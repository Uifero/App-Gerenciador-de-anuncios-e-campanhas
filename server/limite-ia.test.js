import { describe, it, expect } from 'vitest';
import { lerLimite, horaBrasilia, mensagemLimite } from './limite-ia.js';

describe('limite da assinatura (mensagem real do log de produção)', () => {
  const agora = new Date('2026-10-06T15:00:00Z');
  it('reconhece "You\'ve hit your session limit · resets 9:30pm (UTC)" e converte para Brasília (18:30)', () => {
    const l = lerLimite("You've hit your session limit · resets 9:30pm (UTC)", agora);
    expect(l).toBeTruthy();
    expect(l.volta.toISOString()).toBe('2026-10-06T21:30:00.000Z');
    expect(horaBrasilia(l.volta)).toBe('18:30');
    expect(mensagemLimite(l.volta)).toBe('O limite da assinatura do Claude acabou. Volta às 18:30 (horário de Brasília).');
  });
  it('horário que já passou hoje vira amanhã', () => {
    const l = lerLimite('Claude usage limit reached. resets 3am (UTC)', agora);
    expect(l.volta.toISOString()).toBe('2026-10-07T03:00:00.000Z');
    expect(horaBrasilia(l.volta)).toBe('00:00');
  });
  it('fuso com nome IANA', () => {
    const l = lerLimite("You've hit your weekly limit · resets 6pm (America/Sao_Paulo)", agora);
    expect(horaBrasilia(l.volta)).toBe('18:00');
  });
  it('sem horário: mensagem genérica', () => {
    const l = lerLimite("You've hit your session limit", agora);
    expect(l.volta).toBeNull();
    expect(mensagemLimite(null)).toMatch(/algumas horas/);
  });
  it('erro comum não é limite', () => {
    expect(lerLimite('Error: connection reset by peer')).toBeNull();
    expect(lerLimite('A CLI do Claude demorou demais (3 min).')).toBeNull();
  });
});
