// Constantes de domínio compartilhadas.

export const IDIOMAS = [['pt-BR', 'Português (Brasil)'], ['es', 'Español'], ['en', 'English']];
export const IDIOMA_NOME = { 'pt-BR': 'português do Brasil', es: 'español latinoamericano', en: 'English (US)' };

export const ESTAGIOS = [['novo', 'Novo (ainda não anuncia)'], ['rodando', 'Rodando (já tem campanhas)']];

/** Módulos de um cliente. `id` também é o nome da aba e a chave do escopo. */
export const MODULOS = [
  { id: 'criativos', nome: 'Criativos', icone: 'wand-magic-sparkles', legenda: 'Crie e refine anúncios (copy e roteiro).' },
  { id: 'hooks', nome: 'Hooks', icone: 'bolt', legenda: 'Biblioteca de ganchos reaproveitáveis.' },
  { id: 'referencias', nome: 'Referências', icone: 'bookmark', legenda: 'Anúncios de mercado que servem de inspiração.' },
  { id: 'campanhas', nome: 'Campanhas', icone: 'bullseye', legenda: 'Estrutura de teste, públicos e orçamento.' },
  { id: 'resultados', nome: 'Resultados', icone: 'chart-line', legenda: 'Registre CTR, CPA e ROAS por criativo.' },
  { id: 'produtos', nome: 'Produtos', icone: 'box', legenda: 'Catálogo que alimenta o site.' },
  { id: 'site', nome: 'Site/Loja', icone: 'store', legenda: 'Monte a loja: site exportável ou pacote de plataforma.' },
  { id: 'relatorio', nome: 'Relatório', icone: 'file-pdf', legenda: 'Exporte o resumo do cliente em PDF.' },
];

export const FRAMEWORKS = [
  ['livre', 'Livre (a IA escolhe)'], ['AIDA', 'AIDA — Atenção, Interesse, Desejo, Ação'],
  ['PAS', 'PAS — Problema, Agitação, Solução'], ['4Us', '4Us — Urgente, Único, Útil, Ultra-específico'],
  ['HRR', 'Hook-Retain-Reward'],
];

export const MODELOS_CRIATIVO = [
  ['', 'Briefing livre'], ['antes_depois', 'Antes e depois'], ['depoimento_ugc', 'Depoimento UGC'],
  ['problema_solucao', 'Problema → solução'], ['oferta_escassez', 'Oferta com escassez'],
  ['comparacao', 'Comparação'], ['unboxing', 'Unboxing'],
];
export const MODELO_DESCRICAO = {
  antes_depois: 'transformação visível: como era antes e como ficou depois',
  depoimento_ugc: 'relato em primeira pessoa, como um cliente real gravando no celular',
  problema_solucao: 'apresenta um problema do dia a dia e mostra a saída',
  oferta_escassez: 'oferta com prazo/estoque limitado, sem soar apelativo',
  comparacao: 'compara a solução com a alternativa que o público usa hoje',
  unboxing: 'primeira impressão ao abrir/usar o produto',
};

export const FORMATOS = [['video_curto', 'Vídeo curto (Reels/TikTok)'], ['imagem', 'Imagem única'], ['carrossel', 'Carrossel'], ['texto', 'Texto/Legenda']];

export const STATUS_CRIATIVO = [
  ['rascunho', 'Rascunho'], ['pronto_aprovacao', 'Aguardando cliente'], ['aprovado', 'Aprovado'], ['em_uso', 'Em uso'], ['pausado', 'Pausado'], ['encerrado', 'Encerrado'],
];
export const STATUS_COR = { rascunho: '', pronto_aprovacao: 'tag-warn', aprovado: 'tag-info', em_uso: 'tag-ok', pausado: 'tag-warn', encerrado: 'tag-bad' };

/** Perguntas do checklist de qualidade antes de aprovar um criativo. */
export const CHECKLIST_QUALIDADE = [
  ['naoForcada', 'A linguagem está natural, sem parecer forçada?'],
  ['tomGenuino', 'O tom é genuíno, de conteúdo orgânico?'],
  ['ofertaClara', 'A oferta está clara?'],
  ['gatilho', 'Dá para identificar o gatilho mental?'],
  ['ctaClaro', 'O CTA está claro?'],
  ['funil', 'Está alinhado ao momento do funil?'],
];

export const CATEGORIAS_HOOK = [
  ['dor', 'Dor'], ['curiosidade', 'Curiosidade'], ['prova', 'Prova social'], ['resultado', 'Resultado'],
  ['erro_comum', 'Erro comum'], ['contraintuitivo', 'Contraintuitivo'], ['pergunta', 'Pergunta'],
];

export const STATUS_CAMPANHA = [['planejada', 'Planejada'], ['ativa', 'Ativa'], ['pausada', 'Pausada'], ['encerrada', 'Encerrada']];

export const PLATAFORMAS = [['nuvemshop', 'Nuvemshop'], ['shopify', 'Shopify']];
export const STATUS_SITE = [['rascunho', 'Rascunho'], ['pronto', 'Pronto para entrega'], ['publicado', 'Publicado/Entregue']];

export const CONFIG_PADRAO = {
  diasMinimosReferencia: 15, cortes: { moderado: 15, forte: 30 }, diasFadiga: 14,
  diasSemaforo: 7,  // janela (dias) de resultados recentes usada no semáforo
  diasEscalar: 7,   // dias seguidos batendo a meta para sugerir "hora de escalar"
  // --- Fase 3: custo e limites de IA ---
  orcamentoIaMensalUsd: null, // orçamento global do mês em US$ (null = sem limite)
  cotacaoUsd: 5.5,            // só para exibir o equivalente em R$ (estimativa editável)
  diasReutilizarBusca: 30,    // antes de gastar numa busca de mercado, oferece as referências salvas dos últimos N dias
  variacoesPadrao: 4,         // variações por geração de criativo (1 a 5)
  limitesTokens: {},          // sobrescreve o limite de tokens de saída por tarefa (ver TAREFAS_IA)
};

/**
 * Tarefas de IA (chaves iguais às do servidor): [rótulo, categoria de custo, limite padrão de tokens de saída, modelo].
 * Os limites e modelos espelham TAREFAS em server/index.js (o servidor é a fonte da verdade; aqui servem de sugestão na tela).
 */
export const TAREFAS_IA = {
  criativos: ['Geração de criativos', 'criativos', 8000, 'Sonnet'], refino: ['Refino de criativos', 'criativos', 3000, 'Haiku'], checklist: ['Checklist de qualidade', 'criativos', 1200, 'Haiku'],
  imagem: ['Prompts de imagem e vídeo', 'criativos', 1800, 'Haiku'],
  hooks: ['Geração de hooks', 'hooks', 2000, 'Haiku'], referencias: ['Busca de mercado', 'mercado', 10000, 'Sonnet'], analise: ['Análise de referência', 'mercado', 2500, 'Sonnet'],
  site: ['Conteúdo do site', 'site', 6000, 'Sonnet'], pacote: ['Pacote de plataforma', 'site', 8000, 'Sonnet'], campanha: ['Estrutura de campanha', 'campanhas', 5000, 'Sonnet'], playbook: ['Playbooks', 'playbooks', 4000, 'Sonnet'],
};
export const CATEGORIAS_CUSTO = { criativos: 'Criativos', hooks: 'Hooks', mercado: 'Análise de mercado', site: 'Site/Loja', campanhas: 'Campanhas', playbooks: 'Playbooks' };

/** Escopo padrão de um cliente (módulos entregues). */
export const ESCOPO_PADRAO = { criativos: true, hooks: true, referencias: true, campanhas: true, resultados: true, produtos: false, site: false, relatorio: true };
