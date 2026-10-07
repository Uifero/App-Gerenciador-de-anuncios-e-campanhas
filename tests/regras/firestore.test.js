// Regras do Firestore (firestore.rules) no emulador: o visitante sem login com um link de aprovação só lê aquele link
// e responde sobre as peças dele; nada mais. O admin logado continua com acesso total aos dados do app.
import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

const DIA = 864e5;
let env;
const futuro = () => Date.now() + 30 * DIA;

const COLECOES_PRIVADAS = ['gcc_clientes', 'gcc_produtos', 'gcc_materiais', 'gcc_criativos', 'gcc_sites', 'gcc_resultados',
  'gcc_campanhas', 'gcc_hooks', 'gcc_referencias', 'gcc_playbooks', 'gcc_configuracoes', 'gcc_uso_api', 'gcc_diagnosticos',
  // Análises, tarefas, prints de resultado, documentos de referência e cache da pesquisa do nicho: internos, nunca públicos.
  'gcc_analises_anuncio', 'gcc_tarefas_anuncio', 'gcc_prints_resultado', 'gcc_documentos', 'gcc_pesquisas_nicho'];

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-gcc-regras', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const col of COLECOES_PRIVADAS) await db.doc(`${col}/x1`).set({ clienteId: 'c1', nome: 'privado' });
    await db.doc('gcc_clientes/c2').set({ nome: 'Outro cliente' });
    await db.doc('comissoes_vendas/v1').set({ valor: 10 }); // coleção de fora do app (mesmo projeto)
    const link = (clienteId, itensIds, extra = {}) => ({ clienteId, clienteNome: 'Loja', itensIds, itens: itensIds.map((id) => ({ id })), expiraMs: futuro(), ...extra });
    await db.doc('gcc_aprovacoes/tokA').set(link('c1', ['cr1', 'cr2']));
    await db.doc('gcc_aprovacoes/tokB').set(link('c2', ['crB']));
    await db.doc('gcc_aprovacoes/tokExp').set(link('c1', ['cr1'], { expiraMs: Date.now() - DIA }));
    await db.doc('gcc_aprovacoes/tokSub').set(link('c1', ['site'], { tipo: 'site', substituidoEm: new Date().toISOString(), substituidoPor: 'tokSite' }));
    await db.doc('gcc_aprovacoes/tokSite').set(link('c1', ['site'], { tipo: 'site' }));
    await db.doc('gcc_aprovacoes/tokDes').set(link('c1', ['cr1'], { desativadoEm: new Date().toISOString(), expiraMs: 0 }));
    await db.doc('gcc_aprovacao_respostas/tokB_crB').set({ token: 'tokB', clienteId: 'c2', criativoId: 'crB', status: 'aprovado', comentario: '', em: '2026-10-01T10:00:00Z' });
  });
});

const visitante = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext('admin', { email: 'admin@exemplo.com' }).firestore();
const resposta = (token, criativoId, extra = {}) => ({ token, clienteId: 'c1', criativoId, status: 'aprovado', comentario: 'ok', em: new Date().toISOString(), ...extra });
const responder = (db, token, criativoId, extra = {}, id = `${token}_${criativoId}`) => db.doc(`gcc_aprovacao_respostas/${id}`).set(resposta(token, criativoId, extra));

describe('visitante sem login com um token válido', () => {
  it('lê o próprio link pelo token', async () => {
    await assertSucceeds(visitante().doc('gcc_aprovacoes/tokA').get());
    await assertSucceeds(visitante().doc('gcc_aprovacoes/tokSite').get());
  });

  it('não lista links (nem filtrando por cliente) e não lê link vencido ou desativado', async () => {
    await assertFails(visitante().collection('gcc_aprovacoes').get());
    await assertFails(visitante().collection('gcc_aprovacoes').where('clienteId', '==', 'c1').get());
    await assertFails(visitante().doc('gcc_aprovacoes/tokExp').get());
    await assertFails(visitante().doc('gcc_aprovacoes/tokDes').get());
  });

  it('não altera, cria nem apaga links', async () => {
    await assertFails(visitante().doc('gcc_aprovacoes/tokA').update({ expiraMs: futuro() + DIA }));
    await assertFails(visitante().doc('gcc_aprovacoes/tokNovo').set({ clienteId: 'c1', itensIds: ['cr1'], expiraMs: futuro() }));
    await assertFails(visitante().doc('gcc_aprovacoes/tokA').delete());
  });

  it('não lê clientes, produtos, materiais nem nenhuma outra coleção (por id ou listando)', async () => {
    for (const col of COLECOES_PRIVADAS) {
      await assertFails(visitante().doc(`${col}/x1`).get());
      await assertFails(visitante().collection(col).get());
      await assertFails(visitante().doc(`${col}/x1`).set({ invasao: true }));
    }
    await assertFails(visitante().doc('gcc_clientes/c2').get());
    await assertFails(visitante().doc('comissoes_vendas/v1').get());
  });

  it('responde sobre uma peça do link e pode alterar a própria resposta', async () => {
    await assertSucceeds(responder(visitante(), 'tokA', 'cr1'));
    await assertSucceeds(visitante().doc('gcc_aprovacao_respostas/tokA_cr1').get());
    await assertSucceeds(responder(visitante(), 'tokA', 'cr1', { status: 'ajuste', comentario: 'trocar a cor' }));
    await assertSucceeds(responder(visitante(), 'tokSite', 'site'));
  });

  it('não lista as respostas nem apaga uma resposta', async () => {
    await assertFails(visitante().collection('gcc_aprovacao_respostas').get());
    await assertFails(visitante().collection('gcc_aprovacao_respostas').where('clienteId', '==', 'c2').get());
    await assertSucceeds(responder(visitante(), 'tokA', 'cr1'));
    await assertFails(visitante().doc('gcc_aprovacao_respostas/tokA_cr1').delete());
  });

  it('recusa resposta fora do formato ou fora do link', async () => {
    const v = visitante();
    await assertFails(responder(v, 'tokA', 'crB')); // peça de outro link
    await assertFails(responder(v, 'tokA', 'cr1', { clienteId: 'c2' })); // cliente diferente do link
    await assertFails(responder(v, 'tokA', 'cr1', { status: 'publicado' }));
    await assertFails(responder(v, 'tokA', 'cr1', { comentario: 'x'.repeat(1001) }));
    await assertFails(responder(v, 'tokA', 'cr1', { extra: 'campo a mais' }));
    await assertFails(responder(v, 'tokA', 'cr1', {}, 'outroId')); // id não é <token>_<peça>
    await assertFails(responder(v, 'tokInexistente', 'cr1'));
    await assertFails(v.doc('gcc_aprovacao_respostas/tokA_cr2').set({ token: 'tokA', clienteId: 'c1', criativoId: 'cr2', status: 'aprovado' })); // faltam campos
  });
});

describe('link "Substituído", vencido ou desativado', () => {
  it('recusa resposta em link substituído por um mais novo', async () => {
    await assertFails(responder(visitante(), 'tokSub', 'site'));
  });
  it('recusa resposta em link vencido', async () => {
    await assertFails(responder(visitante(), 'tokExp', 'cr1'));
  });
  it('recusa resposta em link desativado', async () => {
    await assertFails(responder(visitante(), 'tokDes', 'cr1'));
  });
  it('recusa alterar uma resposta antiga depois que o link venceu', async () => {
    await assertSucceeds(responder(visitante(), 'tokA', 'cr1'));
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc('gcc_aprovacoes/tokA').update({ expiraMs: Date.now() - 1000 }));
    await assertFails(responder(visitante(), 'tokA', 'cr1', { status: 'ajuste', comentario: 'mudei' }));
  });
});

describe('admin logado', () => {
  it('lê, lista, cria, altera e apaga em todas as coleções do app', async () => {
    const db = admin();
    for (const col of [...COLECOES_PRIVADAS, 'gcc_aprovacoes', 'gcc_aprovacao_respostas']) {
      await assertSucceeds(db.collection(col).get());
      await assertSucceeds(db.doc(`${col}/novo`).set({ clienteId: 'c1', teste: true }));
      await assertSucceeds(db.doc(`${col}/novo`).update({ teste: false }));
      await assertSucceeds(db.doc(`${col}/novo`).get());
      await assertSucceeds(db.doc(`${col}/novo`).delete());
    }
  });
  it('lê links vencidos e substituídos e as respostas de qualquer cliente', async () => {
    const db = admin();
    await assertSucceeds(db.doc('gcc_aprovacoes/tokExp').get());
    await assertSucceeds(db.doc('gcc_aprovacoes/tokSub').get());
    await assertSucceeds(db.collection('gcc_aprovacao_respostas').where('clienteId', '==', 'c2').get());
    await assertSucceeds(db.doc('gcc_aprovacoes/tokA').update({ expiraMs: futuro() + DIA })); // renovar link
  });
});
