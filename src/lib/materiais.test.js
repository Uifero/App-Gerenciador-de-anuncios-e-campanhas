// Logo do cliente: vai ORIGINAL (mesmos bytes, mesmo tipo), um por cliente, e troca apaga o anterior.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const docs = new Map(); const enviados = []; const removidos = []; const clientes = {};
let seq = 0;
vi.mock('../core/storage.js', () => ({
  COL: { materiais: 'materiais', clientes: 'clientes' },
  removerArquivo: vi.fn(async (p) => { removidos.push(p); }),
  db: {
    criar: vi.fn(async (col, d) => { const id = `m${++seq}`; const doc = { id, ...d, criadoEm: new Date(Date.now() + seq).toISOString() }; docs.set(id, doc); return doc; }),
    listar: vi.fn(async (col, f) => [...docs.values()].filter((d) => d.clienteId === f.clienteId)),
    remover: vi.fn(async (col, id) => { docs.delete(id); }),
    atualizar: vi.fn(async (col, id, patch) => { clientes[id] = { ...(clientes[id] || {}), ...patch }; }),
  },
}));
vi.mock('../core/firebase.js', () => ({ DEMO: false }));
vi.mock('./uploads.js', () => ({
  enviarArquivoOuAvisar: vi.fn(async (caminho, file) => { enviados.push({ caminho, file }); return { url: `https://x/${caminho}`, path: caminho }; }),
}));

const { salvarLogo, validarLogo, logoAtual, AVISO_JPG, validarMaterial, enviarMateriais, removerMaterial, limiteMaterialMB } = await import('./materiais.js');
const bytes = async (b) => new Uint8Array(await b.arrayBuffer());

describe('logo do cliente', () => {
  beforeEach(() => { docs.clear(); enviados.length = 0; removidos.length = 0; });

  it('PNG transparente é enviado com os MESMOS bytes e o mesmo tipo (nunca recomprimido nem convertido)', async () => {
    // PNG mínimo com canal alfa (cabeçalho real + bytes): qualquer conversão mudaria o conteúdo ou o tipo.
    const original = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3, 4, 5, 6]);
    const cliente = { id: 'c1' };
    await salvarLogo(cliente, new File([original], 'Logo Loja.png', { type: 'image/png' }));
    expect(enviados).toHaveLength(1);
    expect(enviados[0].file.type).toBe('image/png');
    expect(enviados[0].caminho).toMatch(/^gcc\/c1\/materiais\/logo-.*\.png$/);
    expect(await bytes(enviados[0].file)).toEqual(original);
    expect(cliente.logoArquivo).toMatchObject({ nome: 'Logo Loja.png', tipo: 'image/png' });
    expect([...docs.values()][0]).toMatchObject({ origem: 'logo', nomeOriginal: 'Logo Loja.png' });
  });

  it('SVG (mesmo sem tipo, como o Windows às vezes manda) e JPG também vão como vieram', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    await salvarLogo({ id: 'c2' }, new File([svg], 'logo.svg', { type: '' }));
    expect(enviados[0].file.type).toBe('image/svg+xml');
    expect(enviados[0].caminho).toMatch(/\.svg$/);
    expect(await enviados[0].file.text()).toBe(svg);
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
    await salvarLogo({ id: 'c3' }, new File([jpg], 'logo.jpg', { type: 'image/jpeg' }));
    expect(await bytes(enviados[1].file)).toEqual(jpg);
    expect(validarLogo(new File([jpg], 'logo.jpg', { type: 'image/jpeg' })).aviso).toBe(AVISO_JPG);
  });

  it('recusa formato que não é PNG, SVG ou JPG', () => {
    expect(() => validarLogo(new File(['x'], 'logo.gif', { type: 'image/gif' }))).toThrow(/PNG, SVG ou JPG/);
  });

  it('um logo atual por cliente: trocar apaga o anterior (registro e arquivo)', async () => {
    const cliente = { id: 'c4' };
    await salvarLogo(cliente, new File(['a'], 'v1.png', { type: 'image/png' }));
    const primeiro = [...docs.values()][0];
    await salvarLogo(cliente, new File(['b'], 'v2.png', { type: 'image/png' }));
    const restantes = [...docs.values()].filter((d) => d.clienteId === 'c4');
    expect(restantes).toHaveLength(1);
    expect(restantes[0].nomeOriginal).toBe('v2.png');
    expect(removidos).toContain(primeiro.path);
    expect(logoAtual([...docs.values()]).nomeOriginal).toBe('v2.png');
    expect(cliente.logoArquivo.nome).toBe('v2.png');
  });

  it('fotos e vídeos: tipo detectado sozinho (MOV sem tipo pela extensão), mesmos bytes, limite com mensagem clara', async () => {
    expect(validarMaterial(new File(['x'], 'a.webp', { type: 'image/webp' }))).toEqual({ tipo: 'image/webp', video: false });
    expect(validarMaterial(new File(['x'], 'clipe.MOV', { type: '' }))).toEqual({ tipo: 'video/quicktime', video: true });
    expect(() => validarMaterial(new File(['x'], 'doc.pdf', { type: 'application/pdf' }))).toThrow(/formato não aceito/);
    const grande = { name: 'video.mp4', type: 'video/mp4', size: 101 * 1024 * 1024 };
    expect(() => validarMaterial(grande)).toThrow(/101.0 MB e passa do limite de 100 MB/);
    expect(limiteMaterialMB(true)).toBe(3); expect(limiteMaterialMB(false)).toBe(100);
    const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
    const r = await enviarMateriais({ id: 'c5' }, [new File([mp4], 'clipe.mp4', { type: 'video/mp4' }), new File(['p'], 'x.pdf', { type: 'application/pdf' })]);
    expect(r.salvos).toHaveLength(1); expect(r.falhas[0]).toMatch(/x.pdf/);
    expect(enviados[0].caminho).toMatch(/^gcc\/c5\/materiais\/envio-.*\.mp4$/);
    expect(await bytes(enviados[0].file)).toEqual(mp4);
    expect(r.salvos[0]).toMatchObject({ origem: 'envio', tipo: 'video/mp4', nomeOriginal: 'clipe.mp4' });
  });

  it('apagar material tira o arquivo do Storage; apagar o logo atual deixa o cliente sem logo', async () => {
    const cliente = { id: 'c6' };
    const logo = await salvarLogo(cliente, new File(['l'], 'logo.png', { type: 'image/png' }));
    await removerMaterial(cliente, logo);
    expect(removidos).toContain(logo.path);
    expect([...docs.values()].some((d) => d.id === logo.id)).toBe(false);
    expect(cliente.logoArquivo).toBeNull();
  });
});
