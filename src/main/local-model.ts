import { app, BrowserWindow, net, utilityProcess } from 'electron';
import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { LocalOCREngine, MfrStatus, OCRResult, ModelSource } from '../shared/types';
import {
  DOWNLOAD_CANCELLED,
  MfrModelManager,
  validateMfrDirectory,
  type FetchModel,
  type ModelFile,
} from '../services/mfr-model';
import { MFR_TEST_IMAGE } from '../shared/mfr-test-image';
import { getSettings } from './store';
import { MfrSession } from './mfr-session';
import { cleanLatex } from '../shared/latex-format';
import { assertModelOutsideInstallation } from './model-location';
import { dirname } from 'node:path';
import {
  isManagedDownload,
  registerManagedDownload,
  removeManagedDownload,
} from './managed-downloads';

export interface LocalModelConfig {
  engine: LocalOCREngine;
  folder: string;
  label: string;
  revision: string;
  files: readonly ModelFile[];
  channel: string;
  fileUrl(file: ModelFile, source: ModelSource): string;
  downloadGuide?: string;
}

export interface PreparedMfrModel {
  commit(): void;
  dispose(): void;
}
export interface PreparedClearMfrModel {
  recoveryPath?: string;
  commit(): Promise<void>;
  dispose(): Promise<void>;
}

/** Identical lifecycle and file safety for both local recognizers; each owns its own state. */
export function createLocalModel(config: LocalModelConfig) {
  const validateModel = (directory: string) =>
    validateMfrDirectory(directory, config.files, config.label);
  function newManager(directory: string, onStatus?: (status: MfrStatus) => void): MfrModelManager {
    return new MfrModelManager(directory, onStatus, config.files, fetchModel, {
      label: config.label,
      downloadGuide: config.downloadGuide,
    });
  }
  let manager: MfrModelManager | undefined;
  let session: MfrSession | undefined;
  let downloadManager: MfrModelManager | undefined;
  let status: MfrStatus | undefined;
  let changingModel = false;
  let recognizing = false;
  let clearingModel = false;
  let operational = false;
  let managed = false;
  let failedRemovalPath: string | undefined;
  const sessions = new Set<MfrSession>();

  function defaultDirectory(): string {
    return mfrDownloadDirectory();
  }

  function downloadRoot(): string {
    return getSettings()[`${config.engine}DownloadDirectory`] || app.getPath('userData');
  }

  function mfrDownloadDirectory(): string {
    const root = downloadRoot();
    if (!isAbsolute(root)) throw new Error('Select an absolute local model folder path.');
    return join(root, 'models', config.folder, config.revision);
  }

  function publish(next: MfrStatus): void {
    const snapshot = { ...next, operational, managed, downloadDirectory: mfrDownloadDirectory() };
    // Status consumers query engine readiness after an event. Do not emit another
    // event for that identical snapshot (especially while the model is disabled).
    const unchanged =
      status &&
      Object.keys({ ...status, ...snapshot }).every(
        (key) => status![key as keyof MfrStatus] === snapshot[key as keyof MfrStatus],
      );
    status = snapshot;
    if (unchanged) return;
    for (const win of BrowserWindow.getAllWindows()) {
      // A window closing during activation must not turn a committed setting into an error.
      try {
        if (!win.isDestroyed()) win.webContents.send(config.channel, status);
      } catch {
        // The next window reads the current status through IPC.
      }
    }
  }

  /** Chromium networking follows the operating system proxy, including Windows PAC settings. */
  const fetchModel: FetchModel = async (file, signal, start = 0) => {
    const connectTimeout = new AbortController();
    const timer = setTimeout(() => connectTimeout.abort(), 60_000);
    try {
      const response = await net.fetch(config.fileUrl(file, getSettings().modelSource), {
        signal: AbortSignal.any([signal, connectTimeout.signal]),
        // Resume an interrupted download from where it stopped.
        headers: start > 0 ? { Range: `bytes=${start}-` } : undefined,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Model download failed (HTTP ${response.status}): ${file.name}.`);
      }
      const resumed =
        response.status === 206 &&
        (response.headers.get('content-range') ?? '').startsWith(`bytes ${start}-`);
      return {
        body: Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
        start: resumed ? start : 0,
      };
    } catch (error) {
      if (connectTimeout.signal.aborted) throw new Error('Model server connection timed out.');
      throw error;
    } finally {
      // Only the connection/response headers have a 60 second deadline. The manager
      // retains its overall ten minute deadline while the model body is streaming.
      clearTimeout(timer);
    }
  };

  function getMfrManager(): MfrModelManager {
    const directory = getSettings()[`${config.engine}ModelPath`] || defaultDirectory();
    // Choosing a storage location before installing a model changes the implicit
    // default. Discard the old missing-directory snapshot so verification/restart
    // and the current process all inspect the same location.
    if (manager && !changingModel && resolve(manager.directory) !== resolve(directory)) {
      session?.retire();
      session = undefined;
      manager = undefined;
      status = undefined;
      operational = false;
      managed = false;
    }
    manager ??= newManager(directory);
    return manager;
  }

  async function getMfrStatus(): Promise<MfrStatus> {
    if (failedRemovalPath && !getSettings()[`${config.engine}ModelEnabled`] && status)
      return { ...status };
    const activeManager = getMfrManager();
    if (!getSettings()[`${config.engine}ModelEnabled`] && !changingModel) {
      operational = false;
      const retainedPath = getSettings()[`${config.engine}ModelPath`];
      managed = !!retainedPath && (await isManagedDownload(app.getPath('userData'), retainedPath));
      publish(
        managed
          ? {
              state: 'error',
              downloadedBytes: 0,
              totalBytes: 0,
              modelPath: retainedPath,
              error: 'Model removal was incomplete. Retry Uninstall Model in Settings.',
            }
          : { state: 'not-downloaded', downloadedBytes: 0, totalBytes: 0 },
      );
      return { ...status! };
    }
    if (!status) {
      const initial = await activeManager.getStatus();
      managed = await isManagedDownload(app.getPath('userData'), activeManager.directory);
      // A previously selected directory disappearing is a repairable error, not a first install.
      if (
        initial.state !== 'ready' &&
        !(await interruptedDownload(activeManager.directory)) &&
        (getSettings()[`${config.engine}ModelPath`] ||
          !(await defaultModelIsMissing(activeManager.directory)))
      ) {
        try {
          await validateModel(activeManager.directory);
        } catch (error) {
          initial.state = 'error';
          initial.modelPath = activeManager.directory;
          initial.error =
            error instanceof Error ? error.message : 'Could not load the selected model.';
        }
      }
      if (!status) publish(initial);
    }
    return { ...status!, downloadDirectory: mfrDownloadDirectory() };
  }

  function createSession(directory: string): MfrSession {
    const next = new MfrSession(
      directory,
      () => {
        const child = utilityProcess.fork(join(__dirname, 'mfr-worker.js'), [config.engine], {
          serviceName: `OpenMathpix ${config.label}`,
          stdio: 'ignore',
        });
        const exited = new Promise<void>((done) => {
          child.once('exit', () => done());
          child.once('error', () => done());
        });
        return {
          send: (request) => child.postMessage(request),
          kill: () => {
            child.kill();
          },
          onMessage: (listener) => {
            child.on('message', listener);
          },
          onFailure: (listener) => {
            child.on('error', () =>
              listener(new Error('The local model process failed to start.')),
            );
            child.once('exit', () =>
              listener(new Error('The local model process exited. Please retry.')),
            );
          },
          waitForExit: async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                exited,
                new Promise<never>((_, reject) => {
                  timer = setTimeout(
                    () =>
                      reject(new Error('The local model process has not exited. Please retry.')),
                    5000,
                  );
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          },
        };
      },
      () => sessions.delete(next),
      90_000,
      { engine: config.label, revision: config.revision },
    );
    sessions.add(next);
    return next;
  }

  /** A cancelled or interrupted download leaves `.part` files; it resumes, it is not broken. */
  async function interruptedDownload(directory: string): Promise<boolean> {
    try {
      return (await readdir(directory)).some((name) => name.endsWith('.part'));
    } catch {
      return false;
    }
  }

  async function defaultModelIsMissing(directory: string): Promise<boolean> {
    try {
      const entry = await lstat(directory);
      // Only an absent or empty managed directory means installation has not started.
      // Existing model files, symlinks and unreadable folders must still be validated.
      return entry.isDirectory() && (await readdir(directory)).length === 0;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw error;
    }
  }

  /** Prepare independently; callers persist settings before the non-failing commit. */
  async function prepareMfrModel(
    directory?: string,
    options: { allowMissingDefault?: boolean } = {},
  ): Promise<PreparedMfrModel> {
    if (changingModel) throw new Error('Another model operation is in progress. Please wait.');
    const target = directory || defaultDirectory();
    if (!isAbsolute(target)) throw new Error('Select an absolute local model folder path.');
    changingModel = true;
    let candidateSession: MfrSession | undefined;
    let previous: MfrStatus | undefined;
    try {
      previous = await getMfrManager().getStatus();
      publish({ ...previous, state: 'validating', error: undefined });
      if (app.isPackaged) assertModelOutsideInstallation(target, dirname(app.getPath('exe')));
      const missingDefault =
        options.allowMissingDefault && !directory && (await defaultModelIsMissing(target));
      if (!missingDefault) await validateModel(target);
      const candidate = newManager(resolve(target));
      const candidateManaged = await isManagedDownload(
        app.getPath('userData'),
        candidate.directory,
      );
      const ready = await candidate.getStatus();
      if (!missingDefault || ready.state === 'ready' || ready.downloadedBytes > 0) {
        // A completed installation must always pass inference, including files that
        // appeared while checking an initially empty managed directory.
        if (missingDefault) await validateModel(target);
        publish({ ...previous, state: 'loading', error: undefined });
        candidateSession = createSession(candidate.directory);
        await candidateSession.recognize(MFR_TEST_IMAGE);
      }
      const preparedSession = candidateSession;
      const restored = previous;
      let finished = false;
      return {
        commit: () => {
          if (finished) return;
          finished = true;
          const old = session;
          manager = candidate;
          session = preparedSession;
          managed = candidateManaged;
          operational = !!preparedSession;
          failedRemovalPath = undefined;
          changingModel = false;
          publish({ ...ready, error: undefined });
          old?.retire();
        },
        dispose: () => {
          if (finished) return;
          finished = true;
          preparedSession?.dispose();
          changingModel = false;
          publish(restored);
        },
      };
    } catch (error) {
      candidateSession?.dispose();
      changingModel = false;
      const message = error instanceof Error ? error.message : 'Could not load the selected model.';
      if (previous) {
        publish({
          ...previous,
          state: previous.state === 'ready' && session ? 'ready' : 'error',
          error: message,
        });
      }
      throw error;
    }
  }

  /** Download first; the settings transaction subsequently validates, loads, and activates it. */
  async function downloadMfrModel(): Promise<string> {
    if (changingModel || recognizing)
      throw new Error('Another model operation is in progress. Please wait.');
    changingModel = true;
    let previous: MfrStatus | undefined;
    let latest: MfrStatus | undefined;
    try {
      previous = await getMfrStatus();
      const target = mfrDownloadDirectory();
      await registerManagedDownload(app.getPath('userData'), target);
      if (resolve(getMfrManager().directory) === resolve(target)) managed = true;
      // Windows locks ONNX files while sessions are alive. Release only sessions in
      // the download destination; a separately imported model can remain available.
      await Promise.all(
        [...sessions]
          .filter((item) => resolve(item.directory) === resolve(target))
          .map((item) => item.disposeAndWait()),
      );
      if (session && resolve(session.directory) === resolve(target)) {
        session = undefined;
        operational = false;
      }
      downloadManager = newManager(target, (progress) => {
        latest = progress;
        if (progress.state === 'downloading') {
          publish({ ...progress, modelPath: previous?.modelPath });
        }
      });
      await downloadManager.download();
      publish({ ...previous, state: 'validating', error: undefined });
      return downloadManager.directory;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not download the model.';
      if (previous && message === DOWNLOAD_CANCELLED) {
        // Not a failure: report what is kept, so the next download resumes from there.
        publish({
          ...previous,
          state: previous.state === 'ready' && session ? 'ready' : 'not-downloaded',
          downloadedBytes: latest?.downloadedBytes ?? 0,
          error: undefined,
        });
      } else if (previous) {
        publish({
          ...previous,
          state: previous.state === 'ready' && session ? 'ready' : 'error',
          error: message,
        });
      }
      throw error;
    } finally {
      downloadManager = undefined;
      changingModel = false;
    }
  }

  /** Cancel a running download. Returns false when nothing was downloading. */
  function cancelDownload(): boolean {
    if (!downloadManager) return false;
    downloadManager.cancel();
    return true;
  }

  /** Remove the active managed model; imported models are disconnected without deleting files. */
  async function prepareClearMfrModel(): Promise<PreparedClearMfrModel> {
    if (changingModel || recognizing) {
      throw new Error(
        'Wait for model setup or recognition to finish before clearing the model cache.',
      );
    }
    changingModel = true;
    clearingModel = true;
    let previous: MfrStatus | undefined;
    try {
      previous = await getMfrStatus();
      const target = failedRemovalPath || getMfrManager().directory;
      const removeFiles = await isManagedDownload(app.getPath('userData'), target);
      publish({ ...previous, state: 'clearing', error: undefined });
      // Idle ONNX sessions can still hold Windows file handles. Stop them before staging.
      const active = [...sessions];
      session = undefined;
      await Promise.all(active.map((item) => item.disposeAndWait()));
      sessions.clear();
      const restored = previous;
      let committed = false;
      let disposed = false;
      return {
        recoveryPath: target,
        async commit() {
          if (committed || disposed) return;
          committed = true;
          operational = false;
          managed = false;
          manager = newManager(defaultDirectory());
          const cleared: MfrStatus = {
            state: 'not-downloaded',
            downloadedBytes: 0,
            totalBytes: restored.totalBytes,
          };
          try {
            if (removeFiles) await removeManagedDownload(app.getPath('userData'), target);
            failedRemovalPath = undefined;
            publish(cleared);
          } catch (error) {
            failedRemovalPath = target;
            managed = removeFiles;
            publish({
              ...cleared,
              state: 'error',
              modelPath: target,
              error: error instanceof Error ? error.message : 'Cache cleanup failed.',
            });
            throw error;
          } finally {
            changingModel = false;
            clearingModel = false;
          }
        },
        async dispose() {
          if (committed || disposed) return;
          disposed = true;
          // Nothing is deleted before settings commit, so failure needs no file rollback.
          publish(restored);
          changingModel = false;
          clearingModel = false;
        },
      };
    } catch (error) {
      changingModel = false;
      clearingModel = false;
      if (previous) {
        publish({
          ...previous,
          error: error instanceof Error ? error.message : 'Cache cleanup failed.',
        });
      }
      throw error;
    }
  }

  async function recognizeMfr(imageBase64: string): Promise<OCRResult> {
    if (!getSettings()[`${config.engine}ModelEnabled`]) {
      throw new Error('The local model is inactive. Download or import a model in Settings first.');
    }
    if (clearingModel) throw new Error('The local model cache is being cleared. Please wait.');
    if (recognizing) throw new Error('Local recognition is already running. Please wait.');
    if (typeof imageBase64 !== 'string' || !imageBase64 || imageBase64.length > 35 * 1024 * 1024) {
      throw new Error('Invalid image or image exceeds 25 MB. Please crop a smaller formula.');
    }
    recognizing = true;
    let attemptedManager: MfrModelManager | undefined;
    try {
      // Keep the manager and session together across the asynchronous readiness check.
      for (;;) {
        const activeManager = getMfrManager();
        attemptedManager = activeManager;
        const directory = await activeManager.ensureReady();
        if (activeManager !== manager) continue;
        session ??= createSession(directory);
        const result = await session.recognize(imageBase64, {
          formatLatex: getSettings().cleanLatex ? cleanLatex : undefined,
        });
        if (activeManager === manager) operational = true;
        if (
          activeManager === manager &&
          !changingModel &&
          (status?.state === 'error' || !status?.operational)
        ) {
          publish({ ...(await activeManager.getStatus()), error: undefined });
        }
        return result;
      }
    } catch (error) {
      if (attemptedManager && attemptedManager === manager && !changingModel) {
        const detail =
          error instanceof Error ? error.message : 'Could not load the selected model.';
        let modelError: string | undefined;
        // Keep ordinary unreadable/blank-formula errors on the result page; broken
        // files and worker/ONNX load failures also need repair controls in Settings.
        if (
          /onnx|DLL|process (?:failed|exited)|模型|引擎|model.*(?:load|ready)|load.*model/i.test(
            detail,
          )
        ) {
          modelError = detail;
        }
        try {
          await validateModel(attemptedManager.directory);
        } catch (invalid) {
          modelError = invalid instanceof Error ? invalid.message : detail;
        }
        if (modelError && attemptedManager === manager && !changingModel) {
          operational = false;
          publish({
            ...(await attemptedManager.getStatus()),
            state: 'error',
            modelPath: attemptedManager.directory,
            error: modelError,
          });
        }
      }
      throw error;
    } finally {
      recognizing = false;
    }
  }

  /** Start loading the active model while the user is still selecting a region. */
  async function warmMfr(): Promise<void> {
    if (
      getSettings().ocrEngine !== config.engine ||
      !getSettings()[`${config.engine}ModelEnabled`] ||
      !operational ||
      changingModel ||
      clearingModel ||
      recognizing
    )
      return;
    const activeManager = getMfrManager();
    if ((await activeManager.getStatus()).state !== 'ready') return;
    // The model may have been replaced while its status was read.
    if (activeManager !== manager || changingModel || clearingModel || recognizing) return;
    session ??= createSession(activeManager.directory);
    session.warmup();
  }

  /**
   * Stop this model's worker processes to free their memory (several hundred MB). The model
   * stays installed and verified; the next recognition or warm-up starts a worker again.
   * A recognition in progress finishes first.
   */
  function releaseMfr(): void {
    if (changingModel || clearingModel || recognizing) return;
    session = undefined;
    for (const active of [...sessions]) active.retire();
  }

  function disposeMfr(): void {
    downloadManager?.cancel();
    manager?.cancel();
    for (const active of sessions) active.dispose();
    sessions.clear();
    session = undefined;
  }

  return {
    getStatus: getMfrStatus,
    prepare: prepareMfrModel,
    prepareClear: prepareClearMfrModel,
    download: downloadMfrModel,
    recognize: recognizeMfr,
    warm: warmMfr,
    release: releaseMfr,
    cancelDownload,
    dispose: disposeMfr,
    downloadDirectory: mfrDownloadDirectory,
  };
}
