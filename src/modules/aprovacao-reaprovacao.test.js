// Troca de arquivo depois da aprovação: o status não pode continuar "Aprovado" se o cliente nunca viu o arquivo novo,
// e o histórico guarda qual arquivo ele realmente viu e aprovou.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bancos = { criativos: new Map(), respostas: new Map(), aprovacoes: new Map() };
vi.mock('../core/storage.js', () => ({
  COL: { criativos: 'criativos', respostas: 'respostas', aprovacoes: 'aprovacoes' },
  db: {
    listar: vi.fn(async (col, filtro) => [...(bancos[col] || new Map()).entries()].map(([id, v]) => ({ id, ...v })).filter((d) => !filtro || Object.entries(filtro).every(([k, v]) => d[k] === v))),
    obter: vi.fn(async (col, id) => { const v = bancos[col]?.get(id); return v ? { id, ...v } : null; }),
    criar: vi.fn(async (col, dados, id) => { (bancos[col] ||= new Map()).set(id, dados); return { id, ...dados }; }),
    definir: vi.fn(async (col, id, dados) => { (bancos[col] ||= new Map()).set(id, dados); }),
    atualizar: vi.fn(async (col, id, patch) => { const m = bancos[col]; m.set(id, { ...m.get(id), ...patch }); }),
    remover: vi.fn(async () => {}),
  },
  removerArquivo: vi.fn(async () => {}),
}));
vi.mock('../lib/previa.js', () => ({ garantirPrevia: vi.fn(async () => {}), previaAtual: () => false }));

const { criarLink, sincronizarAprovacoes, statusAposTrocarArquivo, arquivoMudouDesdeOLink, tagAprovacao, legendaReaprovacao, LEGENDA_REAPROVACAO } = await import('./aprovacao.js');

const cliente = { id: 'cli1', nome: 'Cliente' };
const CHECK = { gancho: true };
beforeEach(() => { Object.values(bancos).forEach((m) => m.clear()); });

function criativo(extra = {}) {
  const c = { id: 'c1', clienteId: 'cli1', nome: 'Vídeo', hook: 'h', copy: 'c', cta: 'x', checklist: CHECK, status: 'rascunho',
    arquivoUrl: 'u1', arquivoPath: 'gcc/cli1/criativos/c1/1_v1.mp4', arquivoNome: 'v1.mp4', versoes: [{ n: 1, hook: 'h' }, { n: 2, hook: 'h2' }], ...extra };
  bancos.criativos.set(c.id, c);
  return c;
}

describe('troca de arquivo após aprovação', () => {
  it('fluxo completo: link -> cliente aprova v1.mp4 -> troca o arquivo -> "Aguardando nova aprovação"', async () => {
    const c = criativo();
    const { token } = await criarLink(cliente, [c]);
    expect(c.aprovacaoArquivo).toEqual({ nome: 'v1.mp4', path: 'gcc/cli1/criativos/c1/1_v1.mp4' });
    expect(c.aprovacaoVersao).toBe(2);
    bancos.respostas.set(`${token}_c1`, { clienteId: 'cli1', token, criativoId: 'c1', status: 'aprovado', comentario: '', em: '2026-09-28T10:00:00.000Z' });
    await sincronizarAprovacoes(cliente, [c]);
    expect(c.status).toBe('aprovado');
    expect(c.aprovacaoCliente).toMatchObject({ status: 'aprovado', arquivoNome: 'v1.mp4' });
    // Histórico: a versão 2 (a que estava no link) guarda que foi aprovada e com qual arquivo.
    expect(c.versoes[1].aprovadaPeloCliente).toMatchObject({ arquivoNome: 'v1.mp4' });
    expect(c.versoes[0].aprovadaPeloCliente).toBeUndefined();

    // Troca o arquivo (como faz o upload do detalhe do criativo / "Usar como peça final" do editor).
    Object.assign(c, { arquivoPath: 'gcc/cli1/criativos/c1/2_v2.mp4', arquivoNome: 'v2.mp4', ...statusAposTrocarArquivo(c) });
    expect(c.status).toBe('reaprovacao');
    expect(arquivoMudouDesdeOLink(c)).toBe(true);
    expect(tagAprovacao(c)).toContain('cliente aprovou o arquivo anterior');
    expect(legendaReaprovacao(c)).toBe(LEGENDA_REAPROVACAO);
    // Reabrir a aba (nova sincronização) não volta sozinho para "Aprovado".
    c.aprovacaoCliente = { ...c.aprovacaoCliente, em: 'outra' };
    await sincronizarAprovacoes(cliente, [c]);
    expect(c.status).toBe('reaprovacao');
  });

  it('arquivo trocado com o link ainda aguardando: resposta de aprovação não vira "Aprovado"', async () => {
    const c = criativo();
    const { token } = await criarLink(cliente, [c]);
    Object.assign(c, { arquivoPath: 'novo', arquivoNome: 'v2.mp4', ...statusAposTrocarArquivo(c) });
    expect(c.status).toBe('reaprovacao');
    expect(legendaReaprovacao(c)).toContain('o link que o cliente tem ainda mostra o arquivo anterior');
    bancos.respostas.set(`${token}_c1`, { clienteId: 'cli1', token, criativoId: 'c1', status: 'aprovado', comentario: '', em: '2026-09-28T11:00:00.000Z' });
    await sincronizarAprovacoes(cliente, [c]);
    expect(c.status).toBe('reaprovacao');
    expect(c.aprovacaoCliente.arquivoNome).toBe('v1.mp4'); // registra o que ele de fato aprovou
  });

  it('rascunho, em uso ou sem link: trocar o arquivo não muda o status; link antigo (sem registro do arquivo) não acusa troca', () => {
    expect(statusAposTrocarArquivo({ status: 'rascunho' })).toEqual({});
    expect(statusAposTrocarArquivo({ status: 'em_uso' })).toEqual({});
    expect(arquivoMudouDesdeOLink({ aprovacaoToken: 't', arquivoPath: 'x' })).toBe(false);
    expect(tagAprovacao({ aprovacaoToken: 't', arquivoPath: 'x', aprovacaoCliente: { status: 'aprovado' } })).toContain('aprovado pelo cliente');
  });
});
