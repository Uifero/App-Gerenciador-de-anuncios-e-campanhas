// Ajuste por seção: cada operação tem a sua seção, o app recusa o que sai das seções enviadas, a IA recebe só os dados
// delas, o texto escrito pelo operador vira escolha de três versões, as conferências baratas rodam só nas seções
// mudadas e a sugestão ignorada não volta (lib/ajuste-secoes.js, lib/sugestoes.js).
import { describe, it, expect } from 'vitest';
import {
  secaoDaOperacao, filtrarOperacoes, mudancasPorSecao, resumoDasSecoes, escolhasDeTexto, conferirSecoes, estimarCusto, textoCusto,
  normalizarEntendimento, responderEntendimento, tarefaDoAjuste, secaoDoItemPlano, secaoDoAchado, secaoDoPrefixo, prefixoSecao, TODO,
} from './ajuste-secoes.js';
import { chaveItemPlano, chaveConferencia, chaveAchado, comIgnorada, semIgnorada, ignoradas } from './sugestoes.js';
import { aplicarOperacoes } from './site-blocos.js';
import { marcarIgnorados, ignorarItemPlano, aplicarSecao, secoesAplicaveis } from './plano-site.js';
import { verificarCaraDeIa, corrigirAchado } from './cara-de-ia.js';
import { statusDoLink } from './aprovacao-site.js';

const foto = (n, usos = {}) => ({ id: `m${n}`, codigo: `F${n}`, url: `https://x/f${n}.jpg`, origem: 'envio', tipo: 'image/jpeg', nomeOriginal: `f${n}.jpg`, usos });
const PRODUTOS = [{ id: 'p1', nome: 'Thermora' }];
const MATERIAIS = [foto(3, { banner: 'manual' }), foto(12, { galeria: 'texto' }), foto(27), foto(30, { produtos: [{ id: 'p1', ordem: 1, principal: true, por: 'manual' }] })];
const ESTADO = {
  conteudo: { heroTitulo: 'Thermora: sua rotina com mais foco', heroSubtitulo: 'Cápsulas com cafeína e chá verde', heroCta: 'Comprar agora', storytelling: 'A Thermora nasceu em 2021.', faq: [{ p: 'Como tomar?', r: 'Duas cápsulas por dia.' }], newsletterTitulo: 'Novidades', newsletterTexto: 'Receba ofertas.' },
  config: { corPrimaria: '#166534', corFundo: '#f7fbf5' },
  layout: {},
};

describe('cada operação mexe numa seção', () => {
  it('site personalizado', () => {
    expect(secaoDaOperacao({ op: 'texto', campo: 'heroTitulo' })).toBe('hero');
    expect(secaoDaOperacao({ op: 'texto', campo: 'storytelling' })).toBe('marca');
    expect(secaoDaOperacao({ op: 'texto', campo: 'titulo.faq' })).toBe('faq');
    expect(secaoDaOperacao({ op: 'faq', acao: 'editar', indice: 0 })).toBe('faq');
    expect(secaoDaOperacao({ op: 'mover', bloco: 'depoimentos', antesDe: 'vendidos' })).toBe('depoimentos');
    expect(secaoDaOperacao({ op: 'foto', codigo: 'F27', uso: 'galeria' })).toBe('galeria');
    expect(secaoDaOperacao({ op: 'foto', codigo: 'F27', uso: 'produto', produto: 'Thermora' })).toBe('produto');
    expect(secaoDaOperacao({ op: 'foto', codigo: 'F27', uso: 'banner' })).toBe('hero');
    expect(secaoDaOperacao({ op: 'paleta', corPrimaria: '#000000' })).toBe('geral');
    expect(secaoDaOperacao({ op: 'texto', campo: 'politicas.trocas' })).toBe('rodape'); // editável (nunca sai)
    expect(secaoDaOperacao({ op: 'texto', campo: 'xyz' })).toBeNull();
  });
  it('pacote', () => {
    expect(secaoDaOperacao({ op: 'texto', campo: 'banner.0.titulo' }, 'pacote')).toBe('banner');
    expect(secaoDaOperacao({ op: 'texto', campo: 'sobre' }, 'pacote')).toBe('sobre');
    expect(secaoDaOperacao({ op: 'produto', nome: 'Thermora', campo: 'descricao' }, 'pacote')).toBe('produto');
    expect(secaoDaOperacao({ op: 'ocultar', bloco: 'galeria' }, 'pacote')).toBe('galeria');
    expect(secaoDaOperacao({ op: 'mover', secao: 'Frete e trocas', antesDe: 'Sobre' }, 'pacote')).toBe('geral');
    expect(secaoDaOperacao({ op: 'foto', codigo: 'F3', uso: 'sobre' }, 'pacote')).toBe('sobre');
  });
});

describe('o app recusa operação fora das seções enviadas', () => {
  const ops = [{ op: 'texto', campo: 'heroSubtitulo', valor: 'Mais curto' }, { op: 'foto', codigo: 'F27', uso: 'galeria', acao: 'usar' }, { op: 'paleta', corPrimaria: '#9f1239', corFundo: '#fff7f7' }];
  it('só hero enviado: a foto da galeria e as cores são recusadas, com o motivo', () => {
    const r = filtrarOperacoes(ops, ['hero']);
    expect(r.dentro).toEqual([ops[0]]);
    expect(r.fora.map((x) => x.motivo)).toEqual([
      'Recusado: mexeria em "Galeria", que não estava no pedido (só "Banner principal").',
      'Recusado: mexeria em "Visual geral (cores e fotos dos produtos)", que não estava no pedido (só "Banner principal").',
    ]);
  });
  it('mudança no site todo libera tudo; operação sem seção conhecida é recusada', () => {
    expect(filtrarOperacoes(ops, [TODO]).dentro).toHaveLength(3);
    expect(filtrarOperacoes([{ op: 'texto', campo: 'xyz', valor: 'a' }], ['hero']).fora[0].motivo).toMatch(/outra parte do site/);
  });
  it('as mudanças aplicadas ficam agrupadas por seção (Antes × Depois)', () => {
    const r = aplicarOperacoes({ ...ESTADO, usosFotos: {} }, ops, { modo: 'custom', materiais: MATERIAIS, produtos: PRODUTOS });
    expect(mudancasPorSecao(r, 'custom').map((s) => [s.secao, s.mudancas.length])).toEqual([['hero', 1], ['galeria', 1], ['geral', 1]]);
  });
});

describe('a IA recebe só as seções afetadas', () => {
  it('banner: vai o banner e as fotos com código; não vão a história nem a FAQ', () => {
    const t = resumoDasSecoes(ESTADO, ['hero'], 'custom', { materiais: MATERIAIS, produtos: PRODUTOS });
    expect(t).toContain('título "Thermora: sua rotina com mais foco"');
    expect(t).toContain('fotos no banner: F3');
    expect(t).toContain('F12: f12.jpg [Galeria]');
    expect(t).not.toContain('A Thermora nasceu');
    expect(t).not.toContain('Como tomar?');
  });
  it('galeria do produto: fotos do Thermora pelo código', () => {
    expect(resumoDasSecoes(ESTADO, ['produto'], 'custom', { materiais: MATERIAIS, produtos: PRODUTOS })).toContain('Thermora: F30');
  });
  it('site todo: todas as seções', () => {
    const t = resumoDasSecoes(ESTADO, [TODO], 'custom', { materiais: MATERIAIS, produtos: PRODUTOS });
    expect(t).toContain('A Thermora nasceu');
    expect(t).toContain('Como tomar?');
  });
});

describe('texto escrito pelo operador: três versões, nunca troca calado', () => {
  const site = { planoAplicado: 'pl1', planos: [{ id: 'pl1', itens: [{ id: 'S1-i1', tipo: 'texto', status: 'pronto', aceito: true, params: { destino: 'banner_titulo' }, partes: [{ id: 'a', original: 'Thermora: sua rotina com mais foco', escolha: 'original', melhorada: '', segura: 'Cápsulas de cafeína e chá verde', confirmado: null, fonte: null }] }] }] };
  it('reescrever o título dele vira escolha "Seu texto / Versão melhorada / Versão segura"', () => {
    const e = escolhasDeTexto([{ op: 'texto', campo: 'heroTitulo', valor: 'Mais foco na sua rotina' }, { op: 'texto', campo: 'heroCta', valor: 'Quero' }], site, 'custom');
    expect(e).toEqual([{ campo: 'heroTitulo', original: 'Thermora: sua rotina com mais foco', melhorada: 'Mais foco na sua rotina', segura: 'Cápsulas de cafeína e chá verde', escolha: null }]);
  });
});

describe('conferências baratas só nas seções mudadas', () => {
  it('alegação de saúde, cara de IA e celular no banner; contraste no visual geral', () => {
    const e = { ...ESTADO, conteudo: { ...ESTADO.conteudo, heroTitulo: 'Thermora acelera o metabolismo e transforma sua rotina de verdade todos os dias', heroSubtitulo: 'Descubra' } };
    const r = conferirSecoes(e, ['hero', 'geral'], 'custom', { saude: true, produtos: PRODUTOS });
    const hero = r.find((s) => s.secao === 'hero').itens;
    expect(hero.find((x) => x.tipo === 'saude')).toMatchObject({ ok: false });
    expect(hero.find((x) => x.tipo === 'saude').texto).toMatch(/metabolismo/);
    expect(hero.find((x) => x.tipo === 'cara_de_ia')).toMatchObject({ ok: false });
    expect(hero.find((x) => x.tipo === 'celular').texto).toMatch(/heroTitulo com \d+ caracteres/);
    expect(r.find((s) => s.secao === 'geral').itens.find((x) => x.tipo === 'contraste')).toMatchObject({ ok: true });
    expect(r.map((s) => s.secao)).toEqual(['hero', 'geral']); // nada da FAQ nem da história
  });
});

describe('custo estimado e modelo', () => {
  it('ajuste por seção (Haiku) custa bem menos que gerar o site todo (Sonnet)', () => {
    const secao = estimarCusto('ajuste_secao', 1500), todo = estimarCusto('site', 12000);
    expect(secao.modelo).toBe('Haiku');
    expect(todo.modelo).toBe('Sonnet');
    expect(secao.usd * 3).toBeLessThan(todo.usd);
    expect(textoCusto(secao)).toMatch(/^~US\$ 0,0\d+ \(Haiku\)$/);
  });
  it('Sonnet só quando muda layout ou é o site todo', () => {
    expect(tarefaDoAjuste({ secoes: [{ id: 'hero', estrutura: false }] })).toBe('ajuste_secao');
    expect(tarefaDoAjuste({ secoes: [{ id: 'hero', estrutura: true }] })).toBe('ajuste_secao_amplo');
    expect(tarefaDoAjuste({ secoes: [{ id: TODO }] })).toBe('ajuste_secao_amplo');
  });
});

describe('"Entendi assim" do pedido livre', () => {
  it('seção inventada sai; pergunta precisa de 2 opções; global vira "Site todo"', () => {
    const e = normalizarEntendimento({ secoes: [{ id: 'hero', oque: 'banner mais curto' }, { id: 'checkout', oque: 'x' }, { id: 'hero', oque: 'repetida' }], perguntas: [{ texto: 'Qual?', opcoes: ['só uma'] }, { texto: 'A galeria da loja ou do produto?', opcoes: [{ texto: 'Da loja', secoes: ['galeria'] }, { texto: 'Do produto', secoes: ['produto'], instrucao: 'na galeria do produto' }] }] });
    expect(e.secoes.map((s) => s.id)).toEqual(['hero']);
    expect(e.perguntas).toHaveLength(1);
    const r = responderEntendimento(e, 'q1', 1);
    expect(r.secoes.map((s) => s.id)).toEqual(['hero', 'produto']);
    expect(r.perguntas[0].resposta).toBe('Do produto');
    expect(normalizarEntendimento({ global: true, oque: 'tom mais informal em tudo' }).secoes).toEqual([{ id: TODO, nome: 'Site todo', oque: 'tom mais informal em tudo', estrutura: true, elementos: [] }]);
  });
  it('"Mudar esta seção" põe o nome no começo e dispensa a IA', () => {
    expect(prefixoSecao('faq')).toBe('Na seção "Perguntas frequentes": ');
    expect(secaoDoPrefixo('Na seção "Perguntas frequentes": tira a pergunta 2')).toBe('faq');
    expect(secaoDoPrefixo('tira a pergunta 2')).toBeNull();
  });
});

describe('sugestões: seção de cada uma e "Ignorar" que não volta', () => {
  it('item da conferência e achado da cara de IA sabem a seção do site', () => {
    expect(secaoDoItemPlano({ tipo: 'produto_fotos' })).toBe('produto');
    expect(secaoDoItemPlano({ tipo: 'texto', params: { destino: 'banner_subtitulo' } }, 'pacote')).toBe('banner');
    expect(secaoDoItemPlano({ tipo: 'texto', params: { destino: 'secao' } })).toBeNull();
    const [a] = verificarCaraDeIa({ site: { conteudo: { heroSubtitulo: 'Descubra a Thermora' } }, modo: 'custom' });
    expect(secaoDoAchado(a)).toBe('hero');
  });
  it('a mesma sugestão (mesmo conteúdo) tem a mesma chave; outro resultado (parcial x não feito) = outra chave', () => {
    const x = { id: 'S2-f1', tipo: 'galeria_fotos', pedido: 'Fotos F12, F27', secao: 'S2' };
    expect(chaveConferencia(x, 'nao')).toBe(chaveConferencia({ ...x, id: 'outro' }, 'nao'));
    expect(chaveConferencia(x, 'nao')).not.toBe(chaveConferencia(x, 'parcial'));
    let site = {};
    site.sugestoesIgnoradas = comIgnorada(site, { chave: chaveConferencia(x, 'm'), fonte: 'conferencia', oque: 'x' });
    expect(ignoradas(site).has(chaveConferencia(x, 'm'))).toBe(true);
    expect(semIgnorada(site, chaveConferencia(x, 'm'))).toEqual([]);
  });
  it('item ignorado no plano não entra ao aplicar e nasce ignorado na próxima análise', () => {
    const plano = { secoes: [{ id: 'S1' }], itens: [{ id: 'S1-i1', secao: 'S1', tipo: 'faq', pedido: 'FAQ', como: 'x', status: 'pronto', aceito: false }], sugestoes: [] };
    const ign = ignorarItemPlano(plano, 'S1-i1', true);
    expect(aplicarSecao(ign, 'S1').itens[0].aceito).toBe(false);
    expect(secoesAplicaveis(ign)).toEqual([]);
    const site = { sugestoesIgnoradas: comIgnorada({}, { chave: chaveItemPlano(plano.itens[0]), fonte: 'analise' }) };
    expect(marcarIgnorados({ ...plano, itens: [{ ...plano.itens[0], id: 'S1-i9' }] }, site).itens[0]).toMatchObject({ ignorado: true, aceito: false });
  });
  it('achado ignorado tem chave pelo texto; corrigir um achado mexe só no texto dele', () => {
    const estado = { conteudo: { heroTitulo: 'Thermora — foco', storytelling: 'A marca — desde 2021' } };
    const achados = verificarCaraDeIa({ site: estado, modo: 'custom' }).filter((a) => a.tipo === 'travessao');
    expect(achados).toHaveLength(2);
    expect(chaveAchado(achados[0])).not.toBe(chaveAchado(achados[1]));
    const r = corrigirAchado(estado, achados[0], { modo: 'custom' });
    expect(r.estado.conteudo).toEqual({ heroTitulo: 'Thermora, foco', storytelling: 'A marca — desde 2021' });
    expect(r.mudancas).toHaveLength(1);
  });
});

describe('link de aprovação depois de aplicar', () => {
  it('fica "Substituído" dizendo que o site mudou', () => {
    expect(statusDoLink({ substituidoEm: '2026-10-14T15:00:00Z', substituidoMotivo: 'versao', substituidoVersao: 4, expiraMs: Date.now() + 1e9 }, null).texto).toBe('Substituído: o site mudou (v4) em 14/10 às 12:00');
  });
});
