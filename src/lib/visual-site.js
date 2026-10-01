// Escolhas visuais do site que não precisam de IA (painel "Site gerado" e "Ajustar este site"), e os prints de
// clientes reais que viram a seção "Clientes reais". Regras puras, sem banco nem tela.
//  - Pacote: o molde da prévia (lib/pacote-loja.js) tem seções fixas que podem ser reordenadas/ocultadas, imagem do
//    banner (dos Materiais do cliente) e o ajuste das fotos dos produtos (inteiras = contain; preencher = cover).
//  - Personalizado: as mesmas escolhas vivem no layout do site (lib/site-blocos.js).
//  - Prints: só os reais (Materiais / Provas sociais), sem repetir o mesmo arquivo; a versão borrada (ou com tarja)
//    é a que vai para o site; o original fica guardado.
import { tipoMaterial } from './prova-social.js';

export const SECOES_LOJA = [
  ['banner', 'Banner'], ['provas', 'Clientes reais'], ['produtos', 'Produtos'], ['confianca', 'Compra segura'],
  ['depoimentos', 'Quem já comprou'], ['sobre', 'Sobre a marca'], ['faq', 'Perguntas frequentes'],
];
export const ORDEM_LOJA = SECOES_LOJA.map(([k]) => k);
export const nomeSecaoLoja = (k) => (SECOES_LOJA.find(([s]) => s === k) || [, k])[1];
export const AJUSTES_FOTO = { contain: 'Mostrar inteiras', cover: 'Preencher o espaço' };

/** Escolhas visuais do pacote, sempre num formato válido (seção nova entra na posição padrão). */
export function normalizarVisual(v = {}) {
  const ordemSalva = (Array.isArray(v.ordem) ? v.ordem : []).filter((k) => ORDEM_LOJA.includes(k));
  const ordem = [...new Set(ordemSalva)];
  // Seção que ainda não estava na ordem salva (ex.: "Clientes reais", nova) entra logo depois da vizinha padrão.
  ORDEM_LOJA.forEach((k, i) => { if (!ordem.includes(k)) { const antes = ORDEM_LOJA.slice(0, i).reverse().find((x) => ordem.includes(x)); ordem.splice(antes ? ordem.indexOf(antes) + 1 : 0, 0, k); } });
  return {
    ordem,
    ocultas: [...new Set((v.ocultas || []).filter((k) => ORDEM_LOJA.includes(k)))],
    ajusteFotos: v.ajusteFotos === 'contain' ? 'contain' : 'cover',
    banner: v.banner?.url ? { materialId: v.banner.materialId || null, url: v.banner.url, nome: v.banner.nome || 'imagem' } : null,
  };
}

/** Só imagens dos Materiais (sem vídeo, sem o print da referência) servem para banner. */
export const imagensParaBanner = (materiais = []) => materiais.filter((m) => ['foto', 'logo', 'prova_social'].includes(tipoMaterial(m)) && m.url);

const chaveArquivo = (m) => m.hashOriginal || m.hash || (m.nomeOriginal && m.tamanho ? `${m.nomeOriginal}|${m.tamanho}` : m.url);
/** Print protegido: já tem cópia borrada ou foi guardado com tarja (o original com dados não vai para o site). */
export const printProtegido = (m) => Boolean(m?.borrada?.url) || Number(m?.tarjas) > 0;

/**
 * Prints de clientes reais para a seção "Clientes reais": materiais marcados como prova social, sem o mesmo arquivo
 * duas vezes (no mesmo arquivo, fica a cópia protegida). Devolve [{ id, url (a que vai para o site), original, protegido,
 * autorizado, legenda }].
 */
export function printsDoCliente(materiais = []) {
  const porChave = new Map();
  for (const m of materiais.filter((x) => tipoMaterial(x) === 'prova_social' && x.url)) {
    const k = chaveArquivo(m), atual = porChave.get(k);
    if (!atual || (printProtegido(m) && !printProtegido(atual))) porChave.set(k, m);
  }
  return [...porChave.values()].sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || ''))).map((m) => ({
    id: m.id, url: m.borrada?.url || m.url, original: m.url, protegido: printProtegido(m), autorizado: Boolean(m.autorizado),
    legenda: m.fonteProva || 'Cliente',
  }));
}

/** No site personalizado, o print que já aparece como depoimento (cartão "Prints de prova social no site") não repete em "Clientes reais". */
export const semRepetirDepoimentos = (prints = [], depoimentos = []) => prints.filter((p) => !depoimentos.some((d) => d?.materialId === p.id && d?.midiaUrl));

/** Prints que vão para fora (link de aprovação, pacote) sem proteção e sem autorização registrada. */
export const printsSemAutorizacao = (prints = []) => prints.filter((p) => !p.protegido && !p.autorizado);
