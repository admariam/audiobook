import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BookContent, BookMeta, Bookmark } from '../types';

const DB_NAME = 'audiobook-pessoal';
const DB_VERSION = 1;

interface FileRecord {
  id: string;
  blob: Blob;
}

interface AudiobookDB extends DBSchema {
  books: {
    key: string;
    value: BookMeta;
    indexes: { 'by-imported': number };
  };
  files: {
    key: string;
    value: FileRecord;
  };
  contents: {
    key: string;
    value: BookContent;
  };
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: { 'by-book': string };
  };
}

let dbPromise: Promise<IDBPDatabase<AudiobookDB>> | null = null;

function getDb(): Promise<IDBPDatabase<AudiobookDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new Error(
        'Este navegador não disponibiliza IndexedDB. Não é possível armazenar livros neste dispositivo.',
      ),
    );
  }
  if (!dbPromise) {
    dbPromise = openDB<AudiobookDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const books = db.createObjectStore('books', { keyPath: 'id' });
        books.createIndex('by-imported', 'importedAt');
        db.createObjectStore('files', { keyPath: 'id' });
        db.createObjectStore('contents', { keyPath: 'bookId' });
        const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' });
        bookmarks.createIndex('by-book', 'bookId');
      },
    }).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function listBooks(): Promise<BookMeta[]> {
  const db = await getDb();
  return db.getAll('books');
}

export async function getBook(id: string): Promise<BookMeta | undefined> {
  const db = await getDb();
  return db.get('books', id);
}

export async function getBookFile(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  const record = await db.get('files', id);
  return record?.blob;
}

export async function getBookContent(id: string): Promise<BookContent | undefined> {
  const db = await getDb();
  return db.get('contents', id);
}

export async function createBook(
  book: BookMeta,
  pdfBlob: Blob,
  content: BookContent,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['books', 'files', 'contents'], 'readwrite');
  await tx.objectStore('books').put(book);
  await tx.objectStore('files').put({ id: book.id, blob: pdfBlob });
  await tx.objectStore('contents').put(content);
  await tx.done;
}

export async function saveBookContent(content: BookContent): Promise<void> {
  const db = await getDb();
  await db.put('contents', content);
}

export async function updateBook(
  id: string,
  patch: Partial<Omit<BookMeta, 'id'>>,
): Promise<BookMeta | null> {
  const db = await getDb();
  const current = await db.get('books', id);
  if (!current) return null;
  const next: BookMeta = { ...current, ...patch, id };
  await db.put('books', next);
  return next;
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['books', 'files', 'contents', 'bookmarks'], 'readwrite');
  await tx.objectStore('books').delete(id);
  await tx.objectStore('files').delete(id);
  await tx.objectStore('contents').delete(id);
  const index = tx.objectStore('bookmarks').index('by-book');
  let cursor = await index.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function listBookmarks(bookId?: string): Promise<Bookmark[]> {
  const db = await getDb();
  if (bookId) {
    return db.getAllFromIndex('bookmarks', 'by-book', bookId);
  }
  return db.getAll('bookmarks');
}

export async function addBookmark(bookmark: Bookmark): Promise<void> {
  const db = await getDb();
  await db.put('bookmarks', bookmark);
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('bookmarks', id);
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['books', 'files', 'contents', 'bookmarks'], 'readwrite');
  await Promise.all([
    tx.objectStore('books').clear(),
    tx.objectStore('files').clear(),
    tx.objectStore('contents').clear(),
    tx.objectStore('bookmarks').clear(),
  ]);
  await tx.done;
}

export async function resetDatabaseForTests(): Promise<void> {
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    db.close();
  } finally {
    dbPromise = null;
  }
}

export async function deleteDatabaseForTests(): Promise<void> {
  await resetDatabaseForTests();
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
