import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookMeta } from '../types';
import { defaultPreferences } from '../lib/preferences';
import { createBook, deleteDatabaseForTests } from '../lib/db';
import { saveGithubConfig } from '../lib/github';
import { readOutbox } from '../lib/sync';
import { createFakeGithub, fakeConfig, type FakeGithub } from '../test/fakeGithub';
import { Reader } from './Reader';

const BOOK: BookMeta = {
  id: 'book-cloud',
  title: 'Livro na nuvem',
  fileName: 'Livro.pdf',
  size: 10,
  importedAt: 1,
  lastOpenedAt: 1000,
  pageCount: 5,
  currentPage: 1,
  lastChunkIndex: 0,
  progress: 0,
  hasText: true,
  needsOcr: false,
  chapters: [],
  remotePath: 'livros/Livro.pdf',
};

describe('Reader com GitHub', () => {
  let fake: FakeGithub;

  beforeEach(async () => {
    localStorage.clear();
    await deleteDatabaseForTests();
    await createBook(BOOK, new Blob(['%PDF']), {
      bookId: BOOK.id,
      extractedAt: 1,
      pages: Array.from({ length: 5 }, (_, index) => ({
        page: index + 1,
        text: `Texto exclusivo da página ${index + 1}.`,
      })),
    });
    fake = createFakeGithub();
    fake.files.set('livros/progresso.json', {
      content: new TextEncoder().encode(
        JSON.stringify({
          books: {
            'livros/Livro.pdf': {
              page: 4,
              chunkIndex: 0,
              progress: 0.6,
              updatedAt: 5000,
              bookmarks: [{ id: 'm1', page: 2, chunkIndex: 0, label: 'Lido no celular', createdAt: 1 }],
              deletedBookmarks: [],
            },
          },
        }),
      ),
      sha: 'sha-1',
    });
    vi.stubGlobal('fetch', fake.fetch);
    saveGithubConfig(fakeConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('abre na página em que parou no outro aparelho e envia novos marcadores', async () => {
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

    expect((await screen.findAllByText(/Texto exclusivo da página 4/)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Texto exclusivo da página 1/)).toHaveLength(0);

    await userEvent.keyboard('m');
    await vi.waitFor(() => {
      const pending = readOutbox()['livros/Livro.pdf'];
      expect(pending?.bookmarks?.map((item) => item.id)).toContain('m1');
      expect(pending?.bookmarks).toHaveLength(2);
    });
  });
});
