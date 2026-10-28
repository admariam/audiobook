import { clamp } from './format';

export type SpeechStatus = 'idle' | 'playing' | 'paused';

export interface SpeechSettings {
  rate: number;
  volume: number;
  voiceURI: string | null;
}

export interface SpeechQueueEvents {
  onStatusChange?: (status: SpeechStatus) => void;
  onChunkChange?: (index: number) => void;
  onBoundary?: (charIndex: number, charLength: number) => void;
  onPageEnd?: () => void;
  onError?: (message: string) => void;
}

export interface SpeechQueueOptions {
  synth?: SpeechSynthesis | null;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
  events?: SpeechQueueEvents;
  settings?: SpeechSettings;
}

export const RATE_MIN = 0.7;
export const RATE_MAX = 2;
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 1;

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

export function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis ?? null;
}

export function isPortugueseVoice(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.toLowerCase().startsWith('pt');
}

export function isBrazilianVoice(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.toLowerCase().replace('_', '-') === 'pt-br';
}

/** Ordena vozes priorizando pt-BR, depois pt-PT/outros pt, depois as demais. */
export function sortVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const score = (voice: SpeechSynthesisVoice) => {
      if (isBrazilianVoice(voice)) return 0;
      if (isPortugueseVoice(voice)) return 1;
      return 2;
    };
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    const localDiff = Number(b.localService) - Number(a.localService);
    if (localDiff !== 0) return localDiff;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

export function pickDefaultVoice(
  voices: SpeechSynthesisVoice[],
  preferredURI: string | null,
): SpeechSynthesisVoice | null {
  if (preferredURI) {
    const preferred = voices.find((voice) => voice.voiceURI === preferredURI);
    if (preferred) return preferred;
  }
  return sortVoices(voices)[0] ?? null;
}

function resolveVoice(synth: SpeechSynthesis, voiceURI: string | null): SpeechSynthesisVoice | null {
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = synth.getVoices();
  } catch {
    voices = [];
  }
  return pickDefaultVoice(voices, voiceURI);
}

function describeSpeechError(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'NotAllowedError':
      return 'O navegador bloqueou a reprodução de voz. Toque em Reproduzir novamente para permitir.';
    case 'audio-busy':
      return 'O dispositivo de áudio está ocupado por outro aplicativo. Tente novamente em instantes.';
    case 'audio-hardware':
      return 'Nenhum dispositivo de áudio foi encontrado.';
    case 'network':
      return 'A voz selecionada precisa de conexão com a internet ou falhou ao carregar.';
    case 'language-unavailable':
    case 'voice-unavailable':
      return 'A voz selecionada não está mais disponível neste navegador. Escolha outra voz nas configurações.';
    case 'synthesis-failed':
    case 'synthesis-unavailable':
      return 'A síntese de voz falhou. Tente outra voz ou reinicie a reprodução.';
    default:
      return 'Ocorreu um erro na síntese de voz. Tente novamente ou escolha outra voz.';
  }
}

/**
 * Fila de reprodução para o texto de uma página.
 * Usa tokens de geração para descartar eventos tardios de utterances canceladas,
 * evitando repetições, cortes e avanços duplicados.
 */
export class SpeechQueue {
  private readonly synth: SpeechSynthesis | null;
  private readonly createUtterance: (text: string) => SpeechSynthesisUtterance;
  private readonly events: SpeechQueueEvents;
  private settings: SpeechSettings;
  private chunks: string[] = [];
  private index = 0;
  private status: SpeechStatus = 'idle';
  private token = 0;
  private current: SpeechSynthesisUtterance | null = null;

  constructor(options: SpeechQueueOptions = {}) {
    this.synth = options.synth === undefined ? getSpeechSynthesis() : options.synth;
    this.createUtterance =
      options.createUtterance ??
      ((text) => new SpeechSynthesisUtterance(text));
    this.events = options.events ?? {};
    this.settings = options.settings ?? { rate: 1, volume: 1, voiceURI: null };
  }

  getStatus(): SpeechStatus {
    return this.status;
  }

  getIndex(): number {
    return this.index;
  }

  getChunks(): readonly string[] {
    return this.chunks;
  }

  getSettings(): SpeechSettings {
    return { ...this.settings };
  }

  isSupported(): boolean {
    return this.synth !== null;
  }

  setSettings(settings: SpeechSettings): void {
    const previous = this.settings;
    this.settings = settings;
    const changed =
      previous.rate !== settings.rate ||
      previous.volume !== settings.volume ||
      previous.voiceURI !== settings.voiceURI;
    if (!changed) return;

    if (this.status === 'playing') {
      this.restartCurrent();
    } else if (this.status === 'paused') {
      this.cancelInternal();
      this.setStatus('idle');
    }
  }

  load(chunks: string[], startIndex = 0): void {
    this.cancelInternal();
    this.chunks = [...chunks];
    const safeIndex = Math.max(0, Math.min(startIndex, Math.max(0, this.chunks.length - 1)));
    this.index = safeIndex;
    this.setStatus('idle');
    this.events.onChunkChange?.(this.index);
  }

  play(): void {
    if (!this.synth) {
      this.events.onError?.(
        'A síntese de voz não está disponível neste navegador. Você ainda pode ler o texto na tela.',
      );
      return;
    }
    if (this.chunks.length === 0) return;

    if (this.status === 'paused') {
      try {
        this.synth.resume();
        this.setStatus('playing');
        return;
      } catch {
        this.setStatus('idle');
      }
    }

    if (this.status === 'playing') return;

    if (this.index >= this.chunks.length) {
      this.index = 0;
      this.events.onChunkChange?.(this.index);
    }

    this.token += 1;
    try {
      this.synth.cancel();
    } catch {
      // alguns navegadores lançam se não houver nada para cancelar
    }
    this.current = null;
    this.setStatus('playing');
    this.speak(this.token);
  }

  pause(): void {
    if (!this.synth || this.status !== 'playing') return;
    try {
      this.synth.pause();
      this.setStatus('paused');
    } catch {
      this.events.onError?.('Não foi possível pausar a reprodução neste navegador.');
    }
  }

  toggle(): void {
    if (this.status === 'playing') this.pause();
    else this.play();
  }

  stop(): void {
    this.cancelInternal();
    this.setStatus('idle');
  }

  /** Reproduz um bloco específico; autoplay indica se deve começar imediatamente. */
  seekToChunk(index: number, autoplay = false): void {
    if (this.chunks.length === 0) return;
    const safe = Math.max(0, Math.min(index, this.chunks.length - 1));
    const wasPlaying = this.status === 'playing';
    this.cancelInternal();
    this.index = safe;
    this.events.onChunkChange?.(safe);
    if (autoplay || wasPlaying) {
      this.setStatus('playing');
      this.token += 1;
      this.speak(this.token);
    } else {
      this.setStatus('idle');
    }
  }

  next(autoplay = false): void {
    if (this.chunks.length === 0) {
      this.events.onPageEnd?.();
      return;
    }
    if (this.index >= this.chunks.length - 1) {
      this.cancelInternal();
      this.setStatus('idle');
      this.events.onPageEnd?.();
      return;
    }
    this.seekToChunk(this.index + 1, autoplay || this.status === 'playing');
  }

  previous(): void {
    if (this.chunks.length === 0) return;
    this.seekToChunk(Math.max(0, this.index - 1), this.status === 'playing');
  }

  dispose(): void {
    this.cancelInternal();
    this.setStatus('idle');
  }

  private restartCurrent(): void {
    this.cancelInternal();
    this.setStatus('playing');
    this.token += 1;
    this.speak(this.token);
  }

  private cancelInternal(): void {
    this.token += 1;
    this.current = null;
    try {
      this.synth?.cancel();
    } catch {
      // ignora
    }
  }

  private setStatus(status: SpeechStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.onStatusChange?.(status);
  }

  private speak(gen: number): void {
    if (!this.synth) return;
    const text = this.chunks[this.index];
    if (text === undefined) {
      this.setStatus('idle');
      return;
    }

    const utterance = this.createUtterance(text);
    utterance.rate = clamp(this.settings.rate, RATE_MIN, RATE_MAX);
    utterance.volume = clamp(this.settings.volume, VOLUME_MIN, VOLUME_MAX);
    const voice = resolveVoice(this.synth, this.settings.voiceURI);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'pt-BR';

    utterance.onboundary = (event) => {
      if (gen !== this.token || this.current !== utterance) return;
      this.events.onBoundary?.(event.charIndex ?? 0, event.charLength ?? 0);
    };

    utterance.onend = () => {
      if (gen !== this.token || this.current !== utterance) return;
      this.current = null;
      this.advance();
    };

    utterance.onerror = (event) => {
      if (gen !== this.token || this.current !== utterance) return;
      const error = String((event as SpeechSynthesisErrorEvent).error ?? '');
      if (error === 'interrupted' || error === 'canceled') return;
      this.current = null;
      this.cancelInternal();
      this.setStatus('idle');
      this.events.onError?.(describeSpeechError(error));
    };

    this.current = utterance;
    try {
      this.synth.speak(utterance);
    } catch {
      this.current = null;
      this.setStatus('idle');
      this.events.onError?.('Não foi possível iniciar a síntese de voz neste navegador.');
    }
  }

  private advance(): void {
    const nextIndex = this.index + 1;
    if (nextIndex < this.chunks.length) {
      this.index = nextIndex;
      this.events.onChunkChange?.(this.index);
      if (this.status === 'playing') {
        this.speak(this.token);
      }
      return;
    }

    this.index = this.chunks.length;
    this.events.onChunkChange?.(this.index);
    this.setStatus('idle');
    this.events.onPageEnd?.();
  }
}
