import { describe, it, expect } from 'vitest';
import {
  novosCodigos, mudarUso, mudarPessoa, comUsos, usosDe, lerReferencias, aplicarReferencias, imagemDoLugar, fotosDoProduto,
  fotosDoUso, arquivosPorPasta, resumoUsos,
} from './fotos-site.js';
import { printsDoCliente, printsSemAutorizacao } from './visual-site.js';

const foto = (id, codigo, extra = {}) => ({ id, codigo, url: `https://x/${id}.jpg`, nome: `envio-${id}.jpg`, nomeOriginal: `${id}.jpg`, origem: 'envio', tipo: 'image/jpeg', criadoEm: `2026-10-0${id.slice(-1)}T00:00:00Z`, ...extra });
const produtos = [{ id: 'p1', nome: 'Thermora', fotos: [{ url: 'https://x/propria.jpg', path: 'gcc/c/produtos/p1/1727000000000_propria.jpg' }] }, { id: 'p2', nome: 'Garrafa Clássica', fotos: [] }];

describe('códigos estáveis (F1, F2...)', () => {
  it('numera na ordem de envio e continua do maior já usado', () => {
    const lista = [foto('m1', 'F1'), foto('m2'), foto('m3')];
    const r = novosCodigos(lista, 1);
    expect(r.atribuir).toEqual([{ id: 'm2', codigo: 'F2' }, { id: 'm3', codigo: 'F3' }]);
    expect(r.contador).toBe(3);
  });
  it('código apagado nunca volta: o contador do cliente manda, mesmo sem a foto de maior código', () => {
    // F3 foi apagada: sobram F1 e F2, contador 3 -> a próxima é F4
    expect(novosCodigos([foto('m1', 'F1'), foto('m2', 'F2'), foto('m4')], 3).atribuir).toEqual([{ id: 'm4', codigo: 'F4' }]);
    // contador perdido (backup antigo): ainda assim não repete um código existente
    expect(novosCodigos([foto('m1', 'F7'), foto('m2')], 0).atribuir).toEqual([{ id: 'm2', codigo: 'F8' }]);
  });
  it('logo, vídeo e print da referência não recebem código', () => {
    const r = novosCodigos([{ id: 'l', origem: 'logo', url: 'u' }, { id: 'v', tipo: 'video/mp4', nome: 'a.mp4', url: 'u' }, { id: 'r', origem: 'referencia', url: 'u' }], 0);
    expect(r.atribuir).toEqual([]);
  });
});

describe('seletor "Usar em" (escolha manual)', () => {
  it('banner é um só; produto com posição e foto principal única', () => {
    let lista = [foto('m1', 'F1'), foto('m2', 'F2'), foto('m3', 'F3')];
    lista = comUsos(lista, mudarUso(lista, 'm1', { uso: 'banner' }));
    lista = comUsos(lista, mudarUso(lista, 'm2', { uso: 'banner' }));
    expect(usosDe(lista[0]).banner).toBeUndefined();
    expect(usosDe(lista[1]).banner).toBe('manual');
    lista = comUsos(lista, mudarUso(lista, 'm2', { uso: 'produto', produtoId: 'p1' }));
    lista = comUsos(lista, mudarUso(lista, 'm3', { uso: 'produto', produtoId: 'p1', principal: true }));
    expect(usosDe(lista[1]).produtos[0]).toMatchObject({ id: 'p1', ordem: 1, principal: false, por: 'manual' });
    expect(usosDe(lista[2]).produtos[0]).toMatchObject({ id: 'p1', ordem: 2, principal: true });
    lista = comUsos(lista, mudarUso(lista, 'm2', { uso: 'produto', produtoId: 'p1', principal: true }));
    expect(usosDe(lista[2]).produtos[0].principal).toBe(false);
    // a mesma foto em mais de um uso
    lista = comUsos(lista, mudarUso(lista, 'm2', { uso: 'galeria' }));
    expect(resumoUsos(lista[1], produtos).map((x) => x.texto)).toEqual(['Banner', 'Thermora (principal)', 'Galeria']);
  });
  it('"Não usar no site" tira os outros usos, e tirar uma escolha bloqueia o texto', () => {
    let lista = [foto('m1', 'F1')];
    lista = comUsos(lista, mudarUso(lista, 'm1', { uso: 'galeria' }));
    lista = comUsos(lista, mudarUso(lista, 'm1', { uso: 'nao' }));
    expect(usosDe(lista[0])).toMatchObject({ nao: 'manual', produtos: [] });
    expect(usosDe(lista[0]).galeria).toBeUndefined();
    lista = comUsos(lista, mudarUso(lista, 'm1', { uso: 'nao', ligado: false }));
    expect(usosDe(lista[0]).bloqueados).toContain('nao');
  });
});

describe('referências no texto', () => {
  const lista = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => foto(`m${n}`, `F${n}`));
  it('lê "F3 no banner, F5 e F6 no Thermora, F8 nos depoimentos"', () => {
    const { refs, avisos } = lerReferencias('F3 no banner, F5 e F6 no Thermora, F8 nos depoimentos', { materiais: lista, produtos });
    expect(avisos).toEqual([]);
    expect(refs.map((r) => [r.codigo, r.uso, r.produtoId || '', r.ordem])).toEqual([['F3', 'banner', '', 0], ['F5', 'produto', 'p1', 1], ['F6', 'produto', 'p1', 2], ['F8', 'clientes', '', 0]]);
  });
  it('ditado ("efe três na galeria", "f 2 como principal do thermora") e destino antes do código', () => {
    const { refs } = lerReferencias('efe três na galeria. f 2 como foto principal do thermora. Na história use F4', { materiais: lista, produtos });
    expect(refs.map((r) => [r.codigo, r.uso, r.principal])).toEqual([['F3', 'galeria', false], ['F2', 'produto', true], ['F4', 'sobre', false]]);
  });
  it('código que não existe e destino que não entendeu viram aviso, nada inventado', () => {
    const { refs, avisos } = lerReferencias('F20 no banner, F1 na vitrine', { materiais: lista, produtos });
    expect(refs).toEqual([]);
    expect(avisos.join(' ')).toMatch(/F20 não existe nos Materiais do cliente \(os códigos vão de F1 a F8\)/);
    expect(avisos.join(' ')).toMatch(/Não entendi onde usar F1/);
  });
  it('aplica marcando "texto" e refaz do zero a cada geração', () => {
    const { refs } = lerReferencias('F3 no banner, F5 no Thermora', { materiais: lista, produtos });
    const r1 = aplicarReferencias(lista, refs, { produtos });
    const depois = comUsos(lista, r1.patches);
    expect(usosDe(depois[2]).banner).toBe('texto');
    expect(usosDe(depois[4]).produtos[0]).toMatchObject({ id: 'p1', por: 'texto' });
    // texto mudou: F3 sai do banner, F4 entra
    const r2 = aplicarReferencias(depois, lerReferencias('F4 no banner', { materiais: depois, produtos }).refs, { produtos });
    const final = comUsos(depois, r2.patches);
    expect(usosDe(final[2]).banner).toBeUndefined();
    expect(usosDe(final[3]).banner).toBe('texto');
    expect(usosDe(final[4]).produtos).toEqual([]);
  });
});

describe('prioridade: o seletor vence o texto', () => {
  const base = [foto('m2', 'F2', { usos: { banner: 'manual' } }), foto('m3', 'F3'), foto('m5', 'F5', { usos: { nao: 'manual' } }), foto('m6', 'F6', { usos: { bloqueados: ['produto:p1'] } })];
  it('conflitos viram linha de explicação e a referência não entra', () => {
    const { refs } = lerReferencias('F3 no banner, F5 no Thermora, F6 no Thermora', { materiais: base, produtos });
    const r = aplicarReferencias(base, refs, { produtos });
    expect(r.patches).toEqual([]);
    expect(r.conflitos).toHaveLength(3);
    expect(r.conflitos[0]).toMatch(/no seletor o banner é F2: vale o seletor/);
    expect(r.conflitos[1]).toMatch(/F5 está "Não usar no site": vale o seletor/);
    expect(r.conflitos[2]).toMatch(/tirada no seletor/);
  });
  it('escolha direta do modo (ajustes rápidos) também vence o texto', () => {
    const lista = [foto('m1', 'F1'), foto('m3', 'F3')];
    const r = aplicarReferencias(lista, lerReferencias('F3 no banner', { materiais: lista, produtos }).refs, { direta: { banner: { materialId: 'm1', nome: 'm1.jpg' } } });
    expect(r.patches).toEqual([]);
    expect(r.conflitos[0]).toMatch(/já foi escolhida à mão nos ajustes \("m1.jpg"\)/);
  });
  it('gerar de novo nunca mexe nas escolhas manuais', () => {
    const lista = [foto('m1', 'F1', { usos: { banner: 'manual', produtos: [{ id: 'p1', ordem: 1, principal: true, por: 'manual' }] } }), foto('m2', 'F2')];
    const r = aplicarReferencias(lista, lerReferencias('', { materiais: lista, produtos }).refs, { produtos });
    expect(r.patches).toEqual([]);
    expect(imagemDoLugar(lista, 'banner', { url: 'https://direta' })).toMatchObject({ materialId: 'm1', por: 'manual' });
  });
  it('imagem do lugar: manual > direta > texto', () => {
    const lista = [foto('m1', 'F1', { usos: { banner: 'texto' } })];
    expect(imagemDoLugar(lista, 'banner', null)).toMatchObject({ codigo: 'F1', por: 'texto' });
    expect(imagemDoLugar(lista, 'banner', { url: 'https://direta' })).toBeNull();
  });
});

describe('fotos no site', () => {
  it('produto: principal primeiro, depois as da aba Produtos, depois as ligadas na posição; sem cópia de arquivo', () => {
    const lista = [
      foto('m1', 'F1', { usos: { produtos: [{ id: 'p1', ordem: 2 }] } }),
      foto('m2', 'F2', { usos: { produtos: [{ id: 'p1', ordem: 1 }] } }),
      foto('m3', 'F3', { usos: { produtos: [{ id: 'p1', principal: true }] } }),
      foto('m4', 'F4', { usos: { nao: 'manual', produtos: [] } }),
    ];
    const f = fotosDoProduto(produtos[0], lista);
    expect(f.map((x) => x.codigo || x.nome)).toEqual(['F3', 'propria.jpg', 'F2', 'F1']);
    expect(f[0].url).toBe(lista[2].url); // o mesmo arquivo dos Materiais
  });
  it('no produto, as fotos escolhidas no seletor vêm antes das do texto', () => {
    const lista = [foto('m5', 'F5', { usos: { produtos: [{ id: 'p2', ordem: 1, por: 'texto' }] } }), foto('m3', 'F3', { usos: { produtos: [{ id: 'p2', ordem: 2, por: 'manual' }] } })];
    expect(fotosDoProduto(produtos[1], lista).map((x) => x.codigo)).toEqual(['F3', 'F5']);
  });
  it('apagar a foto: o produto perde só ela', () => {
    const lista = [foto('m1', 'F1', { usos: { produtos: [{ id: 'p1' }] } }), foto('m2', 'F2', { usos: { produtos: [{ id: 'p1' }] } })];
    expect(fotosDoProduto(produtos[0], lista.slice(1)).map((x) => x.codigo || x.nome)).toEqual(['propria.jpg', 'F2']);
  });
  it('Clientes reais: foto com pessoa pede autorização; sem pessoa, não', () => {
    let lista = [foto('m1', 'F1', { usos: { clientes: 'manual' } }), foto('m2', 'F2', { usos: { clientes: 'manual' } })];
    lista = comUsos(lista, mudarPessoa(lista, 'm2', true));
    const prints = printsDoCliente(lista);
    expect(prints.map((p) => p.codigo)).toEqual(['F1', 'F2']);
    expect(printsSemAutorizacao(prints).map((p) => p.codigo)).toEqual(['F2']);
  });
  it('"Não usar no site" tira até um print de prova social da seção Clientes reais', () => {
    const lista = [foto('m1', 'F1', { origem: 'prova_social' }), foto('m2', 'F2', { origem: 'prova_social', usos: { nao: 'manual' } })];
    expect(printsDoCliente(lista).map((p) => p.codigo)).toEqual(['F1']);
  });
});

describe('pastas do pacote', () => {
  it('banner, produtos/<nome>, clientes-reais (cópia borrada), sobre e galeria', () => {
    const d = {
      visual: { banner: { url: 'https://x/b.jpg', nome: 'Banner Loja.JPG', codigo: 'F3' } },
      produtos: [{ nome: 'Thermora Azul', arquivos: [{ url: 'https://x/a.png', nome: 'frente.png', codigo: 'F5' }, { url: 'https://x/propria.jpg', nome: 'propria.jpg' }] }, { nome: 'Thermora Azul', arquivos: [{ url: 'https://x/c.jpg', nome: 'c.jpg', codigo: 'F9' }] }],
      provas: [{ url: 'https://x/borrada.jpg', codigo: 'F8', nome: 'print.png' }],
      sobreImagens: [{ url: 'https://x/s.webp', nome: 's.webp', codigo: 'F2' }],
      galeria: [],
    };
    expect(arquivosPorPasta(d).map((x) => x.caminho)).toEqual([
      'banner/01-F3-banner-loja.jpg', 'produtos/thermora-azul/01-F5-frente.png', 'produtos/thermora-azul/02-propria.jpg',
      'produtos/thermora-azul-2/01-F9-c.jpg', 'clientes-reais/01-F8-print.png', 'sobre/01-F2-s.webp',
    ]);
    expect(arquivosPorPasta(d).find((x) => x.caminho.startsWith('clientes-reais')).url).toBe('https://x/borrada.jpg');
  });
  it('fotos da galeria em ordem de código', () => {
    expect(fotosDoUso([foto('m9', 'F9', { usos: { galeria: 'texto' } }), foto('m2', 'F2', { usos: { galeria: 'manual' } })], 'galeria').map((x) => x.codigo)).toEqual(['F2', 'F9']);
  });
});
