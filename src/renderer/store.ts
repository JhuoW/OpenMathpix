import { create } from 'zustand';
import type { AppSettings, OCRResult } from '../shared/types';

type Page = 'result' | 'settings' | 'history';
type Tab = 'latex' | 'markdown' | 'text' | 'image';

interface AppState {
  // Current recognition
  currentImage: string | null;
  ocrResult: OCRResult | null;
  isRecognizing: boolean;
  error: string | null;

  // UI
  activeTab: Tab;
  currentPage: Page;
  toast: string | null;

  // Settings (cached)
  settings: AppSettings | null;

  // Actions
  setCurrentImage: (img: string | null) => void;
  setOcrResult: (result: OCRResult | null) => void;
  setIsRecognizing: (v: boolean) => void;
  setError: (err: string | null) => void;
  setActiveTab: (tab: Tab) => void;
  setCurrentPage: (page: Page) => void;
  setSettings: (s: AppSettings) => void;
  showToast: (msg: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentImage: null,
  ocrResult: null,
  isRecognizing: false,
  error: null,
  activeTab: 'latex',
  currentPage: 'result',
  toast: null,
  settings: null,

  setCurrentImage: (currentImage) => set({ currentImage }),
  setOcrResult: (ocrResult) => set({ ocrResult }),
  setIsRecognizing: (isRecognizing) => set({ isRecognizing }),
  setError: (error) => set({ error }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setSettings: (settings) => set({ settings }),
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => set({ toast: null }), 1500);
  },
}));
