import type { TextChunk } from '../types';

const LIGATURES: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
};

/**
 * Normaliza o texto extraído do PDF sem destruir a estrutura de parágrafos.
 * Também corrige ligaduras tipográficas que atrapalham a síntese de voz.
 */
export function normalizeExtractedText(input: string): string {
  let text = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00AD|\u200B|\u200C|\u200D|\uFEFF/g, '')
    .replace(/\u00A0/g, ' ');

  text = Array.from(text)
    .map((char) => LIGATURES[char] ?? char)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 9 || code === 10) return true;
      if (code < 32) return false;
      if (code >= 127 && code <= 159) return false;
      return true;
    })
    .join('');

  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n');

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Versão limpa para enviar à síntese de voz: junta linhas quebradas,
 * resolve palavras hifenizadas no fim da linha e colapsa espaços.
 */
export function toSpeechText(raw: string): string {
  return raw
    .replace(/(\p{L})-[ \t]*\n[ \t]*(\p{Ll})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .trim();
}

const MAX_CHUNK_LENGTH = 240;
const MIN_BREAK_RATIO = 0.5;

/**
 * Divide o texto em blocos curtos, com offsets no texto original.
 * Blocos curtos evitam falhas e cortes da Web Speech API em textos longos.
 */
export function splitIntoChunks(raw: string, maxLength = MAX_CHUNK_LENGTH): TextChunk[] {
  const chunks: TextChunk[] = [];
  const length = raw.length;
  const safeMax = Math.max(40, maxLength);
  let cursor = 0;

  const push = (start: number, end: number) => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(raw[s])) s += 1;
    while (e > s && /\s/.test(raw[e - 1])) e -= 1;
    if (e <= s) return;
    const text = raw.slice(s, e);
    if (!toSpeechText(text)) return;
    chunks.push({ text, start: s, end: e });
  };

  while (cursor < length) {
    while (cursor < length && /\s/.test(raw[cursor])) cursor += 1;
    if (cursor >= length) break;

    const start = cursor;
    const hardLimit = Math.min(length, start + safeMax);
    let end = hardLimit;

    if (hardLimit < length) {
      const windowStart = start + Math.floor(safeMax * MIN_BREAK_RATIO);
      let sentenceBreak = -1;
      let clauseBreak = -1;
      let spaceBreak = -1;

      for (let i = hardLimit; i > windowStart; i -= 1) {
        const previous = raw[i - 1];
        const next = raw[i];
        if (/[.!?…]/.test(previous) && (next === undefined || /[\s"”’)\]]/.test(next))) {
          sentenceBreak = i;
          break;
        }
        if (clauseBreak < 0 && /[;:,]/.test(previous) && next !== undefined && /\s/.test(next)) {
          clauseBreak = i;
        }
        if (spaceBreak < 0 && next !== undefined && /\s/.test(next)) {
          spaceBreak = i;
        }
      }

      if (sentenceBreak > start) end = sentenceBreak;
      else if (clauseBreak > start) end = clauseBreak;
      else if (spaceBreak > start) end = spaceBreak;
    }

    if (end <= start) end = Math.min(length, start + safeMax);
    push(start, end);
    cursor = end;
  }

  return chunks;
}

export function countReadableCharacters(text: string): number {
  return text.replace(/\s/g, '').length;
}
