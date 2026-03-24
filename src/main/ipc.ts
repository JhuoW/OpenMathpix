import { ipcMain, clipboard, nativeImage, BrowserWindow } from 'electron';
import { IPC } from '../shared/types';
import type { AppSettings } from '../shared/types';
import { recognize, testConnection } from '../services/paddleocr';
import { getSettings, setSettings } from './store';
import {
  addHistoryItem,
  getHistory,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  trimHistory,
} from './db';
import { startSnip, createThumbnail } from './capture';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.START_SNIP, () => startSnip(mainWindow));

  ipcMain.handle(IPC.RECOGNIZE, async (_event, imageBase64: string) => {
    const settings = getSettings();
    if (!settings.apiUrl) {
      throw new Error('API URL not configured. Please set it in Settings.');
    }

    const result = await recognize({
      imageBase64,
      pipeline: settings.pipeline,
      apiUrl: settings.apiUrl,
      accessToken: settings.accessToken,
    });

    // Save to history
    const thumbnail = createThumbnail(imageBase64);
    addHistoryItem(
      settings.pipeline,
      thumbnail,
      result.latex,
      result.markdown,
      result.text,
    );
    trimHistory(settings.historyLimit);

    return result;
  });

  ipcMain.handle(IPC.GET_SETTINGS, () => getSettings());

  ipcMain.handle(IPC.SET_SETTINGS, (_event, updates: Partial<AppSettings>) => {
    setSettings(updates);
  });

  ipcMain.handle(IPC.TEST_CONNECTION, async () => {
    const settings = getSettings();
    if (!settings.apiUrl) {
      return { ok: false, error: 'API URL not configured.' };
    }
    try {
      await testConnection({
        pipeline: settings.pipeline,
        apiUrl: settings.apiUrl,
        accessToken: settings.accessToken,
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' };
    }
  });

  ipcMain.handle(IPC.GET_HISTORY, (_event, limit?: number, offset?: number) =>
    getHistory(limit, offset),
  );

  ipcMain.handle(IPC.SEARCH_HISTORY, (_event, query: string) =>
    searchHistory(query),
  );

  ipcMain.handle(IPC.DELETE_HISTORY_ITEM, (_event, id: number) =>
    deleteHistoryItem(id),
  );

  ipcMain.handle(IPC.CLEAR_HISTORY, () => clearHistory());

  ipcMain.handle(IPC.PASTE_IMAGE, () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toPNG().toString('base64');
  });
}
