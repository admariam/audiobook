import type {
  BackupFile,
  BackupImportResult,
  BookMeta,
  Bookmark,
  Preferences,
} from '../types';
import { addBookmark, listBooks, listBookmarks } from './db';
import { createId } from './ids';
import { sanitizePreferences } from './preferences';

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function buildBackup(
  books: BookMeta[],
  bookmarks: Bookmark[],
  preferences: Preferences,
  exportedAt = Date.now(),
): BackupFile {
  return {
    app: 'audiobook-pessoal',
    version: 1,
    exportedAt,
    books: books.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      fileName: book.fileName,
      size: book.size,
      pageCount: book.pageCount,
    })),
    bookmarks: bookmarks.map((bookmark) => ({ ...bookmark })),
    preferences: { ...preferences },
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function parseBackupFile(raw: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new BackupError('O arquivo selecionado não é um JSON válido.');
  }

  if (typeof data !== 'object' || data === null) {
    throw new BackupError('O arquivo de backup não tem o formato esperado.');
  }

  const record = data as Record<string, unknown>;
  if (record.app !== 'audiobook-pessoal' || record.version !== 1) {
    throw new BackupError(
      'Este arquivo não é um backup do Audiobook Marcio ou usa uma versão incompatível.',
    );
  }

  if (!Array.isArray(record.books) || !Array.isArray(record.bookmarks)) {
    throw new BackupError('O backup está incompleto: livros ou marcadores ausentes.');
  }

  const books = record.books
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      title: typeof item.title === 'string' ? item.title : 'Livro sem título',
      author: typeof item.author === 'string' ? item.author : undefined,
      fileName: typeof item.fileName === 'string' ? item.fileName : '',
      size: typeof item.size === 'number' ? item.size : 0,
      pageCount: typeof item.pageCount === 'number' ? item.pageCount : 1,
    }))
    .filter((item) => item.id && item.fileName);

  const bookmarks = record.bookmarks
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : createId(),
      bookId: typeof item.bookId === 'string' ? item.bookId : '',
      page: typeof item.page === 'number' ? Math.max(1, Math.floor(item.page)) : 1,
      chunkIndex:
        typeof item.chunkIndex === 'number' ? Math.max(0, Math.floor(item.chunkIndex)) : 0,
      label: typeof item.label === 'string' ? item.label : 'Marcador',
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    }))
    .filter((item) => item.bookId);

  return {
    app: 'audiobook-pessoal',
    version: 1,
    exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
    books,
    bookmarks,
    preferences: sanitizePreferences(record.preferences),
  };
}

/**
 * Restaura marcadores nos livros existentes. PDFs não fazem parte do backup;
 * por isso livros ausentes têm seus marcadores contabilizados como ignorados.
 */
export async function restoreBackup(backup: BackupFile): Promise<{
  result: BackupImportResult;
  preferences: Preferences;
}> {
  const [books, existingBookmarks] = await Promise.all([listBooks(), listBookmarks()]);

  const idMap = new Map<string, string>();
  const matchedBookIds = new Set<string>();

  for (const backupBook of backup.books) {
    const match =
      books.find(
        (book) => book.fileName === backupBook.fileName && book.size === backupBook.size,
      ) ??
      books.find((book) => book.title === backupBook.title && book.pageCount === backupBook.pageCount);
    if (match) {
      idMap.set(backupBook.id, match.id);
      matchedBookIds.add(match.id);
    }
  }

  const duplicateKey = (bookmark: Bookmark) =>
    `${bookmark.bookId}|${bookmark.page}|${bookmark.chunkIndex}|${bookmark.label}`;
  const known = new Set(existingBookmarks.map(duplicateKey));

  let restored = 0;
  let skipped = 0;

  for (const bookmark of backup.bookmarks) {
    const targetBookId = idMap.get(bookmark.bookId);
    if (!targetBookId) {
      skipped += 1;
      continue;
    }
    const next: Bookmark = {
      ...bookmark,
      id: createId(),
      bookId: targetBookId,
    };
    if (known.has(duplicateKey(next))) {
      continue;
    }
    await addBookmark(next);
    known.add(duplicateKey(next));
    restored += 1;
  }

  const booksUnmatched = backup.books.filter((book) => {
    const mapped = idMap.get(book.id);
    return !mapped;
  }).length;

  return {
    result: {
      bookmarksRestored: restored,
      bookmarksSkipped: skipped,
      preferencesRestored: true,
      booksMatched: matchedBookIds.size,
      booksUnmatched,
    },
    preferences: backup.preferences,
  };
}
