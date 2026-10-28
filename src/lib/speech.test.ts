import { describe, expect, it, vi } from 'vitest';
import { SpeechQueue, type SpeechQueueEvents } from './speech';

class FakeUtterance {
  text: string;
  lang = '';
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

class FakeSynthesizer {
  voices: SpeechSynthesisVoice[] = [];
  spoken: FakeUtterance[] = [];
  cancelCalls = 0;
  paused = false;
  resumeCalls = 0;

  getVoices = (): SpeechSynthesisVoice[] => this.voices;

  speak = (utterance: SpeechSynthesisUtterance): void => {
    this.spoken.push(utterance as unknown as FakeUtterance);
  };

  cancel = (): void => {
    this.cancelCalls += 1;
  };

  pause = (): void => {
    this.paused = true;
  };

  resume = (): void => {
    this.paused = false;
    this.resumeCalls += 1;
  };
}

function createQueue(events: SpeechQueueEvents = {}, settings = { rate: 1, volume: 1, voiceURI: null as string | null }) {
  const synth = new FakeSynthesizer();
  const queue = new SpeechQueue({
    synth: synth as unknown as SpeechSynthesis,
    createUtterance: (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
    events,
    settings,
  });
  return { synth, queue };
}

function makeVoice(uri: string, name: string, lang: string): SpeechSynthesisVoice {
  return {
    voiceURI: uri,
    name,
    lang,
    localService: true,
    default: false,
  } as SpeechSynthesisVoice;
}

describe('SpeechQueue', () => {
  it('reproduz blocos em sequência e avança ao terminar', () => {
    const chunksSeen: number[] = [];
    const pageEnd = vi.fn();
    const statuses: string[] = [];
    const { synth, queue } = createQueue({
      onChunkChange: (index) => chunksSeen.push(index),
      onPageEnd: pageEnd,
      onStatusChange: (status) => statuses.push(status),
    });

    queue.load(['Primeiro bloco.', 'Segundo bloco.']);
    queue.play();

    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].text).toBe('Primeiro bloco.');
    expect(queue.getStatus()).toBe('playing');

    synth.spoken[0].onend?.();
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe('Segundo bloco.');

    synth.spoken[1].onend?.();
    expect(pageEnd).toHaveBeenCalledTimes(1);
    expect(queue.getStatus()).toBe('idle');
    expect(chunksSeen).toEqual([0, 1, 2]);
    expect(statuses).toContain('playing');
  });

  it('pausa e retoma sem criar novas utterances', () => {
    const { synth, queue } = createQueue();
    queue.load(['A', 'B']);
    queue.play();
    expect(synth.spoken).toHaveLength(1);

    queue.pause();
    expect(synth.paused).toBe(true);
    expect(queue.getStatus()).toBe('paused');

    queue.play();
    expect(synth.resumeCalls).toBe(1);
    expect(queue.getStatus()).toBe('playing');
    expect(synth.spoken).toHaveLength(1);
  });

  it('ignora eventos tardios de utterances canceladas', () => {
    const pageEnd = vi.fn();
    const { synth, queue } = createQueue({ onPageEnd: pageEnd });
    queue.load(['A', 'B']);
    queue.play();

    const stale = synth.spoken[0];
    queue.stop();
    stale.onend?.();

    expect(synth.spoken).toHaveLength(1);
    expect(pageEnd).not.toHaveBeenCalled();
    expect(queue.getStatus()).toBe('idle');
  });

  it('avança e retrocede entre blocos mantendo a reprodução', () => {
    const { synth, queue } = createQueue();
    queue.load(['A', 'B', 'C']);
    queue.play();
    expect(synth.spoken[0].text).toBe('A');

    queue.next();
    expect(synth.spoken[1].text).toBe('B');
    expect(queue.getIndex()).toBe(1);

    queue.previous();
    expect(synth.spoken[2].text).toBe('A');
    expect(queue.getIndex()).toBe(0);
  });

  it('emite evento de fim de página ao avançar além do último bloco', () => {
    const pageEnd = vi.fn();
    const { queue } = createQueue({ onPageEnd: pageEnd });
    queue.load(['Único']);
    queue.next();
    expect(pageEnd).toHaveBeenCalledTimes(1);
  });

  it('usa voz pt-BR por padrão e respeita a voz escolhida', () => {
    const pt = makeVoice('pt-br-ana', 'Ana', 'pt-BR');
    const en = makeVoice('en-us-john', 'John', 'en-US');
    const { synth, queue } = createQueue();
    synth.voices = [en, pt];

    queue.load(['Olá']);
    queue.play();
    expect(synth.spoken[0].voice?.voiceURI).toBe('pt-br-ana');
    expect(synth.spoken[0].lang).toBe('pt-BR');

    queue.setSettings({ rate: 1, volume: 1, voiceURI: 'en-us-john' });
    queue.play();
    expect(synth.spoken[synth.spoken.length - 1].voice?.voiceURI).toBe('en-us-john');
  });

  it('aplica velocidade e volume configurados', () => {
    const { synth, queue } = createQueue({}, { rate: 1.6, volume: 0.35, voiceURI: null });
    queue.load(['Teste']);
    queue.play();
    const utterance = synth.spoken[0];
    expect(utterance.rate).toBe(1.6);
    expect(utterance.volume).toBe(0.35);
  });

  it('reinicia o bloco atual ao mudar a velocidade durante a reprodução', () => {
    const { synth, queue } = createQueue();
    queue.load(['A', 'B']);
    queue.play();
    expect(synth.spoken).toHaveLength(1);

    queue.setSettings({ rate: 1.8, volume: 1, voiceURI: null });
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe('A');
    expect(synth.spoken[1].rate).toBe(1.8);
  });

  it('repassa eventos de limite de palavra', () => {
    const onBoundary = vi.fn();
    const { synth, queue } = createQueue({ onBoundary });
    queue.load(['Olá mundo']);
    queue.play();

    synth.spoken[0].onboundary?.({
      charIndex: 4,
      charLength: 5,
    } as SpeechSynthesisEvent);

    expect(onBoundary).toHaveBeenCalledWith(4, 5);
  });

  it('ignora erros de interrupção e informa erros reais', () => {
    const onError = vi.fn();
    const { synth, queue } = createQueue({ onError });
    queue.load(['A', 'B']);
    queue.play();

    synth.spoken[0].onerror?.({ error: 'interrupted' } as SpeechSynthesisErrorEvent);
    expect(onError).not.toHaveBeenCalled();
    expect(queue.getStatus()).toBe('playing');

    synth.spoken[0].onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(queue.getStatus()).toBe('idle');
  });

  it('informa quando a síntese não está disponível', () => {
    const onError = vi.fn();
    const queue = new SpeechQueue({
      synth: null,
      createUtterance: (text) => new FakeUtterance(text) as unknown as SpeechSynthesisUtterance,
      events: { onError },
    });
    queue.load(['A']);
    queue.play();
    expect(queue.isSupported()).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it('não faz nada ao reproduzir fila vazia', () => {
    const { synth, queue } = createQueue();
    queue.load([]);
    queue.play();
    expect(synth.spoken).toHaveLength(0);
    expect(queue.getStatus()).toBe('idle');
  });
});
