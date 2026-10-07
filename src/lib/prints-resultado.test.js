// Prints de resultado: leitura para revisão (nada salvo direto), sem dado pessoal, vínculo, duplicado e período.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { extrairJSON } from '../core/ia.js';
import { juntarItensSoltos, normalizarLeituraPrints, avisoPeriodos, printDuplicado, vincularLinha, linhaParaResultado, numeroDoPrint, limparPessoal, AVISO_PESSOAL } from './prints-resultado.js';

const leituraIA = {
  imagens: [
    { numero: 1, tipo: 'gerenciador', periodo: { inicio: '2026-09-01', fim: '2026-09-07' }, linhas: [
      { nivel: 'campanha', campanha: 'Vestidos | WhatsApp', destino: 'whatsapp', gasto: 'R$ 312,40', impressoes: '18.230', alcance: '9.870', ctr: '1,85%', cpm: 'R$ 17,14', conversas: '64', custoConversa: 'R$ 4,88' },
    ] },
    { numero: 2, tipo: 'gerenciador', periodo: { inicio: '01/09/2026', fim: '15/09/2026' }, linhas: [
      { campanha: 'Vestido Midi Linho - Site', gasto: '410,00', cliques: '520', compras: '5', custoCompra: '82,00', faturamento: '1.045,00', roas: '2,55' },
      { campanha: 'Contato (11) 98765-4321', gasto: '10' },
    ] },
    { numero: 3, tipo: 'conversa', dadosPessoais: true, linhas: [{ campanha: 'Maria', gasto: '100' }] },
  ],
};

describe('normalizarLeituraPrints', () => {
  const l = normalizarLeituraPrints(leituraIA, 4);
  it('lê os números no formato brasileiro e o período', () => {
    expect(l[0].periodo).toEqual({ inicio: '2026-09-01', fim: '2026-09-07' });
    expect(l[0].linhas[0]).toMatchObject({ destino: 'whatsapp', gasto: 312.4, impressoes: 18230, ctr: 1.85, conversas: 64, custoConversa: 4.88 });
    expect(l[1].periodo).toEqual({ inicio: '2026-09-01', fim: '2026-09-15' });
    expect(l[1].linhas[0]).toMatchObject({ destino: 'site', compras: 5, faturamento: 1045, roas: 2.55 });
  });
  it('telefone em nome de campanha é removido', () => {
    expect(l[1].linhas[1].campanha).toBe('Contato [removido]');
    expect(l[1].observacao).toContain('removido');
  });
  it('print de conversa: nada extraído, fica interno', () => {
    expect(l[2]).toMatchObject({ tipo: 'conversa', dadosPessoais: true, linhas: [] });
    expect(l[2].observacao).toBe(AVISO_PESSOAL);
  });
  it('print que a IA não leu continua na lista para preencher à mão', () => {
    expect(l[3]).toMatchObject({ numero: 4, tipo: 'ilegivel', linhas: [] });
  });
  it('períodos diferentes entre os prints geram aviso', () => {
    expect(avisoPeriodos(l)).toContain('períodos diferentes');
    expect(avisoPeriodos([l[0], { ...l[1], periodo: l[0].periodo }])).toBe('');
  });
});

describe('detalhes', () => {
  it('numeroDoPrint entende "mil" e traço', () => {
    expect(numeroDoPrint('1,2 mil')).toBe(1200);
    expect(numeroDoPrint('—')).toBeNull();
  });
  it('limparPessoal não confunde data com telefone', () => {
    expect(limparPessoal('Campanha 2026-10-01 a 2026-10-07')).toBe('Campanha 2026-10-01 a 2026-10-07');
    expect(limparPessoal('fale com ana@ex.com')).toBe('fale com [removido]');
  });
  it('print repetido (mesmo arquivo) é reconhecido', () => {
    expect(printDuplicado('abc', [{ id: 'x', hash: 'abc' }])).toEqual({ id: 'x', hash: 'abc' });
    expect(printDuplicado('zzz', [{ id: 'x', hash: 'abc' }])).toBeNull();
    expect(printDuplicado(null, [{ hash: null }])).toBeNull();
  });
});

describe('vínculo e resultado (só depois da revisão)', () => {
  const campanhas = [{ id: 'k1', nome: 'Vestidos | WhatsApp' }, { id: 'k2', nome: 'Outra' }];
  const criativos = [{ id: 'cr1', nome: 'Provador em casa', produtoId: 'p1', angulo: 'caimento' }];
  const produtos = [{ id: 'p1', nome: 'Vestido Midi Linho' }, { id: 'p2', nome: 'Vestido' }];
  it('liga campanha pelo nome e produto pelo nome no anúncio', () => {
    expect(vincularLinha({ campanha: 'Vestidos | WhatsApp' }, { campanhas, criativos, produtos })).toMatchObject({ campanhaId: 'k1' });
    expect(vincularLinha({ campanha: 'Vestido Midi Linho - Site' }, { campanhas, criativos, produtos }).produtoId).toBe('p1'); // o nome mais longo vence
    expect(vincularLinha({ anuncio: 'Provador em casa' }, { campanhas, criativos, produtos })).toMatchObject({ criativoId: 'cr1', produtoId: 'p1' });
  });
  it('linha confirmada vira resultado com período, destino e venda do WhatsApp anotada na revisão', () => {
    const r = linhaParaResultado({ campanha: 'Vestidos | WhatsApp', destino: 'whatsapp', gasto: 312.4, conversas: 64, vendasConversa: 6, faturamentoConversa: 1100, campanhaId: 'k1', criativoId: 'cr1' },
      { clienteId: 'c1', periodo: { inicio: '2026-09-01', fim: '2026-09-07' }, printId: 'pr1', criativos, campanhas });
    expect(r).toMatchObject({ clienteId: 'c1', origem: 'print', printId: 'pr1', destino: 'whatsapp', gasto: 312.4, conversas: 64, vendasConversa: 6, faturamentoConversa: 1100, periodoInicio: '2026-09-01', periodoFim: '2026-09-07', data: '2026-09-07', criativoId: 'cr1', produtoId: 'p1', angulo: 'caimento', campanhaNome: 'Vestidos | WhatsApp', cpa: null });
  });
  it('site: CPA do custo por compra ou do gasto ÷ compras; ROAS do faturamento', () => {
    const r = linhaParaResultado({ destino: 'site', gasto: 400, compras: 5, faturamento: 1000 }, { clienteId: 'c1' });
    expect(r).toMatchObject({ cpa: 80, roas: 2.5, vendasConversa: null });
  });
});

describe('resposta real da IA (tests/fixtures/ia/leitura-prints-real.json)', () => {
  const real = JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/ia/leitura-prints-real.json', import.meta.url), 'utf8'));
  it('recupera o print que ficou fora da lista e não extrai nada da conversa', () => {
    const bruto = extrairJSON(real.texto);
    expect(bruto.imagens.map((i) => i.numero)).toEqual([1, 2]); // o extrator para no colchete fechado cedo
    const l = normalizarLeituraPrints(juntarItensSoltos(bruto, real.texto), 3);
    expect(l[0].linhas[0]).toMatchObject({ destino: 'whatsapp', gasto: 312.4, conversas: 64, custoConversa: 4.88 });
    expect(l[1].linhas[0]).toMatchObject({ destino: 'site', gasto: 410, compras: 5, faturamento: 1045, roas: 2.55 });
    expect(l[2]).toMatchObject({ tipo: 'conversa', dadosPessoais: true, linhas: [] });
    expect(avisoPeriodos(l)).toContain('períodos diferentes');
  });
  it('item que já veio na lista não é trocado', () => {
    expect(juntarItensSoltos({ imagens: [{ numero: 1, tipo: 'x' }] }, '{"numero": 1, "tipo": "y"}').imagens).toEqual([{ numero: 1, tipo: 'x' }]);
  });
});
