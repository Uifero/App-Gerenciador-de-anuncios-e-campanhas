import { describe, it, expect } from 'vitest';
import { pendenciasDoSite, marcaPreencher, temMarcaPreencher, itensDoPlanoAplicado } from './pendencias-site.js';
import { gerarSiteHTML } from './sitegen.js';
import { achadosSaudeSite, achadosSaude } from './saude.js';
import { capacidadesDoSite, semNotaDeSobra } from './capacidades-site.js';
import { fotosPorNome } from './fotos-site.js';
import { verificarCaraDeIa } from './cara-de-ia.js';

const P = [{ id: 'p1', nome: 'Gel Redutor', preco: 0, descricao: '', variacoes: [], fotos: [] }, { id: 'p2', nome: 'Cinta', preco: 59.9, descricao: 'Cinta modeladora.', fotos: [{ url: 'u' }], formula: 'Algodão' }];

describe('pendências "Preencher"', () => {
  it('lista o que só o cliente tem; "Deixar para o cliente" fica marcado; kits só quando o plano pede', () => {
    const site = { pacote: { recursos: { secoesProduto: ['formula'] } }, preencher: { cliente: ['p1:formula'] } };
    const l = pendenciasDoSite({ site, modo: 'pacote', produtos: P });
    expect(l.map((x) => x.id)).toEqual(['p1:formula', 'p1:preco', 'p1:descricao', 'p1:foto']);
    expect(l[0].cliente).toBe(true);
    const comKit = pendenciasDoSite({ site, modo: 'pacote', produtos: P, itens: [{ pedido: 'Kit com 3 potes', aceito: true }] });
    expect(comKit.some((x) => x.id === 'p2:kits')).toBe(true);
    expect(marcaPreencher('preço do Gel')).toBe('[PREENCHER: preço do Gel]');
    expect(temMarcaPreencher('Descrição: [PREENCHER: x]')).toBe(true);
    expect(itensDoPlanoAplicado({ planos: [{ id: 'a', itens: [{ aceito: true, status: 'pronto' }, { aceito: false, status: 'pronto' }] }], planoAplicado: 'a' })).toHaveLength(1);
  });
  it('site personalizado: produto sem dado sai com o lugar marcado (tracejado), sem texto inventado', () => {
    const html = gerarSiteHTML({ cliente: { nome: 'Loja' }, produtos: P, conteudo: { heroTitulo: 'Oi', heroCta: 'Ver' }, config: { recursos: { paginaProduto: true, secoesProduto: ['formula'] } } });
    expect(html).toContain('data-preencher="p1:formula"');
    expect(html).toContain('<b>Preencher:</b> preço do Gel Redutor');
    expect(html).toContain('Foto a escolher');
    expect(html).not.toContain('data-preencher="p2:formula"'); // a Cinta tem fórmula
  });
  it('marca "Preencher" nunca conta como alegação de saúde nem como cara de IA', () => {
    expect(achadosSaudeSite('[PREENCHER: benefícios do Gel Redutor para emagrecimento]')).toEqual([]);
    expect(achadosSaudeSite('Ajudou no inchaço e perdi medidas')).toEqual(expect.arrayContaining(['inchaço', 'medidas']));
    expect(achadosSaude('Ajudou no corpo')).toEqual([]); // criativo: a regra de anúncio continua a mesma
    expect(verificarCaraDeIa({ site: { pacote: { banners: [{ titulo: 'Oi' }] }, conteudo: {} }, modo: 'pacote' }).some((a) => /PREENCHER/.test(JSON.stringify(a)))).toBe(false);
  });
});

describe('a IA conhece os limites', () => {
  it('a lista do que dá para mudar diz o que é do tema e nunca manda guardar texto no briefing', () => {
    const t = capacidadesDoSite('pacote', { secoes: ['geral', 'confianca'], plataforma: 'shopify' });
    expect(t).toMatch(/pacote para Shopify/);
    expect(t).toMatch(/Compra segura\): faixa fixa e legal/);
    expect(t).toMatch(/Nunca use "tema.observacoes"/);
    expect(semNotaDeSobra([{ op: 'texto', campo: 'tema.estilo', valor: 'x' }], 'deixa o estilo do tema mais limpo').ops).toHaveLength(1); // pediu o tema: vale
  });
  it('foto pelo nome: sem foto ligada ao produto, diz que não há (nunca chuta); com código no texto, vale o código', () => {
    expect(fotosPorNome('põe a foto do Gel Redutor no banner', { materiais: [], produtos: P })).toMatchObject({ produto: { nome: 'Gel Redutor' }, fotos: [] });
    expect(fotosPorNome('põe a F5 do Gel Redutor no banner', { materiais: [], produtos: P })).toBeNull();
    expect(fotosPorNome('muda o texto do banner', { materiais: [], produtos: P })).toBeNull();
  });
});
