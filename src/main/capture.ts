import {
  BrowserWindow,
  desktopCapturer,
  screen,
  ipcMain,
  nativeImage,
  type NativeImage,
} from 'electron';
import path from 'path';
import { IPC } from '../shared/types';
import type { AfterSnipAction, ScreenCapture, SnipSelection } from '../shared/types';
import {
  captureSizes,
  nativeSize,
  normalizedCropBounds,
  overlayWindowOptions,
  sizeKey,
} from './capture-geometry';
import { afterSnipWindow, isOnScreen } from './snip-window';

interface Overlay {
  window: BrowserWindow;
  capture: ScreenCapture;
  /** The lossless capture; the overlay only displays a faster JPEG copy. */
  image: NativeImage;
  ready: boolean;
}

export interface SnipOptions {
  /** Read when the snip finishes, so a settings change during selection applies. */
  afterSnip: () => AfterSnipAction;
}

let snipInProgress = false;

export function isSnipInProgress(): boolean {
  return snipInProgress;
}

export async function startSnip(
  mainWindow: BrowserWindow,
  options: SnipOptions = { afterSnip: () => 'window' },
): Promise<void> {
  if (snipInProgress || mainWindow.isDestroyed()) return;
  snipInProgress = true;
  // A snip started from the tray or hotkey must not pop up a window that was hidden.
  const wasOnScreen = isOnScreen({
    visible: mainWindow.isVisible(),
    minimized: mainWindow.isMinimized(),
  });

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
    if (mainWindow.isDestroyed()) return;
    const action = afterSnipWindow({
      wasOnScreen,
      captured: Boolean(imageBase64),
      afterSnip: options.afterSnip(),
    });
    if (action === 'focus') {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else if (action === 'show-inactive') {
      mainWindow.showInactive();
    }
    if (imageBase64) mainWindow.webContents.send(IPC.SNIP_CAPTURED, imageBase64);
  }

  function fail(error: unknown): void {
    if (finished) return;
    console.error('Snip failed:', error);
    finish();
    if (!mainWindow.isDestroyed()) {
      // Capture failures need the window: they usually require a permission change.
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
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
      const croppedBase64 = cropNormalized(overlay.image, selection);
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
    if (wasOnScreen) {
      mainWindow.hide();
      // Let the window disappear before the desktop is captured.
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (mainWindow.isDestroyed()) {
      finish();
      return;
    }

    const displays = screen.getAllDisplays();
    if (displays.length === 0) throw new Error('No display is available for screen capture.');
    // Capture each display at its own resolution (one request per distinct resolution).
    const capturesBySize = new Map(
      await Promise.all(
        captureSizes(displays).map(
          async (size) =>
            [
              sizeKey(size),
              await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size }),
            ] as const,
        ),
      ),
    );
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
      const sources = capturesBySize.get(sizeKey(nativeSize(display))) ?? [];
      const source =
        sources.find((s) => s.display_id === String(display.id)) ??
        (displays.length === 1 && sources.length === 1 ? sources[0] : undefined);
      if (!source || source.thumbnail.isEmpty()) continue;
      const capture: ScreenCapture = {
        // JPEG encodes several times faster than PNG for a full display. It is only shown
        // behind the selection; the recognized region is cropped from the lossless image.
        dataUrl: `data:image/jpeg;base64,${source.thumbnail.toJPEG(92).toString('base64')}`,
        bounds: display.bounds,
        displayId: String(display.id),
      };
      const window = new BrowserWindow({
        ...overlayWindowOptions(display.bounds, process.platform),
        show: false,
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      overlays.set(window.webContents.id, {
        window,
        capture,
        image: source.thumbnail,
        ready: false,
      });
      // Windows sizes a new window with the creating display's scale factor. Once the window
      // is on its own display, apply the bounds again so mixed-DPI displays are fully covered.
      if (process.platform === 'win32') window.setBounds(display.bounds);
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

function cropNormalized(image: NativeImage, selection: SnipSelection): string | null {
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
