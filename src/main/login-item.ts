import { app } from 'electron';

/** Passed by the sign-in entry: start in the notification area without opening a window. */
export const START_HIDDEN_ARG = '--start-hidden';

export function startedAtLogin(argv: readonly string[] = process.argv): boolean {
  return argv.includes(START_HIDDEN_ARG);
}

function loginItem() {
  // A portable build runs from a temporary folder; register the file the user started.
  const path = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  return { path, args: [START_HIDDEN_ARG], name: app.getName() };
}

/** Development builds run electron.exe with a script path and must never be registered. */
const supported = () => app.isPackaged && process.platform === 'win32';

/**
 * Apply an explicit choice from Settings. Turning it on also re-enables an entry the user
 * disabled in Task Manager, since they have just asked for it.
 */
export function setLaunchAtLogin(enabled: boolean): void {
  if (!supported()) return;
  app.setLoginItemSettings({ ...loginItem(), openAtLogin: enabled, enabled });
}

/**
 * At startup, create the entry when it is missing (first run, or the app moved) without
 * touching an existing one, so a choice made in Task Manager's Startup tab is respected.
 */
export function syncLaunchAtLogin(enabled: boolean): void {
  if (!supported()) return;
  const item = loginItem();
  const current = app.getLoginItemSettings({ path: item.path, args: item.args });
  if (enabled && !current.openAtLogin) setLaunchAtLogin(true);
  if (!enabled && current.openAtLogin) setLaunchAtLogin(false);
}
