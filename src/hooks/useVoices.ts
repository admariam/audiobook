import { useCallback, useEffect, useState } from 'react';
import { getSpeechSynthesis, isSpeechSupported, sortVoices } from '../lib/speech';

export interface VoicesState {
  supported: boolean;
  loaded: boolean;
  voices: SpeechSynthesisVoice[];
}

export function useVoices(): VoicesState & { reload: () => void } {
  const [state, setState] = useState<VoicesState>(() => ({
    supported: isSpeechSupported(),
    loaded: false,
    voices: [],
  }));

  const read = useCallback(() => {
    const synth = getSpeechSynthesis();
    if (!synth) {
      setState({ supported: false, loaded: true, voices: [] });
      return;
    }
    const voices = sortVoices(synth.getVoices());
    setState({ supported: true, loaded: voices.length > 0, voices });
  }, []);

  useEffect(() => {
    read();
    const synth = getSpeechSynthesis();
    if (!synth) return;

    const handleChange = () => read();
    synth.addEventListener?.('voiceschanged', handleChange);
    const timer = window.setTimeout(read, 700);
    const secondTimer = window.setTimeout(read, 2000);

    return () => {
      synth.removeEventListener?.('voiceschanged', handleChange);
      window.clearTimeout(timer);
      window.clearTimeout(secondTimer);
    };
  }, [read]);

  return { ...state, reload: read };
}
