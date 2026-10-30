/**
 * Organiza o texto de uma página de PDF para a leitura em voz alta.
 *
 * O PDF.js entrega pedaços de texto com tamanho de fonte e posição. Com isso dá
 * para reconhecer o que não faz parte do corpo do livro:
 * - números de nota (menores e acima da linha) viram algarismos sobrescritos (¹²³);
 * - "5as", "1º": o indicador pequeno do ordinal é colado ao número;
 * - cabeçalho e número de página no alto, em letra menor, são descartados;
 * - notas de rodapé, legendas e créditos no fim da página, em letra menor,
 *   vão para `notes` (mostradas na tela, mas não lidas).
 */

export interface LayoutItem {
  str: string;
  hasEOL?: boolean;
  /** Altura da fonte em pontos. */
  height: number;
  x: number;
  /** Linha de base (cresce para cima, como no PDF). */
  y: number;
}

export interface PageLayout {
  text: string;
  notes: string;
}

interface Line {
  text: string;
  height: number;
  /** Quantidade de caracteres, para saber quanto do texto está em cada tamanho. */
  weight: number;
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** Abaixo desta fração do corpo do texto, o pedaço é considerado "letra miúda". */
const SMALL_RATIO = 0.85;
/** Números de nota costumam ter 55–70% do tamanho do texto. */
const MARKER_RATIO = 0.8;

const PAGE_NUMBER_LINE = /^[\s\-–—|·•[\]()]*(?:p[áa]g(?:ina)?\.?\s*)?\d{1,4}(?:\s*(?:de|\/)\s*\d{1,4})?[\s\-–—|·•[\]()]*$/i;
const CREDIT_LINE = /^\s*(?:©|\(c\)|foto:|imagem:|ilustração:)/i;

export function toSuperscript(digits: string): string {
  return Array.from(digits, (char) => SUPERSCRIPT[char] ?? char).join('');
}

export function isPageNumberLine(line: string): boolean {
  return PAGE_NUMBER_LINE.test(line.trim());
}

/** Altura mais comum do texto da página, pesada pela quantidade de caracteres. */
export function dominantHeight(items: LayoutItem[]): number {
  const weights = new Map<number, number>();
  for (const item of items) {
    const length = item.str.trim().length;
    if (!length || !(item.height > 0)) continue;
    const key = Math.round(item.height * 2) / 2;
    weights.set(key, (weights.get(key) ?? 0) + length);
  }
  let best = 0;
  let bestWeight = -1;
  for (const [height, weight] of weights) {
    if (weight > bestWeight) {
      best = height;
      bestWeight = weight;
    }
  }
  return best;
}

function appendText(current: string, value: string): string {
  if (!current) return value;
  if (/\s$/.test(current) || /^[\s,.;:!?…%)\]}”’]/.test(value)) return current + value;
  return `${current} ${value}`;
}

function buildLines(items: LayoutItem[], body: number): Line[] {
  const lines: Line[] = [];
  let text = '';
  let heightSum = 0;
  let weight = 0;
  let baseline: number | null = null;
  let lastX = -Infinity;

  const flush = () => {
    const trimmed = text.replace(/[ \t]+/g, ' ').trim();
    if (trimmed) {
      lines.push({ text: trimmed, height: weight > 0 ? heightSum / weight : body, weight });
    }
    text = '';
    heightSum = 0;
    weight = 0;
    baseline = null;
    lastX = -Infinity;
  };

  for (const item of items) {
    const value = item.str;
    const trimmed = value.trim();
    const small = body > 0 && item.height > 0 && item.height < body * MARKER_RATIO;

    // Mudança grande de altura da linha de base sem hasEOL: começa outra linha.
    // Sobrescritos sobem só um pouco, por isso a tolerância.
    if (
      trimmed &&
      baseline !== null &&
      Math.abs(item.y - baseline) > Math.max(body, item.height) * 0.9 &&
      !(small && item.y > baseline)
    ) {
      flush();
    }
    // Voltou para a esquerda na mesma altura: outra coluna ou outra linha.
    if (trimmed && baseline !== null && item.x < lastX - Math.max(body, 1) * 8 && Math.abs(item.y - baseline) > 1) {
      flush();
    }

    if (trimmed) {
      const hasTextBefore = /[\p{L}\p{N}.,;:!?…”’»)\]]\s*$/u.test(text);
      if (small && hasTextBefore && /^\d{1,3}$/.test(trimmed)) {
        // Número de nota: sobrescrito colado à palavra, para não ser lido.
        text = text.replace(/\s+$/, '') + toSuperscript(trimmed);
      } else if (small && /\d$/.test(text) && /^(?:a|o|as|os|ª|º)$/.test(trimmed)) {
        // Indicador de ordinal em letra pequena: "5" + "as" → "5ªs".
        const feminine = trimmed.startsWith('a') || trimmed === 'ª';
        text += (feminine ? 'ª' : 'º') + (trimmed.endsWith('s') ? 's' : '');
      } else {
        text = appendText(text, value);
        const length = trimmed.length;
        heightSum += item.height * length;
        weight += length;
        if (baseline === null || !small) baseline = item.y;
      }
      lastX = item.x;
    } else if (value && text && !/\s$/.test(text)) {
      text += ' ';
    }

    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

/**
 * Monta o texto da página separando o corpo das margens.
 * Se quase todo o texto da página é miúdo (página de créditos, por exemplo),
 * nada é separado: o "corpo" passa a ser a letra miúda.
 */
export function layoutPage(items: LayoutItem[]): PageLayout {
  const usable = items.filter((item) => typeof item.str === 'string');
  const body = dominantHeight(usable);
  const lines = buildLines(usable, body);
  if (lines.length === 0) return { text: '', notes: '' };

  const isSmall = (line: Line) => body > 0 && line.height < body * SMALL_RATIO;

  // Cabeçalho: até três linhas miúdas no alto (título corrido, número da página).
  // Mais do que isso é conteúdo em letra menor (epígrafe, citação) e fica.
  let start = 0;
  while (start < lines.length && (isSmall(lines[start]) || isPageNumberLine(lines[start].text))) {
    start += 1;
  }
  if (start > 3) {
    start = 0;
    while (start < lines.length && isPageNumberLine(lines[start].text)) start += 1;
  }
  let end = lines.length;
  while (end > start && (isSmall(lines[end - 1]) || isPageNumberLine(lines[end - 1].text))) {
    end -= 1;
  }

  // Página só de letra miúda depois de cortar as margens: não é margem, é conteúdo.
  if (start >= end) {
    return {
      text: lines
        .filter((line) => !isPageNumberLine(line.text))
        .map((line) => line.text)
        .join('\n'),
      notes: '',
    };
  }

  const notes = lines
    .slice(end)
    .filter((line) => !isPageNumberLine(line.text) && !CREDIT_LINE.test(line.text))
    .map((line) => line.text);

  return {
    text: lines
      .slice(start, end)
      .map((line) => line.text)
      .join('\n'),
    notes: notes.join('\n'),
  };
}

/* ------------------------------------------- margens repetidas no livro */

function marginKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^\p{L}#]+/gu, ' ')
    .trim();
}

interface MarginPage {
  text: string;
}

/**
 * Reserva para PDFs em que cabeçalho e rodapé têm o mesmo tamanho do texto:
 * uma linha que aparece no alto (ou no pé) de muitas páginas seguidas é
 * cabeçalho corrido e sai do texto. Títulos de capítulo, que se repetem com
 * intervalos maiores, ficam.
 */
export function removeRepeatedMargins<T extends MarginPage>(pages: T[]): T[] {
  const slots = new Map<string, number[]>();
  const edges = (text: string) => {
    const lines = text.split('\n');
    const indexes = new Set<number>();
    for (let index = 0; index < Math.min(2, lines.length); index += 1) indexes.add(index);
    for (let index = Math.max(0, lines.length - 2); index < lines.length; index += 1) indexes.add(index);
    return { lines, indexes: Array.from(indexes) };
  };

  pages.forEach((page, pageIndex) => {
    const { lines, indexes } = edges(page.text);
    const seen = new Set<string>();
    for (const index of indexes) {
      const line = lines[index].trim();
      if (!line || line.length > 90) continue;
      const key = marginKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const list = slots.get(key) ?? [];
      list.push(pageIndex);
      slots.set(key, list);
    }
  });

  const running = new Set<string>();
  for (const [key, list] of slots) {
    if (list.length < 4 || list.length < pages.length * 0.15) continue;
    const gaps = list.slice(1).map((value, index) => value - list[index]).sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)] ?? Infinity;
    if (median <= 2) running.add(key);
  }

  return pages.map((page) => {
    const { lines, indexes } = edges(page.text);
    const drop = new Set<number>();
    for (const index of indexes) {
      const line = lines[index].trim();
      if (isPageNumberLine(line) || (line && running.has(marginKey(line)))) drop.add(index);
    }
    if (drop.size === 0) return page;
    return { ...page, text: lines.filter((_, index) => !drop.has(index)).join('\n') };
  });
}
