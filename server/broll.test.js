// Testes do proxy de B-roll (Pexels/Pixabay) sem internet: o `fetch` é substituído por respostas simuladas.
import { describe, it, expect, vi } from 'vitest';
import {
  buscarBroll, baixarBroll, statusBroll, intercalar, melhorArquivoPexels, normalizarPexels, normalizarPixabay, urlPermitida,
} from './broll.js';

const resposta = (corpo, { status = 200, tipo = 'application/json', url = '' } = {}) => ({
  ok: status >= 200 && status < 300, status, url,
  headers: new Map([['content-type', tipo], ['content-length', String(JSON.stringify(corpo).length)]]),
  json: async () => corpo, arrayBuffer: async () => new TextEncoder().encode('bytes').buffer,
});
const PEXELS_VIDEOS = { videos: [{ id: 1, image: 'https://images.pexels.com/v1.jpg', duration: 12, url: 'https://www.pexels.com/video/1', user: { name: 'Ana' },
  video_files: [
    { link: 'https://videos.pexels.com/a-4k.mp4', file_type: 'video/mp4', width: 2160, height: 3840 },
    { link: 'https://videos.pexels.com/a-hd.mp4', file_type: 'video/mp4', width: 1080, height: 1920 },
    { link: 'https://videos.pexels.com/a-sd.mp4', file_type: 'video/mp4', width: 360, height: 640 },
  ] }] };
const PIXABAY_VIDEOS = { hits: [{ id: 9, duration: 8, user: 'bob', pageURL: 'https://pixabay.com/videos/9',
  videos: { medium: { url: 'https://cdn.pixabay.com/v9-medium.mp4', width: 1280, height: 720, thumbnail: 'https://cdn.pixabay.com/v9.jpg' } } }] };

describe('statusBroll', () => {
  it('diz quais chaves existem, sem expor as chaves', () => {
    const s = statusBroll({ PEXELS_API_KEY: 'segredo' });
    expect(s).toEqual({ pexels: true, pixabay: false });
    expect(JSON.stringify(s)).not.toContain('segredo');
  });
});

describe('normalização dos resultados', () => {
  it('Pexels: escolhe o MP4 mais próximo de 1080 px no lado menor', () => {
    expect(melhorArquivoPexels(PEXELS_VIDEOS.videos[0].video_files).link).toBe('https://videos.pexels.com/a-hd.mp4');
    const [v] = normalizarPexels(PEXELS_VIDEOS, 'video');
    expect(v).toMatchObject({ fonte: 'Pexels', tipo: 'video', url: 'https://videos.pexels.com/a-hd.mp4', duracao: 12, autor: 'Ana' });
  });
  it('Pixabay: sem o small, usa o médio e a miniatura dele', () => {
    const [v] = normalizarPixabay(PIXABAY_VIDEOS, 'video');
    expect(v).toMatchObject({ fonte: 'Pixabay', tipo: 'video', url: 'https://cdn.pixabay.com/v9-medium.mp4', miniatura: 'https://cdn.pixabay.com/v9.jpg' });
  });
  it('fotos dos dois bancos', () => {
    expect(normalizarPexels({ photos: [{ id: 2, src: { medium: 'm', large2x: 'g' }, width: 10, height: 20 }] }, 'foto')[0]).toMatchObject({ tipo: 'foto', url: 'g', miniatura: 'm' });
    expect(normalizarPixabay({ hits: [{ id: 3, webformatURL: 'w', largeImageURL: 'l' }] }, 'foto')[0]).toMatchObject({ tipo: 'foto', url: 'l', miniatura: 'w' });
  });
  it('intercala os bancos', () => {
    expect(intercalar([1, 2, 3], ['a'])).toEqual([1, 'a', 2, 3]);
  });
});

describe('buscarBroll', () => {
  it('sem nenhuma chave: mensagem clara para configurar (não erro genérico)', async () => {
    await expect(buscarBroll({ termo: 'praia' }, { env: {}, fetch: vi.fn() })).rejects.toThrow('Configure as chaves gratuitas do Pexels/Pixabay para usar.');
  });
  it('busca nos dois bancos, a chave do Pexels vai no cabeçalho e a do Pixabay só na chamada ao Pixabay', async () => {
    const f = vi.fn(async (url) => resposta(url.includes('pexels') ? PEXELS_VIDEOS : PIXABAY_VIDEOS));
    const r = await buscarBroll({ termo: 'café', tipo: 'video', orientacao: 'portrait' }, { env: { PEXELS_API_KEY: 'kp', PIXABAY_API_KEY: 'kx' }, fetch: f });
    expect(r.itens.map((x) => x.fonte)).toEqual(['Pexels', 'Pixabay']);
    const [urlPexels, optPexels] = f.mock.calls.find(([u]) => u.includes('pexels'));
    expect(optPexels.headers.Authorization).toBe('kp');
    expect(urlPexels).toContain('orientation=portrait');
    expect(urlPexels).not.toContain('kx');
    expect(f.mock.calls.find(([u]) => u.includes('pixabay'))[0]).toContain('key=kx');
  });
  it('se um banco falhar, devolve o outro com aviso', async () => {
    const f = vi.fn(async (url) => (url.includes('pexels') ? resposta({}, { status: 429 }) : resposta(PIXABAY_VIDEOS)));
    const r = await buscarBroll({ termo: 'café' }, { env: { PEXELS_API_KEY: 'kp', PIXABAY_API_KEY: 'kx' }, fetch: f });
    expect(r.itens).toHaveLength(1);
    expect(r.avisos[0]).toContain('Pexels');
  });
  it('valida o termo', async () => {
    await expect(buscarBroll({ termo: '  ' }, { env: { PEXELS_API_KEY: 'k' } })).rejects.toThrow('Digite o que procurar');
  });
});

describe('baixarBroll', () => {
  it('só baixa dos domínios dos bancos (não vira proxy aberto)', async () => {
    expect(urlPermitida('https://videos.pexels.com/x.mp4')).toBe(true);
    expect(urlPermitida('https://cdn.pixabay.com/x.jpg')).toBe(true);
    expect(urlPermitida('http://videos.pexels.com/x.mp4')).toBe(false);
    expect(urlPermitida('https://pexels.com.evil.io/x')).toBe(false);
    expect(urlPermitida('https://169.254.169.254/latest')).toBe(false);
    await expect(baixarBroll('https://exemplo.com/a.mp4', { fetch: vi.fn() })).rejects.toThrow('não permitido');
  });
  it('devolve bytes e tipo de um arquivo permitido', async () => {
    const f = vi.fn(async (url) => resposta({}, { tipo: 'video/mp4', url }));
    const r = await baixarBroll('https://videos.pexels.com/a.mp4', { fetch: f });
    expect(r.tipo).toBe('video/mp4');
    expect(r.bytes.length).toBeGreaterThan(0);
  });
  it('recusa conteúdo que não é imagem/vídeo', async () => {
    const f = vi.fn(async (url) => resposta({}, { tipo: 'text/html', url }));
    await expect(baixarBroll('https://images.pexels.com/a.jpg', { fetch: f })).rejects.toThrow('não é imagem nem vídeo');
  });
});
