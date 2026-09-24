// Backup/exportação em JSON: o app inteiro ou um cliente (com tudo o que está ligado a ele).
// Não inclui os arquivos do Storage (só os links) nem os links de aprovação (são segredos de acesso).
import { db, COL } from '../core/storage.js';
import { baixarTexto, toast } from '../core/ui.js';
import { slug } from '../lib/csv.js';
import { registrarBackup } from './configuracoes.js';

/** Monta o objeto de backup. `cliente` = exporta só esse cliente; sem ele, exporta tudo. */
export async function montarBackup(cliente = null) {
  const f = cliente ? { clienteId: cliente.id } : undefined;
  const ler = (col) => db.listar(col, f);
  const [criativos, hooks, referencias, campanhas, resultados, produtos, sites, usoApi, respostas] = await Promise.all([
    ler(COL.criativos), ler(COL.hooks), ler(COL.referencias), ler(COL.campanhas), ler(COL.resultados), ler(COL.produtos), ler(COL.sites), ler(COL.usoApi), ler(COL.respostas),
  ]);
  const colecoes = {
    [COL.clientes]: cliente ? [cliente] : await db.listar(COL.clientes),
    // O token do link de aprovação é um segredo de acesso (o criativo guarda uma cópia): fica de fora do arquivo.
    [COL.criativos]: criativos.map(({ aprovacaoToken, ...resto }) => resto), [COL.hooks]: hooks, [COL.referencias]: referencias, [COL.campanhas]: campanhas,
    [COL.resultados]: resultados, [COL.produtos]: produtos, [COL.sites]: sites, [COL.usoApi]: usoApi,
    // O token do link também está na resposta e no id dela ("<token>_<criativo>"): ambos ficam de fora do arquivo.
    [COL.respostas]: respostas.map(({ token, id, ...resto }) => resto),
  };
  if (!cliente) { colecoes[COL.playbooks] = await db.listar(COL.playbooks); colecoes[COL.config] = await db.listar(COL.config); }
  const contagens = Object.fromEntries(Object.entries(colecoes).map(([k, v]) => [k, v.length]));
  return {
    app: 'gerenciador-criativos-campanhas', versao: 1, exportadoEm: new Date().toISOString(),
    escopo: cliente ? 'cliente' : 'app', cliente: cliente ? { id: cliente.id, nome: cliente.nome } : null, contagens, colecoes,
  };
}

/** Gera e baixa o arquivo. Retorna o total de documentos exportados. */
export async function exportarDados(cliente = null) {
  const dados = await montarBackup(cliente);
  const total = Object.values(dados.contagens).reduce((a, b) => a + b, 0);
  const hoje = new Date().toISOString().slice(0, 10);
  baixarTexto(cliente ? `gcc-cliente-${slug(cliente.nome) || cliente.id}-${hoje}.json` : `gcc-backup-completo-${hoje}.json`, JSON.stringify(dados, null, 2), 'application/json;charset=utf-8');
  toast(`Exportado: ${total} documento(s) em ${Object.keys(dados.colecoes).length} coleções.`);
  // Só o backup de TODOS os clientes conta para o lembrete (o de um cliente é parcial). Falhar aqui não desfaz o download.
  if (!cliente) await registrarBackup().catch((e) => console.warn('[backup] não consegui guardar a data do backup:', e));
  return total;
}

/**
 * Lembrete do Início. Devolve { dias (inteiros desde o último backup completo, ou null = nunca), atrasado, texto }.
 * Atrasado = nunca fez backup, ou já passou do prazo (`limiteDias`, Configurações; padrão 14).
 */
export function lembreteBackup(ultimoBackupEm, limiteDias = 14, agora = Date.now()) {
  const t = ultimoBackupEm ? new Date(ultimoBackupEm).getTime() : NaN;
  if (!Number.isFinite(t)) return { dias: null, atrasado: true, texto: 'Último backup: nunca. Exportar agora?' };
  const dias = Math.max(0, Math.floor((agora - t) / 864e5));
  const quando = dias === 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  return { dias, atrasado: dias > (Number(limiteDias) || 14), texto: dias > (Number(limiteDias) || 14) ? `Último backup: ${quando}. Exportar agora?` : `Último backup completo: ${quando}` };
}

// ---------------- importação / restauração ----------------

/** Lê e valida um arquivo escolhido pelo usuário. Lança um erro com mensagem clara se não for um backup válido deste app. */
export async function lerArquivoBackup(file) {
  let texto;
  try { texto = await file.text(); } catch { throw new Error('Não consegui ler o arquivo.'); }
  let dados;
  try { dados = JSON.parse(texto); } catch { throw new Error('Arquivo inválido: não é um JSON válido.'); }
  if (dados?.app !== 'gerenciador-criativos-campanhas' || !dados.colecoes) throw new Error('Este arquivo não parece ser um backup deste app.');
  if (dados.versao !== 1) throw new Error(`Versão do backup (${dados.versao}) não é compatível com este app.`);
  return dados;
}

/** [coleção, quantos documentos seriam gravados] — para mostrar antes de confirmar. Respostas de aprovação não
 * entram: o backup não guarda o token/id delas (por segurança), então não dá para restaurá-las corretamente. */
export function resumoRestauracao(dados) {
  return Object.entries(dados.colecoes).filter(([col]) => col !== COL.respostas).map(([col, itens]) => [col, (itens || []).length]).filter(([, n]) => n > 0);
}

/**
 * Restaura um backup: grava cada documento de volta na mesma coleção e com o mesmo id, por CIMA de qualquer
 * documento existente com esse id (upsert — é uma restauração, não uma mesclagem). Mantém `criadoEm`/`atualizadoEm`
 * originais (grava com `db.definir`, que não mexe em datas). Devolve o total de documentos restaurados.
 */
export async function restaurarBackup(dados) {
  let total = 0;
  for (const [col, itens] of Object.entries(dados.colecoes)) {
    if (col === COL.respostas) continue; // sem id/token no arquivo: não é possível restaurar com segurança
    for (const { id, ...doc } of itens || []) {
      if (!id) continue;
      await db.definir(col, id, doc);
      total++;
    }
  }
  return total;
}
