import { ipcMain, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { IPC } from '../shared/types';

/** Acknowledge durable renderer saves before Electron tears down its IPC connection. */
export function flushBeforeQuit(window: BrowserWindow, timeoutMs = 15_000): Promise<boolean> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const requestId = randomUUID();
    const finish = (saved: boolean) => {
      clearTimeout(timer);
      ipcMain.removeListener(IPC.QUIT_READY, onReady);
      resolve(saved);
    };
    const onReady = (event: Electron.IpcMainEvent, id: unknown, saved: unknown) => {
      if (event.sender === window.webContents && id === requestId) finish(saved === true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    ipcMain.on(IPC.QUIT_READY, onReady);
    try {
      window.webContents.send(IPC.PREPARE_QUIT, requestId);
    } catch {
      finish(false);
    }
  });
}
