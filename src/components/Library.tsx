import { useCallback, useMemo, useRef, useState } from 'react';
import type { BookMeta, Preferences, SortKey } from '../types';
import { createBook, deleteBook } from '../lib/db';
import { createId } from '../lib/ids';
import { formatBytes, pluralize } from '../lib/format';
import type { ToastTone } from './Toasts';
import { BookCard } from './BookCard';
import { ConfirmDialog } from './ConfirmDialog';
import { DataDialog } from './DataDialog';
import { HelpDialog } from './HelpDialog';
import {
  BookOpenIcon,
  DownloadIcon,
  KeyboardIcon,
  LogoIcon,
  MoonIcon,
  SearchIcon,
  ShieldIcon,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

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

  const handleFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || importing) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const valid = files.filter(isPdfFile);
      if (valid.length < files.length) {
        notify(
          `${files.length - valid.length} ${pluralize(files.length - valid.length, 'arquivo ignorado', 'arquivos ignorados')}: apenas PDFs são aceitos.`,
          'error',
        );
      }
      if (valid.length === 0) return;

      let pdfModule: typeof import('../lib/pdf');
      try {
        pdfModule = await import('../lib/pdf');
      } catch {
        notify('Não foi possível carregar o leitor de PDFs. Recarregue a página e tente novamente.', 'error');
        return;
      }

      for (let index = 0; index < valid.length; index += 1) {
        const file = valid[index];
        if (file.size > MAX_FILE_SIZE) {
          notify(
            `“${file.name}” tem ${formatBytes(file.size)}. O limite é ${formatBytes(MAX_FILE_SIZE)} para evitar estouro de armazenamento.`,
            'error',
          );
          continue;
        }
        if (books.some((book) => book.fileName === file.name && book.size === file.size)) {
          notify(`“${file.name}” já está na sua biblioteca.`, 'info');
          continue;
        }

        setImporting({
          fileName: file.name,
          fileIndex: index + 1,
          fileCount: valid.length,
          page: 0,
          pageCount: 0,
          percent: 0,
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
          };

          await createBook(meta, file, {
            bookId: id,
            pages: parsed.pages,
            extractedAt: Date.now(),
          });

          await onBooksChanged();
          notify(`“${parsed.title}” foi adicionado à sua biblioteca.`, 'success');
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
    },
    [books, importing, notify, onBooksChanged],
  );

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
            <h1 className="brand__title">Audiobook Pessoal</h1>
            <p className="brand__tagline">Seus PDFs, sua voz, seu ritmo.</p>
          </div>
        </div>
        <div className="library__header-actions">
          <span className="privacy-chip" title="Nenhum dado sai do seu dispositivo">
            <ShieldIcon size={16} /> 100% local
          </span>
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
              Arraste o arquivo aqui ou escolha no dispositivo. O PDF fica salvo apenas neste
              navegador.
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
                  Importando {importing.fileIndex > 1 ? `${importing.fileIndex} de ${importing.fileCount}: ` : ''}
                  {importing.fileName}
                </span>
                <span>{importing.percent}%</span>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={importing.percent}
                aria-label="Progresso da importação"
              >
                <span className="progress__fill" style={{ width: `${importing.percent}%` }} />
              </div>
              <span className="field__hint">
                {importing.pageCount > 0
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
              <h3>Sua estante está vazia</h3>
              <p>
                Importe um PDF para começar a ouvir. Livros com texto selecionável funcionam
                melhor; PDFs digitalizados precisam de OCR, que não está incluído.
              </p>
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
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="library__footer">
        <div className="privacy-note">
          <ShieldIcon size={18} />
          <p>
            <strong>Privacidade por padrão.</strong> PDFs, textos e marcadores ficam no IndexedDB
            do seu navegador — nada é enviado a servidores. O navegador pode apagar esses dados ao
            limpar o site ou sob falta de espaço; exporte um backup regularmente.
          </p>
        </div>
        <div className="library__footer-actions">
          <button type="button" className="link-button" onClick={() => setShowData(true)}>
            <TrashIcon size={15} /> Dados e backup
          </button>
          <button type="button" className="link-button" onClick={() => setShowHelp(true)}>
            Atalhos de teclado
          </button>
        </div>
      </footer>

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

      {pendingDelete ? (
        <ConfirmDialog
          title="Excluir este livro?"
          message={`“${pendingDelete.title}” e todo o texto extraído serão removidos deste dispositivo, junto com os marcadores. O arquivo PDF original que você guardou não será afetado.`}
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
