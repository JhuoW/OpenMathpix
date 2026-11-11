import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWindowCloseHandler } from '../src/main/window-close';

test('closing hides to tray without minimizing or terminating the process', () => {
  const calls: string[] = [];
  const state = { quitting: false, destroyed: false };
  const close = createWindowCloseHandler({
    isQuitting: () => state.quitting,
    isDestroyed: () => state.destroyed,
    hide: () => calls.push('hide'),
  });
  close({ preventDefault: () => calls.push('prevent') });
  assert.deepEqual(calls, ['prevent', 'hide']);
  calls.length = 0;
  state.quitting = true;
  close({ preventDefault: () => calls.push('prevent') });
  assert.equal(calls.length, 0);
  state.quitting = false;
  state.destroyed = true;
  close({ preventDefault: () => calls.push('prevent') });
  assert.deepEqual(calls, ['prevent']);
});
