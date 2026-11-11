import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { IPC, type PopupAction, type PopupContent } from '../shared/types';
import { popupBounds } from './popup-layout';

/**
 * Reports a background copy in a small popup of our own instead of a system notification.
 * Windows notifications depend on the Notification Center: a notification that has timed
 * out there can no longer open the window, Focus Assist may hide it, and Electron writes a
 * Start menu shortcut for it (pointing at a deleted temporary folder for the portable build).
 * The popup never takes focus from the application the user is working in.
 */
let popup: BrowserWindow | null = null;
let loaded = false;
let pending: PopupContent | null = null;
let onOpen: () => void = () => {};

function deliver(): void {
  if (!popup || popup.isDestroyed() || !loaded || !pending) return;
  popup.webContents.send(IPC.POPUP_SHOW, pending);
  pending = null;
  popup.showInactive();
}

export function closePopup(): void {
  if (popup && !popup.isDestroyed()) popup.destroy();
  popup = null;
  loaded = false;
  pending = null;
}

export function showPopup(content: PopupContent): void {
  // Show it on the display the user is working on, i.e. where the snip was taken.
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = popupBounds(display.workArea);
  pending = content;
  if (popup && !popup.isDestroyed()) {
    popup.setBounds(bounds);
    deliver();
    return;
  }
  const window = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Clicking the popup must not activate it: focus stays in the user's application.
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  popup = window;
  loaded = false;
  // A window created from another display's scale factor is sized for that display.
  if (process.platform === 'win32') window.setBounds(bounds);
  window.webContents.once('did-finish-load', () => {
    if (popup !== window) return;
    loaded = true;
    deliver();
  });
  window.on('closed', () => {
    if (popup === window) {
      popup = null;
      loaded = false;
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/popup.html`);
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/popup.html'));
  }
}

/** Clicking the popup opens the main window; it closes itself after a few seconds. */
export function registerPopup(open: () => void): void {
  onOpen = open;
  ipcMain.on(IPC.POPUP_ACTION, (event, action: PopupAction) => {
    if (!popup || popup.isDestroyed() || event.sender !== popup.webContents) return;
    closePopup();
    if (action === 'open') onOpen();
  });
}
