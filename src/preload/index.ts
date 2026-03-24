import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type { AppSettings, HistoryItem, OCRResult, ScreenCapture, SnipSelection } from '../shared/types';

const api = {
  // Snipping
  startSnip: (): Promise<void> => ipcRenderer.invoke(IPC.START_SNIP),
  onSnipCaptured: (cb: (imageBase64: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: string) => cb(data);
    ipcRenderer.on(IPC.SNIP_CAPTURED, handler);
    return () => { ipcRenderer.removeListener(IPC.SNIP_CAPTURED, handler); };
  },

  // Overlay
  onOverlayScreenData: (cb: (screens: ScreenCapture[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ScreenCapture[]) => cb(data);
    ipcRenderer.on(IPC.OVERLAY_SCREEN_DATA, handler);
    return () => { ipcRenderer.removeListener(IPC.OVERLAY_SCREEN_DATA, handler); };
  },
  sendOverlaySelection: (region: SnipSelection) => ipcRenderer.send(IPC.OVERLAY_SELECTION, region),
  cancelOverlay: () => ipcRenderer.send(IPC.OVERLAY_CANCEL),
  sendOverlayReady: () => ipcRenderer.send(IPC.OVERLAY_READY),

  // OCR
  recognize: (imageBase64: string): Promise<OCRResult> =>
    ipcRenderer.invoke(IPC.RECOGNIZE, imageBase64),

  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (updates: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC.SET_SETTINGS, updates),
  testConnection: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.TEST_CONNECTION),

  // History
  getHistory: (limit?: number, offset?: number): Promise<HistoryItem[]> =>
    ipcRenderer.invoke(IPC.GET_HISTORY, limit, offset),
  deleteHistoryItem: (id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.DELETE_HISTORY_ITEM, id),
  clearHistory: (): Promise<void> => ipcRenderer.invoke(IPC.CLEAR_HISTORY),
  searchHistory: (query: string): Promise<HistoryItem[]> =>
    ipcRenderer.invoke(IPC.SEARCH_HISTORY, query),

  // Clipboard paste
  pasteImage: (): Promise<string | null> => ipcRenderer.invoke(IPC.PASTE_IMAGE),
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
