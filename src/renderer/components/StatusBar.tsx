import React from 'react';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';

export default function StatusBar() {
  const { t, message } = useI18n();
  const { isRecognizing, settings, error, mfrStatus } = useAppStore();

  const pipeline = settings?.pipeline ?? '---';
  const local = settings?.ocrEngine === 'mfr';
  const ready = local ? mfrStatus?.state === 'ready' : !!settings?.apiUrl;
  const checking =
    local &&
    (!mfrStatus || ['downloading', 'validating', 'loading', 'clearing'].includes(mfrStatus.state));
  const status = local
    ? !mfrStatus
      ? t('Checking model...')
      : mfrStatus.state === 'ready'
        ? t('Model ready')
        : mfrStatus.state === 'downloading'
          ? t('Downloading model...')
          : mfrStatus.state === 'validating'
            ? t('Verifying model...')
            : mfrStatus.state === 'loading'
              ? t('Loading model...')
              : mfrStatus.state === 'clearing'
                ? t('Clearing model cache...')
                : mfrStatus.state === 'error'
                  ? t('Model unavailable')
                  : t('Model download required')
    : ready
      ? t('Configured')
      : t('Not configured');

  return (
    <footer className="flex items-center justify-between px-4 py-1 text-xs border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              ready ? 'bg-green-500' : checking ? 'bg-yellow-500' : 'bg-red-500'
            }`}
          />
          {status}
        </span>
        <span>{local ? t('Local MFR-1.5') : t('Pipeline: {pipeline}', { pipeline })}</span>
      </div>

      <div>
        {isRecognizing && <span className="animate-pulse">{t('Recognizing...')}</span>}
        {error && <span className="text-red-500">{message(error)}</span>}
        {!isRecognizing && !error && (
          <span>{checking ? t('Preparing model...') : ready ? t('Ready') : t('Setup needed')}</span>
        )}
      </div>
    </footer>
  );
}
