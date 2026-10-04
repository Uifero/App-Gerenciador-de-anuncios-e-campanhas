// Banco do modo demo (localStorage em memória) com dois clientes completos, para os testes de isolamento e de
// restauração de backup. Cada cliente tem: produtos com preço e fotos no campo antigo (para migrar), Materiais com
// código e "Usar em", provas (print com cópia borrada e texto), perfil de marca e respostas do questionário,
// criativos (um arquivado com resultado), resultados, campanha, site com plataforma/tema/versão e links de aprovação.
import { vi } from 'vitest';

/** Liga o modo demo com um localStorage em memória. Chamar ANTES de importar core/storage.js. */
export function prepararDemo() {
  const mapa = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k), clear: () => mapa.clear(), key: (i) => [...mapa.keys()][i] ?? null, get length() { return mapa.size; },
  });
  vi.stubEnv('VITE_DEMO_MODE', '1');
  return mapa;
}

/** Apaga todas as coleções do banco demo. */
export const limparBanco = (mapa) => { for (const k of [...mapa.keys()]) if (k.startsWith('gccdb_')) mapa.delete(k); };

const DIA = 864e5;

/** Cria um cliente completo. `p` = prefixo dos ids (ex.: 'A'), para achar vazamentos pelo texto. */
export async function semearCliente(db, COL, p, { nicho = 'moda fitness', pais = 'BR' } = {}) {
  const cid = `cli${p}`;
  await db.definir(COL.clientes, cid, {
    nome: `Loja ${p}`, nicho, pais, contadorFotos: 0,
    marca: { negocio: `vende ${p}`, usp: `diferencial ${p}`, tomDeVoz: 'acolhedor', objecoes: `objeção ${p}` },
    respostasCliente: { texto: `respostas coladas ${p}`, em: '2026-09-30T10:00:00Z', porPergunta: { negocio: `vende ${p}`, usp: `diferencial ${p}` } },
    criadoEm: '2026-09-01T10:00:00Z',
  });
  const prod1 = `prod${p}1`, prod2 = `prod${p}2`;
  await db.definir(COL.produtos, prod1, { clienteId: cid, nome: `Camiseta ${p}`, preco: 99.9, precoPromocional: 79.9,
    fotos: [{ url: `https://arquivos/${p}/camiseta-1.jpg`, path: `gcc/${cid}/produtos/camiseta-1.jpg` }, { url: `https://arquivos/${p}/camiseta-2.jpg`, path: `gcc/${cid}/produtos/camiseta-2.jpg` }],
    criadoEm: '2026-09-02T10:00:00Z' });
  await db.definir(COL.produtos, prod2, { clienteId: cid, nome: `Legging ${p}`, preco: 149, fotos: [], criadoEm: '2026-09-02T11:00:00Z' });

  const mat = (id, extra) => db.definir(COL.materiais, id, { clienteId: cid, url: `https://arquivos/${p}/${id}.jpg`, path: `gcc/${cid}/materiais/${id}.jpg`, nome: `${id}.jpg`, criadoEm: '2026-09-03T10:00:00Z', ...extra });
  await mat(`mat${p}banner`, { origem: 'envio', tipo: 'image/jpeg', usos: { banner: 'manual', produtos: [] } });
  await mat(`mat${p}foto`, { origem: 'envio', tipo: 'image/jpeg', usos: { produtos: [{ id: prod2, ordem: 1, principal: true, por: 'manual' }] } });
  await mat(`mat${p}print`, { origem: 'prova_social', tipo: 'image/jpeg', texto: `depoimento ${p}`, borrada: { url: `https://arquivos/${p}/print-b.jpg`, path: `gcc/${cid}/materiais/print-b.jpg` }, usos: { clientes: 'manual', produtos: [] } });
  await mat(`mat${p}provatexto`, { origem: 'prova_texto', texto: `"Amei" — cliente de ${p}`, url: null, path: null });
  await mat(`mat${p}logo`, { origem: 'logo', tipo: 'image/png' });

  const cr = (id, extra) => db.definir(COL.criativos, id, { clienteId: cid, nome: `Criativo ${id}`, hook: `hook ${p}`, copy: `copy ${p}`, status: 'rascunho', produtoId: prod1,
    angulo: 'dor', framework: 'AIDA', formato: 'imagem', arquivoPath: `gcc/${cid}/criativos/${id}.png`, criadoEm: '2026-09-04T10:00:00Z', ...extra });
  await cr(`cr${p}1`, { status: 'pronto_aprovacao', aprovacaoToken: `tok${p}cr`, previaPath: `gcc/${cid}/previews/cr${p}1/p.jpg` });
  await cr(`cr${p}2`);
  await cr(`cr${p}arq`, { arquivado: true, arquivadoEm: '2026-09-20T10:00:00Z' });
  await cr(`cr${p}sem`); // sem resultado: na exclusão em massa sai de vez

  const res = (id, criativoId, roas) => db.definir(COL.resultados, id, { clienteId: cid, criativoId, angulo: 'dor', framework: 'AIDA', formato: 'imagem', gasto: 100, roas, cpa: 20, oferta: `oferta ${p}`, criadoEm: '2026-09-10T10:00:00Z' });
  await res(`res${p}1`, `cr${p}1`, 3);
  await res(`res${p}2`, `cr${p}2`, 2);
  await res(`res${p}3`, `cr${p}arq`, 4);
  await db.definir(COL.campanhas, `camp${p}`, { clienteId: cid, nome: `Campanha ${p}`, criativosIds: [`cr${p}1`, `cr${p}2`], criadoEm: '2026-09-11T10:00:00Z' });

  await db.definir(COL.sites, `site${p}`, { clienteId: cid, modo: 'pacote_plataforma', plataforma: p === 'A' ? 'nuvemshop' : 'shopify', tema: p === 'A' ? 'Amazonas' : 'Dawn', versaoManual: 3,
    layout: { imagens: { banner: { materialId: `mat${p}banner`, url: `https://arquivos/${p}/mat${p}banner.jpg` } } },
    conteudo: { depoimentos: [{ materialId: `mat${p}print`, texto: `depoimento ${p}` }] }, criadoEm: '2026-09-12T10:00:00Z' });

  const agora = Date.now();
  await db.definir(COL.aprovacoes, `tok${p}cr`, { clienteId: cid, clienteNome: `Loja ${p}`, expiraMs: agora + 30 * DIA, itensIds: [`cr${p}1`], itens: [{ id: `cr${p}1`, previaUrl: `https://arquivos/${p}/previa.jpg` }], criadoEm: '2026-09-13T10:00:00Z' });
  await db.definir(COL.aprovacoes, `tok${p}site1`, { tipo: 'site', clienteId: cid, clienteNome: `Loja ${p}`, itensIds: ['site'], expiraMs: agora + 30 * DIA, versao: 1, plataforma: 'nuvemshop', html: `<img src="https://arquivos/${p}/mat${p}banner.jpg">`, substituidoEm: '2026-09-15T10:00:00Z', substituidoPor: `tok${p}site2`, criadoEm: '2026-09-14T10:00:00Z' });
  await db.definir(COL.aprovacoes, `tok${p}site2`, { tipo: 'site', clienteId: cid, clienteNome: `Loja ${p}`, itensIds: ['site'], expiraMs: agora + 30 * DIA, versao: 2, plataforma: 'nuvemshop', html: `<img src="https://arquivos/${p}/mat${p}banner.jpg">`, resposta: { status: 'aprovado', comentario: '', em: '2026-09-16T10:00:00Z' }, criadoEm: '2026-09-15T10:00:00Z' });
  await db.definir(COL.respostas, `tok${p}site2_site`, { token: `tok${p}site2`, clienteId: cid, criativoId: 'site', status: 'aprovado', comentario: '', em: '2026-09-16T10:00:00Z' });
  await db.definir(COL.respostas, `tok${p}cr_cr${p}1`, { token: `tok${p}cr`, clienteId: cid, criativoId: `cr${p}1`, status: 'ajuste', comentario: `ajuste ${p}`, em: '2026-09-16T11:00:00Z' });

  await db.definir(COL.hooks, `hook${p}`, { clienteId: cid, texto: `hook salvo ${p}` });
  await db.definir(COL.referencias, `ref${p}`, { clienteId: cid, url: `https://ref/${p}` });
  await db.definir(COL.usoApi, `uso${p}`, { clienteId: cid, tarefa: 'copy', custo: 0.01 });
  return cid;
}

/** Todos os documentos de todas as coleções, por coleção (para comparar antes/depois). */
export async function fotografia(db, COL) {
  const out = {};
  for (const col of Object.values(COL)) out[col] = await db.listar(col);
  return out;
}
