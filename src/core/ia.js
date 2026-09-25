// Cliente de IA + prompts. Toda chamada passa pelo servidor (/api/claude), que guarda a chave.
// Toda função aqui tem um equivalente manual nos módulos (formulários "sem IA").
import { tokenAtual } from './auth.js';
import { IDIOMA_NOME, MODELO_DESCRICAO, CENAS_UNBOXING } from '../lib/constantes.js';
import { obterConfig } from '../modules/configuracoes.js';
import { verificarOrcamento, registrarUso } from '../modules/custo.js';

/**
 * Chamada única à IA (via servidor). O servidor escolhe o modelo pela `tarefa` (Haiku x Sonnet), aplica o limite de tokens
 * e o cache do bloco `estavel`. Aqui: confere o orçamento mensal antes e registra o consumo depois (gcc_uso_api).
 *  - tarefa: hooks | refino | checklist | imagem | criativos | campanha | referencias | analise | site | pacote | playbook
 *  - cliente: quem originou a chamada (para o custo por cliente); null em tarefas globais
 *  - estavel: texto que se repete entre chamadas do mesmo cliente (regras + perfil de marca) -> vai para o cache
 *  - system: instrução específica desta tarefa (muda a cada chamada, fica depois do cache)
 */
export async function chamarClaude({ tarefa, cliente = null, estavel, system, messages, webSearch = null, imagens = undefined }) {
  const cfg = await obterConfig();
  await verificarOrcamento(cliente, cfg); // exige confirmação manual se o orçamento do mês já estourou
  const token = await tokenAtual();
  let r;
  try {
    r = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // imagens: [{ media_type, data (base64) }] — só o diagnóstico usa (o servidor recusa nas demais tarefas).
      body: JSON.stringify({ tarefa, estavel, system, messages, maxTokens: cfg.limitesTokens?.[tarefa] || undefined, webSearch, imagens }),
    });
  } catch {
    throw new Error('Não consegui falar com o servidor de IA. Ele está rodando? Você pode usar a opção manual.');
  }
  const corpo = await r.json().catch(() => ({}));
  if (corpo.uso) registrarUso({ cliente, tarefa, uso: corpo.uso }); // até respostas cortadas consumiram tokens (grava em segundo plano)
  if (!r.ok) {
    if (!corpo.erro && [502, 503, 504].includes(r.status)) throw new Error('O servidor de IA não respondeu. Confirme que ele está rodando (npm run dev) ou use a opção manual.');
    throw new Error(corpo.erro || `Erro ${r.status} ao chamar a IA.`);
  }
  try { window.dispatchEvent(new Event('gcc:ia-ok')); } catch { /* fora do navegador */ } // o texto enviado já foi usado (ver core/salvamento.js)
  return corpo;
}

/**
 * Conserta os defeitos de JSON mais comuns em respostas de IA — principalmente texto copiado de anúncios reais:
 * aspas soltas dentro de um texto ("Compre "agora""), quebra de linha crua dentro de um texto e vírgula sobrando
 * antes de } ou ]. Uma aspa dentro de texto só é tratada como fim do texto se o próximo caractere útil for , : } ]
 * (ou o fim); senão vira \". Não inventa conteúdo: só troca caracteres de lugar/escape.
 */
export function repararJSON(texto) {
  const t = String(texto);
  let out = '', dentro = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (!dentro) { if (c === '"') dentro = true; out += c; continue; }
    if (c === '\\') { out += c + (t[i + 1] ?? ''); i++; continue; }
    if (c === '\n' || c === '\r') { if (c === '\n') out += '\\n'; continue; }
    if (c === '\t') { out += '\\t'; continue; }
    if (c === '"') {
      const prox = t.slice(i + 1).match(/^\s*(.)/s)?.[1];
      if (prox === undefined || ',:}]'.includes(prox)) { dentro = false; out += c; } else out += '\\"';
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** Primeiro valor JSON completo do texto ({...} ou [...]), contando chaves/colchetes fora de textos. */
function recortarJSON(limpo, i) {
  let prof = 0, dentro = false;
  for (let k = i; k < limpo.length; k++) {
    const c = limpo[k];
    if (dentro) { if (c === '\\') k++; else if (c === '"') dentro = false; continue; }
    if (c === '"') dentro = true;
    else if (c === '{' || c === '[') prof++;
    else if ((c === '}' || c === ']') && --prof === 0) return limpo.slice(i, k + 1);
  }
  return null;
}

/** Extrai JSON de uma resposta (tolera cercas ```json, texto em volta e os defeitos que repararJSON corrige). */
export function extrairJSON(texto) {
  const limpo = String(texto).replace(/```(?:json)?/gi, '');
  const i = limpo.search(/[[{]/);
  if (i < 0) throw new Error('A IA não devolveu dados estruturados. Tente de novo.');
  const fecha = limpo[i] === '{' ? '}' : ']';
  const candidatos = [limpo.slice(i, limpo.lastIndexOf(fecha) + 1), recortarJSON(limpo, i)].filter(Boolean);
  for (const c of candidatos) { try { return JSON.parse(c); } catch { /* tenta o próximo */ } }
  for (const c of candidatos) { try { return JSON.parse(repararJSON(c)); } catch { /* tenta o próximo */ } }
  // Depois do reparo as aspas mudam: recorta de novo a partir do texto já reparado.
  const reparado = repararJSON(limpo.slice(i));
  try { return JSON.parse(recortarJSON(reparado, 0) || reparado); }
  catch { throw new Error('A resposta da IA veio incompleta. Tente de novo com menos itens.'); }
}

async function gerarJSON(opts) {
  const r = await chamarClaude(opts);
  try { return { dados: extrairJSON(r.texto), fontes: r.fontes || [] }; }
  catch (e) {
    // Última tentativa, sem refazer o trabalho (ex.: a busca web de 2 min): o modelo leve só corrige a formatação.
    if (!String(r.texto || '').trim()) throw e;
    const fix = await chamarClaude({
      tarefa: 'reparo', cliente: opts.cliente || null,
      system: 'Você corrige JSON inválido. Devolva o MESMO conteúdo como JSON válido, sem mudar, resumir nem inventar nada. Escape aspas internas com \\". Sem texto antes ou depois, sem cercas de código.',
      messages: [{ role: 'user', content: String(r.texto).slice(0, 60000) }],
    });
    return { dados: extrairJSON(fix.texto), fontes: r.fontes || [] };
  }
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
4. Idioma: todo texto voltado ao PÚBLICO FINAL (hooks, copy, CTA, textos de loja) em ${IDIOMA_NOME[cliente.marca?.idioma] || IDIOMA_NOME['pt-BR']}. Análises, explicações, planos e checklists para o GESTOR, sempre em português do Brasil. As chaves dos JSONs pedidos NUNCA são traduzidas.
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
    c.angulosSugeridos?.length && `Ângulos que costumam funcionar nesse tipo de produto (playbook "${c.playbookNome || ''}"): ${c.angulosSugeridos.join('; ')}`,
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

/** Parte que se repete entre as chamadas do mesmo cliente: vai como bloco cacheado (mais barato nas chamadas seguintes). */
const estavelDe = (cliente) => `${REGRA_CRITICA(cliente)}\n\n${contextoCliente(cliente)}`;

/** Última instrução do pedido (a mais lembrada pelo modelo): o idioma dos textos vale mesmo que o briefing/perfil estejam em outro idioma. */
const idiomaLinha = (cliente) => `IDIOMA DOS TEXTOS (obrigatório): ${IDIOMA_NOME[cliente.marca?.idioma] || IDIOMA_NOME['pt-BR']}. Escreva TODO o conteúdo voltado ao público nesse idioma, mesmo que o briefing e o perfil estejam em outro (traduza e adapte, não traduza literalmente). As chaves do JSON ficam exatamente como pedido.`;

const SO_JSON = 'Responda APENAS com JSON válido, sem texto antes ou depois, sem cercas de código.';

// ---------- criativos ----------
/** Descrição estruturada do produto (aba Produtos), além do que já foi escrito no briefing — reforça preço/categoria. */
function contextoProduto(p) {
  if (!p) return '';
  return `\nPRODUTO SELECIONADO (dados exatos do catálogo — use-os, não invente outros): "${p.nome}"${p.categoria ? `, categoria ${p.categoria}` : ''}${p.preco ? `, preço R$ ${p.preco}` : ''}${p.precoPromocional ? ` (promocional R$ ${p.precoPromocional})` : ''}.${p.descricao ? ` Descrição: ${p.descricao}` : ''}`;
}

export async function gerarCriativos({ cliente, briefing, modelo, framework, formato, referencias, resultados, quantidade = 4, base, produto }) {
  const n = Math.min(5, Math.max(1, Number(quantidade) || 4));
  const system = `Você é um copywriter e estrategista de tráfego pago sênior. Cria anúncios que parecem conteúdo orgânico.${contextoReferencias(referencias)}${contextoResultados(resultados)}${contextoProduto(produto)}`;
  const pedido = [
    n === 1 ? 'Gere 1 variação de criativo.' : `Gere ${n} variações de criativo, cada uma com hook e ângulo diferentes.`,
    briefing && `Briefing: ${briefing}`,
    modelo && `Modelo de criativo: ${modelo.replace('_', ' ')} — ${MODELO_DESCRICAO[modelo] || ''}`,
    framework && framework !== 'livre' && `Framework de copy obrigatório: ${framework}`,
    formato && `Formato: ${formato}`,
    base && `Ponto de partida — anúncio de referência de mercado (adapte o ÂNGULO ao cliente, sem copiar o texto): ${base.titulo || ''}\n${base.texto || ''}\nAnálise: ${JSON.stringify(base.analise || {})}`,
    `Formato de saída: array JSON de objetos com: "nome" (legenda curta e descritiva), "hook" (primeira frase/3 primeiros segundos), "angulo" (ângulo/categoria em 1-3 palavras), "gatilho" (gatilho mental usado), "framework", "formato", "copy" (texto completo do anúncio ou roteiro cena a cena), "cta", "porque" (1-2 frases explicando a lógica da variação).`,
    idiomaLinha(cliente),
    SO_JSON,
  ].filter(Boolean).join('\n');
  const { dados } = await gerarJSON({ tarefa: 'criativos', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] });
  return (Array.isArray(dados) ? dados : dados.variacoes || []).map(normalizarCriativo);
}

function normalizarCriativo(c) {
  return {
    nome: c.nome || c.hook?.slice(0, 60) || 'Criativo', hook: c.hook || '', angulo: c.angulo || '', gatilho: c.gatilho || '',
    framework: c.framework || 'livre', formato: c.formato || 'video_curto', copy: c.copy || '', cta: c.cta || '', porque: c.porque || '',
  };
}

export async function refinarCriativo({ cliente, criativo, instrucao, conversa = [] }) {
  const system = 'Você refina criativos de anúncio mantendo tom orgânico.';
  const atual = JSON.stringify({ hook: criativo.hook, copy: criativo.copy, cta: criativo.cta, angulo: criativo.angulo, framework: criativo.framework });
  const msgs = [
    ...conversa,
    { role: 'user', content: `Criativo atual: ${atual}\n\nAjuste pedido: ${instrucao}\n\nDevolva o criativo COMPLETO já ajustado como objeto JSON com: "hook","copy","cta","angulo","gatilho","explicacao" (1-2 frases dizendo o que mudou). Mantenha o idioma do criativo atual (${IDIOMA_NOME[cliente.marca?.idioma] || IDIOMA_NOME['pt-BR']}), exceto se o ajuste pedir outro. ${SO_JSON}` },
  ];
  const { dados } = await gerarJSON({ tarefa: 'refino', cliente, estavel: estavelDe(cliente), system, messages: msgs });
  return dados;
}

// ---------- hooks ----------
export async function gerarHooks({ cliente, tema, categoria, quantidade = 8 }) {
  const system = 'Você cria hooks (ganchos de abertura) para anúncios.';
  const pedido = `Crie ${quantidade} hooks${categoria ? ` da categoria "${categoria}"` : ' de categorias variadas'}${tema ? ` sobre: ${tema}` : ''}. Cada um deve caber em 1-2 frases faladas. Saída: array JSON de {"texto","categoria"} com categoria em: dor, curiosidade, prova, resultado, erro_comum, contraintuitivo, pergunta. ${idiomaLinha(cliente)} ${SO_JSON}`;
  const { dados } = await gerarJSON({ tarefa: 'hooks', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] });
  return (Array.isArray(dados) ? dados : dados.hooks || []).filter((h) => h.texto);
}

// ---------- campanhas ----------
/** Resume os grupos de padroesLocais/padroesPorNicho (insights.js) pro prompt, só os 3 melhores de cada dimensão. */
function resumirPadroesCampanha(padroes) {
  if (!padroes) return '(nenhum)';
  const linhas = Object.entries(padroes).filter(([, l]) => l.length).map(([campo, l]) =>
    `${campo}: ` + l.slice(0, 3).map((g) => `${g.valor} (ROAS ${g.roasMedio?.toFixed(2) ?? 'n/d'}x, CPA ${g.cpaMedio?.toFixed(2) ?? 'n/d'}, ${g.amostras} amostra(s))`).join('; '));
  return linhas.length ? linhas.join('\n') : '(nenhum com amostra suficiente ainda)';
}
const temPadrao = (p) => !!p && Object.values(p).some((l) => l?.length);

/**
 * Bloco de contexto comum à geração e à discussão da estrutura: criativos aprovados, padrões de desempenho e referências.
 * Diz explicitamente QUAIS fontes de dado existem, para a IA não inventar justificativa quando não há base.
 */
function contextoCampanha({ cliente, criativosAprovados = [], padroesLocais, padroesNicho, referenciasFortes = [], qtdResultados = 0, resultadosPorCriativo = [] }) {
  const listaCriativos = criativosAprovados.map((c) => `- id "${c.id}": "${c.nome}" — ângulo ${c.angulo || 'n/d'}, framework ${c.framework || 'n/d'}, formato ${c.formato || 'n/d'}`).join('\n') || '(nenhum criativo aprovado ainda)';
  return `Estágio do cliente: ${cliente.estagio === 'rodando' ? 'RODANDO (já anuncia)' : 'NOVO (primeiro teste)'}.

CRIATIVOS APROVADOS DISPONÍVEIS (só estes podem ser usados, pelo id):
${listaCriativos}

FONTES DE DADO DISPONÍVEIS (use só estas; se uma está vazia, NÃO a cite como base):
- Histórico de resultado deste cliente: ${qtdResultados} registro(s) de resultado${temPadrao(padroesLocais) ? '' : ' — sem padrão calculável ainda (poucas amostras)'}.
- Padrão de outros clientes do mesmo nicho: ${temPadrao(padroesNicho) ? 'disponível (abaixo)' : 'NENHUM'}.
- Referências de mercado salvas com sinal forte: ${referenciasFortes.length}.

PADRÕES DE DESEMPENHO JÁ DETECTADOS (calculados sem IA, média ponderada pelo gasto; use para embasar, não invente outro padrão):
Deste cliente:
${resumirPadroesCampanha(padroesLocais)}
De clientes de nicho semelhante (sem identificar quem):
${resumirPadroesCampanha(padroesNicho)}

RESULTADOS BRUTOS DESTE CLIENTE POR CRIATIVO (somados pelo app; com poucos registros são INDÍCIO, não prova — cite-os assim, com o número de registros):
${resultadosPorCriativo.map((r) => `- "${r.nome}": ${r.registros} registro(s), gasto R$ ${r.gasto.toFixed(2)}, CPA ${r.cpa != null ? "R$ " + r.cpa.toFixed(2) : "n/d"}, ROAS ${r.roas != null ? r.roas.toFixed(2) + 'x' : 'n/d'}`).join('\n') || '(nenhum)'}

Referências de mercado de sinal forte: ${referenciasFortes.map((r) => `"${r.titulo || 'referência'}" (ângulo ${r.analise?.angulo || 'n/d'})`).join('; ') || '(nenhuma)'}.`;
}

/** Formato JSON da estrutura (igual na geração e no ajuste pelo chat). */
const FORMATO_ESTRUTURA = `{"resumo": string,
 "conjuntos": [{"nome": string, "publico": {"nome","descricao","tipo"}, "orcamentoDiario": number, "objetivo": string (o que este conjunto testa/entrega), "criativos": [{"criativoId","criativoNome","motivo"}]}],
 "orcamento": {"diario": number, "distribuicao": string},
 "estruturaTeste": {"campanhas": number, "conjuntos": string, "criativosPorConjunto": string, "duracaoDias": number, "criterioDecisao": string},
 "raciocinio": {
   "quantidadeConjuntos": string (por que ESSA quantidade de conjuntos, nem mais nem menos, para o estágio e orçamento deste cliente),
   "publicos": [{"conjunto": string, "porque": string, "base": "historico_cliente" | "nicho" | "referencia" | "sem_dados"}] (um por conjunto; "porque" cita o dado exato em que se baseou),
   "divisaoOrcamento": string (por que essa divisão e não uma divisão igual — ou, se for igual, por quê),
   "objetivoEstrutura": string (o que esta estrutura tenta provar ou resolver),
   "dadosInsuficientes": [string] (cada decisão tomada SEM dado suficiente, dita com franqueza; [] se não houver)
 },
 "checklistMeta": [string], "avisoCriativos": string|null}`;

const REGRAS_ESTRUTURA = `REGRAS DA ESTRUTURA:
- Cada criativo escolhido vai DENTRO do conjunto em que será usado, com "motivo" de 1 frase citando o dado real (ex.: "ROAS médio 4.2x neste cliente", "ângulo comprovado em clientes do nicho", ou "sem dado de performance ainda — escolhido por ser o único de formato vídeo"). O mesmo criativo pode aparecer em mais de um conjunto.
- A soma de "orcamentoDiario" dos conjuntos deve bater com "orcamento.diario".
- O id de um criativo só vai no campo "criativoId". Em TODO texto (resposta, motivo, raciocínio, checklist) cite o criativo pelo NOME entre aspas, nunca pelo id.
- HONESTIDADE: quando não houver dado para uma decisão, diga isso claramente no raciocínio (ex.: "orçamento dividido igualmente porque ainda não há dado de performance deste cliente para pesar a divisão de outro jeito") e use "base": "sem_dados". Nunca cite histórico, nicho ou referência que não esteja nas fontes disponíveis.
- Se NÃO houver criativos aprovados suficientes (menos de 1 por conjunto), não force uma escolha fraca: deixe o conjunto só com os que valem a pena e explique em "avisoCriativos" o que falta produzir (ângulo/formato). Senão, "avisoCriativos" é null.
- "checklistMeta" = passos práticos, na ordem, para configurar no Gerenciador de Anúncios do Meta ESTA estrutura (nome e orçamento de cada conjunto, público, criativos de cada um).
- Textos em português do Brasil (é para o gestor de tráfego). Use EXATAMENTE as chaves JSON pedidas, sem traduzi-las.`;

/**
 * `criativosAprovados` = criativos com status aprovado/em_uso/pausado (id/nome/angulo/framework/formato).
 * `padroesLocais`/`padroesNicho` vêm do motor de Insights (insights.js) — a IA só interpreta esses números.
 * `qtdResultados` = quantos resultados o cliente tem registrados (para a IA saber se há histórico de verdade).
 */
export async function gerarEstruturaCampanha({ cliente, criativos = [], criativosAprovados = [], objetivo, orcamentoDiario, padroesLocais, padroesNicho, referenciasFortes = [], qtdResultados = 0, resultadosPorCriativo = [] }) {
  const system = 'Você é gestor de tráfego Meta Ads sênior. Estrutura testes enxutos e realistas, escolhe os criativos certos pra cada conjunto com base em dados reais — nunca por preferência estética — e explica cada decisão com franqueza, admitindo quando não há dado.';
  const pedido = `Monte a estrutura de campanha ${cliente.estagio === 'rodando' ? 'de ESCALA/otimização usando o histórico do cliente' : 'de PRIMEIRO TESTE (cliente novo, sem histórico)'}.
Objetivo: ${objetivo || 'vendas'}. Orçamento diário disponível: ${orcamentoDiario ? 'R$ ' + orcamentoDiario : 'não informado — sugira uma faixa coerente e diga que é estimativa'}.
Criativos existentes (contexto geral): ${criativos.map((c) => `"${c.nome}" (ângulo ${c.angulo || 'n/d'})`).join('; ') || 'nenhum ainda — indique quantos e quais ângulos produzir'}.

${contextoCampanha({ cliente, criativosAprovados, padroesLocais, padroesNicho, referenciasFortes, qtdResultados, resultadosPorCriativo })}

${REGRAS_ESTRUTURA}

Saída em JSON: ${FORMATO_ESTRUTURA}
${SO_JSON}`;
  const { dados } = await gerarJSON({ tarefa: 'campanha', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] });
  return normalizarCampanha(dados);
}

/** Estrutura atual do rascunho em forma compacta para mandar de volta à IA na discussão. */
function estruturaParaPrompt(c) {
  return JSON.stringify({
    resumo: c.resumo, orcamento: { diario: c.orcamentoDiario, distribuicao: c.orcamentoNota }, estruturaTeste: c.estruturaTeste,
    conjuntos: (c.conjuntos || []).map((k) => ({ nome: k.nome, publico: k.publico, orcamentoDiario: k.orcamentoDiario, objetivo: k.objetivo, criativos: k.criativos })),
    raciocinio: c.raciocinio, checklistMeta: c.checklistMeta, avisoCriativos: c.avisoCriativos,
  });
}

/**
 * Chat "Discutir esta estrutura": a IA ou só explica (tipo "explicacao", estrutura null) ou devolve a estrutura
 * COMPLETA ajustada (tipo "ajuste"). `conversa` = [{ role: 'user'|'assistant', content }] das mensagens anteriores.
 */
export async function discutirEstruturaCampanha({ cliente, campanha, mensagem, conversa = [], criativosAprovados = [], padroesLocais, padroesNicho, referenciasFortes = [], qtdResultados = 0, resultadosPorCriativo = [] }) {
  const system = 'Você é gestor de tráfego Meta Ads sênior discutindo com o gestor uma estrutura de campanha em RASCUNHO. Responda com franqueza e com base nos dados; se o pedido for uma má ideia para o orçamento/estágio, diga, mas faça o que foi pedido quando for um ajuste explícito.';
  const historico = conversa.slice(-12).map((t) => `${t.role === 'user' ? 'GESTOR' : 'VOCÊ'}: ${t.content}`).join('\n') || '(início da conversa)';
  const pedido = `${contextoCampanha({ cliente, criativosAprovados, padroesLocais, padroesNicho, referenciasFortes, qtdResultados, resultadosPorCriativo })}

ESTRUTURA ATUAL DO RASCUNHO (versão ${campanha.versaoRascunho || 1}):
${estruturaParaPrompt(campanha)}

CONVERSA ATÉ AGORA:
${historico}

NOVA MENSAGEM DO GESTOR: ${mensagem}

Decida:
- Se é só pergunta/pedido de explicação ("por quê...?", "vale a pena...?"): responda e NÃO mude nada → "tipo": "explicacao", "estrutura": null.
- Se pede mudança (trocar criativo, mudar público, orçamento, número de conjuntos...): aplique e devolva a estrutura COMPLETA nova (não só o trecho), com o raciocínio e o checklist atualizados → "tipo": "ajuste". Na "resposta", diga em 1-3 frases o que mudou e o impacto esperado.

${REGRAS_ESTRUTURA}

Saída em JSON: {"tipo": "explicacao" | "ajuste", "resposta": string, "estrutura": ${FORMATO_ESTRUTURA} | null}
${SO_JSON}`;
  const { dados } = await gerarJSON({ tarefa: 'discussao_campanha', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] });
  return normalizarDiscussao(dados);
}

/** Resposta do chat: só vira "ajuste" se trouxer de fato uma estrutura com conjuntos (senão é tratada como explicação). */
export function normalizarDiscussao(d = {}) {
  const resposta = String(pegar(d, 'resposta', 'respuesta', 'explicacao', 'mensagem') || '').trim() || 'Sem resposta em texto.';
  const bruta = d.estrutura || d.estructura || null;
  const estrutura = bruta && typeof bruta === 'object' ? normalizarCampanha(bruta) : null;
  const ajuste = String(d.tipo || '').toLowerCase().startsWith('ajuste') && estrutura && estrutura.conjuntos.length > 0;
  return { tipo: ajuste ? 'ajuste' : 'explicacao', resposta, estrutura: ajuste ? estrutura : null };
}

/** Aceita variações comuns de chave (o modelo às vezes escreve "nombre"/"name") e garante a forma que o app espera. */
const pegar = (o, ...chaves) => { for (const k of chaves) if (o?.[k] != null && o[k] !== '') return o[k]; return ''; };
const numero = (v) => { const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const lista = (v) => (Array.isArray(v) ? v : []);
const BASES = ['historico_cliente', 'nicho', 'referencia', 'sem_dados'];

export function normalizarCampanha(d = {}) {
  const t = d.estruturaTeste || d.estructuraTest || d.estrutura_teste || {};
  const orc = d.orcamento || d.presupuesto || {};
  const diario = orc.diario ?? null;
  const normCriativo = (s) => ({ criativoId: String(pegar(s, 'criativoId', 'creativoId', 'id')), criativoNome: pegar(s, 'criativoNome', 'creativoNome', 'nome'), motivo: pegar(s, 'motivo', 'justificativa', 'razon') });
  const normPublico = (p) => ({ nome: pegar(p, 'nome', 'nombre', 'name', 'titulo'), descricao: pegar(p, 'descricao', 'descripcion', 'descripción', 'description'), tipo: pegar(p, 'tipo', 'type') });

  let conjuntos = lista(d.conjuntos || d.conjuntosAnuncio || d.adsets).map((k, i) => {
    const pub = typeof k.publico === 'string' ? { nome: k.publico } : (k.publico || k.público || k.audiencia || {});
    return {
      nome: pegar(k, 'nome', 'nombre', 'name') || `Conjunto ${i + 1}`,
      publico: normPublico(pub),
      orcamentoDiario: numero(pegar(k, 'orcamentoDiario', 'presupuestoDiario', 'orcamento')),
      objetivo: pegar(k, 'objetivo', 'objetivoTeste', 'meta'),
      criativos: lista(k.criativos || k.creativos).map(normCriativo).filter((s) => s.criativoId),
    };
  });
  // Divisão do orçamento: conjunto sem valor recebe a parte igual do que sobrou (marcado para a tela avisar).
  const semValor = conjuntos.filter((k) => k.orcamentoDiario == null);
  const total = numero(diario);
  if (semValor.length && total) {
    const resto = Math.max(0, total - conjuntos.reduce((s, k) => s + (k.orcamentoDiario || 0), 0));
    const parte = Math.round((resto / semValor.length) * 100) / 100;
    semValor.forEach((k) => { k.orcamentoDiario = parte || null; k.orcamentoEstimado = true; });
  }

  // Formato antigo (sem conjuntos): mantém públicos e seleção soltos, como antes.
  const selecaoSolta = lista(d.selecaoCriativos || d.seleccionCreativos).map(normCriativo).filter((s) => s.criativoId);
  const publicosSoltos = lista(d.publicos || d.públicos || d.audiencias).map(normPublico).filter((p) => p.nome);

  // Seleção plana (usada no detalhe/checklist antigos): um item por criativo, juntando os motivos de cada conjunto.
  const selecao = [];
  conjuntos.forEach((k) => k.criativos.forEach((s) => {
    const ja = selecao.find((x) => x.criativoId === s.criativoId);
    if (!ja) selecao.push({ ...s });
    else if (s.motivo && !ja.motivo.includes(s.motivo)) ja.motivo = `${ja.motivo} · ${s.motivo}`;
  }));

  const r = d.raciocinio || d.razonamiento || {};
  return {
    resumo: pegar(d, 'resumo', 'resumen', 'summary'),
    conjuntos,
    publicos: conjuntos.length ? conjuntos.map((k) => k.publico).filter((p) => p.nome) : publicosSoltos,
    orcamento: { diario, distribuicao: pegar(orc, 'distribuicao', 'distribucion', 'distribución') },
    estruturaTeste: { campanhas: pegar(t, 'campanhas', 'campañas'), conjuntos: pegar(t, 'conjuntos'), criativosPorConjunto: pegar(t, 'criativosPorConjunto', 'creativosPorConjunto'), duracaoDias: pegar(t, 'duracaoDias', 'duracionDias', 'duracion'), criterioDecisao: pegar(t, 'criterioDecisao', 'criterioDecision', 'criterio') },
    raciocinio: {
      quantidadeConjuntos: pegar(r, 'quantidadeConjuntos', 'cantidadConjuntos', 'quantidade'),
      publicos: lista(r.publicos || r.públicos).map((p) => ({ conjunto: pegar(p, 'conjunto', 'nome'), porque: pegar(p, 'porque', 'motivo', 'razon'), base: BASES.includes(p.base) ? p.base : 'sem_dados' })).filter((p) => p.porque),
      divisaoOrcamento: pegar(r, 'divisaoOrcamento', 'divisionPresupuesto', 'orcamento'),
      objetivoEstrutura: pegar(r, 'objetivoEstrutura', 'objetivo', 'prova'),
      dadosInsuficientes: lista(r.dadosInsuficientes || r.datosInsuficientes).map(String).filter(Boolean),
    },
    checklistMeta: lista(d.checklistMeta || d.checklist),
    selecaoCriativos: conjuntos.length ? selecao : selecaoSolta,
    avisoCriativos: pegar(d, 'avisoCriativos', 'avisoCreativos') || null,
  };
}

// ---------- referências ----------
export async function buscarReferencias({ cliente, diasMinimos, quantidade = 5 }) {
  const system = `Você pesquisa anúncios reais de empresas de destaque num nicho e os analisa estrategicamente. Você NUNCA inventa anúncios, links ou datas: só inclui o que encontrou na pesquisa.`;
  const pedido = `Nicho do cliente: ${cliente.nicho}. Idioma/mercado: ${IDIOMA_NOME[cliente.marca?.idioma] || 'pt-BR'}.
Pesquise na web com VÁRIAS buscas diferentes (marcas líderes do nicho, "Biblioteca de Anúncios Meta <marca>" em facebook.com/ads/library, páginas de anúncio e landing pages) e traga até ${quantidade} exemplos de anúncios de empresas de destaque nesse nicho, priorizando anúncios ATIVOS e os que estão no ar há pelo menos ${diasMinimos} dias.
Se não conseguir CONFIRMAR que o anúncio está ativo ou há quanto tempo, inclua mesmo assim o melhor candidato REAL que encontrou, com "diasNoAr": null, e explique em "evidencia" o que foi e o que não foi confirmado. Devolva [] somente se não encontrou nenhuma empresa ou anúncio real e relevante.
Para cada um: "titulo" (descrição curta), "empresa", "link" (URL real encontrada), "texto" (copy do anúncio, se visível), "diasNoAr" (número SE a fonte mostra data de início; senão null — nunca estime), "evidencia" (de onde veio a informação de dias/atividade), e "analise": {"angulo","framework" (AIDA/PAS/4Us/HRR/outro), "formato", "publico", "replicar" (o que vale replicar para o cliente, sem copiar)}.
Se a Biblioteca não for acessível pela busca, use outras fontes e diga isso em "evidencia". Nunca invente links ou datas. Saída: array JSON. Escreva a análise em português do Brasil; o texto do anúncio ("texto") fica no idioma original. Use EXATAMENTE as chaves pedidas. ${SO_JSON}`;
  const { dados, fontes } = await gerarJSON({
    tarefa: 'referencias', cliente, system, messages: [{ role: 'user', content: pedido }], webSearch: { maxUses: 8 },
  });
  // Aceita array direto ou um objeto com o array dentro (o modelo às vezes embrulha a resposta).
  const itens = Array.isArray(dados) ? dados : (dados && Object.values(dados).find(Array.isArray)) || [];
  return { itens, fontes };
}

export async function analisarReferencia({ cliente, ref }) {
  const system = 'Você é estrategista de mídia paga e analisa anúncios de concorrentes.';
  const pedido = `Analise este anúncio de mercado:\nTítulo: ${ref.titulo || ''}\nTexto: ${ref.texto || ''}\nLink: ${ref.link || ''}\nSaída JSON: {"angulo": string (ângulo/gatilho), "framework": string (framework de copy identificável), "formato": string, "publico": string (público provável), "replicar": string (o que replicar para ${cliente.nome} sem copiar)}. Escreva em português do Brasil e use EXATAMENTE essas chaves. ${SO_JSON}`;
  return (await gerarJSON({ tarefa: 'analise', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] })).dados;
}

/** Campos de texto que o modelo às vezes devolve como lista de parágrafos viram um texto só (senão aparecem com vírgulas coladas). */
export function textoPlano(d) {
  const junta = (v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.join('\n\n') : v);
  if (!d || typeof d !== 'object') return d;
  const out = { ...d };
  for (const k of ['heroTitulo', 'heroSubtitulo', 'heroCta', 'storytelling', 'newsletterTitulo', 'newsletterTexto']) out[k] = junta(out[k]);
  if (out.politicas && typeof out.politicas === 'object') out.politicas = Object.fromEntries(Object.entries(out.politicas).map(([k, v]) => [k, junta(v)]));
  return out;
}

// ---------- site / loja ----------
export async function gerarConteudoSite({ cliente, produtos }) {
  const system = 'Você é copywriter de e-commerce.';
  const pedido = `Escreva o conteúdo da loja. Produtos: ${produtos.map((p) => p.nome).join(', ') || 'a definir'}.
Saída JSON: {"heroTitulo","heroSubtitulo","heroCta","storytelling" (2 parágrafos curtos sobre a marca, usando só fatos do perfil), "depoimentos": [{"nome","texto"}] (3 MODELOS de depoimento com nomes genéricos como "Cliente", para serem substituídos por reais — não invente nomes de pessoas reais),"newsletterTitulo","newsletterTexto","politicas": {"trocas","envio","privacidade"} (textos-base curtos, marcados para revisão jurídica),"bannersPromo": [{"titulo","subtitulo"}], "faq": [{"p","r"}] (${INSTRUCAO_FAQ(cliente)})}. ${idiomaLinha(cliente)} ${SO_JSON}`;
  const d = (await gerarJSON({ tarefa: 'site', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] })).dados;
  return { ...textoPlano(d), faq: objecoesDe(cliente).length ? normalizarFaq(d?.faq) : [] };
}

// ---------- FAQ do site (a partir das objeções do perfil de marca) ----------
/** Objeções cadastradas no perfil de marca, uma por linha (ou separadas por ;). */
export const objecoesDe = (cliente) => String(cliente?.marca?.objecoes || '').split(/[\n;]+/).map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);
const INSTRUCAO_FAQ = (cliente) => (objecoesDe(cliente).length
  ? `perguntas frequentes: UMA por objeção de venda do perfil (${objecoesDe(cliente).map((o) => `"${o}"`).join('; ')}), escrita como o cliente final perguntaria, e a resposta curta e honesta usando SÓ fatos do perfil de marca, dos produtos e das políticas — sem inventar prazo, garantia ou número; se faltar o fato, responda de forma geral e sugira falar no WhatsApp`
  : 'o perfil não tem objeções cadastradas: devolva []');
/** Aceita {p,r} ou {pergunta,resposta}; descarta itens incompletos. */
export const normalizarFaq = (faq) => (Array.isArray(faq) ? faq : []).map((f) => ({ p: String(f?.p || f?.pergunta || '').trim(), r: String(f?.r || f?.resposta || '').trim() })).filter((f) => f.p && f.r);

/** Só a FAQ (sem reescrever o resto do conteúdo do site). Sem objeções no perfil: [] sem chamar a IA. */
export async function gerarFaqSite({ cliente, produtos = [], politicas = {} }) {
  if (!objecoesDe(cliente).length) return [];
  const system = 'Você escreve a seção de perguntas frequentes de lojas online.';
  const pedido = `Produtos: ${produtos.map((p) => `${p.nome}${p.preco ? ' (R$ ' + p.preco + ')' : ''}`).join(', ') || 'a definir'}.
Políticas da loja: trocas: ${politicas.trocas || 'não informada'}; envio: ${politicas.envio || 'não informada'}.
Escreva as ${INSTRUCAO_FAQ(cliente)}.
Saída: array JSON de {"p","r"}. ${idiomaLinha(cliente)} ${SO_JSON}`;
  const { dados } = await gerarJSON({ tarefa: 'faq', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] });
  return normalizarFaq(Array.isArray(dados) ? dados : dados?.faq);
}

export async function gerarTextosPacote({ cliente, produtos, plataforma }) {
  const system = `Você prepara lojas para ${plataforma}.`;
  const pedido = `Produtos: ${produtos.map((p) => `${p.nome} (${p.categoria || 'sem categoria'})`).join(', ') || 'a definir'}.
Saída JSON: {"banners": [{"titulo","subtitulo","cta","uso" (ex.: "Banner principal desktop 1920x700")}], "briefingTema": {"estilo","paletaSugerida": [hex],"tipografia","secoesHome": [string],"observacoes"}, "textosPagina": {"sobre","faq": [{"p","r"}]}, "descricoesProdutos": [{"nome","descricao","seoTitulo","seoDescricao"}]}. ${idiomaLinha(cliente)} ${SO_JSON}`;
  return (await gerarJSON({ tarefa: 'pacote', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] })).dados;
}

// ---------- playbooks ----------
export async function gerarPlaybook({ tipoProduto, idioma = 'pt-BR' }) {
  const cliente = { marca: { idioma, termosProibidos: '' } };
  const system = `Você é estrategista de tráfego pago e monta playbooks: a sequência de ângulos e hooks que costuma funcionar para um tipo de produto.

${REGRA_CRITICA(cliente)}`;
  const pedido = `Tipo de produto/nicho: ${tipoProduto}.
Monte um playbook com 5 a 6 ângulos, do que mais costuma funcionar para o que costuma funcionar menos, e 3 hooks nativos/orgânicos por ângulo (1-2 frases faladas cada).
Saída JSON: {"nome": string, "angulos": [{"angulo": string, "hooks": [string]}], "notas": string (2-3 frases: quando usar, cuidados do nicho)}. ${SO_JSON}`;
  return (await gerarJSON({ tarefa: 'playbook', system, messages: [{ role: 'user', content: pedido }] })).dados;
}

// ---------- prompts para geradores de imagem e vídeo (Haiku) ----------
/**
 * O Claude não gera imagem nem vídeo: aqui ele escreve os PROMPTS para você colar num gerador (Gemini, ChatGPT, Ideogram, Veo, Runway, Kling...).
 * modelo: 'roteiro' (segue as cenas do criativo) ou 'unboxing' (UGC: 6 cenas de 5 s, com legenda e dica de filmagem por cena).
 * Devolve { foto, fotoPt, cenas: [string], cenasPt: [string], legendas: [string], filmagem: [string], dicas }. Os prompts são em inglês (os geradores entendem muito melhor) e vêm com a
 * tradução em português para a pessoa conferir o que está colando. Sem texto dentro da imagem.
 */
export async function sugerirPromptsVisuais({ cliente, criativo, modelo = 'roteiro' }) {
  const unboxing = modelo === 'unboxing';
  const system = 'Você é diretor de arte de anúncios para redes sociais. Escreve prompts objetivos e visuais para geradores de imagem e de vídeo por IA.';
  const pedido = `Cliente: ${cliente.nome} (${cliente.nicho || 'e-commerce'}). Tom de voz: ${cliente.marca?.tomDeVoz || 'natural'}.
Criativo:
Hook: ${criativo.hook}
Copy/roteiro: ${criativo.copy}
CTA: ${criativo.cta}
Formato: ${criativo.formato}

Escreva:
1) "foto": UM prompt para gerar a foto estática do anúncio (vertical 4:5), em inglês, com produto, cenário, luz, enquadramento, estilo orgânico de redes sociais (não pareça banco de imagens). NÃO peça texto, letras nem logotipos dentro da imagem (o texto é colocado depois).
2) "cenas": ${unboxing ? `exatamente 6 prompts de vídeo (imagem para vídeo, 5 s cada) no modelo UNBOXING + MANUSEIO, estilo UGC gravado com celular na mão, luz natural, vertical 9:16, sem texto na tela, nesta ordem: ${CENAS_UNBOXING.map((n, i) => `${i + 1} ${n}`).join('; ')}. Baseie o gancho no hook e a última cena no CTA do criativo; nas cenas de manuseio e detalhe, descreva o que faz sentido para ESTE produto (textura, caimento, elasticidade, costura, material, tamanho). Mantenha a mesma pessoa e o mesmo produto em todas as cenas.` : 'um prompt de vídeo por cena do roteiro (na ordem; se não houver cenas, crie de 3 a 5 cenas curtas de 3 a 6 s), em inglês, vertical 9:16, descrevendo ação, câmera e luz. Sem texto na tela.'}
3) "dicas": 2 a 3 frases em português do Brasil sobre como usar (ex.: enviar a foto real do produto como referência ao gerador, manter o mesmo personagem entre as cenas).
4) Para cada prompt (foto e cada cena), inclua também a TRADUÇÃO fiel em português do Brasil ("fotoPt" e "cenasPt", mesma ordem e quantidade de "cenas"), para o gestor entender o que vai colar.
${unboxing ? `5) "legendas": uma legenda curta por cena (até 60 caracteres, em português do Brasil, para aparecer na tela). NÃO invente depoimentos, resultados, avaliações, preços nem promessas que não estejam no criativo.
6) "filmagem": uma dica de 1 frase, em português, de como FILMAR essa cena de verdade com o celular (ângulo, mãos, luz), na mesma ordem.` : ''}
Saída JSON: {"foto": string, "fotoPt": string, "cenas": [string], "cenasPt": [string], "dicas": string${unboxing ? ', "legendas": [string], "filmagem": [string]' : ''}}. ${SO_JSON}`;
  const d = (await gerarJSON({ tarefa: 'imagem', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] })).dados;
  const lista = (v) => (Array.isArray(v) ? v.map(String) : []);
  return { foto: String(d.foto || ''), fotoPt: String(d.fotoPt || ''), cenas: lista(d.cenas), cenasPt: lista(d.cenasPt), legendas: lista(d.legendas), filmagem: lista(d.filmagem), dicas: String(d.dicas || '') };
}

// ---------- insights (explica em texto os padrões já calculados localmente, sem inventar números novos) ----------
/**
 * A IA NÃO calcula o padrão (isso é feito sem IA, em insights.js, direto dos números) — ela só lê os grupos já
 * prontos (ângulo/framework/formato com ROAS/CPA médio e nº de amostras) e escreve uma explicação curta e
 * recomendações acionáveis. `padroesNicho` (opcional) já vem sem nenhuma identificação de outro cliente.
 */
export async function explicarInsights({ cliente, padroes, padroesNicho }) {
  const system = 'Você é um estrategista de mídia paga que interpreta dados de performance e sugere próximos passos claros e realistas. Nunca invente números que não estejam nos dados fornecidos.';
  const resumirGrupos = (p) => Object.entries(p || {}).filter(([, l]) => l.length).map(([campo, l]) =>
    `${campo}: ` + l.slice(0, 5).map((g) => `${g.valor} (ROAS ${g.roasMedio?.toFixed(2) ?? 'n/d'}x, CPA ${g.cpaMedio?.toFixed(2) ?? 'n/d'}, ${g.amostras} amostra(s))`).join('; ')).join('\n');
  const pedido = `Padrões deste cliente (já calculados, média ponderada pelo gasto):\n${resumirGrupos(padroes) || '(nenhum com amostra suficiente)'}
${padroesNicho ? `\nPadrões agregados de OUTROS clientes do mesmo nicho (${cliente.nicho}), sem identificar quem são:\n${resumirGrupos(padroesNicho) || '(nenhum com amostra suficiente)'}` : ''}
Explique em português do Brasil, de forma curta e direta, o que esses números sugerem e o que testar a seguir para ${cliente.nome}. Use só os dados acima — não invente ângulos, frameworks nem números novos. Se os dados forem poucos, diga isso e sugira registrar mais resultados.
Saída JSON: {"resumo": string (2-4 frases), "recomendacoes": [string] (1 a 3 ações práticas)}. ${SO_JSON}`;
  return (await gerarJSON({ tarefa: 'insights', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] })).dados;
}

// ---------- diagnóstico de campanha já rodando ----------
/**
 * Cruza o que o gestor informou sobre a campanha em curso com os padrões já detectados pelo motor de Insights
 * (próprio cliente e clientes de nicho semelhante) e as referências de mercado de sinal forte. A IA NÃO calcula
 * padrão novo — só interpreta o que já foi calculado localmente (ver insights.js) e o que o gestor descreveu.
 * `imagens` (opcional): prints do painel de métricas e/ou peças no ar, [{ media_type, data }] na ordem em que o
 * gestor enviou. Cada conclusão volta com "fonte" para a tela separar o que veio da imagem do que veio dos dados.
 */
export async function diagnosticarCampanha({ cliente, dados, padroesLocais, padroesNicho, referenciasFortes = [], imagens = [] }) {
  const system = 'Você é estrategista de tráfego pago sênior, cético e direto: só recomenda o que os dados sustentam, nunca acha bonito nem invade terreno de opinião sem base.';
  const resumirGrupos = (p) => Object.entries(p || {}).filter(([, l]) => l.length).map(([campo, l]) =>
    `${campo}: ` + l.slice(0, 4).map((g) => `${g.valor} (ROAS ${g.roasMedio?.toFixed(2) ?? 'n/d'}x, CPA ${g.cpaMedio?.toFixed(2) ?? 'n/d'}, ${g.amostras} amostra(s))`).join('; ')).join('\n') || '(nenhum com amostra suficiente)';
  const pedido = `O que o gestor informou sobre a campanha ATUALMENTE no ar:
Plataforma: ${dados.plataforma || 'não informada'}
Públicos usados: ${dados.publicos || 'não informado'}
Orçamento diário atual: ${dados.orcamentoDiario ? 'R$ ' + dados.orcamentoDiario : 'não informado'}
CPA atual: ${dados.cpaAtual ? 'R$ ' + dados.cpaAtual : 'não informado'}
ROAS atual: ${dados.roasAtual || 'não informado'}
Criativos que já estão rodando (ângulo, formato, tempo no ar): ${dados.criativosRodando || 'não informado'}
Ofertas/promoções ativas: ${dados.ofertas || 'não informado'}

PADRÕES JÁ DETECTADOS (calculados sem IA, direto dos resultados registrados — média ponderada pelo gasto; USE para embasar, não invente outro padrão):
Deste cliente:
${resumirGrupos(padroesLocais)}
De clientes de nicho semelhante (sem identificar quem):
${resumirGrupos(padroesNicho)}

Referências de mercado salvas de sinal forte: ${referenciasFortes.map((r) => `"${r.titulo || 'referência'}" (ângulo ${r.analise?.angulo || 'n/d'}, framework ${r.analise?.framework || 'n/d'})`).join('; ') || '(nenhuma)'}.

${imagens.length ? `IMAGENS ANEXADAS: ${imagens.length} imagem(ns), numeradas na ordem em que aparecem (imagem 1 = a primeira). Podem ser prints do painel de métricas da plataforma (ex.: Gerenciador de Anúncios do Meta) e/ou peças de criativo que estão no ar. Use-as como evidência ADICIONAL:
- Em prints de métricas: leia só o que está visível (CPM, frequência, CTR e se está caindo, CPC, custo por resultado, ROAS, gasto) e procure sinais de fadiga (frequência alta com CTR caindo, CPM subindo). Se um número da imagem contradisser um dado digitado, aponte o conflito.
- Em peças de criativo: poluição visual, CTA pouco visível, texto cortado, contraste ruim, excesso de texto, legibilidade no celular.
- Se a imagem estiver ilegível (borrada, pequena, cortada) ou não tiver relação com métricas/criativo (foto aleatória, print de outra coisa), marque isso e NÃO tire conclusão dela. Nunca invente um número que não aparece na imagem.
Preencha "imagens" com UM item por imagem: {"numero": 1, "tipo": "metricas" | "criativo" | "ilegivel" | "sem_relacao", "leitura": "o que você leu nela, ou por que não dá para usar"}.

` : ''}Gere um diagnóstico. Cada item de "funcionandoBem", "desperdicio" e "recomendacoes" precisa vir com:
- "fonte": "dados" (digitado pelo gestor), ${imagens.length ? '"imagem" (lido em uma imagem anexada — informe também "imagem": o número dela), ' : ''}"padrao" (padrão deste cliente ou do nicho) ou "referencia" (referência de mercado);
- "origem": a citação em texto (ex.: "dado informado pelo gestor", ${imagens.length ? '"imagem 2 — print de métricas", ' : ''}"padrão de clientes do nicho", ou o nome de uma referência).
NÃO invente números que não estejam nos dados acima${imagens.length ? ' ou visíveis nas imagens' : ''}. Se faltar informação para concluir algo, diga isso em vez de adivinhar.
Saída em JSON: {${imagens.length ? '"imagens": [{"numero","tipo","leitura"}], ' : ''}"funcionandoBem": [{"texto","fonte","origem"${imagens.length ? ',"imagem"' : ''}}], "desperdicio": [{"texto","fonte","origem"${imagens.length ? ',"imagem"' : ''}}], "recomendacoes": [{"texto","fonte","origem","prioridade"${imagens.length ? ',"imagem"' : ''}}]} — "recomendacoes" com 3 a 5 itens, "prioridade" em: alta, media, baixa. Escreva em português do Brasil. ${SO_JSON}`;
  return (await gerarJSON({
    tarefa: 'diagnostico', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }],
    imagens: imagens.length ? imagens.map(({ media_type, data }) => ({ media_type, data })) : undefined,
  })).dados;
}

// ---------- checklist de qualidade (Haiku: tarefa curta e barata) ----------
/** Sugere as respostas do checklist de qualidade. A pessoa revisa e aplica; o checklist manual continua valendo. */
export async function checarQualidade({ cliente, criativo, perguntas }) {
  const system = 'Você revisa criativos de anúncio com olhar crítico e honesto. Se algo estiver fraco, diga que não passa.';
  const pedido = `Criativo:\nHook: ${criativo.hook}\nCopy: ${criativo.copy}\nCTA: ${criativo.cta}\nFramework: ${criativo.framework || 'livre'}\n\nResponda cada pergunta com true (sim, passa) ou false, e uma razão curta (máx. 15 palavras):\n${perguntas.map(([k, q]) => `- "${k}": ${q}`).join('\n')}
Saída JSON: um objeto cujas chaves são exatamente as acima e cada valor é {"ok": boolean, "motivo": string}. ${SO_JSON}`;
  return (await gerarJSON({ tarefa: 'checklist', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] })).dados;
}

// ---------- roteiro de narração (Estúdio > Narração) ----------
/**
 * Escreve a FALA de cada cena da linha do tempo do vídeo (mesma ordem e quantidade), com tom e ritmo, cabendo no
 * tempo de cada cena. Equivalente sem IA: "Montar roteiro sem IA" (usa o texto de cada cena; lib/narracao.js).
 */
export async function gerarRoteiroNarracao({ cliente, criativo, cenas }) {
  const system = 'Você é roteirista e diretor de locução de anúncios curtos para redes sociais. Escreve falas naturais, faladas (não lidas), em português do Brasil.';
  const pedido = `Cliente: ${cliente.nome} (${cliente.nicho || 'e-commerce'}). Tom de voz da marca: ${cliente.marca?.tomDeVoz || 'natural'}.
Criativo:
Hook: ${criativo.hook}
Copy/roteiro: ${criativo.copy}
CTA: ${criativo.cta}

Linha do tempo do vídeo (${cenas.length} cenas; cabem ~2,5 palavras por segundo):
${cenas.map((c, i) => `${i + 1}. ${c.tipo === 'cta' ? '[FINAL/CTA] ' : ''}${Number(c.dur) || 0} s (cabem ~${Math.max(1, Math.round((Number(c.dur) || 0) * 2.5))} palavras) — texto na tela: "${c.texto || ''}"`).join('\n')}

Escreva a narração falada, UMA fala por cena, exatamente ${cenas.length}, na mesma ordem. Cada fala deve caber no tempo da cena, soar como conversa (não como texto lido) e complementar o texto na tela, sem repeti-lo palavra por palavra. A primeira prende a atenção; a última pede a ação do CTA. Não invente preços, resultados, depoimentos nem promessas que não estejam no criativo.
Para cada fala, indique o "tom" (ex.: animado, confiante, íntimo) e o "ritmo" (ex.: rápido, natural, pausado) em poucas palavras.
"direcao": 1 frase de direção geral para a voz (gênero/idade sugeridos, energia).
Saída JSON: {"direcao": string, "cenas": [{"fala": string, "tom": string, "ritmo": string}]}. ${SO_JSON}`;
  return (await gerarJSON({ tarefa: 'narracao', cliente, estavel: estavelDe(cliente), system, messages: [{ role: 'user', content: pedido }] })).dados;
}
