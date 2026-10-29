import type { Chapter } from '../types';
import { Drawer } from './Drawer';
import { ChaptersIcon } from './icons';

interface ChaptersPanelProps {
  chapters: Chapter[];
  currentPage: number;
  onJump: (chapter: Chapter) => void;
  onClose: () => void;
}

export function ChaptersPanel({ chapters, currentPage, onJump, onClose }: ChaptersPanelProps) {
  return (
    <Drawer
      title="Capítulos"
      subtitle="Sumário extraído dos marcadores do PDF."
      onClose={onClose}
    >
      {chapters.length === 0 ? (
        <div className="panel-empty">
          <ChaptersIcon size={32} />
          <p>Este PDF não possui capítulos ou marcadores identificáveis.</p>
          <p className="field__hint">
            Use a navegação por página e os marcadores do Audiobook Marcio para se orientar.
          </p>
        </div>
      ) : (
        <ul className="chapter-list">
          {chapters.map((chapter, index) => (
            <li key={`${chapter.page}-${index}-${chapter.title}`}>
              <button
                type="button"
                className={`chapter-item ${chapter.page === currentPage ? 'is-current' : ''}`}
                style={{ paddingLeft: `${12 + chapter.level * 14}px` }}
                onClick={() => onJump(chapter)}
                aria-current={chapter.page === currentPage ? 'true' : undefined}
              >
                <span className="chapter-item__title">{chapter.title}</span>
                <span className="chapter-item__page">{chapter.page}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
