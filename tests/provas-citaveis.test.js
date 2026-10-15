// Regra única das provas sociais do perfil: linha DIGITADA pelo operador pode ser citada como fato no criativo e no site
// (fonte: "provas sociais do perfil"); descrição de print, OCR e métrica lida do perfil nunca. Thermora de produção como
// fixture, mais a resposta real da IA de criativos (criativos-cenas-thermora-real.json), que citou "Mais de 5000 clientes".
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cliente, DESCRICOES_PRINTS, OCR_PERFIL } from './fixtures/thermora-producao.js';
import { provasCitaveis, fontesDoCriativo, FONTE_PROVAS_PERFIL, provasEmTexto, temProvaReal, resumoMaterialSite } from '../src/lib/prova-social.js';
import { temProvaNoPerfil } from '../src/lib/narrativas.js';
import { statusEtapas } from '../src/lib/etapas-site.js';

vi.mock('../src/core/auth.js', () => ({ tokenAtual: async () => 'token' }));
vi.mock('../src/modules/configuracoes.js', () => ({ obterConfig: async () => ({}) }));
vi.mock('../src/modules/custo.js', () => ({ verificarOrcamento: async () => {}, registrarUso: () => {} }));
const { contextoCliente } = await import('../src/core/ia.js');

const DIGITADA = 'Mais de 5000 clientes atendidas';
// Perfil só com o que veio de print e do Instagram (nada digitado).
const soInterno = { ...cliente, marca: { ...cliente.marca, provasSociais: [...DESCRICOES_PRINTS.map((d) => `${d} (do print enviado em 12/10/2026)`), OCR_PERFIL].join('\n') } };
const printBalanca = { id: 'pb', origem: 'prova_social', url: 'https://x/p.jpg', descricao: 'Print mostra balança com 63,60 kg e depois 62,50 kg' };

describe('quais linhas podem ser citadas', () => {
  it('só a linha digitada; descrição de print, OCR e métrica do perfil ficam de fora', () => {
    expect(provasCitaveis(cliente)).toEqual([DIGITADA]);
    expect(provasCitaveis(soInterno)).toEqual([]);
  });
  it('leitura automática do Instagram ainda não confirmada não conta; depois de confirmada, conta', () => {
    const auto = { ...cliente, autoPreenchido: { provasSociais: { origem: 'instagram' } } };
    expect(provasCitaveis(auto)).toEqual([]);
    expect(provasCitaveis({ ...auto, autoPreenchido: {} })).toEqual([DIGITADA]);
  });
  it('linha igual à descrição de um print guardado (dado antigo, sem a data) não conta', () => {
    const c = { ...cliente, marca: { ...cliente.marca, provasSociais: `${printBalanca.descricao}\n${DIGITADA}` } };
    expect(provasCitaveis(c, [printBalanca])).toEqual([DIGITADA]);
  });
});

describe('a mesma regra em todo lugar', () => {
  it('IA (criativo e site): só a linha digitada vai como prova citável; leituras automáticas vão como "não cite"', () => {
    const ctx = contextoCliente({ ...cliente, leituraInstagram: { resumo: 'Perfil com 471 seguidores' } });
    const linha = ctx.split('\n').find((l) => l.startsWith('Provas sociais disponíveis'));
    expect(linha).toContain(DIGITADA);
    expect(linha).toContain('não como depoimento');
    expect(linha).not.toMatch(/Cliente relata|471 seguidores/);
    expect(ctx).toMatch(/Instagram dela \(lido de prints — só contexto: não cite números, frases nem depoimentos daqui/);
    expect(contextoCliente(soInterno)).not.toContain('Provas sociais disponíveis');
  });
  it('narrativa que exige prova, "tem prova real" do site e contagem do passo 1 contam só as linhas citáveis', () => {
    expect(temProvaNoPerfil(cliente)).toBe(true);
    expect(temProvaNoPerfil(soInterno)).toBe(false);
    expect(temProvaReal({ cliente: soInterno, materiais: [] })).toBe(false);
    expect(temProvaReal({ cliente, materiais: [] })).toBe(true);
    expect(provasEmTexto(soInterno)).toEqual([]);
    const passo1 = (c) => JSON.stringify(resumoMaterialSite({ cliente: c }));
    expect(passo1(cliente)).toContain('1 em texto');
    expect(passo1(soInterno)).toContain('0 em texto');
    expect(passo1(soInterno)).toContain('Sem provas sociais ainda');
  });
  it('"Sem provas sociais" no passo do site quando só há leitura de print', () => {
    const dicas = (c) => JSON.stringify(statusEtapas({ cliente: c, materiais: [] }));
    expect(dicas(soInterno)).toContain('Sem provas sociais');
    expect(dicas(cliente)).not.toContain('Sem provas sociais');
  });
});

describe('fonte no detalhe do criativo', () => {
  it('resposta real da IA citou "5000 clientes": fonte = provas sociais do perfil', () => {
    const { texto } = JSON.parse(readFileSync('tests/fixtures/ia/criativos-cenas-thermora-real.json', 'utf8'));
    const [criativo] = JSON.parse(texto);
    const f = fontesDoCriativo(criativo, { cliente });
    expect(f.citadas).toEqual([{ texto: DIGITADA, fonte: FONTE_PROVAS_PERFIL }]);
    expect(FONTE_PROVAS_PERFIL).toBe('provas sociais do perfil');
    expect(f.semPermissao).toEqual([]);
  });
  it('"5.000" e "5 mil" também contam como o mesmo número', () => {
    expect(fontesDoCriativo({ copy: 'Já são 5.000 clientes' }, { cliente }).citadas).toHaveLength(1);
    expect(fontesDoCriativo({ hook: 'Mais de 5 mil clientes' }, { cliente }).citadas).toHaveLength(1);
    expect(fontesDoCriativo({ hook: 'Quantos potes você tem aí?' }, { cliente })).toEqual({ citadas: [], semPermissao: [] });
  });
  it('número que só existe em print/OCR/métrica do perfil aparece como "não pode ser citado"', () => {
    const f = fontesDoCriativo({ copy: 'Já somos 471 seguidores!', cenas: [{ texto: 'De 63,60 kg para 62,50 kg' }] }, { cliente, materiais: [printBalanca] });
    expect(f.citadas).toEqual([]);
    expect(f.semPermissao.map((x) => x.origem)).toEqual(['linha lida de print ou do perfil', 'descrição/OCR de print']);
  });
});
