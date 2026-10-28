import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import axios from 'axios';
import type { MfrStatus } from '../shared/types';

export const MFR_REVISION = '1cef9f0bdcd6a4c63df7de1311fb0894593340cc';
export interface ModelFile {
  name: string;
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

type FetchModel = (file: ModelFile, signal: AbortSignal) => Promise<Readable>;
const fetchModel: FetchModel = async (file, signal) => {
  const response = await axios.get<Readable>(
    `https://huggingface.co/breezedeus/pix2text-mfr-1.5/resolve/${MFR_REVISION}/${file.name}?download=true`,
    { responseType: 'stream', timeout: 60_000, signal, maxRedirects: 5 },
  );
  return response.data;
};

async function validFile(path: string, file: ModelFile): Promise<boolean> {
  try {
    if ((await stat(path)).size !== file.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex') === file.sha256;
  } catch {
    return false;
  }
}

/** Public, pinned model files only. No screenshot data is sent by this downloader. */
export class MfrModelManager {
  private status: MfrStatus;
  private initialization?: Promise<void>;
  private downloadTask?: Promise<void>;
  private abort?: AbortController;
  private lastProgress = 0;

  constructor(
    readonly directory: string,
    private readonly onStatus: (status: MfrStatus) => void = () => {},
    private readonly files: readonly ModelFile[] = MFR_FILES,
    private readonly fetchFile: FetchModel = fetchModel,
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
      for (const file of this.files) {
        if (await validFile(join(this.directory, file.name), file)) bytes += file.size;
      }
      const ready = bytes === this.status.totalBytes;
      this.emit({
        ...this.status,
        state: ready ? 'ready' : 'not-downloaded',
        downloadedBytes: bytes,
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
      throw new Error('MFR-1.5 model is not ready. Download it in Settings → Local MFR-1.5.');
    }
    return this.directory;
  }

  download(): Promise<void> {
    if (this.downloadTask) return this.downloadTask;
    // Register cancellation before the first asynchronous initialization step.
    const controller = new AbortController();
    this.abort = controller;
    this.downloadTask = this.downloadFiles(controller).finally(() => {
      this.downloadTask = undefined;
      this.abort = undefined;
    });
    return this.downloadTask;
  }

  cancel(): void {
    this.abort?.abort();
  }

  private async downloadFiles(controller: AbortController): Promise<void> {
    const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), 10 * 60_000);
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
        let received = 0;
        const hash = createHash('sha256');
        try {
          const source = await this.fetchFile(file, signal);
          const progress = new Transform({
            transform: (chunk: Buffer, _encoding, callback) => {
              received += chunk.length;
              if (received > file.size) return callback(new Error(`Unexpected size: ${file.name}`));
              hash.update(chunk);
              if (Date.now() - this.lastProgress > 150) {
                this.lastProgress = Date.now();
                this.emit({ ...this.status, downloadedBytes: completed + received });
              }
              callback(null, chunk);
            },
          });
          await pipeline(source, progress, createWriteStream(temporary), { signal });
          if (received !== file.size || hash.digest('hex') !== file.sha256) {
            throw new Error(
              `Model integrity check failed: ${file.name}. Please retry the download.`,
            );
          }
          signal.throwIfAborted();
          await rename(temporary, target);
        } finally {
          await rm(temporary, { force: true });
        }
        completed += file.size;
        this.emit({ ...this.status, downloadedBytes: completed });
      }
      signal.throwIfAborted();
      this.emit({ ...this.status, state: 'ready', modelPath: this.directory });
    } catch (error) {
      const message = signal.aborted
        ? 'Model download cancelled or timed out. Please retry.'
        : error instanceof Error
          ? error.message
          : 'Model download failed. Please retry.';
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
