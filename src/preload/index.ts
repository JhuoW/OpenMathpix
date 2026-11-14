import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types';
import type {
  AppSettings,
  EngineStatuses,
  HistoryItem,
  HistoryUpdate,
  HotkeyStatus,
  LocalOCREngine,
  ModelTestResult,
  OCRResult,
  PopupAction,
  PopupContent,
  MfrStatus,
  ScreenCapture,
  SnipSelection,
  UpdateStatus,
} from '../shared/types';

const api = {
  // Snipping
  startSnip: (): Promise<void> => ipcRenderer.invoke(IPC.START_SNIP),
  getHotkeyStatus: (retry = false): Promise<HotkeyStatus> =>
    ipcRenderer.invoke(IPC.HOTKEY_STATUS, retry),
  /** While a new hotkey is recorded, pressing the current one must not start a snip. */
  suspendHotkey: (suspended: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.HOTKEY_SUSPEND, suspended),
  onSnipCaptured: (cb: (imageBase64: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: string) => cb(data);
    ipcRenderer.on(IPC.SNIP_CAPTURED, handler);
    return () => {
      ipcRenderer.removeListener(IPC.SNIP_CAPTURED, handler);
    };
  },
  onSnipError: (cb: (message: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, message: string) => cb(message);
    ipcRenderer.on(IPC.SNIP_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC.SNIP_ERROR, handler);
    };
  },
  onNavigate: (cb: (page: 'settings' | 'result' | 'history') => void) => {
    const handler = (_: Electron.IpcRendererEvent, page: 'settings' | 'result' | 'history') =>
      cb(page);
    ipcRenderer.on(IPC.NAVIGATE, handler);
    return () => {
      ipcRenderer.removeListener(IPC.NAVIGATE, handler);
    };
  },

  onPrepareQuit: (cb: () => Promise<boolean>) => {
    const handler = (_: Electron.IpcRendererEvent, requestId: string) => {
      void Promise.resolve()
        .then(cb)
        .then(
          (ok) => ipcRenderer.send(IPC.QUIT_READY, requestId, ok),
          () => ipcRenderer.send(IPC.QUIT_READY, requestId, false),
        );
    };
    ipcRenderer.on(IPC.PREPARE_QUIT, handler);
    return () => {
      ipcRenderer.removeListener(IPC.PREPARE_QUIT, handler);
    };
  },
  onPasteImage: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on(IPC.PASTE_IMAGE_REQUEST, handler);
    return () => {
      ipcRenderer.removeListener(IPC.PASTE_IMAGE_REQUEST, handler);
    };
  },

  // Overlay
  onOverlayScreenData: (cb: (screens: ScreenCapture[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ScreenCapture[]) => cb(data);
    ipcRenderer.on(IPC.OVERLAY_SCREEN_DATA, handler);
    return () => {
      ipcRenderer.removeListener(IPC.OVERLAY_SCREEN_DATA, handler);
    };
  },
  sendOverlaySelection: (region: SnipSelection) => ipcRenderer.send(IPC.OVERLAY_SELECTION, region),
  cancelOverlay: () => ipcRenderer.send(IPC.OVERLAY_CANCEL),
  sendOverlayReady: () => ipcRenderer.send(IPC.OVERLAY_READY),

  // OCR
  recognize: (imageBase64: string): Promise<OCRResult> =>
    ipcRenderer.invoke(IPC.RECOGNIZE, imageBase64),
  getMfrStatus: (): Promise<MfrStatus> => ipcRenderer.invoke(IPC.MFR_GET_STATUS),
  downloadMfrModel: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.MFR_DOWNLOAD),
  selectMfrModel: (): Promise<AppSettings | null> => ipcRenderer.invoke(IPC.MFR_SELECT),
  selectMfrDownloadDirectory: (): Promise<AppSettings | null> =>
    ipcRenderer.invoke(IPC.MFR_SELECT_DOWNLOAD_DIRECTORY),
  clearMfrModel: (): Promise<AppSettings | null> => ipcRenderer.invoke(IPC.MFR_CLEAR),
  openMfrModelPage: (): Promise<void> => ipcRenderer.invoke(IPC.MFR_OPEN_MODEL_PAGE),
  onMfrStatus: (cb: (status: MfrStatus) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: MfrStatus) => cb(status);
    ipcRenderer.on(IPC.MFR_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC.MFR_STATUS, handler);
  },

  testLocalModel: (engine: LocalOCREngine): Promise<ModelTestResult> =>
    ipcRenderer.invoke(IPC.MODEL_TEST, engine),
  openModelFolder: (engine: LocalOCREngine): Promise<void> =>
    ipcRenderer.invoke(IPC.MODEL_OPEN_FOLDER, engine),
  cancelModelDownload: (engine: LocalOCREngine): Promise<boolean> =>
    ipcRenderer.invoke(IPC.MODEL_CANCEL_DOWNLOAD, engine),
  copyFormulaImage: (latex: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FORMULA_COPY_IMAGE, latex),
  /** Resolves to the saved file, or null when the save dialog was cancelled. */
  saveFormulaImage: (latex: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.FORMULA_SAVE_IMAGE, latex),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_GET_STATUS),
  /** Downloads the update, or opens its release page where the app cannot install it. */
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  cancelUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_CANCEL),
  /** Hides an update notice until the next automatic check. */
  dismissUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_DISMISS),
  /** Quits and installs; in a development run only reports where the installer is. */
  installUpdate: (): Promise<{ started: boolean; file?: string }> =>
    ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: UpdateStatus) => cb(status);
    ipcRenderer.on(IPC.UPDATE_STATUS, handler);
    return () => {
      ipcRenderer.removeListener(IPC.UPDATE_STATUS, handler);
    };
  },
  onCopyResultRequest: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on(IPC.COPY_RESULT_REQUEST, handler);
    return () => {
      ipcRenderer.removeListener(IPC.COPY_RESULT_REQUEST, handler);
    };
  },
  getTextellerStatus: (): Promise<MfrStatus> => ipcRenderer.invoke(IPC.TEXTELLER_GET_STATUS),
  downloadTextellerModel: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.TEXTELLER_DOWNLOAD),
  selectTextellerModel: (): Promise<AppSettings | null> => ipcRenderer.invoke(IPC.TEXTELLER_SELECT),
  selectTextellerDownloadDirectory: (): Promise<AppSettings | null> =>
    ipcRenderer.invoke(IPC.TEXTELLER_SELECT_DOWNLOAD_DIRECTORY),
  clearTextellerModel: (): Promise<AppSettings | null> => ipcRenderer.invoke(IPC.TEXTELLER_CLEAR),
  openTextellerModelPage: (): Promise<void> => ipcRenderer.invoke(IPC.TEXTELLER_OPEN_MODEL_PAGE),
  onTextellerStatus: (cb: (status: MfrStatus) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: MfrStatus) => cb(status);
    ipcRenderer.on(IPC.TEXTELLER_STATUS, handler);
    return () => {
      ipcRenderer.removeListener(IPC.TEXTELLER_STATUS, handler);
    };
  },

  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (updates: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.SET_SETTINGS, updates),
  connectEngine: (updates: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.CONNECT_ENGINE, updates),
  getEngineStatuses: (): Promise<EngineStatuses> => ipcRenderer.invoke(IPC.GET_ENGINE_STATUSES),
  onEngineStatusesChanged: (cb: (statuses: EngineStatuses) => void) => {
    const handler = (_: Electron.IpcRendererEvent, statuses: EngineStatuses) => cb(statuses);
    ipcRenderer.on(IPC.ENGINE_STATUSES_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC.ENGINE_STATUSES_CHANGED, handler);
    };
  },
  onSettingsChanged: (cb: (settings: AppSettings) => void) => {
    const handler = (_: Electron.IpcRendererEvent, settings: AppSettings) => cb(settings);
    ipcRenderer.on(IPC.SETTINGS_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.SETTINGS_CHANGED, handler);
  },
  testConnection: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.TEST_CONNECTION),

  // History
  getHistory: (limit?: number, offset?: number): Promise<HistoryItem[]> =>
    ipcRenderer.invoke(IPC.GET_HISTORY, limit, offset),
  deleteHistoryItem: (id: number): Promise<void> => ipcRenderer.invoke(IPC.DELETE_HISTORY_ITEM, id),
  clearHistory: (): Promise<void> => ipcRenderer.invoke(IPC.CLEAR_HISTORY),
  searchHistory: (query: string): Promise<HistoryItem[]> =>
    ipcRenderer.invoke(IPC.SEARCH_HISTORY, query),
  updateHistoryItem: (id: number, updates: HistoryUpdate): Promise<boolean> =>
    ipcRenderer.invoke(IPC.UPDATE_HISTORY_ITEM, id, updates),

  // Clipboard
  pasteImage: (): Promise<string | null> => ipcRenderer.invoke(IPC.PASTE_IMAGE),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke(IPC.COPY_TEXT, text),

  // The copy popup appears only while the main window is hidden or unfocused.
  notify: (title: string, body: string, kind: 'success' | 'error' = 'success'): Promise<boolean> =>
    ipcRenderer.invoke(IPC.NOTIFY, title, body, kind),

  // Copy popup page
  onPopup: (cb: (content: PopupContent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, content: PopupContent) => cb(content);
    ipcRenderer.on(IPC.POPUP_SHOW, handler);
    return () => ipcRenderer.removeListener(IPC.POPUP_SHOW, handler);
  },
  popupAction: (action: PopupAction) => ipcRenderer.send(IPC.POPUP_ACTION, action),
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
