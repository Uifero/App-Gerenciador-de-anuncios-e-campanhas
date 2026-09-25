// Regras da leitura do site/Instagram do cliente: nada sem base no texto, nada sobrescrito, tudo marcado.
import { describe, it, expect } from 'vitest';
import { tipoLink, evidenciaConfere, nomeNoTexto, sugestoesSite, sugestoesPrints, aplicarLeitura, marcasQueContinuam, textoMarca } from './leitura.js';
import { contextoCliente, contextoCatalogo } from '../core/ia.js';

describe('tipoLink', () => {
  it('site x Instagram (com ou sem https, @perfil)', () => {
    expect(tipoLink('loja.com.br')).toEqual({ tipo: 'site', url: 'https://loja.com.br/' });
    expect(tipoLink('https://www.instagram.com/Atelie.Fit/?hl=pt')).toMatchObject({ tipo: 'instagram', usuario: 'atelie.fit' });
    expect(tipoLink('@atelie_fit')).toMatchObject({ tipo: 'instagram', usuario: 'atelie_fit' });
    expect(tipoLink('https://instagram.com/p/Cxyz/')).toBeNull(); // post, não perfil
    expect(tipoLink('javascript:alert(1)')).toBeNull();
    expect(tipoLink('')).toBeNull();
  });
});

const texto = 'Treine sem medo. Legging Blindada não fica transparente no agachamento. Mais de 5 mil clientes, nota 4,9 em 320 avaliações. Chega aí, bora treinar!';

describe('evidência', () => {
  it('confere o trecho citado no texto lido (tolerante a acento e pontuação)', () => {
    expect(evidenciaConfere('não fica transparente no agachamento', texto)).toBe(true);
    expect(evidenciaConfere('Mais de 5 mil clientes, nota 4.9', texto)).toBe(true);
    expect(evidenciaConfere('frete grátis para todo o Brasil em 24 horas', texto)).toBe(false);
    expect(evidenciaConfere('', texto)).toBe(false);
    expect(nomeNoTexto('legging blindada', texto)).toBe(true);
    expect(nomeNoTexto('Top Nuvem', texto)).toBe(false);
  });
});

describe('sugestoesSite', () => {
  const leitura = { texto, produtos: [{ nome: 'Legging Blindada', preco: 129.9, imagens: [], fonte: 'jsonld' }] };
  it('só aceita campos com evidência e produtos cujo nome aparece no site', () => {
    const s = sugestoesSite({ leitura, interpretacao: {
      resumo: 'Marca de leggings.',
      tomDeVoz: { valor: 'descontraído', evidencia: 'Chega aí, bora treinar!' },
      usp: { valor: 'Não fica transparente', evidencia: 'não fica transparente no agachamento' },
      provasSociais: { valor: 'Frete grátis 24h', evidencia: 'frete grátis para todo o Brasil em 24 horas' },
      produtos: [{ nome: 'Legging Blindada' }, { nome: 'Top Nuvem', preco: 79 }],
    } });
    expect(s.campos).toEqual({ tomDeVoz: 'descontraído', usp: 'Não fica transparente' });
    expect(s.produtos.map((p) => p.nome)).toEqual(['Legging Blindada']);
    expect(s.descartados).toHaveLength(2);
  });
});

describe('sugestoesPrints (Instagram por print)', () => {
  const resposta = {
    legivel: true, resumo: 'Marca de leggings com fotos claras.',
    imagens: [{ numero: 1, legivel: true, conteudo: 'bio do perfil' }, { numero: 2, legivel: false, conteudo: 'foto borrada' }],
    tomDeVoz: { valor: 'descontraído, com emojis', evidencia: 'legenda "bora treinar 💪"', imagem: 1 },
    estetica: { valor: 'tons terrosos, fundo claro', evidencia: 'grid com fundo bege', imagem: 1 },
    provasSociais: { valor: '12,4 mil seguidores', evidencia: '12,4 mil seguidores na bio', imagem: 9 }, // print que não existe
    usp: { valor: 'não fica transparente', evidencia: '' },                                             // sem evidência
    produtos: [{ nome: 'Legging Blindada', preco: 129.9, imagem: 1, evidencia: 'post com o nome' }, { nome: 'Inventado', imagem: 1 }],
  };
  it('só aceita o que a IA diz ter visto num print que existe, com o que viu', () => {
    const s = sugestoesPrints({ resposta, total: 2 });
    expect(s.encontrado).toBe(true);
    expect(s.campos).toEqual({ tomDeVoz: 'descontraído, com emojis', estetica: 'tons terrosos, fundo claro' });
    expect(s.produtos.map((p) => [p.nome, p.preco])).toEqual([['Legging Blindada', 129.9]]);
    expect(s.descartados).toHaveLength(3);
    expect(s.imagens).toEqual([{ numero: 1, legivel: true, conteudo: 'bio do perfil' }, { numero: 2, legivel: false, conteudo: 'foto borrada' }]);
  });
  it('prints ilegíveis ou sem nada relevante: nada preenchido, com o motivo', () => {
    const s = sugestoesPrints({ resposta: { legivel: false, motivo: 'As imagens são paisagens, sem perfil de marca.', imagens: [{ numero: 1, legivel: false, conteudo: 'paisagem' }] }, total: 1 });
    expect(s).toMatchObject({ encontrado: false, campos: {}, produtos: [], observacao: 'As imagens são paisagens, sem perfil de marca.' });
    expect(sugestoesPrints({ resposta: {}, total: 1 })).toMatchObject({ encontrado: false, observacao: 'Os prints não mostram informação legível sobre a marca.' });
    expect(sugestoesPrints({ resposta: { legivel: false, tomDeVoz: resposta.tomDeVoz }, total: 1 }).campos).toEqual({}); // IA disse "ilegível": não usa o resto
  });
});

describe('aplicarLeitura', () => {
  const meta = { origem: 'site', url: 'https://loja.com.br/', em: '2026-09-25' };
  it('preenche só campo vazio, marca a origem; campo já preenchido vira conflito; produto repetido não entra', () => {
    const cliente = { marca: { usp: 'Meu diferencial escrito à mão', idioma: 'pt-BR' } };
    const r = aplicarLeitura(cliente, [{ nome: 'legging blindada' }], { campos: { tomDeVoz: 'descontraído', usp: 'Não fica transparente' }, produtos: [{ nome: 'Legging Blindada' }, { nome: 'Top', preco: 79 }] }, meta);
    expect(r.patch.marca).toEqual({ usp: 'Meu diferencial escrito à mão', idioma: 'pt-BR', tomDeVoz: 'descontraído' });
    expect(r.patch.autoPreenchido).toEqual({ tomDeVoz: meta });
    expect(r.conflitos).toEqual([{ campo: 'usp', atual: 'Meu diferencial escrito à mão', sugerido: 'Não fica transparente' }]);
    expect(r.novosProdutos).toHaveLength(1);
    expect(r.novosProdutos[0]).toMatchObject({ nome: 'Top', preco: 79, origemAuto: meta });
  });
  it('marcasQueContinuam: editar o campo tira a marca', () => {
    const auto = { tomDeVoz: meta, usp: meta };
    expect(marcasQueContinuam(auto, { tomDeVoz: 'a', usp: 'b' }, { tomDeVoz: 'a', usp: 'outro' })).toEqual({ tomDeVoz: meta });
    expect(textoMarca(meta)).toBe('preenchido automaticamente do site, confirme ou edite');
  });
});

describe('uso na geração de criativos', () => {
  it('o contexto diz o que é voz real (do site) e traz o resumo como reforço', () => {
    const c = { nome: 'X', nicho: 'fitness', marca: { tomDeVoz: 'descontraído', usp: 'u' }, autoPreenchido: { tomDeVoz: { origem: 'site' } }, leituraSite: { tipo: 'site', resumo: 'Marca jovem de leggings.' } };
    const ctx = contextoCliente(c);
    expect(ctx).toContain('Tom de voz (tirado do site do próprio cliente — é a voz real da marca): descontraído');
    expect(ctx).toContain('Diferencial (USP): u');
    expect(ctx).toContain('reforço de contexto');
    expect(ctx).toContain('Marca jovem de leggings.');
    const ig = contextoCliente({ nome: 'X', nicho: 'n', marca: { estetica: 'tons terrosos' }, autoPreenchido: { estetica: { origem: 'instagram' } }, leituraInstagram: { resumo: 'Perfil de cosméticos.' } });
    expect(ig).toContain('Estética visual / paleta de cor (tirado do Instagram do próprio cliente — é a voz real da marca): tons terrosos');
    expect(ig).toContain('no Instagram dela (lido de prints — reforço de contexto');
  });
  it('catálogo real vai junto (nomes e preços)', () => {
    expect(contextoCatalogo([{ nome: 'Legging', preco: 129.9, origemAuto: { origem: 'site' } }])).toContain('"Legging" (R$ 129.9) [lido do site do cliente]');
    expect(contextoCatalogo([])).toBe('');
  });
});
