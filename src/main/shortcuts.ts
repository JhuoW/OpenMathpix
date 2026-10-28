interface ShortcutRegistry {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
  isRegistered: (accelerator: string) => boolean;
}

/** Keep the working shortcut until both registration and persistence succeed. */
export function saveWithShortcut(
  previous: string,
  next: string,
  shortcuts: ShortcutRegistry,
  onSnip: () => void,
  persist: () => void,
): void {
  if (previous === next && shortcuts.isRegistered(next)) {
    persist();
    return;
  }
  let registered = false;
  try {
    registered = shortcuts.register(next, onSnip);
  } catch {
    throw new Error('Invalid snip hotkey. Use an accelerator such as CommandOrControl+Shift+S.');
  }
  if (!registered) throw new Error('This snip hotkey is unavailable. Choose a different shortcut.');
  try {
    persist();
  } catch (error) {
    shortcuts.unregister(next);
    throw error;
  }
  if (previous !== next) shortcuts.unregister(previous);
}
