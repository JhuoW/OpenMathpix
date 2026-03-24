import {
  BrowserWindow,
  desktopCapturer,
  screen,
  ipcMain,
  nativeImage,
} from 'electron';
import path from 'path';
import { IPC } from '../shared/types';
import type { ScreenCapture, SnipSelection } from '../shared/types';

let overlayWindow: BrowserWindow | null = null;
let capturedScreens: ScreenCapture[] = [];
let snipInProgress = false;

export function isSnipInProgress(): boolean {
  return snipInProgress;
}

export async function startSnip(mainWindow: BrowserWindow): Promise<void> {
  if (snipInProgress) return;
  snipInProgress = true;

  try {
    // Hide main window so it doesn't appear in the screenshot
    mainWindow.hide();
    // Small delay to let the window fully disappear
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Capture all screens
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();

    // Use physical pixel dimensions for full-resolution capture
    const maxW = Math.max(...displays.map((d) => Math.round(d.size.width * d.scaleFactor)));
    const maxH = Math.max(...displays.map((d) => Math.round(d.size.height * d.scaleFactor)));

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxW, height: maxH },
    });

    capturedScreens = [];
    for (const display of displays) {
      const source = sources.find((s) => s.display_id === String(display.id));
      if (!source) continue;
      capturedScreens.push({
        dataUrl: source.thumbnail.toDataURL(),
        bounds: display.bounds,
        displayId: String(display.id),
      });
    }

    // Use the primary display for the overlay
    const db = primaryDisplay.bounds;

    // Create overlay window — NOT transparent, shows captured screenshot as background
    overlayWindow = new BrowserWindow({
      x: db.x,
      y: db.y,
      width: db.width,
      height: db.height,
      frame: false,
      transparent: false,
      backgroundColor: '#000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      fullscreen: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');

    // Load overlay page
    if (process.env.ELECTRON_RENDERER_URL) {
      await overlayWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`);
    } else {
      await overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'));
    }

    // Find captured image for primary display
    const primaryCapture = capturedScreens.find(
      (s) => s.displayId === String(primaryDisplay.id),
    );
    if (!primaryCapture) {
      throw new Error('Failed to capture primary display');
    }

    // Send the primary display screenshot to the overlay
    overlayWindow.webContents.send(IPC.OVERLAY_SCREEN_DATA, [
      { ...primaryCapture, bounds: { x: 0, y: 0, width: db.width, height: db.height } },
    ]);

    // Show the overlay once the renderer signals it's ready
    ipcMain.once(IPC.OVERLAY_READY, () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show();
        overlayWindow.focus();
      }
    });

    // Handle selection — overlay sends normalized 0-1 fractions
    ipcMain.once(IPC.OVERLAY_SELECTION, (_event, selection: SnipSelection) => {
      const croppedBase64 = cropNormalized(primaryCapture, selection);
      closeOverlay();
      mainWindow.show();
      mainWindow.focus();
      if (croppedBase64) {
        mainWindow.webContents.send(IPC.SNIP_CAPTURED, croppedBase64);
      }
    });

    ipcMain.once(IPC.OVERLAY_CANCEL, () => {
      closeOverlay();
      mainWindow.show();
      mainWindow.focus();
    });
  } catch (err) {
    console.error('Snip failed:', err);
    snipInProgress = false;
    mainWindow.show();
    mainWindow.focus();
  }
}

function closeOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  overlayWindow = null;
  snipInProgress = false;
  ipcMain.removeAllListeners(IPC.OVERLAY_SELECTION);
  ipcMain.removeAllListeners(IPC.OVERLAY_CANCEL);
  ipcMain.removeAllListeners(IPC.OVERLAY_READY);
}

/**
 * Crop from a screen capture using normalized (0-1) selection fractions.
 * This is DPI-independent: fractions map directly to image pixels.
 */
function cropNormalized(
  capture: ScreenCapture,
  sel: { x: number; y: number; width: number; height: number },
): string | null {
  const img = nativeImage.createFromDataURL(capture.dataUrl);
  const imgSize = img.getSize();

  const cropX = Math.max(0, Math.round(sel.x * imgSize.width));
  const cropY = Math.max(0, Math.round(sel.y * imgSize.height));
  const cropW = Math.min(Math.round(sel.width * imgSize.width), imgSize.width - cropX);
  const cropH = Math.min(Math.round(sel.height * imgSize.height), imgSize.height - cropY);

  if (cropW < 5 || cropH < 5) return null;

  const cropped = img.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
  return cropped.toPNG().toString('base64');
}

export function createThumbnail(base64: string): string {
  const img = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
  const size = img.getSize();
  const maxWidth = 200;
  if (size.width <= maxWidth) {
    return img.toJPEG(60).toString('base64');
  }
  const scale = maxWidth / size.width;
  const resized = img.resize({
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  });
  return resized.toJPEG(60).toString('base64');
}
