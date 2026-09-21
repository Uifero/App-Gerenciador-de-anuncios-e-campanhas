// Cliente de IA + prompts. Toda chamada passa pelo servidor (/api/claude), que guarda a chave.
// Toda função aqui tem um equivalente manual nos módulos (formulários "sem IA").
import { tokenAtual } from './auth.js';
import { IDIOMA_NOME, MODELO_DESCRICAO } from '../lib/constantes.js';

export async function chamarClaude({ system, messages, maxTokens = 8000, webSearch = null, effort = 'medium' }) {
  const token = await tokenAtual();
  let r;
  try {
    r = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ system, messages, maxTokens, webSearch, effort }),
    });
  } catch {
    throw new Error('Não consegui falar com o servidor de IA. Ele está rodando? Você pode usar a opção manual.');
  }
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (!corpo.erro && [502, 503, 504].includes(r.status)) throw new Error('O servidor de IA não respondeu. Confirme que ele está rodando (npm run dev) ou use a opção manual.');
    throw new Error(corpo.erro || `Erro ${r.status} ao chamar a IA.`);
  }
  return corpo;
}

/** Extrai JSON de uma resposta (tolera cercas ```json e texto em volta). */
export function extrairJSON(texto) {
  const limpo = String(texto).replace(/```(?:json)?/gi, '');
  const i = limpo.search(/[[{]/);
  if (i < 0) throw new Error('A IA não devolveu dados estruturados. Tente de novo.');
  const abre = limpo[i], fecha = abre === '{' ? '}' : ']';
  const j = limpo.lastIndexOf(fecha);
  try { return JSON.parse(limpo.slice(i, j + 1)); }
  catch { throw new Error('A resposta da IA veio incompleta. Tente de novo com menos itens.'); }
}

async function gerarJSON(opts) {
  const r = await chamarClaude(opts);
  return { dados: extrairJSON(r.texto), fontes: r.fontes || [] };
}

// ---------- contexto e regras ----------
export function termosProibidos(cliente) {
  return String(cliente.marca?.termosProibidos || '').split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
}

/** Verificação LOCAL (não depende da IA): devolve os termos proibidos encontrados no texto. */
export function acharTermosProibidos(texto, cliente) {
  const t = String(texto || '').toLowerCase();
  return termosProibidos(cliente).filter((p) => t.includes(p.toLowerCase()));
}

const REGRA_CRITICA = (cliente) => `REGRAS CRÍTICAS (valem para tudo que você escrever):
1. Soe como conteúdo nativo e orgânico — como uma pessoa real falando, nunca como anúncio de vendas.
2. Evite linguagem de venda óbvia ("compre agora", "oferta imperdível", "o melhor do mercado", "você não vai acreditar") e claims exagerados ou garantias de resultado. Prefira especificidade concreta e verossímil.
3. NUNCA use estes termos proibidos/restritos do nicho: ${termosProibidos(cliente).join(', ') || '(nenhum cadastrado — mesmo assim evite promessas de saúde, dinheiro ou resultado garantido)'}.
4. Escreva em ${IDIOMA_NOME[cliente.marca?.idioma] || IDIOMA_NOME['pt-BR']}.
5. Cada variação deve ter um gatilho mental identificável e um ângulo diferente das demais.
6. Não invente dados, números, estudos, prêmios ou depoimentos de pessoas reais. Use só o que consta no perfil de marca.`;

export function contextoCliente(c) {
  const m = c.marca || {};
  const h = c.historico || {};
  const l = [
    `CLIENTE: ${c.nome}`, `Nicho/produto: ${c.nicho}`,
    `Estágio: ${c.estagio === 'rodando' ? 'já roda anúncios' : 'novo, ainda não anuncia'}`,
    m.tomDeVoz && `Tom de voz: ${m.tomDeVoz}`,
    m.linguagemDor && `Como o público descreve a própria dor (palavras reais): ${m.linguagemDor}`,
    m.objecoes && `Objeções comuns: ${m.objecoes}`,
    m.provasSociais && `Provas sociais disponíveis (únicas que podem ser citadas): ${m.provasSociais}`,
    m.usp && `Diferencial (USP): ${m.usp}`,
  ];
  if (c.estagio === 'rodando') {
    l.push(h.cpaMedio && `CPA médio atual: R$ ${h.cpaMedio}`, h.orcamentoDiario && `Orçamento diário atual: R$ ${h.orcamentoDiario}`,
      h.publicos && `Públicos que já convertem: ${h.publicos}`);
  }
  return l.filter(Boolean).join('\n');
}

function contextoReferencias(refs = []) {
  const uteis = [...refs].sort((a, b) => (b.sinal === 'forte') - (a.sinal === 'forte')).slice(0, 5);
  if (!uteis.length) return '';
  return '\nREFERÊNCIAS DE MERCADO SALVAS (priorize as de sinal forte; inspire-se no ângulo, NÃO copie o texto):\n' + uteis.map((r, i) =>
    `${i + 1}. [sinal ${r.sinal || 'n/d'}${r.diasNoAr ? `, ${r.diasNoAr} dias no ar` : ''}] ${r.titulo || ''} — ângulo: ${r.analise?.angulo || 'n/d'}; framework: ${r.analise?.framework || 'n/d'}; replicar: ${r.analise?.replicar || 'n/d'}`).join('\n');
}

function contextoResultados(res = []) {
  if (!res.length) return '';
  const top = [...res].filter((r) => r.roas || r.cpa).sort((a, b) => (b.roas || 0) - (a.roas || 0) || (a.cpa || 1e9) - (b.cpa || 1e9)).slice(0, 4);
  if (!top.length) return '';
  return '\nO QUE JÁ PERFORMOU BEM (sugira criativos parecidos em ângulo/estrutura):\n' + top.map((r) =>
    `- "${r.criativoNome || 'criativo'}" (ângulo: ${r.angulo || 'n/d'}): CTR ${r.ctr ?? 'n/d'}%, CPA ${r.cpa ?? 'n/d'}, ROAS ${r.roas ?? 'n/d'}`).join('\n');
}

const SO_JSON = 'Responda APENAS com JSON válido, sem texto antes ou depois, sem cercas de código.';

// ---------- criativos ----------
export async function gerarCriativos({ cliente, briefing, modelo, framework, formato, referencias, resultados, quantidade = 4, base }) {
  const system = `Você é um copywriter e estrategista de tráfego pago sênior. Cria anúncios que parecem conteúdo orgânico.\n\n${REGRA_CRITICA(cliente)}\n\n${contextoCliente(cliente)}${contextoReferencias(referencias)}${contextoResultados(resultados)}`;
  const pedido = [
    `Gere ${Math.min(5, Math.max(3, quantidade))} variações de criativo, cada uma com hook e ângulo diferentes.`,
    briefing && `Briefing: ${briefing}`,
    modelo && `Modelo de criativo: ${modelo.replace('_', ' ')} — ${MODELO_DESCRICAO[modelo] || ''}`,
    framework && framework !== 'livre' && `Framework de copy obrigatório: ${framework}`,
    formato && `Formato: ${formato}`,
    base && `Ponto de partida — anúncio de referência de mercado (adapte o ÂNGULO ao cliente, sem copiar o texto): ${base.titulo || ''}\n${base.texto || ''}\nAnálise: ${JSON.stringify(base.analise || {})}`,
    `Formato de saída: array JSON de objetos com: "nome" (legenda curta e descritiva), "hook" (primeira frase/3 primeiros segundos), "angulo" (ângulo/categoria em 1-3 palavras), "gatilho" (gatilho mental usado), "framework", "formato", "copy" (texto completo do anúncio ou roteiro cena a cena), "cta", "porque" (1-2 frases explicando a lógica da variação).`,
    SO_JSON,
  ].filter(Boolean).join('\n');
  const { dados } = await gerarJSON({ system, messages: [{ role: 'user', content: pedido }], maxTokens: 10000 });
  return (Array.isArray(dados) ? dados : dados.variacoes || []).map(normalizarCriativo);
}

function normalizarCriativo(c) {
  return {
    nome: c.nome || c.hook?.slice(0, 60) || 'Criativo', hook: c.hook || '', angulo: c.angulo || '', gatilho: c.gatilho || '',
    framework: c.framework || 'livre', formato: c.formato || 'video_curto', copy: c.copy || '', cta: c.cta || '', porque: c.porque || '',
  };
}

export async function refinarCriativo({ cliente, criativo, instrucao, conversa = [] }) {
  const system = `Você refina criativos de anúncio mantendo tom orgânico.\n\n${REGRA_CRITICA(cliente)}\n\n${contextoCliente(cliente)}`;
  const atual = JSON.stringify({ hook: criativo.hook, copy: criativo.copy, cta: criativo.cta, angulo: criativo.angulo, framework: criativo.framework });
  const msgs = [
    ...conversa,
    { role: 'user', content: `Criativo atual: ${atual}\n\nAjuste pedido: ${instrucao}\n\nDevolva o criativo COMPLETO já ajustado como objeto JSON com: "hook","copy","cta","angulo","gatilho","explicacao" (1-2 frases dizendo o que mudou). ${SO_JSON}` },
  ];
  const { dados } = await gerarJSON({ system, messages: msgs, maxTokens: 6000 });
  return dados;
}

// ---------- hooks ----------
export async function gerarHooks({ cliente, tema, categoria, quantidade = 8 }) {
  const system = `Você cria hooks (ganchos de abertura) para anúncios.\n\n${REGRA_CRITICA(cliente)}\n\n${contextoCliente(cliente)}`;
  const pedido = `Crie ${quantidade} hooks${categoria ? ` da categoria "${categoria}"` : ' de categorias variadas'}${tema ? ` sobre: ${tema}` : ''}. Cada um deve caber em 1-2 frases faladas. Saída: array JSON de {"texto","categoria"} com categoria em: dor, curiosidade, prova, resultado, erro_comum, contraintuitivo, pergunta. ${SO_JSON}`;
  const { dados } = await gerarJSON({ system, messages: [{ role: 'user', content: pedido }], maxTokens: 4000, effort: 'low' });
  return (Array.isArray(dados) ? dados : dados.hooks || []).filter((h) => h.texto);
}

// ---------- campanhas ----------
export async function gerarEstruturaCampanha({ cliente, criativos, objetivo, orcamentoDiario }) {
  const system = `Você é gestor de tráfego Meta Ads sênior. Estrutura testes enxutos e realistas.\n\n${contextoCliente(cliente)}`;
  const pedido = `Monte a estrutura de campanha ${cliente.estagio === 'rodando' ? 'de ESCALA/otimização usando o histórico do cliente' : 'de PRIMEIRO TESTE (cliente novo, sem histórico)'}.
Objetivo: ${objetivo || 'vendas'}. Orçamento diário disponível: ${orcamentoDiario ? 'R$ ' + orcamentoDiario : 'não informado — sugira uma faixa coerente e diga que é estimativa'}.
Criativos disponíveis: ${criativos.map((c) => `"${c.nome}" (ângulo ${c.angulo || 'n/d'})`).join('; ') || 'nenhum ainda — indique quantos e quais ângulos produzir'}.
Saída em JSON: {"resumo": string, "publicos": [{"nome","descricao","tipo"}], "orcamento": {"diario": number, "distribuicao": string}, "estruturaTeste": {"campanhas": number, "conjuntos": string, "criativosPorConjunto": string, "duracaoDias": number, "criterioDecisao": string}, "checklistMeta": [string]}.
"checklistMeta" = passos práticos, na ordem, para configurar no Gerenciador de Anúncios do Meta. ${SO_JSON}`;
  const { dados } = await gerarJSON({ system, messages: [{ role: 'user', content: pedido }], maxTokens: 6000 });
  return dados;
}

// ---------- referências ----------
export async function buscarReferencias({ cliente, diasMinimos, quantidade = 5 }) {
  const system = `Você pesquisa anúncios reais de empresas de destaque num nicho e os analisa estrategicamente. Você NUNCA inventa anúncios, links ou datas: só inclui o que encontrou na pesquisa.`;
  const pedido = `Nicho do cliente: ${cliente.nicho}. Idioma/mercado: ${IDIOMA_NOME[cliente.marca?.idioma] || 'pt-BR'}.
Pesquise na web (priorize a Biblioteca de Anúncios do Meta, facebook.com/ads/library, e depois buscas gerais) até ${quantidade} anúncios ATIVOS de empresas de destaque nesse nicho, priorizando os que estão no ar há pelo menos ${diasMinimos} dias.
Para cada um: "titulo" (descrição curta), "empresa", "link" (URL real encontrada), "texto" (copy do anúncio, se visível), "diasNoAr" (número SE a fonte mostra data de início; senão null — nunca estime), "evidencia" (de onde veio a informação de dias/atividade), e "analise": {"angulo","framework" (AIDA/PAS/4Us/HRR/outro), "formato", "publico", "replicar" (o que vale replicar para o cliente, sem copiar)}.
Se a Biblioteca não for acessível pela busca, use outras fontes e diga isso em "evidencia". Se encontrar poucos, devolva poucos. Saída: array JSON. ${SO_JSON}`;
  const { dados, fontes } = await gerarJSON({
    system, messages: [{ role: 'user', content: pedido }], maxTokens: 12000, webSearch: { maxUses: 8 },
  });
  return { itens: Array.isArray(dados) ? dados : dados.resultados || [], fontes };
}

export async function analisarReferencia({ cliente, ref }) {
  const system = `Você é estrategista de mídia paga e analisa anúncios de concorrentes.\n\n${contextoCliente(cliente)}`;
  const pedido = `Analise este anúncio de mercado:\nTítulo: ${ref.titulo || ''}\nTexto: ${ref.texto || ''}\nLink: ${ref.link || ''}\nSaída JSON: {"angulo": string (ângulo/gatilho), "framework": string (framework de copy identificável), "formato": string, "publico": string (público provável), "replicar": string (o que replicar para ${cliente.nome} sem copiar)}. ${SO_JSON}`;
  return (await gerarJSON({ system, messages: [{ role: 'user', content: pedido }], maxTokens: 3000, effort: 'low' })).dados;
}

// ---------- site / loja ----------
export async function gerarConteudoSite({ cliente, produtos }) {
  const system = `Você é copywriter de e-commerce.\n\n${REGRA_CRITICA(cliente)}\n\n${contextoCliente(cliente)}`;
  const pedido = `Escreva o conteúdo da loja. Produtos: ${produtos.map((p) => p.nome).join(', ') || 'a definir'}.
Saída JSON: {"heroTitulo","heroSubtitulo","heroCta","storytelling" (2 parágrafos curtos sobre a marca, usando só fatos do perfil), "depoimentos": [{"nome","texto"}] (3 MODELOS de depoimento com nomes genéricos como "Cliente", para serem substituídos por reais — não invente nomes de pessoas reais),"newsletterTitulo","newsletterTexto","politicas": {"trocas","envio","privacidade"} (textos-base curtos, marcados para revisão jurídica),"bannersPromo": [{"titulo","subtitulo"}]}. ${SO_JSON}`;
  return (await gerarJSON({ system, messages: [{ role: 'user', content: pedido }], maxTokens: 6000 })).dados;
}

export async function gerarTextosPacote({ cliente, produtos, plataforma }) {
  const system = `Você prepara lojas para ${plataforma}.\n\n${REGRA_CRITICA(cliente)}\n\n${contextoCliente(cliente)}`;
  const pedido = `Produtos: ${produtos.map((p) => `${p.nome} (${p.categoria || 'sem categoria'})`).join(', ') || 'a definir'}.
Saída JSON: {"banners": [{"titulo","subtitulo","cta","uso" (ex.: "Banner principal desktop 1920x700")}], "briefingTema": {"estilo","paletaSugerida": [hex],"tipografia","secoesHome": [string],"observacoes"}, "textosPagina": {"sobre","faq": [{"p","r"}]}, "descricoesProdutos": [{"nome","descricao","seoTitulo","seoDescricao"}]}. ${SO_JSON}`;
  return (await gerarJSON({ system, messages: [{ role: 'user', content: pedido }], maxTokens: 10000 })).dados;
}
