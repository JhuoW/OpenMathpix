import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useAppStore } from './store';
import { useOCR } from './hooks/useOCR';
import { useMfrStatus } from './hooks/useMfrStatus';
import { useI18n } from './hooks/useI18n';
import './settings-session';
import SnipResult from './pages/SnipResult';
import Settings from './pages/Settings';
import History from './pages/History';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';
import { DropIcon } from './components/Icons';
import { historySaver } from './store';

export default function App() {
  const { language, message, t } = useI18n();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const { currentPage, setCurrentPage, setSettings, toast, showToast } = useAppStore();
  const { recognizeImage } = useOCR();
  useMfrStatus();

  // Subscribe before reading so a delayed initial response cannot overwrite a committed edit.
  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    const unsubscribe = window.api.onSettingsChanged((fresh) => {
      if (!active) return;
      receivedUpdate = true;
      setSettings(fresh);
    });
    window.api
      .getSettings()
      .then((fresh) => {
        if (active && !receivedUpdate) setSettings(fresh);
      })
      .catch(() => {
        if (active && !receivedUpdate) showToast('Could not load settings. Please reopen the app.');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [setSettings, showToast]);

  // Apply dark mode
  const settings = useAppStore((s) => s.settings);
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else if (settings.theme === 'light') {
      root.classList.remove('dark');
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => (mq.matches ? root.classList.add('dark') : root.classList.remove('dark'));
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [settings?.theme]);

  // Listen for tray navigation
  useEffect(() => window.api.onNavigate(setCurrentPage), [setCurrentPage]);

  // Corrections are saved when typing pauses; leaving the result page saves them at once.
  useEffect(() => {
    if (currentPage !== 'result') historySaver.flushAll();
  }, [currentPage]);

  // Drag & drop. Child elements fire enter/leave pairs, so count nesting depth.
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current++;
    setDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (useAppStore.getState().isRecognizing) {
        showToast('Recognition in progress. Please wait.');
        return;
      }
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const validTypes = ['image/png', 'image/jpeg', 'image/bmp', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        showToast('Unsupported file type');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        recognizeImage(base64);
      };
      reader.onerror = () => showToast('Could not read the image file.');
      reader.readAsDataURL(file);
    },
    [recognizeImage, showToast],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div
      className="relative flex flex-col h-screen"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <Toolbar />

      <main className="flex-1 overflow-auto">
        {currentPage === 'result' && <SnipResult />}
        {currentPage === 'settings' && <Settings />}
        {currentPage === 'history' && <History />}
      </main>

      <StatusBar />

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-500 bg-blue-50/90 dark:bg-gray-900/90">
          <div className="flex flex-col items-center gap-2 text-blue-700 dark:text-blue-300">
            <DropIcon className="w-8 h-8" />
            <span className="text-sm font-medium">{t('Drop the image to recognize it')}</span>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-12 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 bg-gray-900/95 dark:bg-gray-700/95 dark:ring-1 dark:ring-gray-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm toast-visible"
        >
          {message(toast)}
        </div>
      )}
    </div>
  );
}
