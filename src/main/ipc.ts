import { ipcMain, clipboard, BrowserWindow, dialog, shell, Notification } from 'electron';
import { IPC } from '../shared/types';
import type { AppSettings, HistoryUpdate } from '../shared/types';
import { recognize, testConnection } from '../services/paddleocr';
import { getSettings } from './store';
import {
  addHistoryItem,
  getHistory,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  trimHistory,
  updateHistoryItem,
} from './db';
import { createThumbnail } from './capture';
import { downloadMfrModel, getMfrStatus, recognizeMfr } from './mfr';
import { MFR_REVISION, MODEL_HOSTS } from '../services/mfr-model';
import { MFR_TEST_IMAGE } from '../shared/mfr-test-image';

const MAX_CLIPBOARD_TEXT = 5 * 1024 * 1024;
const activeNotifications = new Set<Notification>();

export interface IpcActions {
  snip: () => Promise<void>;
  showMainWindow: () => void;
}

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  saveSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>,
  clearModel: () => Promise<AppSettings>,
  actions: IpcActions,
): void {
  let modelOperation = false;
  async function changeModel<T>(operation: () => Promise<T>): Promise<T> {
    if (modelOperation) throw new Error('A model operation is in progress. Please wait.');
    modelOperation = true;
    try {
      return await operation();
    } finally {
      modelOperation = false;
    }
  }
  ipcMain.handle(IPC.START_SNIP, () => actions.snip());

  ipcMain.handle(IPC.RECOGNIZE, async (_event, imageBase64: string) => {
    const settings = getSettings();
    if (settings.ocrEngine === 'paddleocr' && !settings.apiUrl) {
      throw new Error('API URL not configured. Please set it in Settings.');
    }

    const result =
      settings.ocrEngine === 'mfr'
        ? await recognizeMfr(imageBase64)
        : {
            ...(await recognize({
              imageBase64,
              pipeline: settings.pipeline,
              apiUrl: settings.apiUrl,
              accessToken: settings.accessToken,
            })),
            kind: 'document' as const,
          };

    // Persistence is secondary: a disk/thumbnail error must not discard OCR output.
    try {
      const thumbnail = createThumbnail(imageBase64);
      result.historyId = addHistoryItem(
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
  ipcMain.handle(IPC.MFR_GET_STATUS, getMfrStatus);
  ipcMain.handle(IPC.MFR_DOWNLOAD, () =>
    changeModel(async () => {
      await downloadMfrModel();
      return saveSettings({ mfrModelPath: '' });
    }),
  );
  ipcMain.handle(IPC.MFR_SELECT, () =>
    changeModel(async () => {
      const selected = await dialog.showOpenDialog(mainWindow, {
        title:
          getSettings().language === 'zh-CN'
            ? '选择本地 MFR-1.5 模型'
            : 'Select Local MFR-1.5 Model',
        properties: ['openDirectory'],
        buttonLabel: getSettings().language === 'zh-CN' ? '选择模型' : 'Select Model',
      });
      if (selected.canceled || !selected.filePaths[0]) return null;
      return saveSettings({ mfrModelPath: selected.filePaths[0] });
    }),
  );
  ipcMain.handle(IPC.MFR_CLEAR, () =>
    changeModel(async () => {
      const chinese = getSettings().language === 'zh-CN';
      const answer = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: chinese ? '清理模型缓存' : 'Clear Model Cache',
        message: chinese ? '清理本地模型缓存？' : 'Clear the local model cache?',
        detail: chinese
          ? '应用缓存目录中的模型文件将被删除，当前本地模型会停用。手动选择的外部模型目录及其文件不会删除。之后可重新下载或选择模型。'
          : 'Model files in the application cache will be removed and the current local model will be deactivated. External model folders you selected will not be deleted. You can download or select a model again afterwards.',
        buttons: chinese ? ['清理模型缓存', '取消'] : ['Clear Model Cache', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (answer.response !== 0) return null;
      return clearModel();
    }),
  );
  ipcMain.handle(IPC.MFR_OPEN_MODEL_PAGE, () =>
    shell.openExternal(
      `${MODEL_HOSTS[getSettings().modelSource]}/breezedeus/pix2text-mfr-1.5/tree/${MFR_REVISION}`,
    ),
  );

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

  ipcMain.handle(IPC.UPDATE_HISTORY_ITEM, (_event, id: unknown, updates: unknown) => {
    if (!Number.isInteger(id) || !updates || typeof updates !== 'object') {
      throw new Error('Invalid history update.');
    }
    return updateHistoryItem(id as number, updates as HistoryUpdate);
  });

  ipcMain.handle(IPC.PASTE_IMAGE, () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toPNG().toString('base64');
  });

  // The main-process clipboard works while the window is hidden or unfocused, unlike
  // navigator.clipboard, which background recognition relies on.
  ipcMain.handle(IPC.COPY_TEXT, (_event, text: unknown) => {
    if (typeof text !== 'string' || text.length > MAX_CLIPBOARD_TEXT) {
      throw new Error('Invalid clipboard text.');
    }
    clipboard.writeText(text);
  });

  /** Returns whether a system notification was shown; the visible window uses its toast. */
  ipcMain.handle(IPC.NOTIFY, (_event, title: unknown, body: unknown) => {
    if (typeof title !== 'string' || typeof body !== 'string') return false;
    const windowInView =
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized() &&
      mainWindow.isFocused();
    if (windowInView || !Notification.isSupported()) return false;
    const notification = new Notification({
      title: title.slice(0, 120),
      body: body.length > 200 ? `${body.slice(0, 199)}…` : body,
      silent: true,
    });
    // Keep a reference until the notification is gone, or its click handler can be collected.
    activeNotifications.add(notification);
    const release = () => activeNotifications.delete(notification);
    notification.on('click', () => {
      release();
      actions.showMainWindow();
    });
    notification.on('close', release);
    notification.show();
    return true;
  });
}
