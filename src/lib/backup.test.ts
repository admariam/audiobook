import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Bookmark } from '../types';
import {
  BackupError,
  buildBackup,
  parseBackupFile,
  restoreBackup,
  serializeBackup,
} from './backup';
import {
  addBookmark,
  createBook,
  deleteDatabaseForTests,
  listBookmarks,
} from './db';
import { defaultPreferences } from './preferences';
import type { BookMeta } from '../types';

const BOOK: BookMeta = {
  id: 'original-id',
  title: 'Dom Casmurro',
  author: 'Machado de Assis',
  fileName: 'dom-casmurro.pdf',
  size: 12345,
  importedAt: 1000,
  lastOpenedAt: 2000,
  pageCount: 300,
  currentPage: 42,
  lastChunkIndex: 2,
  progress: 0.14,
  hasText: true,
  needsOcr: false,
  chapters: [],
};

const BOOKMARK: Bookmark = {
  id: 'm1',
  bookId: 'original-id',
  page: 42,
  chunkIndex: 1,
  label: 'Capítulo importante',
  createdAt: 3000,
};

describe('backup', () => {
  beforeEach(async () => {
    await deleteDatabaseForTests();
  });

  afterEach(async () => {
    await deleteDatabaseForTests();
  });

  it('gera backup sem o conteúdo dos PDFs', () => {
    const backup = buildBackup([BOOK], [BOOKMARK], defaultPreferences, 5000);
    expect(backup.app).toBe('audiobook-pessoal');
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe(5000);
    expect(backup.books).toHaveLength(1);
    expect(backup.books[0]).not.toHaveProperty('currentPage');
    expect(backup.bookmarks[0]).toEqual(BOOKMARK);
    expect(backup.preferences.theme).toBe('light');
  });

  it('serializa e valida um backup', () => {
    const backup = buildBackup([BOOK], [BOOKMARK], defaultPreferences);
    const parsed = parseBackupFile(serializeBackup(backup));
    expect(parsed.books[0].title).toBe('Dom Casmurro');
    expect(parsed.bookmarks).toHaveLength(1);
  });

  it('rejeita JSON inválido e backups de outra aplicação', () => {
    expect(() => parseBackupFile('{oops')).toThrow(BackupError);
    expect(() => parseBackupFile(JSON.stringify({ app: 'outro', version: 1 }))).toThrow(
      /não é um backup/i,
    );
    expect(() =>
      parseBackupFile(JSON.stringify({ app: 'audiobook-pessoal', version: 99 })),
    ).toThrow(BackupError);
  });

  it('restaura marcadores associando pelo nome e tamanho do arquivo', async () => {
    const backup = buildBackup([BOOK], [BOOKMARK], defaultPreferences);
    await createBook(
      { ...BOOK, id: 'novo-id' },
      new Blob(['pdf']),
      { bookId: 'novo-id', pages: [{ page: 1, text: 'x' }], extractedAt: 1 },
    );

    const { result, preferences } = await restoreBackup(backup);
    expect(result.bookmarksRestored).toBe(1);
    expect(result.booksMatched).toBe(1);
    expect(result.booksUnmatched).toBe(0);
    expect(preferences).toEqual(defaultPreferences);

    const bookmarks = await listBookmarks('novo-id');
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].label).toBe('Capítulo importante');
    expect(bookmarks[0].id).not.toBe('m1');
  });

  it('não duplica marcadores já existentes', async () => {
    await createBook(
      { ...BOOK, id: 'novo-id' },
      new Blob(['pdf']),
      { bookId: 'novo-id', pages: [{ page: 1, text: 'x' }], extractedAt: 1 },
    );
    await addBookmark({ ...BOOKMARK, bookId: 'novo-id' });

    const backup = buildBackup([BOOK], [BOOKMARK], defaultPreferences);
    const { result } = await restoreBackup(backup);
    expect(result.bookmarksRestored).toBe(0);
    expect(await listBookmarks('novo-id')).toHaveLength(1);
  });

  it('ignora marcadores de livros ausentes', async () => {
    const backup = buildBackup([BOOK], [BOOKMARK], defaultPreferences);
    const { result } = await restoreBackup(backup);
    expect(result.bookmarksRestored).toBe(0);
    expect(result.bookmarksSkipped).toBe(1);
    expect(result.booksUnmatched).toBe(1);
  });

});
