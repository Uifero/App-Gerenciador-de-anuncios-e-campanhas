// Os campos novos do ajuste por seção moram no documento do site (gcc_sites): sugestões ignoradas, "Entendi assim" em
// aberto, rascunho "Antes × Depois", último ajuste aplicado, histórico de ajustes, texto do pedido e versões. O backup
// leva todos, a restauração devolve iguais e apagar o cliente em cascata não deixa nada para trás (modo demo).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepararDemo, limparBanco, semearCliente } from './dados-demo.js';

const mapa = prepararDemo();
vi.mock('../src/core/ui.js', async (original) => ({ ...(await original()), confirmar: vi.fn(async () => true), toast: vi.fn() }));
vi.stubGlobal('document', { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
// Arquivos do Storage: a cascata tem de pedir a exclusão de cada print de ajuste (gcc/<cliente>/ajustes/).
const apagados = [];
vi.mock('../src/core/storage.js', async (original) => ({ ...(await original()), removerArquivo: vi.fn(async (p) => { apagados.push(p); }) }));

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
  // "Apontar no site" e "Anexar print"
  printsAjuste: [{ id: 'prA1', url: 'https://x/gcc/cliA/ajustes/prA1.jpg', path: 'gcc/cliA/ajustes/prA1.jpg', w: 1600, h: 900, marcas: 1, em: '2026-10-15T12:00:00Z' }],
  ajustesTema: [{ id: 't1', secao: 'Banner', elemento: 'Banner › título', oque: 'Deixar mais separado', feito: false, em: '2026-10-15T12:00:00Z' }],
  layout: { elementos: { 'produto.frete': { oculto: true }, 'hero.titulo': { espaco: 1 } }, ordemElementos: { hero: ['botao', 'titulo', 'subtitulo', 'contador'] }, extras: [{ id: 'extra.1', apos: 'produto.preco', tipo: 'selo', texto: 'Envio em 24h' }] },
  versoesAjuste: [{ n: 3, modo: 'pacote', resumo: 'antes', estado: { pacote: {} } }, { n: 4, modo: 'pacote', resumo: 'Galeria: F27', estado: { pacote: {} } }],
  // Fase "nada inventado / limites / Preencher": títulos e elementos tirados no pacote, destaques, o que ficou para o
  // cliente preencher (e o que já foi visto), alegações mantidas no site.
  pacote: { visual: { titulos: { depoimentos: 'Quem já usa conta' }, elementos: { 'depoimentos.textos': { oculto: true } }, ocultas: ['depoimentos'] }, destaques: [{ itemId: 'tx1', titulo: '5 motivos', linhas: [{ texto: '**Mais de 5mil** pessoas', versao: 'original' }] }] },
  preencher: { itens: ['i3'], cliente: ['pTM:formula'], vistas: [{ id: 'pTM:beneficios', oque: 'benefícios do Thermora' }] },
  alegacoesConfirmadas: [{ chave: 'perdi 3 kg', texto: 'Perdi 3 kg', achados: ['3 kg'], por: 'operador', em: '2026-10-15T12:00:00Z' }],
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
  it('o texto DIGITADO do print (material.textoDepoimento) e a lista "Preencher" do link vão no backup e voltam', async () => {
    const m = (await db.listar(COL.materiais, { clienteId: A })).find((x) => x.origem === 'prova_social');
    await db.atualizar(COL.materiais, m.id, { textoDepoimento: 'Chegou rápido, amei' });
    const link = (await db.listar(COL.aprovacoes, { clienteId: A })).find((l) => l.tipo === 'site' && l.versao === 2);
    await db.atualizar(COL.aprovacoes, link.id, { pendencias: [{ produto: 'Camiseta A', titulo: 'Fórmula', oque: 'fórmula', noTema: 'produto' }] });
    const bk = await montarBackup(await db.obter(COL.clientes, A));
    // o link fica no arquivo como histórico (links públicos não são recriados na restauração, como antes)
    expect(bk.colecoes[COL.aprovacoes].find((l) => l.versao === 2 && l.tipo === 'site').pendencias[0].titulo).toBe('Fórmula');
    limparBanco(mapa);
    await restaurarBackup(bk);
    expect((await db.obter(COL.materiais, m.id)).textoDepoimento).toBe('Chegou rápido, amei');
  });
  it('apagar o cliente em cascata leva o site com tudo isso, e o outro cliente fica igual', async () => {
    const siteB = await db.obter(COL.sites, 'siteB');
    await apagarClienteEmCascata(A);
    expect(await db.obter(COL.sites, 'siteA')).toBeNull();
    expect(apagados).toContain('gcc/cliA/ajustes/prA1.jpg'); // o arquivo do print sai do Storage
    expect(JSON.stringify(await db.listar(COL.sites))).not.toMatch(/F12 pela F27|conferencia\|produto/);
    expect(await db.obter(COL.sites, 'siteB')).toEqual(siteB);
  });
});
