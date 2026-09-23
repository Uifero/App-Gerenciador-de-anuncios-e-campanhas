// Testes do resumo "sem IA" do diagnóstico de campanha: dados e padrões lado a lado, sem nenhuma interpretação.
import { describe, it, expect } from 'vitest';
import { resumoSemIA } from './diagnostico.js';

describe('resumoSemIA', () => {
  it('repassa os dados informados sem alteração', () => {
    const dados = { plataforma: 'meta', cpaAtual: 40 };
    const r = resumoSemIA({ dados, locais: {}, nicho: {}, referenciasFortes: [] });
    expect(r.dadosInformados).toBe(dados);
  });

  it('resume os padrões do cliente e do nicho em texto simples', () => {
    const locais = { angulo: [{ valor: 'dor', roasMedio: 2.5, cpaMedio: 40, amostras: 3 }], framework: [], formato: [] };
    const nicho = { angulo: [{ valor: 'economia', roasMedio: 5, cpaMedio: 20, amostras: 4 }], framework: [], formato: [] };
    const r = resumoSemIA({ dados: {}, locais, nicho, referenciasFortes: [] });
    expect(r.padroesDoCliente[0]).toContain('dor');
    expect(r.padroesDoCliente[0]).toContain('ROAS 2.50x');
    expect(r.padroesDoNicho[0]).toContain('economia');
  });

  it('lista as referências de sinal forte por título e ângulo', () => {
    const r = resumoSemIA({ dados: {}, locais: {}, nicho: {}, referenciasFortes: [{ titulo: 'Anúncio X', analise: { angulo: 'prova social' } }] });
    expect(r.referenciasFortes).toEqual(['Anúncio X (ângulo prova social)']);
  });

  it('sem nenhum padrão, devolve listas vazias (a UI decide a mensagem de "sem dados")', () => {
    const r = resumoSemIA({ dados: {}, locais: {}, nicho: {}, referenciasFortes: [] });
    expect(r.padroesDoCliente).toEqual([]);
    expect(r.padroesDoNicho).toEqual([]);
  });

  it('funciona sem nicho definido (undefined)', () => {
    const r = resumoSemIA({ dados: {}, locais: {}, nicho: undefined, referenciasFortes: [] });
    expect(r.padroesDoNicho).toEqual([]);
  });
});
