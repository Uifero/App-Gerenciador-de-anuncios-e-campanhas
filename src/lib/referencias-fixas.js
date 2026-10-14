// Referências fixas da fase de qualidade (site sem cara de IA, criativos orgânicos, tráfego de profissional experiente):
// uma lista só, lida por "Documentos de referência" (Configurações, entradas fixas) e pelos cartões dos Playbooks. O texto
// é o MESMO que a IA recebe (server/referencias/*.js); as partes saem das linhas "- Nome: ..." dele, então o cartão nunca
// fica diferente do que a IA lê. Ficam fora de documentosParaAnalise: o texto já vai pelo servidor nas tarefas marcadas.
import { REFERENCIA_SITE_PROFISSIONAL } from '../../server/referencias/site-profissional.js';
import { REFERENCIA_PAGINA_PRODUTO } from '../../server/referencias/pagina-produto.js';
import { REFERENCIA_LEGAL } from '../../server/referencias/requisitos-legais.js';
import { REFERENCIA_ROTEIROS } from '../../server/referencias/roteiros-video.js';
import { REFERENCIA_ORGANICO } from '../../server/referencias/estilo-organico.js';
import { REFERENCIA_POLITICAS } from '../../server/referencias/politicas-nicho.js';
import { REFERENCIA_DECISOES } from '../../server/referencias/decisoes-trafego.js';

/** Itens "- Nome: pontos" do texto -> [{ parte, pontos }] (sem o cabeçalho). */
export function partesDaReferencia(texto) {
  return String(texto || '').split('\n').filter((l) => /^-\s/.test(l)).map((l) => {
    const corpo = l.replace(/^-\s*/, '');
    const m = /^([^:]{2,60}):\s*(.+)$/.exec(corpo);
    return m ? { parte: m[1].trim(), pontos: m[2].trim() } : { parte: corpo.split(/[,.;]/)[0].slice(0, 60).trim(), pontos: corpo };
  });
}

/** Tokens aproximados (português: ~3,6 caracteres por token). Só para mostrar o peso de cada referência. */
export const tokensAprox = (texto) => Math.round(String(texto || '').length / 3.6);

const ref = (id, titulo, texto, usoEm, resumo) => ({ id, fixo: true, titulo, clienteId: null, texto, usoEm, resumo, partes: partesDaReferencia(texto), tokens: tokensAprox(texto) });

export const REFERENCIAS_FIXAS = [
  ref('site-profissional', 'Loja sem cara de IA', REFERENCIA_SITE_PROFISSIONAL, 'Gerar site, pacote, "Analisar meu pedido" e ajustes amplos do site',
    'Hierarquia, ritmo das seções, texto curto e específico e a lista de clichês proibidos. O app confere o site gerado com a mesma lista ("Cara de IA", passo 4).'),
  ref('pagina-produto', 'Página de produto que converte', REFERENCIA_PAGINA_PRODUTO, 'Gerar site, pacote e "Analisar meu pedido"',
    'Ordem dos blocos no celular, onde vai a prova, perguntas frequentes pelas objeções reais, garantia e devolução, compre junto e fotos.'),
  ref('requisitos-legais', 'Requisitos legais de loja no Brasil', REFERENCIA_LEGAL, 'Gerar site e pacote; o passo 6 confere sem IA',
    'Identificação (CNPJ, endereço, contato), arrependimento de 7 dias, trocas, privacidade (LGPD) e preço claro. A IA nunca inventa CNPJ nem endereço.'),
  ref('roteiros-video', 'Roteiros de vídeo por formato', REFERENCIA_ROTEIROS, 'Gerar criativos (ideias) e narração',
    'UGC, unboxing, rotina, 3 motivos, problema e solução, react, bastidores e comparação: duração, como filmar no celular e texto na tela. O gancho continua vindo da biblioteca de ganchos.'),
  ref('estilo-organico', 'Criativo com cara de post real', REFERENCIA_ORGANICO, 'Gerar criativos, ajustes de criativo e "Sugerir prompts" do Estúdio',
    'Celular, luz natural, primeira pessoa, legenda simples, marca no fim e sem palavras de venda. O app confere com "Parece anúncio?".'),
  ref('politicas-nicho', 'Políticas de anúncio por nicho', REFERENCIA_POLITICAS, 'Gerar criativos, hooks, ajustes de criativo e o especialista de copy',
    'Atributos pessoais, moda, cosméticos, infantil, preço riscado e sorteios. A regra de saúde continua bloqueando; aqui é orientação.'),
  ref('decisoes-trafego', 'Decisões de tráfego de um profissional experiente', REFERENCIA_DECISOES, '"Analisar e recomendar", diagnóstico, plano de otimização, Insights e o especialista de tráfego',
    'Mínimo de dados antes de julgar, ordem do diagnóstico, fase de aprendizado, fadiga, atribuição, quebras e o porquê de cada recomendação.'),
];
