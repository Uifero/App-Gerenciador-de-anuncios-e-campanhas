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
    await removerMaterial(cliente, logo, { confirmado: true });
    expect(removidos).toContain(logo.path);
    expect([...docs.values()].some((d) => d.id === logo.id)).toBe(false);
    expect(cliente.logoArquivo).toBeNull();
  });
});

describe('nenhuma operação apaga material sem ser o apagar com confirmação', () => {
  beforeEach(() => { docs.clear(); removidos.length = 0; });

  it('removerMaterial sem motivo explícito recusa e não toca no banco nem no Storage', async () => {
    const cliente = { id: 'c7' };
    const [prova] = (await enviarMateriais(cliente, [new File(['p'], 'print.jpg', { type: 'image/jpeg' })])).salvos;
    await expect(removerMaterial(cliente, prova)).rejects.toThrow(/confirmação/);
    await expect(removerMaterial(cliente, prova, { trocando: 'logo' })).rejects.toThrow(); // troca de logo não apaga o que não é logo
    await expect(removerMaterial(cliente, { ...prova, origem: 'prova_social' }, { trocando: 'referencia' })).rejects.toThrow();
    expect(docs.has(prova.id)).toBe(true); expect(removidos).toEqual([]);
  });

  it('trocar o logo só apaga o logo anterior', async () => {
    const cliente = { id: 'c8' };
    const [foto] = (await enviarMateriais(cliente, [new File(['f'], 'foto.jpg', { type: 'image/jpeg' })])).salvos;
    const l1 = await salvarLogo(cliente, new File(['a'], 'v1.png', { type: 'image/png' }));
    await salvarLogo(cliente, new File(['b'], 'v2.png', { type: 'image/png' }));
    expect(docs.has(l1.id)).toBe(false); expect(docs.has(foto.id)).toBe(true);
  });

  it('no código, só lib/materiais.js (removerMaterial) e o apagar cliente (lib/cascata.js) apagam material; quem chama removerMaterial passa o motivo', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const raiz = join(process.cwd(), 'src');
    const arquivos = []; const andar = (d) => readdirSync(d).forEach((n) => { const p = join(d, n); if (statSync(p).isDirectory()) andar(p); else if (/\.js$/.test(n) && !/\.test\.js$/.test(n)) arquivos.push(p); });
    andar(raiz);
    const rel = (p) => p.slice(raiz.length + 1).split('\\').join('/');
    const apagaDireto = arquivos.filter((p) => /(db\.remover|removerTodos)\(\s*COL\.materiais/.test(readFileSync(p, 'utf8'))).map(rel).sort();
    expect(apagaDireto).toEqual(['lib/cascata.js', 'lib/materiais.js']);
    expect(readFileSync(join(raiz, 'lib/materiais.js'), 'utf8').match(/db\.remover\(\s*COL\.materiais/g)).toHaveLength(1); // só dentro de removerMaterial
    // Toda chamada de removerMaterial fora da definição diz por quê (confirmado após confirmar(), ou trocando logo/referência).
    for (const p of arquivos) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/removerMaterial\(([^;]*?)\);/g)) {
        if (/export async function/.test(src.slice(Math.max(0, m.index - 30), m.index))) continue;
        expect(m[1], `${rel(p)}: removerMaterial sem motivo`).toMatch(/confirmado: true|trocando: /);
        if (/confirmado: true/.test(m[1])) expect(src.slice(Math.max(0, m.index - 600), m.index), `${rel(p)}: apagar sem confirmar()`).toMatch(/confirmar\(/);
      }
    }
  });
});
