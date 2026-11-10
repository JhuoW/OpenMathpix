import React from 'react';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';
import Preview, { imageSource } from '../components/Preview';
import { recognizeImage } from '../hooks/useOCR';
import { copyResult } from '../copy';
import { CopyIcon, WarningIcon } from '../components/Icons';
import { LATEX_COPY_LABELS } from '../../shared/latex-copy';
import type { TranslationKey } from '../../shared/i18n';

const tabs: { key: 'latex' | 'markdown' | 'text' | 'image'; label: TranslationKey }[] = [
  { key: 'latex', label: 'LaTeX' },
  { key: 'markdown', label: 'Markdown' },
  { key: 'text', label: 'Text' },
  { key: 'image', label: 'Image' },
];

export default function SnipResult() {
  const { t, message } = useI18n();
  const {
    activeTab,
    setActiveTab,
    ocrResult,
    isRecognizing,
    error,
    currentImage,
    settings,
    mfrStatus,
    setCurrentPage,
  } = useAppStore();
  const copyStyle = settings?.latexCopyStyle ?? 'plain';

  const retry = () => {
    if (currentImage) void recognizeImage(currentImage);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div role="tablist" className="flex gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === key
                  ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        {ocrResult && !isRecognizing && activeTab !== 'image' && (
          <button
            onClick={() => void copyResult(ocrResult, activeTab)}
            title={activeTab === 'latex' ? t('Change the copy style in Settings.') : undefined}
            className="btn-secondary"
          >
            <CopyIcon className="w-3.5 h-3.5" />
            {t('Copy')}
            {activeTab === 'latex' && copyStyle !== 'plain' && (
              <span className="text-xs text-gray-500 font-mono">
                {LATEX_COPY_LABELS[copyStyle]}
              </span>
            )}
          </button>
        )}
      </div>

      {isRecognizing && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            {currentImage && (
              <img
                src={imageSource(currentImage)}
                alt={t('Captured')}
                className="max-h-24 max-w-full rounded border border-gray-200 dark:border-gray-700 bg-white p-1 opacity-80"
              />
            )}
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">
              {settings?.ocrEngine === 'mfr'
                ? t('Recognizing with MFR-1.5...')
                : t('Recognizing...')}
            </span>
            {settings?.ocrEngine === 'mfr' && (
              <span className="text-xs text-gray-400">
                {t('Processing the formula on this device.')}
              </span>
            )}
          </div>
        </div>
      )}

      {error && !isRecognizing && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-900/30">
              <WarningIcon className="w-5 h-5" />
            </div>
            <p className="text-sm text-red-600 dark:text-red-400 break-words">{message(error)}</p>
            {currentImage && (
              <img
                src={imageSource(currentImage)}
                alt={t('Captured')}
                className="max-h-20 max-w-full rounded border border-gray-200 dark:border-gray-700 bg-white p-1"
              />
            )}
            {settings?.ocrEngine === 'mfr' && mfrStatus?.state !== 'ready' ? (
              <button onClick={() => setCurrentPage('settings')} className="btn-primary">
                {t('Open Model Settings')}
              </button>
            ) : currentImage ? (
              <button onClick={retry} className="btn-primary">
                {t('Retry')}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {!isRecognizing && !error && <Preview />}
    </div>
  );
}
