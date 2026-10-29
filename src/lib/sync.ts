/**
 * Sincronização de progresso e marcadores entre aparelhos.
 *
 * O estado fica num único JSON na pasta dos livros do GitHub, indexado pelo
 * caminho do PDF no repositório (o mesmo em todos os aparelhos). As mudanças
 * locais entram primeiro numa "caixa de saída" no localStorage e são enviadas
 * em lote, o que evita um commit a cada frase lida e sobrevive a quedas de rede.
 */
import type { BookMeta, Bookmark } from '../types';
import {
  isGithubConfigComplete,
  loadGithubConfig,
  readRemoteJson,
  syncFilePath,
  writeRemoteJson,
  GithubError,
  type GithubConfig,
} from './github';
import { addBookmark, deleteBookmark, listBookmarks, updateBook } from './db';

export interface SyncedBookmark {
  id: string;
  page: number;
  chunkIndex: number;
  label: string;
  createdAt: number;
}

export interface RemoteBookState {
  page: number;
  chunkIndex: number;
  progress: number;
  updatedAt: number;
  bookmarks: SyncedBookmark[];
  deletedBookmarks: string[];
}

export interface SyncState {
  app: 'audiobook-pessoal';
  version: 1;
  books: Record<string, RemoteBookState>;
}

export interface LocalUpdate {
  page: number;
  chunkIndex: number;
  progress: number;
  updatedAt: number;
  /** Lista completa de marcadores do livro neste aparelho, quando mudou. */
  bookmarks?: SyncedBookmark[];
  deletedBookmarks?: string[];
}

// v2: a v1 podia guardar a página 1 só por o livro ter sido aberto; descartada para não sobrescrever o outro aparelho.
const OUTBOX_KEY = 'audiobook-pessoal:sync-outbox:v2';
const MAX_TOMBSTONES = 500;

/* ---------------------------------------------------------- estado puro */

export function emptySyncState(): SyncState {
  return { app: 'audiobook-pessoal', version: 1, books: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeBookmark(raw: unknown): SyncedBookmark | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    page: Math.max(1, Math.round(finiteNumber(raw.page, 1))),
    chunkIndex: Math.max(0, Math.round(finiteNumber(raw.chunkIndex, 0))),
    label: typeof raw.label === 'string' ? raw.label : '',
    createdAt: finiteNumber(raw.createdAt, 0),
  };
}

function sanitizeBookState(raw: unknown): RemoteBookState | null {
  if (!isRecord(raw)) return null;
  const bookmarks = Array.isArray(raw.bookmarks)
    ? raw.bookmarks.map(sanitizeBookmark).filter((item): item is SyncedBookmark => item !== null)
    : [];
  const deleted = Array.isArray(raw.deletedBookmarks)
    ? raw.deletedBookmarks.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    page: Math.max(1, Math.round(finiteNumber(raw.page, 1))),
    chunkIndex: Math.max(0, Math.round(finiteNumber(raw.chunkIndex, 0))),
    progress: Math.min(1, Math.max(0, finiteNumber(raw.progress, 0))),
    updatedAt: finiteNumber(raw.updatedAt, 0),
    bookmarks,
    deletedBookmarks: deleted,
  };
}

export function sanitizeSyncState(raw: unknown): SyncState {
  const state = emptySyncState();
  if (!isRecord(raw) || !isRecord(raw.books)) return state;
  for (const [path, value] of Object.entries(raw.books)) {
    const book = sanitizeBookState(value);
    if (book) state.books[path] = book;
  }
  return state;
}

function sortBookmarks(list: SyncedBookmark[]): SyncedBookmark[] {
  return [...list].sort(
    (a, b) => a.page - b.page || a.chunkIndex - b.chunkIndex || a.createdAt - b.createdAt,
  );
}

/**
 * Junta o que está no GitHub com o que mudou neste aparelho.
 * Posição: vence a mais recente. Marcadores: união pelo id, menos os apagados.
 */
export function mergeBookState(
  remote: RemoteBookState | undefined,
  local: LocalUpdate,
): RemoteBookState {
  const localWins = !remote || local.updatedAt >= remote.updatedAt;
  const position = localWins
    ? {
        page: local.page,
        chunkIndex: local.chunkIndex,
        progress: local.progress,
        updatedAt: local.updatedAt,
      }
    : {
        page: remote.page,
        chunkIndex: remote.chunkIndex,
        progress: remote.progress,
        updatedAt: remote.updatedAt,
      };

  const deleted = Array.from(
    new Set([...(remote?.deletedBookmarks ?? []), ...(local.deletedBookmarks ?? [])]),
  ).slice(-MAX_TOMBSTONES);
  const deletedSet = new Set(deleted);

  const byId = new Map<string, SyncedBookmark>();
  for (const bookmark of remote?.bookmarks ?? []) byId.set(bookmark.id, bookmark);
  for (const bookmark of local.bookmarks ?? []) byId.set(bookmark.id, bookmark);

  return {
    ...position,
    bookmarks: sortBookmarks(Array.from(byId.values()).filter((item) => !deletedSet.has(item.id))),
    deletedBookmarks: deleted,
  };
}

export function applyUpdates(state: SyncState, updates: Record<string, LocalUpdate>): SyncState {
  const next: SyncState = { ...state, books: { ...state.books } };
  for (const [path, update] of Object.entries(updates)) {
    next.books[path] = mergeBookState(state.books[path], update);
  }
  return next;
}

export function toSyncedBookmark(bookmark: Bookmark): SyncedBookmark {
  return {
    id: bookmark.id,
    page: bookmark.page,
    chunkIndex: bookmark.chunkIndex,
    label: bookmark.label,
    createdAt: bookmark.createdAt,
  };
}

/* ------------------------------------------------------- caixa de saída */

export function readOutbox(): Record<string, LocalUpdate> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? (parsed as Record<string, LocalUpdate>) : {};
  } catch {
    return {};
  }
}

function writeOutbox(outbox: Record<string, LocalUpdate>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (Object.keys(outbox).length === 0) localStorage.removeItem(OUTBOX_KEY);
    else localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    // sem espaço: a próxima alteração tenta de novo
  }
}

function combineUpdates(previous: LocalUpdate | undefined, update: LocalUpdate): LocalUpdate {
  if (!previous) return update;
  const newer = update.updatedAt >= previous.updatedAt ? update : previous;
  const deleted = Array.from(
    new Set([...(previous.deletedBookmarks ?? []), ...(update.deletedBookmarks ?? [])]),
  );
  return {
    page: newer.page,
    chunkIndex: newer.chunkIndex,
    progress: newer.progress,
    updatedAt: newer.updatedAt,
    bookmarks: update.bookmarks ?? previous.bookmarks,
    deletedBookmarks: deleted.length > 0 ? deleted : undefined,
  };
}

export function queueUpdate(remotePath: string, update: LocalUpdate): void {
  const outbox = readOutbox();
  outbox[remotePath] = combineUpdates(outbox[remotePath], update);
  writeOutbox(outbox);
}

export function hasPendingUpdates(): boolean {
  return Object.keys(readOutbox()).length > 0;
}

/** Posição atual de um livro como atualização local. */
export function updateFromBook(
  book: Pick<BookMeta, 'currentPage' | 'lastChunkIndex' | 'progress' | 'lastOpenedAt' | 'positionUpdatedAt'>,
): LocalUpdate {
  return {
    page: book.currentPage,
    chunkIndex: book.lastChunkIndex,
    progress: book.progress,
    updatedAt: book.positionUpdatedAt ?? book.lastOpenedAt ?? 0,
  };
}

/* ------------------------------------------------------- envio e busca */

export async function fetchSyncState(config: GithubConfig): Promise<{ state: SyncState; sha: string | null }> {
  const remote = await readRemoteJson<unknown>(config, syncFilePath(config));
  return { state: sanitizeSyncState(remote.data), sha: remote.sha };
}

let flushPromise: Promise<boolean> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushDueAt = 0;

/**
 * Envia a caixa de saída ao GitHub. Retorna true quando não sobrou nada
 * pendente. Erros de rede deixam as mudanças guardadas para a próxima vez.
 */
export function flushOutbox(config: GithubConfig | null = loadGithubConfig()): Promise<boolean> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!isGithubConfigComplete(config)) return Promise.resolve(false);
  if (flushPromise) return flushPromise.then(() => flushOutbox(config));

  flushPromise = (async () => {
    const pending = readOutbox();
    if (Object.keys(pending).length === 0) return true;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { state, sha } = await fetchSyncState(config);
        const merged = applyUpdates(state, pending);
        await writeRemoteJson(
          config,
          syncFilePath(config),
          merged,
          sha,
          'Atualiza progresso de leitura',
        );
        // Remove só o que foi enviado; o que chegou durante o envio continua na fila.
        const current = readOutbox();
        for (const [path, update] of Object.entries(pending)) {
          if (JSON.stringify(current[path]) === JSON.stringify(update)) delete current[path];
        }
        writeOutbox(current);
        return Object.keys(current).length === 0;
      } catch (error) {
        const conflict = error instanceof GithubError && (error.status === 409 || error.status === 422);
        if (!conflict) return false;
      }
    }
    return false;
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

/**
 * Agenda um envio. Se já houver um marcado para antes, ele é mantido, de modo
 * que uma leitura contínua envia o progresso em intervalos regulares em vez de
 * adiar o envio indefinidamente.
 */
export function scheduleFlush(delayMs: number): void {
  if (!isGithubConfigComplete(loadGithubConfig())) return;
  const dueAt = Date.now() + delayMs;
  if (flushTimer !== null && flushDueAt <= dueAt) return;
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushDueAt = dueAt;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushOutbox();
  }, delayMs);
}

/**
 * Aplica no aparelho o que veio do GitHub para um livro: posição mais recente
 * e marcadores criados ou apagados em outros aparelhos.
 */
export async function applyRemoteState(book: BookMeta, remote: RemoteBookState | undefined): Promise<BookMeta> {
  if (!remote) return book;
  let result = book;

  const pending = book.remotePath ? readOutbox()[book.remotePath] : undefined;
  // Só a última mudança de posição conta; abrir o livro sem avançar não vence o outro aparelho.
  const localUpdatedAt = Math.max(book.positionUpdatedAt ?? 0, pending?.updatedAt ?? 0);
  if (remote.updatedAt > localUpdatedAt) {
    const updated = await updateBook(book.id, {
      currentPage: Math.min(Math.max(1, remote.page), Math.max(1, book.pageCount)),
      lastChunkIndex: remote.chunkIndex,
      progress: remote.progress,
      positionUpdatedAt: remote.updatedAt,
      lastOpenedAt: Math.max(book.lastOpenedAt ?? 0, remote.updatedAt),
    });
    if (updated) result = updated;
  }

  const local = await listBookmarks(book.id);
  const localIds = new Set(local.map((item) => item.id));
  const pendingDeleted = new Set(pending?.deletedBookmarks ?? []);
  const remoteDeleted = new Set(remote.deletedBookmarks);

  for (const bookmark of remote.bookmarks) {
    if (localIds.has(bookmark.id) || pendingDeleted.has(bookmark.id)) continue;
    await addBookmark({ ...bookmark, bookId: book.id });
  }
  for (const bookmark of local) {
    if (remoteDeleted.has(bookmark.id)) await deleteBookmark(bookmark.id);
  }

  return result;
}

export async function pullBook(config: GithubConfig, book: BookMeta): Promise<BookMeta> {
  if (!book.remotePath) return book;
  const { state } = await fetchSyncState(config);
  return applyRemoteState(book, state.books[book.remotePath]);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
