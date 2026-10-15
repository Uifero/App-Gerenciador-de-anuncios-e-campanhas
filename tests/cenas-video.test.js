// Roteiro de vídeo em campos separados: a direção da cena ("O que mostrar") nunca vai para a tela, e cada cena usa a foto
// que combina com ela (ou "Falta foto"), nunca uma foto sem relação. Roteiro do Thermora de produção como fixture; IA
// simulada com tests/fixtures/ia/criativos-cenas-thermora-simulada.json (sem chamada real aqui).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROTEIRO_ANTIGO, criativoAntigo, midiasThermora } from './fixtures/thermora-roteiro.js';
import { cliente } from './fixtures/thermora-producao.js';
import { lerRoteiro, cenasDoCriativo, textoNaTela, fotoDaCena, imagemResultadoCorpo, NOTA_IMAGEM_CORPO, duracaoDoTempo } from '../src/lib/cenas.js';
import { extrairCenas, midiaDaCena } from '../src/lib/estudio.js';
import { printsParaCriativo } from '../src/lib/conexoes.js';
import { planoInicial } from '../src/lib/animacoes.js';

vi.mock('../src/core/auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('../src/modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../src/modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));
const { gerarCriativos, INSTRUCAO_CENAS } = await import('../src/core/ia.js');

const DIRECAO_3 = 'Mão derruba um dos potes sem querer, cena real, sem drama, só a situação do dia a dia corrido.';
const semDirecao = (t) => !/\bcena\s*\d/i.test(t) && !/\d+\s*-\s*\d+\s*s\b/.test(t) && !/derruba|bancada|câmera|luz natural|close no/i.test(t);

describe('roteiro antigo "CENA N (x-ys) — ..." vira campos separados (o texto do criativo não muda)', () => {
  it('formato exato de produção: direção em "O que mostrar", só o texto entre aspas vai para "Texto na tela"', () => {
    const c = lerRoteiro(ROTEIRO_ANTIGO);
    expect(c).toHaveLength(4);
    expect(c[0]).toEqual({ tempo: '0-3s', mostrar: 'Bancada do banheiro com vários potes de suplemento espalhados, câmera no celular, luz natural.', texto: 'Quantos potes você tem aí?', fala: '' });
    expect(c[2]).toEqual({ tempo: '7-11s', mostrar: DIRECAO_3, texto: '', fala: '' }); // sem "Texto na tela": vazio, nunca a direção
    expect(c[3]).toMatchObject({ texto: '2 cápsulas com o café', fala: 'Duas cápsulas com o café e pronto.' });
    expect(duracaoDoTempo(c[2].tempo)).toBe(4);
    expect(cenasDoCriativo(criativoAntigo)).toMatchObject({ origem: 'roteiro' });
    expect(criativoAntigo.copy).toBe(ROTEIRO_ANTIGO);
  });
  it('outro formato antigo real ("Texto: ... Imagem: ...", "Legenda do post:") também separa', () => {
    const fx = JSON.parse(JSON.parse(readFileSync('tests/fixtures/ia/criativos-thermora-sem-efeito-real.json', 'utf8')).texto);
    const c = lerRoteiro(fx[0].copy);
    expect(c[1]).toEqual({ tempo: '3-6s', mostrar: 'mão pegando o pote da bancada.', texto: 'Uma coisa no meio disso:', fala: '' });
    expect(c.at(-1).mostrar).not.toMatch(/Legenda do post/);
  });
  it('cenas guardadas no criativo vencem o texto antigo', () => {
    const cenas = [{ tempo: '0-2s', mostrar: 'Pote na mesa', texto: 'Bom dia', fala: '' }];
    expect(cenasDoCriativo({ ...criativoAntigo, cenas })).toEqual({ cenas, origem: 'criativo' });
  });
});

describe('o vídeo escreve SÓ o "Texto na tela"', () => {
  it('linha do tempo do roteiro antigo: nenhuma tela tem direção, "CENA" ou tempo; cena sem texto não tem texto', () => {
    const cenas = extrairCenas(criativoAntigo);
    const telas = cenas.map(textoNaTela);
    expect(telas).toEqual(['Quantos potes você tem aí?', 'Eu tinha 4. Agora tenho 1.', '', '2 cápsulas com o café', 'Conheça a fórmula']);
    for (const t of telas) expect(semDirecao(t)).toBe(true);
    expect(cenas[2]).toMatchObject({ mostrar: DIRECAO_3, texto: '', dur: 4 });
  });
  it('direção colada no campo por engano não vai para a tela', () => {
    expect(textoNaTela({ texto: `CENA 3 (7-11s) — ${DIRECAO_3}` })).toBe('');
    expect(textoNaTela({ texto: 'CENA 1 (0-3s) — Bancada. Texto na tela: "Quantos potes você tem aí?"' })).toBe('Quantos potes você tem aí?');
    expect(textoNaTela({ texto: '' })).toBe('');
  });
  it('animações também só usam o texto na tela', () => {
    const pl = planoInicial('zoom_legenda', { criativo: criativoAntigo, produto: { nome: 'Thermora Metabolic Formula', preco: 147 }, cliente });
    for (const c of pl.cenas) expect(semDirecao(c.texto || '')).toBe(true);
  });
});

describe('foto de cada cena', () => {
  const cenas = lerRoteiro(ROTEIRO_ANTIGO);
  it('usa a foto que combina com "O que mostrar"; nunca a balança nem o jeans', () => {
    const escolhidas = cenas.map((c, i) => fotoDaCena(c, i, midiasThermora));
    expect(escolhidas.map((x) => x.como)).toEqual(['combina', 'combina', 'combina', 'combina']);
    expect(escolhidas[3].midia.nome).toBe('F15-cafe.jpg');
    for (const x of escolhidas) expect(x.midia.nome).not.toMatch(/balanca|jeans/);
  });
  it('nenhuma foto combina: "Falta foto" (sem imagem no vídeo), nunca uma foto sem relação', () => {
    const soSemRelacao = midiasThermora.filter((m) => /balanca|jeans/.test(m.nome));
    const f = fotoDaCena(cenas[2], 2, soSemRelacao);
    expect(f).toEqual({ midia: null, idx: null, como: 'falta' });
    expect(midiaDaCena({ falta: true }, 2, soSemRelacao)).toBeNull(); // o gravador não cai no rodízio
  });
  it('escolha manual sempre vence', () => {
    expect(fotoDaCena({ ...cenas[0], midiaIdx: 2 }, 0, midiasThermora)).toMatchObject({ como: 'manual', midia: { nome: 'F40-jeans.jpg' } });
  });
  it('cena sem direção (gancho/CTA montados à mão) continua em rodízio, como antes', () => {
    expect(fotoDaCena({ texto: 'Conheça', mostrar: '' }, 5, midiasThermora).como).toBe('rodizio');
  });
});

describe('imagem de resultado no corpo: nota e selo "Risco Meta", nunca bloqueia', () => {
  it('balança/kg, roupa larga, antes e depois e medidas', () => {
    expect(midiasThermora.map((m) => imagemResultadoCorpo(m.rotulo))).toEqual([false, true, true, false]);
    expect(imagemResultadoCorpo('Foto de antes e depois')).toBe(true);
    expect(imagemResultadoCorpo('Perdeu medidas na cintura')).toBe(true);
    expect(NOTA_IMAGEM_CORPO).toBe('Imagem de resultado no corpo: o Meta costuma reprovar em suplemento.');
  });
  it('print "perdi 3 kg" pode ir para o criativo, com o aviso', () => {
    const [p] = printsParaCriativo({ cliente, materiais: [{ id: 'm1', url: 'https://x/o.jpg', origem: 'prova_social', descricao: 'Balança: 63,60 kg e depois 62,50 kg', borrada: { url: 'https://x/b.jpg' }, autorizado: true }] });
    expect(p).toMatchObject({ usavel: true, riscoMeta: NOTA_IMAGEM_CORPO });
  });
});

describe('IA escreve as cenas com campos separados', () => {
  let pedidos = [];
  beforeEach(() => {
    pedidos = [];
    const { texto } = JSON.parse(readFileSync('tests/fixtures/ia/criativos-cenas-thermora-simulada.json', 'utf8'));
    vi.stubGlobal('fetch', vi.fn(async (_u, o) => { pedidos.push(JSON.parse(o.body)); return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ texto }) }; }));
  });
  it('o pedido explica os campos e o limite de palavras; a resposta vira criativo.cenas', async () => {
    const [v] = await gerarCriativos({ cliente, briefing: 'Reels do Thermora', formato: 'video_curto', quantidade: 1 });
    const enviado = pedidos.map((p) => p.messages.map((m) => m.content).join('\n')).join('\n');
    expect(enviado).toContain('"cenas" (');
    expect(enviado).toContain(INSTRUCAO_CENAS);
    expect(INSTRUCAO_CENAS).toMatch(/no máximo 8 palavras/);
    expect(v.cenas).toHaveLength(4);
    expect(v.cenas[1]).toEqual({ tempo: '3-7s', mostrar: 'Mão derruba um dos potes sem querer, cena real, sem drama.', texto: '', fala: '' });
    const telas = extrairCenas(v).map(textoNaTela);
    for (const t of telas) expect(semDirecao(t)).toBe(true);
    expect(v.copy).not.toMatch(/cena\s*\d/i);
  });
});

describe('narração usa a fala da cena, nunca a direção', () => {
  it('fala da cena > texto na tela; cena só com direção fica "(sem fala)"', async () => {
    const { montarRoteiroNarracao, textoSoFala } = await import('../src/lib/narracao.js');
    const linhas = montarRoteiroNarracao(extrairCenas(criativoAntigo));
    expect(linhas[2].fala).toBe('');
    expect(linhas[3].fala).toBe('Duas cápsulas com o café e pronto.');
    expect(semDirecao(textoSoFala(linhas))).toBe(true);
  });
});

describe('resposta REAL da IA (criativos-cenas-thermora-real.json): campos separados', () => {
  it('cada cena tem direção e texto na tela curto, sem direção, "CENA" ou tempo', async () => {
    const { texto } = JSON.parse(readFileSync('tests/fixtures/ia/criativos-cenas-thermora-real.json', 'utf8'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => ({ texto }) })));
    const [v] = await gerarCriativos({ cliente, briefing: 'Reels do Thermora', formato: 'video_curto', quantidade: 1 });
    expect(v.cenas.length).toBeGreaterThan(2);
    for (const c of v.cenas) {
      expect(c.mostrar).not.toBe('');
      expect(c.texto.split(' ').length).toBeLessThanOrEqual(8);
      expect(semDirecao(textoNaTela(c))).toBe(true);
      expect(textoNaTela(c)).toBe(c.texto);
    }
    expect(v.copy).not.toMatch(/cena\s*\d/i);
  });
});
