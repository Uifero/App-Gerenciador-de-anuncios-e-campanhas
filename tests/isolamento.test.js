// Isolamento entre clientes (modo demo, banco real do app em memória): materiais, produtos, provas, criativos, links
// de aprovação e Insights de um cliente nunca aparecem no outro — inclusive depois da migração das fotos dos produtos,
// da exclusão em massa de materiais e da exclusão/arquivamento em massa de criativos.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { prepararDemo, limparBanco, semearCliente, fotografia } from './dados-demo.js';

const mapa = prepararDemo();
vi.mock('../src/core/ui.js', async (original) => ({ ...(await original()), confirmar: vi.fn(async () => true), toast: vi.fn() }));
vi.stubGlobal('document', { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });

const { db, COL } = await import('../src/core/storage.js');
const { DEMO } = await import('../src/core/firebase.js');
const { migrarFotosProdutos, garantirCodigos } = await import('../src/lib/materiais.js');
const { excluirMateriais } = await import('../src/modules/excluir-material.js');
const { planoCriativos, criativosVisiveis } = await import('../src/lib/exclusao.js');
const { apagarCriativoEmCascata, apagarClienteEmCascata } = await import('../src/lib/cascata.js');
const { cartaoInsights, padroesPorNicho } = await import('../src/modules/insights.js');
const { montarBackup } = await import('../src/modules/backup.js');
const { fotosDoProduto } = await import('../src/lib/fotos-site.js');

const COLS_POR_CLIENTE = ['materiais', 'produtos', 'criativos', 'resultados', 'campanhas', 'sites', 'aprovacoes', 'respostas', 'hooks', 'referencias', 'usoApi'];
const doCliente = async (cid) => Object.fromEntries(await Promise.all(COLS_POR_CLIENTE.map(async (k) => [k, await db.listar(COL[k], { clienteId: cid })])));
/** Nenhum id/texto marcado com o prefixo do outro cliente aparece aqui. */
const semRastroDe = (obj, p) => {
  const s = JSON.stringify(obj);
  for (const marca of [`cli${p}`, `Loja ${p}`, `mat${p}`, `prod${p}`, `cr${p}`, `tok${p}`, `/${p}/`, `depoimento ${p}`, `oferta ${p}`]) expect(s, `vazou "${marca}"`).not.toContain(marca);
};

let A, B;
beforeEach(async () => {
  limparBanco(mapa);
  A = await semearCliente(db, COL, 'A', { nicho: 'moda fitness' });
  B = await semearCliente(db, COL, 'B', { nicho: 'pet shop' });
});

describe('isolamento entre dois clientes', () => {
  beforeAll(() => expect(DEMO).toBe(true));

  it('cada lista por cliente só tem os documentos dele', async () => {
    const a = await doCliente(A), b = await doCliente(B);
    for (const k of COLS_POR_CLIENTE) {
      expect(a[k].length, k).toBeGreaterThan(0);
      expect(a[k].every((d) => d.clienteId === A), k).toBe(true);
      expect(b[k].every((d) => d.clienteId === B), k).toBe(true);
    }
    semRastroDe(a, 'B'); semRastroDe(b, 'A');
  });

  it('códigos F1, F2... são por cliente e não mexem no outro', async () => {
    const antesB = await fotografia(db, COL);
    const lista = await garantirCodigos({ id: A }, await db.listar(COL.materiais, { clienteId: A }));
    expect(lista.filter((m) => m.codigo).map((m) => m.codigo).sort()).toEqual(['F1', 'F2', 'F3']); // banner, foto, print (logo e texto não levam)
    const listaB = await garantirCodigos({ id: B }, await db.listar(COL.materiais, { clienteId: B }));
    expect(listaB.filter((m) => m.codigo).map((m) => m.codigo).sort()).toEqual(['F1', 'F2', 'F3']);
    expect((await db.obter(COL.clientes, A)).contadorFotos).toBe(3);
    expect((await db.obter(COL.clientes, B)).contadorFotos).toBe(3);
    expect((await db.listar(COL.produtos, { clienteId: B }))).toEqual(antesB[COL.produtos].filter((d) => d.clienteId === B));
  });

  it('migração das fotos dos produtos de A não cria nem altera nada em B', async () => {
    const antes = await doCliente(B);
    const clienteB = await db.obter(COL.clientes, B);
    const r = await migrarFotosProdutos({ id: A });
    expect(r).toMatchObject({ fotos: 2, produtos: 2 });
    const matsA = await db.listar(COL.materiais, { clienteId: A });
    expect(matsA.filter((m) => m.migradoDe)).toHaveLength(2);
    expect(matsA.every((m) => m.clienteId === A)).toBe(true);
    expect(await doCliente(B)).toEqual(antes);
    expect(await db.obter(COL.clientes, B)).toEqual(clienteB);
    // O produto de A mostra só fotos de A (agora vindas de Materiais), com a mesma foto principal.
    const prodA = await db.obter(COL.produtos, 'prodA1');
    const fotos = fotosDoProduto(prodA, matsA);
    expect(fotos[0].url).toBe('https://arquivos/A/camiseta-1.jpg');
    semRastroDe(fotos, 'B');
    // Rodar de novo não duplica (idempotente) e migrar B depois não toca em A.
    expect((await migrarFotosProdutos({ id: A })).fotos).toBe(0);
    const depoisA = await doCliente(A);
    await migrarFotosProdutos({ id: B });
    expect(await doCliente(A)).toEqual(depoisA);
  });

  it('exclusão em massa de materiais de A não toca nos materiais nem no site de B', async () => {
    const antesB = await doCliente(B), cliB = await db.obter(COL.clientes, B);
    const cliA = await db.obter(COL.clientes, A);
    const matsA = await db.listar(COL.materiais, { clienteId: A });
    const n = await excluirMateriais(cliA, matsA);
    expect(n).toBe(matsA.length);
    expect(await db.listar(COL.materiais, { clienteId: A })).toHaveLength(0);
    // O site de A perdeu as referências (banner e depoimento do print); o de B continua igual.
    const siteA = await db.obter(COL.sites, 'siteA');
    expect(siteA.layout.imagens.banner).toBeUndefined();
    expect(siteA.conteudo.depoimentos).toHaveLength(0);
    expect(await doCliente(B)).toEqual(antesB);
    expect(await db.obter(COL.clientes, B)).toEqual(cliB);
    // Fotos usadas por link já enviado de A ficam retidas no cliente A, nunca no B.
    expect((await db.obter(COL.clientes, A)).arquivosRetidos?.length).toBeGreaterThan(0);
    expect(cliB.arquivosRetidos).toBeUndefined();
  });

  it('excluir/arquivar criativos em massa em A não mexe em B', async () => {
    const antesB = await doCliente(B);
    const criativos = criativosVisiveis(await db.listar(COL.criativos, { clienteId: A }));
    const resultados = await db.listar(COL.resultados, { clienteId: A });
    const plano = planoCriativos(criativos, resultados);
    expect(plano.arquivar.map((c) => c.id).sort()).toEqual(['crA1', 'crA2']);
    expect(plano.excluir.map((c) => c.id)).toEqual(['crAsem']);
    for (const c of plano.excluir) await apagarCriativoEmCascata(c.id, c.arquivoPath, c.previaPath, { manterArquivos: Boolean(c.aprovacaoToken), clienteId: A });
    for (const c of plano.arquivar) await db.atualizar(COL.criativos, c.id, { arquivado: true, arquivadoEm: new Date().toISOString() });
    // Exclusão definitiva do arquivado com resultado: os resultados dele saem, só os dele.
    const arq = await db.obter(COL.criativos, 'crAarq');
    const def = planoCriativos([arq], resultados, { definitivo: true });
    for (const c of def.excluirDefinitivo) await apagarCriativoEmCascata(c.id, c.arquivoPath, c.previaPath, { clienteId: A });
    expect((await db.listar(COL.criativos, { clienteId: A })).map((c) => c.id).sort()).toEqual(['crA1', 'crA2']);
    expect((await db.listar(COL.resultados, { clienteId: A })).map((r) => r.id).sort()).toEqual(['resA1', 'resA2']);
    expect(await doCliente(B)).toEqual(antesB);
  });

  it('Insights de A usa só os resultados de A; nichos diferentes não se misturam', async () => {
    const cliA = await db.obter(COL.clientes, A);
    const html = await cartaoInsights(cliA, await db.listar(COL.resultados, { clienteId: A }));
    expect(html).toContain('NESTE CLIENTE');
    expect(html).not.toContain('MESMO NICHO'); // B é de outro nicho
    expect(html).toContain('3 resultado(s)'); // as 3 linhas de A, nenhuma de B
    semRastroDe(html, 'B');
  });

  it('mesmo nicho: B entra só como padrão agregado, sem nome, id ou criativo de B', async () => {
    await db.atualizar(COL.clientes, B, { nicho: 'moda fitness' });
    const cliA = await db.obter(COL.clientes, A);
    const nicho = await padroesPorNicho(cliA.nicho, A, 2, 'BR');
    expect(nicho.clientes).toBe(1);
    semRastroDe(nicho, 'B');
    const html = await cartaoInsights(cliA, await db.listar(COL.resultados, { clienteId: A }));
    expect(html).toContain('PADRÃO EM 1 CLIENTE(S) DO MESMO NICHO');
    semRastroDe(html, 'B');
    // E o próprio A nunca entra no "mesmo nicho" dele.
    expect((await padroesPorNicho('moda fitness', A, 1, 'BR')).padroes.angulo[0].amostras).toBe(3);
  });

  it('backup de um cliente só leva os dados dele', async () => {
    const bk = await montarBackup(await db.obter(COL.clientes, A));
    expect(bk.colecoes[COL.clientes]).toHaveLength(1);
    semRastroDe(bk, 'B');
  });

  it('apagar o cliente A em cascata não apaga nada de B', async () => {
    const antesB = await doCliente(B);
    await apagarClienteEmCascata(A);
    expect(await db.obter(COL.clientes, A)).toBeNull();
    for (const k of COLS_POR_CLIENTE) if (k !== 'usoApi') expect(await db.listar(COL[k], { clienteId: A }), k).toHaveLength(0);
    expect(await doCliente(B)).toEqual(antesB);
  });
});
