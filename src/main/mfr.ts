import { app, BrowserWindow, utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { IPC, type OCRResult } from '../shared/types';
import { MfrModelManager, MFR_REVISION } from '../services/mfr-model';

let manager: MfrModelManager | undefined;
let worker: UtilityProcess | undefined;
let busy = false;
let nextId = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let pending:
  | {
      id: number;
      resolve: (value: OCRResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  | undefined;

export function getMfrManager(): MfrModelManager {
  manager ??= new MfrModelManager(
    join(app.getPath('userData'), 'models', 'mfr-1.5', MFR_REVISION),
    (status) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(IPC.MFR_STATUS, status);
      }
    },
  );
  return manager;
}

function stopWorker(): void {
  clearTimeout(idleTimer);
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Local recognition stopped. Please retry.'));
    pending = undefined;
  }
  const oldWorker = worker;
  worker = undefined;
  oldWorker?.kill();
}

function startWorker(): UtilityProcess {
  if (worker) return worker;
  const child = utilityProcess.fork(join(__dirname, 'mfr-worker.js'), [], {
    serviceName: 'OpenMathpix MFR-1.5',
    stdio: 'ignore',
  });
  worker = child;
  child.on('error', () => {
    if (worker === child) stopWorker();
  });
  child.on('message', (message) => {
    if (worker !== child || !pending || message.id !== pending.id) return;
    const task = pending;
    pending = undefined;
    clearTimeout(task.timer);
    if (message.error) task.reject(new Error(message.error));
    else if (!message.result?.latex) task.reject(new Error('Local model returned no formula.'));
    else {
      const { latex } = message.result;
      task.resolve({
        latex,
        markdown: `$$\n${latex}\n$$`,
        text: latex,
        rawResponse: { engine: 'MFR-1.5', revision: MFR_REVISION, ...message.result },
      });
    }
  });
  child.once('exit', () => {
    if (worker === child) stopWorker();
  });
  return child;
}

export async function recognizeMfr(imageBase64: string): Promise<OCRResult> {
  if (busy) throw new Error('Local recognition is already running.');
  if (typeof imageBase64 !== 'string' || !imageBase64 || imageBase64.length > 35 * 1024 * 1024) {
    throw new Error('Invalid image or image exceeds 25 MB. Please crop a smaller formula.');
  }
  busy = true;
  clearTimeout(idleTimer);
  try {
    const modelDir = await getMfrManager().ensureReady();
    const child = startWorker();
    return await new Promise<OCRResult>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending = undefined;
        stopWorker();
        reject(new Error('Local recognition timed out. Please crop a smaller formula and retry.'));
      }, 90_000);
      pending = { id, resolve, reject, timer };
      try {
        child.postMessage({ id, modelDir, imageBase64 });
      } catch (error) {
        stopWorker();
        reject(error);
      }
    });
  } finally {
    busy = false;
    // Also schedule cleanup when readiness checks fail while an older session is warm.
    if (worker) {
      idleTimer = setTimeout(stopWorker, 5 * 60_000);
      idleTimer.unref();
    }
  }
}

export function disposeMfr(): void {
  manager?.cancel();
  stopWorker();
}
