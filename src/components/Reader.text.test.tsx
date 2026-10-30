import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookMeta } from '../types';
import { defaultPreferences } from '../lib/preferences';
import { createBook, deleteDatabaseForTests, getBookContent } from '../lib/db';
import { parsePdf } from '../lib/pdf';
import { TEXT_VERSION } from '../lib/text';
import { Reader } from './Reader';

vi.mock('../lib/pdf', () => ({
  parsePdf: vi.fn(),
  describePdfError: vi.fn(() => 'erro'),
}));

const BOOK: BookMeta = {
  id: 'old-book',
  title: 'Livro antigo',
  fileName: 'antigo.pdf',
  size: 10,
  importedAt: 1,
  lastOpenedAt: 1,
  pageCount: 2,
  currentPage: 2,
  lastChunkIndex: 0,
  progress: 0.5,
  hasText: true,
  needsOcr: false,
  chapters: [],
};

describe('Reader com livro importado antes da leitura inteligente', () => {
  beforeEach(async () => {
    await deleteDatabaseForTests();
    await createBook(BOOK, new Blob(['%PDF']), {
      bookId: BOOK.id,
      extractedAt: 1,
      pages: [
        { page: 1, text: 'Página um.' },
        { page: 2, text: 'Parte I - Cabeçalho\nTexto antigo com nota 1.\n1. Nota de rodapé antiga.' },
      ],
    });
    vi.mocked(parsePdf).mockResolvedValue({
      title: 'Livro antigo',
      pageCount: 2,
      chapters: [],
      needsOcr: false,
      pages: [
        { page: 1, text: 'Página um.' },
        { page: 2, text: 'Texto novo com nota¹.', notes: '1. Nota de rodapé.' },
      ],
    });
  });

  it('refaz a extração uma vez, mantém a página e mostra as notas sem lê-las', async () => {
    render(
      <Reader
        bookId={BOOK.id}
        preferences={{ ...defaultPreferences }}
        voices={{ supported: true, loaded: true, voices: [], reload: vi.fn() }}
        onPreferencesChange={vi.fn()}
        onBack={vi.fn()}
        notify={vi.fn()}
      />,
    );

    expect((await screen.findAllByText(/Texto novo com nota¹/)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Notas desta página')).toHaveTextContent('1. Nota de rodapé.');
    // O texto falado não traz o número da nota.
    expect(screen.getAllByText(/Texto novo com nota\./).length).toBeGreaterThan(0);

    const saved = await getBookContent(BOOK.id);
    expect(saved?.textVersion).toBe(TEXT_VERSION);
    expect(saved?.pages[1].notes).toBe('1. Nota de rodapé.');
    expect(parsePdf).toHaveBeenCalledTimes(1);
  });
});
