import { useEffect, useId, useRef } from 'react';
import { CloseIcon, KeyboardIcon } from './icons';

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'Espaço ou K', action: 'Reproduzir / pausar' },
  { keys: 'Seta para a direita', action: 'Próximo bloco de texto' },
  { keys: 'Seta para a esquerda', action: 'Bloco anterior' },
  { keys: 'Page Down', action: 'Próxima página' },
  { keys: 'Page Up', action: 'Página anterior' },
  { keys: 'M', action: 'Adicionar marcador na página atual' },
  { keys: 'T', action: 'Alternar tema claro/escuro' },
  { keys: 'V', action: 'Alternar entre texto e PDF original' },
  { keys: '?', action: 'Abrir esta lista de atalhos' },
  { keys: 'Esc', action: 'Fechar painéis e diálogos' },
];

interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="modal-layer">
      <div className="modal-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal__header">
          <span className="modal__badge" aria-hidden="true">
            <KeyboardIcon size={22} />
          </span>
          <h2 id={titleId} className="modal__title">
            Atalhos de teclado
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fechar atalhos"
          >
            <CloseIcon />
          </button>
        </div>
        <p className="modal__description">
          Os atalhos funcionam quando o foco não está em um campo de texto.
        </p>
        <dl className="shortcut-list">
          {SHORTCUTS.map((shortcut) => (
            <div className="shortcut-list__row" key={shortcut.keys}>
              <dt>
                <kbd>{shortcut.keys}</kbd>
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
        <div className="modal__actions">
          <button type="button" className="button button--primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
