// Modelos de gancho de abertura: conferência local do que a IA devolve (modelo válido, repetição, colchete, (*) em saúde)
// e a linha do pedido. As respostas reais gravadas ficam em tests/fixtures/ia/ganchos-*-real.json.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GANCHOS, numeroModelo, temColchete, resultadoNoCorpo, motivoGancho, conferirGanchos, rotuloModelo, descricaoModelo, linhaGanchos } from './ganchos.js';
import { DOC_GANCHOS, documentosParaAnalise } from './documentos.js';

const moda = { id: 'm', nome: 'Loja', nicho: 'moda fitness', marca: { produtoSaude: false } };
const saude = { id: 't', nome: 'Thermora', nicho: 'suplementos', marca: {} };

describe('biblioteca de ganchos', () => {
  it('é a mesma do documento em docs/referencias (100 modelos, os 7 com (*))', () => {
    const doc = readFileSync('docs/referencias/ganchos-de-abertura.txt', 'utf8');
    const numerados = doc.split(/\r?\n/).filter((l) => /^\d+\. /.test(l));
    expect(numerados).toHaveLength(100);
    for (const l of numerados) {
      const [, n, texto] = /^(\d+)\. (.+?)(?: \(\*\))?$/.exec(l.trim());
      const g = GANCHOS.find((x) => x.n === Number(n));
      expect(g?.texto).toBe(texto);
      expect(g.cuidado).toBe(l.includes('(*)'));
    }
  });

  it('número do modelo: aceita 37, "37" e "modelo 37"; fora da biblioteca vira null', () => {
    expect(numeroModelo(37)).toBe(37);
    expect(numeroModelo('modelo 37')).toBe(37);
    expect(numeroModelo(101)).toBeNull();
    expect(numeroModelo(null)).toBeNull();
    expect(numeroModelo('nenhum')).toBeNull();
  });

  it('acha colchete que sobrou do modelo e resultado no corpo', () => {
    expect(temColchete('A verdade sobre [algo] que ninguém conta')).toBe(true);
    expect(temColchete('A verdade sobre a legging que ninguém conta')).toBe(false);
    expect(resultadoNoCorpo('Eu testei 30 dias e sequei a barriga')).toBe('sequei');
    expect(resultadoNoCorpo('Meu corpo mudou em um mês')).toBe('meu corpo');
    expect(resultadoNoCorpo('Testei 30 dias na rotina corrida')).toBe('');
  });
});

describe('motivoGancho (bloqueia aprovação)', () => {
  it('(*) com resultado no corpo bloqueia só em cliente de saúde', () => {
    const c = { modeloGancho: 37, hook: 'Eu testei Thermora por 30 dias e olha minha barriga', copy: '', cta: '' };
    expect(motivoGancho(c, saude)).toMatch(/modelo 37 \(\*\) virou resultado no corpo \("barriga"\)/);
    expect(motivoGancho(c, moda)).toBe('');
    // o mesmo texto sem modelo (*) fica com a regra geral de saúde (acharTermosProibidos), não com esta
    expect(motivoGancho({ ...c, modeloGancho: 31 }, saude)).toBe('');
  });
  it('(*) adaptado para experiência de uso passa', () => {
    expect(motivoGancho({ modeloGancho: 84, hook: 'Eu não acreditei até experimentar uma cápsula na minha manhã corrida', copy: 'Rotina com mais disposição.' }, saude)).toBe('');
  });
  it('colchete que sobrou bloqueia em qualquer cliente, no criativo e no hook', () => {
    expect(motivoGancho({ hook: 'Minha [coisa] favorita', copy: '' }, moda)).toMatch(/colchete/);
    expect(motivoGancho({ texto: 'Antes de [X], faça [Y]' }, moda)).toMatch(/colchete/);
  });
});

describe('conferirGanchos (lote da IA)', () => {
  it('tira número inventado, avisa modelo repetido e mantém o resto', () => {
    const r = conferirGanchos([
      { hook: 'A', modeloGancho: 15 }, { hook: 'B', modeloGancho: '15' }, { hook: 'C', modeloGancho: 250 }, { hook: 'D' },
    ], moda);
    expect(r.map((x) => x.modeloGancho)).toEqual([15, 15, null, null]);
    expect(r[0].avisosGancho).toEqual([]);
    expect(r[1].avisosGancho).toEqual(['modelo 15 repetido no lote']);
  });
  it('em saúde, (*) com corpo aparece como aviso no lote', () => {
    const [x] = conferirGanchos([{ hook: 'Como eu fui de 70 kg para 62 kg', copy: '', modeloGancho: 14 }], saude);
    expect(x.avisosGancho[0]).toMatch(/modelo 14 \(\*\) virou resultado no corpo/);
  });
});

describe('rótulos e linha do pedido', () => {
  it('mostra de qual modelo veio', () => {
    expect(rotuloModelo(37)).toBe('gancho: modelo 37 (*)');
    expect(rotuloModelo(15)).toBe('gancho: modelo 15');
    expect(descricaoModelo(15)).toBe('Modelo 15, curiosidade e segredo: “Aposto que você não fazia ideia disso sobre...”');
    expect(rotuloModelo(0)).toBe('');
  });
  it('pede modelo diferente por item, número em modeloGancho e, com modelo escolhido, usa ele na variação 1', () => {
    expect(linhaGanchos({ quantidade: 3, cliente: moda })).toMatch(/um modelo diferente em cada item.*"modeloGancho"/);
    expect(linhaGanchos({ quantidade: 1, cliente: moda })).not.toMatch(/diferente em cada item/);
    expect(linhaGanchos({ fixo: 46, quantidade: 3, cliente: moda })).toContain('A variação 1 usa o modelo de gancho 46: "Testei todas as alternativas e essa foi a melhor para [algo]".');
  });
  it('modelo (*) escolhido para cliente de saúde leva o aviso de não usar resultado no corpo', () => {
    expect(linhaGanchos({ fixo: 37, quantidade: 1, cliente: saude })).toMatch(/Use o modelo de gancho 37.*tem \(\*\) e o produto é de saúde: adapte sem resultado no corpo/);
    expect(linhaGanchos({ fixo: 37, quantidade: 1, cliente: moda })).not.toMatch(/produto é de saúde/);
  });
});

describe('Documentos de referência', () => {
  it('ganchos é entrada fixa com os grupos como partes, fora das análises (que não recebem o texto)', () => {
    expect(DOC_GANCHOS).toMatchObject({ id: 'ganchos', fixo: true, titulo: 'Modelos de gancho de abertura' });
    expect(DOC_GANCHOS.partes).toHaveLength(7);
    expect(DOC_GANCHOS.partes.map((p) => p.parte)).toContain('PROMESSA E RESULTADO'); // nome do grupo sem o parêntese
    expect(DOC_GANCHOS.partes.map((p) => p.pontos).join(' ')).toContain('37. Eu testei [algo] durante 30 dias e olha o que aconteceu... (*)');
    expect(documentosParaAnalise([], null).map((d) => d.id)).toEqual(['vortex']);
  });
});
