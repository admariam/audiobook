import { describe, expect, it } from 'vitest';
import {
  countReadableCharacters,
  normalizeExtractedText,
  splitIntoChunks,
  toSpeechText,
} from './text';

describe('normalizeExtractedText', () => {
  it('corrige ligaduras, hífens suaves e espaços repetidos', () => {
    const raw = 'A ﬁoresta\u00A0  é  bela.\r\nOutra\u00AD linha.  \n\n\n\nFim.';
    expect(normalizeExtractedText(raw)).toBe(
      'A fioresta é bela.\nOutra linha.\n\nFim.',
    );
  });

  it('remove caracteres de controle sem destruir quebras de linha', () => {
    expect(normalizeExtractedText('Olá\u0000 mundo\u0007!\n\n\nTexto')).toBe(
      'Olá mundo!\n\nTexto',
    );
  });
});

describe('toSpeechText', () => {
  it('junta palavras hifenizadas quebradas em linhas', () => {
    expect(toSpeechText('A pala-\nvra é bonita.')).toBe('A palavra é bonita.');
  });

  it('colapsa espaços e remove espaço antes de pontuação', () => {
    expect(toSpeechText('Olá   mundo ,   tudo bem ?\nSim.')).toBe(
      'Olá mundo, tudo bem? Sim.',
    );
  });

  it('mantém hífen em palavras compostas na mesma linha', () => {
    expect(toSpeechText('Um guarda-chuva azul.')).toBe('Um guarda-chuva azul.');
  });
});

describe('splitIntoChunks', () => {
  const sample =
    'Primeira frase curta. Segunda frase com algumas palavras para dar contexto. ' +
    'Terceira frase, com vírgulas, para simular um texto de livro. ' +
    'Quarta frase termina aqui! Quinta pergunta? Sexta frase final.';

  it('divide em blocos dentro do limite e preserva offsets', () => {
    const chunks = splitIntoChunks(sample, 80);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(80);
      expect(sample.slice(chunk.start, chunk.end)).toBe(chunk.text);
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
    for (let index = 1; index < chunks.length; index += 1) {
      expect(chunks[index].start).toBeGreaterThanOrEqual(chunks[index - 1].end);
    }
  });

  it('prefere quebras em fim de frase', () => {
    const chunks = splitIntoChunks(sample, 70);
    expect(chunks.every((chunk) => chunk.text.length <= 70)).toBe(true);
    expect(chunks.some((chunk) => /[.!?]$/.test(chunk.text))).toBe(true);
  });

  it('não perde conteúdo relevante ao remontar o texto', () => {
    const chunks = splitIntoChunks(sample, 90);
    const rebuilt = chunks
      .map((chunk) => chunk.text.replace(/\s+/g, ' ').trim())
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(rebuilt).toBe(sample.replace(/\s+/g, ' ').trim());
  });

  it('corta palavras muito longas sem entrar em loop', () => {
    const longWord = 'a'.repeat(700);
    const chunks = splitIntoChunks(longWord, 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 120)).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(longWord);
  });

  it('processa textos grandes com pontuação variada', () => {
    const sentences = Array.from(
      { length: 300 },
      (_, index) =>
        `Frase número ${index + 1} com pontuação: vírgulas, reticências… e exclamação! `,
    );
    const big = sentences.join('');
    const chunks = splitIntoChunks(big, 200);
    expect(chunks.length).toBeGreaterThan(20);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
      expect(toSpeechText(chunk.text).length).toBeGreaterThan(0);
    }
    expect(chunks[chunks.length - 1].end).toBeLessThanOrEqual(big.length);
  });

  it('retorna lista vazia para texto em branco', () => {
    expect(splitIntoChunks('   \n\n  \t ')).toEqual([]);
  });

  it('conta apenas caracteres legíveis', () => {
    expect(countReadableCharacters(' a b\nc ')).toBe(3);
  });
});
