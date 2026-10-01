import { describe, it, expect } from 'vitest';
import { NARRATIVAS, linhaNarrativa, narrativaDevolvida, narrativaPermitida, narrativaPorId, rotuloNarrativa } from './narrativas.js';

const semProva = { marca: { provasSociais: '' } };
const comProva = { marca: { provasSociais: 'Nota 4,9 no Google (do print enviado em 01/10)' } };

describe('narrativas (Metodologia Vortex)', () => {
  it('7 narrativas em topo, meio e fundo; só Antes e Depois e Resultado/Depoimento exigem prova', () => {
    expect(NARRATIVAS).toHaveLength(7);
    expect(NARRATIVAS.filter((n) => n.exigeProva).map((n) => n.id)).toEqual(['antes_depois', 'resultado_depoimento']);
    expect(rotuloNarrativa('quebra_crenca')).toBe('Quebra de Crença · Topo');
  });
  it('"A IA escolhe" não acrescenta nada ao pedido', () => {
    expect(linhaNarrativa('', semProva)).toEqual({ linha: '', bloqueada: false, motivo: '' });
    expect(linhaNarrativa('inexistente', semProva).linha).toBe('');
  });
  it('narrativa de prova SEM prova real: bloqueada, pede outra abordagem e proíbe inventar', () => {
    for (const id of ['antes_depois', 'resultado_depoimento']) {
      const r = linhaNarrativa(id, semProva);
      expect(r.bloqueada).toBe(true);
      expect(r.linha).toMatch(/NÃO tem prova social real/);
      expect(r.linha).toMatch(/não invente/i);
      expect(narrativaPermitida(narrativaPorId(id), semProva)).toBe(false);
      expect(narrativaDevolvida(id, semProva)).toBeNull(); // nem etiqueta de prova aparece
    }
  });
  it('narrativa de prova COM prova real: liberada, só com as provas do perfil', () => {
    const r = linhaNarrativa('antes_depois', comProva);
    expect(r.bloqueada).toBe(false);
    expect(r.linha).toMatch(/Antes e Depois/);
    expect(r.linha).toMatch(/SÓ as provas reais/);
    expect(narrativaDevolvida('antes_depois', comProva)).toBe('antes_depois');
  });
  it('narrativas sem prova valem para qualquer cliente; id desconhecido da IA vira null', () => {
    expect(linhaNarrativa('dor_solucao', semProva).bloqueada).toBe(false);
    expect(narrativaDevolvida('oferta', semProva)).toBe('oferta');
    expect(narrativaDevolvida('inventada', comProva)).toBeNull();
    expect(narrativaDevolvida(null, comProva)).toBeNull();
  });
});
