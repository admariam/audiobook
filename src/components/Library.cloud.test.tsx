import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../lib/preferences';
import { deleteDatabaseForTests, listBooks } from '../lib/db';
import { saveGithubConfig } from '../lib/github';
import { parsePdf } from '../lib/pdf';
import { createFakeGithub, fakeConfig, readFakeJson, type FakeGithub } from '../test/fakeGithub';
import { Library } from './Library';

vi.mock('../lib/pdf', () => ({
  parsePdf: vi.fn(),
  describePdfError: vi.fn(() => 'Falha ao processar PDF.'),
}));

const parsed = {
  title: 'Livro de teste',
  pageCount: 2,
  pages: [
    { page: 1, text: 'Primeira página.' },
    { page: 2, text: 'Segunda página.' },
  ],
  chapters: [],
  needsOcr: false,
};

function renderLibrary() {
  const props = {
    books: [],
    loading: false,
    loadError: null,
    preferences: { ...defaultPreferences },
    onPreferencesChange: vi.fn(),
    onOpenBook: vi.fn(),
    onBooksChanged: vi.fn(),
    onDataCleared: vi.fn(),
    notify: vi.fn(),
  };
  render(<Library {...props} />);
  return props;
}

describe('Library com GitHub', () => {
  let fake: FakeGithub;

  beforeEach(async () => {
    localStorage.clear();
    await deleteDatabaseForTests();
    fake = createFakeGithub();
    vi.stubGlobal('fetch', fake.fetch);
    saveGithubConfig(fakeConfig);
    vi.mocked(parsePdf).mockReset();
    vi.mocked(parsePdf).mockResolvedValue(parsed);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os livros do GitHub e baixa com a página salva em outro aparelho', async () => {
    fake.files.set('livros/Remoto.pdf', { content: new Uint8Array([37, 80, 68, 70]), sha: 'sha-remoto' });
    fake.files.set('livros/progresso.json', {
      content: new TextEncoder().encode(
        JSON.stringify({
          app: 'audiobook-pessoal',
          version: 1,
          books: {
            'livros/Remoto.pdf': {
              page: 2,
              chunkIndex: 0,
              progress: 0.5,
              updatedAt: 1234,
              bookmarks: [],
              deletedBookmarks: [],
            },
          },
        }),
      ),
      sha: 'sha-progresso',
    });

    const props = renderLibrary();
    expect(await screen.findByText('Remoto')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nenhum livro baixado neste aparelho' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Baixar e ler/i }));

    await waitFor(() => expect(props.onOpenBook).toHaveBeenCalled());
    const [book] = await listBooks();
    expect(book).toMatchObject({ remotePath: 'livros/Remoto.pdf', currentPage: 2, progress: 0.5 });
    expect(props.onOpenBook).toHaveBeenCalledWith(book.id);
  });

  it('envia ao GitHub o PDF importado neste aparelho', async () => {
    renderLibrary();
    await screen.findByText(/Sincronizado com admariam\/audiobook/);

    const input = screen.getByLabelText('Selecionar arquivos PDF');
    await userEvent.upload(input, new File(['%PDF'], 'Novo livro.pdf', { type: 'application/pdf' }));

    await waitFor(async () => {
      const [book] = await listBooks();
      expect(book?.remotePath).toBe('livros/Novo livro.pdf');
    });
    expect(fake.files.has('livros/Novo livro.pdf')).toBe(true);
    await waitFor(() =>
      expect(readFakeJson(fake, 'livros/progresso.json')).toMatchObject({
        books: { 'livros/Novo livro.pdf': { page: 1 } },
      }),
    );
  });
});
