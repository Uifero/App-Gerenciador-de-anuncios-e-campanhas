// Testes do resumo "sem IA" do diagnóstico de campanha: dados e padrões lado a lado, sem nenhuma interpretação.
import { describe, it, expect } from 'vitest';
import { resumoSemIA, conferirLeituraImagens, conferirFontesMercado, conferirDiagnostico } from './diagnostico.js';

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

describe('conferirLeituraImagens', () => {
  const base = (extra = {}) => ({ funcionandoBem: [], desperdicio: [], recomendacoes: [], ...extra });

  it('garante uma leitura por imagem enviada, marcando como "não analisada" a que a IA pulou', () => {
    const r = conferirLeituraImagens(base({ imagens: [{ numero: 2, tipo: 'metricas', leitura: 'CPM R$ 42, frequência 4,1' }] }), 2);
    expect(r.imagens).toHaveLength(2);
    expect(r.imagens[0]).toMatchObject({ numero: 1, tipo: 'sem_leitura' });
    expect(r.imagens[1]).toMatchObject({ numero: 2, tipo: 'metricas', leitura: 'CPM R$ 42, frequência 4,1' });
  });

  it('ignora leituras de imagens que não foram enviadas e normaliza o tipo', () => {
    const r = conferirLeituraImagens(base({ imagens: [{ numero: 1, tipo: 'Métricas', leitura: 'x' }, { numero: 5, tipo: 'criativo', leitura: 'y' }] }), 1);
    expect(r.imagens).toEqual([{ numero: 1, tipo: 'metricas', leitura: 'x' }]);
  });

  it('avisa quando uma conclusão vem de imagem que a IA disse ser ilegível ou sem relação', () => {
    const r = conferirLeituraImagens(base({
      imagens: [{ numero: 1, tipo: 'sem_relacao', leitura: 'foto de um gato' }, { numero: 2, tipo: 'criativo', leitura: 'CTA pequeno' }],
      desperdicio: [{ texto: 'CTR caindo', fonte: 'imagem', imagem: 1 }],
      recomendacoes: [{ texto: 'Aumentar o CTA', fonte: 'imagem', imagem: 2, prioridade: 'alta' }],
    }), 2);
    expect(r.desperdicio[0].alerta).toMatch(/imagem 1 como sem relação/);
    expect(r.recomendacoes[0].alerta).toBeUndefined();
  });

  it('avisa quando a conclusão cita imagem que não existe (inclusive sem nenhuma imagem enviada)', () => {
    const r = conferirLeituraImagens(base({ funcionandoBem: [{ texto: 'Frequência ok', fonte: 'Imagem', imagem: 3 }] }), 0);
    expect(r.imagens).toEqual([]);
    expect(r.funcionandoBem[0].fonte).toBe('imagem');
    expect(r.funcionandoBem[0].alerta).toMatch(/não foi enviada/);
  });

  it('confere também a imagem citada numa conclusão mista (dado digitado x print)', () => {
    const imagens = [{ numero: 1, tipo: 'metricas', leitura: 'CPA R$ 75' }, { numero: 2, tipo: 'ilegivel', leitura: 'borrada' }];
    const r = conferirLeituraImagens(base({ imagens, desperdicio: [
      { texto: 'CPA digitado diverge do print', fonte: 'dados', imagem: 1 },
      { texto: 'CPM alto', fonte: 'dados', imagem: '2' },
    ] }), 2);
    expect(r.desperdicio[0]).toMatchObject({ fonte: 'dados', imagem: 1 });
    expect(r.desperdicio[0].alerta).toBeUndefined();
    expect(r.desperdicio[1].imagem).toBe(2);
    expect(r.desperdicio[1].alerta).toMatch(/ilegível/);
  });

  it('não mexe nas conclusões que vieram dos dados digitados e tolera resposta sem listas', () => {
    const r = conferirLeituraImagens({ funcionandoBem: [{ texto: 'CPA dentro da meta', fonte: 'dados', origem: 'dado informado' }] }, 0);
    expect(r.funcionandoBem[0]).toEqual({ texto: 'CPA dentro da meta', fonte: 'dados', origem: 'dado informado' });
    expect(r.desperdicio).toEqual([]);
    expect(r.recomendacoes).toEqual([]);
  });
});

describe('conferirFontesMercado', () => {
  it('normaliza buscaMercado e aceita encontrou em texto', () => {
    const r = conferirFontesMercado({ buscaMercado: { encontrou: 'true', resumo: 'Benchmarks de CPA do nicho' } });
    expect(r.buscaMercado).toEqual({ encontrou: true, resumo: 'Benchmarks de CPA do nicho' });
  });

  it('diagnóstico antigo (sem pesquisa) fica sem buscaMercado', () => {
    expect(conferirFontesMercado({ recomendacoes: [] }).buscaMercado).toBeUndefined();
  });

  it('conclusão de mercado sem link ganha alerta; com link http não', () => {
    const r = conferirFontesMercado({ buscaMercado: { encontrou: true }, recomendacoes: [
      { texto: 'UGC', fonte: 'mercado', link: 'https://exemplo.com/estudo' },
      { texto: 'Carrossel', fonte: 'mercado' },
      { texto: 'Vídeo curto', fonte: 'mercado', link: 'javascript:alert(1)' },
    ] });
    expect(r.recomendacoes[0].alerta).toBeUndefined();
    expect(r.recomendacoes[1].alerta).toMatch(/Sem o link/);
    expect(r.recomendacoes[2].link).toBeUndefined();
    expect(r.recomendacoes[2].alerta).toMatch(/Sem o link/);
  });

  it('se a pesquisa não achou nada, qualquer conclusão atribuída ao mercado é marcada para desconsiderar', () => {
    const r = conferirFontesMercado({ buscaMercado: { encontrou: false, resumo: 'nada atual' }, comparacaoMercado: [{ texto: 'x', fonte: 'Mercado', link: 'https://a.com' }] });
    expect(r.comparacaoMercado[0].alerta).toMatch(/não trouxe nada/);
  });

  it('não mexe em conclusões de outras fontes e remove páginas consultadas repetidas ou inválidas', () => {
    const r = conferirFontesMercado({ funcionandoBem: [{ texto: 'ok', fonte: 'dados' }], paginasConsultadas: [{ url: 'https://a.com' }, { url: 'https://a.com' }, { url: 'ftp://b' }] });
    expect(r.funcionandoBem[0].alerta).toBeUndefined();
    expect(r.paginasConsultadas).toEqual([{ url: 'https://a.com' }]);
  });

  it('conferirDiagnostico junta as duas conferências (imagens + mercado)', () => {
    const r = conferirDiagnostico({ buscaMercado: { encontrou: true }, comparacaoMercado: [{ texto: 'x', fonte: 'MERCADO' }], desperdicio: [{ texto: 'y', fonte: 'imagem', imagem: 2 }] }, 1);
    expect(r.comparacaoMercado[0]).toMatchObject({ fonte: 'mercado' });
    expect(r.comparacaoMercado[0].alerta).toMatch(/Sem o link/);
    expect(r.desperdicio[0].alerta).toMatch(/não foi enviada/);
  });
});
