import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPreferences,
  defaultPreferences,
  loadPreferences,
  sanitizePreferences,
  savePreferences,
} from './preferences';

describe('preferences', () => {
  afterEach(() => {
    clearPreferences();
  });

  it('usa padrões quando não há nada salvo', () => {
    clearPreferences();
    const prefs = loadPreferences();
    expect(prefs.fontSize).toBe(defaultPreferences.fontSize);
    expect(['light', 'dark']).toContain(prefs.theme);
  });

  it('limita valores fora do intervalo', () => {
    const prefs = sanitizePreferences({
      fontSize: 999,
      lineHeight: -2,
      rate: 99,
      volume: -1,
      theme: 'neon',
      viewMode: 'hologram',
      autoAdvance: 'sim',
    });
    expect(prefs.fontSize).toBe(34);
    expect(prefs.lineHeight).toBe(1.3);
    expect(prefs.rate).toBe(2);
    expect(prefs.volume).toBe(0);
    expect(prefs.theme).toBe('light');
    expect(prefs.viewMode).toBe('text');
    expect(prefs.autoAdvance).toBe(true);
  });

  it('salva e recupera preferências', () => {
    savePreferences({
      ...defaultPreferences,
      theme: 'dark',
      fontSize: 26,
      voiceURI: 'pt-br-voz',
      rate: 1.4,
      lastBookId: 'livro-1',
    });
    const restored = loadPreferences();
    expect(restored.theme).toBe('dark');
    expect(restored.fontSize).toBe(26);
    expect(restored.voiceURI).toBe('pt-br-voz');
    expect(restored.rate).toBe(1.4);
    expect(restored.lastBookId).toBe('livro-1');
  });

  it('ignora JSON corrompido', () => {
    localStorage.setItem('audiobook-pessoal:prefs:v1', '{inválido');
    expect(() => loadPreferences()).not.toThrow();
  });
});
