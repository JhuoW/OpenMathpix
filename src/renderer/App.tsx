import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useAppStore } from './store';
import { useOCR } from './hooks/useOCR';
import { useMfrStatus } from './hooks/useMfrStatus';
import { useEngineStatuses } from './hooks/useEngineStatuses';
import { useI18n } from './hooks/useI18n';
import { settingsSession } from './settings-session';
import SnipResult from './pages/SnipResult';
import Settings from './pages/Settings';
import History from './pages/History';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';
import UpdateBanner from './components/UpdateBanner';
import { DropIcon } from './components/Icons';
import { historySaver } from './store';
import { copyResult } from './copy';
import { acceleratorKeys, isMacPlatform } from './hotkey';

export default function App() {
  const { language, message, t } = useI18n();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const { currentPage, setCurrentPage, setSettings, toast, showToast } = useAppStore();
  const { recognizeImage } = useOCR();
  useMfrStatus();
  useEngineStatuses();
  const [preparingQuit, setPreparingQuit] = useState(false);

  useEffect(
    () =>
      window.api.onPrepareQuit(async () => {
        setPreparingQuit(true);
        let timer: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe: (() => void) | undefined;
        try {
          const saved = (async () => {
            if (useAppStore.getState().isRecognizing) {
              await new Promise<void>((resolve) => {
                unsubscribe = useAppStore.subscribe((state) => {
                  if (!state.isRecognizing) resolve();
                });
              });
            }
            const [settingsSaved, historySaved] = await Promise.all([
              settingsSession.flushAndWait(),
              historySaver.flushAndWait(),
            ]);
            const result = useAppStore.getState().ocrResult;
            // A recognition history write failure leaves the only copy in this window.
            return settingsSaved && historySaved && (!result || result.historyId !== undefined);
          })();
          return await Promise.race([
            saved,
            new Promise<false>((resolve) => {
              timer = setTimeout(() => resolve(false), 12_000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
          unsubscribe?.();
          setPreparingQuit(false);
        }
      }),
    [],
  );

  // Edit > Copy Result (Ctrl+Shift+C): the current result as the Copy button would copy it.
  useEffect(
    () =>
      window.api.onCopyResultRequest(() => {
        const { ocrResult, activeTab, settings: current } = useAppStore.getState();
        if (!ocrResult) {
          showToast('There is no result to copy yet.');
          return;
        }
        const format =
          activeTab === 'image' ? (current?.defaultOutputFormat ?? 'latex') : activeTab;
        void copyResult(ocrResult, format);
      }),
    [showToast],
  );

  useEffect(
    () =>
      window.api.onPasteImage(() => {
        void window.api
          .pasteImage()
          .then((image) => {
            if (image) return recognizeImage(image);
            showToast('No image found in the clipboard.');
          })
          .catch(() => showToast('Could not read the clipboard image.'));
      }),
    [recognizeImage, showToast],
  );

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

  // A hotkey owned by another application fails silently there; report it once at startup.
  // Settings keeps showing the problem until it is resolved.
  const snipHotkey = settings?.snipHotkey;
  const hotkeyChecked = useRef(false);
  useEffect(() => {
    if (!snipHotkey) return;
    let active = true;
    window.api
      .getHotkeyStatus()
      .then((status) => {
        if (!active) return;
        useAppStore.getState().setHotkeyStatus(status);
        if (hotkeyChecked.current) return;
        hotkeyChecked.current = true;
        if (!status.registered) {
          const hotkey = acceleratorKeys(status.accelerator, isMacPlatform()).join('+');
          showToast(
            t(
              'The snip hotkey {hotkey} is used by another application. Choose a different shortcut in Settings.',
              { hotkey },
            ),
            8000,
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [snipHotkey, showToast, t]);
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
      {...(preparingQuit ? { inert: '' } : {})}
      className="relative flex flex-col h-screen"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <Toolbar />
      <UpdateBanner />

      <main className="flex-1 overflow-auto">
        {currentPage === 'result' && <SnipResult />}
        {currentPage === 'settings' && <Settings />}
        {currentPage === 'history' && <History />}
      </main>

      <StatusBar />

      {preparingQuit && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
          <p
            role="status"
            className="rounded-lg bg-white dark:bg-gray-800 px-5 py-4 shadow-lg text-sm"
          >
            {language === 'zh-CN'
              ? '正在保存并完成操作…'
              : 'Saving changes and finishing operations…'}
          </p>
        </div>
      )}

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
          className="fixed bottom-12 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 bg-gray-900/95 dark:bg-gray-700/95 dark:ring-1 dark:ring-gray-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm toast-visible"
        >
          {message(toast)}
        </div>
      )}
    </div>
  );
}
