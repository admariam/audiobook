import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BookContent, BookMeta, Bookmark } from '../types';
import {
  addBookmark,
  clearAllData,
  createBook,
  deleteBook,
  deleteDatabaseForTests,
  getBook,
  getBookContent,
  getBookFile,
  listBookmarks,
  listBooks,
  updateBook,
} from './db';

function makeBook(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    title: 'Livro de Teste',
    fileName: 'livro.pdf',
    size: 2048,
    importedAt: 1000,
    lastOpenedAt: null,
    pageCount: 2,
    currentPage: 1,
    lastChunkIndex: 0,
    progress: 0,
    hasText: true,
    needsOcr: false,
    chapters: [],
    ...overrides,
  };
}

function makeContent(bookId: string): BookContent {
  return {
    bookId,
    extractedAt: 1000,
    pages: [
      { page: 1, text: 'Primeira página.' },
      { page: 2, text: 'Segunda página.' },
    ],
  };
}

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'mark-1',
    bookId: 'book-1',
    page: 2,
    chunkIndex: 0,
    label: 'Marcador de teste',
    createdAt: 2000,
    ...overrides,
  };
}

describe('IndexedDB', () => {
  beforeEach(async () => {
    await deleteDatabaseForTests();
  });

  afterEach(async () => {
    await deleteDatabaseForTests();
  });

  it('armazena livro, PDF e texto extraído', async () => {
    const book = makeBook();
    const blob = new NodeBlob(['pdf'], { type: 'application/pdf' }) as unknown as Blob;
    await createBook(book, blob, makeContent(book.id));

    const books = await listBooks();
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('Livro de Teste');

    const stored = await getBook('book-1');
    expect(stored?.pageCount).toBe(2);

    const storedBlob = await getBookFile('book-1');
    expect(storedBlob).toBeDefined();
    expect(storedBlob?.size).toBe(3);
    expect(storedBlob?.type).toBe('application/pdf');

    const content = await getBookContent('book-1');
    expect(content?.pages[1].text).toBe('Segunda página.');
  });

  it('atualiza o progresso de leitura', async () => {
    await createBook(makeBook(), new Blob(['pdf']), makeContent('book-1'));
    const updated = await updateBook('book-1', {
      currentPage: 2,
      progress: 0.75,
      lastChunkIndex: 3,
    });
    expect(updated?.currentPage).toBe(2);
    expect(updated?.progress).toBe(0.75);
    expect(updated?.lastChunkIndex).toBe(3);

    const missing = await updateBook('nao-existe', { progress: 1 });
    expect(missing).toBeNull();
  });

  it('lista e remove marcadores', async () => {
    await addBookmark(makeBookmark());
    await addBookmark(makeBookmark({ id: 'mark-2', page: 1, label: 'Outro' }));
    await addBookmark(makeBookmark({ id: 'mark-3', bookId: 'book-2' }));

    const forBook = await listBookmarks('book-1');
    expect(forBook).toHaveLength(2);

    const all = await listBookmarks();
    expect(all).toHaveLength(3);
  });

  it('exclui livro, PDF, texto e marcadores em cascata', async () => {
    await createBook(makeBook(), new Blob(['pdf']), makeContent('book-1'));
    await createBook(
      makeBook({ id: 'book-2', title: 'Outro', fileName: 'outro.pdf' }),
      new Blob(['pdf2']),
      makeContent('book-2'),
    );
    await addBookmark(makeBookmark());
    await addBookmark(makeBookmark({ id: 'mark-2', bookId: 'book-2' }));

    await deleteBook('book-1');

    expect(await getBook('book-1')).toBeUndefined();
    expect(await getBookFile('book-1')).toBeUndefined();
    expect(await getBookContent('book-1')).toBeUndefined();
    expect(await listBookmarks('book-1')).toEqual([]);
    expect(await listBookmarks('book-2')).toHaveLength(1);
    expect(await listBooks()).toHaveLength(1);
  });

  it('limpa todos os dados mantendo o banco utilizável', async () => {
    await createBook(makeBook(), new Blob(['pdf']), makeContent('book-1'));
    await addBookmark(makeBookmark());

    await clearAllData();

    expect(await listBooks()).toEqual([]);
    expect(await listBookmarks()).toEqual([]);
    expect(await getBookContent('book-1')).toBeUndefined();

    await createBook(makeBook({ id: 'novo' }), new Blob(['x']), makeContent('novo'));
    expect(await listBooks()).toHaveLength(1);
  });
});
