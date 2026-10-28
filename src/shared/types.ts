// IPC channel names
export const IPC = {
  START_SNIP: 'snip:start',
  SNIP_CAPTURED: 'snip:captured',
  SNIP_ERROR: 'snip:error',
  NAVIGATE: 'app:navigate',
  OVERLAY_SCREEN_DATA: 'overlay:screen-data',
  OVERLAY_SELECTION: 'overlay:selection',
  OVERLAY_CANCEL: 'overlay:cancel',
  OVERLAY_READY: 'overlay:ready',

  RECOGNIZE: 'ocr:recognize',
  MFR_GET_STATUS: 'mfr:status:get',
  MFR_DOWNLOAD: 'mfr:download',
  MFR_STATUS: 'mfr:status',

  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',
  TEST_CONNECTION: 'settings:test-connection',

  GET_HISTORY: 'history:get',
  DELETE_HISTORY_ITEM: 'history:delete',
  CLEAR_HISTORY: 'history:clear',
  SEARCH_HISTORY: 'history:search',

  PASTE_IMAGE: 'clipboard:paste-image',
} as const;

export type Pipeline = 'PP-OCRv5' | 'PP-StructureV3' | 'PaddleOCR-VL' | 'PaddleOCR-VL-1.5';
export type OutputFormat = 'latex' | 'markdown' | 'text';
export type Theme = 'light' | 'dark' | 'system';
export type OCREngine = 'paddleocr' | 'mfr';

export interface MfrStatus {
  state: 'not-downloaded' | 'downloading' | 'ready' | 'error';
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  modelPath?: string;
}

export interface AppSettings {
  ocrEngine: OCREngine;
  apiUrl: string;
  accessToken: string;
  pipeline: Pipeline;
  snipHotkey: string;
  defaultOutputFormat: OutputFormat;
  historyLimit: number;
  theme: Theme;
}

export interface OCRResult {
  latex: string;
  markdown: string;
  text: string;
  rawResponse: unknown;
  warning?: string;
}

export interface HistoryItem {
  id: number;
  timestamp: string;
  pipeline: Pipeline | 'MFR-1.5';
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
