// "Analisar e recomendar" e "Plano de otimização": leitura da IA conferida, perguntas, caminho sem IA e só o aceito vira coisa.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  blocoFontes, normalizarRecomendacao, perguntasFaltantes, recomendacaoSemIA, aplicarAceitos, diferencas, normalizarOtimizacao, planoSemIA, acoesParaTarefas,
} from './recomendacao.js';
import { compararDestinos } from './destinos.js';
import { CONFIRA } from './anuncio.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/ia/recomendacao-moda.json', import.meta.url), 'utf8'));
const cliente = { id: 'c1', nome: 'Loja Moda', nicho: 'Moda feminina', comoAnuncia: { destino: 'ambos', ticketMedio: 200, margem: 40, verbaMensal: 3000, atendimento: 'rapido' } };
const produtos = [{ id: 'p1', nome: 'Vestido Midi Linho', preco: 199 }];
const resultados = [
  { destino: 'whatsapp', periodoInicio: '2026-09-01', periodoFim: '2026-09-07', gasto: 300, conversas: 60, vendasConversa: 6, faturamentoConversa: 1200, campanhaNome: 'Vestidos' },
  { destino: 'site', periodoInicio: '2026-09-01', periodoFim: '2026-09-07', gasto: 400, compras: 5, faturamento: 1000 },
  { destino: 'site', data: '2026-09-10', gasto: 100, cpa: 50, roas: 3 },
];
const { texto, ctx } = blocoFontes({
  documentos: [{ id: 'vortex', titulo: 'Metodologia Vortex', partes: [{ parte: 'Regra prática' }] }],
  pesquisa: { encontrou: true, resumo: 'r', praticas: [{ texto: 'WhatsApp com catálogo', fonte: { url: 'https://exemplo.com.br/moda-whatsapp', site: 'exemplo.com.br', data: '2026-06', desatualizada: false } }], benchmarks: [] },
  anuncios: { itens: [{ id: 'r2', titulo: 'Blusa B', diasNoAr: 90, analise: { angulo: 'provador' } }], rotulo: 'nicho "Moda feminina"' },
  resultados, nicho: { suficiente: false, nivel: 'nenhum' }, comparacao: compararDestinos(resultados),
});

describe('blocoFontes', () => {
  it('numera as fontes e diz quando o nicho não tem dado', () => {
    expect(texto).toContain('id "vortex"');
    expect(texto).toContain('id "r2" · "Blusa B" · 90 dias no ar');
    expect(texto).toContain('dados insuficientes no nicho');
    expect(texto).toContain('PRIORIDADE');
    expect(ctx.web.map((w) => w.url)).toEqual(['https://exemplo.com.br/moda-whatsapp']);
    expect(ctx.qtdResultadosCliente).toBe(3);
  });
});

describe('normalizarRecomendacao', () => {
  const rec = normalizarRecomendacao(fixture, { cliente, produtos, conferencia: ctx });
  const it_ = (id) => rec.itens.find((i) => i.id === id);
  it('destino e divisão', () => {
    expect(rec.destino).toBe('teste');
    expect(rec.divisao).toEqual({ whatsapp: 60, site: 40 });
    expect(it_('destino').fontes.resultadosCliente).toHaveLength(1);
    expect(it_('destino').resultadoEsperado).toMatchObject({ min: 45, max: 70, unidade: 'R$' });
  });
  it('objetivo e local de conversão vêm da tabela; nome inventado vira "confira"', () => {
    const e = it_('estrutura');
    expect(e.dados.objetivo.nome).toBe('Vendas');
    expect(e.dados.localConversao.nome).toBe(CONFIRA); // "Loja do Instagram" não está na tabela
    expect(e.dados.conjuntosDetalhe.map((k) => k.localConversao.nome)).toEqual(['Apps de mensagem (WhatsApp)', 'Site']);
    expect(e.dados.orcamentoDiario).toBe(100);
    expect(e.avisos.join(' ')).toContain(CONFIRA);
    expect(e.fontes.documentos[0]).toMatchObject({ id: 'vortex', parte: 'Regra prática' });
  });
  it('criativo de WhatsApp com CTA de conversa, produto ligado e só inspiração que existe', () => {
    const c = it_('criativo_1');
    expect(c.dados.cta).toBe('Enviar mensagem pelo WhatsApp');
    expect(c.dados.produtoId).toBe('p1');
    expect(c.dados.inspiracao).toEqual(['r2']);
    expect(c.avisos.join(' ')).toContain('trocado');
  });
  it('item sem fonte: rótulo, confiança baixa e sem número; narrativa que exige prova sai', () => {
    const c = it_('criativo_2');
    expect(c.semFonte).toBe(true);
    expect(c.confianca).toBe('baixa');
    expect(c.resultadoEsperado.min).toBeNull();
    expect(c.dados.narrativa).toBe('');
    expect(c.dados.produtoId).toBeNull();
    expect(c.avisos.join(' ')).toContain('não está cadastrado');
  });
  it('soma dos conjuntos diferente do total ganha aviso', () => {
    const r = normalizarRecomendacao({ estrutura: { objetivo: 'vendas', localConversao: 'apps_mensagem', orcamentoDiario: 66, conjuntosDetalhe: [{ nome: 'A', localConversao: 'apps_mensagem', orcamentoDiario: 33 }] } }, { cliente, produtos, conferencia: ctx });
    expect(r.itens[0].avisos.join(' ')).toContain('não bate com o total');
  });
  it('métricas, escala, perguntas, conflitos e mudanças', () => {
    expect(it_('metrica_1').dados).toMatchObject({ destino: 'whatsapp', escalar: 'até R$ 56' });
    expect(it_('escala').semFonte).toBe(true);
    expect(rec.perguntas[0].opcoes).toEqual(['A dona', 'Ninguém']);
    expect(rec.conflitos[0]).toContain('venceram os resultados do cliente');
    expect(rec.mudancas[0].oque).toContain('60/40');
  });
});

describe('perguntasFaltantes', () => {
  it('sem ticket, verba e nicho: perguntas com opções', () => {
    const p = perguntasFaltantes({ cliente: { nicho: '', comoAnuncia: { destino: 'whatsapp' } }, sugestaoNicho: 'Moda feminina' });
    expect(p.map((x) => x.id)).toEqual(['nicho', 'ticket', 'verba']);
    expect(p[0].opcoes).toEqual(['Moda feminina']);
    expect(p[1].opcoes.length).toBeGreaterThan(2);
  });
  it('WhatsApp com resultado mas sem venda anotada pede o registro', () => {
    const p = perguntasFaltantes({ cliente, resultados: [{ destino: 'whatsapp', conversas: 10 }] });
    expect(p.map((x) => x.id)).toEqual(['vendas_whatsapp']);
  });
});

describe('recomendacaoSemIA', () => {
  it('WhatsApp só: conjunto de apps de mensagem, CTA de conversa e métricas da margem', () => {
    const r = recomendacaoSemIA({ cliente: { ...cliente, comoAnuncia: { ...cliente.comoAnuncia, destino: 'whatsapp' } }, produtos });
    expect(r.destino).toBe('whatsapp');
    expect(r.itens.find((i) => i.id === 'estrutura').dados.conjuntosDetalhe[0].localConversao.chave).toBe('apps_mensagem');
    expect(r.itens.filter((i) => i.tipo === 'criativo').every((i) => i.dados.cta.includes('mensagem'))).toBe(true);
    expect(r.itens.find((i) => i.id === 'metrica_whatsapp').dados.pausar).toBe('acima de 80,00'.replace('acima de ', 'acima de R$ '));
  });
  it('os dois: teste com divisão pelo custo por venda e um conjunto por destino', () => {
    const r = recomendacaoSemIA({ cliente, produtos, comparacao: compararDestinos(resultados.slice(0, 2)) });
    expect(r.divisao).toEqual({ whatsapp: 60, site: 40 });
    const e = r.itens.find((i) => i.id === 'estrutura').dados;
    expect(e.conjuntosDetalhe.map((k) => k.orcamentoDiario)).toEqual([60, 40]);
  });
});

describe('aplicarAceitos (só o aceito vira coisa)', () => {
  const rec = normalizarRecomendacao(fixture, { cliente, produtos, conferencia: ctx });
  it('nada aceito = nada criado', () => {
    expect(aplicarAceitos(rec, [])).toEqual({ campanha: null, briefs: [], tarefas: [] });
  });
  it('estrutura aceita vira rascunho de campanha; criativo aceito vira brief; o resto não', () => {
    const r = aplicarAceitos(rec, ['estrutura', 'criativo_1', 'metrica_1'], { clienteId: 'c1', analiseId: 'a1', urlSite: 'https://loja.com', data: '2026-10-07' });
    expect(r.campanha).toMatchObject({ status: 'rascunho', origem: 'recomendacao', objetivo: 'Vendas', orcamentoDiario: 100, urlDestino: 'https://loja.com', criativos: [] });
    expect(r.campanha.conjuntos).toHaveLength(2);
    expect(r.campanha.estruturaTeste.criterioDecisao).toContain('escalar até R$ 56');
    expect(r.briefs).toHaveLength(1);
    expect(r.briefs[0].brief).toMatchObject({ produtoId: 'p1', cta: 'Enviar mensagem pelo WhatsApp' });
    expect(r.tarefas).toEqual([]); // a métrica foi para o critério da campanha
  });
  it('escala aceita sem estrutura vira tarefa', () => {
    const r = aplicarAceitos(rec, ['escala']);
    expect(r.campanha).toBeNull();
    expect(r.tarefas).toHaveLength(1);
    expect(r.tarefas[0].area).toBe('campanha');
  });
});

describe('diferencas (re-análise)', () => {
  it('mostra o que mudou', () => {
    const a = normalizarRecomendacao({ ...fixture, destino: { ...fixture.destino, divisao: { whatsapp: 50, site: 50 } } }, { cliente, produtos, conferencia: ctx });
    const b = normalizarRecomendacao(fixture, { cliente, produtos, conferencia: ctx });
    const d = diferencas(a, b);
    expect(d.map((x) => x.campo)).toEqual(['Destino']);
    expect(d[0].antes).toContain('50%');
    expect(d[0].depois).toContain('60%');
    expect(diferencas(b, b)).toEqual([]);
  });
});

describe('plano de otimização', () => {
  const comp = compararDestinos(resultados.slice(0, 2));
  const plano = normalizarOtimizacao({
    resumo: 'ok',
    whatsapp: [{ prioridade: 2, numero: 'conversão 10%', mudar: 'Roteiro de resposta com foto do caimento', tipo: 'roteiro_whatsapp', medir: 'conversão > 10%', fontes: { resultadosCliente: [{ periodo: 'set' }] } }, { prioridade: 1, numero: 'x', mudar: 'Responder em 5 min', tipo: 'tempo de resposta no WhatsApp' }],
    site: [{ numero: 'custo por venda R$ 80', mudar: 'Página do produto com tabela de medidas', tipo: 'pagina_produto' }, { numero: 'y', mudar: 'Frete grátis acima de R$ 299', tipo: 'oferta' }, ...Array.from({ length: 5 }, (_, i) => ({ mudar: `extra ${i}` }))],
    ondeVerba: { destino: 'whatsapp', porque: 'menor custo por venda', fontes: { resultadosCliente: [{ periodo: 'set' }] } },
  }, { conferencia: ctx, comparacao: comp });
  it('até 5 ações por lado, em ordem de prioridade, com passo do site', () => {
    expect(plano.whatsapp.map((a) => a.tipo)).toEqual(['tempo_resposta', 'roteiro_whatsapp']);
    expect(plano.site).toHaveLength(5);
    expect(plano.site.find((a) => a.tipo === 'pagina_produto').passoSite).toBe(4);
    expect(plano.site.find((a) => a.tipo === 'oferta').passoSite).toBe(6);
    expect(plano.ondeVerba.destino).toBe('whatsapp');
  });
  it('sem venda dos dois lados, "onde colocar a verba" fica indefinido', () => {
    const p = normalizarOtimizacao({ ondeVerba: { destino: 'site' } }, { conferencia: ctx, comparacao: compararDestinos([{ destino: 'whatsapp', gasto: 10, conversas: 2, data: '2026-09-01' }, { destino: 'site', gasto: 10, compras: 1, data: '2026-09-01' }]) });
    expect(p.ondeVerba.destino).toBe('indefinido');
  });
  it('ações aceitas viram tarefas; as de site levam o passo', () => {
    const t = acoesParaTarefas(plano, ['site_1', 'whatsapp_1'], { clienteId: 'c1', analiseId: 'o1' });
    expect(t).toHaveLength(2);
    expect(t.find((x) => x.area === 'site').passoSite).toBe(4);
    expect(t.find((x) => x.area === 'whatsapp').passoSite).toBeNull();
    expect(acoesParaTarefas(plano, [])).toEqual([]);
  });
  it('sem IA: pede registro de vendas do WhatsApp e usa o empate da margem', () => {
    const p = planoSemIA({ cliente, comparacao: compararDestinos([{ destino: 'whatsapp', gasto: 100, conversas: 20, data: '2026-09-01' }, { destino: 'site', gasto: 500, compras: 5, data: '2026-09-01' }]) });
    expect(p.whatsapp[0].tipo).toBe('registro');
    expect(p.site[0].numero).toContain('acima do empate');
  });
});
