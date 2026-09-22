// Testes das regras puras de semáforo, "hora de escalar" e checklist de lançamento (sem DOM/Firebase).
import { describe, it, expect } from 'vitest';
import { semaforo, horaDeEscalar, checklistLancamento, TOLERANCIA } from './metricas.js';

const cfg = { diasSemaforo: 7, diasEscalar: 7 };
const dia = (n) => `2026-09-${String(n).padStart(2, '0')}`; // datas simples do mesmo mês, sem hora

describe('semaforo', () => {
  it('sem_meta quando o cliente não tem meta de CPA nem ROAS', () => {
    expect(semaforo([{ data: dia(10), cpa: 20 }], {}, cfg)).toEqual({ estado: 'sem_meta' });
  });

  it('sem_dados quando há meta mas nenhum resultado com data', () => {
    expect(semaforo([], { cpa: 20 }, cfg)).toEqual({ estado: 'sem_dados' });
    expect(semaforo([{ cpa: 20 }], { cpa: 20 }, cfg)).toEqual({ estado: 'sem_dados' }); // sem "data"
  });

  it('verde quando o CPA está na meta ou melhor', () => {
    const r = semaforo([{ data: dia(10), cpa: 18 }], { cpa: 20 }, cfg);
    expect(r.estado).toBe('verde');
  });

  it('amarelo até a tolerância (20% pior que a meta)', () => {
    const r = semaforo([{ data: dia(10), cpa: 24 }], { cpa: 20 }, cfg); // 24/20 = 1.2 = exatamente o limite
    expect(r.estado).toBe('amarelo');
  });

  it('vermelho acima da tolerância', () => {
    const r = semaforo([{ data: dia(10), cpa: 24.5 }], { cpa: 20 }, cfg);
    expect(r.estado).toBe('vermelho');
  });

  it('ROAS usa a direção oposta (maior é melhor)', () => {
    expect(semaforo([{ data: dia(10), roas: 5 }], { roas: 4 }, cfg).estado).toBe('verde');
    expect(semaforo([{ data: dia(10), roas: 3.3 }], { roas: 4 }, cfg).estado).toBe('amarelo'); // 3.3/4 = 0.825
    expect(semaforo([{ data: dia(10), roas: 3 }], { roas: 4 }, cfg).estado).toBe('vermelho'); // 3/4 = 0.75
  });

  it('com as duas metas, vale a pior cor', () => {
    // CPA verde (na meta) mas ROAS vermelho (bem abaixo) -> vermelho prevalece
    const r = semaforo([{ data: dia(10), cpa: 15, roas: 1 }], { cpa: 20, roas: 4 }, cfg);
    expect(r.estado).toBe('vermelho');
  });

  it('só considera resultados dentro da janela de dias (cfg.diasSemaforo)', () => {
    const resultados = [
      { data: dia(1), cpa: 100 }, // fora da janela de 7 dias a partir do dia 10
      { data: dia(10), cpa: 18 },
    ];
    const r = semaforo(resultados, { cpa: 20 }, cfg);
    expect(r.estado).toBe('verde'); // só o registro recente entra na média
    expect(r.n).toBe(1);
  });

  it('média ponderada pelo gasto favorece o dia com mais gasto', () => {
    const resultados = [
      { data: dia(9), cpa: 10, gasto: 10 },
      { data: dia(10), cpa: 30, gasto: 90 }, // pesa mais: média puxada para perto de 30
    ];
    const r = semaforo(resultados, { cpa: 20 }, cfg);
    expect(r.cpa).toBeCloseTo(28, 5); // (10*10 + 30*90)/100 = 28
  });
});

describe('horaDeEscalar', () => {
  const metas = { cpa: 20 };
  const criativoEmUso = { id: 'c1', nome: 'Criativo 1', status: 'em_uso' };
  const agora = new Date(dia(15) + 'T00:00:00Z').getTime();

  it('devolve [] sem meta configurada', () => {
    expect(horaDeEscalar([], [criativoEmUso], {}, cfg, agora)).toEqual([]);
  });

  it('ignora criativos que não estão em uso', () => {
    const pausado = { ...criativoEmUso, status: 'pausado' };
    const resultados = Array.from({ length: 8 }, (_, i) => ({ criativoId: 'c1', data: dia(1 + i), cpa: 10 }));
    expect(horaDeEscalar(resultados, [pausado], metas, cfg, agora)).toEqual([]);
  });

  it('reconhece uma sequência de dias batendo a meta (>= diasEscalar)', () => {
    // 8 dias seguidos (1 a 8) batendo a meta de CPA 20
    const resultados = Array.from({ length: 8 }, (_, i) => ({ criativoId: 'c1', data: dia(1 + i), cpa: 10 }));
    const out = horaDeEscalar(resultados, [criativoEmUso], metas, cfg, agora);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ criativoId: 'c1', nome: 'Criativo 1' });
    expect(out[0].dias).toBeGreaterThanOrEqual(7);
  });

  it('uma quebra na sequência reinicia a contagem a partir do dia mais recente', () => {
    const resultados = [
      { criativoId: 'c1', data: dia(1), cpa: 10 }, // bate, mas...
      { criativoId: 'c1', data: dia(2), cpa: 999 }, // ...quebra aqui
      { criativoId: 'c1', data: dia(3), cpa: 10 },
      { criativoId: 'c1', data: dia(4), cpa: 10 },
    ]; // só 2 dias consecutivos batendo depois da quebra: não alcança o mínimo de 7
    expect(horaDeEscalar(resultados, [criativoEmUso], metas, cfg, agora)).toEqual([]);
  });

  it('ignora sequência antiga demais (não é mais "recente")', () => {
    // sequência de 8 dias, mas terminando há muito mais que 14 dias do "agora"
    const resultados = Array.from({ length: 8 }, (_, i) => ({ criativoId: 'c1', data: `2026-01-${String(10 + i).padStart(2, '0')}`, cpa: 10 }));
    expect(horaDeEscalar(resultados, [criativoEmUso], metas, cfg, agora)).toEqual([]);
  });

  it('com as duas metas, exige as duas batendo no mesmo dia', () => {
    const metasDuas = { cpa: 20, roas: 4 };
    const resultados = Array.from({ length: 8 }, (_, i) => ({ criativoId: 'c1', data: dia(1 + i), cpa: 10, roas: 1 })); // ROAS nunca bate
    expect(horaDeEscalar(resultados, [criativoEmUso], metasDuas, cfg, agora)).toEqual([]);
  });
});

describe('checklistLancamento', () => {
  const clienteBase = { id: 'cl1', escopo: { criativos: true, campanhas: true, site: true }, marca: {} };

  it('etapa de perfil aparece incompleta quando faltam tom de voz, dor ou USP', () => {
    const r = checklistLancamento({ cliente: clienteBase, criativos: [], campanhas: [] });
    const perfil = r.etapas.find((e) => e.id === 'perfil');
    expect(perfil.feito).toBe(false);
    expect(perfil.detalhe).toContain('tom de voz');
  });

  it('etapa de perfil fica completa com tom de voz, dor e USP preenchidos', () => {
    const cliente = { ...clienteBase, marca: { tomDeVoz: 'leve', linguagemDor: 'dói', usp: 'único' } };
    const r = checklistLancamento({ cliente, criativos: [], campanhas: [] });
    expect(r.etapas.find((e) => e.id === 'perfil').feito).toBe(true);
  });

  it('só inclui etapas dos módulos que estão no escopo do cliente', () => {
    const cliente = { ...clienteBase, escopo: { criativos: true, campanhas: false, site: false } };
    const r = checklistLancamento({ cliente, criativos: [], campanhas: [] });
    expect(r.etapas.map((e) => e.id)).toEqual(['perfil', 'criativos']);
  });

  it('etapa de site inclui o handoff só quando o site está no escopo', () => {
    const r = checklistLancamento({ cliente: clienteBase, criativos: [], campanhas: [], site: { status: 'publicado', versaoManual: 2 } });
    expect(r.etapas.find((e) => e.id === 'site').feito).toBe(true);
    expect(r.etapas.find((e) => e.id === 'handoff').feito).toBe(true);
  });

  it('calcula o percentual pelas etapas concluídas', () => {
    const cliente = { ...clienteBase, escopo: { criativos: true, campanhas: true, site: false }, marca: { tomDeVoz: 'x', linguagemDor: 'x', usp: 'x' } };
    // perfil (feito) + criativos (feito, 1 item) + campanha (não feito, 0 itens) = 2 de 3
    const r = checklistLancamento({ cliente, criativos: [{ id: 'x' }], campanhas: [] });
    expect(r.total).toBe(3);
    expect(r.feitas).toBe(2);
    expect(r.percentual).toBe(67);
  });
});

it('TOLERANCIA é exportada e usada nos testes acima (20%)', () => {
  expect(TOLERANCIA).toBe(0.2);
});
