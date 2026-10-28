import type { AppSettings } from './types';

/** Validate at the IPC boundary as well as in the settings form. */
export function validateSettingsUpdates(input: unknown): Partial<AppSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid settings.');
  }
  const updates: Partial<AppSettings> = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case 'ocrEngine':
        if (value !== 'mfr' && value !== 'paddleocr') throw new Error('Unsupported OCR engine.');
        updates.ocrEngine = value;
        break;
      case 'apiUrl': {
        if (typeof value !== 'string') throw new Error('API URL must be text.');
        const url = value.trim();
        if (url) {
          let parsed: URL;
          try {
            parsed = new URL(url);
          } catch {
            throw new Error('Enter a valid HTTP or HTTPS API URL.');
          }
          if (
            !['http:', 'https:'].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password ||
            parsed.hash
          ) {
            throw new Error('Enter an HTTP or HTTPS API URL without credentials or a fragment.');
          }
        }
        updates.apiUrl = url;
        break;
      }
      case 'accessToken':
        if (typeof value !== 'string') throw new Error('Access Token must be text.');
        updates.accessToken = value.trim();
        break;
      case 'snipHotkey':
        if (typeof value !== 'string' || !value.trim())
          throw new Error('Snip Hotkey cannot be empty.');
        updates.snipHotkey = value.trim();
        break;
      case 'pipeline':
        if (
          !['PP-OCRv5', 'PP-StructureV3', 'PaddleOCR-VL', 'PaddleOCR-VL-1.5'].includes(
            value as string,
          )
        ) {
          throw new Error('Unsupported OCR pipeline.');
        }
        updates.pipeline = value as AppSettings['pipeline'];
        break;
      case 'defaultOutputFormat':
        if (!['latex', 'markdown', 'text'].includes(value as string))
          throw new Error('Unsupported output format.');
        updates.defaultOutputFormat = value as AppSettings['defaultOutputFormat'];
        break;
      case 'theme':
        if (!['light', 'dark', 'system'].includes(value as string))
          throw new Error('Unsupported theme.');
        updates.theme = value as AppSettings['theme'];
        break;
      case 'historyLimit':
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 10 || value > 500) {
          throw new Error('History Limit must be a whole number between 10 and 500.');
        }
        updates.historyLimit = value;
        break;
      default:
        throw new Error(`Unknown setting: ${key}`);
    }
  }
  return updates;
}
