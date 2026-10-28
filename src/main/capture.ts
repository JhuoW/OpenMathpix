import { BrowserWindow, desktopCapturer, screen, ipcMain, nativeImage } from 'electron';
import path from 'path';
import { IPC } from '../shared/types';
import type { ScreenCapture, SnipSelection } from '../shared/types';
import { normalizedCropBounds } from './capture-geometry';

interface Overlay {
  window: BrowserWindow;
  capture: ScreenCapture;
  ready: boolean;
}

let snipInProgress = false;

export function isSnipInProgress(): boolean {
  return snipInProgress;
}

export async function startSnip(mainWindow: BrowserWindow): Promise<void> {
  if (snipInProgress || mainWindow.isDestroyed()) return;
  snipInProgress = true;

  // Each display has its own overlay and normalized coordinate space.
  const overlays = new Map<number, Overlay>();
  let finished = false;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;

  function finish(imageBase64?: string): void {
    if (finished) return;
    finished = true;
    clearTimeout(readyTimer);
    ipcMain.removeListener(IPC.OVERLAY_READY, onReady);
    ipcMain.removeListener(IPC.OVERLAY_SELECTION, onSelection);
    ipcMain.removeListener(IPC.OVERLAY_CANCEL, onCancel);
    screen.removeListener('display-removed', onDisplayChanged);
    screen.removeListener('display-metrics-changed', onDisplayChanged);
    for (const { window } of overlays.values()) {
      if (!window.isDestroyed()) window.destroy();
    }
    overlays.clear();
    snipInProgress = false;
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      if (imageBase64) mainWindow.webContents.send(IPC.SNIP_CAPTURED, imageBase64);
    }
  }

  function fail(error: unknown): void {
    if (finished) return;
    console.error('Snip failed:', error);
    finish();
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        IPC.SNIP_ERROR,
        error instanceof Error ? error.message : 'Screen capture failed. Please try again.',
      );
    }
  }

  function onReady(event: Electron.IpcMainEvent): void {
    const overlay = overlays.get(event.sender.id);
    if (!overlay || finished) return;
    overlay.ready = true;
    if (![...overlays.values()].every((entry) => entry.ready)) return;
    clearTimeout(readyTimer);
    const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    let focusedWindow: BrowserWindow | undefined;
    for (const entry of overlays.values()) {
      entry.window.showInactive();
      if (entry.capture.displayId === String(activeDisplay.id)) focusedWindow = entry.window;
    }
    (focusedWindow ?? overlay.window).focus();
  }

  function onSelection(event: Electron.IpcMainEvent, selection: SnipSelection): void {
    const overlay = overlays.get(event.sender.id);
    if (!overlay || !overlay.ready || finished) return;
    try {
      const croppedBase64 = cropNormalized(overlay.capture, selection);
      if (!croppedBase64) {
        fail(new Error('Invalid or empty selection. Please select a larger area.'));
        return;
      }
      finish(croppedBase64);
    } catch (error) {
      fail(error);
    }
  }

  function onCancel(event: Electron.IpcMainEvent): void {
    if (overlays.has(event.sender.id)) finish();
  }

  function onDisplayChanged(): void {
    // Previously captured bounds are no longer safe to use.
    finish();
  }

  try {
    mainWindow.hide();
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (mainWindow.isDestroyed()) {
      finish();
      return;
    }

    const displays = screen.getAllDisplays();
    if (displays.length === 0) throw new Error('No display is available for screen capture.');
    const maxW = Math.max(...displays.map((d) => Math.round(d.size.width * d.scaleFactor)));
    const maxH = Math.max(...displays.map((d) => Math.round(d.size.height * d.scaleFactor)));
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxW, height: maxH },
    });
    if (mainWindow.isDestroyed()) {
      finish();
      return;
    }

    // Register before loading/sending data so fast renderers cannot lose READY.
    ipcMain.on(IPC.OVERLAY_READY, onReady);
    ipcMain.on(IPC.OVERLAY_SELECTION, onSelection);
    ipcMain.on(IPC.OVERLAY_CANCEL, onCancel);
    screen.on('display-removed', onDisplayChanged);
    screen.on('display-metrics-changed', onDisplayChanged);

    for (const display of displays) {
      const source =
        sources.find((s) => s.display_id === String(display.id)) ??
        (displays.length === 1 && sources.length === 1 ? sources[0] : undefined);
      if (!source || source.thumbnail.isEmpty()) continue;
      const capture: ScreenCapture = {
        dataUrl: source.thumbnail.toDataURL(),
        bounds: display.bounds,
        displayId: String(display.id),
      };
      const window = new BrowserWindow({
        ...display.bounds,
        frame: false,
        transparent: false,
        backgroundColor: '#000000',
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        fullscreen: process.platform !== 'darwin',
        simpleFullscreen: process.platform === 'darwin',
        hasShadow: false,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      overlays.set(window.webContents.id, { window, capture, ready: false });
      window.setAlwaysOnTop(true, 'screen-saver');
      window.on('closed', () => finish());
      window.webContents.on('render-process-gone', () => {
        fail(new Error('The capture window stopped responding. Please try again.'));
      });
    }
    if (overlays.size === 0) {
      throw new Error(
        'Unable to capture a display. Check screen recording permissions and try again.',
      );
    }

    readyTimer = setTimeout(() => {
      fail(new Error('The capture window did not become ready. Please try again.'));
    }, 15000);

    await Promise.all(
      [...overlays.values()].map(async ({ window, capture }) => {
        if (process.env.ELECTRON_RENDERER_URL) {
          await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`);
        } else {
          await window.loadFile(path.join(__dirname, '../renderer/overlay.html'));
        }
        if (finished || window.isDestroyed()) return;
        window.webContents.send(IPC.OVERLAY_SCREEN_DATA, [
          {
            ...capture,
            bounds: { ...capture.bounds, x: 0, y: 0 },
          },
        ]);
      }),
    );
  } catch (error) {
    fail(error);
  }
}

function cropNormalized(capture: ScreenCapture, selection: SnipSelection): string | null {
  const image = nativeImage.createFromDataURL(capture.dataUrl);
  if (image.isEmpty()) return null;
  const bounds = normalizedCropBounds(selection, image.getSize());
  if (!bounds) return null;
  return image.crop(bounds).toPNG().toString('base64');
}

export function createThumbnail(base64: string): string {
  const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
  if (image.isEmpty()) throw new Error('The captured image is empty or invalid.');
  const size = image.getSize();
  if (size.width <= 200) return image.toJPEG(60).toString('base64');
  return image.resize({ width: 200 }).toJPEG(60).toString('base64');
}
