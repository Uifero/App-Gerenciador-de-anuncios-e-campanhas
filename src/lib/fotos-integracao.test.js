// "Usar em" das fotos ligado ao site: HTML do site personalizado, prévia/"O que colocar" do pacote, "Ajustar este site"
// (operação "foto") e backup.
import { describe, it, expect, vi } from 'vitest';
import { gerarSiteHTML } from './sitegen.js';
import { dadosDoPacote, gruposPlataforma, gerarPreviaLojaHTML } from './pacote-loja.js';
import { aplicarOperacoes, estadoDoSite } from './site-blocos.js';
import { printsDoCliente } from './visual-site.js';
import { arquivosPorPasta, comUsos, usosDe } from './fotos-site.js';

const foto = (id, codigo, usos = {}, extra = {}) => ({ id, codigo, usos, url: `https://x/${id}.jpg`, nome: `envio-${id}.jpg`, nomeOriginal: `${id}-original.jpg`, origem: 'envio', tipo: 'image/jpeg', ...extra });
const cliente = { id: 'c1', nome: 'Loja Térmica' };
const produtos = [{ id: 'p1', nome: 'Thermora', preco: 99, fotos: [{ url: 'https://x/propria.jpg', path: 'gcc/c1/produtos/p1/1727000000000_propria.jpg' }] }, { id: 'p2', nome: 'Garrafa', preco: 50, fotos: [] }];
const materiais = [
  foto('m1', 'F1', { banner: 'manual' }),
  foto('m2', 'F2', { produtos: [{ id: 'p1', ordem: 1, principal: true, por: 'manual' }] }),
  foto('m3', 'F3', { produtos: [{ id: 'p2', ordem: 2, por: 'manual' }] }),
  foto('m4', 'F4', { produtos: [{ id: 'p2', ordem: 1, por: 'manual' }] }),
  foto('m5', 'F5', { clientes: 'manual', pessoa: true }),
  foto('m6', 'F6', { sobre: 'texto', galeria: 'manual' }),
];

describe('site personalizado', () => {
  it('banner, fotos dos produtos na ordem, história e galeria vêm do "Usar em"', () => {
    const html = gerarSiteHTML({ cliente, produtos, conteudo: { heroTitulo: 'Oi', storytelling: 'Nossa história' }, layout: { imagens: { hero: { materialId: 'mX', url: 'https://x/direta.jpg', nome: 'direta' } } }, materiais, provas: printsDoCliente(materiais) });
    expect(html).toContain("url('https://x/m1.jpg')"); // seletor vence a escolha direta
    expect(html).not.toContain('direta.jpg');
    expect(html).toContain('<img src="https://x/m2.jpg" alt="Thermora"'); // foto principal do Thermora
    expect(html).toContain('<img src="https://x/m4.jpg" alt="Garrafa"'); // posição 1 da Garrafa
    expect(html).toContain('class="story-img" src="https://x/m6.jpg"');
    expect(html).toMatch(/id="galeria"[\s\S]*https:\/\/x\/m6\.jpg/);
    expect(html).toContain('https://x/m5.jpg'); // Clientes reais
  });
  it('sem nenhuma ligação, o site sai como sempre', () => {
    const a = gerarSiteHTML({ cliente, produtos, conteudo: { heroTitulo: 'Oi' } });
    const b = gerarSiteHTML({ cliente, produtos, conteudo: { heroTitulo: 'Oi' }, materiais: [foto('m9', 'F9')] });
    expect(b).toBe(a);
  });
});

describe('pacote', () => {
  const site = { modo: 'pacote_plataforma', plataforma: 'nuvemshop', pacote: { banners: [{ titulo: 'Oi' }], textosPagina: { sobre: 'Sobre nós' } } };
  const d = dadosDoPacote({ cliente, site, produtos, provas: printsDoCliente(materiais), materiais });
  it('"O que colocar na plataforma": arquivos por produto e por seção, com código e nome original', () => {
    const g = Object.fromEntries(gruposPlataforma(d).map((x) => [x.id, x]));
    const fotosThermora = g['produto-0'].itens.find((i) => i.rotulo.startsWith('Fotos'));
    expect(fotosThermora.valor).toBe('1. F2 — m2-original.jpg (principal)\n2. foto da aba Produtos — propria.jpg');
    expect(g['produto-1'].itens.find((i) => i.rotulo.startsWith('Fotos')).valor).toBe('1. F4 — m4-original.jpg (principal)\n2. F3 — m3-original.jpg');
    expect(g['visual-banner'].itens.find((i) => i.rotulo.startsWith('Arquivo')).valor).toBe('F1 — m1-original.jpg');
    expect(g['fotos-sobre'].itens[0].valor).toBe('1. F6 — m6-original.jpg');
    expect(g['fotos-galeria'].itens[0].valor).toBe('1. F6 — m6-original.jpg');
    expect(g.provas.itens.find((i) => i.rotulo === 'Arquivos').valor).toContain('F5 — m5-original.jpg');
  });
  it('prévia e pastas do .zip', () => {
    const h = gerarPreviaLojaHTML(d);
    expect(h).toContain("url('https://x/m1.jpg')");
    expect(h).toContain('class="galeria-fotos"');
    expect(arquivosPorPasta(d).map((x) => x.caminho)).toEqual([
      'banner/01-F1-m1-original.jpg', 'produtos/thermora/01-F2-m2-original.jpg', 'produtos/thermora/02-propria.jpg',
      'produtos/garrafa/01-F4-m4-original.jpg', 'produtos/garrafa/02-F3-m3-original.jpg', 'clientes-reais/01-F5-m5-original.jpg',
      'sobre/01-F6-m6-original.jpg', 'galeria/01-F6-m6-original.jpg',
    ]);
  });
  it('clientes-reais usa a cópia borrada', () => {
    const comBorrada = materiais.map((m) => (m.id === 'm5' ? { ...m, borrada: { url: 'https://x/m5-borrada.jpg' } } : m));
    const d2 = dadosDoPacote({ cliente, site, produtos, provas: printsDoCliente(comBorrada), materiais: comBorrada });
    expect(arquivosPorPasta(d2).find((x) => x.caminho.startsWith('clientes-reais')).url).toBe('https://x/m5-borrada.jpg');
  });
});

describe('"Ajustar este site" e as fotos', () => {
  const site = { modo: 'custom', conteudo: { heroTitulo: 'Oi' }, layout: {} };
  it('a IA não troca a imagem do banner escolhida no seletor; só pedindo a foto pelo código', () => {
    const r = aplicarOperacoes(estadoDoSite(site, 'custom'), [{ op: 'imagem', bloco: 'hero', materialId: 'm3' }, { op: 'texto', campo: 'heroTitulo', valor: 'Novo' }], { modo: 'custom', materiais, produtos });
    expect(r.descartadas[0].motivo).toMatch(/foi escolhida em Materiais do cliente \(F1/);
    expect(r.mudancas).toEqual(['Banner principal: título: "Oi" → "Novo"']);
    expect(r.estado.usosFotos).toBeUndefined(); // ajuste comum não mexe em nenhuma foto
  });
  it('pedido explícito ("usar F3 no banner") vira escolha manual, com antes/depois na prévia', () => {
    const r = aplicarOperacoes(estadoDoSite(site, 'custom'), [{ op: 'foto', codigo: 'f3', uso: 'banner' }], { modo: 'custom', materiais, produtos });
    expect(r.mudancas[0]).toBe('Foto F3: passa a ir em "Banner" (escolha sua, igual ao seletor "Usar em")');
    const depois = comUsos(materiais, Object.entries(r.estado.usosFotos).map(([id, usos]) => ({ id, usos })));
    expect(usosDe(depois.find((m) => m.id === 'm3')).banner).toBe('manual');
    expect(usosDe(depois.find((m) => m.id === 'm1')).banner).toBeUndefined();
    const html = gerarSiteHTML({ cliente, produtos, conteudo: site.conteudo, materiais: depois });
    expect(html).toContain("url('https://x/m3.jpg')");
  });
  it('código ou produto que não existe é recusado com motivo', () => {
    const r = aplicarOperacoes({ pacote: {} }, [{ op: 'foto', codigo: 'F20', uso: 'banner' }, { op: 'foto', codigo: 'F3', uso: 'produto', produto: 'Inexistente' }], { modo: 'pacote', materiais, produtos });
    expect(r.descartadas.map((d) => d.motivo)).toEqual([expect.stringMatching(/"F20" não existe/), expect.stringMatching(/não está cadastrado/)]);
  });
});

describe('backup inclui os vínculos', () => {
  it('materiais (com codigo e usos) e o contador do cliente vão no arquivo', async () => {
    vi.resetModules();
    vi.doMock('../core/storage.js', () => ({
      COL: { clientes: 'clientes', criativos: 'criativos', hooks: 'h', referencias: 'r', campanhas: 'ca', resultados: 're', produtos: 'p', sites: 's', usoApi: 'u', respostas: 'resp', materiais: 'materiais', aprovacoes: 'a', playbooks: 'pb', config: 'cfg' },
      db: { listar: async (col) => (col === 'materiais' ? materiais : []) },
    }));
    vi.doMock('../modules/configuracoes.js', () => ({ registrarBackup: async () => {} }));
    const { montarBackup } = await import('../modules/backup.js');
    const b = await montarBackup({ id: 'c1', nome: 'Loja', contadorFotos: 6 });
    expect(b.colecoes.clientes[0].contadorFotos).toBe(6);
    expect(b.colecoes.materiais.find((m) => m.id === 'm2')).toMatchObject({ codigo: 'F2', usos: { produtos: [{ id: 'p1', principal: true }] } });
    vi.doUnmock('../core/storage.js'); vi.doUnmock('../modules/configuracoes.js');
  });
});
