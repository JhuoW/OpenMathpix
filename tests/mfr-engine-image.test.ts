import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { prepareMfrImage } from '../src/services/mfr-engine';

test('MFR preprocess produces RGB NCHW data and flattens transparency onto white', async () => {
  const width = 384;
  const pixels = Buffer.alloc(width * width * 4);
  // An opaque red half and a transparent black half become red and white.
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width / 2; x++) {
      pixels[(y * width + x) * 4] = 255;
      pixels[(y * width + x) * 4 + 3] = 255;
    }
  }
  const image = await sharp(pixels, { raw: { width, height: width, channels: 4 } })
    .png()
    .toBuffer();
  const result = await prepareMfrImage(image);
  const plane = width * width;
  assert.equal(result.length, plane * 3);
  assert.equal(result[0], 1);
  assert.equal(result[plane], -1);
  assert.equal(result[plane * 2], -1);
  assert.equal(result[width - 1], 1);
  assert.equal(result[plane + width - 1], 1);
  assert.equal(result[plane * 2 + width - 1], 1);
});

test('MFR rejects blank screenshots, invalid files, and empty input before inference', async () => {
  const blank = await sharp({
    create: { width: 80, height: 40, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  await assert.rejects(prepareMfrImage(blank), /没有可辨认的公式/);
  await assert.rejects(prepareMfrImage(Buffer.from('not an image')), /无法读取截图/);
  await assert.rejects(prepareMfrImage(Buffer.alloc(0)), /截图为空/);
});
