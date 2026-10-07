// Testes da lógica de custo e roteamento de modelo/tarefa do servidor de IA (sem rede: só as funções puras exportadas).
import { describe, it, expect } from 'vitest';
import { TAREFAS, calcularCusto, paramsDoModelo, validarImagens, blocosComImagens, lerSaidaCli, MAX_IMAGENS, comMetodologia } from './index.js';
import { METODOLOGIA_VORTEX } from './referencias/metodologia-vortex.js';
import { REFERENCIA_TRAFEGO } from './referencias/trafego.js';

describe('TAREFAS', () => {
  it('toda tarefa tem modelo e limite de tokens de saída', () => {
    for (const [nome, t] of Object.entries(TAREFAS)) {
      expect(t.modelo, `tarefa ${nome} sem modelo`).toBeTruthy();
      expect(t.max, `tarefa ${nome} sem max`).toBeGreaterThan(0);
    }
  });

  it('tarefas simples usam o modelo leve; tarefas complexas usam o modelo completo', () => {
    expect(TAREFAS.hooks.modelo).toBe(TAREFAS.checklist.modelo);
    expect(TAREFAS.criativos.modelo).toBe(TAREFAS.campanha.modelo);
    expect(TAREFAS.hooks.modelo).not.toBe(TAREFAS.criativos.modelo);
  });

  it('sem raciocínio só nas tarefas leves medidas sem perda de qualidade; nunca no modelo complexo', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.semRaciocinio).map(([n]) => n).sort()).toEqual(['ajuste_site', 'checklist', 'imagem', 'modelo_prompt', 'reparo']);
    for (const n of ['hooks', 'refino', 'narracao', 'faq', 'leitura_respostas']) expect(TAREFAS[n].semRaciocinio).toBeFalsy(); // pioravam sem raciocínio
    for (const t of Object.values(TAREFAS).filter((x) => x.semRaciocinio)) expect(t.modelo).toBe(TAREFAS.hooks.modelo);
    expect(TAREFAS.modelo_prompt.modelo).toBe(TAREFAS.hooks.modelo); // modelo leve, como as tarefas simples
  });

  it('metodologia (referência opcional) só em criativos, campanha e site; nas outras o contexto fica igual', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.metodologia).map(([n]) => n).sort()).toEqual(['campanha', 'criativos', 'discussao_campanha', 'otimizacao_anuncio', 'recomendacao_anuncio', 'site']);
    expect(comMetodologia(TAREFAS.criativos, 'PERFIL')).toBe(`PERFIL

${METODOLOGIA_VORTEX}`);
    expect(comMetodologia(TAREFAS.hooks, 'PERFIL')).toBe('PERFIL');
    expect(comMetodologia(TAREFAS.hooks, undefined)).toBeUndefined();
    expect(METODOLOGIA_VORTEX).toMatch(/uma referência entre outras/i);
    expect(METODOLOGIA_VORTEX.length).toBeLessThan(1600); // curta: ~400 tokens
  });

  it('referência de tráfego só nas tarefas de campanha, análise e diagnóstico; vem depois da metodologia', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.trafego).map(([n]) => n).sort()).toEqual(['campanha', 'diagnostico', 'discussao_campanha', 'insights', 'otimizacao_anuncio', 'recomendacao_anuncio']);
    expect(comMetodologia(TAREFAS.campanha, 'PERFIL')).toBe(`PERFIL

${METODOLOGIA_VORTEX}

${REFERENCIA_TRAFEGO}`);
    expect(comMetodologia(TAREFAS.insights, 'PERFIL')).toBe(`PERFIL

${REFERENCIA_TRAFEGO}`);
    expect(comMetodologia(TAREFAS.insights, undefined)).toBe(REFERENCIA_TRAFEGO);
    expect(comMetodologia(TAREFAS.criativos, 'PERFIL')).not.toContain(REFERENCIA_TRAFEGO); // criativo e site ficam só com a Vortex
    expect(comMetodologia(TAREFAS.leitura_resultados, 'PERFIL')).toBe('PERFIL'); // leitura de print só extrai número
  });

  it('referência de tráfego: curta, opcional e sem benchmark de resultado para a IA citar', () => {
    expect(REFERENCIA_TRAFEGO).toMatch(/uma referência entre outras/i);
    expect(REFERENCIA_TRAFEGO).toMatch(/não inventar dados/i);
    expect(REFERENCIA_TRAFEGO).toMatch(/NÃO médias de mercado/);
    expect(REFERENCIA_TRAFEGO).not.toMatch(/\$|R\$|ROAS (médio|de \d)|CPM de \d/); // nenhum valor em moeda nem meta de ROAS/CPM
    expect(REFERENCIA_TRAFEGO.length).toBeLessThan(2400); // ~600 tokens
  });

  it('só busca de mercado, leitura de site pela busca e diagnóstico pedem busca web', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.web).map(([n]) => n)).toEqual(['referencias', 'diagnostico', 'leitura_web', 'pesquisa_nicho']);
    expect(TAREFAS.recomendacao_anuncio.web).toBeFalsy(); // a recomendação usa a pesquisa em cache: uma busca por análise, no máximo
    expect(TAREFAS.criativos.web).toBeFalsy();
    expect(TAREFAS.campanha.web).toBeFalsy();
  });
});

describe('calcularCusto', () => {
  const semUso = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };

  it('zero de uso custa zero', () => {
    expect(calcularCusto('claude-haiku-4-5', semUso)).toBe(0);
  });

  it('Sonnet custa mais que Haiku para o mesmo uso (entrada e saída mais caras)', () => {
    const uso = { entrada: 100_000, saida: 10_000, cacheEscrita: 0, cacheLeitura: 0 };
    const haiku = calcularCusto('claude-haiku-4-5', uso);
    const sonnet = calcularCusto('claude-sonnet-5', uso);
    expect(sonnet).toBeGreaterThan(haiku);
  });

  it('calcula o valor exato pela tabela de preços (Sonnet: entrada 2, saída 10 por 1M)', () => {
    const uso = { entrada: 1_000_000, saida: 1_000_000, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('claude-sonnet-5', uso)).toBeCloseTo(2 + 10, 6);
  });

  it('tokens de leitura do cache custam 10% do preço de entrada', () => {
    const comCache = calcularCusto('claude-sonnet-5', { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 1_000_000 });
    const semCache = calcularCusto('claude-sonnet-5', { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 });
    expect(comCache).toBeCloseTo(semCache * 0.1, 6);
  });

  it('tokens de escrita do cache custam 1,25x o preço de entrada', () => {
    const escrita = calcularCusto('claude-sonnet-5', { entrada: 0, saida: 0, cacheEscrita: 1_000_000, cacheLeitura: 0 });
    const normal = calcularCusto('claude-sonnet-5', { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 });
    expect(escrita).toBeCloseTo(normal * 1.25, 6);
  });

  it('soma o custo de buscas web (US$ 0,01 cada)', () => {
    const custo = calcularCusto('claude-sonnet-5', { ...semUso, buscasWeb: 3 });
    expect(custo).toBeCloseTo(0.03, 6);
  });

  it('reconhece a família do modelo pelo nome (opus cai na tabela de opus)', () => {
    const uso = { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('claude-opus-4', uso)).toBeCloseTo(5, 6);
  });

  it('modelo desconhecido cai na tabela do Sonnet (padrão)', () => {
    const uso = { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('modelo-futuro-xyz', uso)).toBeCloseTo(2, 6);
  });
});

describe('paramsDoModelo', () => {
  it('Haiku não recebe thinking nem effort (a API rejeita esses parâmetros no Haiku 4.5)', () => {
    expect(paramsDoModelo('claude-haiku-4-5', { effort: 'medium' })).toEqual({});
  });

  it('Sonnet recebe thinking adaptativo e o effort da tarefa', () => {
    const p = paramsDoModelo('claude-sonnet-5', { effort: 'low' });
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.output_config).toEqual({ effort: 'low' });
  });

  it('Sonnet sem effort definido usa "medium" como padrão', () => {
    const p = paramsDoModelo('claude-sonnet-5', {});
    expect(p.output_config.effort).toBe('medium');
  });
});

describe('imagens anexadas (diagnóstico com prints)', () => {
  const ok = { media_type: 'image/jpeg', data: 'QUJD' };

  it('sem imagens devolve lista vazia (o fluxo só de texto não muda)', () => {
    expect(validarImagens(undefined)).toEqual([]);
    expect(validarImagens(null)).toEqual([]);
  });

  it('aceita JPG/PNG/WebP em base64 e descarta campos extras', () => {
    expect(validarImagens([{ ...ok, nome: 'x', lixo: 1 }])).toEqual([ok]);
  });

  it('recusa tipo não suportado, base64 inválido e excesso de imagens', () => {
    expect(() => validarImagens([{ media_type: 'application/pdf', data: 'QUJD' }])).toThrow(/JPG, PNG/);
    expect(() => validarImagens([{ media_type: 'image/png', data: 'não é base64!' }])).toThrow(/inválida/);
    expect(() => validarImagens(Array(MAX_IMAGENS + 1).fill(ok))).toThrow(/no máximo/);
    expect(() => validarImagens('x')).toThrow(/formato inválido/);
  });

  it('só o diagnóstico e a leitura de prints do Instagram aceitam imagens', () => {
    expect(TAREFAS.diagnostico.imagens).toBe(true);
    expect(Object.entries(TAREFAS).filter(([, t]) => t.imagens).map(([n]) => n)).toEqual(['diagnostico', 'leitura_prints', 'leitura_provas', 'leitura_resultados']);
  });

  it('monta os blocos com as imagens antes do texto', () => {
    const b = blocosComImagens('pedido', [ok]);
    expect(b.map((x) => x.type)).toEqual(['image', 'text']);
    expect(b[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'QUJD' });
    expect(b[1].text).toBe('pedido');
  });

  it('lê a linha "result" da saída stream-json da CLI (e o JSON único no modo normal)', () => {
    const stream = ['{"type":"system"}', '{"type":"assistant"}', '{"type":"result","result":"ok","is_error":false,"usage":{"input_tokens":9}}', ''].join('\n');
    expect(lerSaidaCli(stream, true).result).toBe('ok');
    expect(lerSaidaCli('{"result":"x"}', false).result).toBe('x');
    expect(() => lerSaidaCli('{"type":"system"}', true)).toThrow();
  });
});
