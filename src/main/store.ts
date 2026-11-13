import Store from 'electron-store';
import { safeStorage } from 'electron';
import type { AppSettings } from '../shared/types';
import { validateSettingsUpdates } from '../shared/settings';
import { cloudConfigurationFingerprint, type CloudEngine } from './engine-configuration';
import { installerLanguageUpdate, type InstallerLanguage } from './installer-language';

const defaults = {
  ocrEngine: 'mfr' as const,
  mfrModelPath: '',
  mfrModelEnabled: true,
  mfrDownloadDirectory: '',
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
  launchAtLogin: true,
  encryptedToken: '',
  textellerModelPath: '',
  textellerModelEnabled: true,
  textellerDownloadDirectory: '',
  verifiedCloudConfigurations: {} as Partial<Record<CloudEngine, string>>,
};

type StoredSettings = Omit<AppSettings, 'accessToken'> & {
  encryptedToken: string;
  verifiedCloudConfigurations: Partial<Record<CloudEngine, string>>;
  localMfrDefaultApplied?: boolean;
  trayHintShown?: boolean;
  installerLanguageApplied?: string;
};
const store = new Store<StoredSettings>({ defaults });

/** Start in the language chosen in Setup, once per installation. */
export function applyInstallerLanguage(choice: InstallerLanguage | undefined): boolean {
  const update = installerLanguageUpdate(choice, store.get('installerLanguageApplied'));
  if (!update) return false;
  try {
    store.set(update);
  } catch {
    // A read-only profile keeps its current language rather than failing to start.
    return false;
  }
  return true;
}

/**
 * Whether the user has been told once that closing the window keeps OpenMathpix running
 * in the notification area. Returns true the first time and records it.
 */
export function takeFirstTrayHint(): boolean {
  if (store.get('trayHintShown') === true) return false;
  try {
    store.set('trayHintShown', true);
  } catch {
    // A read-only profile must not prevent closing the window.
  }
  return true;
}

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
    // After the one-time migration, use the user's saved engine choice. An engine this
    // version does not ship (e.g. from a pre-release build) falls back to the default.
    ocrEngine: (['mfr', 'paddleocr', 'texteller'] as const).includes(store.get('ocrEngine', 'mfr'))
      ? store.get('ocrEngine', 'mfr')
      : 'mfr',
    mfrModelPath: store.get('mfrModelPath', ''),
    mfrModelEnabled: store.get('mfrModelEnabled', true),
    mfrDownloadDirectory: store.get('mfrDownloadDirectory', ''),
    apiUrl: store.get('apiUrl') as string,
    accessToken,
    textellerModelPath: store.get('textellerModelPath', ''),
    textellerModelEnabled: store.get('textellerModelEnabled', true),
    textellerDownloadDirectory: store.get('textellerDownloadDirectory', ''),
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
    launchAtLogin: store.get('launchAtLogin', true),
  };
}

export function isCloudConfigurationVerified(settings: AppSettings, engine: CloudEngine): boolean {
  return (
    store.get('verifiedCloudConfigurations', {})[engine] ===
    cloudConfigurationFingerprint(settings, engine)
  );
}

export function setSettings(updates: Partial<AppSettings>, verifiedEngine?: CloudEngine): void {
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
  if (verifiedEngine) {
    values.verifiedCloudConfigurations = {
      ...store.get('verifiedCloudConfigurations', {}),
      [verifiedEngine]: cloudConfigurationFingerprint(
        { ...getSettings(), ...updates },
        verifiedEngine,
      ),
    };
  }
  // Write the validated update in one operation, including the encrypted token.
  store.set(values);
}
