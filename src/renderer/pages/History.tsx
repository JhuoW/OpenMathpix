import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store';
import type { HistoryItem } from '../../shared/types';

export default function History() {
  const { showToast, setCurrentImage, setOcrResult, setActiveTab, setCurrentPage, settings } =
    useAppStore();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const requestVersion = useRef(0);

  const loadHistory = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const data = search
        ? await window.api.searchHistory(search)
        : await window.api.getHistory(settings?.historyLimit ?? 100);
      if (version === requestVersion.current) setItems(data);
    } catch {
      if (version === requestVersion.current) showToast('Could not load history.');
    }
  }, [search, settings?.historyLimit, showToast]);

  useEffect(() => {
    void loadHistory();
    return () => {
      requestVersion.current++;
    };
  }, [loadHistory]);

  const openItem = (item: HistoryItem) => {
    if (useAppStore.getState().isRecognizing) {
      showToast('Recognition in progress. Please wait.');
      return;
    }
    useAppStore.getState().setError(null);
    setCurrentImage(item.imageThumbnail);
    setOcrResult({
      latex: item.resultLatex,
      markdown: item.resultMarkdown,
      text: item.resultText,
      rawResponse: null,
    });
    setActiveTab(settings?.defaultOutputFormat ?? 'latex');
    setCurrentPage('result');
  };

  const copyItem = async (item: HistoryItem, format: 'latex' | 'markdown' | 'text') => {
    const text =
      format === 'latex'
        ? item.resultLatex
        : format === 'markdown'
          ? item.resultMarkdown
          : item.resultText;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied!');
    } catch {
      showToast('Could not copy. Please try again.');
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await window.api.deleteHistoryItem(id);
      await loadHistory();
    } catch {
      showToast('Could not delete the history item.');
    }
  };

  const clearAll = async () => {
    if (!confirm('Clear all history?')) return;
    try {
      await window.api.clearHistory();
      await loadHistory();
    } catch {
      showToast('Could not clear history.');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar + clear */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search history..."
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={clearAll}
          className="px-3 py-1.5 text-sm text-red-600 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No history yet.
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
            onClick={() => openItem(item)}
          >
            {/* Thumbnail */}
            <img
              src={`data:image/jpeg;base64,${item.imageThumbnail}`}
              alt=""
              className="w-16 h-12 object-cover rounded border border-gray-200 dark:border-gray-700 flex-shrink-0"
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-gray-400">
                  {new Date(item.timestamp).toLocaleString()}
                </span>
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                  {item.pipeline}
                </span>
              </div>
              <p className="text-sm truncate text-gray-600 dark:text-gray-300">
                {(item.resultText || item.resultMarkdown || item.resultLatex).slice(0, 80)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => copyItem(item, settings?.defaultOutputFormat ?? 'latex')}
                className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Copy
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="px-2 py-0.5 text-xs text-red-500 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
