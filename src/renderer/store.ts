import { create } from 'zustand';
import type {
  AppSettings,
  EngineStatuses,
  HotkeyStatus,
  MfrStatus,
  OCRResult,
  OutputFormat,
} from '../shared/types';
import { applyEdit, createHistorySaver, historyChanges } from './result-edit';

type Page = 'result' | 'settings' | 'history';
export type SettingsTab = 'recognition' | 'snipping' | 'output' | 'general';
type Tab = OutputFormat | 'image';

interface AppState {
  // Current recognition
  currentImage: string | null;
  ocrResult: OCRResult | null;
  /** The result as recognized or opened, before the user's corrections. */
  baseline: OCRResult | null;
  isRecognizing: boolean;
  error: string | null;

  // UI
  activeTab: Tab;
  currentPage: Page;
  toast: string | null;
  /** Remembered while the app runs, so returning to Settings shows the same section. */
  settingsTab: SettingsTab;
  /** The first-run guide stays on screen until the user finishes its last step. */
  guideActive: boolean;

  // Settings (cached)
  settings: AppSettings | null;
  mfrStatus: MfrStatus | null;
  textellerStatus: MfrStatus | null;
  engineStatuses: EngineStatuses | null;
  hotkeyStatus: HotkeyStatus | null;

  // Actions
  setCurrentImage: (img: string | null) => void;
  setOcrResult: (result: OCRResult | null) => void;
  /** Show a result, e.g. from history, as the new unedited baseline. */
  openResult: (result: OCRResult, image: string | null, tab: Tab) => void;
  editResult: (format: OutputFormat, value: string) => void;
  resetEdits: () => void;
  /** Called only after the history deletion succeeded on disk. */
  forgetHistory: (id?: number) => void;
  setIsRecognizing: (v: boolean) => void;
  setError: (err: string | null) => void;
  setActiveTab: (tab: Tab) => void;
  setCurrentPage: (page: Page) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setGuideActive: (active: boolean) => void;
  setSettings: (s: AppSettings) => void;
  setMfrStatus: (status: MfrStatus) => void;
  setTextellerStatus: (status: MfrStatus) => void;
  setEngineStatuses: (statuses: EngineStatuses) => void;
  setHotkeyStatus: (status: HotkeyStatus) => void;
  showToast: (msg: string, durationMs?: number) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const historySaver = createHistorySaver(
  (id, updates) => window.api.updateHistoryItem(id, updates),
  () => useAppStore.getState().showToast('Could not save your changes to history.'),
);

function persistChange(before: OCRResult, after: OCRResult): void {
  if (after.historyId === undefined) return;
  const changes = historyChanges(before, after);
  if (Object.keys(changes).length) historySaver.schedule(after.historyId, changes);
}

export const useAppStore = create<AppState>((set, get) => ({
  currentImage: null,
  ocrResult: null,
  baseline: null,
  isRecognizing: false,
  error: null,
  activeTab: 'latex',
  currentPage: 'result',
  toast: null,
  settingsTab: 'recognition',
  guideActive: false,
  settings: null,
  mfrStatus: null,
  textellerStatus: null,
  engineStatuses: null,
  hotkeyStatus: null,

  setCurrentImage: (currentImage) => set({ currentImage }),
  setOcrResult: (ocrResult) => set({ ocrResult, baseline: ocrResult }),
  openResult: (result, image, tab) => {
    historySaver.flushAll();
    set({
      ocrResult: result,
      baseline: result,
      currentImage: image,
      error: null,
      activeTab: tab,
      currentPage: 'result',
    });
  },
  editResult: (format, value) => {
    const current = get().ocrResult;
    if (!current) return;
    const next = applyEdit(current, format, value);
    set({ ocrResult: next });
    persistChange(current, next);
  },
  resetEdits: () => {
    const { ocrResult, baseline } = get();
    if (!ocrResult || !baseline) return;
    set({ ocrResult: baseline });
    persistChange(ocrResult, baseline);
  },
  forgetHistory: (id) => {
    historySaver.forget(id);
    const currentId = get().ocrResult?.historyId;
    if (currentId !== undefined && (id === undefined || currentId === id)) {
      historySaver.forget(currentId);
      set({ ocrResult: null, baseline: null, currentImage: null, error: null });
    }
  },
  setIsRecognizing: (isRecognizing) => set({ isRecognizing }),
  setError: (error) => set({ error }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setGuideActive: (guideActive) => set({ guideActive }),
  setSettings: (settings) => set({ settings }),
  setMfrStatus: (mfrStatus) => set({ mfrStatus }),
  setTextellerStatus: (textellerStatus) => set({ textellerStatus }),
  setEngineStatuses: (engineStatuses) => set({ engineStatuses }),
  setHotkeyStatus: (hotkeyStatus) => set({ hotkeyStatus }),
  showToast: (msg, durationMs = 2500) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), durationMs);
  },
}));

// Pending corrections must reach history even if the window is closed while typing.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => historySaver.flushAll());
}
