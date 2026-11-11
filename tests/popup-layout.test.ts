import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POPUP_SIZE, popupBounds } from '../src/main/popup-layout';

test('the copy popup sits in the bottom-right corner of the work area, above the taskbar', () => {
  // 1920 × 1080 display with a 48 px taskbar at the bottom.
  const bounds = popupBounds({ x: 0, y: 0, width: 1920, height: 1032 });
  assert.equal(bounds.x + bounds.width, 1920 - 12);
  assert.equal(bounds.y + bounds.height, 1032 - 12);
  assert.equal(bounds.width, POPUP_SIZE.width);
  // A display left of the primary one has negative coordinates.
  const left = popupBounds({ x: -1349, y: 0, width: 1349, height: 890 });
  assert.equal(left.x + left.width, -12);
  assert.ok(left.x >= -1349);
});

test('the popup never exceeds a very small work area', () => {
  const bounds = popupBounds({ x: 0, y: 0, width: 300, height: 90 });
  assert.ok(bounds.width <= 300 && bounds.height <= 90);
});
