import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookMeta, Preferences } from '../types';
import { defaultPreferences } from '../lib/preferences';
import { createBook, deleteBook, getBookFile, updateBook } from '../lib/db';
import { generateCover, parsePdf } from '../lib/pdf';
import { Library } from './Library';

vi.mock('../lib/db', () => ({
  createBook: vi.fn().mockResolvedValue(undefined),
  deleteBook: vi.fn().mockResolvedValue(undefined),
  listBookmarks: vi.fn().mockResolvedValue([]),
  clearAllData: vi.fn().mockResolvedValue(undefined),
  getBookFile: vi.fn().mockResolvedValue(new Blob(['%PDF'])),
  updateBook: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/pdf', () => ({
  generateCover: vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA'),
  parsePdf: vi.fn(),
  describePdfError: vi.fn(() => 'Falha ao processar PDF.'),
}));

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Dom Casmurro',
    author: 'Machado de Assis',
    fileName: 'dom-casmurro.pdf',
    size: 2_400_000,
    importedAt: 2000,
    lastOpenedAt: 3000,
    pageCount: 256,
    currentPage: 64,
    lastChunkIndex: 1,
    progress: 0.25,
    hasText: true,
    needsOcr: false,
    chapters: [{ title: 'Capítulo I', page: 5, level: 0 }],
    ...overrides,
  };
}

const preferences: Preferences = { ...defaultPreferences };

function renderLibrary(books: BookMeta[], options: { preferences?: Preferences } = {}) {
  const props = {
    books,
    loading: false,
    loadError: null,
    preferences: options.preferences ?? preferences,
    onPreferencesChange: vi.fn(),
    onOpenBook: vi.fn(),
    onBooksChanged: vi.fn(),
    onDataCleared: vi.fn(),
    notify: vi.fn(),
  };
  const utils = render(<Library {...props} />);
  return { ...utils, props };
}

describe('Library', () => {
  beforeEach(() => {
    vi.mocked(createBook).mockClear();
    vi.mocked(deleteBook).mockClear();
    vi.mocked(parsePdf).mockReset();
  });

  it('mostra estado vazio quando não há livros', () => {
    renderLibrary([]);
    expect(screen.getByRole('heading', { name: 'Sua estante está vazia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importar meu primeiro PDF/i })).toBeInTheDocument();
  });

  it('lista livros com progresso, tamanho e capítulos', () => {
    renderLibrary([makeBook()]);
    expect(screen.getByRole('heading', { name: 'Dom Casmurro' })).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('Página 64 de 256')).toBeInTheDocument();
    expect(screen.getByText('1 capítulo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument();
  });

  it('filtra por título ignorando acentos', async () => {
    const user = userEvent.setup();
    renderLibrary([
      makeBook(),
      makeBook({
        id: 'book-2',
        title: 'Memórias Póstumas',
        fileName: 'memorias.pdf',
        progress: 0.5,
        currentPage: 128,
      }),
    ]);

    await user.type(screen.getByLabelText('Buscar livros por título ou autor'), 'memorias');
    expect(screen.getByRole('heading', { name: 'Memórias Póstumas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dom Casmurro' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar livros por título ou autor'));
    expect(screen.getByRole('heading', { name: 'Dom Casmurro' })).toBeInTheDocument();
  });

  it('ordena por título', async () => {
    const user = userEvent.setup();
    renderLibrary([
      makeBook({ id: 'b', title: 'Zebras', fileName: 'z.pdf', importedAt: 300 }),
      makeBook({ id: 'a', title: 'Abelhas', fileName: 'a.pdf', importedAt: 200 }),
    ]);

    const headingsBefore = screen.getAllByRole('heading', { level: 3 });
    expect(headingsBefore[0]).toHaveTextContent('Zebras');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Ordenar livros' }), 'title');
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings[0]).toHaveTextContent('Abelhas');
    expect(headings[1]).toHaveTextContent('Zebras');
  });

  it('pede confirmação antes de excluir e remove ao confirmar', async () => {
    const user = userEvent.setup();
    const { props } = renderLibrary([makeBook()]);

    await user.click(screen.getByRole('button', { name: 'Excluir Dom Casmurro' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Excluir este livro\?/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Excluir livro' }));
    await waitFor(() => expect(deleteBook).toHaveBeenCalledWith('book-1'));
    expect(props.onBooksChanged).toHaveBeenCalled();
  });

  it('não exclui se a confirmação for cancelada', async () => {
    const user = userEvent.setup();
    renderLibrary([makeBook()]);

    await user.click(screen.getByRole('button', { name: 'Excluir Dom Casmurro' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteBook).not.toHaveBeenCalled();
  });

  it('importa um PDF, extrai o texto e atualiza a biblioteca', async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockResolvedValue({
      title: 'Meu Livro',
      author: 'Autora',
      pageCount: 2,
      pages: [
        { page: 1, text: 'Primeira página.' },
        { page: 2, text: 'Segunda página.' },
      ],
      chapters: [],
      needsOcr: false,
    });
    const { props } = renderLibrary([]);

    const file = new File(['%PDF-1.4'], 'meu-livro.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Selecionar arquivos PDF'), file);

    await waitFor(() => expect(createBook).toHaveBeenCalledTimes(1));
    const [meta, , content] = vi.mocked(createBook).mock.calls[0];
    expect(meta.title).toBe('Meu Livro');
    expect(meta.pageCount).toBe(2);
    expect(meta.hasText).toBe(true);
    expect(content.pages).toHaveLength(2);
    expect(props.onBooksChanged).toHaveBeenCalled();
    expect(props.notify).toHaveBeenCalledWith(
      expect.stringContaining('Meu Livro'),
      'success',
    );
  });

  it('avisa sobre PDF sem texto extraível', async () => {
    const user = userEvent.setup();
    vi.mocked(parsePdf).mockResolvedValue({
      title: 'Digitalizado',
      pageCount: 1,
      pages: [{ page: 1, text: '' }],
      chapters: [],
      needsOcr: true,
    });
    const { props } = renderLibrary([]);

    const file = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Selecionar arquivos PDF'), file);

    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith(
        expect.stringContaining('OCR'),
        'info',
      ),
    );
  });

  it('gera a miniatura da primeira página para livros antigos', async () => {
    vi.mocked(getBookFile).mockResolvedValue(new Blob(['%PDF']));
    vi.mocked(generateCover).mockResolvedValue('data:image/jpeg;base64,AAAA');
    const { props } = renderLibrary([makeBook()]);
    await waitFor(() =>
      expect(updateBook).toHaveBeenCalledWith('book-1', { cover: 'data:image/jpeg;base64,AAAA' }),
    );
    expect(props.onBooksChanged).toHaveBeenCalled();
  });

  it('mostra a miniatura no lugar da capa padrão', () => {
    const { container } = renderLibrary([makeBook({ cover: 'data:image/jpeg;base64,AAAA' })]);
    expect(container.querySelector('img.book-card__thumb')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,AAAA',
    );
  });
});
