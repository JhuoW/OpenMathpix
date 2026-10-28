import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { createByteLevelTokenizer } from './mfr-tokenizer';

export interface MfrRecognitionOptions {
  maxTokens?: number;
  timeoutMs?: number;
}

export interface MfrRecognitionResult {
  latex: string;
  elapsedMs: number;
  tokenCount: number;
}

export interface MfrEngine {
  recognize(image: Buffer, options?: MfrRecognitionOptions): Promise<MfrRecognitionResult>;
  dispose(): Promise<void>;
}

const IMAGE_SIZE = 384;
const MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MFR 模型配置无效，请重新下载模型。');
  }
  return value as Record<string, unknown>;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return object(JSON.parse(await readFile(path, 'utf8')));
}

function validatePreprocessor(config: Record<string, unknown>): void {
  const size = object(config.size);
  if (
    size.height !== IMAGE_SIZE ||
    size.width !== IMAGE_SIZE ||
    config.do_center_crop !== false ||
    config.do_resize !== true ||
    config.resample !== 3 ||
    config.do_rescale !== true ||
    typeof config.rescale_factor !== 'number' ||
    Math.abs(Number(config.rescale_factor) - 1 / 255) > 1e-12 ||
    config.do_normalize !== true ||
    JSON.stringify(config.image_mean) !== '[0.5,0.5,0.5]' ||
    JSON.stringify(config.image_std) !== '[0.5,0.5,0.5]'
  ) {
    throw new Error('MFR 图像处理配置不兼容，请重新下载官方 MFR-1.5 模型。');
  }
}

// Match DeiTImageProcessor: direct 384×384 bicubic resize (no center crop),
// RGB, /255 then mean/std = 0.5. Flatten transparent screenshots onto white.
export async function prepareMfrImage(image: Buffer): Promise<Float32Array> {
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new Error('截图为空，请重新框选公式。');
  }
  if (image.length > 25 * 1024 * 1024) {
    throw new Error('截图文件超过 25 MB，请缩小框选范围。');
  }
  let pixels: Buffer;
  try {
    pixels = await sharp(image, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .removeAlpha()
      .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'fill', kernel: sharp.kernel.cubic })
      .raw()
      .toBuffer();
  } catch {
    throw new Error('无法读取截图，请使用有效的 PNG/JPEG 图片并缩小框选范围。');
  }
  const planeSize = IMAGE_SIZE * IMAGE_SIZE;
  if (pixels.length !== planeSize * 3) throw new Error('截图无法转换为 RGB 图片。');
  const result = new Float32Array(planeSize * 3);
  let hasContrast = false;
  for (let channel = 0; channel < 3; channel++) {
    let minimum = 255;
    let maximum = 0;
    for (let i = 0; i < planeSize; i++) {
      const value = pixels[i * 3 + channel];
      result[channel * planeSize + i] = (value / 255 - 0.5) / 0.5;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    if (maximum - minimum >= 4) hasContrast = true;
  }
  if (!hasContrast) throw new Error('截图中没有可辨认的公式，请重新框选公式区域。');
  return result;
}

function requireNames(session: ort.InferenceSession, inputs: string[], output: string): void {
  if (
    session.inputNames.length !== inputs.length ||
    !inputs.every((name) => session.inputNames.includes(name)) ||
    !session.outputNames.includes(output)
  ) {
    throw new Error('MFR ONNX 模型接口不兼容，请重新下载官方 MFR-1.5 模型。');
  }
  for (const input of session.inputMetadata) {
    const expectedType = input.name === 'input_ids' ? 'int64' : 'float32';
    if (!input.isTensor || input.type !== expectedType) {
      throw new Error(`MFR 模型输入 ${input.name} 类型不兼容，请重新下载模型。`);
    }
  }
  const outputMetadata = session.outputMetadata.find((metadata) => metadata.name === output);
  if (!outputMetadata?.isTensor || outputMetadata.type !== 'float32') {
    throw new Error(`MFR 模型输出 ${output} 类型不兼容，请重新下载模型。`);
  }
}

function checkOptions(options: MfrRecognitionOptions): { maxTokens: number; timeoutMs: number } {
  const maxTokens = options.maxTokens ?? MAX_TOKENS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS) {
    throw new Error(`MFR maxTokens 必须是 1 到 ${MAX_TOKENS} 的整数。`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
    throw new Error('MFR timeoutMs 必须大于 0 且不超过 300000。');
  }
  return { maxTokens, timeoutMs };
}

function disposeOutputs(outputs: ort.InferenceSession.ReturnType): void {
  for (const tensor of Object.values(outputs)) tensor.dispose();
}

export async function createMfrEngine(modelDir: string): Promise<MfrEngine> {
  const [config, generation, preprocessor, tokenizerData] = await Promise.all([
    readJson(join(modelDir, 'config.json')),
    readJson(join(modelDir, 'generation_config.json')),
    readJson(join(modelDir, 'preprocessor_config.json')),
    readJson(join(modelDir, 'tokenizer.json')),
  ]);
  validatePreprocessor(preprocessor);
  const tokenizer = createByteLevelTokenizer(tokenizerData);
  const startToken = generation.decoder_start_token_id;
  const endToken = generation.eos_token_id;
  if (
    startToken !== 1 ||
    endToken !== 2 ||
    config.use_cache !== false ||
    tokenizer.vocabularySize !== config.vocab_size
  ) {
    throw new Error('MFR 生成配置不兼容，请重新下载官方 MFR-1.5 模型。');
  }
  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: ['cpu'],
    intraOpNumThreads: 2,
    interOpNumThreads: 1,
    executionMode: 'sequential',
    graphOptimizationLevel: 'all',
  };
  const encoder = await ort.InferenceSession.create(
    join(modelDir, 'encoder_model.onnx'),
    sessionOptions,
  );
  let decoder: ort.InferenceSession;
  try {
    decoder = await ort.InferenceSession.create(
      join(modelDir, 'decoder_model.onnx'),
      sessionOptions,
    );
  } catch (error) {
    await encoder.release();
    throw error;
  }
  try {
    requireNames(encoder, ['pixel_values'], 'last_hidden_state');
    requireNames(decoder, ['input_ids', 'encoder_hidden_states'], 'logits');
  } catch (error) {
    await Promise.allSettled([encoder.release(), decoder.release()]);
    throw error;
  }
  let disposed = false;
  let active: Promise<MfrRecognitionResult> | undefined;
  let releasing: Promise<void> | undefined;

  async function recognize(
    image: Buffer,
    options: MfrRecognitionOptions,
  ): Promise<MfrRecognitionResult> {
    const { maxTokens, timeoutMs } = checkOptions(options);
    const started = performance.now();
    const checkTimeout = () => {
      if (performance.now() - started > timeoutMs) {
        throw new Error('本地公式识别超时，请缩小截图范围或减少公式长度后重试。');
      }
    };
    const pixels = new ort.Tensor('float32', await prepareMfrImage(image), [
      1,
      3,
      IMAGE_SIZE,
      IMAGE_SIZE,
    ]);
    let encoded: ort.InferenceSession.ReturnType | undefined;
    try {
      checkTimeout();
      encoded = await encoder.run({ pixel_values: pixels });
      const hiddenState = encoded.last_hidden_state;
      if (!hiddenState || hiddenState.type !== 'float32' || hiddenState.dims.length !== 3) {
        throw new Error('MFR encoder 返回了无效结果，请重新下载模型。');
      }
      const tokenIds: number[] = [startToken as number];
      for (let index = 0; index < maxTokens; index++) {
        checkTimeout();
        const input = new ort.Tensor('int64', BigInt64Array.from(tokenIds, BigInt), [
          1,
          tokenIds.length,
        ]);
        let decoded: ort.InferenceSession.ReturnType | undefined;
        let nextToken = -1;
        try {
          decoded = await decoder.run({ input_ids: input, encoder_hidden_states: hiddenState });
          checkTimeout();
          const logits = decoded.logits;
          if (
            !logits ||
            logits.type !== 'float32' ||
            logits.dims.length !== 3 ||
            logits.dims[0] !== 1 ||
            logits.dims[1] !== tokenIds.length ||
            logits.dims[2] !== tokenizer.vocabularySize
          ) {
            throw new Error('MFR decoder 返回了无效结果，请重新下载模型。');
          }
          const scores = logits.data as Float32Array;
          const offset = (tokenIds.length - 1) * tokenizer.vocabularySize;
          let bestScore = -Infinity;
          for (let token = 0; token < tokenizer.vocabularySize; token++) {
            const score = scores[offset + token];
            if (score > bestScore) {
              bestScore = score;
              nextToken = token;
            }
          }
          if (nextToken < 0 || !Number.isFinite(bestScore)) {
            throw new Error('MFR 返回了无效概率，请重试或重新下载模型。');
          }
        } finally {
          input.dispose();
          if (decoded) disposeOutputs(decoded);
        }
        if (nextToken === endToken) {
          const latex = tokenizer.decode(tokenIds.slice(1)).trim();
          if (!latex) throw new Error('没有识别到公式，请框选清晰的单个公式后重试。');
          return { latex, elapsedMs: performance.now() - started, tokenCount: tokenIds.length - 1 };
        }
        tokenIds.push(nextToken);
      }
      throw new Error(`公式输出超过 ${maxTokens} 个 token，结果可能不完整，请分别框选较短的公式。`);
    } finally {
      pixels.dispose();
      if (encoded) disposeOutputs(encoded);
    }
  }

  return {
    async recognize(image, options = {}) {
      if (disposed) throw new Error('MFR 引擎已关闭，请重新启用本地识别。');
      if (active) throw new Error('MFR 正在识别另一张截图，请稍候再试。');
      active = recognize(image, options);
      try {
        return await active;
      } finally {
        active = undefined;
      }
    },
    dispose() {
      if (!releasing) {
        disposed = true;
        releasing = (async () => {
          await active?.catch(() => undefined);
          const results = await Promise.allSettled([encoder.release(), decoder.release()]);
          for (const result of results) if (result.status === 'rejected') throw result.reason;
        })();
      }
      return releasing;
    },
  };
}
