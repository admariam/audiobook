import { useState, type FormEvent } from 'react';
import {
  clearGithubConfig,
  isGithubConfigComplete,
  saveGithubConfig,
  suggestGithubConfig,
  testConnection,
  type GithubConfig,
} from '../lib/github';
import { flushOutbox } from '../lib/sync';
import { Drawer } from './Drawer';
import { AlertIcon, CloudIcon, ShieldIcon } from './icons';

interface CloudDialogProps {
  config: GithubConfig | null;
  onSaved: (config: GithubConfig | null) => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
  onClose: () => void;
}

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function CloudDialog({ config, onSaved, notify, onClose }: CloudDialogProps) {
  const [form, setForm] = useState<GithubConfig>(() => config ?? suggestGithubConfig());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (patch: Partial<GithubConfig>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const candidate: GithubConfig = {
      owner: form.owner.trim(),
      repo: form.repo.trim(),
      branch: form.branch.trim() || 'main',
      folder: form.folder.trim().replace(/^\/+|\/+$/g, '') || 'livros',
      token: form.token.trim(),
    };
    if (!isGithubConfigComplete(candidate)) {
      setError('Preencha o dono, o repositório e o token.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const info = await testConnection(candidate);
      if (!info.canWrite) {
        setError(
          'O token consegue ler o repositório, mas não gravar nele. Gere um token com acesso de leitura e escrita em "Contents".',
        );
        return;
      }
      saveGithubConfig(candidate);
      onSaved(candidate);
      notify(
        `Conectado a ${info.fullName}. Os livros serão guardados na pasta “${candidate.folder}”${
          info.isPrivate ? '' : ', que é pública'
        }.`,
        'success',
      );
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível conectar ao GitHub.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    await flushOutbox(config).catch(() => false);
    clearGithubConfig();
    onSaved(null);
    setBusy(false);
    notify('O GitHub foi desconectado deste aparelho. Os livros já baixados continuam aqui.', 'info');
    onClose();
  };

  return (
    <Drawer
      title="Biblioteca no GitHub"
      subtitle="Guarde os PDFs numa pasta do repositório e continue a leitura em outro aparelho"
      onClose={onClose}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <section className="data-section">
          <h3 className="settings-group__title">
            <CloudIcon size={18} /> Como funciona
          </h3>
          <p>
            Cada PDF importado aqui é enviado para a pasta escolhida do repositório. Em outro
            aparelho, configure o mesmo repositório e o livro aparece na lista para baixar. A página
            em que você parou e os marcadores são gravados no arquivo <code>progresso.json</code>{' '}
            da mesma pasta.
          </p>
          <p className="field__hint field__hint--warning">
            Repositórios públicos deixam os PDFs visíveis para qualquer pessoa que encontre o
            endereço do arquivo.
          </p>
        </section>

        <section className="data-section">
          <h3 className="settings-group__title">Repositório</h3>
          <div className="cloud-form__grid">
            <label className="field">
              <span className="field__label">Dono (usuário)</span>
              <input
                className="text-input"
                value={form.owner}
                onChange={(event) => update({ owner: event.target.value })}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </label>
            <label className="field">
              <span className="field__label">Repositório</span>
              <input
                className="text-input"
                value={form.repo}
                onChange={(event) => update({ repo: event.target.value })}
                autoComplete="off"
                spellCheck={false}
                required
              />
            </label>
            <label className="field">
              <span className="field__label">Branch</span>
              <input
                className="text-input"
                value={form.branch}
                onChange={(event) => update({ branch: event.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span className="field__label">Pasta dos livros</span>
              <input
                className="text-input"
                value={form.folder}
                onChange={(event) => update({ folder: event.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
        </section>

        <section className="data-section">
          <h3 className="settings-group__title">
            <ShieldIcon size={18} /> Token de acesso
          </h3>
          <label className="field">
            <span className="field__label">Token pessoal do GitHub</span>
            <input
              className="text-input"
              type="password"
              value={form.token}
              onChange={(event) => update({ token: event.target.value })}
              autoComplete="off"
              spellCheck={false}
              placeholder="github_pat_…"
              required
            />
          </label>
          <p className="field__hint">
            Crie um token em{' '}
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">
              github.com/settings/personal-access-tokens
            </a>{' '}
            do tipo <em>fine-grained</em>, dando acesso apenas a este repositório e permissão{' '}
            <strong>Contents: Read and write</strong>. Ele fica guardado só neste navegador; repita
            a configuração em cada aparelho.
          </p>
        </section>

        {error ? (
          <p className="cloud-form__error" role="alert">
            <AlertIcon size={16} /> {error}
          </p>
        ) : null}

        <div className="data-actions">
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? 'Conectando…' : config ? 'Salvar alterações' : 'Conectar ao GitHub'}
          </button>
          {config ? (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void handleDisconnect()}
              disabled={busy}
            >
              Desconectar deste aparelho
            </button>
          ) : null}
        </div>
      </form>
    </Drawer>
  );
}
