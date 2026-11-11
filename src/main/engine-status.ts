import { BrowserWindow } from 'electron';
import { IPC, type AppSettings, type EngineStatuses, type EngineStatus } from '../shared/types';
import { cloudConfigurationFingerprint, type CloudEngine } from './engine-configuration';
import { getSettings, isCloudConfigurationVerified } from './store';
import { localModels } from './mfr';

const runtime: Partial<Record<CloudEngine, { fingerprint: string; status: EngineStatus }>> = {};
let broadcastRevision = 0;

export async function getEngineStatuses(): Promise<EngineStatuses> {
  const statuses: EngineStatuses = {
    mfr: { state: 'inactive' },
    paddleocr: { state: 'inactive' },
    texteller: { state: 'inactive' },
  };
  await Promise.all(
    (['mfr', 'texteller'] as const).map(async (engine) => {
      try {
        const model = await localModels[engine].getStatus();
        statuses[engine] = {
          state: ['loading', 'validating', 'downloading', 'clearing'].includes(model.state)
            ? 'checking'
            : model.state === 'ready' && model.operational
              ? 'ready'
              : model.state === 'error'
                ? 'error'
                : 'inactive',
          error: model.error,
        };
      } catch {
        statuses[engine] = { state: 'error' };
      }
    }),
  );
  // Model inspection can await disk I/O; cloud settings may have committed meanwhile.
  const settings = getSettings();
  for (const engine of ['paddleocr'] as const) {
    const current = runtime[engine];
    const configured = Boolean(settings.apiUrl);
    if (current?.fingerprint === cloudConfigurationFingerprint(settings, engine)) {
      statuses[engine] = current.status;
    } else if (configured && isCloudConfigurationVerified(settings, engine)) {
      statuses[engine] = { state: 'ready' };
    }
  }
  return statuses;
}

export function cloudEngineStatus(settings: AppSettings, status: EngineStatus): void {
  if (settings.ocrEngine !== 'paddleocr') return;
  runtime[settings.ocrEngine] = {
    fingerprint: cloudConfigurationFingerprint(settings, settings.ocrEngine),
    status,
  };
  void broadcastEngineStatuses();
}

export async function broadcastEngineStatuses(): Promise<void> {
  const revision = ++broadcastRevision;
  const statuses = await getEngineStatuses();
  if (revision !== broadcastRevision) return;
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (!window.isDestroyed()) window.webContents.send(IPC.ENGINE_STATUSES_CHANGED, statuses);
    } catch {
      /* A closing renderer cannot roll back a saved configuration. */
    }
  }
}
