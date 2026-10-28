import React from 'react';
import { useAppStore } from '../store';

export default function StatusBar() {
  const { isRecognizing, settings, error, mfrStatus } = useAppStore();

  const pipeline = settings?.pipeline ?? '---';
  const local = settings?.ocrEngine === 'mfr';
  const ready = local ? mfrStatus?.state === 'ready' : !!settings?.apiUrl;
  const checking = local && (!mfrStatus || mfrStatus.state === 'downloading');
  const status = local
    ? !mfrStatus
      ? 'Checking model...'
      : mfrStatus.state === 'ready'
        ? 'Model ready'
        : mfrStatus.state === 'downloading'
          ? 'Downloading model...'
          : mfrStatus.state === 'error'
            ? 'Model unavailable'
            : 'Model download required'
    : ready
      ? 'Configured'
      : 'Not configured';

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
        <span>{local ? 'Local MFR-1.5' : `Pipeline: ${pipeline}`}</span>
      </div>

      <div>
        {isRecognizing && <span className="animate-pulse">Recognizing...</span>}
        {error && <span className="text-red-500">{error}</span>}
        {!isRecognizing && !error && <span>Ready</span>}
      </div>
    </footer>
  );
}
