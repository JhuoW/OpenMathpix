import { app, BrowserWindow, net, utilityProcess } from 'electron';
import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { IPC, type MfrStatus, type OCRResult } from '../shared/types';
import {
  MfrModelManager,
  MFR_REVISION,
  mfrFileUrl,
  validateMfrDirectory,
  type FetchModel,
} from '../services/mfr-model';
import { MFR_TEST_IMAGE } from '../shared/mfr-test-image';
import { getSettings } from './store';
import { MfrSession } from './mfr-session';
import { stageModelCacheRemoval, type StagedModelCache } from '../services/mfr-cache';

let manager: MfrModelManager | undefined;
let session: MfrSession | undefined;
let downloadManager: MfrModelManager | undefined;
let status: MfrStatus | undefined;
let changingModel = false;
let recognizing = false;
let clearingModel = false;
const sessions = new Set<MfrSession>();

function defaultDirectory(): string {
  return join(app.getPath('userData'), 'models', 'mfr-1.5', MFR_REVISION);
}

function publish(next: MfrStatus): void {
  status = { ...next };
  for (const win of BrowserWindow.getAllWindows()) {
    // A window closing during activation must not turn a committed setting into an error.
    try {
      if (!win.isDestroyed()) win.webContents.send(IPC.MFR_STATUS, status);
    } catch {
      // The next window reads the current status through IPC.
    }
  }
}

/** Chromium networking follows the operating system proxy, including Windows PAC settings. */
const fetchModel: FetchModel = async (file, signal) => {
  const connectTimeout = new AbortController();
  const timer = setTimeout(() => connectTimeout.abort(), 60_000);
  try {
    const response = await net.fetch(mfrFileUrl(file), {
      signal: AbortSignal.any([signal, connectTimeout.signal]),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Model download failed (HTTP ${response.status}): ${file.name}.`);
    }
    return Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
  } catch (error) {
    if (connectTimeout.signal.aborted) throw new Error('Model server connection timed out.');
    throw error;
  } finally {
    // Only the connection/response headers have a 60 second deadline. The manager
    // retains its overall ten minute deadline while the model body is streaming.
    clearTimeout(timer);
  }
};

export function getMfrManager(): MfrModelManager {
  manager ??= new MfrModelManager(getSettings().mfrModelPath || defaultDirectory());
  return manager;
}

export async function getMfrStatus(): Promise<MfrStatus> {
  if (!status) {
    const initial = await getMfrManager().getStatus();
    if (!status) publish(initial);
  }
  return { ...status! };
}

function createSession(directory: string): MfrSession {
  const next = new MfrSession(
    directory,
    () => {
      const child = utilityProcess.fork(join(__dirname, 'mfr-worker.js'), [], {
        serviceName: 'OpenMathpix MFR-1.5',
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
          child.on('error', () => listener(new Error('The local model process failed to start.')));
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
                  () => reject(new Error('The local model process has not exited. Please retry.')),
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
  );
  sessions.add(next);
  return next;
}

export interface PreparedMfrModel {
  commit: () => void;
  dispose: () => void;
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
export async function prepareMfrModel(
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
    const missingDefault =
      options.allowMissingDefault && !directory && (await defaultModelIsMissing(target));
    if (!missingDefault) await validateMfrDirectory(target);
    const candidate = new MfrModelManager(resolve(target));
    const ready = await candidate.getStatus();
    if (!missingDefault || ready.state === 'ready' || ready.downloadedBytes > 0) {
      // A completed installation must always pass inference, including files that
      // appeared while checking an initially empty managed directory.
      if (missingDefault) await validateMfrDirectory(target);
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
export async function downloadMfrModel(): Promise<string> {
  if (changingModel) throw new Error('Another model operation is in progress. Please wait.');
  changingModel = true;
  let previous: MfrStatus | undefined;
  try {
    if ((await getMfrStatus()).state === 'ready') {
      throw new Error('Model is already ready. Clear the model cache before downloading again.');
    }
    previous = await getMfrManager().getStatus();
    downloadManager = new MfrModelManager(
      defaultDirectory(),
      (progress) => {
        if (progress.state === 'downloading') {
          publish({ ...progress, modelPath: previous?.modelPath });
        }
      },
      undefined,
      fetchModel,
    );
    await downloadManager.download();
    publish({ ...previous, state: 'validating', error: undefined });
    return downloadManager.directory;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not download the model.';
    if (previous) {
      publish({
        ...previous,
        state: previous.state === 'ready' ? 'ready' : 'error',
        error: message,
      });
    }
    throw error;
  } finally {
    downloadManager = undefined;
    changingModel = false;
  }
}

export interface PreparedClearMfrModel {
  commit(): Promise<void>;
  dispose(): Promise<void>;
}

/** Stage only our downloaded cache; an imported model directory is never deleted. */
export async function prepareClearMfrModel(): Promise<PreparedClearMfrModel> {
  if (changingModel || recognizing) {
    throw new Error(
      'Wait for model setup or recognition to finish before clearing the model cache.',
    );
  }
  changingModel = true;
  clearingModel = true;
  let previous: MfrStatus | undefined;
  let staged: StagedModelCache | undefined;
  try {
    previous = await getMfrStatus();
    publish({ ...previous, state: 'clearing', error: undefined });
    // Idle ONNX sessions can still hold Windows file handles. Stop them before staging.
    const active = [...sessions];
    session = undefined;
    await Promise.all(active.map((item) => item.disposeAndWait()));
    sessions.clear();
    staged = await stageModelCacheRemoval(app.getPath('userData'), MFR_REVISION);
    const removal = staged;
    const restored = previous;
    let committed = false;
    let disposed = false;
    return {
      async commit() {
        if (committed || disposed) return;
        committed = true;
        manager = new MfrModelManager(defaultDirectory());
        const cleared: MfrStatus = {
          state: 'not-downloaded',
          downloadedBytes: 0,
          totalBytes: restored.totalBytes,
        };
        try {
          await removal.commit();
          publish(cleared);
        } catch (error) {
          publish({
            ...cleared,
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
        try {
          await removal.rollback();
          publish(restored);
        } catch (error) {
          manager = new MfrModelManager(getSettings().mfrModelPath || defaultDirectory());
          publish({
            ...(await manager.getStatus()),
            error: error instanceof Error ? error.message : 'Could not restore the model cache.',
          });
          throw error;
        } finally {
          changingModel = false;
          clearingModel = false;
        }
      },
    };
  } catch (error) {
    if (staged) await staged.rollback();
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

export async function recognizeMfr(imageBase64: string): Promise<OCRResult> {
  if (clearingModel) throw new Error('The local model cache is being cleared. Please wait.');
  if (recognizing) throw new Error('Local recognition is already running. Please wait.');
  if (typeof imageBase64 !== 'string' || !imageBase64 || imageBase64.length > 35 * 1024 * 1024) {
    throw new Error('Invalid image or image exceeds 25 MB. Please crop a smaller formula.');
  }
  recognizing = true;
  try {
    // Keep the manager and session together across the asynchronous readiness check.
    for (;;) {
      const activeManager = getMfrManager();
      const directory = await activeManager.ensureReady();
      if (activeManager !== manager) continue;
      session ??= createSession(directory);
      return await session.recognize(imageBase64);
    }
  } finally {
    recognizing = false;
  }
}

export function disposeMfr(): void {
  downloadManager?.cancel();
  manager?.cancel();
  for (const active of sessions) active.dispose();
  sessions.clear();
  session = undefined;
}
