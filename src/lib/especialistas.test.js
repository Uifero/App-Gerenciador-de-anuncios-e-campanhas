// Especialistas: catálogo, contexto do item analisado, leitura tolerante da resposta e isolamento nos históricos.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ESPECIALISTAS, ALVOS, TAREFA_DA_AREA, especialistaPorId, alvosDoEspecialista, contextoDoAlvo, normalizarConsulta, linhaResultado } from './especialistas.js';
import { analisesDoTipo } from './analises.js';
import { TAREFAS } from '../../server/index.js';
import { TAREFAS_IA } from './constantes.js';

// Nomes de pessoas reais ligadas aos squads e referências (o app é usado com clientes: especialista é um MÉTODO).
const NOMES_REAIS = /hormozi|sobral|schwartz|ogilvy|halbert|kennedy|sugarman|cialdini|voss|klaff|wiebe|suby|aslam|pittman|mandalia|burns|breeze|kusmich|vincenzi|brunson|gary|eugene|alex |pedro /i;

describe('catálogo', () => {
  it('6 especialistas com ids únicos, área com tarefa no servidor e rótulo em Configurações', () => {
    expect(ESPECIALISTAS.map((e) => e.id)).toEqual(['escala', 'auditoria', 'copy', 'ganchos', 'oferta', 'whatsapp']);
    for (const e of ESPECIALISTAS) {
      const tarefa = TAREFA_DA_AREA[e.area];
      expect(TAREFAS[tarefa]).toBeTruthy();
      expect(TAREFAS_IA[tarefa]?.[0]).toBeTruthy();
      expect(e.nome && e.metodo && e.icone && e.quando && e.origem).toBeTruthy();
      expect(e.foco.length).toBeGreaterThanOrEqual(5); expect(e.foco.length).toBeLessThanOrEqual(7);
      expect(e.checklist.length).toBeGreaterThanOrEqual(5); expect(e.checklist.length).toBeLessThanOrEqual(7);
      expect(e.alvos.length).toBeGreaterThan(0);
      for (const a of e.alvos) expect(Object.keys(ALVOS)).toContain(a);
    }
  });
  it('nenhum nome de pessoa real em nada do catálogo', () => {
    expect(JSON.stringify(ESPECIALISTAS)).not.toMatch(NOMES_REAIS);
  });
  it('sem número inventado: nada de US$ nem benchmark em moeda', () => {
    expect(JSON.stringify(ESPECIALISTAS)).not.toMatch(/US\$|\$\s?\d|ROAS (médio|de \d)/);
  });
  it('alvos por especialista', () => {
    expect(alvosDoEspecialista('escala')).toEqual(['campanha', 'resultados']);
    expect(alvosDoEspecialista('ganchos')).toEqual(['criativo', 'peca']); // peça da Galeria: o mesmo texto, já montado
    expect(alvosDoEspecialista('whatsapp')).toEqual(['resultados', 'oferta', 'livre']);
    expect(alvosDoEspecialista('inexistente')).toEqual([]);
    expect(especialistaPorId('copy').area).toBe('copy');
  });
});

describe('contextoDoAlvo', () => {
  const cliente = { id: 'c', marca: { ofertaAtiva: 'Frete grátis acima de R$ 150' }, comoAnuncia: { destino: 'whatsapp', ticketMedio: 120, margem: 40 } };
  const resultados = [
    { id: 'r1', criativoId: 'k1', criativoNome: 'Rotina', campanhaId: 'cp1', data: '2026-10-01', destino: 'whatsapp', gasto: 50, ctr: 1.8, conversas: 12, vendasConversa: 2 },
    { id: 'r2', criativoId: 'k2', criativoNome: 'Outro', data: '2026-10-03', destino: 'site', gasto: 30, ctr: 0.7, cpa: 45, roas: 1.2 },
  ];
  it('criativo: texto, metadados e só os resultados dele', () => {
    const t = contextoDoAlvo({ tipo: 'criativo', item: { id: 'k1', nome: 'Rotina', hook: 'H', copy: 'C', cta: 'CTA', angulo: 'rotina', framework: 'PAS', formato: 'video_curto', status: 'rascunho' }, resultados });
    expect(t).toContain('CRIATIVO "Rotina" (status rascunho)');
    expect(t).toContain('Hook: H');
    expect(t).toContain('conversas 12');
    expect(t).not.toContain('Outro');
  });
  it('campanha: conjuntos, orçamento e resultados ligados', () => {
    const t = contextoDoAlvo({ tipo: 'campanha', item: { id: 'cp1', nome: 'Teste', status: 'ativa', objetivo: 'vendas', orcamentoDiario: 60, resumo: 'Dois públicos', conjuntos: [{ nome: 'Frio', publico: { nome: 'Interesses' }, orcamentoDiario: 30, criativos: [{ criativoId: 'k1', criativoNome: 'Rotina' }] }] }, resultados });
    expect(t).toContain('Orçamento diário total: R$ 60');
    expect(t).toContain('- Frio: público Interesses, R$ 30/dia, criativos: Rotina');
    expect(t).toContain('Rotina · WhatsApp');
    expect(t).not.toContain('Outro');
  });
  it('oferta: produtos reais, oferta ativa e ticket/margem/destino; sem produto, diz que não há', () => {
    const t = contextoDoAlvo({ tipo: 'oferta', cliente, produtos: [{ nome: 'Caps', preco: 99.9, beneficios: 'disposição' }, { nome: 'Velho', arquivado: true }] });
    expect(t).toContain('- Caps · preço R$ 99.9 · benefícios: disposição');
    expect(t).not.toContain('Velho');
    expect(t).toContain('Oferta ativa no perfil: Frete grátis acima de R$ 150');
    expect(t).toContain('Ticket médio: R$ 120 · Margem: 40%');
    expect(contextoDoAlvo({ tipo: 'oferta', cliente: {}, produtos: [] })).toContain('Produtos cadastrados: nenhum.');
  });
  it('resultados: até 10, do mais novo; livre: vazio', () => {
    const muitos = Array.from({ length: 14 }, (_, i) => ({ data: `2026-09-${String(i + 1).padStart(2, '0')}`, gasto: i }));
    const t = contextoDoAlvo({ tipo: 'resultados', resultados: muitos });
    expect(t.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(10);
    expect(t.split('\n')[1]).toContain('2026-09-14');
    expect(contextoDoAlvo({ tipo: 'resultados', resultados: [] })).toContain('nenhum registrado');
    expect(contextoDoAlvo({ tipo: 'livre' })).toBe('');
  });
  it('linha de resultado só com o que existe', () => {
    expect(linhaResultado({ data: '2026-10-01', campanhaNome: 'Geral', ctr: 1 })).toBe('- 2026-10-01 · Geral · CTR 1%');
  });
});

describe('normalizarConsulta', () => {
  it('aceita chaves trocadas e faltando', () => {
    const r = normalizarConsulta({
      diagnostico: 'Falta prova.',
      criterios: [{ criterio: 'Gancho', status: 'bom', motivo: 'cena concreta' }, { nome: 'Prova', avaliacao: 'sem dado' }, 'Texto solto', { ponto: '' }],
      recomendacoes: [{ ordem: 2, titulo: 'Segunda', justificativa: 'b' }, { prioridade: 1, acao: 'Primeira' }, 'Terceira solta'],
      duvidas: [{ pergunta: 'Tem garantia?' }, 'Qual o prazo?'],
    });
    expect(r.resumo).toBe('Falta prova.');
    expect(r.pontos).toEqual([{ ponto: 'Gancho', avaliacao: 'ok', porque: 'cena concreta' }, { ponto: 'Prova', avaliacao: 'falta_dado', porque: '' }, { ponto: 'Texto solto', avaliacao: 'ajustar', porque: '' }]);
    expect(r.acoes.map((a) => [a.prioridade, a.acao])).toEqual([[1, 'Primeira'], [2, 'Segunda'], [3, 'Terceira solta']]);
    expect(r.perguntas).toEqual(['Tem garantia?', 'Qual o prazo?']);
    expect(r.avisos).toEqual([]);
  });
  it('resposta vazia ou estranha não quebra', () => {
    expect(normalizarConsulta(null)).toEqual({ resumo: '', pontos: [], acoes: [], perguntas: [], avisos: [] });
    expect(normalizarConsulta([1, 2]).pontos).toEqual([]);
  });
  it('resposta real gravada (Thermora, copy)', () => {
    const { texto } = JSON.parse(readFileSync('tests/fixtures/ia/especialista-thermora-real.json', 'utf8'));
    const r = normalizarConsulta(JSON.parse(texto));
    expect(r.resumo.length).toBeGreaterThan(50);
    expect(r.pontos.length).toBeGreaterThan(3);
    expect(r.pontos.some((p) => p.avaliacao === 'falta_dado')).toBe(true); // o relato de 30 dias não tem dado
    expect(r.acoes.length).toBeGreaterThan(0); expect(r.acoes.length).toBeLessThanOrEqual(5);
    expect(r.acoes[0].prioridade).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(NOMES_REAIS);
  });
});

describe('históricos de COL.analises', () => {
  it('consulta de especialista não aparece no histórico de recomendação nem no de otimização', () => {
    const analises = [
      { id: 'e1', tipo: 'especialista', criadoEm: '2026-10-08T10:00:00Z' },
      { id: 'r1', tipo: 'recomendacao', criadoEm: '2026-10-07T10:00:00Z' },
      { id: 'o1', tipo: 'otimizacao', criadoEm: '2026-10-06T10:00:00Z' },
      { id: 'r2', tipo: 'recomendacao', criadoEm: '2026-10-08T09:00:00Z' },
    ];
    expect(analisesDoTipo(analises, 'recomendacao').map((a) => a.id)).toEqual(['r2', 'r1']);
    expect(analisesDoTipo(analises, 'otimizacao').map((a) => a.id)).toEqual(['o1']);
    expect(analisesDoTipo(analises, 'especialista').map((a) => a.id)).toEqual(['e1']);
  });
});
