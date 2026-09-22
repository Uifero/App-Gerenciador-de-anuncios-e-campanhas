// Testes de importação/restauração de backup: o mesmo formato que a exportação já gera hoje.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bancos = {};
const COL_FAKE = { clientes: 'clientes', criativos: 'criativos', respostas: 'respostas', config: 'config' };

vi.mock('../core/storage.js', () => ({
  COL: COL_FAKE,
  db: {
    definir: vi.fn(async (col, id, dados) => { (bancos[col] ||= new Map()).set(id, dados); }),
  },
}));

const { lerArquivoBackup, resumoRestauracao, restaurarBackup } = await import('./backup.js');
const { db } = await import('../core/storage.js');

const arquivoDe = (obj) => ({ text: async () => JSON.stringify(obj) });

beforeEach(() => { for (const k of Object.keys(bancos)) delete bancos[k]; vi.clearAllMocks(); });

describe('lerArquivoBackup', () => {
  it('lê e devolve um backup válido', async () => {
    const original = { app: 'gerenciador-criativos-campanhas', versao: 1, colecoes: { clientes: [] } };
    await expect(lerArquivoBackup(arquivoDe(original))).resolves.toEqual(original);
  });

  it('rejeita um arquivo que não é JSON', async () => {
    await expect(lerArquivoBackup({ text: async () => 'não é json{{{' })).rejects.toThrow(/não é um JSON válido/);
  });

  it('rejeita um JSON que não é um backup deste app', async () => {
    await expect(lerArquivoBackup(arquivoDe({ foo: 'bar' }))).rejects.toThrow(/não parece ser um backup/);
  });

  it('rejeita uma versão de backup não suportada', async () => {
    await expect(lerArquivoBackup(arquivoDe({ app: 'gerenciador-criativos-campanhas', versao: 99, colecoes: {} }))).rejects.toThrow(/não é compatível/);
  });
});

describe('resumoRestauracao', () => {
  it('lista as coleções com documentos, excluindo respostas de aprovação', () => {
    const dados = { colecoes: { clientes: [{ id: 'a' }], criativos: [{ id: 'b' }, { id: 'c' }], respostas: [{ status: 'aprovado' }], config: [] } };
    expect(resumoRestauracao(dados)).toEqual([['clientes', 1], ['criativos', 2]]);
  });
});

describe('restaurarBackup', () => {
  it('grava cada documento na coleção certa, com o mesmo id (upsert)', async () => {
    const dados = { colecoes: { clientes: [{ id: 'cli1', nome: 'Ana', criadoEm: '2026-01-01T00:00:00.000Z' }] } };
    const total = await restaurarBackup(dados);
    expect(total).toBe(1);
    expect(db.definir).toHaveBeenCalledWith('clientes', 'cli1', { nome: 'Ana', criadoEm: '2026-01-01T00:00:00.000Z' });
  });

  it('pula documentos sem id e nunca restaura respostas de aprovação', async () => {
    const dados = { colecoes: { clientes: [{ nome: 'sem id' }], respostas: [{ id: 'deveria-ser-ignorado', status: 'aprovado' }] } };
    const total = await restaurarBackup(dados);
    expect(total).toBe(0);
    expect(db.definir).not.toHaveBeenCalled();
  });

  it('restaura várias coleções de uma vez e soma o total', async () => {
    const dados = { colecoes: { clientes: [{ id: 'c1' }], criativos: [{ id: 'x1' }, { id: 'x2' }] } };
    const total = await restaurarBackup(dados);
    expect(total).toBe(3);
  });
});
