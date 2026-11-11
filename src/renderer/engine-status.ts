import type { AppSettings, EngineStatuses, MfrStatus, OCREngine } from '../shared/types';

/** A saved selection alone does not mean its recognizer can run. */
export function engineIsActive(
  engine: OCREngine,
  settings: Pick<AppSettings, 'ocrEngine' | 'mfrModelEnabled' | 'textellerModelEnabled'> | null,
  statuses: EngineStatuses | null,
  model: MfrStatus | null,
  textellerModel: MfrStatus | null = null,
): boolean {
  if (settings?.ocrEngine !== engine || statuses?.[engine].state !== 'ready') return false;
  if (engine === 'paddleocr') return true;
  const selectedModel = engine === 'mfr' ? model : textellerModel;
  const enabled = engine === 'mfr' ? settings.mfrModelEnabled : settings.textellerModelEnabled;
  return enabled && selectedModel?.state === 'ready' && selectedModel.operational === true;
}
