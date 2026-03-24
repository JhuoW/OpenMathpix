import React, { useEffect, useCallback } from 'react';
import { useAppStore } from './store';
import { useOCR } from './hooks/useOCR';
import SnipResult from './pages/SnipResult';
import Settings from './pages/Settings';
import History from './pages/History';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';

export default function App() {
  const { currentPage, setCurrentPage, setSettings, toast, showToast } = useAppStore();
  const { recognizeImage } = useOCR();

  // Load settings on mount
  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, [setSettings]);

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
      const apply = () => mq.matches ? root.classList.add('dark') : root.classList.remove('dark');
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [settings?.theme]);

  // Listen for tray navigation
  useEffect(() => {
    const { ipcRenderer } = window as any;
    // The main process sends 'navigate' events from tray menu
    // We handle this through a simple message listener on the window
  }, []);

  // Drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
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
        showToast('Image loaded - recognizing...');
        recognizeImage(base64);
      };
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
      className="flex flex-col h-screen"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <Toolbar />

      <main className="flex-1 overflow-auto">
        {currentPage === 'result' && <SnipResult />}
        {currentPage === 'settings' && <Settings />}
        {currentPage === 'history' && <History />}
      </main>

      <StatusBar />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm toast-visible">
          {toast}
        </div>
      )}
    </div>
  );
}
