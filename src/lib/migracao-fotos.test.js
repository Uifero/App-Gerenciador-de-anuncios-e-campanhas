// Fotos dos produtos num lugar só (Materiais): a migração aponta para os MESMOS arquivos, mantém ordem e foto principal,
// é idempotente e reversível; envio pelo formulário do produto já entra ligado; apagar produto só tira o vínculo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planoMigracao, fotosDoProduto, semProduto, proximaOrdem, usosDe } from './fotos-site.js';

const bancos = {};
let seq = 0;
const tabela = (c) => (bancos[c] ||= new Map());
vi.mock('../core/storage.js', () => ({
  COL: { clientes: 'clientes', produtos: 'produtos', materiais: 'materiais', sites: 'sites', criativos: 'criativos', resultados: 'resultados' },
  db: {
    listar: async (c, f) => [...tabela(c).entries()].map(([id, v]) => ({ id, ...v })).filter((d) => !f || Object.entries(f).every(([k, v]) => d[k] === v)),
    obter: async (c, id) => (tabela(c).has(id) ? { id, ...tabela(c).get(id) } : null),
    criar: async (c, d) => { const id = `n${++seq}`; tabela(c).set(id, { ...d }); return { id, ...d }; },
    atualizar: async (c, id, patch) => { tabela(c).set(id, { ...tabela(c).get(id), ...patch }); },
    remover: async (c, id) => { tabela(c).delete(id); },
  },
  removerArquivo: vi.fn(async () => {}),
}));
vi.mock('../core/firebase.js', () => ({ DEMO: true }));
vi.mock('./uploads.js', () => ({ enviarArquivoOuAvisar: vi.fn(async (caminho) => ({ url: `https://x/${caminho.split('/').pop()}`, path: caminho })) }));

const { migrarFotosProdutos, desfazerMigracaoFotos, enviarFotoDoProduto } = await import('./materiais.js');
const { removerArquivo } = await import('../core/storage.js');

const foto = (n) => ({ url: `https://x/gcc/c1/produtos/p1/172700000000${n}_foto-${n}.jpg`, path: `gcc/c1/produtos/p1/172700000000${n}_foto-${n}.jpg` });
beforeEach(() => {
  for (const k of Object.keys(bancos)) delete bancos[k];
  tabela('clientes').set('c1', { nome: 'Loja' });
  tabela('produtos').set('p1', { clienteId: 'c1', nome: 'Thermora', preco: 99, fotos: [foto(1), foto(2), foto(3)] });
  tabela('produtos').set('p2', { clienteId: 'c1', nome: 'Garrafa', preco: 50, fotos: [] });
  tabela('materiais').set('m0', { clienteId: 'c1', url: 'https://x/outra.jpg', origem: 'envio', codigo: 'F1' });
  vi.clearAllMocks();
});
const materiais = () => [...tabela('materiais').entries()].map(([id, v]) => ({ id, ...v }));
const produto = (id) => ({ id, ...tabela('produtos').get(id) });

describe('migração das fotos dos produtos', () => {
  it('mesmos arquivos, mesma ordem e a 1ª como principal; conta o que fez', async () => {
    const antes = fotosDoProduto(produto('p1'), materiais()).map((f) => f.url);
    const r = await migrarFotosProdutos({ id: 'c1' });
    expect(r).toEqual({ fotos: 3, produtos: 2, jaMigrados: 0 });
    const migradas = materiais().filter((m) => m.migradoDe);
    expect(migradas.map((m) => [m.url, m.path])).toEqual([foto(1), foto(2), foto(3)].map((f) => [f.url, f.path])); // nada copiado nem movido
    expect(migradas.map((m) => usosDe(m).produtos[0])).toEqual([1, 2, 3].map((o) => ({ id: 'p1', ordem: o, principal: o === 1, por: 'manual' })));
    expect(fotosDoProduto(produto('p1'), materiais()).map((f) => f.url)).toEqual(antes); // o site vê o mesmo
    expect(produto('p1').fotos).toHaveLength(3); // o campo antigo continua guardado (reversível)
    expect(tabela('clientes').get('c1').migracaoFotos).toMatchObject({ fotos: 3, produtos: 2 });
  });
  it('rodar duas vezes não muda nada', async () => {
    await migrarFotosProdutos({ id: 'c1' });
    const depois1 = JSON.stringify(materiais());
    expect(await migrarFotosProdutos({ id: 'c1' })).toEqual({ fotos: 0, produtos: 0, jaMigrados: 2 });
    expect(JSON.stringify(materiais())).toBe(depois1);
    expect(planoMigracao([produto('p1')], materiais()).criar).toEqual([]);
  });
  it('desfazer tira só os registros criados, sem apagar arquivo', async () => {
    await migrarFotosProdutos({ id: 'c1' });
    expect(await desfazerMigracaoFotos({ id: 'c1' })).toEqual({ fotos: 3 });
    expect(materiais().map((m) => m.id)).toEqual(['m0']);
    expect(removerArquivo).not.toHaveBeenCalled();
    expect(produto('p1').fotosMigradas).toBe(false);
    expect(fotosDoProduto(produto('p1'), materiais())).toHaveLength(3);
  });
  it('foto enviada no formulário do produto vai para Materiais já ligada (e a 1ª vira a principal)', async () => {
    const arq = new File([new Uint8Array([1, 2, 3])], 'nova.png', { type: 'image/png' });
    const m = await enviarFotoDoProduto({ id: 'c1' }, 'p2', arq, materiais());
    expect(m).toMatchObject({ clienteId: 'c1', origem: 'envio', nomeOriginal: 'nova.png' });
    expect(usosDe(m).produtos).toEqual([{ id: 'p2', ordem: 1, principal: true, por: 'manual' }]);
    expect(proximaOrdem(materiais(), 'p2')).toBe(2);
  });
  it('apagar o produto só tira o vínculo; a foto continua em Materiais', async () => {
    await migrarFotosProdutos({ id: 'c1' });
    const patches = semProduto(materiais(), 'p1');
    expect(patches).toHaveLength(3);
    expect(patches.every((p) => p.usos.produtos.length === 0)).toBe(true);
  });
});

describe('rotas antigas e backup', () => {
  it('"Aprovações do site" (aba antiga) vai para o passo 5; "sites" vai para o fluxo', async () => {
    const { redirecionarRotaAntiga } = await import('./etapas-site.js');
    expect(redirecionarRotaAntiga('c1', 'aprovacoes')).toBe('#/c/c1/site/5');
    expect(redirecionarRotaAntiga('c1', 'sites')).toBe('#/c/c1/site');
    expect(redirecionarRotaAntiga('c1', 'site')).toBeNull();
  });
  it('backup leva os campos novos (plataforma confirmada, tema, migradoDe, migracaoFotos)', async () => {
    tabela('sites').set('s1', { clienteId: 'c1', modo: 'pacote_plataforma', plataforma: 'shopify', tema: 'dawn', plataformaConfirmada: true });
    await migrarFotosProdutos({ id: 'c1' });
    vi.doMock('../modules/configuracoes.js', () => ({ registrarBackup: async () => {} }));
    const { montarBackup } = await import('../modules/backup.js');
    const b = await montarBackup({ id: 'c1', ...tabela('clientes').get('c1') });
    expect(b.colecoes.sites[0]).toMatchObject({ tema: 'dawn', plataformaConfirmada: true });
    expect(b.colecoes.materiais.filter((m) => m.migradoDe)).toHaveLength(3);
    expect(b.colecoes.clientes[0].migracaoFotos).toMatchObject({ fotos: 3 });
    expect(b.colecoes.produtos.find((p) => p.id === 'p1').fotosMigradas).toBe(true);
  });
});

describe('excluir foto em uso (removerMaterial, o único caminho)', () => {
  it('link de aprovação já enviado: o registro sai, o arquivo fica (anotado no cliente) e o site perde a referência', async () => {
    tabela('materiais').set('mx', { clienteId: 'c1', url: 'https://x/mx.jpg', path: 'gcc/c1/materiais/mx.jpg', origem: 'envio', borrada: { url: 'https://x/mx-b.jpg', path: 'gcc/c1/materiais/mx-b.jpg' } });
    tabela('sites').set('s1', { clienteId: 'c1', layout: { imagens: { hero: { materialId: 'mx', url: 'https://x/mx.jpg' } } }, conteudo: { depoimentos: [{ texto: 'ok', materialId: 'mx' }, { texto: 'escrito' }] } });
    const { removerMaterial } = await import('./materiais.js');
    await removerMaterial({ id: 'c1' }, { id: 'mx', ...tabela('materiais').get('mx') }, { confirmado: true, manterArquivo: true });
    expect(tabela('materiais').has('mx')).toBe(false);
    expect(removerArquivo).not.toHaveBeenCalled();
    expect(tabela('clientes').get('c1').arquivosRetidos.map((a) => a.path)).toEqual(['gcc/c1/materiais/mx.jpg', 'gcc/c1/materiais/mx-b.jpg']);
    expect(tabela('sites').get('s1').layout.imagens).toEqual({});
    expect(tabela('sites').get('s1').conteudo.depoimentos).toEqual([{ texto: 'escrito' }]);
  });
  it('sem link: o arquivo e a cópia borrada saem do Storage', async () => {
    tabela('materiais').set('my', { clienteId: 'c1', url: 'u', path: 'gcc/c1/materiais/my.jpg', borrada: { path: 'gcc/c1/materiais/my-b.jpg' } });
    const { removerMaterial } = await import('./materiais.js');
    await removerMaterial({ id: 'c1' }, { id: 'my', ...tabela('materiais').get('my') }, { confirmado: true });
    expect(removerArquivo.mock.calls.map((c) => c[0])).toEqual(['gcc/c1/materiais/my.jpg', 'gcc/c1/materiais/my-b.jpg']);
  });
  it('sem confirmação, recusa (a trava de sempre)', async () => {
    const { removerMaterial } = await import('./materiais.js');
    await expect(removerMaterial({ id: 'c1' }, { id: 'm0', ...tabela('materiais').get('m0') }, { manterArquivo: true })).rejects.toThrow(/só pelo botão de apagar/);
  });
});

describe('backup leva o estado de arquivo e as ligações novas', () => {
  it('criativo arquivado com produto, resultado com oferta e arquivos retidos', async () => {
    tabela('criativos').set('cr1', { clienteId: 'c1', nome: 'A', arquivado: true, arquivadoEm: '2026-10-04', produtoId: 'p1' });
    tabela('resultados').set('r1', { clienteId: 'c1', criativoId: 'cr1', gasto: 10, oferta: 'Frete grátis' });
    tabela('clientes').set('c1', { nome: 'Loja', arquivosRetidos: [{ path: 'gcc/c1/x.jpg' }] });
    vi.doMock('../modules/configuracoes.js', () => ({ registrarBackup: async () => {} }));
    const { montarBackup } = await import('../modules/backup.js');
    const b = await montarBackup({ id: 'c1', ...tabela('clientes').get('c1') });
    expect(b.colecoes.criativos[0]).toMatchObject({ arquivado: true, produtoId: 'p1' });
    expect(b.colecoes.resultados[0].oferta).toBe('Frete grátis');
    expect(b.colecoes.clientes[0].arquivosRetidos).toHaveLength(1);
  });
});
