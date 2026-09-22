// Testes do fechamento do loop de aprovação: a resposta do cliente final precisa voltar para o criativo do admin.
// `core/storage.js` é substituído por um banco falso em memória (mesma forma de db.listar/obter/atualizar/criar/definir/remover).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bancos = { criativos: new Map(), respostas: new Map() };
const COL_FAKE = { criativos: 'criativos', respostas: 'respostas', aprovacoes: 'aprovacoes' };

vi.mock('../core/storage.js', () => ({
  COL: COL_FAKE,
  db: {
    listar: vi.fn(async (col, filtro) => {
      const m = bancos[col] || new Map();
      return [...m.entries()].map(([id, v]) => ({ id, ...v }))
        .filter((d) => !filtro || Object.entries(filtro).every(([k, v]) => d[k] === v));
    }),
    obter: vi.fn(async (col, id) => { const v = (bancos[col] || new Map()).get(id); return v ? { id, ...v } : null; }),
    criar: vi.fn(async (col, dados, id) => { id = id || 'id' + Math.random(); (bancos[col] ||= new Map()).set(id, dados); return { id, ...dados }; }),
    definir: vi.fn(async (col, id, dados) => { (bancos[col] ||= new Map()).set(id, dados); }),
    atualizar: vi.fn(async (col, id, patch) => {
      const m = bancos[col] ||= new Map();
      if (!m.has(id)) throw new Error('não encontrado: ' + id);
      m.set(id, { ...m.get(id), ...patch });
    }),
    remover: vi.fn(async (col, id) => { (bancos[col] || new Map()).delete(id); }),
  },
}));

const { sincronizarAprovacoes } = await import('./aprovacao.js');
const { db } = await import('../core/storage.js');

const cliente = { id: 'cli1', nome: 'Cliente Teste' };
const agoraIso = () => new Date().toISOString();

function novoCriativo(id, extra = {}) {
  const c = { id, nome: 'Criativo ' + id, hook: 'h', copy: 'c', cta: 'cta', status: 'pronto_aprovacao', aprovacaoCliente: null, ...extra };
  bancos.criativos.set(id, c);
  return c;
}

beforeEach(() => { bancos.criativos.clear(); bancos.respostas.clear(); vi.clearAllMocks(); });

describe('sincronizarAprovacoes', () => {
  it('não consulta o banco de respostas se nenhum criativo tem link de aprovação enviado', async () => {
    const c = novoCriativo('c1'); // sem aprovacaoToken
    const r = await sincronizarAprovacoes(cliente, [c]);
    expect(r).toEqual({ mudou: 0, falhas: [] });
    expect(db.listar).not.toHaveBeenCalled();
  });

  it('traz a resposta "aprovado" do cliente e move o status do criativo para aprovado', async () => {
    const quando = agoraIso();
    const c = novoCriativo('c1', { status: 'pronto_aprovacao', aprovacaoToken: 'tok1', aprovacaoEnviadaEm: quando });
    bancos.respostas.set('tok1_c1', { clienteId: 'cli1', token: 'tok1', criativoId: 'c1', status: 'aprovado', comentario: '', em: '2026-09-22T10:00:00.000Z' });

    const r = await sincronizarAprovacoes(cliente, [c]);

    expect(r.mudou).toBe(1);
    expect(r.falhas).toEqual([]);
    expect(c.status).toBe('aprovado');
    expect(c.aprovacaoCliente.status).toBe('aprovado');
    expect(bancos.criativos.get('c1').status).toBe('aprovado'); // persistiu de verdade no "banco"
  });

  it('traz a resposta "ajuste" e volta o status do criativo para rascunho', async () => {
    const c = novoCriativo('c1', { status: 'pronto_aprovacao', aprovacaoToken: 'tok1', aprovacaoEnviadaEm: agoraIso() });
    bancos.respostas.set('tok1_c1', { clienteId: 'cli1', token: 'tok1', criativoId: 'c1', status: 'ajuste', comentario: 'trocar o hook', em: '2026-09-22T10:00:00.000Z' });

    const r = await sincronizarAprovacoes(cliente, [c]);

    expect(r.mudou).toBe(1);
    expect(c.status).toBe('rascunho');
    expect(c.aprovacaoCliente).toMatchObject({ status: 'ajuste', comentario: 'trocar o hook' });
  });

  it('é idempotente: já sincronizado, uma nova passada não grava de novo', async () => {
    const em = '2026-09-22T10:00:00.000Z';
    const c = novoCriativo('c1', { status: 'aprovado', aprovacaoToken: 'tok1', aprovacaoEnviadaEm: agoraIso(), aprovacaoCliente: { status: 'aprovado', comentario: '', em } });
    bancos.respostas.set('tok1_c1', { clienteId: 'cli1', token: 'tok1', criativoId: 'c1', status: 'aprovado', comentario: '', em });

    const r = await sincronizarAprovacoes(cliente, [c]);

    expect(r.mudou).toBe(0);
    expect(db.atualizar).not.toHaveBeenCalled();
  });

  it('não sincroniza um criativo sem resposta ainda', async () => {
    const c = novoCriativo('c1', { aprovacaoToken: 'tok1', aprovacaoEnviadaEm: agoraIso() });
    const r = await sincronizarAprovacoes(cliente, [c]);
    expect(r.mudou).toBe(0);
    expect(c.status).toBe('pronto_aprovacao');
  });

  it('ignora links enviados há mais de 60 dias (evita releitura para sempre)', async () => {
    const antigo = new Date(Date.now() - 90 * 864e5).toISOString();
    const c = novoCriativo('c1', { aprovacaoToken: 'tok1', aprovacaoEnviadaEm: antigo });
    bancos.respostas.set('tok1_c1', { clienteId: 'cli1', token: 'tok1', criativoId: 'c1', status: 'aprovado', comentario: '', em: agoraIso() });
    const r = await sincronizarAprovacoes(cliente, [c]);
    expect(r.mudou).toBe(0);
    expect(db.listar).not.toHaveBeenCalled();
  });

  it('um erro ao salvar UM criativo não impede a sincronização dos demais (causa raiz corrigida)', async () => {
    const quando = agoraIso();
    const c1 = novoCriativo('c1', { status: 'pronto_aprovacao', aprovacaoToken: 'tok1', aprovacaoEnviadaEm: quando });
    const c2 = novoCriativo('c2', { status: 'pronto_aprovacao', aprovacaoToken: 'tok2', aprovacaoEnviadaEm: quando });
    bancos.respostas.set('tok1_c1', { clienteId: 'cli1', token: 'tok1', criativoId: 'c1', status: 'aprovado', comentario: '', em: '2026-09-22T10:00:00.000Z' });
    bancos.respostas.set('tok2_c2', { clienteId: 'cli1', token: 'tok2', criativoId: 'c2', status: 'aprovado', comentario: '', em: '2026-09-22T10:00:00.000Z' });
    bancos.criativos.delete('c1'); // simula falha ao gravar c1 (db.atualizar lança "não encontrado")

    const r = await sincronizarAprovacoes(cliente, [c1, c2]);

    expect(r.mudou).toBe(1);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].id).toBe('c1');
    expect(c2.status).toBe('aprovado'); // o segundo criativo sincronizou normalmente
  });
});
