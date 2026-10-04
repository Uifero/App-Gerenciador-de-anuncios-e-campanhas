// Gravar os prints de prova social revisados (pergunta 10 e passo 2 de "Montar site"). A ordem protege o dado:
//  1) cada print marcado "guardar" vai para Materiais por salvarMaterial (mesmo Storage, mesmas regras de sempre);
//  2) só depois o texto dele entra no campo "provas sociais" — print que falhou ao guardar NÃO gera texto;
//  3) texto que já existe (o mesmo print lido de novo) não entra outra vez, e a impressão digital de cada print
//     lido fica em cliente.provasHashes para reconhecer o reenvio.
// Nada aqui apaga material nem texto: só acrescenta.
import { db, COL } from '../core/storage.js';
import { salvarMaterial } from './materiais.js';
import { ORIGEM_PROVA, ETIQUETA_PROVA, linhaProva, acrescentarProvas } from './prova-social.js';

/**
 * itens: [{ numero, resumo, acrescentarTexto, guardar, blob, meta, hash, material }]
 *  - meta: campos extras do material (descricao, citacao, fonteProva, nota...);
 *  - material: já guardado numa tentativa anterior (não envia de novo).
 * Grava `material` em cada item guardado agora. Devolve { salvos: [{ numero, material }], acrescentadas, falhas: [{ numero, motivo }] }.
 */
export async function guardarProvasRevisadas(cliente, itens = [], { em = new Date().toISOString(), salvar = salvarMaterial } = {}) {
  const salvos = [], falhas = [], linhas = [], hashes = [];
  for (const it of itens) {
    if (it.guardar && !it.material) {
      try {
        if (!it.blob) throw new Error('não consegui gerar a imagem com as tarjas.');
        const material = await salvar(cliente, it.blob, ORIGEM_PROVA, { ...(it.meta || {}), etiquetas: [ETIQUETA_PROVA], ...(it.hash ? { hashOriginal: it.hash } : {}) });
        if (!material?.id || !material?.url) throw new Error('o arquivo não ficou registrado em Materiais.');
        it.material = material; salvos.push({ numero: it.numero, material });
      } catch (e) { falhas.push({ numero: it.numero, motivo: e?.message || String(e) }); continue; } // sem imagem guardada, sem texto
    }
    if (it.resumo && it.acrescentarTexto !== false) linhas.push(linhaProva(it.resumo, em));
    if (it.hash) hashes.push(it.hash);
  }
  const { texto, acrescentadas } = acrescentarProvas(cliente.marca?.provasSociais, linhas);
  const antes = cliente.provasHashes || [];
  const provasHashes = [...new Set([...antes, ...hashes])];
  if (acrescentadas || provasHashes.length !== antes.length) {
    const patch = { provasHashes, ...(acrescentadas ? { marca: { ...(cliente.marca || {}), provasSociais: texto } } : {}) };
    await db.atualizar(COL.clientes, cliente.id, patch);
    Object.assign(cliente, patch);
  }
  return { salvos, acrescentadas, falhas };
}

/** Mensagem (fica na tela) quando algum print não foi guardado. */
export function mensagemFalhas({ salvos = [], acrescentadas = 0, falhas = [] }) {
  if (!falhas.length) return '';
  return [`${falhas.length} print(s) NÃO foram guardados em Materiais, e o texto deles não entrou nas provas sociais:`,
    ...falhas.map((f) => `• Print ${f.numero}: ${f.motivo}`),
    salvos.length || acrescentadas ? `O resto foi gravado (${salvos.length} print(s) e ${acrescentadas} linha(s) de texto).` : 'Nada foi gravado.',
    'Clique de novo em "Acrescentar ao perfil e guardar os prints" para tentar só os que faltaram.'].join('\n');
}
