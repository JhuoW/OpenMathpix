import type { SnipSelection } from '../shared/types';

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
