import { useState } from 'react';
import type { LocalOCREngine, MfrStatus, ModelTestResult } from '../../shared/types';
import { useAppStore } from '../store';
import { localModelInstalled, settingsSession } from '../settings-session';
import { cleanSettingsError } from '../settings-autosave';
import { useI18n } from './useI18n';

/** Must match DOWNLOAD_CANCELLED in src/services/mfr-model.ts (not importable here). */
const DOWNLOAD_CANCELLED = 'Model download cancelled.';

export const LOCAL_MODELS: Record<
  LocalOCREngine,
  { name: string; sizeMb: number; files: string[] }
> = {
  mfr: {
    name: 'MFR-1.5',
    sizeMb: 120,
    files: [
      'encoder_model.onnx',
      'decoder_model.onnx',
      'config.json',
      'generation_config.json',
      'preprocessor_config.json',
      'special_tokens_map.json',
      'tokenizer.json',
      'tokenizer_config.json',
    ],
  },
  texteller: {
    name: 'TexTeller',
    sizeMb: 320,
    // The two ONNX files live in the repository's onnx/ folder; install all six side by side.
    files: [
      'onnx/encoder_model_int8.onnx',
      'onnx/decoder_model_merged_int8.onnx',
      'config.json',
      'generation_config.json',
      'preprocessor_config.json',
      'tokenizer.json',
    ],
  },
};

const BUSY: MfrStatus['state'][] = ['downloading', 'validating', 'loading', 'clearing'];

function api(engine: LocalOCREngine) {
  return engine === 'mfr'
    ? {
        download: window.api.downloadMfrModel,
        select: window.api.selectMfrModel,
        clear: window.api.clearMfrModel,
        chooseDirectory: window.api.selectMfrDownloadDirectory,
        status: window.api.getMfrStatus,
        openPage: window.api.openMfrModelPage,
      }
    : {
        download: window.api.downloadTextellerModel,
        select: window.api.selectTextellerModel,
        clear: window.api.clearTextellerModel,
        chooseDirectory: window.api.selectTextellerDownloadDirectory,
        status: window.api.getTextellerStatus,
        openPage: window.api.openTextellerModelPage,
      };
}

export type ModelOperation = 'download' | 'select' | 'clear' | 'location' | 'test';

/**
 * Everything a page needs to install, test or remove one local model. Each model is managed
 * on its own: downloading or removing one never changes the engine in use, except that the
 * engine the user is setting up becomes active once its model works, and removing the
 * model in use falls back to the other installed model.
 */
export function useLocalModel(engine: LocalOCREngine) {
  const { t } = useI18n();
  const status = useAppStore((state) =>
    engine === 'mfr' ? state.mfrStatus : state.textellerStatus,
  );
  const settings = useAppStore((state) => state.settings);
  const isRecognizing = useAppStore((state) => state.isRecognizing);
  const checking = useAppStore((state) => state.engineStatuses?.[engine].state === 'checking');
  const { showToast, setSettings } = useAppStore.getState();
  const [operation, setOperation] = useState<ModelOperation | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ModelTestResult | null>(null);
  const info = LOCAL_MODELS[engine];
  const calls = api(engine);
  const pathKey = engine === 'mfr' ? 'mfrModelPath' : 'textellerModelPath';
  const enabledKey = engine === 'mfr' ? 'mfrModelEnabled' : 'textellerModelEnabled';
  const directoryKey = engine === 'mfr' ? 'mfrDownloadDirectory' : 'textellerDownloadDirectory';
  const modelPath = settings?.[pathKey] || '';
  const busy = operation !== null || checking || (!!status && BUSY.includes(status.state));
  const disabled = busy || isRecognizing || !status;
  const ready = !!settings?.[enabledKey] && status?.state === 'ready';
  const installed = ready || !!modelPath || (status?.downloadedBytes ?? 0) > 0;
  /** Part of the model was downloaded before a cancel or interruption; it can resume. */
  const resumable =
    !ready && status?.state === 'not-downloaded' && (status.downloadedBytes ?? 0) > 0;
  const imported = status?.managed === false && !!(modelPath || status?.modelPath);
  const error = operationError || status?.error;
  const progress =
    status?.state === 'downloading' && status.totalBytes > 0
      ? Math.min(100, (status.downloadedBytes / status.totalBytes) * 100)
      : undefined;

  const setStatus = (fresh: MfrStatus) => {
    if (engine === 'mfr') useAppStore.getState().setMfrStatus(fresh);
    else useAppStore.getState().setTextellerStatus(fresh);
  };

  const keep = (fresh: Awaited<ReturnType<typeof calls.download>>, ...keys: string[]) => {
    const current = useAppStore.getState().settings;
    setSettings({
      ...fresh,
      ...current,
      ...Object.fromEntries(keys.map((key) => [key, fresh[key as keyof typeof fresh]])),
    });
  };

  async function run(kind: ModelOperation, task: () => Promise<void>) {
    if (kind === 'test' ? !!operation || isRecognizing || !ready : disabled) return;
    setOperation(kind);
    setOperationError(null);
    try {
      await task();
    } catch (err) {
      const message = cleanSettingsError(err);
      // Cancelling is the user's choice, not a failure; the files received so far are kept.
      if (message === DOWNLOAD_CANCELLED)
        showToast(t('Download cancelled. Download again to continue where it stopped.'), 5000);
      else setOperationError(message);
    } finally {
      setOperation(null);
    }
  }

  /** Download or import; the model is verified, loaded and, if being set up, activated. */
  const configure = (action: 'download' | 'select', options: { quiet?: boolean } = {}) =>
    run(action, async () => {
      const fresh = action === 'select' ? await calls.select() : await calls.download();
      if (!fresh) return; // The native directory picker was cancelled.
      keep(fresh, pathKey, enabledKey);
      // The engine applies on selection only with an installed model: record it first.
      setStatus(await calls.status());
      // Activate only the engine the user is setting up, never one managed in passing.
      const settingUp = settingsSession.getSnapshot().draft?.ocrEngine === engine;
      if (settingUp) settingsSession.edit('ocrEngine', engine, true);
      if (options.quiet) return;
      showToast(
        settingUp
          ? t('Model setup complete. Click New Snip in the top-right corner to start.')
          : t('{model} is installed. Choose it under Recognition Engine to use it.', {
              model: info.name,
            }),
        7000,
      );
    });

  /** Uninstall a downloaded model, or disconnect an imported folder (its files are kept). */
  const remove = () =>
    run('clear', async () => {
      const wasImported = imported;
      const fresh = await calls.clear();
      if (!fresh) return;
      keep(fresh, pathKey, enabledKey);
      setStatus(await calls.status());
      setTestResult(null);
      const snapshot = settingsSession.getSnapshot();
      // Keep snipping working: after removing the model in use, switch to the other
      // installed local model instead of leaving no usable engine.
      const other: LocalOCREngine = engine === 'mfr' ? 'texteller' : 'mfr';
      if (snapshot.applied?.ocrEngine === engine && localModelInstalled(other)) {
        settingsSession.edit('ocrEngine', other, true);
        showToast(
          t(
            wasImported
              ? 'Model disconnected. Switched to {model}.'
              : 'Model uninstalled. Switched to {model}.',
            { model: LOCAL_MODELS[other].name },
          ),
          5000,
        );
        return;
      }
      // Clearing a bad installation can unblock the user's failed engine choice.
      // An already active local engine must stay unloaded until a model is installed.
      if (
        snapshot.draft?.ocrEngine === engine &&
        snapshot.applied?.ocrEngine !== engine &&
        snapshot.errors.recognition
      ) {
        settingsSession.edit('ocrEngine', engine, true);
      }
      showToast(
        wasImported
          ? 'Model disconnected. Your files were kept.'
          : 'Local model uninstalled. Download or import a model to use it again.',
      );
    });

  const chooseLocation = () =>
    run('location', async () => {
      const fresh = await calls.chooseDirectory();
      if (!fresh) return;
      keep(fresh, directoryKey, pathKey, enabledKey);
      setStatus(await calls.status());
    });

  /** Recognize the bundled sample formula; nothing is added to history. */
  const test = () =>
    run('test', async () => {
      setTestResult(null);
      setTestResult(await window.api.testLocalModel(engine));
    });

  const openFolder = () =>
    window.api.openModelFolder(engine).catch((err) => setOperationError(cleanSettingsError(err)));
  const cancelDownload = () => void window.api.cancelModelDownload(engine).catch(() => undefined);
  const openPage = () =>
    calls.openPage().catch((err) => setOperationError(cleanSettingsError(err)));

  return {
    engine,
    info,
    status,
    operation,
    checking,
    busy,
    disabled,
    ready,
    installed,
    imported,
    error,
    progress,
    modelPath: modelPath || status?.modelPath || '',
    downloadDirectory: settings?.[directoryKey] || '',
    resumable,
    testResult,
    clearTestResult: () => setTestResult(null),
    configure,
    remove,
    chooseLocation,
    test,
    openFolder,
    openPage,
    cancelDownload,
  };
}

export type LocalModelController = ReturnType<typeof useLocalModel>;
