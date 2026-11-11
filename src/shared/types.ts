// IPC channel names
export const IPC = {
  START_SNIP: 'snip:start',
  SNIP_CAPTURED: 'snip:captured',
  SNIP_ERROR: 'snip:error',
  NAVIGATE: 'app:navigate',
  PREPARE_QUIT: 'app:prepare-quit',
  QUIT_READY: 'app:quit-ready',
  PASTE_IMAGE_REQUEST: 'app:paste-image-request',
  OVERLAY_SCREEN_DATA: 'overlay:screen-data',
  OVERLAY_SELECTION: 'overlay:selection',
  OVERLAY_CANCEL: 'overlay:cancel',
  OVERLAY_READY: 'overlay:ready',

  RECOGNIZE: 'ocr:recognize',
  MFR_GET_STATUS: 'mfr:status:get',
  MFR_DOWNLOAD: 'mfr:download',
  MFR_SELECT: 'mfr:select',
  MFR_SELECT_DOWNLOAD_DIRECTORY: 'mfr:select-download-directory',
  MFR_CLEAR: 'mfr:clear',
  MFR_OPEN_MODEL_PAGE: 'mfr:open-model-page',
  MFR_STATUS: 'mfr:status',
  TEXTELLER_GET_STATUS: 'texteller:status:get',
  TEXTELLER_DOWNLOAD: 'texteller:download',
  TEXTELLER_SELECT: 'texteller:select',
  TEXTELLER_SELECT_DOWNLOAD_DIRECTORY: 'texteller:select-download-directory',
  TEXTELLER_CLEAR: 'texteller:clear',
  TEXTELLER_OPEN_MODEL_PAGE: 'texteller:open-model-page',
  TEXTELLER_STATUS: 'texteller:status',
  MODEL_TEST: 'model:test',
  MODEL_OPEN_FOLDER: 'model:open-folder',
  MODEL_CANCEL_DOWNLOAD: 'model:cancel-download',
  FORMULA_COPY_IMAGE: 'formula:copy-image',
  FORMULA_SAVE_IMAGE: 'formula:save-image',
  COPY_RESULT_REQUEST: 'app:copy-result-request',
  UPDATE_STATUS: 'update:status',
  UPDATE_GET_STATUS: 'update:status:get',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_CANCEL: 'update:cancel',
  UPDATE_INSTALL: 'update:install',

  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed',
  TEST_CONNECTION: 'settings:test-connection',
  CONNECT_ENGINE: 'settings:connect-engine',
  GET_ENGINE_STATUSES: 'engines:status:get',
  ENGINE_STATUSES_CHANGED: 'engines:status:changed',

  GET_HISTORY: 'history:get',
  DELETE_HISTORY_ITEM: 'history:delete',
  CLEAR_HISTORY: 'history:clear',
  SEARCH_HISTORY: 'history:search',
  UPDATE_HISTORY_ITEM: 'history:update',

  PASTE_IMAGE: 'clipboard:paste-image',
  COPY_TEXT: 'clipboard:write-text',
  NOTIFY: 'app:notify',
  HOTKEY_STATUS: 'shortcut:status',
  HOTKEY_SUSPEND: 'shortcut:suspend',
  POPUP_SHOW: 'popup:show',
  POPUP_ACTION: 'popup:action',
} as const;

/** The small popup that reports a background copy instead of a system notification. */
export interface PopupContent {
  title: string;
  body: string;
  hint: string;
  closeLabel: string;
  /** A copied result, a failure, or a short explanation (e.g. the first close to the tray). */
  kind: 'success' | 'error' | 'info';
  durationMs: number;
  language: Language;
}

export type PopupAction = 'open' | 'close';

/** Whether the saved snip hotkey is actually registered; another app may own it. */
export interface HotkeyStatus {
  accelerator: string;
  registered: boolean;
}

export type Pipeline = 'PP-OCRv5' | 'PP-StructureV3' | 'PaddleOCR-VL' | 'PaddleOCR-VL-1.5';
export type OutputFormat = 'latex' | 'markdown' | 'text';
export type Theme = 'light' | 'dark' | 'system';
export type LocalOCREngine = 'mfr' | 'texteller';
export type OCREngine = 'paddleocr' | LocalOCREngine;
export interface EngineStatus {
  state: 'inactive' | 'checking' | 'ready' | 'error';
  error?: string;
}
export type EngineStatuses = Record<OCREngine, EngineStatus>;
/** An in-app update: downloaded, verified, then installed when the user restarts. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'downloading'; version: string; received: number; total: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; version?: string; message: string };

/** A local model's answer for the bundled sample formula; nothing is added to history. */
export interface ModelTestResult {
  latex: string;
  /** Recognition time, excluding a first-time model load. */
  elapsedMs: number;
  /** Time spent loading the model for this request (about zero once it is loaded). */
  loadMs?: number;
}
export type Language = 'en' | 'zh-CN';
/** What happens after a snip: bring the window forward, or copy and notify in the background. */
export type AfterSnipAction = 'window' | 'notify';
/** How LaTeX is wrapped when copied. */
export type LatexCopyStyle = 'plain' | 'inline' | 'display' | 'bracket' | 'equation' | 'mathml';
export type ModelSource = 'huggingface' | 'hf-mirror';

export interface MfrStatus {
  state:
    | 'not-downloaded'
    | 'downloading'
    | 'validating'
    | 'loading'
    | 'clearing'
    | 'ready'
    | 'error';
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  modelPath?: string;
  /** Actual managed model directory within the user's selected storage location. */
  downloadDirectory?: string;
  /** The selected files have completed a real inference check. */
  operational?: boolean;
  /** Owned by this app; imported folders are only disconnected. */
  managed?: boolean;
}

export interface AppSettings {
  ocrEngine: OCREngine;
  /** Empty uses the managed download directory; otherwise a verified local directory. */
  mfrModelPath: string;
  /** False after explicit uninstall/disconnect; only setup enables it again. */
  mfrModelEnabled: boolean;
  /** Root for future managed downloads; empty uses the application data directory. */
  mfrDownloadDirectory: string;
  apiUrl: string;
  accessToken: string;
  textellerModelPath: string;
  textellerModelEnabled: boolean;
  textellerDownloadDirectory: string;
  pipeline: Pipeline;
  snipHotkey: string;
  defaultOutputFormat: OutputFormat;
  historyLimit: number;
  theme: Theme;
  language: Language;
  afterSnip: AfterSnipAction;
  latexCopyStyle: LatexCopyStyle;
  /** Tidy tokenized MFR output (spacing, redundant braces) without changing the formula. */
  cleanLatex: boolean;
  modelSource: ModelSource;
  /** Start in the notification area when the user signs in to Windows. */
  launchAtLogin: boolean;
}

export interface OCRResult {
  latex: string;
  markdown: string;
  text: string;
  rawResponse: unknown;
  warning?: string;
  /** A single formula (Markdown and text derive from LaTeX) or a parsed document. */
  kind?: 'formula' | 'document';
  /** Local model token probabilities; absent for cloud results. */
  confidence?: { average: number; lowest: number };
  /** The history entry that stores this result, when saving succeeded. */
  historyId?: number;
}

export type HistoryUpdate = Partial<
  Pick<HistoryItem, 'resultLatex' | 'resultMarkdown' | 'resultText'>
>;

export interface HistoryItem {
  id: number;
  timestamp: string;
  pipeline: Pipeline | 'MFR-1.5' | 'TexTeller';
  imageThumbnail: string;
  resultLatex: string;
  resultMarkdown: string;
  resultText: string;
}

export interface ScreenCapture {
  dataUrl: string;
  bounds: { x: number; y: number; width: number; height: number };
  displayId: string;
}

export interface SnipSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}
