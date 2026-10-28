import type { BookMeta } from '../types';
import { formatBytes, formatDate, formatPercent, pluralize, truncate } from '../lib/format';
import { BookOpenIcon, ClockIcon, PlayIcon, TrashIcon } from './icons';

interface BookCardProps {
  book: BookMeta;
  onContinue: () => void;
  onRestart: () => void;
  onDelete: () => void;
}

export function BookCard({ book, onContinue, onRestart, onDelete }: BookCardProps) {
  const percent = Math.round(book.progress * 100);
  const primaryLabel = book.lastOpenedAt ? 'Continuar' : 'Ler';

  return (
    <article className="book-card">
      <div className="book-card__cover" aria-hidden="true">
        <span className="book-card__spine" />
        <BookOpenIcon size={30} />
        <span className="book-card__cover-title">{truncate(book.title, 48)}</span>
      </div>

      <div className="book-card__body">
        <div className="book-card__heading">
          <h3 className="book-card__title">{book.title}</h3>
          {book.author ? <p className="book-card__author">{book.author}</p> : null}
        </div>

        <div className="book-card__chips">
          <span className="chip">{book.pageCount} págs.</span>
          <span className="chip">{formatBytes(book.size)}</span>
          {book.chapters.length > 0 ? (
            <span className="chip">
              {book.chapters.length}{' '}
              {pluralize(book.chapters.length, 'capítulo', 'capítulos')}
            </span>
          ) : null}
          {book.needsOcr ? (
            <span className="chip chip--warning">Requer OCR</span>
          ) : null}
        </div>

        <div className="book-card__progress">
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Progresso de ${book.title}`}>
            <span className="progress__fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="book-card__progress-meta">
            <span>{formatPercent(book.progress)}</span>
            <span>
              Página {Math.min(Math.max(book.currentPage, 1), book.pageCount)} de {book.pageCount}
            </span>
          </div>
        </div>

        <div className="book-card__meta">
          <span>
            <ClockIcon size={14} /> Importado em {formatDate(book.importedAt)}
          </span>
          <span>
            {book.lastOpenedAt
              ? `Último acesso em ${formatDate(book.lastOpenedAt)}`
              : 'Ainda não aberto'}
          </span>
        </div>

        <div className="book-card__actions">
          <button type="button" className="button button--primary" onClick={onContinue}>
            <PlayIcon size={17} /> {primaryLabel}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={onRestart}
            title="Abrir da primeira página"
            aria-label={`Abrir ${book.title} da primeira página`}
          >
            <BookOpenIcon size={17} /> Do início
          </button>
          <button
            type="button"
            className="icon-button icon-button--danger book-card__delete"
            onClick={onDelete}
            aria-label={`Excluir ${book.title}`}
            title="Excluir livro"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </article>
  );
}
