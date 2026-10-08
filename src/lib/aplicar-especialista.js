// Aplicar as sugestões de um especialista (Frente 3). Puro: classifica cada ação (reescrever o texto do criativo, nova
// peça no Estúdio, virar tarefa, ou falta de dado com o campo a preencher), monta a instrução da reescrita, compara
// "Atual × Com a mudança", confere saúde (achadosSaude via motivoSaude) e colchete do modelo de gancho antes de deixar
// salvar, e guarda o que foi feito com cada ação. O especialista nunca muda nada sozinho: tudo passa pelo clique do
// operador (modules/aplicar-especialista.js). Nada é mudado no Meta nem no perfil do cliente.
import { motivoSaude } from './saude.js';
import { motivoGancho } from './ganchos.js';

const txt = (v) => String(v ?? '').trim();

/** Tipos de ação que a IA devolve (lista fechada no prompt de consultarEspecialista). */
export const TIPOS_ACAO = ['hook', 'copy', 'cta', 'roteiro', 'campanha', 'oferta', 'whatsapp', 'falta_dado', 'outro'];
const TEXTO = ['hook', 'copy', 'cta', 'roteiro'];
const TAREFA = ['campanha', 'oferta', 'whatsapp'];
export const PARTE_DO_TEXTO = { hook: 'o gancho (hook)', copy: 'o texto (copy)', cta: 'o CTA', roteiro: 'o roteiro (cenas)' };

/**
 * Campos que a ação "falta de dado" pode pedir, e onde preencher. onde.tipo: 'pergunta' (questionário do cliente, que
 * fica na aba Criativos), 'anuncio' ("Sobre como esse cliente anuncia", aba Campanhas), 'produto' (aba Produtos),
 * 'rota' (outra aba). O app nunca preenche: só abre o campo.
 */
export const CAMPOS_FALTA = {
  negocio: { rotulo: 'O que vende e para quem (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'negocio' } },
  usp: { rotulo: 'Diferencial do produto (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'usp' } },
  tomDeVoz: { rotulo: 'Tom de voz (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'tom' } },
  objecoes: { rotulo: 'Dúvidas e objeções dos clientes (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'objecoes' } },
  linguagemDor: { rotulo: 'Como o público fala do problema (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'linguagemDor' } },
  provasSociais: { rotulo: 'Provas sociais reais: depoimentos, avaliações, números (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'provas' } },
  publicoCompra: { rotulo: 'Quem mais compra hoje (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'publicoCompra' } },
  ofertaAtiva: { rotulo: 'Promoção ou oferta ativa (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'oferta' } },
  termosProibidos: { rotulo: 'O que não pode ser dito nos anúncios (perfil de marca)', onde: { tipo: 'pergunta', alvo: 'termosProibidos' } },
  destino: { rotulo: 'Destino de venda (Sobre como esse cliente anuncia)', onde: { tipo: 'anuncio', alvo: 'destino' } },
  ticketMedio: { rotulo: 'Ticket médio (Sobre como esse cliente anuncia)', onde: { tipo: 'anuncio', alvo: 'ticketMedio' } },
  margem: { rotulo: 'Margem (Sobre como esse cliente anuncia)', onde: { tipo: 'anuncio', alvo: 'margem' } },
  verbaMensal: { rotulo: 'Verba mensal (Sobre como esse cliente anuncia)', onde: { tipo: 'anuncio', alvo: 'verbaMensal' } },
  atendimento: { rotulo: 'Atendimento no WhatsApp (Sobre como esse cliente anuncia)', onde: { tipo: 'anuncio', alvo: 'atendimento' } },
  preco: { rotulo: 'Preço do produto (aba Produtos)', onde: { tipo: 'produto' } },
  resultados: { rotulo: 'Resultados das campanhas (aba Resultados)', onde: { tipo: 'rota', alvo: 'resultados' } },
};

// Sem "campo" na resposta (consulta antiga): palpite pelo texto. Ordem importa (o mais específico primeiro).
const PISTAS_CAMPO = [
  [/depoiment|avalia[cç]|prova social|provas?\b/i, 'provasSociais'], [/oferta|promo[cç]|desconto|cupom/i, 'ofertaAtiva'],
  [/obje[cç]/i, 'objecoes'], [/ticket/i, 'ticketMedio'], [/margem/i, 'margem'], [/verba|or[cç]amento/i, 'verbaMensal'],
  [/pre[cç]o/i, 'preco'], [/atendiment|tempo de resposta/i, 'atendimento'], [/\b(cpa|roas|ctr|resultado|convers[aã]o|vendas?)\b/i, 'resultados'],
  [/p[uú]blico|quem compra/i, 'publicoCompra'], [/diferencial|usp/i, 'usp'],
];
export function campoProvavel(texto) {
  const t = txt(texto);
  return (PISTAS_CAMPO.find(([re]) => re.test(t)) || [])[1] || null;
}

const RE_FALTA = /^(cadastr|preench|confirm|pergunt|levant|anot|registr|descubr|cole(t|ta))|falta(m)? (de )?dado|sem (esse )?dado/i;
/** Tipo da ação: o que a IA mandou (se for da lista); senão, um palpite pelo texto e pela área do especialista. */
export function tipoDaAcao(acao = {}, { alvoTipo = '', area = '' } = {}) {
  const dado = txt(acao.tipo).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  if (TIPOS_ACAO.includes(dado)) return dado;
  const t = txt(acao.acao);
  if (RE_FALTA.test(t)) return 'falta_dado';
  if (['criativo', 'peca'].includes(alvoTipo)) {
    if (/\b(cta|chamada|bot[aã]o)\b/i.test(t)) return 'cta';
    if (/gancho|hook|primeir[ao]s? (frase|segundos)|abertura/i.test(t)) return 'hook';
    if (/roteiro|cena|corte|ritmo/i.test(t)) return 'roteiro';
    if (/texto|copy|frase|legenda|benef[ií]cio|obje[cç]|palavra/i.test(t)) return 'copy';
  }
  if (/whats|conversa|atendiment/i.test(t)) return 'whatsapp';
  if (area === 'trafego' || /campanha|verba|or[cç]amento|p[uú]blico|conjunto|lance/i.test(t)) return 'campanha';
  if (area === 'oferta' || /oferta|pre[cç]o|garantia|frete|b[oô]nus/i.test(t)) return 'oferta';
  return 'outro';
}

/**
 * Como a ação pode ser aplicada: { tipo, modo, motivo, campo }.
 * modo: 'reescrever' (texto do criativo, nova versão) | 'peca' (texto novo + nova peça no Estúdio) | 'tarefa' | 'falta_dado' | null.
 */
export function classificarAcao(acao = {}, { alvoTipo = '', area = '', temCriativo = true } = {}) {
  const tipo = tipoDaAcao(acao, { alvoTipo, area });
  if (TEXTO.includes(tipo)) {
    if (alvoTipo === 'peca' && temCriativo) return { tipo, modo: 'peca', motivo: '' };
    if (alvoTipo === 'criativo' && temCriativo) return { tipo, modo: 'reescrever', motivo: '' };
    return { tipo, modo: null, motivo: temCriativo ? 'Muda o texto de um criativo: consulte o especialista sobre o criativo (ou a peça) para aplicar aqui.' : 'O criativo desta consulta foi excluído.' };
  }
  if (TAREFA.includes(tipo)) return { tipo, modo: 'tarefa', motivo: '' };
  if (tipo === 'falta_dado') {
    const campo = CAMPOS_FALTA[acao.campo] ? acao.campo : campoProvavel(acao.acao);
    return { tipo, modo: 'falta_dado', campo, motivo: campo ? '' : 'Falta um dado que o app não sabe onde fica: confira com o cliente.' };
  }
  return { tipo, modo: null, motivo: 'Ação de acompanhamento: não há o que mudar no app; faça você mesmo.' };
}

/** Instrução da reescrita: só o que a ação pede, o resto palavra por palavra. */
export function instrucaoDaAcao(acao = {}, tipo = 'copy') {
  return [
    `Aplique SÓ esta mudança sugerida pelo especialista: "${txt(acao.acao)}"${txt(acao.porque) ? ` (motivo: ${txt(acao.porque)})` : ''}.`,
    `Mude apenas ${PARTE_DO_TEXTO[tipo] || 'o trecho que a mudança pede'}; o resto do criativo fica exatamente igual, palavra por palavra.`,
    'Não invente dado, número, preço, prazo, garantia nem depoimento: se a mudança pedir um dado que não está no perfil, não use e diga isso na explicação.',
  ].join(' ');
}

const CAMPOS_TEXTO = ['hook', 'copy', 'cta'];
/**
 * "Atual × Com a mudança" e a conferência antes de salvar. r = resposta de refinarCriativo.
 * Devolve { antes, depois, campos (os que mudaram), bloqueio (motivo ou ''), explicacao }.
 */
export function propostaDeMudanca(criativo = {}, r = {}, cliente = {}) {
  const antes = Object.fromEntries(CAMPOS_TEXTO.map((k) => [k, txt(criativo[k])]));
  const depois = Object.fromEntries(CAMPOS_TEXTO.map((k) => [k, txt(r?.[k]) || antes[k]]));
  const campos = CAMPOS_TEXTO.filter((k) => depois[k] !== antes[k]);
  return { antes, depois, campos, bloqueio: motivoBloqueioTexto(depois, cliente, criativo.modeloGancho), explicacao: txt(r?.explicacao) };
}

/** Saúde (Meta) e colchete/modelo (*) do gancho: o motivo que impede salvar o texto, ou ''. */
export function motivoBloqueioTexto({ hook = '', copy = '', cta = '' } = {}, cliente = {}, modeloGancho = null) {
  const saude = motivoSaude(`${hook} ${copy} ${cta}`, cliente);
  if (saude) return `Não dá para salvar: ${saude}.`;
  const gancho = motivoGancho({ hook, copy, cta, modeloGancho }, cliente);
  if (gancho) return `Não dá para salvar: ${gancho}.`;
  return '';
}

/**
 * Patch da nova versão do criativo (o histórico guarda todas; a anterior continua lá). Igual à "Salvar como nova
 * versão" do detalhe do criativo: grava ângulo/framework/gatilho/formato vigentes, número = maior + 1.
 */
export function versaoNova(c = {}, patch = {}, nota = '') {
  const versoes = [...(c.versoes || [])];
  const angulo = patch.angulo ?? c.angulo, framework = patch.framework ?? c.framework, gatilho = patch.gatilho ?? c.gatilho, formato = patch.formato ?? c.formato;
  versoes.push({ n: Math.max(0, ...versoes.map((v) => v.n)) + 1, hook: patch.hook, copy: patch.copy, cta: patch.cta, angulo, framework, gatilho, formato, nota, quando: new Date().toISOString() });
  return { ...patch, versoes };
}

export const ONDE_TAREFA = {
  campanha: 'No Gerenciador de Anúncios do Meta, na campanha/conjunto citado. O app não mexe no Meta.',
  oferta: 'Combinar com o cliente. Se ele aprovar, atualize a oferta no perfil de marca (pergunta 15) ou o produto; o app não muda sozinho.',
  whatsapp: 'No WhatsApp Business do cliente (mensagem de saudação, respostas rápidas, roteiro do atendimento).',
};
const AREA_TAREFA = { campanha: 'campanha', oferta: 'oferta', whatsapp: 'whatsapp' };
/** Tarefa na área de campanhas (mesmo formato das tarefas aceitas em "Analisar e recomendar"). */
export function tarefaDaAcao(acao = {}, tipo, { clienteId, analiseId = null, especialista = '', alvo = null } = {}) {
  return {
    clienteId, analiseId, origem: 'especialista', tipo: 'especialista', area: AREA_TAREFA[tipo] || 'campanha', status: 'aberta',
    titulo: txt(acao.acao),
    texto: [txt(acao.porque) && `Por quê: ${txt(acao.porque)}`, `Onde fazer: ${ONDE_TAREFA[tipo] || ONDE_TAREFA.campanha}`, especialista && `Sugestão de: ${especialista}${alvo?.nome ? ` (sobre ${alvo.nome})` : ''}`].filter(Boolean).join('\n'),
  };
}

export const STATUS_APLICACAO = { aceita: 'aplicada', descartada: 'descartada', bloqueada: 'bloqueada (saúde/colchete)', tarefa: 'virou tarefa', peca: 'nova peça' };
/** "aplicada: 2, descartada: 1" a partir de consulta.aplicacoes ({ [indice]: { status } }). */
export function resumoAplicacoes(consulta = {}) {
  const cont = {};
  for (const a of Object.values(consulta.aplicacoes || {})) if (a?.status) cont[a.status] = (cont[a.status] || 0) + 1;
  return Object.entries(STATUS_APLICACAO).filter(([k]) => cont[k]).map(([k, r]) => `${r}: ${cont[k]}`).join(', ');
}
