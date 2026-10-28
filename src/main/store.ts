import Store from 'electron-store';
import { safeStorage } from 'electron';
import type { AppSettings } from '../shared/types';
import { validateSettingsUpdates } from '../shared/settings';

const defaults = {
  apiUrl: '',
  pipeline: 'PP-StructureV3' as const,
  snipHotkey: 'CommandOrControl+Shift+S',
  defaultOutputFormat: 'latex' as const,
  historyLimit: 100,
  theme: 'system' as const,
  encryptedToken: '',
};

type StoredSettings = Omit<AppSettings, 'accessToken' | 'ocrEngine'> & {
  encryptedToken: string;
  ocrEngine?: AppSettings['ocrEngine'];
};
const store = new Store<StoredSettings>({ defaults });
// Persist this migration once: clearing a cloud URL later must not switch engines.
if (!store.has('ocrEngine')) {
  store.set('ocrEngine', store.get('apiUrl') ? 'paddleocr' : 'mfr');
}

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
    // Existing cloud users retain their provider; new installations start locally.
    ocrEngine: store.get('ocrEngine', store.get('apiUrl') ? 'paddleocr' : 'mfr'),
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
  const { accessToken, ...rest } = validateSettingsUpdates(updates);
  const values: Record<string, unknown> = { ...rest };
  if (accessToken !== undefined) {
    if (!accessToken) {
      values.encryptedToken = '';
    } else {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          'Secure token storage is unavailable. Enable your system keyring and try again.',
        );
      }
      values.encryptedToken = safeStorage.encryptString(accessToken).toString('base64');
    }
  }
  // Write the validated update in one operation, including the encrypted token.
  store.set(values);
}
