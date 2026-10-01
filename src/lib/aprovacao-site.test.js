import { describe, it, expect } from 'vitest';
import {
  dataHoraBR, dataHoraCurta, statusDoLink, idMaisRecente, aSubstituir, linkAtivo, respostaValida, mensagemParaCliente, etiquetaSite,
  comentarioComSecao, lerSecao,
} from './aprovacao-site.js';

const FUTURO = Date.parse('2026-12-31T00:00:00Z'), AGORA = Date.parse('2026-10-02T12:00:00Z');

describe('data e hora no horário de Brasília', () => {
  it('formata dd/mm/aaaa às HH:mm em America/Sao_Paulo, qualquer que seja o fuso do computador', () => {
    expect(dataHoraBR('2026-10-01T15:30:00.000Z')).toBe('01/10/2026 às 12:30');
    expect(dataHoraCurta('2026-10-01T15:30:00.000Z')).toBe('01/10 às 12:30');
  });
  it('link criado depois das 21h em Brasília: em UTC já é o dia seguinte, mas a data mostrada continua sendo a de Brasília', () => {
    // 01/10 às 22:15 em Brasília = 02/10 01:15 UTC
    expect(dataHoraBR('2026-10-02T01:15:00.000Z')).toBe('01/10/2026 às 22:15');
    // virada do ano: 31/12 às 23:59 em Brasília = 01/01 02:59 UTC
    expect(dataHoraBR('2027-01-01T02:59:00.000Z')).toBe('31/12/2026 às 23:59');
    expect(dataHoraBR('2026-10-01T03:00:00.000Z')).toBe('01/10/2026 às 00:00'); // meia-noite certa
  });
  it('data inválida não quebra', () => { expect(dataHoraBR('')).toBe('—'); expect(dataHoraBR('xx')).toBe('—'); });
});

describe('regra do link substituído', () => {
  const l1 = { id: 'a', tipo: 'site', criadoEm: '2026-10-01T12:00:00.000Z', expiraMs: FUTURO };
  const l2 = { id: 'b', tipo: 'site', criadoEm: '2026-10-02T01:15:00.000Z', expiraMs: FUTURO };
  const criativo = { id: 'c', clienteId: 'x', itensIds: ['cr1'], criadoEm: '2026-10-01T10:00:00.000Z', expiraMs: FUTURO }; // link de criativo (sem tipo)

  it('um link novo substitui só os links do site ainda ativos (nunca os de criativo, nem desativados)', () => {
    const desativado = { id: 'd', tipo: 'site', desativadoEm: '2026-09-01T00:00:00Z', expiraMs: 0 };
    expect(aSubstituir([l1, l2, criativo, desativado], 'b').map((l) => l.id)).toEqual(['a']);
  });
  it('substituído: continua aberto, mas não aceita resposta, e mostra a data do link mais novo', () => {
    const velho = { ...l1, substituidoEm: l2.criadoEm, substituidoPorEm: l2.criadoEm };
    expect(linkAtivo(velho, AGORA)).toBe(false);
    expect(statusDoLink(velho, null, AGORA)).toEqual({ tipo: 'substituido', texto: 'Substituído por link de 01/10 às 22:15' });
    expect(idMaisRecente([velho, l2], AGORA)).toBe('b');
  });
  it('resposta gravada DEPOIS da substituição não vale (ninguém aprova versão antiga); a de antes continua valendo', () => {
    const velho = { ...l1, substituidoEm: '2026-10-02T01:15:00.000Z' };
    const depois = { status: 'aprovado', em: '2026-10-02T02:00:00.000Z' }, antes = { status: 'aprovado', em: '2026-10-01T20:00:00.000Z' };
    expect(respostaValida(velho, depois)).toBeNull();
    expect(statusDoLink(velho, depois, AGORA).tipo).toBe('substituido');
    expect(statusDoLink(velho, antes, AGORA)).toMatchObject({ tipo: 'aprovado', texto: 'Aprovado em 01/10 às 17:00' });
  });
  it('status: aguardando, expirado, desativado, ajuste com seção', () => {
    expect(statusDoLink(l2, null, AGORA).texto).toBe('Aguardando cliente');
    expect(statusDoLink({ ...l2, expiraMs: AGORA - 1 }, null, AGORA).texto).toBe('Expirado');
    expect(statusDoLink({ ...l2, desativadoEm: '2026-10-02T13:00:00Z', expiraMs: 0 }, null, AGORA).tipo).toBe('desativado');
    const aj = statusDoLink(l2, { status: 'ajuste', em: '2026-10-02T13:00:00.000Z', comentario: comentarioComSecao('Produtos', 'Trocar a foto') }, AGORA);
    expect(aj).toMatchObject({ tipo: 'ajuste', texto: 'Ajuste pedido em 02/10 às 10:00', secao: 'Produtos', comentario: 'Trocar a foto' });
    expect(lerSecao('sem seção')).toEqual({ secao: '', texto: 'sem seção' });
  });
  it('mensagem para o cliente e etiqueta do Site/Loja', () => {
    expect(mensagemParaCliente(l2, 'https://app/#/aprovar/b')).toBe('Prévia do seu site (versão de 01/10/2026 às 22:15): https://app/#/aprovar/b. Abra, navegue e clique em Aprovar ou Pedir ajuste.');
    expect(etiquetaSite([l1, { ...l2, versao: 3 }], [{ token: 'b', status: 'aprovado', em: '2026-10-02T02:00:00Z' }], AGORA)).toEqual({ texto: 'Aprovado v3', tipo: 'aprovado' });
    expect(etiquetaSite([], [], AGORA)).toBeNull();
  });
});
