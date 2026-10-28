import { useEffect, useRef, useState } from 'react';
import type { BackupImportResult, BookMeta, Preferences } from '../types';
import { buildBackup, parseBackupFile, restoreBackup, serializeBackup, BackupError } from '../lib/backup';
import { clearAllData, listBookmarks } from '../lib/db';
import { clearPreferences } from '../lib/preferences';
import { ConfirmDialog } from './ConfirmDialog';
import { Drawer } from './Drawer';
import { DownloadIcon, ShieldIcon, TrashIcon, UploadIcon } from './icons';

interface DataDialogProps {
  books: BookMeta[];
  preferences: Preferences;
  onPreferencesRestored: (preferences: Preferences) => void;
  onDataChanged: () => void;
  onCleared: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
  onClose: () => void;
}

function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataDialog({
  books,
  preferences,
  onPreferencesRestored,
  onDataChanged,
  onCleared,
  notify,
  onClose,
}: DataDialogProps) {
  const [bookmarkCount, setBookmarkCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void listBookmarks()
      .then((bookmarks) => {
        if (active) setBookmarkCount(bookmarks.length);
      })
      .catch(() => {
        if (active) setBookmarkCount(0);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleExport = async () => {
    setBusy(true);
    try {
      const bookmarks = await listBookmarks();
      const backup = buildBackup(books, bookmarks, preferences);
      const date = new Date().toISOString().slice(0, 10);
      downloadText(serializeBackup(backup), `audiobook-pessoal-backup-${date}.json`);
      notify('Backup exportado. O arquivo contém apenas metadados, marcadores e preferências.', 'success');
    } catch {
      notify('Não foi possível exportar o backup.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const backup = parseBackupFile(text);
      const { result, preferences: restored } = await restoreBackup(backup);
      onPreferencesRestored(restored);
      onDataChanged();
      const summary = summarize(result);
      notify(summary, result.bookmarksRestored > 0 ? 'success' : 'info');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      const message =
        error instanceof BackupError
          ? error.message
          : 'Não foi possível importar o backup. Verifique o arquivo e tente novamente.';
      notify(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      await clearAllData();
      clearPreferences();
      setConfirmClear(false);
      notify('Todos os livros, marcadores e preferências foram apagados deste dispositivo.', 'success');
      onCleared();
      onClose();
    } catch {
      notify('Não foi possível apagar os dados. Feche outras abas do aplicativo e tente novamente.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        title="Dados e privacidade"
        subtitle="Seus livros ficam armazenados somente neste navegador."
        onClose={onClose}
      >
        <section className="data-section">
          <h3 className="settings-group__title">
            <ShieldIcon size={18} /> Onde os dados ficam
          </h3>
          <p>
            Os PDFs, o texto extraído e os marcadores são guardados no <strong>IndexedDB</strong>{' '}
            deste navegador. Nada é enviado para servidores. O navegador pode apagar esses dados
            automaticamente quando o armazenamento estiver sob pressão ou quando você limpar os
            dados do site.
          </p>
          <p className="field__hint">
            {books.length} {books.length === 1 ? 'livro armazenado' : 'livros armazenados'} ·{' '}
            {bookmarkCount === null
              ? 'carregando marcadores…'
              : `${bookmarkCount} ${bookmarkCount === 1 ? 'marcador' : 'marcadores'}`}
          </p>
        </section>

        <section className="data-section">
          <h3 className="settings-group__title">Backup</h3>
          <p>
            O backup inclui metadados dos livros, marcadores e preferências. Os arquivos PDF{' '}
            <strong>não</strong> são incluídos — guarde os PDFs originais separadamente.
          </p>
          <div className="data-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={handleExport}
              disabled={busy}
            >
              <DownloadIcon /> Exportar backup
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <UploadIcon /> Importar backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              aria-label="Selecionar arquivo de backup"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
              }}
            />
          </div>
          <p className="field__hint">
            Ao importar, os marcadores são associados a livros já presentes no dispositivo pelo
            nome, tamanho e número de páginas. Livros ausentes não são recriados.
          </p>
        </section>

        <section className="data-section data-section--danger">
          <h3 className="settings-group__title">Apagar dados</h3>
          <p>
            Remove todos os livros, textos, marcadores e preferências deste navegador. Essa ação
            não pode ser desfeita.
          </p>
          <button
            type="button"
            className="button button--danger"
            onClick={() => setConfirmClear(true)}
            disabled={busy}
          >
            <TrashIcon /> Apagar todos os dados
          </button>
        </section>
      </Drawer>

      {confirmClear ? (
        <ConfirmDialog
          title="Apagar todos os dados?"
          message="Todos os PDFs importados, textos, marcadores e preferências serão removidos deste navegador. Os arquivos originais continuarão onde você os guardou."
          confirmLabel="Apagar tudo"
          danger
          busy={busy}
          onConfirm={() => void handleClear()}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}
    </>
  );
}

function summarize(result: BackupImportResult): string {
  const parts: string[] = [];
  if (result.bookmarksRestored > 0) {
    parts.push(
      `${result.bookmarksRestored} ${result.bookmarksRestored === 1 ? 'marcador restaurado' : 'marcadores restaurados'}`,
    );
  }
  if (result.booksUnmatched > 0) {
    parts.push(
      `${result.booksUnmatched} ${result.booksUnmatched === 1 ? 'livro do backup não está' : 'livros do backup não estão'} neste dispositivo`,
    );
  }
  parts.push('preferências restauradas');
  if (result.bookmarksRestored === 0 && result.booksUnmatched === 0) {
    return 'Backup importado. Nenhum marcador novo para adicionar; preferências restauradas.';
  }
  return `Backup importado: ${parts.join('; ')}.`;
}
