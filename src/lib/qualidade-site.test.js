// Fase de qualidade, Frente 1: sistema visual por cliente (guardado no site), "Cara de IA" (lista proibida) e requisitos
// legais da loja (passo 6). Tudo sem IA.
import { describe, it, expect } from 'vitest';
import { designDoSite, opcoesDePar, corDaMarca, corDominante, ehRoxoAzul, PARES_FONTES, urlFontes } from './design-site.js';
import { verificarCaraDeIa, corrigirLocal, quebrarParede, pedidoClichesIa, CLICHES } from './cara-de-ia.js';
import { checklistLegal, cnpjValido, cpfValido, normalizarDadosLoja, TRECHO_ARREPENDIMENTO, temArrependimento } from './legal-loja.js';
import { dadosDoPacote, gerarPreviaLojaHTML } from './pacote-loja.js';
import { gerarSiteHTML } from './sitegen.js';
import { REFERENCIA_SITE_PROFISSIONAL } from '../../server/referencias/site-profissional.js';
import { contraste } from './contraste.js';

const thermora = { id: 'c1', nome: 'Thermora', nicho: 'suplemento termogênico', marca: { tomDeVoz: 'direto e confiável' } };
const moda = { id: 'c2', nome: 'Ateliê Lume', nicho: 'moda feminina', marca: { tomDeVoz: 'elegante e minimalista', estetica: 'tons de areia, destaque #7a2e3a' } };

describe('sistema visual por cliente', () => {
  it('pares de fontes pelo nicho e tom: suplemento e moda ganham pares diferentes, sempre 3 opções', () => {
    expect(opcoesDePar(thermora)[0]).toBe('tecnico');
    expect(opcoesDePar(moda)[0]).toBe('editorial');
    expect(opcoesDePar(moda)).toHaveLength(3);
    for (const p of PARES_FONTES) expect(urlFontes(p)).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=.+&display=swap$/);
  });
  it('a escolha do operador fica guardada no site (site.design.par) e vence a sugestão', () => {
    expect(designDoSite({ cliente: thermora, site: { design: { par: 'classico' } } }).par.id).toBe('classico');
    expect(designDoSite({ cliente: thermora, site: { design: { par: 'nao-existe' } } }).par.id).toBe('tecnico');
  });
  it('cor de destaque: escolhida > estética do perfil > logo > IA; roxo padrão antigo não conta como escolha', () => {
    expect(corDaMarca({ cliente: moda, site: {} })).toEqual({ cor: '#7a2e3a', fonte: 'perfil' });
    expect(corDaMarca({ cliente: thermora, site: { modo: 'custom', config: { corPrimaria: '#4f46e5' } }, coresLogo: ['#0f766e'] })).toEqual({ cor: '#0f766e', fonte: 'logo' });
    expect(corDaMarca({ cliente: thermora, site: { modo: 'custom', config: { corPrimaria: '#c2410c' } }, coresLogo: ['#0f766e'] }).fonte).toBe('escolhida');
    expect(corDaMarca({ cliente: thermora, site: {} }).fonte).toBe('neutra');
  });
  it('paleta contida: texto, fundo e destaque; texto sobre o destaque passa de 4,5', () => {
    const d = designDoSite({ cliente: moda, site: {} });
    expect(contraste(d.cores.sobreAcento, d.cores.acento)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(d.cores.texto, d.cores.fundo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(d.cores.apagado, d.cores.fundo)).toBeGreaterThanOrEqual(4.5);
  });
  it('cor do logo: ignora fundo branco/transparente e pega a cor viva', () => {
    const px = []; for (let i = 0; i < 50; i++) px.push(255, 255, 255, 255); for (let i = 0; i < 20; i++) px.push(15, 118, 110, 255); for (let i = 0; i < 30; i++) px.push(0, 0, 0, 0);
    expect(corDominante(px)).toMatch(/^#/);
    expect(ehRoxoAzul(corDominante(px))).toBe(false);
    expect(ehRoxoAzul('#4f46e5')).toBe(true);
  });
  it('os dois clientes não saem com o mesmo molde: fontes, raio e cor diferentes na prévia e no site', () => {
    const prod = [{ id: 'p1', nome: 'Produto', preco: 99, fotos: [{ url: 'https://x/p.jpg' }] }];
    const a = gerarPreviaLojaHTML(dadosDoPacote({ cliente: thermora, site: { plataforma: 'nuvemshop' }, produtos: prod }));
    const b = gerarPreviaLojaHTML(dadosDoPacote({ cliente: moda, site: { plataforma: 'nuvemshop' }, produtos: prod }));
    expect(a).toContain('family=Archivo'); expect(b).toContain('family=Bodoni+Moda');
    expect(a).toContain('--raio:6px'); expect(b).toContain('--raio:0px');
    expect(a).not.toMatch(/linear-gradient\(135deg/);
    const s = gerarSiteHTML({ cliente: moda, produtos: prod, conteudo: { heroTitulo: 'Linho que dura' }, design: { par: 'natural' } });
    expect(s).toContain('family=Fraunces');
    expect(s).toContain('class="hero com-foto" data-banner-produto');
    expect(s).not.toMatch(/linear-gradient\(135deg,var\(--cor\)/);
  });
});

describe('vitrines do site personalizado com desenhos diferentes', () => {
  const prods = [{ id: 'a', nome: 'A', preco: 100, precoPromocional: 80, destaque: true, fotos: [{ url: 'https://x/a.jpg' }] }, { id: 'b', nome: 'B', preco: 50, fotos: [{ url: 'https://x/b.jpg' }] }];
  it('Mais vendidos em faixa, Sale em lista e Catálogo em grade; a estrutura de blocos não muda', () => {
    const h = gerarSiteHTML({ cliente: moda, produtos: prods, conteudo: { heroTitulo: 'Oi' } });
    expect(h).toContain('class="grid g-vendidos" data-vitrine="vendidos"');
    expect(h).toContain('class="grid g-sale" data-vitrine="sale"');
    expect(h).toContain('class="grid g-catalogo" data-vitrine="catalogo"');
    expect(h).toMatch(/.g-vendidos{display:flex[^}]*overflow-x:auto/);
    expect(h).toMatch(/.g-sale .card{display:grid;grid-template-columns:112px 1fr/);
  });
  it('colunas escolhidas pelo operador vencem o desenho padrão', () => {
    const h = gerarSiteHTML({ cliente: moda, produtos: prods, conteudo: { heroTitulo: 'Oi' }, layout: { variacoes: { catalogo: { colunas: 3 } } } });
    expect(h).toContain('class="grid cols3" data-vitrine="catalogo"');
  });
});

describe('"Cara de IA": lista proibida', () => {
  const site = (conteudo) => ({ modo: 'custom', conteudo });
  it('acha os clichês da lista, travessão, exclamação em série, emoji em título e parede de texto', () => {
    const a = verificarCaraDeIa({ site: site({ heroTitulo: 'Descubra a revolução 🚀', heroSubtitulo: 'Uma experiência única — feita para você!', heroCta: 'Compre já!', storytelling: 'x'.repeat(500) }), modo: 'custom', produtos: [{ fotos: [{ url: 'u' }] }] });
    const tipos = a.map((x) => x.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['cliche', 'travessao', 'exclamacao', 'emoji', 'parede']));
    expect(a.filter((x) => x.tipo === 'cliche').map((x) => x.titulo).join(' ')).toMatch(/Descubra[\s\S]*Experiência única[\s\S]*Feito para você/);
  });
  it('a lista do app é a mesma da referência que a IA recebe', () => {
    for (const p of ['Descubra', 'Transforme sua vida', 'Revolucionário', 'Eleve', 'Desbloqueie', 'Experiência única']) expect(REFERENCIA_SITE_PROFISSIONAL).toContain(p);
    expect(CLICHES.length).toBeGreaterThanOrEqual(6);
  });
  it('site limpo: nada encontrado; depoimentos reais e textos do operador (destaques) nunca entram', () => {
    expect(verificarCaraDeIa({ site: site({ heroTitulo: 'Garrafa térmica de 750 ml', heroSubtitulo: 'Gelada por 24 h.', depoimentos: [{ nome: 'Ana', texto: 'Amei!!! Incrível!' }], destaques: [{ linhas: [{ texto: 'Descubra!' }] }] }), modo: 'custom', produtos: [{ fotos: [{ url: 'u' }] }] })).toEqual([]);
  });
  it('banner sem foto real e cor roxa da IA viram achados para o operador', () => {
    const a = verificarCaraDeIa({ site: { modo: 'pacote_plataforma', pacote: {} }, modo: 'pacote', design: { cores: { acento: '#6d28d9' }, fonteCor: 'ia' }, produtos: [] });
    expect(a.map((x) => [x.tipo, x.corrige])).toEqual([['cor', 'manual'], ['banner', 'manual']]);
  });
  it('"Corrigir" local: troca travessão, exclamação e emoji de título, quebra parede; clichê fica para a IA', () => {
    const estado = { conteudo: { heroTitulo: 'Leve 🚀', heroSubtitulo: 'Frio — o dia todo!!', storytelling: `${'Frase curta aqui. '.repeat(40)}` } };
    const achados = verificarCaraDeIa({ site: site({ ...estado.conteudo, heroCta: 'Descubra' }), modo: 'custom', produtos: [{ fotos: [{ url: 'u' }] }] });
    const r = corrigirLocal(estado, achados, { modo: 'custom' });
    expect(r.estado.conteudo.heroTitulo).toBe('Leve');
    expect(r.estado.conteudo.heroSubtitulo).toBe('Frio, o dia todo.');
    expect(r.estado.conteudo.storytelling).toContain('\n\n');
    expect(r.restantes.map((x) => x.tipo)).toEqual(['cliche']);
    expect(estado.conteudo.heroTitulo).toBe('Leve 🚀'); // o original não muda
    expect(pedidoClichesIa(r.restantes)).toMatch(/SÓ estes trechos[\s\S]*Descubra/);
  });
  it('quebrar parede mantém o texto (só ganha respiro)', () => {
    const t = 'Uma. Duas. Três. Quatro. '.repeat(30).trim();
    expect(quebrarParede(t).replace(/\s+/g, ' ')).toBe(t.replace(/\s+/g, ' '));
  });
});

describe('requisitos legais da loja', () => {
  it('CNPJ e CPF conferem pelos dígitos', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
  it('sem dados: diz o que falta e nunca inventa CNPJ ou endereço', () => {
    const l = checklistLegal({ cliente: {}, site: {}, produtos: [{ nome: 'A', preco: 10 }] });
    expect(l.filter((x) => !x.ok).map((x) => x.id)).toEqual(['legal-identificacao', 'legal-contato', 'legal-endereco', 'legal-arrependimento', 'legal-trocas', 'legal-privacidade']);
    expect(l.find((x) => x.id === 'legal-identificacao').falta).toMatch(/não inventa/);
  });
  it('com os dados e as políticas certas, tudo ok; preço riscado maior que o preço é apontado', () => {
    const cliente = { dadosLoja: normalizarDadosLoja({ razaoSocial: 'Loja Ltda', cnpj: '11222333000181', endereco: 'Rua A, 10, Recife/PE', email: 'oi@loja.com' }) };
    expect(cliente.dadosLoja.cnpj).toBe('11.222.333/0001-81');
    const site = { conteudo: { politicas: { trocas: `Troca em 30 dias por defeito. ${TRECHO_ARREPENDIMENTO}`, privacidade: 'Usamos seus dados de nome, endereço e contato só para entregar o pedido; não vendemos dados a ninguém.' } } };
    expect(checklistLegal({ cliente, site, produtos: [{ nome: 'A', preco: 10 }] }).every((x) => x.ok)).toBe(true);
    const errado = checklistLegal({ cliente, site, produtos: [{ id: 'p', nome: 'B', preco: 10, precoPromocional: 12 }] }).find((x) => x.id === 'legal-preco');
    expect(errado.ok).toBe(false); expect(errado.falta).toMatch(/maior ou igual/);
    expect(temArrependimento(TRECHO_ARREPENDIMENTO)).toBe(true);
  });
  it('os dados da loja aparecem no rodapé da prévia e do site', () => {
    const cliente = { nome: 'Loja', dadosLoja: { razaoSocial: 'Loja Ltda', cnpj: '11.222.333/0001-81' } };
    expect(gerarPreviaLojaHTML(dadosDoPacote({ cliente, site: {}, produtos: [] }))).toContain('data-dados-loja>Loja Ltda<br>CNPJ 11.222.333/0001-81');
    expect(gerarSiteHTML({ cliente, produtos: [], conteudo: {} })).toContain('data-dados-loja>Loja Ltda<br>CNPJ 11.222.333/0001-81');
  });
});
