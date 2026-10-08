// Aplicar sugestões do especialista: classificação das ações, instrução da reescrita, "Atual × Com a mudança",
// bloqueio de saúde/colchete, nova versão, tarefa e o resumo do histórico.
import { describe, it, expect } from 'vitest';
import {
  classificarAcao, tipoDaAcao, campoProvavel, instrucaoDaAcao, propostaDeMudanca, motivoBloqueioTexto, versaoNova, tarefaDaAcao, resumoAplicacoes, CAMPOS_FALTA,
} from './aplicar-especialista.js';

const thermora = { id: 'cliT', nicho: 'suplementos', marca: { produtoSaude: true } };
const moda = { id: 'cliM', nicho: 'moda feminina', marca: { produtoSaude: false } };
const criativo = { id: 'cr1', hook: 'Testei uma cápsula de manhã por 30 dias.', copy: 'Cena 1: cozinha, copo d’água.', cta: 'Chama no WhatsApp', modeloGancho: 37, versoes: [{ n: 1, hook: 'x' }], angulo: 'rotina', framework: 'AIDA', formato: 'video_curto' };

describe('classificarAcao', () => {
  it('usa o tipo que a IA mandou', () => {
    expect(classificarAcao({ acao: 'qualquer', tipo: 'hook' }, { alvoTipo: 'criativo' })).toMatchObject({ tipo: 'hook', modo: 'reescrever' });
    expect(classificarAcao({ acao: 'qualquer', tipo: 'cta' }, { alvoTipo: 'peca' })).toMatchObject({ modo: 'peca' });
    expect(classificarAcao({ acao: 'Subir 20% a verba', tipo: 'campanha' }, { alvoTipo: 'campanha' })).toMatchObject({ modo: 'tarefa' });
    expect(classificarAcao({ acao: 'x', tipo: 'falta_dado', campo: 'provasSociais' })).toMatchObject({ modo: 'falta_dado', campo: 'provasSociais' });
  });
  it('sem tipo (consulta antiga): palpite pelo texto e pela área', () => {
    expect(tipoDaAcao({ acao: 'Trocar o gancho por uma pergunta' }, { alvoTipo: 'criativo' })).toBe('hook');
    expect(tipoDaAcao({ acao: 'Deixar o CTA mais claro' }, { alvoTipo: 'criativo' })).toBe('cta');
    expect(tipoDaAcao({ acao: 'Cadastrar depoimentos reais no perfil' }, { alvoTipo: 'criativo' })).toBe('falta_dado');
    expect(tipoDaAcao({ acao: 'Responder em até 5 minutos no WhatsApp' }, { area: 'oferta' })).toBe('whatsapp');
    expect(tipoDaAcao({ acao: 'Esperar 3 dias' }, { area: 'trafego' })).toBe('campanha');
    expect(tipoDaAcao({ acao: 'Observar' }, { area: 'copy', alvoTipo: 'livre' })).toBe('outro');
  });
  it('texto de criativo fora de um criativo: diz por que não dá', () => {
    const k = classificarAcao({ acao: 'x', tipo: 'copy' }, { alvoTipo: 'livre' });
    expect(k.modo).toBe(null);
    expect(k.motivo).toMatch(/consulte o especialista sobre o criativo/);
    expect(classificarAcao({ acao: 'x', tipo: 'copy' }, { alvoTipo: 'criativo', temCriativo: false }).motivo).toMatch(/excluído/);
  });
  it('falta de dado sem campo: palpite; sem palpite, motivo', () => {
    expect(campoProvavel('Falta a oferta ativa')).toBe('ofertaAtiva');
    expect(classificarAcao({ acao: 'Confirmar o preço com o cliente' }).campo).toBe('preco');
    expect(classificarAcao({ acao: 'Confirmar com o cliente o tom', tipo: 'falta_dado' }).motivo).toMatch(/não sabe onde fica/);
    expect(Object.values(CAMPOS_FALTA).every((c) => c.rotulo && c.onde)).toBe(true);
  });
});

describe('reescrita', () => {
  it('a instrução pede só a mudança e proíbe inventar', () => {
    const t = instrucaoDaAcao({ acao: 'Trazer a objeção para os 3 primeiros segundos', porque: 'perde gente' }, 'hook');
    expect(t).toMatch(/SÓ esta mudança/);
    expect(t).toMatch(/o gancho \(hook\)/);
    expect(t).toMatch(/Não invente/);
  });
  it('Atual × Com a mudança mostra só o que mudou; campo vazio da IA mantém o atual', () => {
    const p = propostaDeMudanca(criativo, { hook: 'Medo de acelerar? Testei 1 cápsula por 30 dias.', copy: '', cta: 'Chama no WhatsApp', explicacao: 'Objeção no gancho.' }, moda);
    expect(p.campos).toEqual(['hook']);
    expect(p.depois.copy).toBe(criativo.copy);
    expect(p.bloqueio).toBe('');
    expect(p.explicacao).toBe('Objeção no gancho.');
  });
  it('reescrita que cria promessa de saúde é bloqueada (Thermora)', () => {
    const p = propostaDeMudanca(criativo, { hook: 'Acelera o seu metabolismo de manhã', copy: criativo.copy, cta: criativo.cta }, thermora);
    expect(p.bloqueio).toMatch(/Não dá para salvar/);
    expect(p.bloqueio).toMatch(/metabolismo/);
    // o mesmo texto num cliente que não é de saúde passa
    expect(propostaDeMudanca(criativo, { hook: 'Acelera o seu metabolismo de manhã' }, moda).bloqueio).toBe('');
  });
  it('colchete do modelo de gancho é bloqueado', () => {
    expect(motivoBloqueioTexto({ hook: 'Eu testei [produto] por 30 dias', copy: '', cta: '' }, moda, 37)).toMatch(/colchete/);
  });
  it('nova versão: anterior fica no histórico, número = maior + 1, com ângulo/framework vigentes', () => {
    const patch = versaoNova(criativo, { hook: 'Novo', copy: criativo.copy, cta: criativo.cta }, 'Especialista (Copy): x');
    expect(patch.versoes).toHaveLength(2);
    expect(patch.versoes[0]).toEqual(criativo.versoes[0]);
    expect(patch.versoes[1]).toMatchObject({ n: 2, hook: 'Novo', angulo: 'rotina', framework: 'AIDA', nota: 'Especialista (Copy): x' });
    expect(criativo.versoes).toHaveLength(1); // não muda o criativo: quem grava é o "Aceitar"
  });
});

describe('tarefa e histórico', () => {
  it('ação de campanha vira tarefa com o lugar onde fazer; nada no Meta', () => {
    const t = tarefaDaAcao({ acao: 'Duplicar o conjunto vencedor', porque: 'CPA estável' }, 'campanha', { clienteId: 'c1', analiseId: 'a1', especialista: 'Escala', alvo: { nome: 'Campanha X' } });
    expect(t).toMatchObject({ clienteId: 'c1', analiseId: 'a1', origem: 'especialista', area: 'campanha', status: 'aberta', titulo: 'Duplicar o conjunto vencedor' });
    expect(t.texto).toMatch(/Gerenciador de Anúncios/);
    expect(t.texto).toMatch(/não mexe no Meta/);
    expect(tarefaDaAcao({ acao: 'x' }, 'whatsapp', { clienteId: 'c1' }).area).toBe('whatsapp');
  });
  it('resumo das aplicações para o histórico', () => {
    expect(resumoAplicacoes({ aplicacoes: { 0: { status: 'aceita' }, 1: { status: 'descartada' }, 2: { status: 'aceita' }, 3: { status: 'tarefa' } } })).toBe('aplicada: 2, descartada: 1, virou tarefa: 1');
    expect(resumoAplicacoes({})).toBe('');
  });
});
