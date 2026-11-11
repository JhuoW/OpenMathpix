import type { AppSettings, LocalOCREngine } from '../shared/types';
import { validateSettingsUpdates } from '../shared/settings';
import { isAbsolute } from 'node:path';
import type { CloudEngine } from './engine-configuration';

export interface PreparedModel {
  /** Commit only swaps already validated resources and must not throw. */
  commit(): void;
  dispose(): void;
}

export interface PreparedModelClear {
  recoveryPath?: string;
  commit(): Promise<void>;
  dispose(): Promise<void>;
}

interface SettingsDependencies {
  read(): AppSettings;
  assertModelDirectory?(directory: string): void;
  /** Atomically persist the patch and apply reversible preferences, or throw. */
  persist(updates: Partial<AppSettings>, verifiedEngine?: CloudEngine): void;
  prepareModel(
    directory?: string,
    options?: { allowMissingDefault?: boolean },
  ): Promise<PreparedModel>;
  prepareClearModel?(): Promise<PreparedModelClear>;
  prepareTextellerModel?(
    directory?: string,
    options?: { allowMissingDefault?: boolean },
  ): Promise<PreparedModel>;
  prepareClearTextellerModel?(): Promise<PreparedModelClear>;
  testCloud(settings: AppSettings): Promise<void>;
  validationStarted?(settings: AppSettings): void;
  validationFailed?(settings: AppSettings, error: unknown): void;
  changed(settings: AppSettings): void;
}

const recognitionKeys = [
  'ocrEngine',
  'mfrModelPath',
  'mfrModelEnabled',
  'mfrDownloadDirectory',
  'apiUrl',
  'accessToken',
  'pipeline',
  'textellerModelPath',
  'textellerModelEnabled',
  'textellerDownloadDirectory',
] as const;

/** Serialize recognition changes, while ordinary preferences can apply during network checks. */
export function createSettingsService(deps: SettingsDependencies) {
  let recognitionQueue: Promise<unknown> = Promise.resolve();

  async function apply(updates: Partial<AppSettings>, connect = false): Promise<AppSettings> {
    if (updates.mfrModelPath !== undefined) updates = { ...updates, mfrModelEnabled: true };
    if (updates.textellerModelPath !== undefined)
      updates = { ...updates, textellerModelEnabled: true };
    if (
      [updates.mfrDownloadDirectory, updates.textellerDownloadDirectory].some(
        (value) => value && !isAbsolute(value),
      )
    ) {
      throw new Error('Select an absolute local model folder path.');
    }
    for (const directory of [
      updates.mfrModelPath,
      updates.mfrDownloadDirectory,
      updates.textellerModelPath,
      updates.textellerDownloadDirectory,
    ]) {
      if (directory) deps.assertModelDirectory?.(directory);
    }
    const previous = deps.read();
    const next = { ...previous, ...updates };
    const prepared: PreparedModel[] = [];
    try {
      for (const engine of ['mfr', 'texteller'] as const) {
        const pathKey = `${engine}ModelPath` as const;
        const enabledKey = `${engine}ModelEnabled` as const;
        if (
          next[enabledKey] &&
          (updates[pathKey] !== undefined ||
            (next.ocrEngine === engine && updates.ocrEngine !== undefined))
        ) {
          const prepare = engine === 'mfr' ? deps.prepareModel : deps.prepareTextellerModel;
          if (!prepare) throw new Error('Local model setup is unavailable.');
          prepared.push(
            await prepare(next[pathKey] || undefined, {
              // Engine choice can precede installation. Imports/downloads and startup
              // revalidation of an already selected local engine remain strict.
              allowMissingDefault:
                previous.ocrEngine !== engine &&
                next.ocrEngine === engine &&
                updates[pathKey] === undefined &&
                !next[pathKey],
            }),
          );
        }
      }
      const cloudChanged =
        next.ocrEngine === 'paddleocr' &&
        (previous.ocrEngine !== next.ocrEngine ||
          ['apiUrl', 'accessToken', 'pipeline'].some(
            (key) => next[key as keyof AppSettings] !== previous[key as keyof AppSettings],
          ));
      if (cloudChanged && !connect)
        throw new Error('Use Connect & Use to validate and enable this engine.');
      if (connect && next.ocrEngine === 'paddleocr') {
        if (!next.apiUrl) throw new Error('Enter an API URL before enabling PaddleOCR.');
        deps.validationStarted?.(next);
        await deps.testCloud(next);
      }
      // Save a patch, not the snapshot from before await: a theme/shortcut may have changed.
      deps.persist(updates, connect && next.ocrEngine === 'paddleocr' ? next.ocrEngine : undefined);
      for (const model of prepared) model.commit();
      const saved = deps.read();
      deps.changed(saved);
      return saved;
    } catch (error) {
      if (connect && next.ocrEngine === 'paddleocr') deps.validationFailed?.(next, error);
      throw error;
    } finally {
      for (const model of prepared) model.dispose();
    }
  }

  return {
    connect(input: unknown): Promise<AppSettings> {
      let updates: Partial<AppSettings>;
      try {
        updates = validateSettingsUpdates(input);
      } catch (error) {
        return Promise.reject(error);
      }
      const task = recognitionQueue.then(() => apply(updates, true));
      recognitionQueue = task.catch(() => {});
      return task;
    },
    clearModel(engine: LocalOCREngine = 'mfr'): Promise<AppSettings> {
      const task = recognitionQueue.then(async () => {
        const prepare = engine === 'mfr' ? deps.prepareClearModel : deps.prepareClearTextellerModel;
        if (!prepare) throw new Error('Model cache cleanup is unavailable.');
        const prepared = await prepare();
        const pathKey = `${engine}ModelPath` as const;
        const enabledKey = `${engine}ModelEnabled` as const;
        let persisted = false;
        try {
          deps.persist({ [pathKey]: '', [enabledKey]: false });
          persisted = true;
          // commit deactivates the model before deleting the staged cache. A deletion
          // failure must not reactivate an installation whose files may be incomplete.
          try {
            await prepared.commit();
          } catch (error) {
            // Preserve the failed removal target for an explicit retry, while keeping
            // recognition disabled even after a restart with partially removed files.
            if (prepared.recoveryPath)
              deps.persist({ [pathKey]: prepared.recoveryPath, [enabledKey]: false });
            throw error;
          }
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
