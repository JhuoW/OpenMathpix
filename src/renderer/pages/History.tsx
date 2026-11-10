import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, historySaver } from '../store';
import { useI18n } from '../hooks/useI18n';
import type { HistoryItem, OCRResult } from '../../shared/types';
import { copyResult } from '../copy';
import { InlineFormula } from '../components/FormulaPreview';
import { CopyIcon, TrashIcon } from '../components/Icons';

function toResult(item: HistoryItem): OCRResult {
  return {
    latex: item.resultLatex,
    markdown: item.resultMarkdown,
    text: item.resultText,
    rawResponse: null,
    kind: item.pipeline === 'MFR-1.5' ? 'formula' : 'document',
    historyId: item.id,
  };
}

export default function History() {
  const { language, t } = useI18n();
  const { showToast, openResult, settings } = useAppStore();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const requestVersion = useRef(0);

  const loadHistory = useCallback(async () => {
    const version = ++requestVersion.current;
    // Show corrections saved moments ago on the result page.
    historySaver.flushAll();
    try {
      const query = search.trim();
      const data = query
        ? await window.api.searchHistory(query)
        : await window.api.getHistory(settings?.historyLimit ?? 100);
      if (version === requestVersion.current) {
        setItems(data);
        setLoaded(true);
      }
    } catch {
      if (version === requestVersion.current) showToast('Could not load history.');
    }
  }, [search, settings?.historyLimit, showToast]);

  useEffect(() => {
    // Searching on every key press is cheap, but let typing settle first.
    const timer = setTimeout(() => void loadHistory(), search ? 150 : 0);
    return () => {
      clearTimeout(timer);
      requestVersion.current++;
    };
  }, [loadHistory, search]);

  const openItem = (item: HistoryItem) => {
    if (useAppStore.getState().isRecognizing) {
      showToast('Recognition in progress. Please wait.');
      return;
    }
    openResult(toResult(item), item.imageThumbnail, settings?.defaultOutputFormat ?? 'latex');
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
    if (!confirm(t('Clear all history?'))) return;
    try {
      await window.api.clearHistory();
      await loadHistory();
    } catch {
      showToast('Could not clear history.');
    }
  };

  const format = settings?.defaultOutputFormat ?? 'latex';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search history...')}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={clearAll}
          disabled={!items.length && !search}
          className="px-3 py-1.5 text-sm text-red-600 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 transition-colors"
        >
          {t('Clear All')}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loaded && items.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {search.trim() ? t('No matching history.') : t('No history yet.')}
          </div>
        )}
        <ul>
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <button
                type="button"
                onClick={() => openItem(item)}
                title={t('Open')}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 dark:border-gray-700 bg-white">
                  <img
                    src={`data:image/jpeg;base64,${item.imageThumbnail}`}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-1 flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {new Date(item.timestamp).toLocaleString(
                        language === 'zh-CN' ? 'zh-CN' : 'en-US',
                      )}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                      {item.pipeline}
                    </span>
                  </span>
                  <span className="block truncate text-sm text-gray-700 dark:text-gray-200">
                    {item.pipeline === 'MFR-1.5' && item.resultLatex ? (
                      <InlineFormula latex={item.resultLatex} />
                    ) : (
                      (item.resultText || item.resultMarkdown || item.resultLatex).slice(0, 120)
                    )}
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => void copyResult(toResult(item), format)}
                  title={t('Copy')}
                  aria-label={t('Copy')}
                  className="icon-button"
                >
                  <CopyIcon />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteItem(item.id)}
                  title={t('Delete')}
                  aria-label={t('Delete')}
                  className="icon-button hover:!text-red-600"
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
