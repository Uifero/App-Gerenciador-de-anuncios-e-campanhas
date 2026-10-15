// Os campos novos do ajuste por seção moram no documento do site (gcc_sites): sugestões ignoradas, "Entendi assim" em
// aberto, rascunho "Antes × Depois", último ajuste aplicado, histórico de ajustes, texto do pedido e versões. O backup
// leva todos, a restauração devolve iguais e apagar o cliente em cascata não deixa nada para trás (modo demo).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepararDemo, limparBanco, semearCliente } from './dados-demo.js';

const mapa = prepararDemo();
vi.mock('../src/core/ui.js', async (original) => ({ ...(await original()), confirmar: vi.fn(async () => true), toast: vi.fn() }));
vi.stubGlobal('document', { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });

const { db, COL } = await import('../src/core/storage.js');
const { montarBackup, restaurarBackup } = await import('../src/modules/backup.js');
const { apagarClienteEmCascata } = await import('../src/lib/cascata.js');

const CAMPOS = {
  sugestoesIgnoradas: [{ chave: 'conferencia|produto|abc', fonte: 'conferencia', secao: 'produto', texto: 'Fotos F12, F27: falta F27', em: '2026-10-14T12:00:00Z' }],
  ajusteEntendido: { modo: 'pacote', mensagem: 'deixa o banner mais curto', secoes: [{ id: 'banner', nome: 'Banner', oque: 'mais curto' }], perguntas: [], tarefa: 'ajuste_secao', custo: { usd: 0.006 } },
  rascunhoAjuste: { modo: 'pacote', estado: { pacote: {} }, usosFotos: {}, porSecao: [{ secao: 'banner', nome: 'Banner', mudancas: ['título curto'] }], escolhas: [], mudancas: ['título curto'] },
  ajusteUltimo: { modo: 'pacote', versao: 4, anterior: 3, secoes: ['galeria'], nomes: ['Galeria'], checagens: [], conferencia: [], links: 1, em: '2026-10-14T12:00:00Z' },
  historicoAjustes: [{ em: '2026-10-14T12:00:00Z', modo: 'pacote', versao: 4, pedidos: ['troca a F12 pela F27'], fontes: ['pedido'], secoes: ['galeria'], resultado: 'aplicado' }],
  pedidoAjusteTexto: { pacote: 'troca a F12 pela F27 na galeria' },
  versoesAjuste: [{ n: 3, modo: 'pacote', resumo: 'antes', estado: { pacote: {} } }, { n: 4, modo: 'pacote', resumo: 'Galeria: F27', estado: { pacote: {} } }],
};

let A, B;
beforeEach(async () => {
  limparBanco(mapa);
  A = await semearCliente(db, COL, 'A');
  B = await semearCliente(db, COL, 'B');
  await db.atualizar(COL.sites, 'siteA', CAMPOS);
});

describe('campos do ajuste por seção', () => {
  it('o backup do cliente leva todos e a restauração devolve iguais', async () => {
    const bk = await montarBackup(await db.obter(COL.clientes, A));
    const site = bk.colecoes[COL.sites].find((s) => s.id === 'siteA');
    for (const [k, v] of Object.entries(CAMPOS)) expect(site[k], k).toEqual(v);
    limparBanco(mapa);
    await restaurarBackup(bk);
    const volta = await db.obter(COL.sites, 'siteA');
    for (const [k, v] of Object.entries(CAMPOS)) expect(volta[k], k).toEqual(v);
  });
  it('apagar o cliente em cascata leva o site com tudo isso, e o outro cliente fica igual', async () => {
    const siteB = await db.obter(COL.sites, 'siteB');
    await apagarClienteEmCascata(A);
    expect(await db.obter(COL.sites, 'siteA')).toBeNull();
    expect(JSON.stringify(await db.listar(COL.sites))).not.toMatch(/F12 pela F27|conferencia\|produto/);
    expect(await db.obter(COL.sites, 'siteB')).toEqual(siteB);
  });
});
