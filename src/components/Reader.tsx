import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { BookMeta, Bookmark, FontKey, PageText, Preferences } from '../types';
import {
  addBookmark,
  deleteBookmark,
  getBook,
  getBookContent,
  getBookFile,
  listBookmarks,
  updateBook,
} from '../lib/db';
import { clamp, formatPercent, truncate } from '../lib/format';
import { createId } from '../lib/ids';
import { splitIntoChunks, toSpeechText } from '../lib/text';
import {
  SpeechQueue,
  pickDefaultVoice,
  type SpeechStatus,
} from '../lib/speech';
import type { VoicesState } from '../hooks/useVoices';
import type { ToastTone } from './Toasts';
import { PlayerBar } from './PlayerBar';
import { PdfFrame } from './PdfFrame';
import { SettingsPanel } from './SettingsPanel';
import { BookmarksPanel } from './BookmarksPanel';
import { ChaptersPanel } from './ChaptersPanel';
import { HelpDialog } from './HelpDialog';
import {
  AlertIcon,
  BookmarkIcon,
  ChaptersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  EyeIcon,
  FileTextIcon,
  KeyboardIcon,
  MoonIcon,
  RefreshIcon,
  SettingsIcon,
  SunIcon,
} from './icons';

const FONT_STACKS: Record<FontKey, string> = {
  serif: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
  sans: '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

interface ReaderProps {
  bookId: string;
  startPage?: number;
  preferences: Preferences;
  voices: VoicesState & { reload: () => void };
  onPreferencesChange: (patch: Partial<Preferences>) => void;
  onBack: () => void;
  notify: (message: string, tone?: ToastTone) => void;
}

interface PendingSeek {
  page: number;
  chunkIndex: number;
}

export function Reader({
  bookId,
  startPage,
  preferences,
  voices,
  onPreferencesChange,
  onBack,
  notify,
}: ReaderProps) {
  const [book, setBook] = useState<BookMeta | null>(null);
  const [pages, setPages] = useState<PageText[] | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [activeChunk, setActiveChunk] = useState(0);
  const [boundary, setBoundary] = useState<{ charIndex: number; charLength: number } | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [panel, setPanel] = useState<null | 'settings' | 'bookmarks' | 'chapters' | 'help'>(null);
  const [pageInput, setPageInput] = useState('1');

  const highlightRef = useRef<HTMLElement | null>(null);
  const pagesRef = useRef<PageText[] | null>(null);
  const pageRef = useRef(1);
  const bookRef = useRef<BookMeta | null>(null);
  const preferencesRef = useRef(preferences);
  const notifyRef = useRef(notify);
  const queueRef = useRef<SpeechQueue | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const latestChunkRef = useRef(0);
  const initialPageRef = useRef(1);
  const initialChunkRef = useRef(0);
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  const autoPlayRef = useRef(false);
  const onPageEndRef = useRef<() => void>(() => undefined);
  const persistRef = useRef<(mode?: 'debounce' | 'immediate' | 'complete') => Promise<void>>(
    async () => undefined,
  );

  pagesRef.current = pages;
  pageRef.current = page;
  bookRef.current = book;
  preferencesRef.current = preferences;
  notifyRef.current = notify;

  if (!queueRef.current) {
    queueRef.current = new SpeechQueue({
      events: {
        onStatusChange: setStatus,
        onChunkChange: (index) => {
          latestChunkRef.current = index;
          setActiveChunk(index);
          setBoundary(null);
          void persistRef.current('debounce');
        },
        onBoundary: (charIndex, charLength) => setBoundary({ charIndex, charLength }),
        onPageEnd: () => onPageEndRef.current(),
        onError: (message) => notifyRef.current(message, 'error'),
      },
      settings: {
        rate: preferences.rate,
        volume: preferences.volume,
        voiceURI: preferences.voiceURI,
      },
    });
  }

  const queue = queueRef.current;

  const chunks = useMemo(() => {
    if (!pages) return [];
    const pageText = pages[page - 1]?.text ?? '';
    return splitIntoChunks(pageText);
  }, [pages, page]);

  const speechChunks = useMemo(() => chunks.map((chunk) => toSpeechText(chunk.text)), [chunks]);

  const persistProgress = useCallback(
    (mode: 'debounce' | 'immediate' | 'complete' = 'debounce') => {
      const currentPages = pagesRef.current;
      const total = currentPages?.length ?? 0;
      if (!total || !bookRef.current) return Promise.resolve();

      const currentPage = pageRef.current;
      const chunkCount = queueRef.current?.getChunks().length ?? 0;
      const chunkIndex = latestChunkRef.current;

      let savedPage = currentPage;
      let savedChunk = chunkIndex;
      let progress: number;

      if (mode === 'complete') {
        savedPage = Math.min(total, currentPage + 1);
        savedChunk = 0;
        progress = clamp(currentPage / total, 0, 1);
      } else {
        const within = chunkCount > 0 ? clamp(chunkIndex / chunkCount, 0, 1) : 0;
        progress = clamp((currentPage - 1 + within) / total, 0, 1);
      }

      const payload = {
        currentPage: savedPage,
        lastChunkIndex: savedChunk,
        progress,
        lastOpenedAt: Date.now(),
      };

      if (mode === 'debounce') {
        if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = window.setTimeout(() => {
          persistTimerRef.current = null;
          void updateBook(bookId, payload).catch(() => undefined);
        }, 700);
        return Promise.resolve();
      }

      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      return updateBook(bookId, payload)
        .then(() => undefined)
        .catch(() => undefined);
    },
    [bookId],
  );

  persistRef.current = persistProgress;

  onPageEndRef.current = () => {
    const total = pagesRef.current?.length ?? 0;
    const currentPage = pageRef.current;
    void persistProgress('complete');
    if (preferencesRef.current.autoAdvance && currentPage < total) {
      autoPlayRef.current = true;
      pendingSeekRef.current = null;
      setPage(currentPage + 1);
    } else if (currentPage >= total) {
      notifyRef.current('Você chegou ao fim do livro.', 'success');
    }
  };

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setLoadState('loading');
    setLoadError('');

    void (async () => {
      try {
        const [loadedBook, content, blob] = await Promise.all([
          getBook(bookId),
          getBookContent(bookId),
          getBookFile(bookId),
        ]);

        if (!loadedBook || !content || !blob) {
          throw new Error('Este livro não está mais disponível neste dispositivo.');
        }
        if (content.pages.length === 0) {
          throw new Error('Não há páginas armazenadas para este livro.');
        }
        if (!active) return;

        const targetPage = clamp(
          startPage ?? loadedBook.currentPage ?? 1,
          1,
          content.pages.length,
        );
        initialPageRef.current = targetPage;
        initialChunkRef.current = startPage
          ? 0
          : Math.max(0, loadedBook.lastChunkIndex ?? 0);

        objectUrl = URL.createObjectURL(blob);
        const openedBook: BookMeta = { ...loadedBook, lastOpenedAt: Date.now() };
        setBook(openedBook);
        setBookmarks(await listBookmarks(bookId));
        setPages(content.pages);
        setFileUrl(objectUrl);
        setPage(targetPage);
        setLoadState('ready');
        void updateBook(bookId, { lastOpenedAt: openedBook.lastOpenedAt }).catch(() => undefined);
      } catch (error) {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Não foi possível abrir este livro. Ele pode ter sido removido do navegador.',
        );
        setLoadState('error');
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bookId, startPage]);

  useEffect(() => {
    if (!pages || loadState !== 'ready') return;
    const pending = pendingSeekRef.current;
    let start = 0;
    if (pending && pending.page === page) {
      start =
        pending.chunkIndex < 0
          ? Math.max(0, speechChunks.length - 1)
          : Math.min(pending.chunkIndex, Math.max(0, speechChunks.length - 1));
    } else if (page === initialPageRef.current) {
      start = Math.min(initialChunkRef.current, Math.max(0, speechChunks.length - 1));
    }
    pendingSeekRef.current = null;
    queue.load(speechChunks, start);
    latestChunkRef.current = start;
    setActiveChunk(start);
    setBoundary(null);
    void persistProgress('immediate');
    if (autoPlayRef.current) {
      autoPlayRef.current = false;
      queue.play();
    }
  }, [pages, page, speechChunks, queue, persistProgress, loadState]);

  useEffect(() => {
    queue.setSettings({
      rate: preferences.rate,
      volume: preferences.volume,
      voiceURI: preferences.voiceURI,
    });
  }, [queue, preferences.rate, preferences.volume, preferences.voiceURI]);

  useEffect(() => {
    return () => {
      queue.dispose();
      if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    };
  }, [queue]);

  useEffect(() => {
    if (!book) return;
    const previousTitle = document.title;
    document.title = `${book.title} — Audiobook Pessoal`;
    return () => {
      document.title = previousTitle;
    };
  }, [book]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    if (status !== 'playing') return;
    const element = highlightRef.current;
    if (!element) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeChunk, status]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void persistProgress('immediate');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [persistProgress]);

  const changePage = useCallback(
    (target: number, options: { autoplay?: boolean; seekChunk?: number | 'last' } = {}) => {
      const total = pagesRef.current?.length ?? 0;
      if (total === 0) return;
      const clamped = clamp(Math.round(target), 1, total);
      const wasPlaying = queueRef.current?.getStatus() === 'playing';
      const autoplay = options.autoplay ?? wasPlaying;

      if (clamped === pageRef.current) {
        if (options.seekChunk !== undefined) {
          const index =
            options.seekChunk === 'last'
              ? Math.max(0, (queueRef.current?.getChunks().length ?? 1) - 1)
              : options.seekChunk;
          queueRef.current?.seekToChunk(index, autoplay);
        }
        return;
      }

      autoPlayRef.current = autoplay;
      pendingSeekRef.current =
        options.seekChunk !== undefined
          ? { page: clamped, chunkIndex: options.seekChunk === 'last' ? -1 : options.seekChunk }
          : null;
      queueRef.current?.stop();
      setPage(clamped);
    },
    [],
  );

  const handleBack = async () => {
    queue.stop();
    await persistProgress('immediate');
    onBack();
  };

  const togglePlayback = () => {
    if (!queue.isSupported()) {
      notify(
        'A síntese de voz não está disponível neste navegador. Você ainda pode ler o texto na tela.',
        'error',
      );
      return;
    }
    if (queue.getIndex() >= speechChunks.length && speechChunks.length > 0) {
      queue.load(speechChunks, 0);
    }
    queue.toggle();
  };

  const playFromStart = () => {
    if (speechChunks.length === 0) return;
    queue.seekToChunk(0, true);
  };

  const nextBlock = () => {
    const index = queue.getIndex();
    if (index >= speechChunks.length - 1) {
      if (page < (pages?.length ?? 1)) {
        changePage(page + 1, { autoplay: status === 'playing' });
      } else {
        notify('Você está no último bloco da última página.', 'info');
      }
      return;
    }
    queue.next();
  };

  const prevBlock = () => {
    if (queue.getIndex() <= 0) {
      if (page > 1) {
        changePage(page - 1, { seekChunk: 'last', autoplay: status === 'playing' });
      }
      return;
    }
    queue.previous();
  };

  const bookmarkCurrent = async () => {
    if (!book) return;
    const index = Math.min(
      Math.max(activeChunk, 0),
      Math.max(0, speechChunks.length - 1),
    );
    const snippet =
      speechChunks[index] ??
      (pages?.[page - 1]?.text ?? '').replace(/\s+/g, ' ').trim();
    const label = snippet ? truncate(snippet, 80) : 'Página sem texto';

    try {
      await addBookmark({
        id: createId(),
        bookId,
        page,
        chunkIndex: index,
        label,
        createdAt: Date.now(),
      });
      setBookmarks(await listBookmarks(bookId));
      notify('Marcador adicionado nesta posição.', 'success');
    } catch {
      notify('Não foi possível salvar o marcador.', 'error');
    }
  };

  const removeBookmark = async (bookmark: Bookmark) => {
    try {
      await deleteBookmark(bookmark.id);
      setBookmarks(await listBookmarks(bookId));
      notify('Marcador removido.', 'success');
    } catch {
      notify('Não foi possível remover o marcador.', 'error');
    }
  };

  const toggleTheme = () => {
    onPreferencesChange({ theme: preferences.theme === 'dark' ? 'light' : 'dark' });
  };

  const toggleView = () => {
    onPreferencesChange({ viewMode: preferences.viewMode === 'pdf' ? 'text' : 'pdf' });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (panel) return;

      const isButton = target?.closest('button, a');
      if (isButton && (event.key === ' ' || event.key === 'Enter')) return;

      switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
          event.preventDefault();
          togglePlayback();
          break;
        case 'ArrowRight':
          event.preventDefault();
          nextBlock();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          prevBlock();
          break;
        case 'PageDown':
          event.preventDefault();
          changePage(pageRef.current + 1);
          break;
        case 'PageUp':
          event.preventDefault();
          changePage(pageRef.current - 1);
          break;
        case 'm':
        case 'M':
          event.preventDefault();
          void bookmarkCurrent();
          break;
        case 't':
        case 'T':
          event.preventDefault();
          toggleTheme();
          break;
        case 'v':
        case 'V':
          event.preventDefault();
          toggleView();
          break;
        case '?':
          event.preventDefault();
          setPanel('help');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handlePageSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(pageInput);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(page));
      return;
    }
    changePage(parsed);
  };

  const totalPages = pages?.length ?? book?.pageCount ?? 0;
  const pageText = pages?.[page - 1]?.text ?? '';
  const activeTextChunk = chunks[activeChunk];
  const passage = speechChunks[activeChunk] ?? '';
  const currentChapter = useMemo(() => {
    if (!book) return null;
    return [...book.chapters].reverse().find((chapter) => chapter.page <= page) ?? null;
  }, [book, page]);
  const selectedVoice = pickDefaultVoice(voices.voices, preferences.voiceURI);
  const voiceLabel = selectedVoice
    ? selectedVoice.name
    : voices.supported
      ? 'Voz do navegador'
      : 'Voz indisponível';
  const overallProgress = totalPages > 0 ? clamp((page - 1) / totalPages, 0, 1) : 0;
  const fontStyle: CSSProperties = {
    fontFamily: FONT_STACKS[preferences.fontFamily],
    fontSize: `${preferences.fontSize}px`,
    lineHeight: preferences.lineHeight,
  };

  if (loadState === 'loading') {
    return (
      <div className="reader-state">
        <span className="spinner" aria-hidden="true" />
        <p role="status">Abrindo o livro…</p>
      </div>
    );
  }

  if (loadState === 'error' || !book) {
    return (
      <div className="reader-state reader-state--error">
        <AlertIcon size={32} />
        <h1>Não foi possível abrir o livro</h1>
        <p>{loadError}</p>
        <button type="button" className="button button--primary" onClick={onBack}>
          Voltar para a biblioteca
        </button>
      </div>
    );
  }

  return (
    <div className="reader">
      <header className="reader__header">
        <button type="button" className="button button--ghost reader__back" onClick={() => void handleBack()}>
          <ChevronLeftIcon /> <span>Biblioteca</span>
        </button>

        <div className="reader__title-block">
          <h1 className="reader__title">{book.title}</h1>
          <p className="reader__subtitle">
            {book.author ? `${book.author} · ` : ''}
            {formatPercent(book.pageCount > 0 ? overallProgress : 0)} do livro
          </p>
        </div>

        <div className="reader__actions">
          <button
            type="button"
            className="icon-button"
            onClick={toggleView}
            aria-label={preferences.viewMode === 'pdf' ? 'Mostrar texto' : 'Mostrar PDF original'}
            aria-pressed={preferences.viewMode === 'pdf'}
            title="Alternar texto/PDF (V)"
          >
            {preferences.viewMode === 'pdf' ? <FileTextIcon /> : <EyeIcon />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setPanel('chapters')}
            aria-label="Abrir capítulos"
            title="Capítulos"
          >
            <ChaptersIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setPanel('bookmarks')}
            aria-label={`Abrir marcadores (${bookmarks.length})`}
            title="Marcadores"
          >
            <BookmarkIcon />
            {bookmarks.length > 0 ? (
              <span className="icon-button__badge" aria-hidden="true">
                {bookmarks.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            aria-label={preferences.theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title="Alternar tema (T)"
          >
            {preferences.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setPanel('settings')}
            aria-label="Abrir configurações"
            title="Configurações"
          >
            <SettingsIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setPanel('help')}
            aria-label="Atalhos de teclado"
            title="Atalhos de teclado"
          >
            <KeyboardIcon />
          </button>
        </div>
      </header>

      <div className="reader__subbar">
        <div className="page-nav">
          <button
            type="button"
            className="icon-button"
            onClick={() => changePage(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeftIcon />
          </button>
          <span className="page-nav__label" aria-live="polite">
            Página <strong>{page}</strong> de {totalPages}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => changePage(page + 1)}
            disabled={page >= totalPages}
            aria-label="Próxima página"
          >
            <ChevronRightIcon />
          </button>
        </div>

        <form className="page-jump" onSubmit={handlePageSubmit}>
          <label htmlFor="page-jump-input" className="visually-hidden">
            Ir para a página
          </label>
          <input
            id="page-jump-input"
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            className="page-jump__input"
          />
          <button type="submit" className="button button--ghost button--small">
            Ir
          </button>
        </form>

        {currentChapter ? (
          <span className="chapter-chip" title={currentChapter.title}>
            <ChaptersIcon size={15} /> {truncate(currentChapter.title, 48)}
          </span>
        ) : null}

        <div
          className="reader__mini-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overallProgress * 100)}
          aria-label="Progresso do livro"
        >
          <span style={{ width: `${overallProgress * 100}%` }} />
        </div>
      </div>

      {book.needsOcr ? (
        <div className="banner banner--warning" role="status">
          <AlertIcon />
          <div>
            <strong>PDF sem texto extraível (possivelmente digitalizado)</strong>
            <p>
              Este aplicativo não inclui OCR. A leitura em voz alta pode ficar vazia; use a
              visualização do PDF original ou converta o arquivo em um PDF com texto antes de
              importar novamente.
            </p>
            <button type="button" className="link-button" onClick={() => onPreferencesChange({ viewMode: 'pdf' })}>
              Ver PDF original
            </button>
          </div>
        </div>
      ) : null}

      {!voices.supported ? (
        <div className="banner banner--info" role="status">
          <AlertIcon />
          <div>
            <strong>Reprodução em voz alta indisponível</strong>
            <p>
              Este navegador não oferece a Web Speech API. O texto continua acessível para
              leitura na tela.
            </p>
          </div>
        </div>
      ) : null}

      <main className="reader__body">
        {preferences.viewMode === 'pdf' && fileUrl ? (
          <PdfFrame objectUrl={fileUrl} page={page} title={book.title} />
        ) : (
          <article className="page-reader" aria-label={`Página ${page} de ${totalPages}`}>
            <div className="page-reader__meta">
              <span>
                Página {page} de {totalPages}
              </span>
              {activeTextChunk && status === 'playing' ? (
                <span className="reading-now">
                  <span className="status-dot status-dot--playing" aria-hidden="true" /> lendo agora
                </span>
              ) : (
                <span>{book.pageCount > 0 ? '' : 'Sem páginas'}</span>
              )}
            </div>

            {pageText.trim() ? (
              <div className="page-text" style={fontStyle}>
                {activeTextChunk && activeTextChunk.start < activeTextChunk.end ? (
                  <>
                    {pageText.slice(0, activeTextChunk.start)}
                    <mark
                      ref={(element) => {
                        highlightRef.current = element;
                      }}
                      className="reading-highlight"
                    >
                      {pageText.slice(activeTextChunk.start, activeTextChunk.end)}
                    </mark>
                    {pageText.slice(activeTextChunk.end)}
                  </>
                ) : (
                  pageText
                )}
              </div>
            ) : (
              <div className="page-empty">
                <FileTextIcon size={34} />
                <h2>Esta página não tem texto extraível</h2>
                <p>
                  Provavelmente ela é uma imagem digitalizada. O aplicativo não realiza OCR, então
                  não há texto para ouvir. Você pode visualizar o PDF original.
                </p>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => onPreferencesChange({ viewMode: 'pdf' })}
                >
                  <EyeIcon /> Ver PDF original
                </button>
              </div>
            )}

            <div className="page-reader__footer">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => changePage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeftIcon /> Página anterior
              </button>
              {speechChunks.length > 0 ? (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={status === 'playing' ? () => queue.pause() : playFromStart}
                >
                  {status === 'playing' ? (
                    <>
                      <CloseIcon size={16} /> Pausar
                    </>
                  ) : (
                    <>
                      <RefreshIcon size={16} /> Ler esta página do início
                    </>
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className="button button--ghost"
                onClick={() => changePage(page + 1)}
                disabled={page >= totalPages}
              >
                Próxima página <ChevronRightIcon />
              </button>
            </div>
          </article>
        )}
      </main>

      <p className="visually-hidden" aria-live="polite">
        {status === 'playing'
          ? `Reproduzindo página ${page}, bloco ${Math.min(activeChunk + 1, Math.max(speechChunks.length, 1))} de ${speechChunks.length}.`
          : status === 'paused'
            ? 'Reprodução pausada.'
            : ''}
      </p>

      <PlayerBar
        status={status}
        page={page}
        pageCount={totalPages}
        chunkIndex={activeChunk}
        chunkCount={speechChunks.length}
        passage={passage}
        boundary={boundary}
        rate={preferences.rate}
        voiceLabel={voiceLabel}
        autoAdvance={preferences.autoAdvance}
        onToggle={togglePlayback}
        onStop={() => {
          queue.stop();
          setBoundary(null);
        }}
        onPrevChunk={prevBlock}
        onNextChunk={nextBlock}
        onPrevPage={() => changePage(page - 1)}
        onNextPage={() => changePage(page + 1)}
        onOpenSettings={() => setPanel('settings')}
      />

      {panel === 'settings' ? (
        <SettingsPanel
          preferences={preferences}
          voices={voices}
          onChange={onPreferencesChange}
          onReloadVoices={voices.reload}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {panel === 'bookmarks' ? (
        <BookmarksPanel
          bookmarks={bookmarks}
          onJump={(bookmark) => {
            setPanel(null);
            changePage(bookmark.page, {
              seekChunk: bookmark.chunkIndex,
              autoplay: status === 'playing',
            });
          }}
          onDelete={(bookmark) => void removeBookmark(bookmark)}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {panel === 'chapters' ? (
        <ChaptersPanel
          chapters={book.chapters}
          currentPage={page}
          onJump={(chapter) => {
            setPanel(null);
            changePage(chapter.page, { autoplay: status === 'playing' });
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {panel === 'help' ? <HelpDialog onClose={() => setPanel(null)} /> : null}
    </div>
  );
}
