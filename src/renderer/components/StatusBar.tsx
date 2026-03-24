import React from 'react';
import { useAppStore } from '../store';

export default function StatusBar() {
  const { isRecognizing, settings, error } = useAppStore();

  const pipeline = settings?.pipeline ?? '---';
  const connected = !!settings?.apiUrl;

  return (
    <footer className="flex items-center justify-between px-4 py-1 text-xs border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          {connected ? 'Connected' : 'Not configured'}
        </span>
        <span>Pipeline: {pipeline}</span>
      </div>

      <div>
        {isRecognizing && <span className="animate-pulse">Recognizing...</span>}
        {error && <span className="text-red-500">{error}</span>}
        {!isRecognizing && !error && <span>Ready</span>}
      </div>
    </footer>
  );
}
