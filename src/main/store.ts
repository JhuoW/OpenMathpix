import Store from 'electron-store';
import { safeStorage } from 'electron';
import type { AppSettings } from '../shared/types';
import { validateSettingsUpdates } from '../shared/settings';

const defaults = {
  ocrEngine: 'mfr' as const,
  mfrModelPath: '',
  apiUrl: '',
  pipeline: 'PP-StructureV3' as const,
  snipHotkey: 'CommandOrControl+Shift+S',
  defaultOutputFormat: 'latex' as const,
  historyLimit: 100,
  theme: 'system' as const,
  language: 'en' as const,
  afterSnip: 'window' as const,
  latexCopyStyle: 'plain' as const,
  cleanLatex: true,
  modelSource: 'huggingface' as const,
  encryptedToken: '',
};

type StoredSettings = Omit<AppSettings, 'accessToken'> & {
  encryptedToken: string;
  localMfrDefaultApplied?: boolean;
};
const store = new Store<StoredSettings>({ defaults });

// Earlier versions persisted PaddleOCR as a default, so changing `defaults`
// alone cannot fix their first launch after upgrading. Apply the local default
// once, keeping credentials and all other preferences; subsequent choices persist.
if (store.get('localMfrDefaultApplied') !== true) {
  store.set({ ocrEngine: 'mfr', localMfrDefaultApplied: true });
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
    // After the one-time migration, use the user's saved engine choice.
    ocrEngine: store.get('ocrEngine', 'mfr'),
    mfrModelPath: store.get('mfrModelPath', ''),
    apiUrl: store.get('apiUrl') as string,
    accessToken,
    pipeline: store.get('pipeline') as AppSettings['pipeline'],
    snipHotkey: store.get('snipHotkey') as string,
    defaultOutputFormat: store.get('defaultOutputFormat') as AppSettings['defaultOutputFormat'],
    historyLimit: store.get('historyLimit') as number,
    theme: store.get('theme') as AppSettings['theme'],
    language: store.get('language', 'en'),
    afterSnip: store.get('afterSnip', 'window'),
    latexCopyStyle: store.get('latexCopyStyle', 'plain'),
    cleanLatex: store.get('cleanLatex', true),
    modelSource: store.get('modelSource', 'huggingface'),
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
