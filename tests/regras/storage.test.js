// Regras do Storage (storage.rules) no emulador. Sem login: nada de ler, listar, enviar ou apagar por caminho.
// A página de aprovação só precisa abrir a prévia pelo endereço de download que está no snapshot do link (URL com
// token imprevisível, que o Firebase serve sem passar pelas regras): isso continua funcionando.
import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let env;
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const ARQUIVOS = ['gcc/c1/materiais/foto.png', 'gcc/c1/materiais/print-b.png', 'gcc/c1/previews/cr1/previa.png', 'gcc/c1/criativos/final.png'];

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-gcc-regras', storage: { rules: readFileSync('storage.rules', 'utf8') } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const p of ARQUIVOS) await ctx.storage().ref(p).put(BYTES, { contentType: 'image/png' });
  });
});

const visitante = () => env.unauthenticatedContext().storage();
const admin = () => env.authenticatedContext('admin', { email: 'admin@exemplo.com' }).storage();

describe('visitante sem login', () => {
  it('não lê nem baixa nenhum arquivo pelo caminho (nem a prévia do link)', async () => {
    for (const p of ARQUIVOS) {
      await assertFails(visitante().ref(p).getMetadata());
      await assertFails(visitante().ref(p).getDownloadURL());
    }
  });
  it('não lista pastas', async () => {
    await assertFails(visitante().ref('gcc/c1/materiais').listAll());
    await assertFails(visitante().ref('gcc/c1/previews/cr1').listAll());
    await assertFails(visitante().ref('gcc').listAll());
  });
  it('não envia, troca nem apaga arquivos', async () => {
    await assertFails(visitante().ref('gcc/c1/materiais/novo.png').put(BYTES, { contentType: 'image/png' }));
    await assertFails(visitante().ref('gcc/c1/previews/cr1/previa.png').put(BYTES, { contentType: 'image/png' }));
    await assertFails(visitante().ref('qualquer/coisa.png').put(BYTES, { contentType: 'image/png' }));
    for (const p of ARQUIVOS) await assertFails(visitante().ref(p).delete());
  });
  it('abre a prévia pelo endereço de download do snapshot, mas não sem o token', async () => {
    const url = await admin().ref('gcc/c1/previews/cr1/previa.png').getDownloadURL();
    const comToken = await fetch(url);
    expect(comToken.status).toBe(200);
    expect(new Uint8Array(await comToken.arrayBuffer())).toEqual(BYTES);
    const semToken = await fetch(url.replace(/[?&]token=[^&]+/, ''));
    expect(semToken.status).not.toBe(200);
  });
});

describe('admin logado', () => {
  it('lê, lista, envia e apaga os arquivos do app', async () => {
    const s = admin();
    for (const p of ARQUIVOS) await assertSucceeds(s.ref(p).getMetadata());
    await assertSucceeds(s.ref('gcc/c1/materiais').listAll());
    await assertSucceeds(s.ref('gcc/c1/materiais/nova.mp4').put(BYTES, { contentType: 'video/mp4' }));
    await assertSucceeds(s.ref('gcc/c1/materiais/nova.mp4').delete());
    await assertSucceeds(s.ref('gcc/c1/previews/cr1/previa.png').delete());
  });
  it('prévia: só imagem ou vídeo', async () => {
    await assertSucceeds(admin().ref('gcc/c1/previews/cr2/p.jpg').put(BYTES, { contentType: 'image/jpeg' }));
    await assertFails(admin().ref('gcc/c1/previews/cr2/p.txt').put(BYTES, { contentType: 'text/plain' }));
  });
  it('fora de gcc/ nada é permitido, nem para o admin', async () => {
    await assertFails(admin().ref('outro-app/x.png').put(BYTES, { contentType: 'image/png' }));
  });
});
