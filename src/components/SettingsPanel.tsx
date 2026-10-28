import { useId } from 'react';
import type { Preferences } from '../types';
import { Drawer } from './Drawer';
import { AlertIcon, RefreshIcon, VolumeIcon } from './icons';
import { RATE_MAX, RATE_MIN } from '../lib/speech';
import type { VoicesState } from '../hooks/useVoices';

interface SettingsPanelProps {
  preferences: Preferences;
  voices: VoicesState;
  onChange: (patch: Partial<Preferences>) => void;
  onReloadVoices: () => void;
  onClose: () => void;
}

export function SettingsPanel({
  preferences,
  voices,
  onChange,
  onReloadVoices,
  onClose,
}: SettingsPanelProps) {
  const fontId = useId();
  const sizeId = useId();
  const lineId = useId();
  const voiceId = useId();
  const rateId = useId();
  const volumeId = useId();

  const savedVoiceMissing =
    preferences.voiceURI !== null &&
    voices.voices.length > 0 &&
    !voices.voices.some((voice) => voice.voiceURI === preferences.voiceURI);

  return (
    <Drawer
      title="Configurações"
      subtitle="Ajustes de leitura e reprodução salvos neste dispositivo."
      onClose={onClose}
    >
      <section className="settings-group" aria-labelledby={`${fontId}-title`}>
        <h3 id={`${fontId}-title`} className="settings-group__title">
          Aparência
        </h3>

        <div className="field">
          <span className="field__label">Tema</span>
          <div className="segmented" role="group" aria-label="Tema da interface">
            <button
              type="button"
              className="segmented__option"
              aria-pressed={preferences.theme === 'light'}
              onClick={() => onChange({ theme: 'light' })}
            >
              Claro
            </button>
            <button
              type="button"
              className="segmented__option"
              aria-pressed={preferences.theme === 'dark'}
              onClick={() => onChange({ theme: 'dark' })}
            >
              Escuro
            </button>
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor={fontId}>
            Fonte do texto
          </label>
          <select
            id={fontId}
            className="select"
            value={preferences.fontFamily}
            onChange={(event) =>
              onChange({ fontFamily: event.target.value as Preferences['fontFamily'] })
            }
          >
            <option value="serif">Serifada (leitura)</option>
            <option value="sans">Sem serifa</option>
            <option value="mono">Monoespaçada</option>
          </select>
        </div>

        <div className="field">
          <div className="field__row">
            <label className="field__label" htmlFor={sizeId}>
              Tamanho do texto
            </label>
            <output className="field__value" htmlFor={sizeId}>
              {preferences.fontSize} px
            </output>
          </div>
          <input
            id={sizeId}
            type="range"
            min={15}
            max={34}
            step={1}
            value={preferences.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </div>

        <div className="field">
          <div className="field__row">
            <label className="field__label" htmlFor={lineId}>
              Espaçamento entre linhas
            </label>
            <output className="field__value" htmlFor={lineId}>
              {preferences.lineHeight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
            </output>
          </div>
          <input
            id={lineId}
            type="range"
            min={1.3}
            max={2.3}
            step={0.05}
            value={preferences.lineHeight}
            onChange={(event) => onChange({ lineHeight: Number(event.target.value) })}
          />
        </div>
      </section>

      <section className="settings-group" aria-labelledby={`${voiceId}-title`}>
        <h3 id={`${voiceId}-title`} className="settings-group__title">
          Reprodução de voz
        </h3>

        {!voices.supported ? (
          <p className="inline-alert" role="status">
            <AlertIcon size={18} />
            <span>
              Este navegador não oferece a Web Speech API. Você pode ler o texto, mas a
              reprodução em voz alta não estará disponível.
            </span>
          </p>
        ) : (
          <>
            <div className="field">
              <div className="field__row">
                <label className="field__label" htmlFor={voiceId}>
                  Voz
                </label>
                <button
                  type="button"
                  className="link-button"
                  onClick={onReloadVoices}
                  aria-label="Recarregar lista de vozes"
                >
                  <RefreshIcon size={15} /> Recarregar
                </button>
              </div>
              <select
                id={voiceId}
                className="select"
                value={preferences.voiceURI ?? ''}
                onChange={(event) => onChange({ voiceURI: event.target.value || null })}
              >
                <option value="">Automática (prioriza pt-BR)</option>
                {voices.voices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} — {voice.lang}
                    {voice.localService ? ' (local)' : ' (online)'}
                  </option>
                ))}
              </select>
              {voices.voices.length === 0 ? (
                <p className="field__hint">
                  Nenhuma voz foi encontrada ainda. As vozes podem demorar a carregar ou não
                  existir neste navegador/sistema operacional.
                </p>
              ) : null}
              {savedVoiceMissing ? (
                <p className="field__hint field__hint--warning">
                  A voz salva não está mais disponível. A reprodução usará a voz automática até
                  você escolher outra.
                </p>
              ) : null}
            </div>

            <div className="field">
              <div className="field__row">
                <label className="field__label" htmlFor={rateId}>
                  Velocidade
                </label>
                <output className="field__value" htmlFor={rateId}>
                  {preferences.rate.toLocaleString('pt-BR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  x
                </output>
              </div>
              <input
                id={rateId}
                type="range"
                min={RATE_MIN}
                max={RATE_MAX}
                step={0.1}
                value={preferences.rate}
                onChange={(event) => onChange({ rate: Number(event.target.value) })}
              />
            </div>

            <div className="field">
              <div className="field__row">
                <label className="field__label" htmlFor={volumeId}>
                  <VolumeIcon size={16} /> Volume
                </label>
                <output className="field__value" htmlFor={volumeId}>
                  {Math.round(preferences.volume * 100)}%
                </output>
              </div>
              <input
                id={volumeId}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={preferences.volume}
                onChange={(event) => onChange({ volume: Number(event.target.value) })}
              />
              <p className="field__hint">
                O controle de volume depende do navegador e do sistema. Em alguns dispositivos
                ele pode ser ignorado.
              </p>
            </div>
          </>
        )}

        <label className="switch">
          <input
            type="checkbox"
            checked={preferences.autoAdvance}
            onChange={(event) => onChange({ autoAdvance: event.target.checked })}
          />
          <span>
            Continuar automaticamente na próxima página
            <small>Quando a página terminar, a leitura segue sozinha.</small>
          </span>
        </label>
      </section>

      <section className="settings-group">
        <h3 className="settings-group__title">Privacidade</h3>
        <p className="field__hint">
          O texto e o PDF ficam apenas neste navegador. A síntese de voz é feita pelo seu
          dispositivo; dependendo da voz escolhida, o navegador pode enviar o texto ao serviço de
          voz do sistema. Nenhum livro é enviado a servidores deste aplicativo.
        </p>
      </section>
    </Drawer>
  );
}
