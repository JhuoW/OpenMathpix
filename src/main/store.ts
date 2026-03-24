import Store from 'electron-store';
import { safeStorage } from 'electron';
import type { AppSettings } from '../shared/types';

const defaults = {
  apiUrl: '',
  pipeline: 'PP-StructureV3' as const,
  snipHotkey: 'CommandOrControl+Shift+S',
  defaultOutputFormat: 'latex' as const,
  historyLimit: 100,
  theme: 'system' as const,
  encryptedToken: '',
};

const store = new Store({ defaults });

export function getSettings(): AppSettings {
  let accessToken = '';
  const encrypted = store.get('encryptedToken') as string;
  if (encrypted && safeStorage.isEncryptionAvailable()) {
    try {
      accessToken = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      accessToken = '';
    }
  }
  return {
    apiUrl: store.get('apiUrl') as string,
    accessToken,
    pipeline: store.get('pipeline') as AppSettings['pipeline'],
    snipHotkey: store.get('snipHotkey') as string,
    defaultOutputFormat: store.get('defaultOutputFormat') as AppSettings['defaultOutputFormat'],
    historyLimit: store.get('historyLimit') as number,
    theme: store.get('theme') as AppSettings['theme'],
  };
}

export function setSettings(updates: Partial<AppSettings>): void {
  if (updates.accessToken !== undefined) {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(updates.accessToken);
      store.set('encryptedToken', buf.toString('base64'));
    }
  }
  const { accessToken: _, ...rest } = updates;
  for (const [key, value] of Object.entries(rest)) {
    store.set(key, value);
  }
}
