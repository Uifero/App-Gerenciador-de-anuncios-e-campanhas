// Peças finalizadas no Estúdio (imagem ou vídeo prontos para o anúncio), guardadas no Storage em
// gcc/<cliente>/pecas/<peça>/<arquivo> e registradas em COL.pecas, ligadas ao criativo e ao produto. Aqui: o que é puro
// (nome do arquivo, registro, filtros, status, uso do armazenamento e a cota gratuita, quando comprimir o vídeo e o que
// fazer com o arquivo ao excluir). O envio e a tela ficam em modules/pecas.js.
import { nomeFormato } from './formatos-instagram.js';
import { slug } from './csv.js';

export const STATUS_PECA = [['nova', 'Nova'], ['usar', 'Usar'], ['descartar', 'Descartar']];
export const STATUS_PECA_COR = { nova: 'tag-info', usar: 'tag-ok', descartar: 'tag-bad' };
export const statusDaPeca = (p) => (STATUS_PECA.some(([k]) => k === p?.status) ? p.status : 'nova');

/** Caminho de peça no Storage (o guarda de removerArquivo em core/storage.js reconhece por aqui). */
export const RE_CAMINHO_PECA = /^gcc\/[^/]+\/pecas\//;
export const ehCaminhoDePeca = (path) => RE_CAMINHO_PECA.test(String(path || ''));

/** Nome do arquivo com o formato: "<criativo>-reels-9x16.mp4", "<criativo>-feed-4x5.jpg". */
export function nomeArquivoPeca({ nomeCriativo = '', formato, tipo = 'imagem', ext = tipo === 'video' ? 'mp4' : 'jpg' }) {
  const base = (slug(nomeCriativo) || 'criativo').slice(0, 40);
  return `${base}-${nomeFormato(formato, tipo)}.${ext}`;
}
export const caminhoPeca = (clienteId, pecaId, nomeArquivo) => `gcc/${clienteId}/pecas/${pecaId}/${nomeArquivo}`;

/** Id novo de peça (gerado antes do envio: o caminho no Storage leva o id). */
export const novoIdPeca = () => `pc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Registro da peça em COL.pecas (sem url/path, que chegam depois do envio). */
export function registroPeca({ cliente, criativo, tipo, formato, ext, tamanho = 0, duracao = null, miniatura = '', config = {}, comprimido = false, baseadaEm = null, especialista = null }) {
  return {
    clienteId: cliente.id, criativoId: criativo?.id || null, produtoId: criativo?.produtoId || null, criativoNome: criativo?.nome || '',
    tipo, formato, formatoNome: nomeFormato(formato, tipo), ext, nomeArquivo: nomeArquivoPeca({ nomeCriativo: criativo?.nome, formato, tipo, ext }),
    tamanho: Number(tamanho) || 0, duracao, miniatura, status: 'nova', modeloGancho: criativo?.modeloGancho || null,
    versaoCriativo: (criativo?.versoes || []).length || null, texto: { hook: config.hook || '', cta: config.cta || '' }, config, comprimido,
    baseadaEm, especialista, origem: 'estudio',
  };
}

/** Filtro da Galeria: { produtoId, formato ('reels-9x16'...), status }. Vazio = todos. */
export function filtrarPecas(pecas = [], { produtoId = '', formato = '', status = '' } = {}) {
  return pecas.filter((p) => (!produtoId || p.produtoId === produtoId) && (!formato || p.formatoNome === formato) && (!status || statusDaPeca(p) === status));
}

/** A peça foi para um link de aprovação já enviado? (o arquivo dela fica, como os demais arquivos de link enviado) */
export function pecaEmLinkEnviado(peca, criativos = []) {
  if (peca?.aprovacaoToken || peca?.foiParaAprovacao) return true; // foiParaAprovacao: restaurada de backup (sem o token)
  return criativos.some((c) => c?.aprovacaoToken && c.aprovacaoArquivo?.path && c.aprovacaoArquivo.path === peca?.path);
}

/** Plano de exclusão: só peças "Descartar"; as que estão num link enviado perdem o registro mas mantêm o arquivo. */
export function planoExclusaoPecas(pecas = [], criativos = []) {
  const descartadas = pecas.filter((p) => statusDaPeca(p) === 'descartar');
  const bloqueadas = pecas.filter((p) => statusDaPeca(p) !== 'descartar');
  const manter = descartadas.filter((p) => pecaEmLinkEnviado(p, criativos));
  const apagar = descartadas.filter((p) => !pecaEmLinkEnviado(p, criativos));
  const texto = [
    descartadas.length ? `Excluir ${descartadas.length} peça(s) marcada(s) como "Descartar"? Saem da Galeria e não voltam.` : 'Nenhuma peça marcada como "Descartar".',
    manter.length ? `${manter.length} delas já foi(ram) num link de aprovação: o arquivo fica guardado para o link continuar mostrando.` : '',
    bloqueadas.length ? `${bloqueadas.length} peça(s) sem "Descartar" ficam como estão.` : '',
  ].filter(Boolean).join(' ');
  return { apagar, manter, bloqueadas, texto };
}

// ---------- armazenamento ----------
/**
 * Cota gratuita do Cloud Storage for Firebase (plano Blaze, bucket *.firebasestorage.app), da página oficial
 * firebase.google.com/pricing, conferida em 08/10/2026: 5 GB-mês armazenados, 100 GB/mês baixados, 5 mil envios/mês e
 * 50 mil downloads/mês, só para buckets em us-central1, us-west1 ou us-east1. Acima disso vale a tabela do Cloud
 * Storage (a página do Firebase só aponta para ela); Standard nessas regiões ≈ US$ 0,020 por GB-mês segundo fontes
 * secundárias (a tabela oficial não abriu na conferência): conferir em cloud.google.com/storage/pricing.
 */
export const COTA_STORAGE = {
  gratisBytes: 5 * 1024 ** 3, downloadGbMes: 100, enviosMes: 5000, downloadsMes: 50000, precoGbMesUsd: 0.02,
  fonte: 'firebase.google.com/pricing (conferido em 08/10/2026)', fontePreco: 'cloud.google.com/storage/pricing (valor aproximado, conferir)',
  regioes: ['us-central1', 'us-west1', 'us-east1'],
};
export const LIMITE_AVISO_COTA = 0.8;

/** Uso pelas peças: { bytes, quantidade, porCliente: { [clienteId]: { bytes, quantidade } } }. */
export function usoArmazenamento(pecas = []) {
  const porCliente = {};
  let bytes = 0;
  for (const p of pecas) {
    const b = Math.max(0, Number(p?.tamanho) || 0);
    bytes += b;
    const k = p?.clienteId || '?';
    porCliente[k] ||= { bytes: 0, quantidade: 0 };
    porCliente[k].bytes += b; porCliente[k].quantidade += 1;
  }
  return { bytes, quantidade: pecas.length, porCliente };
}

/** Situação perante a cota gratuita: { fracao, perto, passou, excedenteGb, custoMesUsd }. */
export function situacaoCota(bytes, cota = COTA_STORAGE) {
  const fracao = cota.gratisBytes ? bytes / cota.gratisBytes : 0;
  const excedenteGb = Math.max(0, (bytes - cota.gratisBytes) / 1024 ** 3);
  return { fracao, perto: fracao >= LIMITE_AVISO_COTA && fracao < 1, passou: fracao >= 1, excedenteGb, custoMesUsd: excedenteGb * cota.precoGbMesUsd };
}

/** 1536 -> "1,5 KB"; 0 -> "0 B". */
export function formatarBytes(b) {
  const n = Math.max(0, Number(b) || 0);
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = n ? Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024))) : 0;
  const v = n / 1024 ** i;
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
}

// ---------- vídeo ----------
/** Taxa alvo para Reels/Stories (1080×1920): ~5 Mbps fica nítido no celular e leve para subir. */
export const VIDEO_ALVO_BPS = 5_000_000;
/**
 * Comprime antes de guardar? Sim se não é MP4 (o Meta pede MP4) ou se a taxa passa de 20% acima do alvo.
 * Devolve { comprimir, bps, motivo }.
 */
export function planoCompressaoVideo({ bytes = 0, duracao = 0, ext = 'mp4' } = {}) {
  const bps = duracao > 0 ? (bytes * 8) / duracao : 0;
  if (String(ext).toLowerCase() !== 'mp4') return { comprimir: true, bps, motivo: 'converter para MP4 (o Meta pede MP4)' };
  if (bps > VIDEO_ALVO_BPS * 1.2) return { comprimir: true, bps, motivo: `taxa de ${(bps / 1e6).toFixed(1)} Mbps: comprimir para ~${VIDEO_ALVO_BPS / 1e6} Mbps` };
  return { comprimir: false, bps, motivo: 'já está leve' };
}
