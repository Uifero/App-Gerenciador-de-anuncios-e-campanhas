// Testes da lógica de custo e roteamento de modelo/tarefa do servidor de IA (sem rede: só as funções puras exportadas).
import { describe, it, expect } from 'vitest';
import { TAREFAS, calcularCusto, paramsDoModelo, validarImagens, blocosComImagens, lerSaidaCli, MAX_IMAGENS, comMetodologia, decidirReserva, POLITICAS_API, estimarCustoApi, tempoLimiteCli, linhaLogIa } from './index.js';
import { METODOLOGIA_VORTEX } from './referencias/metodologia-vortex.js';
import { REFERENCIA_TRAFEGO } from './referencias/trafego.js';
import { REFERENCIA_COPY } from './referencias/copy.js';
import { REFERENCIA_OFERTA } from './referencias/oferta.js';
import { REFERENCIA_GANCHOS, GANCHOS } from './referencias/ganchos.js';
import { FRAMEWORKS } from '../src/lib/constantes.js';
import { REFERENCIAS_FIXAS } from '../src/lib/referencias-fixas.js';

// As referências fixas da fase de qualidade entram depois das de antes; os testes antigos conferem a ordem sem elas.
const FIXAS = REFERENCIAS_FIXAS.map((r) => r.texto);
const com = (t, e) => FIXAS.reduce((x, fx) => (typeof x !== 'string' ? x : x.split(`\n\n${fx}`).join('').split(fx).join('')), comMetodologia(t, e));

describe('referências fixas da fase de qualidade', () => {
  const com2 = (n) => comMetodologia(TAREFAS[n], 'PERFIL');
  const onde = (flag) => Object.entries(TAREFAS).filter(([, t]) => t[flag]).map(([n]) => n).sort();
  it('cada referência só nas tarefas que a usam', () => {
    expect(onde('siteProfissional')).toEqual(['ajuste_secao_amplo', 'ajuste_site_amplo', 'pacote', 'plano_site', 'site']);
    expect(onde('paginaProduto')).toEqual(['pacote', 'plano_site', 'site']);
    expect(onde('legal')).toEqual(['pacote', 'site']);
    expect(onde('organico')).toEqual(['animacao', 'criativos', 'imagem', 'refino']);
    expect(onde('roteiros')).toEqual(['criativos', 'narracao']);
    expect(onde('politicas')).toEqual(['criativos', 'especialista_copy', 'hooks', 'refino']);
    expect(onde('decisoes')).toEqual(['diagnostico', 'especialista_trafego', 'insights', 'otimizacao_anuncio', 'recomendacao_anuncio']);
  });
  it('entram no contexto das tarefas certas e ficam fora das outras (checklist, leitura de print, FAQ)', () => {
    const [site, pagina, legal, roteiros, organico, politicas, decisoes] = ['site-profissional', 'pagina-produto', 'requisitos-legais', 'roteiros-video', 'estilo-organico', 'politicas-nicho', 'decisoes-trafego'].map((id) => REFERENCIAS_FIXAS.find((r) => r.id === id).texto);
    for (const r of [site, pagina, legal]) expect(com2('pacote')).toContain(r);
    for (const r of [organico, roteiros, politicas]) expect(com2('criativos')).toContain(r);
    expect(com2('recomendacao_anuncio')).toContain(decisoes);
    for (const n of ['checklist', 'leitura_resultados', 'faq', 'ajuste_site']) for (const r of FIXAS) expect(com2(n)).not.toContain(r);
  });
  it('compactas (até ~650 tokens cada) e sem nome de pessoa real nem benchmark em US$', () => {
    for (const r of REFERENCIAS_FIXAS) {
      expect(r.tokens, r.id).toBeLessThanOrEqual(650);
      expect(r.texto).not.toMatch(/US\$|\$\s?\d/);
    }
  });
});

describe('TAREFAS', () => {
  it('toda tarefa tem modelo e limite de tokens de saída', () => {
    for (const [nome, t] of Object.entries(TAREFAS)) {
      expect(t.modelo, `tarefa ${nome} sem modelo`).toBeTruthy();
      expect(t.max, `tarefa ${nome} sem max`).toBeGreaterThan(0);
    }
  });

  it('tarefas simples usam o modelo leve; tarefas complexas usam o modelo completo', () => {
    expect(TAREFAS.hooks.modelo).toBe(TAREFAS.checklist.modelo);
    expect(TAREFAS.criativos.modelo).toBe(TAREFAS.campanha.modelo);
    expect(TAREFAS.hooks.modelo).not.toBe(TAREFAS.criativos.modelo);
  });

  it('sem raciocínio só nas tarefas leves medidas sem perda de qualidade; nunca no modelo complexo', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.semRaciocinio).map(([n]) => n).sort()).toEqual(['ajuste_site', 'checklist', 'imagem', 'modelo_prompt', 'reparo']);
    for (const n of ['hooks', 'refino', 'narracao', 'faq', 'leitura_respostas']) expect(TAREFAS[n].semRaciocinio).toBeFalsy(); // pioravam sem raciocínio
    for (const t of Object.values(TAREFAS).filter((x) => x.semRaciocinio)) expect(t.modelo).toBe(TAREFAS.hooks.modelo);
    expect(TAREFAS.modelo_prompt.modelo).toBe(TAREFAS.hooks.modelo); // modelo leve, como as tarefas simples
  });

  it('metodologia (referência opcional) só em criativos, campanha e site; nas outras o contexto fica igual', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.metodologia).map(([n]) => n).sort()).toEqual(['campanha', 'criativos', 'discussao_campanha', 'especialista_copy', 'otimizacao_anuncio', 'recomendacao_anuncio', 'site']);
    expect(com(TAREFAS.site, 'PERFIL').startsWith(`PERFIL

${METODOLOGIA_VORTEX}`)).toBe(true);
    expect(com(TAREFAS.checklist, 'PERFIL')).toBe('PERFIL');
    expect(com(TAREFAS.checklist, undefined)).toBeUndefined();
    expect(METODOLOGIA_VORTEX).toMatch(/uma referência entre outras/i);
    expect(METODOLOGIA_VORTEX.length).toBeLessThan(1600); // curta: ~400 tokens
  });

  it('referência de tráfego só nas tarefas de campanha, análise e diagnóstico; vem depois da metodologia', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.trafego).map(([n]) => n).sort()).toEqual(['campanha', 'diagnostico', 'discussao_campanha', 'especialista_trafego', 'insights', 'otimizacao_anuncio', 'recomendacao_anuncio']);
    expect(com(TAREFAS.campanha, 'PERFIL')).toBe(`PERFIL

${METODOLOGIA_VORTEX}

${REFERENCIA_TRAFEGO}`);
    expect(com(TAREFAS.insights, 'PERFIL')).toBe(`PERFIL

${REFERENCIA_TRAFEGO}`);
    expect(com(TAREFAS.insights, undefined)).toBe(REFERENCIA_TRAFEGO);
    expect(com(TAREFAS.criativos, 'PERFIL')).not.toContain(REFERENCIA_TRAFEGO); // criativo e site ficam só com a Vortex
    expect(com(TAREFAS.leitura_resultados, 'PERFIL')).toBe('PERFIL'); // leitura de print só extrai número
  });

  it('referência de tráfego: curta, opcional e sem benchmark de resultado para a IA citar', () => {
    expect(REFERENCIA_TRAFEGO).toMatch(/uma referência entre outras/i);
    expect(REFERENCIA_TRAFEGO).toMatch(/não inventar dados/i);
    expect(REFERENCIA_TRAFEGO).toMatch(/NÃO médias de mercado/);
    expect(REFERENCIA_TRAFEGO).not.toMatch(/\$|R\$|ROAS (médio|de \d)|CPM de \d/); // nenhum valor em moeda nem meta de ROAS/CPM
    expect(REFERENCIA_TRAFEGO.length).toBeLessThan(2400); // ~600 tokens
  });

  it('referência de copy só em criativos, hooks e refino; vem depois da metodologia; site e checklist ficam de fora', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.copy).map(([n]) => n).sort()).toEqual(['criativos', 'especialista_copy', 'hooks', 'refino']);
    expect(com(TAREFAS.criativos, 'PERFIL')).toBe(`PERFIL

${METODOLOGIA_VORTEX}

${REFERENCIA_COPY}

${REFERENCIA_GANCHOS}`);
    expect(com(TAREFAS.hooks, 'PERFIL')).toBe(`PERFIL

${REFERENCIA_COPY}

${REFERENCIA_GANCHOS}`);
    expect(com(TAREFAS.refino, undefined)).toBe(REFERENCIA_COPY);
    expect(com(TAREFAS.site, 'PERFIL')).not.toContain(REFERENCIA_COPY);
    expect(com(TAREFAS.campanha, 'PERFIL')).not.toContain(REFERENCIA_COPY);
  });

  it('modelos de gancho só em criativos e hooks, com a lista inteira numerada e as regras de uso', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.ganchos).map(([n]) => n).sort()).toEqual(['criativos', 'hooks']);
    expect(GANCHOS).toHaveLength(100);
    expect(new Set(GANCHOS.map((g) => g.n)).size).toBe(100);
    expect(GANCHOS.filter((g) => g.cuidado).map((g) => g.n).sort((a, b) => a - b)).toEqual([14, 37, 59, 64, 67, 74, 84]);
    for (const g of GANCHOS) expect(REFERENCIA_GANCHOS).toContain(`${g.n}. ${g.texto}`);
    expect(REFERENCIA_GANCHOS).toMatch(/nunca tem colchetes/);
    expect(REFERENCIA_GANCHOS).toMatch(/nunca o mesmo número duas vezes/);
    expect(REFERENCIA_GANCHOS).toContain("(*) NUNCA vira resultado no corpo");
    expect(REFERENCIA_GANCHOS).toMatch(/nunca passa por cima das REGRAS CRÍTICAS/);
    expect(com(TAREFAS.refino, 'PERFIL')).not.toContain(REFERENCIA_GANCHOS);
    expect(com(TAREFAS.site, 'PERFIL')).not.toContain(REFERENCIA_GANCHOS);
  });

  it('referência de copy: curta, opcional, subordinada às regras críticas e sem urgência fabricada', () => {
    expect(REFERENCIA_COPY).toMatch(/uma referência entre outras/i);
    expect(REFERENCIA_COPY).toMatch(/nunca passa por cima das REGRAS CRÍTICAS/);
    expect(REFERENCIA_COPY).toMatch(/nunca fabricada/);
    expect(REFERENCIA_COPY).toMatch(/formato de saída, as categorias e os campos pedidos/); // hooks têm categorias fixas
    // o campo "framework" do criativo só aceita a lista do app (senão vira "livre" ao editar)
    expect(REFERENCIA_COPY).toContain(`use só ${FRAMEWORKS.filter(([id]) => id !== 'livre').map(([id]) => id).join(', ')} ou livre`);
    expect(REFERENCIA_COPY).not.toMatch(/\$|compre agora|imperdível/i);
    // teste real com a Thermora (07/10/2026): "nomear a dor" virou gancho "a barriga continua aí" em suplemento
    expect(REFERENCIA_COPY).toMatch(/saúde\/emagrecimento: aí dor sobre corpo, peso ou aparência[^;]*nunca vira gancho/);
    expect(REFERENCIA_COPY.length).toBeLessThan(2600); // ~650 tokens
  });

  it('referência de oferta só no site, em "Analisar e recomendar" e no plano de otimização; sempre por último', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.oferta).map(([n]) => n).sort()).toEqual(['especialista_oferta', 'otimizacao_anuncio', 'recomendacao_anuncio', 'site']);
    expect(com(TAREFAS.site, 'PERFIL')).toBe(`PERFIL

${METODOLOGIA_VORTEX}

${REFERENCIA_OFERTA}`);
    expect(com(TAREFAS.recomendacao_anuncio, 'PERFIL')).toBe(`PERFIL

${METODOLOGIA_VORTEX}

${REFERENCIA_TRAFEGO}

${REFERENCIA_OFERTA}`);
    for (const n of ['criativos', 'hooks', 'campanha', 'insights', 'ajuste_site', 'faq']) expect(com(TAREFAS[n], 'PERFIL')).not.toContain(REFERENCIA_OFERTA);
  });

  it('referência de oferta: não cria preço, garantia nem bônus para o público; sugestão só para o gestor', () => {
    expect(REFERENCIA_OFERTA).toMatch(/uma referência entre outras/i);
    expect(REFERENCIA_OFERTA).toMatch(/PÚBLICO FINAL[^.]*nunca crie um/);
    expect(REFERENCIA_OFERTA).toMatch(/GESTOR, pode SUGERIR[^.]*sem número inventado/);
    expect(REFERENCIA_OFERTA).toMatch(/"de\/por" só com preço cheio real cadastrado/);
    expect(REFERENCIA_OFERTA).not.toMatch(/\$|valor total|10x|2x/i); // nada de "valor" em dinheiro, âncora nem multiplicador de preço
    expect(REFERENCIA_OFERTA.length).toBeLessThan(2600); // ~650 tokens
  });

  it('só busca de mercado, leitura de site pela busca e diagnóstico pedem busca web', () => {
    expect(Object.entries(TAREFAS).filter(([, t]) => t.web).map(([n]) => n)).toEqual(['referencias', 'diagnostico', 'leitura_web', 'pesquisa_nicho']);
    expect(TAREFAS.recomendacao_anuncio.web).toBeFalsy(); // a recomendação usa a pesquisa em cache: uma busca por análise, no máximo
    expect(TAREFAS.criativos.web).toBeFalsy();
    expect(TAREFAS.campanha.web).toBeFalsy();
  });
});

describe('calcularCusto', () => {
  const semUso = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };

  it('zero de uso custa zero', () => {
    expect(calcularCusto('claude-haiku-4-5', semUso)).toBe(0);
  });

  it('Sonnet custa mais que Haiku para o mesmo uso (entrada e saída mais caras)', () => {
    const uso = { entrada: 100_000, saida: 10_000, cacheEscrita: 0, cacheLeitura: 0 };
    const haiku = calcularCusto('claude-haiku-4-5', uso);
    const sonnet = calcularCusto('claude-sonnet-5', uso);
    expect(sonnet).toBeGreaterThan(haiku);
  });

  it('calcula o valor exato pela tabela de preços (Sonnet: entrada 2, saída 10 por 1M)', () => {
    const uso = { entrada: 1_000_000, saida: 1_000_000, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('claude-sonnet-5', uso)).toBeCloseTo(2 + 10, 6);
  });

  it('tokens de leitura do cache custam 10% do preço de entrada', () => {
    const comCache = calcularCusto('claude-sonnet-5', { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 1_000_000 });
    const semCache = calcularCusto('claude-sonnet-5', { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 });
    expect(comCache).toBeCloseTo(semCache * 0.1, 6);
  });

  it('tokens de escrita do cache custam 1,25x o preço de entrada', () => {
    const escrita = calcularCusto('claude-sonnet-5', { entrada: 0, saida: 0, cacheEscrita: 1_000_000, cacheLeitura: 0 });
    const normal = calcularCusto('claude-sonnet-5', { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 });
    expect(escrita).toBeCloseTo(normal * 1.25, 6);
  });

  it('soma o custo de buscas web (US$ 0,01 cada)', () => {
    const custo = calcularCusto('claude-sonnet-5', { ...semUso, buscasWeb: 3 });
    expect(custo).toBeCloseTo(0.03, 6);
  });

  it('reconhece a família do modelo pelo nome (opus cai na tabela de opus)', () => {
    const uso = { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('claude-opus-4', uso)).toBeCloseTo(5, 6);
  });

  it('modelo desconhecido cai na tabela do Sonnet (padrão)', () => {
    const uso = { entrada: 1_000_000, saida: 0, cacheEscrita: 0, cacheLeitura: 0 };
    expect(calcularCusto('modelo-futuro-xyz', uso)).toBeCloseTo(2, 6);
  });
});

describe('paramsDoModelo', () => {
  it('Haiku não recebe thinking nem effort (a API rejeita esses parâmetros no Haiku 4.5)', () => {
    expect(paramsDoModelo('claude-haiku-4-5', { effort: 'medium' })).toEqual({});
  });

  it('Sonnet recebe thinking adaptativo e o effort da tarefa', () => {
    const p = paramsDoModelo('claude-sonnet-5', { effort: 'low' });
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.output_config).toEqual({ effort: 'low' });
  });

  it('Sonnet sem effort definido usa "medium" como padrão', () => {
    const p = paramsDoModelo('claude-sonnet-5', {});
    expect(p.output_config.effort).toBe('medium');
  });
});

describe('imagens anexadas (diagnóstico com prints)', () => {
  const ok = { media_type: 'image/jpeg', data: 'QUJD' };

  it('sem imagens devolve lista vazia (o fluxo só de texto não muda)', () => {
    expect(validarImagens(undefined)).toEqual([]);
    expect(validarImagens(null)).toEqual([]);
  });

  it('aceita JPG/PNG/WebP em base64 e descarta campos extras', () => {
    expect(validarImagens([{ ...ok, nome: 'x', lixo: 1 }])).toEqual([ok]);
  });

  it('recusa tipo não suportado, base64 inválido e excesso de imagens', () => {
    expect(() => validarImagens([{ media_type: 'application/pdf', data: 'QUJD' }])).toThrow(/JPG, PNG/);
    expect(() => validarImagens([{ media_type: 'image/png', data: 'não é base64!' }])).toThrow(/inválida/);
    expect(() => validarImagens(Array(MAX_IMAGENS + 1).fill(ok))).toThrow(/no máximo/);
    expect(() => validarImagens('x')).toThrow(/formato inválido/);
  });

  it('só o diagnóstico e a leitura de prints do Instagram aceitam imagens', () => {
    expect(TAREFAS.diagnostico.imagens).toBe(true);
    expect(Object.entries(TAREFAS).filter(([, t]) => t.imagens).map(([n]) => n)).toEqual(['diagnostico', 'leitura_prints', 'leitura_provas', 'ajuste_entender_print', 'leitura_resultados']);
    expect(TAREFAS.ajuste_entender.imagens).toBeUndefined(); // o "Entendi assim" só de texto continua sem imagem (mais barato)
  });

  it('monta os blocos com as imagens antes do texto', () => {
    const b = blocosComImagens('pedido', [ok]);
    expect(b.map((x) => x.type)).toEqual(['image', 'text']);
    expect(b[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'QUJD' });
    expect(b[1].text).toBe('pedido');
  });

  it('lê a linha "result" da saída stream-json da CLI (e o JSON único no modo normal)', () => {
    const stream = ['{"type":"system"}', '{"type":"assistant"}', '{"type":"result","result":"ok","is_error":false,"usage":{"input_tokens":9}}', ''].join('\n');
    expect(lerSaidaCli(stream, true).result).toBe('ok');
    expect(lerSaidaCli('{"result":"x"}', false).result).toBe('x');
    expect(() => lerSaidaCli('{"type":"system"}', true)).toThrow();
  });
});

describe('quem paga: assinatura primeiro, API só com permissão (Frente 1)', () => {
  it('decidirReserva nunca troca sozinha para a API', () => {
    expect(decidirReserva({ politica: 'perguntar', temChave: true })).toBe('perguntar');
    expect(decidirReserva({ politica: 'nunca', temChave: true })).toBe('parar');
    expect(decidirReserva({ politica: 'sempre', temChave: true })).toBe('api');
    expect(decidirReserva({ politica: 'nunca', permitir: true, temChave: true })).toBe('api'); // "Usar API desta vez"
    for (const politica of POLITICAS_API) expect(decidirReserva({ politica, permitir: true, temChave: false })).toBe('parar');
    expect(decidirReserva()).toBe('parar');
  });
  it('custo estimado pela API: texto + imagens + saída no teto da tarefa', () => {
    const so = estimarCustoApi({ modelo: TAREFAS.plano_site.modelo, caracteres: 35_000, saida: TAREFAS.plano_site.max });
    expect(so).toBeCloseTo(calcularCusto(TAREFAS.plano_site.modelo, { entrada: 10_000, saida: 16_000 }), 6);
    expect(estimarCustoApi({ modelo: TAREFAS.ajuste_entender_print.modelo, caracteres: 3500, imagens: 2, saida: 1500 }))
      .toBeCloseTo(calcularCusto(TAREFAS.ajuste_entender_print.modelo, { entrada: 1000 + 3200, saida: 1500 }), 6);
  });
  it('tempo da CLI: 3 min no normal, 5 min com busca, mais para saída longa (plano_site), teto 10 min', () => {
    expect(tempoLimiteCli({ maxTokens: TAREFAS.conferencia_site.max })).toBe(180_000);
    expect(tempoLimiteCli({ busca: true, maxTokens: 4000 })).toBe(300_000);
    expect(tempoLimiteCli({ maxTokens: TAREFAS.plano_site.max })).toBe(400_000);
    expect(tempoLimiteCli({ maxTokens: 32_000 })).toBe(600_000);
  });
  it('linha de log: tarefa, quem pagou, modelo, status e tempo; nada do prompt', () => {
    expect(linhaLogIa({ tarefa: 'plano_site', pagoPor: 'assinatura', modelo: 'claude-sonnet-5', status: 200, ms: 1234.4, imagens: 0 }))
      .toBe('[ia] tarefa=plano_site pago_por=assinatura modelo=claude-sonnet-5 status=200 ms=1234');
    expect(linhaLogIa({ tarefa: 'ajuste_entender_print', pagoPor: 'api', status: 200, ms: 5, imagens: 2 })).toMatch(/pago_por=api modelo=- status=200 ms=5 imagens=2$/);
  });
});
