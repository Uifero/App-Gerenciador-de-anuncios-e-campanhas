// Prova social por imagem: conferência da resposta da IA, privacidade no texto, acréscimo sem sobrescrever,
// depoimento do site a partir do print e o resumo do painel "Material para montar o site".
import { describe, it, expect } from 'vitest';
import {
  lerRespostaProvas, limparDadosPessoais, areaValida, acrescentarProvas, linhaProva, tipoMaterial, contarMateriais,
  depoimentoDeProva, mesclarProvasNoSite, depoimentoGerido, resumoMaterialSite, montarDepoimentos, temProvaReal, provasEmTexto, MARCA_MODELO,
} from './prova-social.js';

describe('lerRespostaProvas', () => {
  it('uma leitura por imagem enviada; a que a IA pulou fica sem texto', () => {
    const r = lerRespostaProvas({ imagens: [{ numero: 2, legivel: true, relevante: true, resumo: 'Nota 4,9 no Google' }] }, 2);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ legivel: false, resumo: '' });
    expect(r[1].resumo).toBe('Nota 4,9 no Google');
  });

  it('print ilegível ou sem relação não gera texto (nunca inventa)', () => {
    const r = lerRespostaProvas({ imagens: [{ numero: 1, legivel: 'false', relevante: true, resumo: 'algo', citacao: 'x' }, { numero: 2, legivel: true, relevante: false, resumo: 'foto de gato' }] }, 2);
    expect(r[0]).toMatchObject({ resumo: '', citacao: '' });
    expect(r[0].motivo).toMatch(/ler/);
    expect(r[1].resumo).toBe('');
  });

  it('tira telefone, e-mail e @ do texto e monta o resumo com nota/quantidade quando falta', () => {
    const r = lerRespostaProvas({ imagens: [{ numero: 1, legivel: true, relevante: true, origem: 'Google', nota: '4.8', quantidade: 312, citacao: 'Amei! chama no (11) 98765-4321 ou ana@mail.com @ana.silva' }] }, 1);
    expect(r[0].citacao).not.toMatch(/98765|ana@|@ana/);
    expect(r[0].resumo).toMatch(/Nota 4,8 no Google; 312 avaliações/);
  });

  it('só aceita áreas de tarja dentro da imagem; dado pessoal sem área fica marcado (para cobrir à mão)', () => {
    const r = lerRespostaProvas({ imagens: [{ numero: 1, legivel: true, relevante: true, resumo: 'ok', dadosPessoais: [
      { tipo: 'nome', area: { x: 0.1, y: 0.1, w: 0.3, h: 0.05 } }, { tipo: 'telefone' }, { tipo: 'foto', area: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } },
    ] }] }, 1);
    expect(r[0].dadosPessoais[0].area).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.05 });
    expect(r[0].dadosPessoais[1].area).toBeNull();
    expect(r[0].dadosPessoais[2].area.w).toBeCloseTo(0.1, 5); // cortada na borda
    expect(areaValida({ x: 0.5, y: 0.5, w: 0, h: 0.2 })).toBeNull();
  });
});

describe('acrescentarProvas', () => {
  it('acrescenta uma linha por prova, sem apagar nem repetir o que já existe', () => {
    const r = acrescentarProvas('5 mil clientes', ['Nota 4,9 no Google (do print enviado em 30/09/2026)', '5 mil clientes', '']);
    expect(r.texto).toBe('5 mil clientes\nNota 4,9 no Google (do print enviado em 30/09/2026)');
    expect(r.acrescentadas).toBe(1);
    expect(acrescentarProvas('', ['a']).texto).toBe('a');
  });

  it('a linha anota a fonte e a data do print', () => {
    expect(linhaProva('Nota 5', '2026-09-30T15:00:00.000Z')).toMatch(/^Nota 5 \(do print enviado em \d{2}\/\d{2}\/2026\)$/);
  });

  it('limparDadosPessoais não mexe em nota nem em quantidade', () => {
    expect(limparDadosPessoais('Nota 4,9 com 1.200 avaliações')).toBe('Nota 4,9 com 1.200 avaliações');
  });
});

describe('materiais e depoimentos', () => {
  const lista = [{ origem: 'prova_social' }, { origem: 'site', nome: 'foto.jpg' }, { origem: 'site', nome: 'logo-loja.png' }, { nome: 'clip.mp4' }, { etiquetas: ['prova social'] }];
  it('classifica e conta por tipo', () => {
    expect(tipoMaterial(lista[2])).toBe('logo');
    expect(contarMateriais(lista)).toEqual({ foto: 1, video: 1, logo: 1, prova_social: 2 });
  });

  it('print vira depoimento conforme a escolha; "não usar" some; escritos à mão e de criativos ficam', () => {
    const m = { id: 'm1', url: 'https://x/p.jpg', citacao: 'Chegou rápido', fonteProva: 'Avaliação no Google' };
    expect(depoimentoDeProva(m, '')).toBeNull();
    expect(depoimentoDeProva(m, 'texto')).toMatchObject({ texto: 'Chegou rápido', midiaUrl: null, exibir: 'texto', nome: 'Avaliação no Google' });
    expect(depoimentoDeProva(m, 'print')).toMatchObject({ midiaUrl: 'https://x/p.jpg', midiaTipo: 'imagem', exibir: 'print' });
    const atuais = [{ nome: 'Ana', texto: 'ok' }, { origem: 'criativo', texto: 'h' }, { origem: 'prova_social', materialId: 'velho', texto: 'v' }];
    const r = mesclarProvasNoSite(atuais, [depoimentoDeProva(m, 'ambos'), null]);
    expect(r.map((d) => d.texto)).toEqual(['ok', 'h', 'Chegou rápido']);
    expect(r.filter(depoimentoGerido)).toHaveLength(2);
  });
});

describe('resumoMaterialSite (painel)', () => {
  it('reflete o que existe e aponta o que falta, sem bloquear', () => {
    const cliente = { id: 'c1', marca: { tomDeVoz: 'leve', usp: '', provasSociais: '' }, rastreamento: {} };
    const produtos = [{ nome: 'A', preco: 10, fotos: ['x'] }, { nome: 'B', preco: '' }];
    const itens = resumoMaterialSite({ cliente, produtos, materiais: [{ origem: 'site', nome: 'f.jpg' }], respondidas: 5 });
    const por = Object.fromEntries(itens.map((i) => [i.chave, i]));
    expect(por.perfil.linhas[0]).toBe('1 de 4 preenchidos');
    expect(por.perfil.editar).toEqual({ tipo: 'pergunta', alvo: 'usp' });
    expect(por.provas.avisos[0]).toMatch(/Sem provas sociais/);
    expect(por.produtos.linhas[0]).toBe('2 cadastrado(s) · 1 com foto · 1 sem preço');
    expect(por.produtos.avisos).toContain('1 produto(s) sem preço');
    expect(por.produtos.editar).toEqual({ tipo: 'pergunta', alvo: 'produtos' }); // sem a aba Produtos no escopo
    const comAba = resumoMaterialSite({ cliente: { ...cliente, escopo: { produtos: true } }, produtos });
    expect(comAba.find((i) => i.chave === 'produtos').editar).toEqual({ tipo: 'rota', alvo: '#/c/c1/produtos' });
    expect(por.rastreamento.campos.every((c) => !c.ok)).toBe(true);
    expect(por.rastreamento.avisos).toHaveLength(1);
    expect(por.materiais.linhas[0]).toMatch(/1 arquivo\(s\): 1 foto/);
    expect(por.questionario.linhas[0]).toBe('5 de 18 respondidas');
  });

  it('com provas em texto e em imagem, sem aviso; "ainda não tem Pixel" marcado tira o aviso', () => {
    const cliente = { id: 'c1', marca: { provasSociais: 'a\nb' } };
    const itens = resumoMaterialSite({ cliente, materiais: [{ origem: 'prova_social' }], site: { semPixel: true } });
    const provas = itens.find((i) => i.chave === 'provas');
    expect(provas.linhas[0]).toBe('2 em texto · 1 print(s) de avaliação');
    expect(provas.avisos).toEqual([]);
    expect(itens.find((i) => i.chave === 'rastreamento').avisos).toEqual([]);
  });
});

describe('montarDepoimentos (site: prova real primeiro, modelo só sem nenhuma)', () => {
  const modelosIa = [{ nome: 'Cliente', texto: 'Amei o produto' }, { nome: 'Cliente', texto: '[MODELO – substituir por depoimento real] Chegou rápido' }];
  const print = { id: 'm1', origem: 'prova_social', url: 'https://x/p.jpg', descricao: 'Nota 4,9 no Google com 187 avaliações' };

  it('sem nenhuma prova: usa os modelos da IA, todos marcados (a seção não fica vazia)', () => {
    const r = montarDepoimentos({ cliente: { marca: {} }, modelosIa });
    expect(r.usouModelos).toBe(true);
    expect(r.depoimentos).toHaveLength(2);
    expect(r.depoimentos.every((d) => d.texto.startsWith(MARCA_MODELO) && d.origem === 'modelo')).toBe(true);
    expect(r.depoimentos[1].texto.match(/\[MODELO/g)).toHaveLength(1); // não marca duas vezes
    expect(temProvaReal({ cliente: { marca: {} } })).toBe(false);
  });

  it('uma única prova em texto já basta: só ela, sem misturar modelo', () => {
    const cliente = { marca: { provasSociais: 'Mais de 2 mil clientes atendidos' } };
    const r = montarDepoimentos({ cliente, modelosIa, atuais: [{ nome: 'Cliente', texto: '[MODELO – substituir por depoimento real] velho' }] });
    expect(r.usouModelos).toBe(false);
    expect(r.depoimentos).toEqual([{ nome: 'Clientes da loja', texto: 'Mais de 2 mil clientes atendidos', origem: 'prova_texto' }]);
    expect(temProvaReal({ cliente })).toBe(true);
  });

  it('respeita a escolha por print: no site, o texto dele não repete; "Não usar" some com o texto; sem decisão, o texto entra', () => {
    const cliente = { marca: { provasSociais: 'Nota 4,9 no Google com 187 avaliações (do print enviado em 30/09/2026)\nElogio pelo WhatsApp: amei a vela' } };
    const noSite = { nome: 'Avaliação no Google', texto: 'Velas maravilhosas', origem: 'prova_social', materialId: 'm1', exibir: 'print', midiaUrl: 'https://x/p.jpg' };
    const a = montarDepoimentos({ cliente, materiais: [print], atuais: [noSite] });
    expect(a.depoimentos.map((d) => d.texto)).toEqual(['Elogio pelo WhatsApp: amei a vela', 'Velas maravilhosas']);
    const b = montarDepoimentos({ cliente, materiais: [print], provasOcultas: ['m1'] });
    expect(b.depoimentos.map((d) => d.texto)).toEqual(['Elogio pelo WhatsApp: amei a vela']);
    expect(provasEmTexto(cliente, [print]).map((d) => d.nome)).toEqual(['Avaliação no Google', 'Elogio pelo WhatsApp']);
  });

  it('só prints (sem texto) e criativos também contam como prova real; escrito à mão fica; sem duplicar', () => {
    const atuais = [{ nome: 'Ana', texto: 'Serviu certinho' }, { nome: 'Ana', texto: 'Serviu certinho' }, { nome: 'Loja', texto: 'Hook', origem: 'criativo' }];
    const r = montarDepoimentos({ cliente: { marca: {} }, atuais, modelosIa });
    expect(r.usouModelos).toBe(false);
    expect(r.depoimentos.map((d) => d.texto)).toEqual(['Serviu certinho', 'Hook']);
  });
});