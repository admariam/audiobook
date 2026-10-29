import { clamp } from '../lib/format';
import type { SpeechStatus } from '../lib/speech';
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  SettingsIcon,
  StopIcon,
} from './icons';

interface PlayerBarProps {
  status: SpeechStatus;
  page: number;
  pageCount: number;
  chunkIndex: number;
  chunkCount: number;
  passage: string;
  boundary: { charIndex: number; charLength: number } | null;
  rate: number;
  voiceLabel: string;
  autoAdvance: boolean;
  onToggle: () => void;
  onStop: () => void;
  onPrevChunk: () => void;
  onNextChunk: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onOpenSettings: () => void;
}

function renderPassage(
  passage: string,
  boundary: { charIndex: number; charLength: number } | null,
) {
  if (!boundary || boundary.charIndex < 0 || boundary.charIndex >= passage.length) {
    return passage;
  }
  const end = boundary.charLength
    ? Math.min(passage.length, boundary.charIndex + boundary.charLength)
    : passage.length;
  return (
    <>
      {passage.slice(0, boundary.charIndex)}
      <mark className="speech-word">{passage.slice(boundary.charIndex, end)}</mark>
      {passage.slice(end)}
    </>
  );
}

export function PlayerBar({
  status,
  page,
  pageCount,
  chunkIndex,
  chunkCount,
  passage,
  boundary,
  rate,
  voiceLabel,
  autoAdvance,
  onToggle,
  onStop,
  onPrevChunk,
  onNextChunk,
  onPrevPage,
  onNextPage,
  onOpenSettings,
}: PlayerBarProps) {
  const withinPage = chunkCount > 0 ? clamp((chunkIndex + 1) / chunkCount, 0, 1) : 0;
  const progress = pageCount > 0 ? clamp((page - 1 + withinPage) / pageCount, 0, 1) : 0;
  const isPlaying = status === 'playing';
  const statusLabel = isPlaying ? 'Reproduzindo' : status === 'paused' ? 'Pausado' : 'Pronto';

  return (
    <section className="player" aria-label="Barra de reprodução">
      <div className="player__progress" aria-hidden="true">
        <span className="player__progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="player__content">
        <div className="player__passage">
          <div className="player__meta">
            <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
            <span className="player__status">{statusLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              Página {page} de {pageCount}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Bloco {Math.min(chunkIndex + 1, Math.max(chunkCount, 1))} de{' '}
              {Math.max(chunkCount, 0)}
            </span>
          </div>
          <p className="player__text" aria-live="off">
            {passage ? renderPassage(passage, boundary) : 'Página sem texto. Toque em reproduzir para seguir até o texto.'}
          </p>
        </div>

        <div className="player__controls">
          <div className="player__control-group" role="group" aria-label="Navegação por página">
            <button
              type="button"
              className="icon-button"
              onClick={onPrevPage}
              disabled={page <= 1}
              aria-label="Página anterior"
              title="Página anterior (Page Up)"
            >
              <PreviousIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onNextPage}
              disabled={page >= pageCount}
              aria-label="Próxima página"
              title="Próxima página (Page Down)"
            >
              <NextIcon />
            </button>
          </div>

          <div className="player__control-group" role="group" aria-label="Controles de reprodução">
            <button
              type="button"
              className="icon-button"
              onClick={onPrevChunk}
              disabled={chunkCount === 0}
              aria-label="Bloco anterior"
              title="Bloco anterior (seta esquerda)"
            >
              <PreviousIcon />
            </button>
            <button
              type="button"
              className="player__play"
              onClick={onToggle}
              aria-label={isPlaying ? 'Pausar reprodução' : 'Reproduzir'}
              title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
            >
              {isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onNextChunk}
              disabled={chunkCount === 0}
              aria-label="Próximo bloco"
              title="Próximo bloco (seta direita)"
            >
              <NextIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onStop}
              disabled={status === 'idle'}
              aria-label="Parar reprodução"
              title="Parar"
            >
              <StopIcon />
            </button>
          </div>

          <div className="player__options">
            <span className="player__chip" title="Velocidade atual">
              {rate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x
            </span>
            <span className="player__voice" title={`Voz: ${voiceLabel}`}>
              {voiceLabel}
            </span>
            {autoAdvance ? (
              <span className="player__chip" title="Avança sozinho para a próxima página">
                auto
              </span>
            ) : null}
            <button
              type="button"
              className="icon-button"
              onClick={onOpenSettings}
              aria-label="Configurações de leitura e voz"
              title="Configurações"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
