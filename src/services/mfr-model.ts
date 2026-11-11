import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import axios from 'axios';
import type { MfrStatus, ModelSource } from '../shared/types';

export const MFR_REVISION = '1cef9f0bdcd6a4c63df7de1311fb0894593340cc';
export const MFR_DOWNLOAD_PAGE = `https://huggingface.co/breezedeus/pix2text-mfr-1.5/tree/${MFR_REVISION}`;
export interface ModelFile {
  /** Local file name; every model is installed as a flat folder. */
  name: string;
  /** Path inside the remote repository when it differs from the local name. */
  remotePath?: string;
  size: number;
  sha256: string;
}
export const MFR_FILES: readonly ModelFile[] = [
  {
    name: 'encoder_model.onnx',
    size: 87510770,
    sha256: '080a3f660f08bc9ebcacdd96e34be6b6400f8c7e62d7cd0dd8251badc37f610b',
  },
  {
    name: 'decoder_model.onnx',
    size: 32026253,
    sha256: '917deb98e91a0453c5f234f58a0f32f9fb037de8527c7eb4ed394daf9e692f2a',
  },
  {
    name: 'config.json',
    size: 1573,
    sha256: 'fe4076f08f6ca75940f6af9268d51928b834979a69bc2145dacee62633a5d53d',
  },
  {
    name: 'generation_config.json',
    size: 211,
    sha256: '7363c031c6142d35a276815b0e285cc289dfb9f51d0b7c63de8f3ed65cc8d8ad',
  },
  {
    name: 'preprocessor_config.json',
    size: 450,
    sha256: '36a945a7cc645688b9ef64dabae16979cf5f7c1c448569cc306694edc0598b9b',
  },
  {
    name: 'special_tokens_map.json',
    size: 964,
    sha256: '8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835',
  },
  {
    name: 'tokenizer.json',
    size: 113168,
    sha256: '4ffbeb2143e6a38324bb6111b7a8109530d38a076a8439aa5777535f0a32758a',
  },
  {
    name: 'tokenizer_config.json',
    size: 1244,
    sha256: 'f5cc321e8545940295fba11e9a59f4f2a208a23af3d63cc8c355c78593645b99',
  },
];

/** A download fails only after this long without receiving any data. */
export const DOWNLOAD_STALL_MS = 90_000;

/** Thrown when the user cancels a download; partial files are kept so it can resume. */
export const DOWNLOAD_CANCELLED = 'Model download cancelled.';

/** A response body and the byte offset it starts at (0 when a range was not honoured). */
export interface FetchedModel {
  body: Readable;
  start: number;
}
/** `start` asks for the rest of a partially downloaded file (an HTTP range request). */
export type FetchModel = (
  file: ModelFile,
  signal: AbortSignal,
  start?: number,
) => Promise<Readable | FetchedModel>;
/** Every file is pinned by size and SHA-256, so a mirror cannot alter what is installed. */
export const MODEL_HOSTS: Record<ModelSource, string> = {
  huggingface: 'https://huggingface.co',
  'hf-mirror': 'https://hf-mirror.com',
};
export const mfrFileUrl = (file: ModelFile, source: ModelSource = 'huggingface'): string =>
  `${MODEL_HOSTS[source]}/breezedeus/pix2text-mfr-1.5/resolve/${MFR_REVISION}/${file.name}?download=true`;
const fetchModel: FetchModel = async (file, signal, start = 0) => {
  const response = await axios.get<Readable>(mfrFileUrl(file), {
    responseType: 'stream',
    timeout: 60_000,
    signal,
    maxRedirects: 5,
    headers: start > 0 ? { Range: `bytes=${start}-` } : undefined,
  });
  return { body: response.data, start: response.status === 206 ? start : 0 };
};

async function partialSize(path: string, file: ModelFile): Promise<number> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size < file.size ? info.size : 0;
  } catch {
    return 0;
  }
}

async function validFile(path: string, file: ModelFile): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size !== file.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex') === file.sha256;
  } catch {
    return false;
  }
}

/** Imported files must match the same pinned model used by automatic downloads. */
export async function validateMfrDirectory(
  directory: string,
  files: readonly ModelFile[] = MFR_FILES,
  modelName = 'MFR-1.5',
): Promise<void> {
  try {
    if (!(await stat(directory)).isDirectory()) throw new Error('Not a directory');
  } catch {
    throw new Error(`Select an accessible folder containing the ${modelName} model files.`);
  }
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const file of files) {
    const path = join(directory, file.name);
    try {
      await stat(path);
    } catch {
      missing.push(file.name);
      continue;
    }
    if (!(await validFile(path, file))) invalid.push(file.name);
  }
  if (missing.length || invalid.length) {
    throw new Error(
      [
        missing.length ? `Missing or unreadable files: ${missing.join(', ')}.` : '',
        invalid.length ? `Incomplete, corrupt, or incompatible files: ${invalid.join(', ')}.` : '',
        modelName === 'MFR-1.5'
          ? 'Download all eight original files from the linked MFR-1.5 revision, then select the folder containing them.'
          : 'Download all six original files from the linked TexTeller revision into one folder (without the onnx subfolder), then select that folder.',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
}

export function mfrDownloadError(error: unknown, aborted = false, downloadGuide?: string): string {
  const detail = error instanceof Error ? error.message : 'Model download failed.';
  const guide =
    downloadGuide ??
    'You can also download the eight model files from Hugging Face and use Import Existing Model.';
  if (aborted) return `Model download cancelled or timed out. Please retry. ${guide}`;
  if (/ETIMEDOUT|ETIMEOUT|timed? ?out|timeout|ERR_CONNECTION_TIMED_OUT/i.test(detail)) {
    return `Could not connect to the model download server in time. Check your network or system proxy and retry. ${guide}`;
  }
  if (
    /ENOTFOUND|EAI_AGAIN|ECONN|ERR_(?:NAME|CONNECTION|INTERNET|PROXY)|fetch failed/i.test(detail)
  ) {
    return `Could not reach the model download server. Check your network or system proxy and retry. ${guide}`;
  }
  return `${detail} ${guide}`;
}

/** Public, pinned model files only. No screenshot data is sent by this downloader. */
export class MfrModelManager {
  private status: MfrStatus;
  private initialization?: Promise<void>;
  private downloadTask?: Promise<void>;
  private abort?: AbortController;
  private cancelled = false;
  private lastProgress = 0;

  constructor(
    readonly directory: string,
    private readonly onStatus: (status: MfrStatus) => void = () => {},
    private readonly files: readonly ModelFile[] = MFR_FILES,
    private readonly fetchFile: FetchModel = fetchModel,
    private readonly details: { label?: string; downloadGuide?: string } = {},
  ) {
    this.status = {
      state: 'not-downloaded',
      downloadedBytes: 0,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    };
  }

  private emit(status: MfrStatus): void {
    this.status = status;
    this.onStatus({ ...status });
  }

  private initialize(): Promise<void> {
    this.initialization ??= (async () => {
      let bytes = 0;
      let partial = 0;
      for (const file of this.files) {
        const path = join(this.directory, file.name);
        if (await validFile(path, file)) bytes += file.size;
        else partial += await partialSize(`${path}.part`, file);
      }
      const ready = bytes === this.status.totalBytes;
      this.emit({
        ...this.status,
        state: ready ? 'ready' : 'not-downloaded',
        // An interrupted download counts what it already has, so it can be resumed.
        downloadedBytes: ready ? bytes : bytes + partial,
        modelPath: ready ? this.directory : undefined,
      });
    })();
    return this.initialization;
  }

  async getStatus(): Promise<MfrStatus> {
    await this.initialize();
    return { ...this.status };
  }

  async ensureReady(): Promise<string> {
    if ((await this.getStatus()).state !== 'ready') {
      throw new Error(
        `${this.details.label ?? 'MFR-1.5'} model is not ready. Download it or use Import Existing Model in Settings.`,
      );
    }
    return this.directory;
  }

  download(): Promise<void> {
    if (this.downloadTask) return this.downloadTask;
    // Register cancellation before the first asynchronous initialization step.
    const controller = new AbortController();
    this.abort = controller;
    this.cancelled = false;
    this.downloadTask = this.downloadFiles(controller).finally(() => {
      this.downloadTask = undefined;
      this.abort = undefined;
    });
    return this.downloadTask;
  }

  /** Stop a download at the user's request; what was received stays for a later resume. */
  cancel(): void {
    if (!this.abort) return;
    this.cancelled = true;
    this.abort.abort();
  }

  private async downloadFiles(controller: AbortController): Promise<void> {
    const signal = controller.signal;
    // Abort a stalled transfer rather than limiting total time: models range from about
    // 120 MB to 320 MB, and slow connections must still be able to finish.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keepAlive = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), DOWNLOAD_STALL_MS);
    };
    keepAlive();
    let completed = 0;
    try {
      await this.initialize();
      signal.throwIfAborted();
      // Recheck even a previously ready installation, permitting repair after file removal.
      this.emit({
        ...this.status,
        state: 'downloading',
        downloadedBytes: 0,
        error: undefined,
        modelPath: undefined,
      });
      await mkdir(this.directory, { recursive: true });
      for (const file of this.files) {
        signal.throwIfAborted();
        const target = join(this.directory, file.name);
        if (await validFile(target, file)) {
          signal.throwIfAborted();
          completed += file.size;
          this.emit({ ...this.status, downloadedBytes: completed });
          continue;
        }
        const temporary = `${target}.part`;
        // Continue an interrupted download: hash what is on disk, then ask for the rest.
        // The final SHA-256 covers every byte, so a stale or foreign partial file is caught.
        const resumeFrom = await partialSize(temporary, file);
        let hash = createHash('sha256');
        let received = 0;
        if (resumeFrom > 0) {
          for await (const chunk of createReadStream(temporary, { end: resumeFrom - 1 })) {
            hash.update(chunk);
            received += chunk.length;
          }
        }
        let corrupt = false;
        try {
          keepAlive();
          const fetched = await this.fetchFile(file, signal, received);
          const { body, start } =
            fetched instanceof Readable ? { body: fetched, start: 0 } : fetched;
          if (start !== received) {
            // The server sent the whole file instead of the requested range.
            hash = createHash('sha256');
            received = 0;
          }
          const progress = new Transform({
            transform: (chunk: Buffer, _encoding, callback) => {
              keepAlive();
              received += chunk.length;
              if (received > file.size) {
                corrupt = true;
                return callback(new Error(`Unexpected size: ${file.name}`));
              }
              hash.update(chunk);
              if (Date.now() - this.lastProgress > 150) {
                this.lastProgress = Date.now();
                this.emit({ ...this.status, downloadedBytes: completed + received });
              }
              callback(null, chunk);
            },
          });
          await pipeline(
            body,
            progress,
            createWriteStream(temporary, { flags: received > 0 ? 'r+' : 'w', start: received }),
            { signal },
          );
          if (received !== file.size || hash.digest('hex') !== file.sha256) {
            corrupt = true;
            throw new Error(
              `Model integrity check failed: ${file.name}. Please retry the download.`,
            );
          }
          signal.throwIfAborted();
          await rename(temporary, target);
        } catch (error) {
          // Keep an interrupted file for the next attempt; never keep a wrong one.
          if (corrupt) await rm(temporary, { force: true });
          throw error;
        }
        completed += file.size;
        this.emit({ ...this.status, downloadedBytes: completed });
      }
      signal.throwIfAborted();
      this.emit({ ...this.status, state: 'ready', modelPath: this.directory });
    } catch (error) {
      if (this.cancelled) {
        let kept = 0;
        for (const file of this.files) {
          const path = join(this.directory, file.name);
          kept += (await validFile(path, file))
            ? file.size
            : await partialSize(`${path}.part`, file);
        }
        this.emit({
          ...this.status,
          state: 'not-downloaded',
          downloadedBytes: kept,
          error: undefined,
          modelPath: undefined,
        });
        throw new Error(DOWNLOAD_CANCELLED);
      }
      const message = mfrDownloadError(error, signal.aborted, this.details.downloadGuide);
      this.emit({
        ...this.status,
        state: 'error',
        downloadedBytes: completed,
        error: message,
        modelPath: undefined,
      });
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  }
}
