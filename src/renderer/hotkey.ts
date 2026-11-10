/** Keyboard event fields needed to build an Electron accelerator. */
export interface KeyInput {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const NAMED_CODES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  PrintScreen: 'PrintScreen',
};

function keyName(code: string): string | null {
  const letter = code.match(/^Key([A-Z])$/);
  if (letter) return letter[1];
  const digit = code.match(/^Digit([0-9])$/);
  if (digit) return digit[1];
  const numpad = code.match(/^Numpad([0-9])$/);
  if (numpad) return `num${numpad[1]}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_CODES[code] ?? null;
}

export type RecordedHotkey =
  | { kind: 'accelerator'; accelerator: string }
  | { kind: 'incomplete' }
  | { kind: 'cancel' };

/**
 * Translate a key press into an Electron accelerator. Modifier-only presses are incomplete;
 * a global shortcut needs at least one modifier unless it is a function key.
 */
export function acceleratorFromKey(input: KeyInput, isMac: boolean): RecordedHotkey {
  if (input.code === 'Escape' && !input.ctrlKey && !input.altKey && !input.metaKey) {
    return { kind: 'cancel' };
  }
  const key = keyName(input.code);
  if (!key) return { kind: 'incomplete' };
  const modifiers: string[] = [];
  if (isMac) {
    if (input.metaKey) modifiers.push('CommandOrControl');
    if (input.ctrlKey) modifiers.push('Control');
  } else {
    if (input.ctrlKey) modifiers.push('CommandOrControl');
    if (input.metaKey) modifiers.push('Super');
  }
  if (input.altKey) modifiers.push('Alt');
  if (input.shiftKey) modifiers.push('Shift');
  const functionKey = /^F\d+$/.test(key);
  if (!modifiers.length && !functionKey) return { kind: 'incomplete' };
  // Shift alone with a printable key would block normal typing everywhere.
  if (modifiers.length === 1 && modifiers[0] === 'Shift' && !functionKey) {
    return { kind: 'incomplete' };
  }
  return { kind: 'accelerator', accelerator: [...modifiers, key].join('+') };
}

const DISPLAY_NAMES: Record<string, { mac: string; other: string }> = {
  CommandOrControl: { mac: '⌘', other: 'Ctrl' },
  CmdOrCtrl: { mac: '⌘', other: 'Ctrl' },
  Command: { mac: '⌘', other: 'Cmd' },
  Cmd: { mac: '⌘', other: 'Cmd' },
  Control: { mac: '⌃', other: 'Ctrl' },
  Ctrl: { mac: '⌃', other: 'Ctrl' },
  Alt: { mac: '⌥', other: 'Alt' },
  Option: { mac: '⌥', other: 'Alt' },
  Shift: { mac: '⇧', other: 'Shift' },
  Super: { mac: '⌘', other: 'Win' },
  Meta: { mac: '⌘', other: 'Win' },
};

/** Split an accelerator into the key caps shown to the user. */
export function acceleratorKeys(accelerator: string, isMac: boolean): string[] {
  return accelerator
    .split('+')
    .filter(Boolean)
    .map((part) => DISPLAY_NAMES[part]?.[isMac ? 'mac' : 'other'] ?? part);
}

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
