import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizedCropBounds } from '../src/main/capture-geometry';
import type { SnipSelection } from '../src/shared/types';

test('normalized crop uses actual image resolution independently of display DPI', () => {
  const selection = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  assert.deepEqual(normalizedCropBounds(selection, { width: 1920, height: 1080 }), {
    x: 480,
    y: 270,
    width: 960,
    height: 540,
  });
  assert.deepEqual(normalizedCropBounds(selection, { width: 3840, height: 2160 }), {
    x: 960,
    y: 540,
    width: 1920,
    height: 1080,
  });
});

test('crop clips the right and bottom boundaries to the image', () => {
  assert.deepEqual(
    normalizedCropBounds({ x: 0.9, y: 0.8, width: 0.2, height: 0.4 }, { width: 1000, height: 500 }),
    { x: 900, y: 400, width: 100, height: 100 },
  );
});

test('crop rounds endpoints rather than accumulating rounding error', () => {
  assert.deepEqual(
    normalizedCropBounds(
      { x: 0.105, y: 0.105, width: 0.105, height: 0.105 },
      { width: 100, height: 100 },
    ),
    { x: 11, y: 11, width: 10, height: 10 },
  );
});

test('full-screen selection preserves all pixels', () => {
  assert.deepEqual(
    normalizedCropBounds({ x: 0, y: 0, width: 1, height: 1 }, { width: 1365, height: 767 }),
    { x: 0, y: 0, width: 1365, height: 767 },
  );
});

test('malformed, out-of-range and non-finite selection coordinates are rejected', () => {
  const valid = { x: 0, y: 0, width: 0.5, height: 0.5 };
  const invalid = [
    null,
    {},
    { ...valid, x: -0.1 },
    { ...valid, y: 1 },
    { ...valid, width: -1 },
    { ...valid, height: 0 },
    { ...valid, width: 1.1 },
    { ...valid, x: NaN },
    { ...valid, height: Infinity },
    { ...valid, x: '0' },
  ];
  for (const selection of invalid) {
    assert.equal(
      normalizedCropBounds(selection as SnipSelection, {
        width: 100,
        height: 100,
      }),
      null,
    );
  }
});

test('empty and tiny images or selections never reach nativeImage.crop', () => {
  const selection = { x: 0, y: 0, width: 1, height: 1 };
  assert.equal(normalizedCropBounds(selection, { width: 0, height: 100 }), null);
  assert.equal(normalizedCropBounds(selection, { width: 100, height: 4 }), null);
  assert.equal(
    normalizedCropBounds({ ...selection, width: 0.01 }, { width: 100, height: 100 }),
    null,
  );
  assert.equal(normalizedCropBounds(selection, { width: NaN, height: 100 }), null);
});
