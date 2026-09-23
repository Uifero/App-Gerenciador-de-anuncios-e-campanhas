// Testes das partes PURAS da edição de vídeo (matemática de corte de proporção, validação de cortes/legendas,
// geração de .srt) — sem precisar do navegador nem do ffmpeg.wasm de verdade.
import { describe, it, expect } from 'vitest';
import { calcularCrop, validarCortes, validarSegmentosLegenda, gerarSrt, PROPORCOES_VIDEO, TRANSICOES } from './video.js';

describe('calcularCrop', () => {
  it('vídeo horizontal (16:9) para vertical (9:16): corta as laterais, mantém a altura', () => {
    const r = calcularCrop(1920, 1080, '9:16');
    expect(r.h).toBe(1080);
    expect(r.w).toBe(608); // 1080 * 9/16 = 607.5 -> arredonda pra par
    expect(r.w % 2).toBe(0);
    expect(r.x).toBe(Math.round((1920 - r.w) / 2));
    expect(r.y).toBe(0);
  });

  it('vídeo vertical para horizontal: corta em cima/baixo, mantém a largura', () => {
    const r = calcularCrop(1080, 1920, '16:9');
    expect(r.w).toBe(1080);
    expect(r.h).toBe(608);
    expect(r.h % 2).toBe(0);
  });

  it('já está na proporção pedida: praticamente não corta nada', () => {
    const r = calcularCrop(1080, 1080, '1:1');
    expect(r.w).toBe(1080);
    expect(r.h).toBe(1080);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('sempre devolve largura e altura pares (exigência do codec h264)', () => {
    const r = calcularCrop(1921, 1081, '9:16');
    expect(r.w % 2).toBe(0);
    expect(r.h % 2).toBe(0);
  });

  it('lança erro com proporção ou dimensões inválidas', () => {
    expect(() => calcularCrop(0, 100, '9:16')).toThrow();
    expect(() => calcularCrop(100, 100, 'invalida')).toThrow();
  });
});

describe('validarCortes', () => {
  it('mantém cortes válidos, ordenados pelo início', () => {
    const out = validarCortes([{ inicio: 10, fim: 15 }, { inicio: 0, fim: 5 }], 20);
    expect(out).toEqual([{ inicio: 0, fim: 5 }, { inicio: 10, fim: 15 }]);
  });

  it('descarta cortes com fim <= início (ou quase — margem de 0.1s)', () => {
    const out = validarCortes([{ inicio: 5, fim: 5 }, { inicio: 5, fim: 5.05 }, { inicio: 0, fim: 3 }], 20);
    expect(out).toEqual([{ inicio: 0, fim: 3 }]);
  });

  it('limita o fim à duração do vídeo e o início a >= 0', () => {
    const out = validarCortes([{ inicio: -5, fim: 100 }], 10);
    expect(out).toEqual([{ inicio: 0, fim: 10 }]);
  });

  it('lança erro se nenhum corte sobrar depois da validação', () => {
    expect(() => validarCortes([], 10)).toThrow(/pelo menos um trecho/);
    expect(() => validarCortes([{ inicio: 5, fim: 5 }], 10)).toThrow();
  });
});

describe('validarSegmentosLegenda', () => {
  it('mantém segmentos com texto e fim > início, ordenados', () => {
    const out = validarSegmentosLegenda([{ inicio: 3, fim: 5, texto: 'depois' }, { inicio: 0, fim: 2, texto: 'antes' }], 10);
    expect(out.map((s) => s.texto)).toEqual(['antes', 'depois']);
  });

  it('descarta segmentos sem texto ou com fim <= início', () => {
    const out = validarSegmentosLegenda([{ inicio: 0, fim: 2, texto: '' }, { inicio: 5, fim: 5, texto: 'x' }, { inicio: 0, fim: 1, texto: 'ok' }], 10);
    expect(out).toEqual([{ inicio: 0, fim: 1, texto: 'ok' }]);
  });

  it('corta o texto muito longo (limite de 200 caracteres)', () => {
    const out = validarSegmentosLegenda([{ inicio: 0, fim: 1, texto: 'x'.repeat(300) }], 10);
    expect(out[0].texto).toHaveLength(200);
  });
});

describe('gerarSrt', () => {
  it('gera o formato .srt padrão (índice, tempo HH:MM:SS,mmm, texto)', () => {
    const srt = gerarSrt([{ inicio: 0, fim: 1.5, texto: 'Olá' }, { inicio: 2, fim: 3.25, texto: 'Mundo' }]);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\nOlá\n');
    expect(srt).toContain('2\n00:00:02,000 --> 00:00:03,250\nMundo\n');
  });

  it('formata corretamente tempos acima de 1 hora', () => {
    const srt = gerarSrt([{ inicio: 3661.5, fim: 3662, texto: 'x' }]);
    expect(srt).toContain('01:01:01,500 --> 01:01:02,000');
  });
});

describe('constantes exportadas', () => {
  it('lista as proporções e transições suportadas', () => {
    expect(PROPORCOES_VIDEO.map((p) => p[0])).toEqual(['9:16', '1:1', '16:9']);
    expect(TRANSICOES.map((t) => t[0])).toEqual(['corte', 'fade']);
  });
});
