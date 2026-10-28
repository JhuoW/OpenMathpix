import { ipcMain, clipboard, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';
import type { AppSettings } from '../shared/types';
import { recognize, testConnection } from '../services/paddleocr';
import { getSettings } from './store';
import {
  addHistoryItem,
  getHistory,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  trimHistory,
} from './db';
import { startSnip, createThumbnail } from './capture';
import { getMfrManager, recognizeMfr } from './mfr';
import { MFR_TEST_IMAGE } from '../shared/mfr-test-image';

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  saveSettings: (updates: Partial<AppSettings>) => AppSettings,
): void {
  ipcMain.handle(IPC.START_SNIP, () => startSnip(mainWindow));

  ipcMain.handle(IPC.RECOGNIZE, async (_event, imageBase64: string) => {
    const settings = getSettings();
    if (settings.ocrEngine === 'paddleocr' && !settings.apiUrl) {
      throw new Error('API URL not configured. Please set it in Settings.');
    }

    const result =
      settings.ocrEngine === 'mfr'
        ? await recognizeMfr(imageBase64)
        : await recognize({
            imageBase64,
            pipeline: settings.pipeline,
            apiUrl: settings.apiUrl,
            accessToken: settings.accessToken,
          });

    // Persistence is secondary: a disk/thumbnail error must not discard OCR output.
    try {
      const thumbnail = createThumbnail(imageBase64);
      addHistoryItem(
        settings.ocrEngine === 'mfr' ? 'MFR-1.5' : settings.pipeline,
        thumbnail,
        result.latex,
        result.markdown,
        result.text,
      );
      trimHistory(settings.historyLimit);
    } catch {
      return { ...result, warning: 'Could not update recognition history.' };
    }

    return result;
  });

  ipcMain.handle(IPC.GET_SETTINGS, () => getSettings());
  ipcMain.handle(IPC.MFR_GET_STATUS, () => getMfrManager().getStatus());
  ipcMain.handle(IPC.MFR_DOWNLOAD, () => getMfrManager().download());

  ipcMain.handle(IPC.SET_SETTINGS, (_event, updates: Partial<AppSettings>) => {
    return saveSettings(updates);
  });

  ipcMain.handle(IPC.TEST_CONNECTION, async () => {
    const settings = getSettings();
    if (settings.ocrEngine === 'paddleocr' && !settings.apiUrl) {
      return { ok: false, error: 'API URL not configured.' };
    }
    try {
      if (settings.ocrEngine === 'mfr') await recognizeMfr(MFR_TEST_IMAGE);
      else
        await testConnection({
          pipeline: settings.pipeline,
          apiUrl: settings.apiUrl,
          accessToken: settings.accessToken,
        });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  });

  ipcMain.handle(IPC.GET_HISTORY, (_event, limit?: number, offset?: number) =>
    getHistory(limit, offset),
  );

  ipcMain.handle(IPC.SEARCH_HISTORY, (_event, query: string) => searchHistory(query));

  ipcMain.handle(IPC.DELETE_HISTORY_ITEM, (_event, id: number) => deleteHistoryItem(id));

  ipcMain.handle(IPC.CLEAR_HISTORY, () => clearHistory());

  ipcMain.handle(IPC.PASTE_IMAGE, () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toPNG().toString('base64');
  });
}
