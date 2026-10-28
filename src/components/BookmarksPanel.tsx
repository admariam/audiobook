import type { Bookmark } from '../types';
import { formatDateTime } from '../lib/format';
import { Drawer } from './Drawer';
import { BookmarkFilledIcon, TrashIcon } from './icons';

interface BookmarksPanelProps {
  bookmarks: Bookmark[];
  onJump: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onClose: () => void;
}

export function BookmarksPanel({ bookmarks, onJump, onDelete, onClose }: BookmarksPanelProps) {
  const sorted = [...bookmarks].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <Drawer
      title="Marcadores"
      subtitle={`${bookmarks.length} ${bookmarks.length === 1 ? 'marcador salvo' : 'marcadores salvos'}`}
      onClose={onClose}
    >
      {sorted.length === 0 ? (
        <div className="panel-empty">
          <BookmarkFilledIcon size={32} />
          <p>Nenhum marcador neste livro.</p>
          <p className="field__hint">
            Use o botão de marcador ou a tecla <kbd>M</kbd> para salvar a posição atual.
          </p>
        </div>
      ) : (
        <ul className="bookmark-list">
          {sorted.map((bookmark) => (
            <li key={bookmark.id} className="bookmark-item">
              <button
                type="button"
                className="bookmark-item__jump"
                onClick={() => onJump(bookmark)}
              >
                <span className="bookmark-item__page">Página {bookmark.page}</span>
                <span className="bookmark-item__label">{bookmark.label}</span>
                <span className="bookmark-item__date">{formatDateTime(bookmark.createdAt)}</span>
              </button>
              <button
                type="button"
                className="icon-button icon-button--danger"
                onClick={() => onDelete(bookmark)}
                aria-label={`Excluir marcador da página ${bookmark.page}`}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
