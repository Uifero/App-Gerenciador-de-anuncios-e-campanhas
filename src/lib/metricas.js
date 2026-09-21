// Regras puras (sem DOM/Firebase) de semáforo, "hora de escalar" e checklist de lançamento.
// Ficam isoladas para serem testáveis e reaproveitadas no dashboard, no cliente e na central de alertas.
import { ESCOPO_PADRAO } from './constantes.js';

/** Tolerância além da meta antes de virar vermelho (amarelo = até 20% pior que a meta). */
export const TOLERANCIA = 0.2;
const DIA = 864e5;
const ORDEM = { verde: 0, amarelo: 1, vermelho: 2 };

const ts = (data) => new Date(String(data).slice(0, 10) + 'T00:00:00Z').getTime();
const temMeta = (m) => ({ cpa: Number(m?.cpa) > 0, roas: Number(m?.roas) > 0 });

/** Média ponderada pelo gasto (sem gasto informado, peso 1). */
function media(rs, campo) {
  const v = rs.filter((r) => r[campo] != null);
  if (!v.length) return null;
  const pesos = v.map((r) => (r.gasto > 0 ? r.gasto : 1));
  const soma = pesos.reduce((a, b) => a + b, 0);
  return v.reduce((s, r, i) => s + r[campo] * pesos[i], 0) / soma;
}

const EPS = 1e-9; // evita que 2.4/3 = 0.7999… vire vermelho por erro de ponto flutuante
const corCpa = (razao) => (razao <= 1 + EPS ? 'verde' : razao <= 1 + TOLERANCIA + EPS ? 'amarelo' : 'vermelho');
const corRoas = (razao) => (razao >= 1 - EPS ? 'verde' : razao >= 1 - TOLERANCIA - EPS ? 'amarelo' : 'vermelho');

/**
 * Semáforo do cliente: resultados dos últimos `cfg.diasSemaforo` dias (contados a partir do registro mais recente)
 * contra a meta de CPA e/ou ROAS. Com as duas metas, vale a pior.
 * estado: verde | amarelo | vermelho | sem_meta | sem_dados
 */
export function semaforo(resultados, metas, cfg) {
  const tem = temMeta(metas);
  if (!tem.cpa && !tem.roas) return { estado: 'sem_meta' };
  const validos = (resultados || []).filter((r) => r.data);
  if (!validos.length) return { estado: 'sem_dados' };
  const fim = Math.max(...validos.map((r) => ts(r.data)));
  const janela = validos.filter((r) => ts(r.data) > fim - (cfg.diasSemaforo || 7) * DIA);
  const cpa = media(janela, 'cpa'), roas = media(janela, 'roas');
  const partes = [];
  if (tem.cpa && cpa != null) partes.push(corCpa(cpa / metas.cpa));
  if (tem.roas && roas != null) partes.push(corRoas(roas / metas.roas));
  if (!partes.length) return { estado: 'sem_dados' };
  const estado = partes.reduce((a, b) => (ORDEM[b] > ORDEM[a] ? b : a));
  return { estado, cpa, roas, n: janela.length, dias: cfg.diasSemaforo || 7 };
}

/**
 * "Hora de escalar": criativo EM USO cujos registros mais recentes batem a meta (CPA <= meta e/ou ROAS >= meta)
 * de forma ininterrupta por pelo menos `cfg.diasEscalar` dias, com dado recente.
 */
export function horaDeEscalar(resultados, criativos, metas, cfg, agora = Date.now()) {
  const tem = temMeta(metas);
  if (!tem.cpa && !tem.roas) return [];
  const bate = (r) => (!tem.cpa || (r.cpa != null && r.cpa <= metas.cpa)) && (!tem.roas || (r.roas != null && r.roas >= metas.roas));
  const minimo = cfg.diasEscalar || 7;
  const out = [];
  for (const c of criativos.filter((x) => x.status === 'em_uso')) {
    const rs = (resultados || []).filter((r) => r.criativoId === c.id && r.data).sort((a, b) => ts(a.data) - ts(b.data));
    const streak = [];
    for (let i = rs.length - 1; i >= 0 && bate(rs[i]); i--) streak.unshift(rs[i]);
    if (!streak.length) continue;
    const dias = (ts(streak[streak.length - 1].data) - ts(streak[0].data)) / DIA + 1;
    const recente = agora - ts(streak[streak.length - 1].data) <= Math.max(minimo, 7) * 2 * DIA;
    if (dias >= minimo && recente) out.push({ criativoId: c.id, nome: c.nome, dias, cpa: media(streak, 'cpa'), roas: media(streak, 'roas') });
  }
  return out;
}

/** Etapas sugeridas de lançamento, só as que fazem parte do escopo do cliente, com % de progresso. */
export function checklistLancamento({ cliente, criativos = [], campanhas = [], site = null }) {
  const escopo = cliente.escopo || ESCOPO_PADRAO;
  const m = cliente.marca || {};
  const faltaPerfil = [['tom de voz', m.tomDeVoz], ['linguagem da dor', m.linguagemDor], ['diferencial', m.usp]].filter(([, v]) => !v).map(([k]) => k);
  const etapas = [{
    id: 'perfil', nome: 'Perfil de marca', aba: 'editar', feito: faltaPerfil.length === 0,
    detalhe: faltaPerfil.length ? `falta: ${faltaPerfil.join(', ')}` : 'tom, dor e diferencial preenchidos',
  }];
  if (escopo.criativos) {
    const aprov = criativos.filter((c) => ['aprovado', 'em_uso', 'pausado'].includes(c.status)).length;
    etapas.push({ id: 'criativos', nome: 'Criativos', aba: 'criativos', feito: criativos.length > 0, detalhe: criativos.length ? `${criativos.length} criado(s), ${aprov} aprovado(s)` : 'nenhum criativo ainda' });
  }
  if (escopo.campanhas) etapas.push({ id: 'campanha', nome: 'Estrutura de campanha', aba: 'campanhas', feito: campanhas.length > 0, detalhe: campanhas.length ? `${campanhas.length} campanha(s)` : 'nenhuma campanha ainda' });
  if (escopo.site) {
    const pronto = !!site && (!!site.exportadoEm || ['pronto', 'publicado'].includes(site.status));
    etapas.push({ id: 'site', nome: 'Site / Loja', aba: 'site', feito: pronto, detalhe: pronto ? 'exportado/pronto' : 'ainda não exportado' });
    etapas.push({ id: 'handoff', nome: 'Handoff (manual em PDF)', aba: 'site', feito: (site?.versaoManual || 0) > 0, detalhe: site?.versaoManual ? `manual v${site.versaoManual} gerado` : 'manual ainda não gerado' });
  }
  const feitas = etapas.filter((e) => e.feito).length;
  return { etapas, feitas, total: etapas.length, percentual: Math.round((feitas / etapas.length) * 100) };
}
