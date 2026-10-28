import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

class MockUtterance {
  text: string;
  lang = 'pt-BR';
  rate = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

class MockSynthesizer {
  paused = false;
  speak = vi.fn();
  cancel = vi.fn();
  pause = vi.fn(() => {
    this.paused = true;
  });
  resume = vi.fn(() => {
    this.paused = false;
  });
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  getVoices = vi.fn(() => [] as SpeechSynthesisVoice[]);
}

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  configurable: true,
  writable: true,
  value: MockUtterance,
});

Object.defineProperty(window, 'speechSynthesis', {
  configurable: true,
  writable: true,
  value: new MockSynthesizer(),
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

if (!URL.createObjectURL) {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:test'),
  });
}
if (!URL.revokeObjectURL) {
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
});
