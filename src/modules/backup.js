// Backup/exportação em JSON: o app inteiro ou um cliente (com tudo o que está ligado a ele).
// Não inclui os arquivos do Storage (só os links) nem os links de aprovação (são segredos de acesso).
import { db, COL } from '../core/storage.js';
import { baixarTexto, toast } from '../core/ui.js';
import { slug } from '../lib/csv.js';

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
  return total;
}
