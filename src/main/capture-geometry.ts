import type { BrowserWindowConstructorOptions } from 'electron';
import type { SnipSelection } from '../shared/types';

type Bounds = { x: number; y: number; width: number; height: number };

/**
 * Window options for a snip overlay that exactly covers one display.
 *
 * On Windows a frameless window keeps the invisible WS_THICKFRAME resize border, which
 * shrinks its client area, and `fullscreen` on a hidden window is restored at a smaller
 * size. The overlay then misses the right/bottom screen edges and shows a squashed image.
 * Exact bounds without a thick frame cover the display, including the taskbar.
 */
export function overlayWindowOptions(
  bounds: Bounds,
  platform: NodeJS.Platform,
): BrowserWindowConstructorOptions {
  return {
    ...bounds,
    frame: false,
    thickFrame: false,
    transparent: false,
    backgroundColor: '#000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreen: platform === 'linux',
    simpleFullscreen: platform === 'darwin',
    hasShadow: false,
  };
}

interface DisplayLike {
  size: { width: number; height: number };
  scaleFactor: number;
}

/** A display's resolution in physical pixels. */
export function nativeSize(display: DisplayLike): { width: number; height: number } {
  return {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
}

export const sizeKey = (size: { width: number; height: number }) => `${size.width}x${size.height}`;

/**
 * Thumbnail sizes to request: one per distinct display resolution. desktopCapturer scales
 * every screen to fit the single size it is given, so sharing the largest display's size
 * would upscale smaller displays and blur the recognized crop.
 */
export function captureSizes(displays: DisplayLike[]): { width: number; height: number }[] {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const display of displays) {
    const size = nativeSize(display);
    sizes.set(sizeKey(size), size);
  }
  return [...sizes.values()];
}

/** Map normalized overlay coordinates to the captured image's actual pixels. */
export function normalizedCropBounds(
  selection: SnipSelection,
  imageSize: { width: number; height: number },
): SnipSelection | null {
  if (!selection || !imageSize) return null;
  const { x, y, width, height } = selection;
  if (![x, y, width, height, imageSize.width, imageSize.height].every(Number.isFinite)) {
    return null;
  }
  if (
    x < 0 ||
    y < 0 ||
    x >= 1 ||
    y >= 1 ||
    width <= 0 ||
    height <= 0 ||
    width > 1 ||
    height > 1 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return null;
  }

  const left = Math.round(x * imageSize.width);
  const top = Math.round(y * imageSize.height);
  const right = Math.min(imageSize.width, Math.round((x + width) * imageSize.width));
  const bottom = Math.min(imageSize.height, Math.round((y + height) * imageSize.height));
  if (right - left < 5 || bottom - top < 5) return null;

  return { x: left, y: top, width: right - left, height: bottom - top };
}
