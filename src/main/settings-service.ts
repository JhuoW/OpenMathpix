import type { AppSettings } from '../shared/types';
import { validateSettingsUpdates } from '../shared/settings';

export interface PreparedModel {
  /** Commit only swaps already validated resources and must not throw. */
  commit(): void;
  dispose(): void;
}

export interface PreparedModelClear {
  commit(): Promise<void>;
  dispose(): Promise<void>;
}

interface SettingsDependencies {
  read(): AppSettings;
  /** Atomically persist the patch and apply reversible preferences, or throw. */
  persist(updates: Partial<AppSettings>): void;
  prepareModel(
    directory?: string,
    options?: { allowMissingDefault?: boolean },
  ): Promise<PreparedModel>;
  prepareClearModel?(): Promise<PreparedModelClear>;
  testCloud(settings: AppSettings): Promise<void>;
  changed(settings: AppSettings): void;
}

const recognitionKeys = ['ocrEngine', 'mfrModelPath', 'apiUrl', 'accessToken', 'pipeline'] as const;

/** Serialize recognition changes, while ordinary preferences can apply during network checks. */
export function createSettingsService(deps: SettingsDependencies) {
  let recognitionQueue: Promise<unknown> = Promise.resolve();

  async function apply(updates: Partial<AppSettings>): Promise<AppSettings> {
    const previous = deps.read();
    const next = { ...previous, ...updates };
    let prepared: PreparedModel | undefined;
    try {
      if (
        updates.mfrModelPath !== undefined ||
        (next.ocrEngine === 'mfr' && updates.ocrEngine !== undefined)
      ) {
        prepared = await deps.prepareModel(next.mfrModelPath || undefined, {
          // Engine choice can precede installation. Imports/downloads and startup
          // revalidation of an already selected local engine remain strict.
          allowMissingDefault:
            previous.ocrEngine !== 'mfr' &&
            next.ocrEngine === 'mfr' &&
            updates.mfrModelPath === undefined &&
            !next.mfrModelPath,
        });
      }
      if (
        next.ocrEngine === 'paddleocr' &&
        (previous.ocrEngine !== 'paddleocr' ||
          ['apiUrl', 'accessToken', 'pipeline'].some(
            (key) => next[key as keyof AppSettings] !== previous[key as keyof AppSettings],
          ))
      ) {
        if (!next.apiUrl) throw new Error('Enter an API URL before enabling PaddleOCR.');
        await deps.testCloud(next);
      }

      // Save a patch, not the snapshot from before await: a theme/shortcut may have changed.
      deps.persist(updates);
      prepared?.commit();
      const saved = deps.read();
      deps.changed(saved);
      return saved;
    } finally {
      prepared?.dispose();
    }
  }

  return {
    clearModel(): Promise<AppSettings> {
      const task = recognitionQueue.then(async () => {
        if (!deps.prepareClearModel) throw new Error('Model cache cleanup is unavailable.');
        const prepared = await deps.prepareClearModel();
        let persisted = false;
        try {
          deps.persist({ mfrModelPath: '' });
          persisted = true;
          // commit deactivates the model before deleting the staged cache. A deletion
          // failure must not reactivate an installation whose files may be incomplete.
          await prepared.commit();
          return deps.read();
        } finally {
          await prepared.dispose();
          if (persisted) deps.changed(deps.read());
        }
      });
      recognitionQueue = task.catch(() => {});
      return task;
    },
    update(input: unknown): Promise<AppSettings> {
      let updates: Partial<AppSettings>;
      try {
        updates = validateSettingsUpdates(input);
      } catch (error) {
        return Promise.reject(error);
      }
      if (!Object.keys(updates).length) return Promise.resolve(deps.read());
      if (!recognitionKeys.some((key) => key in updates)) return apply(updates);
      const task = recognitionQueue.then(() => apply(updates));
      recognitionQueue = task.catch(() => {});
      return task;
    },
  };
}
