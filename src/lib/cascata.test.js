// Testes da exclusão em cascata (cliente e criativo) com um banco falso em memória no lugar de core/storage.js.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bancos = {};
const COL_FAKE = {
  clientes: 'clientes', criativos: 'criativos', hooks: 'hooks', referencias: 'referencias', campanhas: 'campanhas',
  resultados: 'resultados', produtos: 'produtos', sites: 'sites', aprovacoes: 'aprovacoes', respostas: 'respostas', usoApi: 'usoApi', playbooks: 'playbooks',
};
const removidos = []; // caminhos passados para removerArquivo

vi.mock('../core/storage.js', () => ({
  COL: COL_FAKE,
  removerArquivo: vi.fn(async (caminho) => { if (caminho) removidos.push(caminho); }),
  db: {
    listar: vi.fn(async (col, filtro) => {
      const m = bancos[col] || new Map();
      return [...m.entries()].map(([id, v]) => ({ id, ...v })).filter((d) => !filtro || Object.entries(filtro).every(([k, v]) => d[k] === v));
    }),
    remover: vi.fn(async (col, id) => { (bancos[col] || new Map()).delete(id); }),
  },
}));

const { apagarClienteEmCascata, apagarCriativoEmCascata, contarDependentesCliente } = await import('./cascata.js');
const { removerArquivo } = await import('../core/storage.js');

function popular(col, docs) {
  bancos[col] = new Map(docs.map((d) => [d.id, d]));
}

beforeEach(() => {
  for (const col of Object.values(COL_FAKE)) bancos[col] = new Map();
  removidos.length = 0;
  vi.clearAllMocks();
});

describe('contarDependentesCliente', () => {
  it('conta os documentos de cada coleção ligados ao cliente, sem apagar nada', async () => {
    popular('criativos', [{ id: 'c1', clienteId: 'cli1' }, { id: 'c2', clienteId: 'cli1' }, { id: 'c3', clienteId: 'outro' }]);
    popular('hooks', [{ id: 'h1', clienteId: 'cli1' }]);
    const n = await contarDependentesCliente('cli1');
    expect(n.criativos).toBe(2);
    expect(n.hooks).toBe(1);
    expect(n.campanhas).toBe(0);
    expect(bancos.criativos.size).toBe(3); // nada foi apagado
  });
});

describe('apagarClienteEmCascata', () => {
  it('apaga o cliente e todos os documentos ligados a ele, preservando os de outros clientes', async () => {
    popular('clientes', [{ id: 'cli1' }, { id: 'cli2' }]);
    popular('criativos', [{ id: 'c1', clienteId: 'cli1', arquivoPath: 'gcc/cli1/c1/foto.png' }, { id: 'c2', clienteId: 'cli2' }]);
    popular('hooks', [{ id: 'h1', clienteId: 'cli1' }, { id: 'h2', clienteId: 'cli2' }]);
    popular('resultados', [{ id: 'r1', clienteId: 'cli1' }]);
    popular('respostas', [{ id: 'resp1', clienteId: 'cli1' }]);
    popular('aprovacoes', [{ id: 'tok1', clienteId: 'cli1' }]);
    popular('playbooks', [{ id: 'pb1' }]); // global: não tem clienteId, não deve ser tocado

    await apagarClienteEmCascata('cli1');

    expect(bancos.clientes.has('cli1')).toBe(false);
    expect(bancos.clientes.has('cli2')).toBe(true);
    expect(bancos.criativos.has('c1')).toBe(false);
    expect(bancos.criativos.has('c2')).toBe(true); // do outro cliente, preservado
    expect(bancos.hooks.has('h1')).toBe(false);
    expect(bancos.hooks.has('h2')).toBe(true);
    expect(bancos.resultados.has('r1')).toBe(false);
    expect(bancos.respostas.has('resp1')).toBe(false);
    expect(bancos.aprovacoes.has('tok1')).toBe(false);
    expect(bancos.playbooks.has('pb1')).toBe(true); // playbook global preservado
    expect(removerArquivo).toHaveBeenCalledWith('gcc/cli1/c1/foto.png');
  });

  it('não quebra quando o cliente não tem nada ligado a ele', async () => {
    popular('clientes', [{ id: 'cli1' }]);
    await expect(apagarClienteEmCascata('cli1')).resolves.toBeUndefined();
    expect(bancos.clientes.has('cli1')).toBe(false);
  });
});

describe('apagarCriativoEmCascata', () => {
  it('apaga o criativo, seus resultados e respostas, mas não mexe em hooks/campanhas do cliente', async () => {
    popular('criativos', [{ id: 'c1', clienteId: 'cli1' }]);
    popular('resultados', [{ id: 'r1', criativoId: 'c1' }, { id: 'r2', criativoId: 'outro' }]);
    popular('respostas', [{ id: 'resp1', criativoId: 'c1' }, { id: 'resp2', criativoId: 'outro' }]);
    popular('hooks', [{ id: 'h1', clienteId: 'cli1' }]);

    await apagarCriativoEmCascata('c1', 'gcc/cli1/c1/video.mp4');

    expect(bancos.criativos.has('c1')).toBe(false);
    expect(bancos.resultados.has('r1')).toBe(false);
    expect(bancos.resultados.has('r2')).toBe(true);
    expect(bancos.respostas.has('resp1')).toBe(false);
    expect(bancos.respostas.has('resp2')).toBe(true);
    expect(bancos.hooks.has('h1')).toBe(true); // hook do cliente não é dependente do criativo
    expect(removerArquivo).toHaveBeenCalledWith('gcc/cli1/c1/video.mp4');
  });

  it('funciona sem arquivo anexado (não chama removerArquivo)', async () => {
    popular('criativos', [{ id: 'c1' }]);
    await apagarCriativoEmCascata('c1', null);
    expect(removerArquivo).not.toHaveBeenCalled();
    expect(bancos.criativos.has('c1')).toBe(false);
  });
});
