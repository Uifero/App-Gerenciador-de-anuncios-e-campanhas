// "Dados insuficientes para decidir" (Frente 3): antes de chamar um anúncio de vencedor ou perdedor, o app confere se
// há dado bastante, como faz um gestor experiente. Puro e sem IA: conta dias, gasto e vendas dos resultados registrados
// e compara com o custo por venda alvo do cliente (ticket × margem, lib/anuncio.js limitesDoCliente; sem margem, o CPA
// médio do histórico). O resultado vai no pedido da IA ("LEITURA DOS DADOS") e aparece na tela acima da análise;
// a IA não passa por cima dele. Os números daqui são regras de manejo, não médias de mercado.
import { comoAnunciaDe, limitesDoCliente } from './anuncio.js';
import { metricasResultado, faixa, textoPeriodo } from './destinos.js';

export const REGRAS_MINIMAS = {
  dias: 7,              // uma semana inteira (dias da semana mudam o resultado)
  vendasVencedor: 10,   // vendas no período para chamar de vencedor
  multiploPerdedor: 2,  // gasto sem venda acima de 2x o custo por venda alvo = perdedor
  diasAprendizado: 3,   // nos primeiros dias não se mexe
};
const DIA = 864e5;
const r2 = (n) => Math.round(n * 100) / 100;
const brl = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

/** Custo por venda alvo: { valor, fonte } (empate pelo ticket e margem; senão o CPA médio do histórico) ou null. */
export function alvoCustoVenda(cliente = {}) {
  const l = limitesDoCliente(comoAnunciaDe(cliente));
  if (l.ok) return { valor: l.custoVendaEmpate, fonte: 'ticket × margem (empate)' };
  const cpa = Number(String(cliente.historico?.cpaMedio ?? '').replace(',', '.'));
  return cpa > 0 ? { valor: cpa, fonte: 'CPA médio do histórico' } : null;
}

/**
 * Leitura dos dados registrados (todos os destinos ou só `destino`). Devolve
 * { nivel: 'sem_dados'|'insuficiente'|'perdedor'|'suficiente', suficiente, dias, gasto, vendas, conversas, alvo,
 *   faltam: [texto], aguardar: texto, resumo: texto }.
 * "perdedor" já dá para decidir (gastou o bastante sem vender); "suficiente" = semana inteira e vendas para julgar.
 */
export function leituraDosDados({ resultados = [], cliente = {}, destino = null } = {}) {
  const rs = resultados.filter((r) => !destino || metricasResultado(r).destino === destino);
  const alvo = alvoCustoVenda(cliente);
  if (!rs.length) {
    return { nivel: 'sem_dados', suficiente: false, dias: 0, gasto: 0, vendas: 0, conversas: 0, alvo, faltam: ['nenhum resultado registrado'],
      aguardar: 'Rode a campanha pelo menos 7 dias e registre os resultados (gasto, conversas e vendas) na aba Resultados.', resumo: 'Sem resultados registrados.' };
  }
  let gasto = 0, vendas = 0, conversas = 0, semVenda = 0;
  for (const r of rs) {
    const m = metricasResultado(r);
    gasto += m.gasto || 0; conversas += m.conversas || 0;
    if (m.vendas != null) vendas += m.vendas; else semVenda++;
  }
  const f = faixa(rs);
  const dias = f ? Math.round((new Date(f.fim) - new Date(f.inicio)) / DIA) + 1 : 0;
  const R = REGRAS_MINIMAS, faltam = [];
  if (dias < R.dias) faltam.push(`${R.dias - dias} dia(s) a mais (tem ${dias} de ${R.dias})`);
  if (vendas < R.vendasVencedor) faltam.push(`${Math.ceil(R.vendasVencedor - vendas)} venda(s) a mais (tem ${r2(vendas)} de ${R.vendasVencedor})`);
  const limitePerdedor = alvo ? alvo.valor * R.multiploPerdedor : null;
  const perdedor = Boolean(limitePerdedor && vendas === 0 && semVenda < rs.length && gasto >= limitePerdedor);
  const nivel = perdedor ? 'perdedor' : faltam.length ? 'insuficiente' : 'suficiente';
  const aguardar = nivel === 'suficiente' || perdedor ? '' : [
    faltam.length && `Espere ${faltam.join(' e ')}`,
    limitePerdedor && vendas === 0 && `ou ${brl(limitePerdedor)} de gasto sem venda (2x o custo por venda alvo de ${brl(alvo.valor)}) para cortar com segurança`,
    !alvo && 'Preencha o ticket médio e a margem em "Sobre como esse cliente anuncia" para o app saber o custo por venda alvo',
    semVenda && `registre as vendas de ${semVenda} resultado(s) que estão sem venda anotada`,
  ].filter(Boolean).join('; ') + '.';
  const periodo = textoPeriodo(f);
  const resumo = `${rs.length} registro(s), ${periodo} (${dias} dia(s)), gasto ${brl(gasto)}, ${r2(vendas)} venda(s)${conversas ? `, ${conversas} conversa(s)` : ''}${alvo ? `; custo por venda alvo ${brl(alvo.valor)} (${alvo.fonte})` : '; sem custo por venda alvo'}.`;
  return { nivel, suficiente: nivel !== 'insuficiente', dias, gasto: r2(gasto), vendas: r2(vendas), conversas, alvo, faltam, aguardar, resumo };
}

export const TITULO_INSUFICIENTE = 'Dados insuficientes para decidir';
/** Linha que vai no pedido da IA: o app decide se há dado; a IA não passa por cima. */
export function textoLeituraDados(l) {
  if (!l) return '';
  const cab = 'LEITURA DOS DADOS (calculada pelo app; respeite): ';
  if (l.nivel === 'sem_dados') return `${cab}sem resultados registrados. Diga "${TITULO_INSUFICIENTE}" para escala, pausa ou vencedor; recomende só estrutura de teste, rastreamento e criativos. O que esperar: ${l.aguardar}`;
  if (l.nivel === 'insuficiente') return `${cab}${l.resumo} INSUFICIENTE para declarar vencedor, perdedor ou escalar. Responda "${TITULO_INSUFICIENTE}" nesses pontos, diga o que esperar (${l.aguardar}) e recomende só o que não depende disso.`;
  if (l.nivel === 'perdedor') return `${cab}${l.resumo} Já gastou ${REGRAS_MINIMAS.multiploPerdedor}x o custo por venda alvo sem vender: dá para tratar como perdedor e trocar criativo, público ou oferta (siga a ordem do diagnóstico).`;
  return `${cab}${l.resumo} Suficiente para decidir (semana inteira e ${REGRAS_MINIMAS.vendasVencedor}+ vendas).`;
}
