import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookMeta, Preferences, SortKey } from '../types';
import { createBook, deleteBook, getBookFile, listBookmarks, updateBook } from '../lib/db';
import {
  deleteRemoteFile,
  downloadRemoteBook,
  listRemoteBooks,
  loadGithubConfig,
  remoteTitle,
  safeFileName,
  uniqueFileName,
  uploadRemoteBook,
  type GithubConfig,
  type RemoteBook,
} from '../lib/github';
import {
  applyRemoteState,
  fetchSyncState,
  flushOutbox,
  queueUpdate,
  toSyncedBookmark,
  updateFromBook,
} from '../lib/sync';
import { createId } from '../lib/ids';
import { formatBytes, pluralize } from '../lib/format';
import type { ToastTone } from './Toasts';
import { BookCard } from './BookCard';
import { CloudDialog } from './CloudDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { DataDialog } from './DataDialog';
import { HelpDialog } from './HelpDialog';
import {
  BookOpenIcon,
  CloudDownloadIcon,
  CloudIcon,
  DownloadIcon,
  KeyboardIcon,
  LogoIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
} from './icons';

const MAX_FILE_SIZE = 300 * 1024 * 1024;

interface ImportProgress {
  fileName: string;
  fileIndex: number;
  fileCount: number;
  page: number;
  pageCount: number;
  percent: number;
  stage: 'extract' | 'upload' | 'download';
}

interface LibraryProps {
  books: BookMeta[];
  loading: boolean;
  loadError: string | null;
  preferences: Preferences;
  onPreferencesChange: (patch: Partial<Preferences>) => void;
  onOpenBook: (bookId: string, startPage?: number) => void;
  onBooksChanged: () => Promise<void> | void;
  onDataCleared: () => void;
  notify: (message: string, tone?: ToastTone) => void;
}

function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function Library({
  books,
  loading,
  loadError,
  preferences,
  onPreferencesChange,
  onOpenBook,
  onBooksChanged,
  onDataCleared,
  notify,
}: LibraryProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('importedAt');
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState<ImportProgress | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BookMeta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showData, setShowData] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<GithubConfig | null>(() => loadGithubConfig());
  const [remoteBooks, setRemoteBooks] = useState<RemoteBook[]>([]);
  const [cloudState, setCloudState] = useState<'off' | 'loading' | 'ready' | 'error'>(() =>
    loadGithubConfig() ? 'loading' : 'off',
  );
  const [cloudError, setCloudError] = useState('');
  const [cloudTick, setCloudTick] = useState(0);
  const [showCloud, setShowCloud] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [pendingRemoteDelete, setPendingRemoteDelete] = useState<RemoteBook | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const booksRef = useRef(books);
  const cloudPendingRef = useRef(true);
  booksRef.current = books;

  const remoteOnly = useMemo(() => {
    const linked = new Set(books.map((book) => book.remotePath).filter(Boolean));
    return remoteBooks
      .filter((remote) => !linked.has(remote.path))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [books, remoteBooks]);

  const visibleBooks = useMemo(() => {
    const normalizedQuery = normalizeForSearch(query.trim());
    const filtered = normalizedQuery
      ? books.filter(
          (book) =>
            normalizeForSearch(book.title).includes(normalizedQuery) ||
            (book.author ? normalizeForSearch(book.author).includes(normalizedQuery) : false),
        )
      : [...books];

    filtered.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
      if (sort === 'lastOpenedAt') {
        return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0);
      }
      return b.importedAt - a.importedAt;
    });
    return filtered;
  }, [books, query, sort]);

  /** Gera a miniatura da primeira página dos livros importados antes das capas existirem. */
  const coverAttemptsRef = useRef(new Set<string>());
  useEffect(() => {
    const missing = books.filter(
      (book) => book.cover === undefined && !coverAttemptsRef.current.has(book.id),
    );
    if (missing.length === 0) return;
    missing.forEach((book) => coverAttemptsRef.current.add(book.id));
    void (async () => {
      let pdfModule: typeof import('../lib/pdf');
      try {
        pdfModule = await import('../lib/pdf');
      } catch {
        return;
      }
      try {
        for (const book of missing) {
          const blob = await getBookFile(book.id).catch(() => undefined);
          const cover = blob ? await pdfModule.generateCover(blob) : undefined;
          await updateBook(book.id, { cover: cover ?? '' });
        }
        await onBooksChanged();
      } catch {
        // sem miniatura: o cartão continua com a capa padrão
      }
    })();
  }, [books, onBooksChanged]);

  const cloudErrorMessage = (error: unknown) =>
    error instanceof Error && error.message ? error.message : 'Falha ao falar com o GitHub.';

  /** Lista os PDFs do GitHub, liga os livros locais a eles e traz o progresso salvo lá. */
  const refreshCloud = useCallback(
    async (config: GithubConfig | null) => {
      if (!config) {
        setRemoteBooks([]);
        setCloudState('off');
        return;
      }
      setCloudState('loading');
      setCloudError('');
      try {
        const list = await listRemoteBooks(config);
        setRemoteBooks(list);

        const linked: BookMeta[] = [];
        const usedPaths = new Set(
          booksRef.current.map((book) => book.remotePath).filter(Boolean) as string[],
        );
        for (const book of booksRef.current) {
          if (book.remotePath) {
            if (list.some((remote) => remote.path === book.remotePath)) {
              linked.push(book);
            } else {
              await updateBook(book.id, { remotePath: undefined });
            }
            continue;
          }
          const sameSize = list.filter(
            (remote) => remote.size === book.size && !usedPaths.has(remote.path),
          );
          const match =
            sameSize.find(
              (remote) => remote.name.toLowerCase() === safeFileName(book.fileName).toLowerCase(),
            ) ?? (sameSize.length === 1 ? sameSize[0] : undefined);
          if (match) {
            usedPaths.add(match.path);
            const updated = await updateBook(book.id, { remotePath: match.path });
            if (updated) linked.push(updated);
          }
        }

        await flushOutbox(config);
        if (linked.length > 0) {
          const { state } = await fetchSyncState(config);
          for (const book of linked) {
            if (book.remotePath) await applyRemoteState(book, state.books[book.remotePath]);
          }
        }
        await onBooksChanged();
        setCloudState('ready');
      } catch (error) {
        setCloudError(cloudErrorMessage(error));
        setCloudState('error');
      }
    },
    [onBooksChanged],
  );

  useEffect(() => {
    if (loading || loadError || !cloudPendingRef.current) return;
    cloudPendingRef.current = false;
    void refreshCloud(cloudConfig);
  }, [loading, loadError, cloudConfig, cloudTick, refreshCloud]);

  const requestCloudRefresh = () => {
    cloudPendingRef.current = true;
    setCloudTick((tick) => tick + 1);
  };

  // Ao voltar para o app, traz o que foi lido em outro aparelho nesse meio-tempo.
  const lastVisibleRefreshRef = useRef(Date.now());
  useEffect(() => {
    if (!cloudConfig) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastVisibleRefreshRef.current < 15_000) return;
      lastVisibleRefreshRef.current = Date.now();
      cloudPendingRef.current = true;
      setCloudTick((tick) => tick + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [cloudConfig]);

  const uploadBook = useCallback(
    async (book: BookMeta, file: Blob, takenNames: string[]): Promise<RemoteBook | null> => {
      if (!cloudConfig) return null;
      const name = uniqueFileName(book.fileName, takenNames);
      const remote = await uploadRemoteBook(cloudConfig, file, name);
      await updateBook(book.id, { remotePath: remote.path });
      queueUpdate(remote.path, {
        ...updateFromBook(book),
        bookmarks: (await listBookmarks(book.id)).map(toSyncedBookmark),
      });
      void flushOutbox(cloudConfig);
      setRemoteBooks((current) => [...current.filter((item) => item.path !== remote.path), remote]);
      return remote;
    },
    [cloudConfig],
  );

  /** Importa os PDFs; quando `remote` é informado, o arquivo veio do GitHub. Retorna os ids criados. */
  const handleFiles = useCallback(
    async (fileList: FileList | File[] | null, remote?: RemoteBook): Promise<string[]> => {
      const created: string[] = [];
      if (!fileList || importing) return created;
      const files = Array.from(fileList);
      if (files.length === 0) return created;

      const valid = files.filter(isPdfFile);
      if (valid.length < files.length) {
        notify(
          `${files.length - valid.length} ${pluralize(files.length - valid.length, 'arquivo ignorado', 'arquivos ignorados')}: apenas PDFs são aceitos.`,
          'error',
        );
      }
      if (valid.length === 0) return created;

      let pdfModule: typeof import('../lib/pdf');
      try {
        pdfModule = await import('../lib/pdf');
      } catch {
        notify('Não foi possível carregar o leitor de PDFs. Recarregue a página e tente novamente.', 'error');
        return created;
      }

      const takenNames = remoteBooks.map((item) => item.name);

      for (let index = 0; index < valid.length; index += 1) {
        const file = valid[index];
        if (file.size > MAX_FILE_SIZE) {
          notify(
            `“${file.name}” tem ${formatBytes(file.size)}. O limite é ${formatBytes(MAX_FILE_SIZE)} para evitar estouro de armazenamento.`,
            'error',
          );
          continue;
        }
        const existing = books.find((book) => book.fileName === file.name && book.size === file.size);
        if (existing) {
          if (remote && !existing.remotePath) {
            await updateBook(existing.id, { remotePath: remote.path });
            await onBooksChanged();
          }
          if (!remote) notify(`“${file.name}” já está na sua biblioteca.`, 'info');
          created.push(existing.id);
          continue;
        }

        setImporting({
          fileName: file.name,
          fileIndex: index + 1,
          fileCount: valid.length,
          page: 0,
          pageCount: 0,
          percent: 0,
          stage: 'extract',
        });

        try {
          const parsed = await pdfModule.parsePdf(file, {
            fileName: file.name,
            onProgress: (page, total) => {
              setImporting((current) =>
                current
                  ? {
                      ...current,
                      page,
                      pageCount: total,
                      percent: total > 0 ? Math.round((page / total) * 100) : 0,
                    }
                  : current,
              );
            },
          });

          const id = createId();
          const meta: BookMeta = {
            id,
            title: parsed.title,
            author: parsed.author,
            fileName: file.name,
            size: file.size,
            importedAt: Date.now(),
            lastOpenedAt: null,
            pageCount: parsed.pageCount,
            currentPage: 1,
            lastChunkIndex: 0,
            progress: 0,
            hasText: !parsed.needsOcr,
            needsOcr: parsed.needsOcr,
            chapters: parsed.chapters,
            remotePath: remote?.path,
            cover: parsed.cover ?? '',
          };

          await createBook(meta, file, {
            bookId: id,
            pages: parsed.pages,
            extractedAt: Date.now(),
          });
          created.push(id);

          if (remote && cloudConfig) {
            const { state } = await fetchSyncState(cloudConfig).catch(() => ({ state: null }));
            if (state) await applyRemoteState(meta, state.books[remote.path]);
          }

          await onBooksChanged();

          if (!remote && cloudConfig) {
            setImporting((current) => (current ? { ...current, stage: 'upload', percent: 100 } : current));
            try {
              const uploaded = await uploadBook(meta, file, takenNames);
              if (uploaded) takenNames.push(uploaded.name);
              await onBooksChanged();
              notify(`“${parsed.title}” foi adicionado e enviado ao GitHub.`, 'success');
            } catch (error) {
              notify(
                `“${parsed.title}” foi salvo neste aparelho, mas não chegou ao GitHub. ${cloudErrorMessage(error)} Use o botão “Enviar ao GitHub” no livro para tentar de novo.`,
                'error',
              );
            }
          } else {
            notify(`“${parsed.title}” foi adicionado à sua biblioteca.`, 'success');
          }

          if (parsed.needsOcr) {
            notify(
              'Este PDF parece digitalizado e não possui texto extraível. O aplicativo não inclui OCR, então a leitura em voz alta pode ficar vazia. Você ainda pode visualizar o PDF original.',
              'info',
            );
          }
        } catch (error) {
          const quotaExceeded =
            error instanceof DOMException &&
            (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
          if (quotaExceeded) {
            notify(
              'Não há espaço suficiente no navegador para guardar este PDF. Exclua livros antigos ou libere espaço no dispositivo.',
              'error',
            );
          } else {
            notify(pdfModule.describePdfError(error), 'error');
          }
        }
      }

      setImporting(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return created;
    },
    [books, importing, notify, onBooksChanged, remoteBooks, cloudConfig, uploadBook],
  );

  const downloadAndOpen = async (remote: RemoteBook) => {
    if (!cloudConfig || importing) return;
    setImporting({
      fileName: remote.name,
      fileIndex: 1,
      fileCount: 1,
      page: 0,
      pageCount: 0,
      percent: 0,
      stage: 'download',
    });
    let file: File;
    try {
      file = await downloadRemoteBook(cloudConfig, remote);
    } catch (error) {
      setImporting(null);
      notify(`Não foi possível baixar “${remoteTitle(remote.name)}”. ${cloudErrorMessage(error)}`, 'error');
      return;
    }
    setImporting(null);
    const [id] = await handleFiles([file], remote);
    if (id) onOpenBook(id);
  };

  const sendToGithub = async (book: BookMeta) => {
    if (!cloudConfig || uploadingId) return;
    setUploadingId(book.id);
    try {
      const blob = await getBookFile(book.id);
      if (!blob) throw new Error('O PDF deste livro não está mais no navegador.');
      await uploadBook(book, blob, remoteBooks.map((item) => item.name));
      await onBooksChanged();
      notify(`“${book.title}” foi enviado ao GitHub.`, 'success');
    } catch (error) {
      notify(`Não foi possível enviar “${book.title}”. ${cloudErrorMessage(error)}`, 'error');
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoteDelete = async () => {
    if (!pendingRemoteDelete || !cloudConfig) return;
    setDeleting(true);
    try {
      await deleteRemoteFile(cloudConfig, pendingRemoteDelete.path, pendingRemoteDelete.sha);
      setRemoteBooks((current) => current.filter((item) => item.path !== pendingRemoteDelete.path));
      notify(`“${remoteTitle(pendingRemoteDelete.name)}” foi apagado do GitHub.`, 'success');
      setPendingRemoteDelete(null);
    } catch (error) {
      notify(`Não foi possível apagar do GitHub. ${cloudErrorMessage(error)}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteBook(pendingDelete.id);
      if (preferences.lastBookId === pendingDelete.id) {
        onPreferencesChange({ lastBookId: null });
      }
      await onBooksChanged();
      notify(`“${pendingDelete.title}” foi excluído.`, 'success');
      setPendingDelete(null);
    } catch {
      notify('Não foi possível excluir o livro. Tente novamente.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="library">
      <header className="library__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <LogoIcon size={30} />
          </span>
          <div>
            <h1 className="brand__title">Audiobook Marcio</h1>
            <p className="brand__tagline">Seus PDFs, sua voz, seu ritmo.</p>
          </div>
        </div>
        <div className="library__header-actions">
          {cloudConfig ? (
            <button
              type="button"
              className="privacy-chip privacy-chip--cloud"
              onClick={() => setShowCloud(true)}
              title={`Livros sincronizados com ${cloudConfig.owner}/${cloudConfig.repo}`}
            >
              <CloudIcon size={16} /> GitHub
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={() => setShowCloud(true)}
            aria-label="Biblioteca no GitHub"
            title="Biblioteca no GitHub"
          >
            <CloudIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() =>
              onPreferencesChange({ theme: preferences.theme === 'dark' ? 'light' : 'dark' })
            }
            aria-label={preferences.theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title="Alternar tema (T)"
          >
            {preferences.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setShowHelp(true)}
            aria-label="Atalhos de teclado"
            title="Atalhos de teclado"
          >
            <KeyboardIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setShowData(true)}
            aria-label="Dados e backup"
            title="Dados e backup"
          >
            <DownloadIcon />
          </button>
        </div>
      </header>

      <main className="library__main">
        <section
          className={`dropzone ${dragging ? 'is-dragging' : ''} ${importing ? 'is-busy' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
          aria-label="Importar PDF"
        >
          <div className="dropzone__icon" aria-hidden="true">
            <UploadIcon size={28} />
          </div>
          <div className="dropzone__text">
            <h2>Adicione um PDF à sua biblioteca</h2>
            <p>
              Arraste o arquivo aqui ou escolha no dispositivo.
              {cloudConfig
                ? ` Ele também é enviado à pasta “${cloudConfig.folder}” do GitHub para você ler em outros aparelhos.`
                : ''}
            </p>
          </div>
          <div className="dropzone__actions">
            <button
              type="button"
              className="button button--primary button--large"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(importing)}
            >
              <UploadIcon /> Importar PDF
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="visually-hidden"
              onChange={(event) => void handleFiles(event.target.files)}
              aria-label="Selecionar arquivos PDF"
            />
            <span className="dropzone__hint">
              PDFs com texto selecionável · até {formatBytes(MAX_FILE_SIZE)}
            </span>
          </div>

          {importing ? (
            <div className="import-status" role="status" aria-live="polite">
              <div className="import-status__row">
                <span className="import-status__name">
                  {importing.stage === 'download'
                    ? 'Baixando '
                    : importing.stage === 'upload'
                      ? 'Enviando ao GitHub '
                      : 'Importando '}
                  {importing.fileIndex > 1 ? `${importing.fileIndex} de ${importing.fileCount}: ` : ''}
                  {importing.fileName}
                </span>
                <span>{importing.stage === 'extract' ? `${importing.percent}%` : ''}</span>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={importing.percent}
                aria-label="Progresso da importação"
              >
                <span
                  className={`progress__fill ${importing.stage === 'extract' ? '' : 'progress__fill--busy'}`}
                  style={{ width: importing.stage === 'extract' ? `${importing.percent}%` : '100%' }}
                />
              </div>
              <span className="field__hint">
                {importing.stage === 'download'
                  ? 'Trazendo o PDF do GitHub para este aparelho…'
                  : importing.stage === 'upload'
                    ? 'Guardando uma cópia no GitHub para ler em outros aparelhos…'
                    : importing.pageCount > 0
                      ? `Extraindo texto da página ${importing.page} de ${importing.pageCount}…`
                      : 'Lendo o arquivo…'}
              </span>
            </div>
          ) : null}
        </section>

        <section className="library__collection" aria-labelledby="collection-title">
          <div className="collection-toolbar">
            <div>
              <h2 id="collection-title" className="collection-toolbar__title">
                Sua biblioteca
              </h2>
              <p className="collection-toolbar__count">
                {loading
                  ? 'Carregando…'
                  : `${visibleBooks.length} ${pluralize(visibleBooks.length, 'livro', 'livros')}${
                      query.trim() && visibleBooks.length !== books.length
                        ? ` de ${books.length}`
                        : ''
                    }`}
              </p>
            </div>

            <div className="collection-toolbar__controls">
              <div className="search-field">
                <SearchIcon />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por título ou autor"
                  aria-label="Buscar livros por título ou autor"
                />
              </div>
              <label className="sort-field">
                <span className="visually-hidden">Ordenar livros</span>
                <select
                  className="select"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                >
                  <option value="importedAt">Data de adição</option>
                  <option value="title">Título</option>
                  <option value="lastOpenedAt">Último acesso</option>
                </select>
              </label>
            </div>
          </div>

          {cloudConfig ? (
            <div
              className={`cloud-status ${cloudState === 'error' ? 'cloud-status--error' : ''}`}
              role="status"
              aria-live="polite"
            >
              <CloudIcon size={16} />
              <span>
                {cloudState === 'loading'
                  ? 'Conferindo os livros e o progresso no GitHub…'
                  : cloudState === 'error'
                    ? cloudError
                    : `Sincronizado com ${cloudConfig.owner}/${cloudConfig.repo}, pasta “${cloudConfig.folder}”.`}
              </span>
              {cloudState !== 'loading' ? (
                <button type="button" className="link-button" onClick={requestCloudRefresh}>
                  Atualizar
                </button>
              ) : null}
            </div>
          ) : null}

          {loadError ? (
            <div className="state-card state-card--error" role="alert">
              <h3>Não foi possível abrir sua biblioteca</h3>
              <p>{loadError}</p>
              <button type="button" className="button button--secondary" onClick={() => void onBooksChanged()}>
                Tentar novamente
              </button>
            </div>
          ) : loading ? (
            <div className="state-card" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>Carregando seus livros…</p>
            </div>
          ) : books.length === 0 ? (
            <div className="state-card state-card--empty">
              <div className="empty-illustration" aria-hidden="true">
                <BookOpenIcon size={44} />
                <span className="empty-illustration__bars">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <h3>
                {remoteOnly.length > 0
                  ? 'Nenhum livro baixado neste aparelho'
                  : 'Sua estante está vazia'}
              </h3>
              <p>
                {remoteOnly.length > 0
                  ? 'Seus livros guardados no GitHub estão logo abaixo. Baixe um para começar a ouvir de onde parou.'
                  : 'Importe um PDF para começar a ouvir. Livros com texto selecionável funcionam melhor; PDFs digitalizados precisam de OCR, que não está incluído.'}
              </p>
              {cloudConfig ? null : (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setShowCloud(true)}
                >
                  <CloudIcon /> Usar livros guardados no GitHub
                </button>
              )}
              <button
                type="button"
                className="button button--primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon /> Importar meu primeiro PDF
              </button>
            </div>
          ) : visibleBooks.length === 0 ? (
            <div className="state-card" role="status">
              <h3>Nenhum livro encontrado</h3>
              <p>Não encontramos resultados para “{query.trim()}”. Tente outro título ou autor.</p>
              <button type="button" className="button button--secondary" onClick={() => setQuery('')}>
                Limpar busca
              </button>
            </div>
          ) : (
            <ul className="book-grid">
              {visibleBooks.map((book) => (
                <li key={book.id}>
                  <BookCard
                    book={book}
                    onContinue={() => onOpenBook(book.id)}
                    onRestart={() => onOpenBook(book.id, 1)}
                    onDelete={() => setPendingDelete(book)}
                    cloudEnabled={Boolean(cloudConfig)}
                    uploading={uploadingId === book.id}
                    onUpload={() => void sendToGithub(book)}
                  />
                </li>
              ))}
            </ul>
          )}

          {cloudConfig && remoteOnly.length > 0 ? (
            <section className="remote-books" aria-labelledby="remote-title">
              <h3 id="remote-title" className="remote-books__title">
                <CloudIcon size={18} /> No GitHub, ainda não baixados neste aparelho
              </h3>
              <ul className="remote-list">
                {remoteOnly.map((remote) => (
                  <li key={remote.path} className="remote-item">
                    <div className="remote-item__info">
                      <span className="remote-item__title">{remoteTitle(remote.name)}</span>
                      <span className="remote-item__meta">{formatBytes(remote.size)}</span>
                    </div>
                    <div className="remote-item__actions">
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => void downloadAndOpen(remote)}
                        disabled={Boolean(importing)}
                      >
                        <CloudDownloadIcon size={17} /> Baixar e ler
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={() => setPendingRemoteDelete(remote)}
                        aria-label={`Apagar ${remoteTitle(remote.name)} do GitHub`}
                        title="Apagar do GitHub"
                        disabled={Boolean(importing)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </main>


      {showData ? (
        <DataDialog
          books={books}
          preferences={preferences}
          onPreferencesRestored={(restored) => onPreferencesChange(restored)}
          onDataChanged={() => void onBooksChanged()}
          onCleared={onDataCleared}
          notify={notify}
          onClose={() => setShowData(false)}
        />
      ) : null}

      {showHelp ? <HelpDialog onClose={() => setShowHelp(false)} /> : null}

      {showCloud ? (
        <CloudDialog
          config={cloudConfig}
          notify={notify}
          onClose={() => setShowCloud(false)}
          onSaved={(config) => {
            cloudPendingRef.current = true;
            setCloudConfig(config);
            setCloudTick((tick) => tick + 1);
          }}
        />
      ) : null}

      {pendingRemoteDelete ? (
        <ConfirmDialog
          title="Apagar do GitHub?"
          message={`“${remoteTitle(pendingRemoteDelete.name)}” será apagado da pasta do repositório e deixará de aparecer nos outros aparelhos. Cópias já baixadas continuam onde estão.`}
          confirmLabel="Apagar do GitHub"
          danger
          busy={deleting}
          onConfirm={() => void handleRemoteDelete()}
          onCancel={() => setPendingRemoteDelete(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Excluir este livro?"
          message={
            pendingDelete.remotePath
              ? `“${pendingDelete.title}” será removido deste aparelho. O PDF, a página em que você parou e os marcadores continuam no GitHub e podem ser baixados de novo.`
              : `“${pendingDelete.title}” e todo o texto extraído serão removidos deste dispositivo, junto com os marcadores. O arquivo PDF original que você guardou não será afetado.`
          }
          confirmLabel="Excluir livro"
          danger
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}
