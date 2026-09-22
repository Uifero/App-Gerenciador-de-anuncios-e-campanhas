// Testes dos dois alertas novos da Central de Alertas: aprovação enviada sem resposta e criativo sem decisão.
import { describe, it, expect } from 'vitest';
import { resumoCliente, agregar, painelAlertas } from './alertas.js';

const DIA = 864e5;
const hasDias = (n) => new Date(Date.now() - n * DIA).toISOString();
const cfg = { diasSemaforo: 7, diasEscalar: 7, diasAprovacaoPendente: 5, diasCriativoSemDecisao: 10 };
const cliente = { id: 'cl1', nome: 'Cliente 1', metas: {}, escopo: { criativos: true } };
const vazio = { criativos: [], resultados: [], campanhas: [], sites: [] };
const criativo = (over) => ({ id: 'x1', clienteId: cliente.id, nome: 'Criativo X', ...over });

describe('resumoCliente — aprovacaoPendente', () => {
  it('lista criativo "pronto_aprovacao" enviado há mais dias que o limite', () => {
    const c = criativo({ status: 'pronto_aprovacao', aprovacaoEnviadaEm: hasDias(6) });
    const r = resumoCliente(cliente, { ...vazio, criativos: [c] }, cfg);
    expect(r.aprovacaoPendente).toHaveLength(1);
    expect(r.aprovacaoPendente[0]).toMatchObject({ criativoId: 'x1', nome: 'Criativo X' });
  });

  it('não alerta antes do limite configurado', () => {
    const c = criativo({ status: 'pronto_aprovacao', aprovacaoEnviadaEm: hasDias(2) });
    const r = resumoCliente(cliente, { ...vazio, criativos: [c] }, cfg);
    expect(r.aprovacaoPendente).toEqual([]);
  });

  it('não alerta criativos com outros status (só pronto_aprovacao conta)', () => {
    const c = criativo({ status: 'rascunho', aprovacaoEnviadaEm: hasDias(30) });
    const r = resumoCliente(cliente, { ...vazio, criativos: [c] }, cfg);
    expect(r.aprovacaoPendente).toEqual([]);
  });

  it('usa o limiar padrão (5 dias) quando a configuração não define diasAprovacaoPendente', () => {
    const c = criativo({ status: 'pronto_aprovacao', aprovacaoEnviadaEm: hasDias(6) });
    const r = resumoCliente(cliente, { ...vazio, criativos: [c] }, { diasSemaforo: 7, diasEscalar: 7 });
    expect(r.aprovacaoPendente).toHaveLength(1);
  });
});

describe('resumoCliente — semDecisao', () => {
  it('lista criativo em rascunho criado há mais dias que o limite', () => {
    const c = criativo({ id: 'y1', nome: 'Criativo Y', status: 'rascunho', criadoEm: hasDias(12) });
    const r = resumoCliente(cliente, { ...vazio, criativos: [c] }, cfg);
    expect(r.semDecisao).toHaveLength(1);
    expect(r.semDecisao[0]).toMatchObject({ criativoId: 'y1', nome: 'Criativo Y' });
  });

  it('não alerta criativos já decididos (aprovado, em_uso, pausado, encerrado, pronto_aprovacao)', () => {
    const status = ['aprovado', 'em_uso', 'pausado', 'encerrado', 'pronto_aprovacao'];
    const criativos = status.map((s, i) => criativo({ id: 'z' + i, nome: 'C' + i, status: s, criadoEm: hasDias(90) }));
    const r = resumoCliente(cliente, { ...vazio, criativos }, cfg);
    expect(r.semDecisao).toEqual([]);
  });

  it('não alerta antes do limite configurado', () => {
    const c = criativo({ id: 'y1', nome: 'Criativo Y', status: 'rascunho', criadoEm: hasDias(3) });
    const r = resumoCliente(cliente, { ...vazio, criativos: [c] }, cfg);
    expect(r.semDecisao).toEqual([]);
  });
});

describe('agregar', () => {
  it('junta os alertas de aprovação pendente e sem decisão de vários clientes', () => {
    const itens = [
      { cliente: { id: 'a', nome: 'A' }, resumo: { fadiga: [], escalar: [], sem: { estado: 'sem_dados' }, aprovacaoPendente: [{ criativoId: '1', nome: 'X', dias: 6 }], semDecisao: [] } },
      { cliente: { id: 'b', nome: 'B' }, resumo: { fadiga: [], escalar: [], sem: { estado: 'sem_dados' }, aprovacaoPendente: [], semDecisao: [{ criativoId: '2', nome: 'Y', dias: 15 }] } },
    ];
    const out = agregar(itens);
    expect(out.aprovacaoPendente).toHaveLength(1);
    expect(out.aprovacaoPendente[0].cliente.id).toBe('a');
    expect(out.semDecisao).toHaveLength(1);
    expect(out.semDecisao[0].cliente.id).toBe('b');
  });

  it('repassa a lista de insights (sugestoesDashboard) tal como recebida', () => {
    const insights = [{ cliente: { id: 'a', nome: 'A' }, campo: 'angulo', rotulo: 'Ângulo', grupo: { valor: 'dor', roasMedio: 3, amostras: 2 } }];
    const out = agregar([], [], insights);
    expect(out.insights).toBe(insights);
  });
});

describe('painelAlertas', () => {
  const base = { fadiga: [], escalar: [], vermelhos: [], orcamento: [], aprovacaoPendente: [], semDecisao: [], insights: [] };

  it('mostra "tudo em ordem" quando não há nenhum alerta', () => {
    const html = painelAlertas(base);
    expect(html).toContain('tudo em ordem');
    expect(html).not.toContain('Aguardando o cliente');
  });

  it('mostra o bloco "Aguardando o cliente" com a contagem certa', () => {
    const html = painelAlertas({ ...base, aprovacaoPendente: [{ cliente: { id: 'a', nome: 'Ana' }, criativoId: '1', nome: 'Anúncio 1', dias: 7 }] });
    expect(html).toContain('Aguardando o cliente');
    expect(html).toContain('Anúncio 1');
    expect(html).toContain('7 dias');
    expect(html).toContain('1 alerta(s)');
  });

  it('mostra o bloco "Sem decisão" com a contagem certa', () => {
    const html = painelAlertas({ ...base, semDecisao: [{ cliente: { id: 'a', nome: 'Ana' }, criativoId: '1', nome: 'Anúncio 2', dias: 20 }] });
    expect(html).toContain('Sem decisão');
    expect(html).toContain('Anúncio 2');
  });

  it('mostra o bloco "Padrão comprovado ainda não testado" com os dados do insight', () => {
    const html = painelAlertas({ ...base, insights: [{ cliente: { id: 'a', nome: 'Ana' }, campo: 'angulo', rotulo: 'Ângulo', grupo: { valor: 'dor', roasMedio: 3.5, amostras: 4 } }] });
    expect(html).toContain('Padrão comprovado ainda não testado');
    expect(html).toContain('Ana');
    expect(html).toContain('dor');
    expect(html).toContain('3.50x');
  });
});
