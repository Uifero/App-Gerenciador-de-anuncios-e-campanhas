// "Criar criativos": status de cada passo, passo em que a aba abre, destino vindo do perfil e rota.
import { describe, it, expect } from 'vitest';
import {
  statusEtapasCriativos, passoInicialCriativos, destinoDoFluxo, formatoDaIdeia, fluxoEmAndamento, subRotaCriativos, rotaCriativos, briefingDoFluxo, ideiaDe,
} from './etapas-criativos.js';

const produtos = [{ id: 'p1', nome: 'Thermora Caps' }];
const cliente = { id: 'c1', comoAnuncia: { destino: 'whatsapp' } };
const st = (ctx) => Object.fromEntries(statusEtapasCriativos(ctx).map((e) => [e.n, e]));

describe('statusEtapasCriativos', () => {
  it('sem nada: passo 1 pede o produto; passo 2 pede ideias; 4 sem peça', () => {
    const e = st({ cliente: {}, fluxo: null, produtos, pecas: [] });
    expect(e[1].status).toBe('falta');
    expect(e[1].faltas.map((f) => f.texto).join(' ')).toMatch(/Escolha o produto/);
    expect(e[1].faltas.some((f) => /WhatsApp ou compra no site/.test(f.texto))).toBe(true);
    expect(e[2].faltas[0].texto).toMatch(/Gerar ideias/);
    expect(e[4].faltas[0].acao).toEqual({ tipo: 'etapa', alvo: 3 });
  });
  it('sem produto cadastrado: ação de cadastrar', () => {
    expect(st({ cliente, fluxo: {}, produtos: [], pecas: [] })[1].faltas[0].acao).toEqual({ tipo: 'novoProduto' });
  });
  it('destino vem de "Sobre como esse cliente anuncia"; com produto, o passo 1 fica completo', () => {
    expect(st({ cliente, fluxo: { produtoId: 'p1' }, produtos, pecas: [] })[1].status).toBe('completo');
  });
  it('produto excluído: avisa', () => {
    expect(st({ cliente, fluxo: { produtoId: 'sumiu' }, produtos, pecas: [] })[1].faltas[0].texto).toMatch(/excluído/);
  });
  it('ideias sem marca: falta marcar; marcadas sem peça: falta produzir cada uma', () => {
    const fluxo = { produtoId: 'p1', ideias: [ideiaDe({ hook: 'A' }, 'i1'), { ...ideiaDe({ hook: 'B', nome: 'B' }, 'i2'), marcada: true, criativoId: 'cr2' }] };
    const e = st({ cliente, fluxo: { ...fluxo, ideias: fluxo.ideias.map((i) => ({ ...i, marcada: false })) }, produtos, pecas: [] });
    expect(e[2].faltas[0].texto).toMatch(/Marque pelo menos uma/);
    const e2 = st({ cliente, fluxo, produtos, pecas: [] });
    expect(e2[2].status).toBe('completo');
    expect(e2[3].faltas).toHaveLength(1);
    expect(st({ cliente, fluxo, produtos, pecas: [{ criativoId: 'cr2', status: 'usar' }] })[3].status).toBe('completo');
  });
  it('galeria: peças novas pedem revisão', () => {
    const e = st({ cliente, fluxo: {}, produtos, pecas: [{ status: 'nova' }, { status: 'usar' }, {}] });
    expect(e[4].faltas[0].texto).toMatch(/2 peça\(s\) nova/);
  });
});

describe('passoInicialCriativos', () => {
  it('sem fluxo e com peças: Galeria', () => {
    const etapas = statusEtapasCriativos({ cliente, fluxo: null, produtos, pecas: [{ status: 'usar' }] });
    expect(passoInicialCriativos(etapas, { fluxo: null, pecas: [{}] })).toBe(4);
  });
  it('fluxo em andamento: 1º passo com falta', () => {
    const fluxo = { produtoId: 'p1', ideias: [] };
    const etapas = statusEtapasCriativos({ cliente, fluxo, produtos, pecas: [{ status: 'usar' }] });
    expect(passoInicialCriativos(etapas, { fluxo, pecas: [{}] })).toBe(2);
  });
  it('fluxo concluído com peças: Galeria; nada: passo 1', () => {
    expect(passoInicialCriativos(statusEtapasCriativos({ cliente, fluxo: { produtoId: 'p1', concluidoEm: 'x' }, produtos, pecas: [{}] }), { fluxo: { produtoId: 'p1', concluidoEm: 'x' }, pecas: [{}] })).toBe(4);
    expect(passoInicialCriativos(statusEtapasCriativos({ cliente: {}, produtos, pecas: [] }), { fluxo: null, pecas: [] })).toBe(1);
  });
});

describe('auxiliares', () => {
  it('destino: escolha do fluxo vale mais; "os dois" fica para escolher', () => {
    expect(destinoDoFluxo({ destino: 'site' }, cliente)).toBe('site');
    expect(destinoDoFluxo({}, cliente)).toBe('whatsapp');
    expect(destinoDoFluxo({}, { comoAnuncia: { destino: 'ambos' } })).toBe('');
  });
  it('formato da ideia: vídeo vai para Reels 9:16, o resto para o feed 4:5', () => {
    expect(formatoDaIdeia({ formato: 'video_curto' })).toEqual({ tipo: 'video', formato: '1080x1920' });
    expect(formatoDaIdeia({ formato: 'imagem' })).toEqual({ tipo: 'imagem', formato: '1080x1350' });
    // formato em texto livre, como veio na chamada real (tests/fixtures/ia/ideias-thermora-real.json)
    expect(formatoDaIdeia({ formato: 'Reels 9:16, Owner (a dona fala para a câmera, com legenda na tela)' }).tipo).toBe('video');
    expect(formatoDaIdeia({ formato: 'Estático 4:5 em carrossel de 3 cards, texto grande' }).tipo).toBe('imagem');
    expect(formatoDaIdeia({}).tipo).toBe('video');
  });
  it('fluxo em andamento só com escolha feita e não concluído', () => {
    expect(fluxoEmAndamento(null)).toBe(false);
    expect(fluxoEmAndamento({ ideias: [] })).toBe(false);
    expect(fluxoEmAndamento({ produtoId: 'p1' })).toBe(true);
    expect(fluxoEmAndamento({ produtoId: 'p1', concluidoEm: 'x' })).toBe(false);
  });
  it('rota', () => {
    expect(subRotaCriativos('#/c/x/criativos/3')).toBe(3);
    expect(subRotaCriativos('#/c/x/criativos/todos')).toBe('todos');
    expect(subRotaCriativos('#/c/x/criativos')).toBe(null);
    expect(subRotaCriativos('#/c/x/criativos/9')).toBe(null);
    expect(rotaCriativos('x', 2)).toBe('#/c/x/criativos/2');
  });
  it('briefing do fluxo: produto, objetivo pelo destino e o pedido', () => {
    const b = briefingDoFluxo({ fluxo: { pedido: 'rotina corrida' }, produto: produtos[0], cliente });
    expect(b).toMatch(/Produto: Thermora Caps/);
    expect(b).toMatch(/WhatsApp/);
    expect(b).toMatch(/rotina corrida/);
  });
});
