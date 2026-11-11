import React, { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/types';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';

/** Progress of an in-app update below the toolbar; hidden while nothing is happening. */
export default function UpdateBanner() {
  const { t, message } = useI18n();
  const showToast = useAppStore((state) => state.showToast);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.api.onUpdateStatus((next) => {
      if (active) setStatus(next);
    });
    void window.api.getUpdateStatus().then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (status.state === 'idle') return null;
  const key = `${status.state}:${'version' in status ? status.version : ''}`;
  if (dismissed === key) return null;

  const install = async () => {
    const result = await window.api.installUpdate();
    // Development runs download but never install.
    if (!result.started && result.file)
      showToast(
        t('Development build: the installer was saved to {file}', { file: result.file }),
        7000,
      );
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm ${
        status.state === 'error'
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300'
          : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-200'
      }`}
    >
      {status.state === 'downloading' && (
        <>
          <span>{t('Downloading OpenMathpix {version}...', { version: status.version })}</span>
          <progress
            aria-label={t('Update download')}
            max={status.total}
            value={status.received}
            className="h-1.5 w-32 accent-blue-600"
          />
          <span className="text-xs tabular-nums">
            {Math.floor((status.received / Math.max(status.total, 1)) * 100)}%
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void window.api.cancelUpdate()}
            className="btn-secondary !py-0.5 !text-xs"
          >
            {t('Cancel')}
          </button>
        </>
      )}
      {status.state === 'ready' && (
        <>
          <span className="flex-1">
            {t('OpenMathpix {version} is ready. Restart to install it; your data is kept.', {
              version: status.version,
            })}
          </span>
          <button
            type="button"
            onClick={() => void install()}
            className="btn-primary !py-0.5 !text-xs"
          >
            {t('Restart and Install')}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(key)}
            className="btn-secondary !py-0.5 !text-xs"
          >
            {t('Later')}
          </button>
        </>
      )}
      {status.state === 'error' && (
        <>
          <span className="flex-1 break-words">
            {t('Update failed: {message}', { message: message(status.message) })}
          </span>
          <button
            type="button"
            onClick={() => void window.api.downloadUpdate()}
            className="btn-secondary !py-0.5 !text-xs"
          >
            {t('Retry')}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(key)}
            className="btn-secondary !py-0.5 !text-xs"
          >
            {t('Close')}
          </button>
        </>
      )}
    </div>
  );
}
