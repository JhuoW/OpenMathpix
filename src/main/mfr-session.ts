import type { OCRResult } from '../shared/types';
import { MFR_REVISION } from '../services/mfr-model';

export interface WorkerResponse {
  id: number;
  error?: string;
  result?: { latex: string; [key: string]: unknown };
}

export interface MfrWorkerTransport {
  send: (request: { id: number; modelDir: string; imageBase64: string }) => void;
  kill: () => void;
  onMessage: (listener: (response: WorkerResponse) => void) => void;
  onFailure: (listener: (error: Error) => void) => void;
  waitForExit?: () => Promise<void>;
}

/** Each session owns one directory, so a candidate can load alongside the active model. */
export class MfrSession {
  private worker?: MfrWorkerTransport;
  private nextId = 0;
  private retired = false;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private pending?: {
    id: number;
    resolve: (result: OCRResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };

  constructor(
    readonly directory: string,
    private readonly createWorker: () => MfrWorkerTransport,
    private readonly onDisposed: () => void = () => {},
    private readonly timeoutMs = 90_000,
  ) {}

  private start(): MfrWorkerTransport {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    this.worker = worker;
    worker.onFailure((error) => {
      if (this.worker === worker) this.stop(error);
    });
    worker.onMessage((message) => {
      if (this.worker !== worker || !this.pending || message.id !== this.pending.id) return;
      const task = this.pending;
      this.pending = undefined;
      clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error));
      else if (!message.result?.latex) {
        task.reject(new Error('Local model returned no formula.'));
      } else {
        const { latex } = message.result;
        task.resolve({
          latex,
          markdown: `$$\n${latex}\n$$`,
          text: latex,
          rawResponse: { engine: 'MFR-1.5', revision: MFR_REVISION, ...message.result },
        });
      }
      this.afterRequest();
    });
    return worker;
  }

  private stop(error = new Error('Local recognition stopped. Please retry.')): void {
    clearTimeout(this.idleTimer);
    const worker = this.worker;
    this.worker = undefined;
    if (this.pending) {
      const task = this.pending;
      this.pending = undefined;
      clearTimeout(task.timer);
      task.reject(error);
    }
    try {
      worker?.kill();
    } catch {
      // Cleanup is best effort, especially after the operating system ended a worker.
    }
    if (this.retired) this.onDisposed();
  }

  private afterRequest(): void {
    if (this.retired) this.stop();
    else {
      this.idleTimer = setTimeout(() => this.stop(), 5 * 60_000);
      this.idleTimer.unref();
    }
  }

  recognize(imageBase64: string): Promise<OCRResult> {
    if (this.retired) return Promise.reject(new Error('This model session has been replaced.'));
    if (this.pending)
      return Promise.reject(new Error('Local recognition is already running. Please wait.'));
    clearTimeout(this.idleTimer);
    let worker: MfrWorkerTransport;
    try {
      worker = this.start();
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<OCRResult>((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.stop(
          new Error('Local recognition timed out. Please crop a smaller formula and retry.'),
        );
      }, this.timeoutMs);
      this.pending = { id, resolve, reject, timer };
      try {
        worker.send({ id, modelDir: this.directory, imageBase64 });
      } catch (error) {
        this.stop(error instanceof Error ? error : new Error('Could not start local recognition.'));
      }
    });
  }

  /** Finish an in-flight recognition before releasing the previously active model. */
  retire(): void {
    this.retired = true;
    if (!this.pending) this.stop();
  }

  dispose(): void {
    this.retired = true;
    this.stop();
  }

  /** Wait for native file handles to close before removing cached model files on Windows. */
  async disposeAndWait(): Promise<void> {
    const worker = this.worker;
    this.dispose();
    await worker?.waitForExit?.();
  }
}
