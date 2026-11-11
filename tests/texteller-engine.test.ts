import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  cleanTextellerLatex,
  prepareTextellerImage,
  textellerResizedSize,
} from '../src/services/texteller-engine';
import { createByteLevelTokenizer } from '../src/services/mfr-tokenizer';
import {
  TEXTELLER_FILES,
  TEXTELLER_REVISION,
  textellerFileUrl,
} from '../src/services/texteller-model';

const SIZE = 448;
const MEAN = 0.9545467;
const STD = 0.15394445;

test('TexTeller pins six files of one revision and maps ONNX files to their remote folder', () => {
  assert.match(TEXTELLER_REVISION, /^[a-f\d]{40}$/);
  assert.deepEqual(
    TEXTELLER_FILES.map((file) => file.name),
    [
      'encoder_model_int8.onnx',
      'decoder_model_merged_int8.onnx',
      'config.json',
      'generation_config.json',
      'preprocessor_config.json',
      'tokenizer.json',
    ],
  );
  for (const file of TEXTELLER_FILES) {
    assert.ok(file.size > 0);
    assert.match(file.sha256, /^[a-f\d]{64}$/);
    assert.ok(!file.name.includes('/'), 'models are installed as a flat folder');
  }
  const base = `onnx-community/TexTeller3-ONNX/resolve/${TEXTELLER_REVISION}`;
  assert.equal(
    textellerFileUrl(TEXTELLER_FILES[0]),
    `https://huggingface.co/${base}/onnx/encoder_model_int8.onnx?download=true`,
  );
  assert.equal(
    textellerFileUrl(TEXTELLER_FILES[5], 'hf-mirror'),
    `https://hf-mirror.com/${base}/tokenizer.json?download=true`,
  );
  assert.throws(() => textellerFileUrl({ name: '../other.onnx', size: 1, sha256: '' }), /Unknown/);
  const total = TEXTELLER_FILES.reduce((sum, file) => sum + file.size, 0);
  assert.ok(total > 300_000_000 && total < 330_000_000, 'the UI states about 320 MB');
});

test('TexTeller resizing follows torchvision Resize(447, max_size=448)', () => {
  assert.deepEqual(textellerResizedSize(100, 100), [447, 447]);
  assert.deepEqual(textellerResizedSize(1000, 100), [448, 44]);
  assert.deepEqual(textellerResizedSize(100, 1000), [44, 448]);
  // Nearly square images keep 447 on the short side.
  assert.deepEqual(textellerResizedSize(447, 448), [447, 448]);
  assert.deepEqual(textellerResizedSize(5000, 3), [448, 1]);
});

test('TexTeller preprocessing trims the border, normalizes ink and pads with zero', async () => {
  const pixels = await prepareTextellerImage(await readFile('tests/fixtures/mfr/quadratic.png'));
  assert.equal(pixels.length, SIZE * SIZE);
  const white = (1 - MEAN) / STD;
  const black = (0 - MEAN) / STD;
  // A wide formula fills the first rows; the bottom rows are padding.
  assert.equal(pixels[(SIZE - 1) * SIZE], 0);
  assert.equal(pixels[SIZE * SIZE - 1], 0);
  const top = pixels.subarray(0, SIZE * 40);
  assert.ok(
    top.some((value) => value < black / 2),
    'formula ink is present',
  );
  assert.ok(
    top.some((value) => Math.abs(value - white) < 0.05),
    'white paper is present',
  );
  // The trimmed formula touches the image's left edge (possibly only anti-aliased ink).
  let leftInk = false;
  for (let y = 0; y < 100; y++) if (pixels[y * SIZE] < white - 1) leftInk = true;
  assert.ok(leftInk);

  // A transparent PNG is flattened onto white; dark backgrounds keep their ink box.
  const dark = await prepareTextellerImage(
    await readFile('tests/fixtures/mfr/dark-background.png'),
  );
  assert.equal(dark.length, SIZE * SIZE);
  const transparent = await sharp({
    create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  await assert.rejects(prepareTextellerImage(transparent), /没有可辨认/);
  await assert.rejects(
    prepareTextellerImage(await readFile('tests/fixtures/mfr/blank.png')),
    /没有可辨认/,
  );
  await assert.rejects(prepareTextellerImage(Buffer.alloc(0)), /截图为空/);
  await assert.rejects(prepareTextellerImage(Buffer.from('invalid')), /无法读取截图/);
  await assert.rejects(prepareTextellerImage(Buffer.alloc(25 * 1024 * 1024 + 1)), /25 MB/);
});

test('TexTeller output loses display delimiters, invented bold and equation-only split', () => {
  assert.equal(cleanTextellerLatex(String.raw`\[x=1\]`), 'x=1');
  assert.equal(cleanTextellerLatex(String.raw`$$ a+b $$`), 'a+b');
  assert.equal(
    cleanTextellerLatex(String.raw`\[\bm{I_{5}}=\begin{bmatrix}\bm{1}&\bm{0}\end{bmatrix}\]`),
    String.raw`I_{5} =\begin{bmatrix} 1 & 0 \end{bmatrix}`,
  );
  assert.equal(
    cleanTextellerLatex(String.raw`\boldsymbol{\alpha}x+\boldsymbol{\frac{a}{b}}`),
    String.raw`\alpha x+ \frac{a}{b}`,
  );
  // Legitimate bold vectors and similarly named commands are preserved.
  assert.equal(cleanTextellerLatex(String.raw`\mathbf{E}\bmod 2`), String.raw`\mathbf{E}\bmod 2`);
  assert.equal(
    cleanTextellerLatex(String.raw`\[\begin{split}a&=b\\ c&=d\end{split}\]`),
    String.raw`\begin{aligned}a&=b\\ c&=d\end{aligned}`,
  );
  // An unbalanced command is left alone rather than corrupted.
  assert.equal(cleanTextellerLatex(String.raw`\bm{x`), String.raw`\bm{x`);
});

test('byte-level tokenizer decodes non-special added tokens as text', () => {
  const tokenizer = createByteLevelTokenizer({
    model: { type: 'BPE', vocab: { '<s>': 0, '<pad>': 1, '</s>': 2, x: 3, 'Ġ=': 4 } },
    decoder: { type: 'ByteLevel' },
    added_tokens: [
      { id: 0, content: '<s>', special: true },
      { id: 2, content: '</s>', special: true },
      { id: 5, content: '一', special: false },
    ],
  });
  assert.equal(tokenizer.vocabularySize, 6);
  assert.equal(tokenizer.decode([0, 3, 4, 5, 2]), 'x =一');
});
