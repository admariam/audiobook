import { describe, expect, it } from 'vitest';
import { layoutPage, removeRepeatedMargins, type LayoutItem } from './layout';

const line = (str: string, y: number, height = 12, x = 80): LayoutItem => ({ str, y, height, x, hasEOL: true });
const part = (str: string, y: number, height = 12, x = 80): LayoutItem => ({ str, y, height, x });

describe('layoutPage', () => {
  it('separa cabeçalho, número de página e notas de rodapé', () => {
    const items = [
      line('Parte I - Excelência e necessidade da devoção', 581, 9.5),
      line('-20-', 561, 10),
      line('Primeira linha do corpo do texto, bem comprida para pesar.', 540),
      part('é acumular coroas de méritos no Reino dos Céus”.', 400),
      { ...part('1', 404, 7, 338), hasEOL: true },
      line('Segunda linha do corpo do texto, também comprida o bastante.', 385),
      line('1. CORRÊA DE OLIVEIRA, Plinio. Grignion de Montfort.', 110, 8),
      line('© Sergio Hollmann', 90, 8),
    ];
    const result = layoutPage(items);
    expect(result.text).not.toContain('Parte I');
    expect(result.text).not.toContain('-20-');
    expect(result.text).toContain('Reino dos Céus”.¹');
    expect(result.notes).toBe('1. CORRÊA DE OLIVEIRA, Plinio. Grignion de Montfort.');
  });

  it('cola o indicador pequeno do ordinal ao número', () => {
    const items = [
      part('dado em 5', 500, 14),
      part('as', 504, 8),
      { ...part(' Moradas, capítulo 4, com texto de corpo suficiente.', 500, 14), hasEOL: true },
    ];
    expect(layoutPage(items).text).toBe('dado em 5ªs Moradas, capítulo 4, com texto de corpo suficiente.');
  });

  it('número de parágrafo do tamanho do texto continua no texto', () => {
    const items = [line('1 POUCAS COISAS, das que tenho feito em obediência às ordens', 500, 14.4)];
    expect(layoutPage(items).text).toBe('1 POUCAS COISAS, das que tenho feito em obediência às ordens');
  });

  it('página toda em letra miúda não é tratada como margem', () => {
    const items = [line('Editora Exemplo Ltda', 500, 8), line('Rua Tal, 100', 480, 8), line('São Paulo', 460, 8)];
    expect(layoutPage(items).text).toBe('Editora Exemplo Ltda\nRua Tal, 100\nSão Paulo');
  });
});

describe('removeRepeatedMargins', () => {
  it('tira cabeçalho corrido do mesmo tamanho do texto, mas não títulos de capítulo espaçados', () => {
    const pages = Array.from({ length: 12 }, (_, index) => ({
      text: [
        'O Castelo Interior',
        index % 5 === 0 ? 'CAPÍTULO 1' : 'texto corrido da página',
        'mais texto do corpo',
        String(index + 10),
      ].join('\n'),
    }));
    const cleaned = removeRepeatedMargins(pages);
    expect(cleaned.every((page) => !page.text.includes('O Castelo Interior'))).toBe(true);
    expect(cleaned.every((page) => !/\n\d+$/.test(page.text))).toBe(true);
    expect(cleaned[0].text).toContain('CAPÍTULO 1');
    expect(cleaned[5].text).toContain('CAPÍTULO 1');
  });
});
