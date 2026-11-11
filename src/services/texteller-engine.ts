import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import {
  createDegenerationGuard,
  type MfrEngine,
  type MfrRecognitionOptions,
  type MfrRecognitionResult,
} from './mfr-engine';
import { createByteLevelTokenizer } from './mfr-tokenizer';

// Image preprocessing and output clean-up follow TexTeller (OleehyO/TexTeller, Apache-2.0):
// texteller/utils/image.py and texteller/utils/latex.py. See THIRD_PARTY_NOTICES.md.
const IMAGE_SIZE = 448;
const IMAGE_MEAN = 0.9545467;
const IMAGE_STD = 0.15394445;
const MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const ENCODER_FILE = 'encoder_model_int8.onnx';
const DECODER_FILE = 'decoder_model_merged_int8.onnx';
const NO_FORMULA = '截图中没有可辨认的公式，请重新框选公式区域。';
const MODEL_ERROR = 'TexTeller 模型文件不兼容或已损坏，请重新下载模型。';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(MODEL_ERROR);
  return value as Record<string, unknown>;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    return object(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    throw new Error(MODEL_ERROR);
  }
}

/** Bounding box of everything that differs from the most common corner colour by more than 15. */
function inkBounds(rgb: Buffer, width: number, height: number) {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map((pixel) =>
    rgb.subarray(pixel * 3, pixel * 3 + 3).join(','),
  );
  // Like Counter.most_common: the highest count wins and ties keep corner order.
  const background = corners
    .reduce((best, colour) =>
      corners.filter((item) => item === colour).length >
      corners.filter((item) => item === best).length
        ? colour
        : best,
    )
    .split(',')
    .map(Number);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      // Matches cv2.cvtColor(absdiff, COLOR_BGR2GRAY) on the RGB array used upstream.
      const difference =
        0.114 * Math.abs(rgb[offset] - background[0]) +
        0.587 * Math.abs(rgb[offset + 1] - background[1]) +
        0.299 * Math.abs(rgb[offset + 2] - background[2]);
      if (Math.round(difference) > 15) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error(NO_FORMULA);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** torchvision Resize(size=447, max_size=448): the long side never exceeds 448 pixels. */
export function textellerResizedSize(width: number, height: number): [number, number] {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  let newShort = IMAGE_SIZE - 1;
  let newLong = Math.floor((newShort * long) / short);
  if (newLong > IMAGE_SIZE) {
    newShort = Math.max(1, Math.floor((IMAGE_SIZE * newShort) / newLong));
    newLong = IMAGE_SIZE;
  }
  return width <= height ? [newShort, newLong] : [newLong, newShort];
}

/**
 * Upstream inference transform: trim the background border, convert to grayscale, scale
 * to 447/448 pixels, normalize, then pad right and bottom with zero (after normalization).
 */
export async function prepareTextellerImage(image: Buffer): Promise<Float32Array> {
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new Error('截图为空，请重新框选公式。');
  }
  if (image.length > 25 * 1024 * 1024) {
    throw new Error('截图文件超过 25 MB，请缩小框选范围。');
  }
  let rgb: Buffer;
  let width: number;
  let height: number;
  try {
    const { data, info } = await sharp(image, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) throw new Error('Unexpected channels');
    rgb = data;
    width = info.width;
    height = info.height;
  } catch {
    throw new Error('无法读取截图，请使用有效的 PNG/JPEG 图片并缩小框选范围。');
  }
  const box = inkBounds(rgb, width, height);
  const gray = Buffer.allocUnsafe(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const offset = ((y + box.top) * width + x + box.left) * 3;
      gray[y * box.width + x] = Math.round(
        0.2989 * rgb[offset] + 0.587 * rgb[offset + 1] + 0.114 * rgb[offset + 2],
      );
    }
  }
  const [targetWidth, targetHeight] = textellerResizedSize(box.width, box.height);
  const resized = await sharp(gray, { raw: { width: box.width, height: box.height, channels: 1 } })
    .resize(targetWidth, targetHeight, { fit: 'fill', kernel: sharp.kernel.cubic })
    .extractChannel(0)
    .raw()
    .toBuffer();
  if (resized.length !== targetWidth * targetHeight) {
    throw new Error('无法读取截图，请使用有效的 PNG/JPEG 图片并缩小框选范围。');
  }
  const pixels = new Float32Array(IMAGE_SIZE * IMAGE_SIZE);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      pixels[y * IMAGE_SIZE + x] = (resized[y * targetWidth + x] / 255 - IMAGE_MEAN) / IMAGE_STD;
    }
  }
  return pixels;
}

/** Replace `\name{content}` with ` content `, matching braces (upstream remove_style). */
function unwrapCommand(latex: string, name: string): string {
  const opening = `${name}{`;
  let result = latex;
  let from = 0;
  for (;;) {
    const start = result.indexOf(opening, from);
    if (start < 0) return result;
    let depth = 0;
    let end = start + name.length;
    for (; end < result.length; end++) {
      const character = result[end];
      if (character === '\\') end++;
      else if (character === '{') depth++;
      else if (character === '}' && --depth === 0) break;
    }
    if (end >= result.length) return result;
    result = `${result.slice(0, start)} ${result.slice(start + opening.length, end)} ${result.slice(end + 1)}`;
    from = start;
  }
}

/**
 * TexTeller writes display delimiters, often adds bold styling the screenshot does not
 * have, and uses `split`, which is only valid inside an equation. Return a bare formula
 * that works inline and in display math, as the other engines do.
 */
export function cleanTextellerLatex(latex: string): string {
  let result = latex.trim();
  const delimited = /^(?:\\\[([\s\S]*)\\\]|\$\$([\s\S]*)\$\$|\\\(([\s\S]*)\\\))$/.exec(result);
  if (delimited) result = (delimited[1] ?? delimited[2] ?? delimited[3]).trim();
  for (const name of ['\\bm', '\\boldsymbol']) result = unwrapCommand(result, name);
  return result
    .replace(/\\(begin|end)\{split\}/g, '\\$1{aligned}')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +$/gm, '')
    .trim();
}

function checkOptions(options: MfrRecognitionOptions): { maxTokens: number; timeoutMs: number } {
  const maxTokens = options.maxTokens ?? MAX_TOKENS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS) {
    throw new Error(`TexTeller maxTokens must be an integer between 1 and ${MAX_TOKENS}.`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
    throw new Error('TexTeller timeoutMs must be greater than 0 and no more than 300000.');
  }
  return { maxTokens, timeoutMs };
}

function sameNames(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((name) => actual.includes(name));
}

function disposeAll(tensors: Iterable<ort.Tensor | undefined>): void {
  for (const tensor of tensors) tensor?.dispose();
}

export async function createTextellerEngine(modelDir: string): Promise<MfrEngine> {
  const [config, generation, preprocessor, tokenizerData] = await Promise.all([
    readJson(join(modelDir, 'config.json')),
    readJson(join(modelDir, 'generation_config.json')),
    readJson(join(modelDir, 'preprocessor_config.json')),
    readJson(join(modelDir, 'tokenizer.json')),
  ]);
  const encoderConfig = object(config.encoder);
  const decoderConfig = object(config.decoder);
  const size = object(preprocessor.size);
  const layers = decoderConfig.decoder_layers;
  const heads = decoderConfig.decoder_attention_heads;
  const modelWidth = decoderConfig.d_model;
  const vocabularySize = decoderConfig.vocab_size;
  const startToken = generation.bos_token_id;
  const endToken = generation.eos_token_id;
  let tokenizer: ReturnType<typeof createByteLevelTokenizer>;
  try {
    tokenizer = createByteLevelTokenizer(tokenizerData);
  } catch {
    throw new Error(MODEL_ERROR);
  }
  if (
    encoderConfig.image_size !== IMAGE_SIZE ||
    encoderConfig.num_channels !== 1 ||
    size.height !== IMAGE_SIZE ||
    size.width !== IMAGE_SIZE ||
    JSON.stringify(preprocessor.image_mean) !== JSON.stringify([IMAGE_MEAN]) ||
    JSON.stringify(preprocessor.image_std) !== JSON.stringify([IMAGE_STD]) ||
    !Number.isInteger(layers) ||
    !Number.isInteger(heads) ||
    !Number.isInteger(modelWidth) ||
    (modelWidth as number) % (heads as number) !== 0 ||
    startToken !== 0 ||
    endToken !== 2 ||
    vocabularySize !== tokenizer.vocabularySize
  ) {
    throw new Error(MODEL_ERROR);
  }
  const headSize = (modelWidth as number) / (heads as number);
  const cacheNames = Array.from({ length: layers as number }, (_, layer) =>
    ['decoder.key', 'decoder.value', 'encoder.key', 'encoder.value'].map(
      (kind) => `${layer}.${kind}`,
    ),
  ).flat();
  const decoderCache = cacheNames.filter((name) => name.includes('.decoder.'));
  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: ['cpu'],
    intraOpNumThreads: Math.min(4, Math.max(2, Math.floor(availableParallelism() / 2))),
    interOpNumThreads: 1,
    executionMode: 'sequential',
    graphOptimizationLevel: 'all',
  };
  let encoder: ort.InferenceSession | undefined;
  let decoder: ort.InferenceSession | undefined;
  try {
    encoder = await ort.InferenceSession.create(join(modelDir, ENCODER_FILE), sessionOptions);
    decoder = await ort.InferenceSession.create(join(modelDir, DECODER_FILE), sessionOptions);
    if (
      !sameNames(encoder.inputNames, ['pixel_values']) ||
      !encoder.outputNames.includes('last_hidden_state') ||
      !sameNames(decoder.inputNames, [
        'input_ids',
        'encoder_hidden_states',
        'use_cache_branch',
        ...cacheNames.map((name) => `past_key_values.${name}`),
      ]) ||
      !sameNames(decoder.outputNames, ['logits', ...cacheNames.map((name) => `present.${name}`)])
    ) {
      throw new Error(MODEL_ERROR);
    }
  } catch (error) {
    await Promise.allSettled([encoder?.release(), decoder?.release()]);
    throw error instanceof Error && error.message === MODEL_ERROR ? error : new Error(MODEL_ERROR);
  }
  const encoderSession = encoder;
  const decoderSession = decoder;
  // The first step computes every cache; later steps reuse the encoder cache and only
  // fetch what changes, avoiding a copy of the large cross-attention cache per token.
  const firstFetches = ['logits', ...cacheNames.map((name) => `present.${name}`)];
  const cachedFetches = ['logits', ...decoderCache.map((name) => `present.${name}`)];
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
    const pixels = new ort.Tensor('float32', await prepareTextellerImage(image), [
      1,
      1,
      IMAGE_SIZE,
      IMAGE_SIZE,
    ]);
    const empty = new ort.Tensor('float32', new Float32Array(0), [1, heads as number, 0, headSize]);
    const encoderCache = new Map<string, ort.Tensor>();
    let decoderPast = new Map<string, ort.Tensor>();
    let encoded: ort.InferenceSession.ReturnType | undefined;
    try {
      checkTimeout();
      encoded = await encoderSession.run({ pixel_values: pixels });
      const hiddenState = encoded.last_hidden_state;
      if (!hiddenState || hiddenState.type !== 'float32' || hiddenState.dims.length !== 3) {
        throw new Error(MODEL_ERROR);
      }
      const tokenIds: number[] = [startToken as number];
      let logProbability = 0;
      let lowestProbability = 1;
      const degeneration = createDegenerationGuard();
      for (let index = 0; index < maxTokens; index++) {
        checkTimeout();
        const first = index === 0;
        const feeds: Record<string, ort.Tensor> = {
          input_ids: new ort.Tensor('int64', BigInt64Array.of(BigInt(tokenIds.at(-1)!)), [1, 1]),
          encoder_hidden_states: hiddenState,
          use_cache_branch: new ort.Tensor('bool', [!first], [1]),
        };
        for (const name of cacheNames) {
          feeds[`past_key_values.${name}`] = first
            ? empty
            : (encoderCache.get(name) ?? decoderPast.get(name))!;
        }
        let outputs: ort.InferenceSession.ReturnType;
        try {
          outputs = await decoderSession.run(feeds, first ? firstFetches : cachedFetches);
        } finally {
          feeds.input_ids.dispose();
          feeds.use_cache_branch.dispose();
        }
        const next = new Map<string, ort.Tensor>();
        for (const name of cacheNames) {
          const tensor = outputs[`present.${name}`];
          if (!tensor) continue;
          if (name.includes('.encoder.')) encoderCache.set(name, tensor);
          else next.set(name, tensor);
        }
        disposeAll(decoderPast.values());
        decoderPast = next;
        const logits = outputs.logits;
        let nextToken = -1;
        try {
          if (
            !logits ||
            logits.type !== 'float32' ||
            logits.dims.length !== 3 ||
            logits.dims[1] !== 1 ||
            logits.dims[2] !== tokenizer.vocabularySize ||
            decoderPast.size !== decoderCache.length ||
            encoderCache.size !== cacheNames.length - decoderCache.length
          ) {
            throw new Error(MODEL_ERROR);
          }
          checkTimeout();
          const scores = logits.data as Float32Array;
          let bestScore = -Infinity;
          for (let token = 0; token < tokenizer.vocabularySize; token++) {
            if (scores[token] > bestScore) {
              bestScore = scores[token];
              nextToken = token;
            }
          }
          if (nextToken < 0 || !Number.isFinite(bestScore)) throw new Error(MODEL_ERROR);
          let total = 0;
          for (let token = 0; token < tokenizer.vocabularySize; token++) {
            total += Math.exp(scores[token] - bestScore);
          }
          const probability = 1 / total;
          logProbability += Math.log(probability);
          lowestProbability = Math.min(lowestProbability, probability);
          if (nextToken !== endToken && degeneration.add(probability)) {
            // Text, code and interface screenshots decode into long low-confidence runs.
            throw new Error(NO_FORMULA);
          }
        } finally {
          logits?.dispose();
        }
        if (nextToken === endToken) {
          const latex = cleanTextellerLatex(tokenizer.decode(tokenIds.slice(1)));
          if (!latex) throw new Error('没有识别到公式，请框选清晰的单个公式后重试。');
          return {
            latex,
            elapsedMs: performance.now() - started,
            tokenCount: tokenIds.length - 1,
            confidence: Math.exp(logProbability / tokenIds.length),
            lowestTokenProbability: lowestProbability,
          };
        }
        tokenIds.push(nextToken);
      }
      throw new Error(`公式输出超过 ${maxTokens} 个 token，结果可能不完整，请分别框选较短的公式。`);
    } finally {
      pixels.dispose();
      empty.dispose();
      disposeAll(decoderPast.values());
      disposeAll(encoderCache.values());
      if (encoded) disposeAll(Object.values(encoded));
    }
  }

  return {
    async recognize(image, options = {}) {
      if (disposed) throw new Error('TexTeller 引擎已关闭，请重新启用本地识别。');
      if (active) throw new Error('TexTeller 正在识别另一张截图，请稍候再试。');
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
          const results = await Promise.allSettled([
            encoderSession.release(),
            decoderSession.release(),
          ]);
          for (const result of results) if (result.status === 'rejected') throw result.reason;
        })();
      }
      return releasing;
    },
  };
}
