// Restauração de backup no modo demo (banco real do app em memória, nunca a produção): exporta, apaga tudo, importa o
// arquivo e confere o que volta. Se existir um backup real em backup-teste/*.json (fora do Git), ele também é
// restaurado e auditado — o teste imprime só contagens por "Cliente N", nunca dados do cliente.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepararDemo, limparBanco, semearCliente, fotografia } from './dados-demo.js';
import { auditar } from './auditoria-backup.js';

const mapa = prepararDemo();
vi.stubGlobal('document', { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
const { db, COL } = await import('../src/core/storage.js');
const { montarBackup, lerArquivoBackup, resumoRestauracao, restaurarBackup } = await import('../src/modules/backup.js');
const { migrarFotosProdutos, garantirCodigos } = await import('../src/lib/materiais.js');

const comoArquivo = (obj) => ({ text: async () => JSON.stringify(obj) });
const semToken = ({ aprovacaoToken, ...r }) => r;

describe('restauração de um backup completo (dois clientes)', () => {
  let antes, arquivo;
  beforeEach(async () => {
    limparBanco(mapa);
    for (const p of ['A', 'B']) {
      const cid = await semearCliente(db, COL, p);
      await migrarFotosProdutos({ id: cid });
      await garantirCodigos({ id: cid }, await db.listar(COL.materiais, { clienteId: cid }));
      const d = await db.criar(COL.diagnosticos, { clienteId: cid, origem: 'manual', dados: { verba: 100 }, resultado: { nota: 7 }, imagens: 1 });
      await db.criar(COL.diagnosticoImagens, { clienteId: cid, diagnosticoId: d.id, ordem: 1, nome: 'print.png', dataUrl: 'data:image/png;base64,AAAA' });
    }
    await db.definir(COL.config, 'geral', { limiteBackupDias: 14 });
    antes = await fotografia(db, COL);
    arquivo = comoArquivo(await montarBackup());
  });

  it('num banco vazio, tudo volta igual, menos links de aprovação, respostas e o token do criativo', async () => {
    limparBanco(mapa);
    const dados = await lerArquivoBackup(arquivo);
    expect(JSON.stringify(dados)).not.toMatch(/tok[AB](cr|site)/); // nenhum token no arquivo
    const resumo = Object.fromEntries(resumoRestauracao(dados));
    expect(resumo[COL.aprovacoes]).toBeUndefined();
    expect(resumo[COL.respostas]).toBeUndefined();
    await restaurarBackup(dados);
    const depois = await fotografia(db, COL);
    for (const col of Object.values(COL)) {
      if (col === COL.aprovacoes || col === COL.respostas) { expect(depois[col], col).toHaveLength(0); continue; }
      const esperado = col === COL.criativos ? antes[col].map(semToken) : antes[col];
      expect(depois[col], col).toEqual(esperado);
    }
    const a = auditar(depois, COL);
    const [cA, cB] = a.porCliente;
    for (const c of [cA, cB]) {
      expect(c).toMatchObject({ produtos: 2, produtosComPreco: 2, materiais: 7, comCodigo: 5, comUsarEm: 5, provasPrint: 1, printsComBorrada: 1, provasTexto: 2, logo: 1,
        perfilMarcaCampos: 4, questionario: 1, criativos: 4, arquivados: 1, resultados: 3, campanhas: 1, linksAprovacao: 0, respostasAprovacao: 0,
        sites: 1, siteTema: 'sim', siteVersao: 3, diagnosticos: 1, imagensDiagnostico: 1 });
    }
    expect([cA.sitePlataforma, cB.sitePlataforma]).toEqual(['nuvemshop', 'shopify']);
    // O único problema esperado: o criativo que esperava resposta perdeu o link (precisa reenviar).
    expect(a.problemas.map((x) => x.tipo)).toEqual(['criativo "aguardando cliente" sem link (precisa reenviar)', 'criativo "aguardando cliente" sem link (precisa reenviar)']);
  });

  it('por cima do banco atual, não desliga o link ainda ativo do criativo', async () => {
    await restaurarBackup(await lerArquivoBackup(arquivo));
    expect((await db.obter(COL.criativos, 'crA1')).aprovacaoToken).toBe('tokAcr');
    expect(await db.listar(COL.aprovacoes)).toHaveLength(antes[COL.aprovacoes].length);
    expect(await fotografia(db, COL)).toEqual(antes);
  });

  it('a auditoria acha link para item apagado e arquivo sem link', async () => {
    await db.remover(COL.produtos, 'prodA2');
    await db.remover(COL.materiais, 'matAbanner');
    await db.atualizar(COL.materiais, 'matAprint', { url: null });
    const tipos = auditar(await fotografia(db, COL), COL).problemas.map((x) => x.tipo);
    expect(tipos).toContain('"Usar em" aponta para produto apagado');
    expect(tipos).toContain('site aponta para material apagado');
    expect(tipos).toContain('material sem link do arquivo');
  });
});

// ---------- backup real (só na máquina de quem tem o arquivo; a pasta está no .gitignore) ----------
const pasta = new URL('../backup-teste/', import.meta.url);
const reais = existsSync(pasta) ? readdirSync(pasta).filter((f) => f.endsWith('.json')) : [];

describe.skipIf(!reais.length)('backup real de produção em backup-teste/', () => {
  it.each(reais)('%s: restaura no modo demo e audita', async (nome) => {
    limparBanco(mapa);
    const dados = await lerArquivoBackup(comoArquivo(JSON.parse(readFileSync(new URL(nome, pasta), 'utf8'))));
    const total = await restaurarBackup(dados);
    const banco = await fotografia(db, COL);
    const a = auditar(banco, COL);
    const noArquivo = Object.fromEntries(Object.entries(dados.colecoes).map(([k, v]) => [k, (v || []).length]));
    const restaurado = Object.fromEntries(Object.entries(banco).map(([k, v]) => [k, v.length]));
    console.log(JSON.stringify({ arquivo: nome, escopo: dados.escopo, exportadoEm: dados.exportadoEm, documentosRestaurados: total, noArquivo, restaurado,
      porCliente: a.porCliente, problemas: a.problemas, arquivosStorageReferenciados: a.arquivosStorageReferenciados, imagensDentroDoArquivo: a.imagensDentroDoArquivo }, null, 1));
    expect(total).toBeGreaterThan(0);
    for (const [col, n] of Object.entries(noArquivo)) if (col !== COL.aprovacoes && col !== COL.respostas) expect(restaurado[col] ?? 0, col).toBe(n);
  });
});
