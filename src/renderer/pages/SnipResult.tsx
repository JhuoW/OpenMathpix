import React from 'react';
import { useAppStore } from '../store';
import Preview from '../components/Preview';

const tabs = [
  { key: 'latex' as const, label: 'LaTeX' },
  { key: 'markdown' as const, label: 'Markdown' },
  { key: 'text' as const, label: 'Text' },
  { key: 'image' as const, label: 'Image' },
];

export default function SnipResult() {
  const { activeTab, setActiveTab, ocrResult, isRecognizing, error, showToast } =
    useAppStore();

  const copyResult = async (format: 'latex' | 'markdown' | 'text') => {
    if (!ocrResult) return;
    const text =
      format === 'latex'
        ? ocrResult.latex
        : format === 'markdown'
          ? ocrResult.markdown
          : ocrResult.text;
    await navigator.clipboard.writeText(text);
    showToast('Copied!');
  };

  const retry = () => {
    const image = useAppStore.getState().currentImage;
    if (image) {
      useAppStore.getState().setError(null);
      useAppStore.getState().setIsRecognizing(true);
      window.api
        .recognize(image)
        .then((result) => {
          useAppStore.getState().setOcrResult(result);
        })
        .catch((err: any) => {
          useAppStore.getState().setError(err.message || 'Recognition failed');
        })
        .finally(() => {
          useAppStore.getState().setIsRecognizing(false);
        });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar + copy buttons */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                activeTab === key
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {ocrResult && activeTab !== 'image' && (
          <button
            onClick={() => copyResult(activeTab as 'latex' | 'markdown' | 'text')}
            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Copy
          </button>
        )}
      </div>

      {/* Loading spinner */}
      {isRecognizing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">Recognizing...</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isRecognizing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center px-8">
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={retry}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {!isRecognizing && !error && <Preview />}
    </div>
  );
}
