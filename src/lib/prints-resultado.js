// "Enviar prints de resultado" (Frente 4). Puro, sem banco nem tela:
//  - normalizarLeituraPrints: o que a IA leu em cada print vira linhas de números para REVISÃO (nunca resultado direto);
//    print de conversa (WhatsApp) ou com dado pessoal não tem nada extraído; nome/telefone/e-mail nunca passam;
//  - revisão: cada valor confirmado ou editado pelo operador; só as linhas confirmadas viram resultado;
//  - vínculo com campanha, criativo e produto pelo nome, quando dá para identificar;
//  - print repetido (mesmo arquivo) é ignorado; períodos diferentes entre os prints geram aviso.
import { numeroBR } from './anuncio.js';
import { textoPeriodo, mesmoPeriodo } from './destinos.js';

const txt = (v) => String(v ?? '').trim();
const lista = (v) => (Array.isArray(v) ? v : []);
const normTxt = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Campos numéricos de uma linha do print, na ordem da tabela de revisão. */
export const CAMPOS_PRINT = [
  ['gasto', 'Valor usado (R$)'], ['impressoes', 'Impressões'], ['alcance', 'Alcance'], ['ctr', 'CTR (%)'], ['cpm', 'CPM (R$)'], ['cliques', 'Cliques'],
  ['conversas', 'Conversas iniciadas'], ['custoConversa', 'Custo por conversa (R$)'], ['compras', 'Compras'], ['custoCompra', 'Custo por compra (R$)'],
  ['faturamento', 'Valor de conversão de compras (R$)'], ['roas', 'ROAS'],
];
export const TIPOS_PRINT = { gerenciador: 'Gerenciador de Anúncios', conversa: 'Conversa (WhatsApp/chat)', outro: 'Outro', ilegivel: 'Ilegível' };
export const AVISO_PESSOAL = 'Print com dado pessoal (conversa, nome ou telefone de cliente): fica só como material interno e nada é extraído dele.';

// Telefone, e-mail e @usuário: nunca entram em nome de campanha, conjunto ou anúncio.
const RE_PESSOAL = [/(?:\+?\d{2}\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}\b/g,/[\w.+-]+@[\w-]+\.[\w.]+/g, /@[\w.]{3,}/g];
export const limparPessoal = (s) => RE_PESSOAL.reduce((t, re) => t.replace(re, '[removido]'), txt(s)).slice(0, 160);
const temPessoal = (s) => RE_PESSOAL.some((re) => { re.lastIndex = 0; return re.test(txt(s)); });

const dataISO = (v) => { const s = txt(v); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const normDestino = (v) => { const s = normTxt(v); return /whats|mensag|convers/.test(s) ? 'whatsapp' : /site|compra|web/.test(s) ? 'site' : ''; };
/** Número de um print ("R$ 1.234,56", "2,5%", "1,2 mil"); null se não houver. */
export function numeroDoPrint(v) {
  if (v == null || v === '' || v === '—' || v === '-') return null;
  const s = txt(v).toLowerCase();
  const mil = /\bmil\b/.test(s) ? 1000 : /\bmi\b|milh/.test(s) ? 1e6 : 1;
  const x = numeroBR(s.replace(/mil|milh[õo]es|mi\b/g, ''));
  return x == null ? null : Math.round(x * mil * 100) / 100;
}

/**
 * Leitura da IA -> uma entrada por print enviado (na ordem). Nunca confia na IA para dado pessoal: print de conversa
 * ou marcado com dado pessoal fica sem linhas; nome com telefone/e-mail tem o trecho removido.
 */
export function normalizarLeituraPrints(d = {}, total = 0) {
  const lidas = lista(d.imagens || d.prints);
  return Array.from({ length: total }, (_, i) => {
    const x = lidas.find((l) => Number(l?.numero) === i + 1);
    if (!x) return { numero: i + 1, tipo: 'ilegivel', periodo: null, linhas: [], dadosPessoais: false, observacao: 'A IA não leu este print. Preencha à mão, se quiser.' };
    const tipo = TIPOS_PRINT[x.tipo] ? x.tipo : /convers|whats|chat/.test(normTxt(x.tipo)) ? 'conversa' : 'outro';
    const pessoal = tipo === 'conversa' || x.dadosPessoais === true || x.dadosPessoais === 'true';
    const ini = dataISO(x.periodo?.inicio), fim = dataISO(x.periodo?.fim);
    const periodo = ini || fim ? { inicio: ini || fim, fim: fim || ini } : null;
    const linhas = pessoal ? [] : lista(x.linhas).map((l) => {
      const linha = { nivel: ['campanha', 'conjunto', 'anuncio'].includes(normTxt(l?.nivel)) ? normTxt(l.nivel) : 'campanha', campanha: limparPessoal(l?.campanha), conjunto: limparPessoal(l?.conjunto), anuncio: limparPessoal(l?.anuncio) };
      for (const [k] of CAMPOS_PRINT) linha[k] = numeroDoPrint(l?.[k]);
      linha.destino = normDestino(l?.destino) || (linha.conversas != null && linha.compras == null ? 'whatsapp' : linha.compras != null || linha.faturamento != null ? 'site' : '');
      return linha;
    }).filter((l) => CAMPOS_PRINT.some(([k]) => l[k] != null)).slice(0, 30);
    const removido = !pessoal && lista(x.linhas).some((l) => ['campanha', 'conjunto', 'anuncio'].some((k) => temPessoal(l?.[k])));
    return { numero: i + 1, tipo: pessoal && tipo !== 'conversa' ? tipo : tipo, periodo, linhas, dadosPessoais: pessoal,
      observacao: pessoal ? AVISO_PESSOAL : removido ? 'Um nome tinha telefone/e-mail/@: o trecho foi removido.' : txt(x.observacao).slice(0, 300) };
  });
}

/** Períodos diferentes entre os prints do mesmo envio (ou entre WhatsApp e site) -> texto do aviso; '' se batem. */
export function avisoPeriodos(leituras = []) {
  const ps = leituras.filter((l) => l.periodo && l.linhas.length);
  if (ps.length < 2) return '';
  const base = ps[0].periodo;
  const dif = ps.filter((l) => !mesmoPeriodo(l.periodo, base));
  if (!dif.length) return '';
  return `Os prints são de períodos diferentes: ${ps.map((l) => `print ${l.numero} (${textoPeriodo(l.periodo)})`).join(', ')}. A comparação WhatsApp x Site só vale no mesmo período.`;
}

/** Print já enviado antes (mesmo arquivo)? Devolve o registro existente ou null. */
export const printDuplicado = (hash, prints = []) => (hash ? prints.find((p) => p.hash === hash) || null : null);

/**
 * Liga a linha a campanha/criativo/produto do app pelo nome (contém ou é igual, sem acento/maiúscula). Só quando há
 * UM candidato: dois candidatos = não liga (o operador escolhe na revisão).
 */
export function vincularLinha(linha = {}, { campanhas = [], criativos = [], produtos = [] } = {}) {
  const achar = (nome, itens) => {
    const s = normTxt(nome); if (!s) return null;
    const iguais = itens.filter((x) => normTxt(x.nome) === s); if (iguais.length === 1) return iguais[0];
    const contem = itens.filter((x) => normTxt(x.nome).length >= 4 && (s.includes(normTxt(x.nome)) || normTxt(x.nome).includes(s)));
    return contem.length === 1 ? contem[0] : null;
  };
  const camp = achar(linha.campanha, campanhas);
  const cr = achar(linha.anuncio, criativos) || achar(linha.conjunto, criativos);
  const nomes = [linha.anuncio, linha.conjunto, linha.campanha].join(' ');
  const prod = (cr?.produtoId && produtos.find((p) => p.id === cr.produtoId)) || produtos.filter((p) => normTxt(p.nome).length >= 4 && normTxt(nomes).includes(normTxt(p.nome))).sort((a, b) => b.nome.length - a.nome.length)[0] || null;
  return { campanhaId: camp?.id || null, criativoId: cr?.id || null, produtoId: prod?.id || null };
}

/**
 * Linha CONFIRMADA na revisão -> documento de gcc_resultados (mesmos campos do registro manual, mais os do print).
 * `linha` já vem com os valores que o operador conferiu/editou.
 */
export function linhaParaResultado(linha = {}, { clienteId, periodo = null, printId = null, criativos = [], campanhas = [], oferta = null } = {}) {
  const cr = criativos.find((c) => c.id === linha.criativoId) || null;
  const gasto = linha.gasto ?? null;
  const destino = linha.destino === 'whatsapp' ? 'whatsapp' : 'site';
  const cpa = linha.custoCompra ?? (gasto && linha.compras ? Math.round((gasto / linha.compras) * 100) / 100 : null);
  return {
    clienteId, origem: 'print', printId, destino, criativoId: cr?.id || null, criativoNome: cr?.nome || '', campanhaId: linha.campanhaId || null,
    campanhaNome: campanhas.find((c) => c.id === linha.campanhaId)?.nome || linha.campanha || '', produtoId: linha.produtoId || cr?.produtoId || null,
    nomeNoPrint: [linha.campanha, linha.conjunto, linha.anuncio].filter(Boolean).join(' › '),
    angulo: cr?.angulo || '', framework: cr?.framework || '', formato: cr?.formato || '', gatilho: cr?.gatilho || '',
    gasto, ctr: linha.ctr ?? null, cpa: destino === 'site' ? cpa : null, roas: linha.roas ?? (gasto && linha.faturamento != null ? Math.round((linha.faturamento / gasto) * 100) / 100 : null),
    impressoes: linha.impressoes ?? null, alcance: linha.alcance ?? null, cpm: linha.cpm ?? null, cliques: linha.cliques ?? null,
    conversas: linha.conversas ?? null, compras: linha.compras ?? null, faturamento: linha.faturamento ?? null,
    // Venda fechada na conversa não aparece no print do Meta: o operador anota na revisão (ou depois, em Resultados).
    vendasConversa: destino === 'whatsapp' ? linha.vendasConversa ?? null : null, faturamentoConversa: destino === 'whatsapp' ? linha.faturamentoConversa ?? null : null,
    periodoInicio: periodo?.inicio || null, periodoFim: periodo?.fim || null, data: periodo?.fim || new Date().toISOString().slice(0, 10), oferta,
  };
}

/**
 * Itens {"numero": N, ...} que ficaram FORA da lista "imagens" (a IA fechou o colchete cedo): procura cada um no texto
 * bruto e acrescenta os que faltam. Nunca troca um item que já veio na lista.
 */
export function juntarItensSoltos(dados = {}, texto = '') {
  const lista = Array.isArray(dados.imagens) ? [...dados.imagens] : [];
  const t = String(texto || '');
  const re = /\{\s*"numero"\s*:/g;
  let m;
  while ((m = re.exec(t))) {
    let prof = 0, dentro = false, fim = -1;
    for (let k = m.index; k < t.length; k++) {
      const c = t[k];
      if (dentro) { if (c === '\\') k++; else if (c === '"') dentro = false; continue; }
      if (c === '"') dentro = true; else if (c === '{') prof++; else if (c === '}' && --prof === 0) { fim = k; break; }
    }
    if (fim < 0) continue;
    try {
      const item = JSON.parse(t.slice(m.index, fim + 1));
      if (Number.isFinite(Number(item?.numero)) && !lista.some((x) => Number(x?.numero) === Number(item.numero))) lista.push(item);
    } catch { /* trecho que não é JSON válido: ignora */ }
  }
  return { ...dados, imagens: lista };
}
