// Testes das regras puras da Narração e do B-roll (sem navegador).
import { describe, it, expect } from 'vitest';
import {
  montarRoteiroNarracao, textoRoteiro, textoSoFala, ajustarCenasANarracao, normalizarRoteiroIa, ritmoPara, palavrasQueCabem, tempo,
} from './narracao.js';
import { palavrasChave, sugestoesBroll, orientacaoDoFormato, nomeArquivoBroll } from './broll.js';
import { dimensoesPreviaVideo, argsPreviaVideo, filtroNarracao } from './video.js';

const CENAS = [
  { texto: 'Cansada de legging que fica transparente?', dur: 3, tipo: 'cena' },
  { texto: 'Esta não marca nem no agachamento', dur: 5, tipo: 'cena' },
  { texto: 'Compre pelo link', dur: 3, tipo: 'cta' },
];

describe('roteiro de narração', () => {
  it('segue a linha do tempo das cenas (início/fim acumulados) com tom e ritmo', () => {
    const l = montarRoteiroNarracao(CENAS);
    expect(l.map((x) => [x.inicio, x.fim])).toEqual([[0, 3], [3, 8], [8, 11]]);
    expect(l[0].tom).toMatch(/atenção/);
    expect(l[2].final).toBe(true);
    expect(l[2].tom).toMatch(/ação/);
    expect(l[1].cabem).toBe(palavrasQueCabem(5));
  });
  it('usa as falas da IA quando existem e o texto da cena onde faltam', () => {
    const ia = normalizarRoteiroIa({ direcao: 'voz feminina jovem', cenas: [{ fala: 'Sabe aquela legging?', tom: 'curioso', ritmo: 'ágil' }] }, 3);
    const l = montarRoteiroNarracao(CENAS, ia.cenas);
    expect(l[0]).toMatchObject({ fala: 'Sabe aquela legging?', tom: 'curioso', ritmo: 'ágil' });
    expect(l[1].fala).toBe(CENAS[1].texto);
    expect(textoRoteiro(l, ia.direcao)).toContain('Direção geral: voz feminina jovem');
  });
  it('o texto para colar na ferramenta de voz tem SÓ a fala (sem marcações de tempo/tom)', () => {
    const so = textoSoFala(montarRoteiroNarracao(CENAS));
    expect(so).not.toMatch(/Tom:|Cena 1|0:00/);
    expect(so.split('\n\n')).toHaveLength(3);
  });
  it('ritmo avisa quando o texto não cabe no tempo', () => {
    expect(ritmoPara('uma duas três quatro cinco seis sete oito nove dez onze doze', 2)).toMatch(/encurte/);
    expect(ritmoPara('olá', 3)).toMatch(/pausado/);
  });
  it('tempo formata m:ss', () => { expect(tempo(65.4)).toBe('1:05'); });
});

describe('ajustar cenas à narração', () => {
  it('reparte proporcionalmente e fecha exatamente na duração da narração', () => {
    const novas = ajustarCenasANarracao(CENAS, 22);
    expect(novas.reduce((a, c) => a + c.dur, 0)).toBe(22);
    expect(novas[1].dur).toBeGreaterThan(novas[0].dur);
    expect(CENAS[0].dur).toBe(3); // não altera o original
  });
  it('respeita o limite do vídeo e o mínimo de 1 s por cena', () => {
    expect(ajustarCenasANarracao(CENAS, 90).reduce((a, c) => a + c.dur, 0)).toBe(30);
    expect(ajustarCenasANarracao(CENAS, 2).every((c) => c.dur >= 1)).toBe(true);
  });
});

describe('sugestões de B-roll', () => {
  it('tira palavras vazias e mantém as de 4+ letras', () => {
    expect(palavrasChave('Compre agora a legging que não fica transparente!')).toEqual(['legging', 'fica', 'transparente']);
  });
  it('cena escolhida primeiro, depois produto e nicho, sem repetir', () => {
    const s = sugestoesBroll({ textoCena: 'Mulher treinando na academia', produto: 'Legging', nicho: 'moda fitness', hook: 'legging' });
    expect(s[0]).toBe('mulher treinando academia');
    expect(s).toContain('legging');
    expect(s).toContain('moda fitness');
    expect(new Set(s).size).toBe(s.length);
  });
  it('orientação pelo formato do vídeo', () => {
    expect(orientacaoDoFormato('1080x1920')).toBe('portrait');
    expect(orientacaoDoFormato('1080x1080')).toBe('square');
    expect(orientacaoDoFormato('1920x1080')).toBe('landscape');
  });
  it('nome de arquivo seguro', () => {
    expect(nomeArquivoBroll({ fonte: 'Pexels', id: 'pexels-v-123', tipo: 'video' })).toBe('broll-pexels-pexels-v-123.mp4');
    expect(nomeArquivoBroll({ fonte: 'Pixabay', id: 'x/../y', tipo: 'foto' }, 'image/png')).toBe('broll-pixabay-xy.png');
  });
});

describe('prévia de vídeo (480p) e mistura da narração', () => {
  it('480p no lado menor, pares, sem ampliar vídeo pequeno', () => {
    expect(dimensoesPreviaVideo(1080, 1920)).toEqual({ largura: 480, altura: 854 });
    expect(dimensoesPreviaVideo(1920, 1080)).toEqual({ largura: 854, altura: 480 });
    expect(dimensoesPreviaVideo(320, 568)).toEqual({ largura: 320, altura: 568 });
  });
  it('argumentos comprimem vídeo e áudio', () => {
    const a = argsPreviaVideo('in.mp4', 'out.mp4', { largura: 480, altura: 854 });
    expect(a).toContain('scale=480:854');
    expect(a.join(' ')).toMatch(/-crf 32/);
    expect(a.at(-1)).toBe('out.mp4');
  });
  it('narração nunca encurta o vídeo (apad) e respeita os volumes (sem normalização do amix)', () => {
    expect(filtroNarracao(false, 1.2)).toBe('[1:a]volume=1.2,apad[a]');
    const f = filtroNarracao(true, 1, 0.25);
    expect(f).toContain('[0:a]volume=0.25');
    expect(f).toContain('normalize=0');
    expect(f).toContain('duration=first');
  });
});
