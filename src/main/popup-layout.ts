type Rect = { x: number; y: number; width: number; height: number };

/** Window size in DIP: the card plus a transparent margin for its shadow. */
export const POPUP_SIZE = { width: 380, height: 104 };
const MARGIN = 12;

/** Bottom-right corner of the work area, above the taskbar, like a system notification. */
export function popupBounds(workArea: Rect, size = POPUP_SIZE): Rect {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  return {
    x: Math.round(workArea.x + workArea.width - width - MARGIN),
    y: Math.round(workArea.y + workArea.height - height - MARGIN),
    width,
    height,
  };
}
