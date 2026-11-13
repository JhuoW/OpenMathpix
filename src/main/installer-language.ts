import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../shared/types';

/**
 * Written to the resources folder by an interactive Setup (build/installer.nsh): the language
 * chosen on its first page, then a stamp unique to that installation. Silent installs, such
 * as in-app updates, remove it, so they never change the app's language.
 */
export const INSTALLER_LANGUAGE_FILE = 'installer-language';

export interface InstallerLanguage {
  language: AppSettings['language'];
  /** Identifies one installation, so its choice is applied only once. */
  stamp: string;
}

export function parseInstallerLanguage(text: string): InstallerLanguage | undefined {
  // Ignore a byte order mark (U+FEFF) at the start of the file.
  const content = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim();
  const language = content.split(/\r?\n/, 1)[0]?.trim();
  if (language !== 'en' && language !== 'zh-CN') return undefined;
  return { language, stamp: content.replace(/\r\n/g, '\n') };
}

export function readInstallerLanguage(resourcesPath: string): InstallerLanguage | undefined {
  try {
    return parseInstallerLanguage(
      fs.readFileSync(path.join(resourcesPath, INSTALLER_LANGUAGE_FILE), 'utf8'),
    );
  } catch {
    return undefined;
  }
}

/**
 * The settings change that applies a Setup language choice, or undefined when there is none
 * or it was already applied. A language picked in the app afterwards wins until the user
 * runs Setup again.
 */
export function installerLanguageUpdate(
  choice: InstallerLanguage | undefined,
  appliedStamp: string | undefined,
): { language: AppSettings['language']; installerLanguageApplied: string } | undefined {
  if (!choice || choice.stamp === appliedStamp) return undefined;
  return { language: choice.language, installerLanguageApplied: choice.stamp };
}
