import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookContent, BookMeta, Bookmark } from '../types';
import { defaultPreferences } from '../lib/preferences';
import {
  addBookmark,
  deleteBookmark,
  getBook,
  getBookContent,
  getBookFile,
  listBookmarks,
  updateBook,
} from '../lib/db';
import { Reader } from './Reader';

vi.mock('../lib/db', () => ({
  getBook: vi.fn(),
  getBookContent: vi.fn(),
  getBookFile: vi.fn(),
  listBookmarks: vi.fn().mockResolvedValue([]),
  updateBook: vi.fn().mockResolvedValue(null),
  addBookmark: vi.fn().mockResolvedValue(undefined),
  deleteBookmark: vi.fn().mockResolvedValue(undefined),
}));

const BOOK: BookMeta = {
  id: 'book-1',
  title: 'Livro para Teste',
  author: 'Autora Teste',
  fileName: 'livro.pdf',
  size: 4096,
  importedAt: 1000,
  lastOpenedAt: 2000,
  pageCount: 5,
  currentPage: 3,
  lastChunkIndex: 0,
  progress: 0.4,
  hasText: true,
  needsOcr: false,
  chapters: [
    { title: 'Capítulo I', page: 1, level: 0 },
    { title: 'Capítulo II', page: 3, level: 0 },
  ],
};

const CONTENT: BookContent = {
  bookId: 'book-1',
  extractedAt: 1000,
  pages: Array.from({ length: 5 }, (_, index) => ({
    page: index + 1,
    text: `Conteúdo exclusivo da página ${index + 1}. Esta frase existe apenas nesta página para testes. Outra frase com pontuação, para completar o texto.`,
  })),
};

const BOOKMARK: Bookmark = {
  id: 'mark-existing',
  bookId: 'book-1',
  page: 2,
  chunkIndex: 0,
  label: 'Marcador antigo',
  createdAt: 1500,
};

function renderReader() {
  const props = {
    bookId: 'book-1',
    preferences: { ...defaultPreferences },
    voices: { supported: true, loaded: true, voices: [], reload: vi.fn() },
    onPreferencesChange: vi.fn(),
    onBack: vi.fn(),
    notify: vi.fn(),
  };
  const utils = render(<Reader {...props} />);
  return { ...utils, props };
}

describe('Reader', () => {
  beforeEach(() => {
    vi.mocked(getBook).mockResolvedValue(BOOK);
    vi.mocked(getBookContent).mockResolvedValue(CONTENT);
    vi.mocked(getBookFile).mockResolvedValue(
      new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    );
    vi.mocked(listBookmarks).mockResolvedValue([BOOKMARK]);
    vi.mocked(updateBook).mockReset().mockResolvedValue(null);
    vi.mocked(addBookmark).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteBookmark).mockReset().mockResolvedValue(undefined);
  });

  it('retoma na página salva e mostra o conteúdo extraído', async () => {
    const { container } = renderReader();

    await waitFor(() => {
      expect(container.querySelector('.page-text')?.textContent).toContain(
        'Conteúdo exclusivo da página 3.',
      );
    });

    expect(screen.getByRole('heading', { name: 'Livro para Teste' })).toBeInTheDocument();
    expect(container.querySelector('.page-reader')).toHaveAttribute(
      'aria-label',
      'Página 3 de 5',
    );
    expect(screen.getByRole('button', { name: /Abrir marcadores \(1\)/i })).toBeInTheDocument();
  });

  it('navega entre páginas pelo teclado e salva o novo progresso', async () => {
    const { container } = renderReader();
    await waitFor(() => expect(container.querySelector('.page-text')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'PageDown' });

    await waitFor(() => {
      expect(container.querySelector('.page-text')?.textContent).toContain(
        'Conteúdo exclusivo da página 4.',
      );
    });

    await waitFor(() =>
      expect(updateBook).toHaveBeenCalledWith(
        'book-1',
        expect.objectContaining({ currentPage: 4 }),
      ),
    );
  });

  it('adiciona marcador na página atual com o atalho M', async () => {
    const { container } = renderReader();
    await waitFor(() => expect(container.querySelector('.page-text')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'm' });

    await waitFor(() => expect(addBookmark).toHaveBeenCalledTimes(1));
    expect(vi.mocked(addBookmark).mock.calls[0][0]).toMatchObject({
      bookId: 'book-1',
      page: 3,
    });
  });

  it('mostra aviso de PDF digitalizado sem OCR', async () => {
    vi.mocked(getBook).mockResolvedValue({ ...BOOK, needsOcr: true, hasText: false });
    vi.mocked(getBookContent).mockResolvedValue({
      ...CONTENT,
      pages: CONTENT.pages.map((page) => ({ ...page, text: '' })),
    });
    renderReader();

    expect(
      await screen.findByText(/PDF sem texto extraível \(possivelmente digitalizado\)/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Esta página não tem texto extraível' })).toBeInTheDocument();
  });

  it('informa quando a síntese de voz não é suportada', async () => {
    renderReaderWithVoices(false);
    expect(
      await screen.findByText(/Reprodução em voz alta indisponível/i),
    ).toBeInTheDocument();
  });

  it('volta para a biblioteca salvando o progresso', async () => {
    const { props, container } = renderReader();
    await waitFor(() => expect(container.querySelector('.page-text')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Biblioteca/i }));

    await waitFor(() => expect(props.onBack).toHaveBeenCalled());
    expect(updateBook).toHaveBeenCalled();
  });
});

function renderReaderWithVoices(supported: boolean) {
  const props = {
    bookId: 'book-1',
    preferences: { ...defaultPreferences },
    voices: { supported, loaded: true, voices: [], reload: vi.fn() },
    onPreferencesChange: vi.fn(),
    onBack: vi.fn(),
    notify: vi.fn(),
  };
  return render(<Reader {...props} />);
}
