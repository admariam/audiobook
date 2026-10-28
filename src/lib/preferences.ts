import type { FontKey, Preferences, Theme, ViewMode } from '../types';
import { clamp } from './format';

const STORAGE_KEY = 'audiobook-pessoal:prefs:v1';

export const defaultPreferences: Preferences = {
  theme: 'light',
  fontFamily: 'serif',
  fontSize: 20,
  lineHeight: 1.7,
  voiceURI: null,
  rate: 1,
  volume: 1,
  autoAdvance: true,
  viewMode: 'text',
  lastBookId: null,
};

const FONT_KEYS: FontKey[] = ['serif', 'sans', 'mono'];
const THEMES: Theme[] = ['light', 'dark'];
const VIEW_MODES: ViewMode[] = ['text', 'pdf'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function sanitizePreferences(raw: unknown): Preferences {
  if (!isRecord(raw)) return { ...defaultPreferences };
  const merged = { ...defaultPreferences };

  if (typeof raw.theme === 'string' && THEMES.includes(raw.theme as Theme)) {
    merged.theme = raw.theme as Theme;
  }
  if (typeof raw.fontFamily === 'string' && FONT_KEYS.includes(raw.fontFamily as FontKey)) {
    merged.fontFamily = raw.fontFamily as FontKey;
  }
  if (typeof raw.fontSize === 'number') merged.fontSize = clamp(raw.fontSize, 15, 34);
  if (typeof raw.lineHeight === 'number') merged.lineHeight = clamp(raw.lineHeight, 1.3, 2.3);
  if (typeof raw.voiceURI === 'string' && raw.voiceURI.trim()) merged.voiceURI = raw.voiceURI;
  if (typeof raw.rate === 'number') merged.rate = clamp(raw.rate, 0.7, 2);
  if (typeof raw.volume === 'number') merged.volume = clamp(raw.volume, 0, 1);
  if (typeof raw.autoAdvance === 'boolean') merged.autoAdvance = raw.autoAdvance;
  if (typeof raw.viewMode === 'string' && VIEW_MODES.includes(raw.viewMode as ViewMode)) {
    merged.viewMode = raw.viewMode as ViewMode;
  }
  if (typeof raw.lastBookId === 'string' && raw.lastBookId.trim()) {
    merged.lastBookId = raw.lastBookId;
  }

  return merged;
}

export function loadPreferences(): Preferences {
  if (typeof localStorage === 'undefined') return { ...defaultPreferences };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return detectInitialPreferences();
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return detectInitialPreferences();
  }
}

function detectInitialPreferences(): Preferences {
  const prefs = { ...defaultPreferences };
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      prefs.theme = 'dark';
    }
  }
  return prefs;
}

export function savePreferences(preferences: Preferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Armazenamento cheio ou bloqueado: preferências continuam válidas na sessão.
  }
}

export function clearPreferences(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
}
