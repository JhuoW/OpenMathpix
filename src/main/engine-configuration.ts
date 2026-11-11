import { createHash } from 'node:crypto';
import type { AppSettings } from '../shared/types';

export type CloudEngine = 'paddleocr';

/** Remember successful validation without storing a second plaintext copy of credentials. */
export function cloudConfigurationFingerprint(settings: AppSettings, engine: CloudEngine): string {
  const values = [engine, settings.apiUrl, settings.accessToken, settings.pipeline];
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}
