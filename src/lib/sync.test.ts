import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookMeta } from '../types';
import { saveGithubConfig } from './github';
import {
  applyRemoteState,
  emptySyncState,
  flushOutbox,
  mergeBookState,
  queueUpdate,
  readOutbox,
  sanitizeSyncState,
  type RemoteBookState,
} from './sync';
import { addBookmark, createBook, deleteDatabaseForTests, getBook, listBookmarks } from './db';
import { createFakeGithub, fakeConfig, readFakeJson, type FakeGithub } from '../test/fakeGithub';

const bookmark = (id: string, page = 1) => ({ id, page, chunkIndex: 0, label: id, createdAt: 1 });

function remoteState(overrides: Partial<RemoteBookState> = {}): RemoteBookState {
  return {
    page: 10,
    chunkIndex: 2,
    progress: 0.1,
    updatedAt: 1000,
    bookmarks: [],
    deletedBookmarks: [],
    ...overrides,
  };
}

describe('mergeBookState', () => {
  it('fica com a posição mais recente', () => {
    const remote = remoteState({ updatedAt: 2000, page: 30 });
    expect(mergeBookState(remote, { page: 5, chunkIndex: 0, progress: 0.05, updatedAt: 1000 }).page).toBe(30);
    expect(mergeBookState(remote, { page: 40, chunkIndex: 1, progress: 0.4, updatedAt: 3000 }).page).toBe(40);
  });

  it('une marcadores dos dois aparelhos e respeita os apagados', () => {
    const remote = remoteState({ bookmarks: [bookmark('a'), bookmark('b', 3)] });
    const merged = mergeBookState(remote, {
      page: 1,
      chunkIndex: 0,
      progress: 0,
      updatedAt: 1,
      bookmarks: [bookmark('c', 2)],
      deletedBookmarks: ['a'],
    });
    expect(merged.bookmarks.map((item) => item.id)).toEqual(['c', 'b']);
    expect(merged.deletedBookmarks).toEqual(['a']);
  });

  it('ignora dados inválidos no JSON remoto', () => {
    const state = sanitizeSyncState({ books: { 'livros/x.pdf': { page: 'x', bookmarks: [{ nope: 1 }] }, y: 3 } });
    expect(state.books['livros/x.pdf']).toMatchObject({ page: 1, bookmarks: [] });
    expect(state.books.y).toBeUndefined();
    expect(sanitizeSyncState(null)).toEqual(emptySyncState());
  });
});

describe('caixa de saída e envio', () => {
  let fake: FakeGithub;

  beforeEach(() => {
    localStorage.clear();
    fake = createFakeGithub();
    vi.stubGlobal('fetch', fake.fetch);
    saveGithubConfig(fakeConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('junta várias mudanças e envia num único commit', async () => {
    queueUpdate('livros/a.pdf', { page: 2, chunkIndex: 0, progress: 0.1, updatedAt: 10 });
    queueUpdate('livros/a.pdf', { page: 3, chunkIndex: 4, progress: 0.2, updatedAt: 20 });
    queueUpdate('livros/b.pdf', { page: 7, chunkIndex: 1, progress: 0.5, updatedAt: 15 });

    await expect(flushOutbox()).resolves.toBe(true);
    expect(fake.commits).toEqual(['Atualiza progresso de leitura']);
    expect(readOutbox()).toEqual({});

    const saved = readFakeJson(fake, 'livros/progresso.json') as { books: Record<string, RemoteBookState> };
    expect(saved.books['livros/a.pdf']).toMatchObject({ page: 3, chunkIndex: 4 });
    expect(saved.books['livros/b.pdf']).toMatchObject({ page: 7 });
  });

  it('tenta de novo quando outro aparelho gravou ao mesmo tempo', async () => {
    queueUpdate('livros/a.pdf', { page: 2, chunkIndex: 0, progress: 0.1, updatedAt: 10 });
    fake.failNextJsonWrite();
    await expect(flushOutbox()).resolves.toBe(true);
    expect(readFakeJson(fake, 'livros/progresso.json')).toBeTruthy();
  });

  it('guarda as mudanças quando está sem internet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    queueUpdate('livros/a.pdf', { page: 2, chunkIndex: 0, progress: 0.1, updatedAt: 10 });
    await expect(flushOutbox()).resolves.toBe(false);
    expect(Object.keys(readOutbox())).toEqual(['livros/a.pdf']);
  });
});

describe('applyRemoteState', () => {
  const book: BookMeta = {
    id: 'local-1',
    title: 'Livro',
    fileName: 'Livro.pdf',
    size: 10,
    importedAt: 1,
    lastOpenedAt: 500,
    pageCount: 100,
    currentPage: 3,
    lastChunkIndex: 0,
    progress: 0.02,
    hasText: true,
    needsOcr: false,
    chapters: [],
    remotePath: 'livros/Livro.pdf',
  };

  beforeEach(async () => {
    localStorage.clear();
    await deleteDatabaseForTests();
    await createBook(book, new Blob(['x']), { bookId: book.id, pages: [], extractedAt: 1 });
  });

  it('traz a página lida em outro aparelho e os marcadores de lá', async () => {
    await addBookmark({ ...bookmark('velho'), bookId: book.id });
    await applyRemoteState(
      book,
      remoteState({ page: 42, updatedAt: 900, bookmarks: [bookmark('novo', 40)], deletedBookmarks: ['velho'] }),
    );
    expect(await getBook(book.id)).toMatchObject({ currentPage: 42, lastChunkIndex: 2, lastOpenedAt: 900 });
    expect((await listBookmarks(book.id)).map((item) => item.id)).toEqual(['novo']);
  });

  it('não volta a página quando este aparelho leu depois', async () => {
    await applyRemoteState(book, remoteState({ page: 42, updatedAt: 100 }));
    expect(await getBook(book.id)).toMatchObject({ currentPage: 3 });
  });
});
