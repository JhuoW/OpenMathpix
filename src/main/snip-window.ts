import type { AfterSnipAction } from '../shared/types';

export interface MainWindowState {
  visible: boolean;
  minimized: boolean;
}

/**
 * Only a window that is on screen must be hidden before the desktop is captured. Hiding a
 * minimized window would also remove its taskbar button, leaving only the tray icon.
 */
export function isOnScreen(state: MainWindowState): boolean {
  return state.visible && !state.minimized;
}

export type AfterSnipWindow = 'focus' | 'show-inactive' | 'none';

/** What happens to the main window when a snip ends. */
export function afterSnipWindow(options: {
  wasOnScreen: boolean;
  captured: boolean;
  afterSnip: AfterSnipAction;
}): AfterSnipWindow {
  if (options.captured && options.afterSnip === 'window') return 'focus';
  // Cancelled, or recognized in the background: restore without taking focus away. A
  // minimized window was never hidden and stays minimized.
  return options.wasOnScreen ? 'show-inactive' : 'none';
}
