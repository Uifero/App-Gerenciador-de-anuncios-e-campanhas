// "Especialistas" dentro do app: consulta a uma IA especialista num MÉTODO (nunca uma pessoa real; o app é usado com
// clientes), sobre um item real deste cliente. Catálogo, contexto do item e leitura tolerante da resposta: tudo puro e
// testável. Os critérios (foco) seguem as referências do servidor (server/referencias/trafego.js, copy.js, oferta.js e
// ganchos.js), que já foram resumidas dos squads do Xquads com as regras do app. A consulta só aconselha: nada é aplicado
// sozinho em criativo, campanha ou perfil. O dado continua morando na fonte (perfil, produtos, resultados); a consulta guarda só
// o id/nome do item e a resposta. Aplicar o que ele sugere é sempre um clique do operador (lib/aplicar-especialista.js).
import { comoAnunciaDe } from './anuncio.js';

const txt = (v) => String(v ?? '').trim();
const lista = (v) => (Array.isArray(v) ? v : []);

/** Tipos de item que um especialista pode analisar. */
export const ALVOS = {
  criativo: 'Criativo', peca: 'Peça finalizada (Galeria)', campanha: 'Campanha', oferta: 'Oferta e produtos', resultados: 'Resultados recentes', livre: 'Pergunta livre',
};
/** Área -> tarefa do servidor (TAREFAS em server/index.js). */
export const TAREFA_DA_AREA = { trafego: 'especialista_trafego', copy: 'especialista_copy', oferta: 'especialista_oferta' };

export const ESPECIALISTAS = [
  {
    id: 'escala', nome: 'Escala de campanhas', metodo: 'escala vertical e horizontal com leitura de dado e fase de aprendizado', area: 'trafego', icone: 'arrow-trend-up',
    quando: 'A campanha está dando resultado e você quer saber se, quando e como aumentar a verba.',
    alvos: ['campanha', 'resultados'],
    foco: [
      'Há dado suficiente? Menos de ~7 dias ou poucas conversões é indício, não conclusão.',
      'Fase de aprendizado: nos primeiros ~3 dias não se mexe no conjunto.',
      'Escala vertical: só no que está estável na meta, ~20% a cada 48–72 h; voltar um passo se o CPA piorar muito por 48 h.',
      'Escala horizontal: duplicar o vencedor para públicos novos.',
      'Pré-requisitos: rastreamento confiável e criativos de reserva prontos.',
      'Orçamento muda aos poucos; decidir por margem, não só por faturamento.',
    ],
    checklist: [
      'A campanha tem pelo menos uma semana de dados e conversões suficientes?',
      'Saiu da fase de aprendizado (sem mexer nos últimos ~3 dias)?',
      'O CPA (ou custo por conversa) está estável dentro da meta?',
      'O rastreamento (pixel, conversas do WhatsApp) está conferido?',
      'Há criativos novos prontos para quando o atual cansar?',
      'O aumento planejado é gradual (~20%) e você sabe a margem do produto?',
    ],
    origem: 'inspirado no squad Traffic Masters do Xquads',
  },
  {
    id: 'auditoria', nome: 'Auditoria de métricas', metodo: 'diagnóstico em cadeia das métricas e classificação do que está no ar', area: 'trafego', icone: 'magnifying-glass-chart',
    quando: 'Os números não estão bons e você quer saber em que ponto do caminho está o problema.',
    alvos: ['resultados', 'campanha'],
    foco: [
      'Diagnóstico em cadeia: CTR baixo = gancho/criativo ou público; CTR bom e conversão baixa = página, oferta ou destino.',
      'Conversão boa e CPA alto = CPM, orçamento ou lance; alcance baixo = público estreito ou verba pequena.',
      'Fadiga: frequência subindo com CTR caindo e CPA subindo pede criativo novo, não mais verba.',
      'Classificar: vencedor (escalar), na meta (otimizar), abaixo (corrigir ou pausar), sem volume nem função (desligar).',
      'Mudar uma coisa por vez; não pôr toda a verba em remarketing.',
      'Cada ponto: o que o dado mostra, por que importa e a ação concreta, em ordem de impacto.',
    ],
    checklist: [
      'O CTR está baixo? Olhe o gancho do criativo e o público antes de mexer na página.',
      'O CTR está bom e vende pouco? Olhe página, oferta e destino (site ou WhatsApp).',
      'Converte bem e o CPA está alto? Olhe CPM, orçamento e lance.',
      'A frequência subiu e o CTR caiu? Troque o criativo antes de pôr mais verba.',
      'Cada anúncio está classificado: vencedor, na meta, abaixo da meta ou desligar?',
      'Os dados cobrem tempo suficiente para decidir?',
    ],
    origem: 'inspirado no squad Traffic Masters do Xquads',
  },
  {
    id: 'copy', nome: 'Copy de resposta direta', metodo: 'nível de consciência, gancho, especificidade, benefício, objeção e um CTA', area: 'copy', icone: 'pen-nib',
    quando: 'Você quer uma segunda opinião sobre o texto de um criativo antes de mandar para o cliente.',
    alvos: ['criativo', 'peca', 'livre'],
    foco: [
      'O texto fala com o nível de consciência certo do público (não sabe do problema, sabe do problema, conhece soluções, conhece o produto)?',
      'A primeira frase faz ler a próxima (escorregador); nada de saudação ou marca abrindo para público frio.',
      'Específico vence adjetivo: cena, objeto, momento concreto; número só se estiver no perfil.',
      'Benefício antes de característica, com a característica como prova.',
      'Responde a principal objeção do perfil sem soar defensivo.',
      'Um anúncio, um objetivo, um CTA; urgência só se for real.',
    ],
    checklist: [
      'Dá para dizer para quem é este texto e o que essa pessoa já sabe?',
      'A primeira frase faria você parar de rolar e ler a segunda?',
      'Tem pelo menos um detalhe concreto (cena, objeto, momento) em vez de só adjetivos?',
      'O benefício aparece antes da característica?',
      'A principal objeção do cliente está respondida no texto?',
      'Há um único CTA claro, sem urgência inventada?',
    ],
    origem: 'inspirado no Copy Squad do Xquads',
  },
  {
    id: 'ganchos', nome: 'Ganchos e retenção em vídeo', metodo: 'primeiros 3 segundos, roteiro cena a cena e ritmo com uma ideia por vídeo', area: 'copy', icone: 'film',
    quando: 'O vídeo perde as pessoas logo no começo ou você quer revisar o roteiro antes de gravar.',
    alvos: ['criativo', 'peca'],
    foco: [
      'Gancho nos 3 primeiros segundos: para a rolagem e liga com o que vem depois.',
      'Funciona sem som: texto na tela grande, poucas palavras, legenda nas falas.',
      'Roteiro cena a cena com ritmo: cada cena curta, troca de plano, nada parado.',
      'Uma ideia por vídeo; o meio cumpre a promessa do gancho (sem isca).',
      'Texto, logo, preço e CTA fora das faixas cobertas pela interface do Instagram.',
      'Para testar: mesmo corpo com ganchos diferentes, uma coisa por vez.',
    ],
    checklist: [
      'Os 3 primeiros segundos param a rolagem sem precisar de som?',
      'O texto na tela é grande, curto e está longe das bordas de cima e de baixo?',
      'Cada cena é curta e tem uma ação ou troca de plano?',
      'O vídeo tem uma ideia só e o meio cumpre o que o gancho prometeu?',
      'O CTA aparece no fim, claro, dentro da zona segura?',
      'Há uma versão com outro gancho para testar com o mesmo corpo?',
    ],
    origem: 'inspirado no Copy Squad e na biblioteca de ganchos de abertura (Xquads e material "Swipe")',
  },
  {
    id: 'oferta', nome: 'Oferta e valor percebido', metodo: 'equação de valor (resultado, confiança, tempo e esforço) e objeções respondidas', area: 'oferta', icone: 'tags',
    quando: 'O anúncio leva gente, mas vende pouco, ou você quer deixar a oferta mais clara sem baixar o preço.',
    alvos: ['oferta', 'livre'],
    foco: [
      'Valor percebido = resultado desejado × confiança, dividido por tempo até o resultado × esforço.',
      'Achar o mais fraco dos quatro e atacar esse primeiro.',
      'Cada objeção do perfil vira uma resposta na oferta ou na página (frete, prazo, troca, como usar, para quem não é).',
      'O que a pessoa leva fica claro item a item.',
      'Garantia, preço, desconto, prazo e escassez: só os reais, cadastrados; para o gestor, algo novo só como sugestão a combinar com o cliente, sem número inventado.',
      'Preço justificado pelo resultado, não pelo concorrente.',
    ],
    checklist: [
      'O resultado que o produto entrega está dito nas palavras do público?',
      'Há prova real visível (depoimento, garantia ou política que já existam)?',
      'Fica claro em quanto tempo a pessoa recebe e começa a usar?',
      'Comprar e usar é fácil (frete, checkout, dúvidas respondidas)?',
      'Cada objeção do perfil tem resposta na página ou na conversa?',
      'Preço, desconto, garantia e prazo mostrados são todos reais?',
    ],
    origem: 'inspirado no squad de oferta do Xquads',
  },
  {
    id: 'whatsapp', nome: 'Fechamento no WhatsApp', metodo: 'conversa de venda: esclarecer, nomear o problema, caminho simples, objeções e pedido de decisão', area: 'oferta', icone: 'comments',
    quando: 'Chegam conversas no WhatsApp, mas poucas viram venda.',
    alvos: ['resultados', 'oferta', 'livre'],
    foco: [
      'Tempo de resposta: conversa que espera esfria; ver se o atendimento responde rápido.',
      'Esclarecer: entender por que a pessoa chamou antes de mandar preço.',
      'Nomear o problema com as palavras da própria pessoa.',
      'Mostrar um caminho simples e vender o resultado, não a lista de características.',
      'Responder a objeção com o que é real (troca, frete, prazo, garantia cadastrada).',
      'Pedir a decisão: terminar com um próximo passo claro (link, forma de pagamento).',
    ],
    checklist: [
      'As conversas são respondidas rápido, inclusive fora do horário comercial?',
      'Quem atende pergunta o que a pessoa procura antes de mandar o preço?',
      'O atendimento repete o problema com as palavras do cliente?',
      'A mensagem fala do resultado, não só das características?',
      'Há respostas prontas (e reais) para as objeções mais comuns?',
      'Toda conversa termina com um pedido claro de decisão ou próximo passo?',
    ],
    origem: 'inspirado no squad de oferta do Xquads',
  },
];

export const especialistaPorId = (id) => ESPECIALISTAS.find((e) => e.id === id) || null;
export const alvosDoEspecialista = (id) => especialistaPorId(id)?.alvos || [];

// ---------- contexto do item escolhido ----------
const reais = (v) => (v == null || v === '' ? '' : `R$ ${v}`);
const pct = (v) => (v == null || v === '' ? '' : `${v}%`);
/** Uma linha por resultado registrado, só com o que existe. */
export function linhaResultado(r) {
  const partes = [
    txt(r.data), txt(r.criativoNome) || txt(r.campanhaNome) || 'campanha inteira', r.destino === 'whatsapp' ? 'WhatsApp' : r.destino === 'site' ? 'site' : '',
    r.gasto != null && `gasto ${reais(r.gasto)}`, r.impressoes != null && `impressões ${r.impressoes}`, r.cpm != null && `CPM ${reais(r.cpm)}`,
    r.ctr != null && `CTR ${pct(r.ctr)}`, r.frequencia != null && `frequência ${r.frequencia}`, r.cpa != null && `CPA ${reais(r.cpa)}`,
    r.roas != null && `ROAS ${r.roas}`, r.conversas != null && `conversas ${r.conversas}`, r.vendasConversa != null && `vendas pela conversa ${r.vendasConversa}`,
    r.faturamentoConversa != null && `faturamento da conversa ${reais(r.faturamentoConversa)}`, r.angulo && `ângulo ${r.angulo}`, r.oferta && `oferta no ar: ${r.oferta}`,
  ];
  return `- ${partes.filter(Boolean).join(' · ')}`;
}
const recentes = (rs, n = 10) => [...lista(rs)].sort((a, b) => String(b.data || b.criadoEm || '').localeCompare(String(a.data || a.criadoEm || ''))).slice(0, n);

/** Bloco de texto compacto do item analisado (vai para a IA e para o checklist). */
export function contextoDoAlvo({ tipo, item = null, cliente = null, produtos = [], resultados = [], criativo = null } = {}) {
  if (tipo === 'criativo' && item) {
    const seus = recentes(lista(resultados).filter((r) => r.criativoId === item.id));
    return [
      `CRIATIVO "${txt(item.nome)}" (status ${txt(item.status) || 'n/d'})`,
      `Hook: ${txt(item.hook)}`, `Copy/roteiro: ${txt(item.copy).slice(0, 3000)}`, `CTA: ${txt(item.cta)}`,
      `Ângulo: ${txt(item.angulo) || 'n/d'} · Framework: ${txt(item.framework) || 'n/d'} · Formato: ${txt(item.formato) || 'n/d'}`,
      seus.length ? `Resultados deste criativo:\n${seus.map(linhaResultado).join('\n')}` : 'Resultados deste criativo: nenhum registrado.',
    ].join('\n');
  }
  if (tipo === 'peca' && item) {
    const cr = criativo || {};
    return [
      `PEÇA FINALIZADA ${txt(item.formatoNome) || txt(item.formato)} (${item.tipo === 'video' ? 'vídeo' : 'imagem'}${item.duracao ? `, ${Math.round(item.duracao)} s` : ''}) do criativo "${txt(cr.nome || item.criativoNome)}"`,
      `Texto na tela: gancho "${txt(item.texto?.hook)}" · CTA "${txt(item.texto?.cta)}"`,
      lista(item.config?.cenas).length ? `Cenas do vídeo:\n${item.config.cenas.map((c, i) => `- ${i + 1}. (${c.dur} s) ${txt(c.texto) || '(sem legenda)'}`).join('\n')}` : '',
      `Copy/roteiro do criativo: ${txt(cr.copy).slice(0, 2000)}`,
    ].filter(Boolean).join('\n');
  }
  if (tipo === 'campanha' && item) {
    const seus = recentes(lista(resultados).filter((r) => r.campanhaId === item.id));
    const conj = lista(item.conjuntos).map((k) => `- ${txt(k.nome)}: público ${txt(k.publico?.nome || k.publico) || 'n/d'}${k.orcamentoDiario != null ? `, ${reais(k.orcamentoDiario)}/dia` : ''}${lista(k.criativos).length ? `, criativos: ${k.criativos.map((c) => txt(c.criativoNome) || c.criativoId).join(', ')}` : ''}`);
    return [
      `CAMPANHA "${txt(item.nome)}" (status ${txt(item.status) || 'n/d'}, objetivo ${txt(item.objetivo) || 'n/d'})`,
      item.orcamentoDiario != null && `Orçamento diário total: ${reais(item.orcamentoDiario)}`,
      txt(item.resumo) && `Resumo: ${txt(item.resumo).slice(0, 1200)}`,
      conj.length ? `Conjuntos:\n${conj.join('\n')}` : 'Conjuntos: nenhum cadastrado.',
      seus.length ? `Resultados ligados a esta campanha:\n${seus.map(linhaResultado).join('\n')}` : 'Resultados ligados a esta campanha: nenhum registrado.',
    ].filter(Boolean).join('\n');
  }
  if (tipo === 'oferta') {
    const a = comoAnunciaDe(cliente);
    const ps = lista(produtos).filter((p) => p?.nome && !p.arquivado).slice(0, 10).map((p) => `- ${txt(p.nome)}${p.preco ? ` · preço ${reais(p.preco)}` : ''}${p.precoPromocional ? ` (promocional ${reais(p.precoPromocional)})` : ''}${txt(p.descricao) ? ` · ${txt(p.descricao).slice(0, 300)}` : ''}${txt(p.beneficios) ? ` · benefícios: ${txt(p.beneficios).slice(0, 300)}` : ''}`);
    return [
      'OFERTA E PRODUTOS',
      ps.length ? `Produtos cadastrados:\n${ps.join('\n')}` : 'Produtos cadastrados: nenhum.',
      `Oferta ativa no perfil: ${txt(cliente?.marca?.ofertaAtiva) || 'nenhuma cadastrada'}`,
      `Destino de venda: ${txt(a.destino) || 'não informado'} · Ticket médio: ${a.ticketMedio ? reais(a.ticketMedio) : 'não informado'} · Margem: ${a.margem ? pct(a.margem) : 'não informada'}`,
    ].join('\n');
  }
  if (tipo === 'resultados') {
    const rs = recentes(resultados);
    return rs.length ? `RESULTADOS RECENTES (até 10, do mais novo):\n${rs.map(linhaResultado).join('\n')}` : 'RESULTADOS RECENTES: nenhum registrado.';
  }
  return '';
}

// ---------- resposta ----------
const pegar = (o, ...ks) => { for (const k of ks) if (o?.[k] != null && o[k] !== '') return o[k]; return ''; };
const AVALIACAO = (v) => {
  const s = txt(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/dado|sem_info|nao_sei|desconhec/.test(s)) return 'falta_dado';
  if (/^(ok|bom|boa|certo|sim|adequad|forte|passa)/.test(s)) return 'ok';
  return 'ajustar';
};
/** Lê a resposta da IA com chaves faltando ou trocadas: { resumo, pontos, acoes, perguntas, avisos }. */
export function normalizarConsulta(d = {}) {
  const o = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  const pontos = lista(pegar(o, 'pontos', 'criterios', 'avaliacoes', 'analise')).map((p) => (typeof p === 'string' ? { ponto: txt(p), avaliacao: 'ajustar', porque: '' } : {
    ponto: txt(pegar(p, 'ponto', 'criterio', 'nome', 'titulo', 'item')), avaliacao: AVALIACAO(pegar(p, 'avaliacao', 'status', 'situacao', 'nota')), porque: txt(pegar(p, 'porque', 'motivo', 'justificativa', 'explicacao')),
  })).filter((p) => p.ponto);
  const acoes = lista(pegar(o, 'acoes', 'acoesPrioritarias', 'recomendacoes', 'proximosPassos')).map((a, i) => (typeof a === 'string' ? { prioridade: i + 1, acao: txt(a), porque: '' } : {
    prioridade: Number(pegar(a, 'prioridade', 'ordem', 'n')) || i + 1, acao: txt(pegar(a, 'acao', 'titulo', 'oque', 'recomendacao')), porque: txt(pegar(a, 'porque', 'motivo', 'justificativa')),
    ...(txt(pegar(a, 'tipo', 'categoria')) ? { tipo: txt(pegar(a, 'tipo', 'categoria')) } : {}), ...(txt(a.campo) ? { campo: txt(a.campo) } : {}),
  })).filter((a) => a.acao).sort((a, b) => a.prioridade - b.prioridade).map((a, i) => ({ ...a, prioridade: i + 1 }));
  const textos = (v) => lista(v).map((x) => txt(typeof x === 'string' ? x : pegar(x, 'pergunta', 'texto', 'aviso'))).filter(Boolean);
  return { resumo: txt(pegar(o, 'resumo', 'diagnostico', 'summary', 'conclusao')), pontos, acoes, perguntas: textos(pegar(o, 'perguntas', 'duvidas', 'perguntasAoGestor')), avisos: textos(o.avisos) };
}
