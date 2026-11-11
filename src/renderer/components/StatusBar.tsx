import React from 'react';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';
import { engineIsActive } from '../engine-status';

export default function StatusBar() {
  const { t, message } = useI18n();
  const {
    isRecognizing,
    settings,
    error,
    mfrStatus: mfr,
    textellerStatus,
    engineStatuses,
  } = useAppStore();

  const pipeline = settings?.pipeline ?? '---';
  const engine = settings?.ocrEngine ?? 'mfr';
  const local = engine !== 'paddleocr';
  const mfrStatus = engine === 'texteller' ? textellerStatus : mfr;
  const ready = engineIsActive(engine, settings, engineStatuses, mfr, textellerStatus);
  const checking =
    engineStatuses?.[engine].state === 'checking' ||
    (local &&
      (!mfrStatus ||
        ['downloading', 'validating', 'loading', 'clearing'].includes(mfrStatus.state)));
  const status = local
    ? ready
      ? t('Model ready')
      : !mfrStatus
        ? t('Checking model...')
        : mfrStatus.state === 'downloading'
          ? t('Downloading model...')
          : mfrStatus.state === 'validating'
            ? t('Verifying model...')
            : mfrStatus.state === 'clearing'
              ? t('Removing model...')
              : mfrStatus.state === 'loading' || checking
                ? t('Loading model...')
                : mfrStatus.state === 'error'
                  ? t('Model unavailable')
                  : t('Inactive')
    : ready
      ? t('Configured')
      : checking
        ? t('Testing connection...')
        : engineStatuses?.[engine].state === 'error'
          ? t('Connection unavailable')
          : t('Inactive');

  return (
    <footer className="flex items-center justify-between px-4 py-1 text-xs border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              ready ? 'bg-green-500' : checking ? 'bg-yellow-500' : 'bg-gray-400'
            }`}
          />
          {status}
        </span>
        <span>
          {local
            ? t(engine === 'mfr' ? 'Local MFR-1.5' : 'Local TexTeller')
            : t('Pipeline: {pipeline}', { pipeline })}
        </span>
      </div>

      <div>
        {isRecognizing && <span className="animate-pulse">{t('Recognizing...')}</span>}
        {error && <span className="text-red-500">{message(error)}</span>}
        {!isRecognizing && !error && (
          <span>
            {checking
              ? local
                ? t('Preparing model...')
                : t('Testing connection...')
              : ready
                ? t('Ready')
                : t('Setup needed')}
          </span>
        )}
      </div>
    </footer>
  );
}
