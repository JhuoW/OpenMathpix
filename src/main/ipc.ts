import { app, ipcMain, clipboard, BrowserWindow, dialog, nativeImage, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { formulaPng, formulaSvg } from './formula-image';
import { cancelUpdate, downloadUpdate, getUpdateStatus, installUpdate } from './updates';
import { IPC } from '../shared/types';
import type { AppSettings, HistoryUpdate, HotkeyStatus, LocalOCREngine } from '../shared/types';
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
import { localModels } from './mfr';
import { TEXTELLER_DOWNLOAD_PAGE } from '../services/texteller-model';
import { getEngineStatuses, cloudEngineStatus } from './engine-status';
import { MFR_REVISION, MODEL_HOSTS } from '../services/mfr-model';
import { MFR_TEST_IMAGE } from '../shared/mfr-test-image';
import { SAMPLE_FORMULA_IMAGE } from '../shared/sample-formula';
import { translate } from '../shared/i18n';
import { registerPopup, showPopup } from './popup';
import { createOperationTracker } from './operations';

const MAX_CLIPBOARD_TEXT = 5 * 1024 * 1024;

export interface IpcActions {
  snip: () => Promise<void>;
  showMainWindow: () => void;
  /** With retry, registers the saved hotkey again, e.g. after another app released it. */
  hotkeyStatus: (retry: boolean) => HotkeyStatus;
  suspendHotkey: (suspended: boolean) => void;
  isQuitting: () => boolean;
  connectEngine: (updates: Partial<AppSettings>) => Promise<AppSettings>;
}

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  saveSettings: (updates: Partial<AppSettings>) => Promise<AppSettings>,
  clearModel: (engine?: LocalOCREngine) => Promise<AppSettings>,
  actions: IpcActions,
): { waitForIdle: (timeoutMs?: number) => Promise<boolean> } {
  const operations = createOperationTracker();
  const ensureRunning = () => {
    if (actions.isQuitting()) {
      throw new Error(
        getSettings().language === 'zh-CN'
          ? 'OpenMathpix 正在完成操作并退出，请稍候。'
          : 'OpenMathpix is finishing pending operations before exiting. Please wait.',
      );
    }
  };
  let modelOperation = false;
  async function changeModel<T>(operation: () => Promise<T>): Promise<T> {
    ensureRunning();
    if (modelOperation) throw new Error('A model operation is in progress. Please wait.');
    modelOperation = true;
    try {
      return await operations.run(operation);
    } finally {
      modelOperation = false;
    }
  }
  ipcMain.handle(IPC.START_SNIP, () => actions.snip());
  ipcMain.handle(IPC.HOTKEY_STATUS, (_event, retry: unknown) =>
    actions.hotkeyStatus(retry === true),
  );
  ipcMain.handle(IPC.HOTKEY_SUSPEND, (_event, suspended: unknown) =>
    actions.suspendHotkey(suspended === true),
  );

  ipcMain.handle(IPC.RECOGNIZE, (_event, imageBase64: string) => {
    ensureRunning();
    return operations.run(async () => {
      const settings = getSettings();
      if (settings.ocrEngine === 'paddleocr' && !settings.apiUrl) {
        throw new Error('API URL not configured. Please set it in Settings.');
      }

      let result;
      try {
        result =
          settings.ocrEngine !== 'paddleocr'
            ? await localModels[settings.ocrEngine].recognize(imageBase64)
            : {
                ...(await recognize({
                  imageBase64,
                  pipeline: settings.pipeline,
                  apiUrl: settings.apiUrl,
                  accessToken: settings.accessToken,
                })),
                kind: 'document' as const,
              };
        cloudEngineStatus(settings, { state: 'ready' });
      } catch (error) {
        cloudEngineStatus(settings, {
          state: 'error',
          error: error instanceof Error ? error.message : 'Recognition failed',
        });
        throw error;
      }

      // Persistence is secondary: a disk/thumbnail error must not discard OCR output.
      try {
        const thumbnail = createThumbnail(imageBase64);
        result.historyId = addHistoryItem(
          settings.ocrEngine === 'mfr'
            ? 'MFR-1.5'
            : settings.ocrEngine === 'texteller'
              ? 'TexTeller'
              : settings.pipeline,
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
  });

  ipcMain.handle(IPC.GET_SETTINGS, () => getSettings());
  ipcMain.handle(IPC.GET_ENGINE_STATUSES, getEngineStatuses);
  ipcMain.handle(IPC.CONNECT_ENGINE, (_event, updates: Partial<AppSettings>) => {
    ensureRunning();
    return operations.run(() => actions.connectEngine(updates));
  });
  for (const engine of ['mfr', 'texteller'] as const) {
    const model = localModels[engine];
    const pathKey = `${engine}ModelPath` as const;
    const downloadKey = `${engine}DownloadDirectory` as const;
    const label = engine === 'mfr' ? 'MFR-1.5' : 'TexTeller';
    const channels =
      engine === 'mfr'
        ? {
            GET_STATUS: IPC.MFR_GET_STATUS,
            DOWNLOAD: IPC.MFR_DOWNLOAD,
            SELECT: IPC.MFR_SELECT,
            SELECT_DOWNLOAD_DIRECTORY: IPC.MFR_SELECT_DOWNLOAD_DIRECTORY,
            CLEAR: IPC.MFR_CLEAR,
            OPEN_MODEL_PAGE: IPC.MFR_OPEN_MODEL_PAGE,
          }
        : {
            GET_STATUS: IPC.TEXTELLER_GET_STATUS,
            DOWNLOAD: IPC.TEXTELLER_DOWNLOAD,
            SELECT: IPC.TEXTELLER_SELECT,
            SELECT_DOWNLOAD_DIRECTORY: IPC.TEXTELLER_SELECT_DOWNLOAD_DIRECTORY,
            CLEAR: IPC.TEXTELLER_CLEAR,
            OPEN_MODEL_PAGE: IPC.TEXTELLER_OPEN_MODEL_PAGE,
          };
    ipcMain.handle(channels.GET_STATUS, model.getStatus);
    ipcMain.handle(channels.DOWNLOAD, () =>
      changeModel(async () => {
        const directory = await model.download();
        return saveSettings({ [pathKey]: directory });
      }),
    );
    ipcMain.handle(channels.SELECT_DOWNLOAD_DIRECTORY, () =>
      changeModel(async () => {
        const chinese = getSettings().language === 'zh-CN';
        const selected = await dialog.showOpenDialog(mainWindow, {
          title: chinese ? '选择模型存储位置' : 'Choose Model Storage Location',
          defaultPath: getSettings()[downloadKey] || undefined,
          properties: ['openDirectory', 'createDirectory'],
          buttonLabel: chinese ? '使用此位置' : 'Use This Location',
        });
        if (selected.canceled || !selected.filePaths[0]) return null;
        const active = await model.getStatus();
        return saveSettings({
          [downloadKey]: selected.filePaths[0],
          // Preserve an older default installation when changing future download location.
          ...(!getSettings()[pathKey] && active.state === 'ready' && active.modelPath
            ? { [pathKey]: active.modelPath }
            : {}),
        });
      }),
    );
    ipcMain.handle(channels.SELECT, () =>
      changeModel(async () => {
        const selected = await dialog.showOpenDialog(mainWindow, {
          title:
            getSettings().language === 'zh-CN'
              ? `选择本地 ${label} 模型`
              : `Select Local ${label} Model`,
          properties: ['openDirectory'],
          buttonLabel: getSettings().language === 'zh-CN' ? '选择模型' : 'Select Model',
        });
        if (selected.canceled || !selected.filePaths[0]) return null;
        return saveSettings({ [pathKey]: selected.filePaths[0] });
      }),
    );
    ipcMain.handle(channels.CLEAR, () =>
      changeModel(async () => {
        const chinese = getSettings().language === 'zh-CN';
        const active = await model.getStatus();
        const managed = active.managed === true;
        const answer = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: managed
            ? chinese
              ? '卸载本地模型'
              : 'Uninstall Local Model'
            : chinese
              ? '断开模型连接'
              : 'Disconnect Model',
          message: managed
            ? chinese
              ? '删除当前本地模型文件？'
              : 'Delete the current local model files?'
            : chinese
              ? '断开当前模型连接？'
              : 'Disconnect the current model?',
          detail: managed
            ? (chinese
                ? '将删除以下由 OpenMathpix 下载的模型，之后可重新下载。截图历史和其他设置会保留。'
                : 'The model downloaded by OpenMathpix below will be deleted. You can download it again later. History and other settings are kept.') +
              `\n\n${active.modelPath || active.downloadDirectory || ''}`
            : chinese
              ? '此模型是从已有文件夹导入的。只移除软件中的连接，原始文件会保留。'
              : 'This model was imported from an existing folder. Its original files will be kept; only the connection is removed.',
          buttons: chinese
            ? [managed ? '删除模型' : '断开连接', '取消']
            : [managed ? 'Delete Model' : 'Disconnect', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
        if (answer.response !== 0) return null;
        return clearModel(engine);
      }),
    );
    ipcMain.handle(channels.OPEN_MODEL_PAGE, () =>
      shell.openExternal(
        engine === 'mfr'
          ? `${MODEL_HOSTS[getSettings().modelSource]}/breezedeus/pix2text-mfr-1.5/tree/${MFR_REVISION}`
          : TEXTELLER_DOWNLOAD_PAGE,
      ),
    );
  }
  const localEngine = (value: unknown): LocalOCREngine => {
    if (value !== 'mfr' && value !== 'texteller') throw new Error('Unknown local model.');
    return value;
  };
  // Settings and the first-run guide: show what an installed model produces, using a
  // bundled sample image. The model need not be the active engine; history is untouched.
  ipcMain.handle(IPC.MODEL_TEST, (_event, engine: unknown) => {
    ensureRunning();
    const target = localEngine(engine);
    return operations.run(async () => {
      let result;
      try {
        result = await localModels[target].recognize(SAMPLE_FORMULA_IMAGE);
      } finally {
        // A model tested in passing must not stay loaded next to the engine in use.
        if (getSettings().ocrEngine !== target) localModels[target].release();
      }
      const raw = (result.rawResponse ?? {}) as { elapsedMs?: unknown; loadMs?: unknown };
      return {
        latex: result.latex,
        elapsedMs: typeof raw.elapsedMs === 'number' ? raw.elapsedMs : 0,
        loadMs: typeof raw.loadMs === 'number' ? raw.loadMs : undefined,
      };
    });
  });
  ipcMain.handle(IPC.UPDATE_GET_STATUS, () => getUpdateStatus());
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, () => {
    ensureRunning();
    void downloadUpdate();
  });
  ipcMain.handle(IPC.UPDATE_CANCEL, () => cancelUpdate());
  ipcMain.handle(IPC.UPDATE_INSTALL, () => installUpdate());
  // Formula images for slides and chat apps: PNG on the clipboard, PNG or SVG as a file.
  ipcMain.handle(IPC.FORMULA_COPY_IMAGE, async (_event, latex: unknown) => {
    const png = await formulaPng(typeof latex === 'string' ? latex : '');
    clipboard.writeImage(nativeImage.createFromBuffer(png));
  });
  ipcMain.handle(IPC.FORMULA_SAVE_IMAGE, async (_event, latex: unknown) => {
    const source = typeof latex === 'string' ? latex : '';
    const svg = await formulaSvg(source); // Report bad LaTeX before asking for a file name.
    const zh = getSettings().language === 'zh-CN';
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: zh ? '保存公式图片' : 'Save Formula Image',
      defaultPath: join(app.getPath('pictures'), 'formula.png'),
      filters: [
        { name: zh ? 'PNG 图片' : 'PNG image', extensions: ['png'] },
        { name: zh ? 'SVG 矢量图' : 'SVG vector image', extensions: ['svg'] },
      ],
    });
    if (canceled || !filePath) return null;
    const vector = extname(filePath).toLowerCase() === '.svg';
    await writeFile(filePath, vector ? svg : await formulaPng(source, 4));
    return filePath;
  });
  // Not a model operation itself: it interrupts the download that holds the model lock.
  ipcMain.handle(IPC.MODEL_CANCEL_DOWNLOAD, (_event, engine: unknown) =>
    localModels[localEngine(engine)].cancelDownload(),
  );
  // Only the folder of an installed model is opened, never a path chosen by the page.
  ipcMain.handle(IPC.MODEL_OPEN_FOLDER, async (_event, engine: unknown) => {
    const status = await localModels[localEngine(engine)].getStatus();
    if (status.state !== 'ready' || !status.modelPath) {
      throw new Error('The model folder is not available.');
    }
    const failure = await shell.openPath(status.modelPath);
    if (failure) throw new Error(failure);
  });

  ipcMain.handle(IPC.SET_SETTINGS, (_event, updates: Partial<AppSettings>) => {
    // Final autosaves must remain allowed after Exit has stopped accepting new work.
    return operations.run(() => saveSettings(updates));
  });

  ipcMain.handle(IPC.TEST_CONNECTION, () => {
    ensureRunning();
    return operations.run(async () => {
      const settings = getSettings();
      if (settings.ocrEngine === 'paddleocr' && !settings.apiUrl) {
        return { ok: false, error: 'API URL not configured.' };
      }
      try {
        if (settings.ocrEngine !== 'paddleocr')
          await localModels[settings.ocrEngine].recognize(MFR_TEST_IMAGE);
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

  registerPopup(actions.showMainWindow);

  /** Returns whether the copy popup was shown; the visible window uses its own toast. */
  ipcMain.handle(IPC.NOTIFY, (_event, title: unknown, body: unknown, kind: unknown) => {
    if (typeof title !== 'string' || typeof body !== 'string') return false;
    const windowInView =
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized() &&
      mainWindow.isFocused();
    if (windowInView) return false;
    const language = getSettings().language;
    const error = kind === 'error';
    showPopup({
      title: title.slice(0, 120),
      body: body.length > 300 ? `${body.slice(0, 299)}…` : body,
      hint: translate(language, 'Click to open OpenMathpix'),
      closeLabel: translate(language, 'Close'),
      kind: error ? 'error' : 'success',
      durationMs: error ? 8000 : 5000,
      language,
    });
    return true;
  });
  return { waitForIdle: operations.waitForIdle };
}
