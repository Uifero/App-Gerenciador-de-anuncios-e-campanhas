// Envio de prints de prova social: a imagem é guardada (salvarMaterial) ANTES do texto; print que falhou não gera
// texto; reenviar o mesmo print não duplica as provas; o contador do painel reflete o que foi guardado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const docs = new Map(); const clientes = {}; const ordem = []; let seq = 0;
let falharUpload = () => false;
vi.mock('../core/storage.js', () => ({
  COL: { materiais: 'materiais', clientes: 'clientes' },
  removerArquivo: vi.fn(async () => {}),
  db: {
    criar: vi.fn(async (col, d) => { const id = `m${++seq}`; const doc = { id, ...d, criadoEm: new Date(Date.now() + seq).toISOString() }; docs.set(id, doc); ordem.push('material'); return doc; }),
    listar: vi.fn(async (col, f) => [...docs.values()].filter((d) => d.clienteId === f.clienteId)),
    remover: vi.fn(async (col, id) => { docs.delete(id); }),
    atualizar: vi.fn(async (col, id, patch) => { clientes[id] = { ...(clientes[id] || {}), ...patch }; ordem.push('texto'); }),
  },
}));
vi.mock('../core/firebase.js', () => ({ DEMO: false }));
vi.mock('./uploads.js', () => ({
  enviarArquivoOuAvisar: vi.fn(async (caminho, file) => {
    if (falharUpload(file)) throw new Error(`Não consegui enviar "${file.name}". Detalhe técnico: storage/unauthorized`);
    return { url: `https://x/${caminho}`, path: caminho };
  }),
}));

const { guardarProvasRevisadas, mensagemFalhas } = await import('./provas-envio.js');
const { resumoMaterialSite, provaParecida, printJaGuardado, acrescentarProvas } = await import('./prova-social.js');
const { db } = await import('../core/storage.js');

const jpg = () => new Blob(['img'], { type: 'image/jpeg' });
const item = (n, resumo, extra = {}) => ({ numero: n, resumo, acrescentarTexto: true, guardar: true, blob: jpg(), hash: `h${n}`, meta: { descricao: resumo }, ...extra });
const seteProvas = Array.from({ length: 7 }, (_, i) => `Prova antiga ${i + 1} (do print enviado em 01/09/2026)`).join('\n');
const contador = async (cliente) => resumoMaterialSite({ cliente, materiais: await db.listar('materiais', { clienteId: cliente.id }) }).find((i) => i.chave === 'provas').linhas[0];

beforeEach(() => { docs.clear(); ordem.length = 0; falharUpload = () => false; });

describe('guardarProvasRevisadas (envio de prints de prova social)', () => {
  it('guarda cada print em Materiais ANTES de acrescentar o texto, e o contador passa a contar os prints', async () => {
    const cliente = { id: 'c1', marca: { provasSociais: seteProvas } };
    docs.set('antigo', { id: 'antigo', clienteId: 'c1', origem: 'prova_social', url: 'https://x/antigo.jpg' }); // o print que já existia
    expect(await contador(cliente)).toBe('7 em texto · 1 print(s) de avaliação');
    const resumos = ['Cliente elogia a entrega rápida pelo WhatsApp', 'Cliente diz que o tecido é ótimo', 'Nota 5 pelo atendimento', 'Comprou de novo e recomendou', 'Elogio ao cheiro do produto', 'Chegou antes do prazo'];
    const r = await guardarProvasRevisadas(cliente, resumos.map((t, i) => item(i + 1, t)), { em: '2026-10-04T12:00:00Z' });
    expect(r.falhas).toEqual([]);
    expect(r.salvos).toHaveLength(6); expect(r.acrescentadas).toBe(6);
    expect(ordem).toEqual([...Array(6).fill('material'), 'texto']); // texto só depois de todas as imagens
    const salvo = r.salvos[0].material;
    expect(salvo).toMatchObject({ clienteId: 'c1', origem: 'prova_social', etiquetas: ['prova social'], hashOriginal: 'h1', descricao: resumos[0] });
    expect(salvo.path).toMatch(/^gcc\/c1\/materiais\/prova_social-.*\.jpg$/);
    expect(docs.has('antigo')).toBe(true); // nada existente é tocado
    expect(cliente.provasHashes).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
    expect(await contador(cliente)).toBe('13 em texto · 7 print(s) de avaliação');
  });

  it('se guardar a imagem falha: o texto DELE não entra, o erro é devolvido e uma nova tentativa só manda o que faltou', async () => {
    const cliente = { id: 'c2', marca: { provasSociais: 'Prova antiga' } };
    falharUpload = (f) => f.size > 0; // Storage recusa tudo
    const itens = [item(1, 'Cliente elogia a entrega'), item(2, 'Cliente diz que voltaria a comprar')];
    const r1 = await guardarProvasRevisadas(cliente, itens);
    expect(r1.salvos).toEqual([]); expect(r1.acrescentadas).toBe(0);
    expect(r1.falhas.map((f) => f.numero)).toEqual([1, 2]);
    expect(r1.falhas[0].motivo).toMatch(/storage\/unauthorized/);
    expect(cliente.marca.provasSociais).toBe('Prova antiga'); // nenhum texto de imagem não guardada
    expect(cliente.provasHashes).toBeUndefined();
    expect(mensagemFalhas(r1)).toMatch(/2 print\(s\) NÃO foram guardados[\s\S]*Print 1:[\s\S]*Nada foi gravado/);

    let chamadas = 0; falharUpload = () => (++chamadas === 2); // agora só o segundo falha
    const r2 = await guardarProvasRevisadas(cliente, itens);
    expect(r2.salvos.map((s) => s.numero)).toEqual([1]); expect(r2.falhas.map((f) => f.numero)).toEqual([2]);
    expect(cliente.marca.provasSociais.split('\n')).toHaveLength(2);
    falharUpload = () => false;
    const r3 = await guardarProvasRevisadas(cliente, itens); // o 1 já tem material: não é enviado de novo
    expect(r3.salvos.map((s) => s.numero)).toEqual([2]);
    expect([...docs.values()].filter((d) => d.clienteId === 'c2')).toHaveLength(2);
    expect(cliente.marca.provasSociais.split('\n')).toHaveLength(3); // a linha do 1 não repetiu
  });

  it('sem imagem gerada (canvas falhou) também é falha, não texto solto', async () => {
    const cliente = { id: 'c3', marca: {} };
    const r = await guardarProvasRevisadas(cliente, [item(1, 'Elogio', { blob: null })]);
    expect(r.falhas[0].motivo).toMatch(/imagem/); expect(r.acrescentadas).toBe(0);
  });

  it('salvar que não devolve registro com url conta como falha', async () => {
    const cliente = { id: 'c4', marca: {} };
    const r = await guardarProvasRevisadas(cliente, [item(1, 'Elogio')], { salvar: async () => ({ id: 'x' }) });
    expect(r.falhas).toHaveLength(1); expect(r.acrescentadas).toBe(0);
  });

  it('"Guardar este print" desmarcado: o texto entra (a pessoa escolheu não guardar a imagem) e a impressão digital fica registrada', async () => {
    const cliente = { id: 'c5', marca: {} };
    const r = await guardarProvasRevisadas(cliente, [item(1, 'Nota 4,9 no Google', { guardar: false })]);
    expect(r.salvos).toEqual([]); expect(r.acrescentadas).toBe(1); expect(cliente.provasHashes).toEqual(['h1']);
  });
});

describe('reenviar os mesmos prints não duplica as provas', () => {
  const atuais = 'Cliente elogia a entrega rápida e o atendimento pelo WhatsApp (do print enviado em 03/10/2026)\nNota 4,9 no Google com 210 avaliações';

  it('mesmo texto de outro dia não entra de novo', () => {
    const { acrescentadas } = acrescentarProvas(atuais, ['Cliente elogia a entrega rápida e o atendimento pelo WhatsApp (do print enviado em 04/10/2026)']);
    expect(acrescentadas).toBe(0);
  });

  it('a mesma prova lida de novo com outras palavras é reconhecida; prova diferente não', () => {
    expect(provaParecida('Cliente elogiou a entrega rápida e o atendimento no WhatsApp', atuais)).toMatch(/^Cliente elogia a entrega/);
    expect(provaParecida('Nota 4,9 no Google, 210 avaliações', atuais)).toMatch(/^Nota 4,9/);
    expect(provaParecida('Cliente conta que o vestido serviu perfeitamente', atuais)).toBe('');
    expect(provaParecida('', atuais)).toBe('');
  });

  it('com o texto desmarcado (parecido), a imagem é guardada mas as provas em texto continuam as mesmas', async () => {
    const cliente = { id: 'c6', marca: { provasSociais: atuais } };
    const r = await guardarProvasRevisadas(cliente, [item(1, 'Cliente elogiou a entrega rápida', { acrescentarTexto: false })]);
    expect(r.salvos).toHaveLength(1); expect(r.acrescentadas).toBe(0);
    expect(cliente.marca.provasSociais).toBe(atuais);
  });

  it('print já guardado em Materiais (mesma impressão digital) é reconhecido', () => {
    const materiais = [{ id: 'a', origem: 'prova_social', hashOriginal: 'abc' }, { id: 'b', origem: 'envio', hash: 'def' }, { id: 'c', origem: 'envio', hash: 'ghi', etiquetas: ['prova social'] }];
    expect(printJaGuardado('abc', materiais)?.id).toBe('a');
    expect(printJaGuardado('ghi', materiais)?.id).toBe('c');
    expect(printJaGuardado('def', materiais)).toBeNull(); // foto comum, não é prova social
    expect(printJaGuardado(null, materiais)).toBeNull();
  });
});
