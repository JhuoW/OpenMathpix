import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterSnipWindow, isOnScreen } from '../src/main/snip-window';

test('only a window on screen is hidden before capture; a minimized one keeps its taskbar button', () => {
  assert.equal(isOnScreen({ visible: true, minimized: false }), true);
  // Windows reports a minimized window as not visible; other platforms may not.
  assert.equal(isOnScreen({ visible: false, minimized: true }), false);
  assert.equal(isOnScreen({ visible: true, minimized: true }), false);
  assert.equal(isOnScreen({ visible: false, minimized: false }), false);
});

test('a captured snip in window mode brings the result window forward, even from minimized', () => {
  for (const wasOnScreen of [true, false]) {
    assert.equal(afterSnipWindow({ wasOnScreen, captured: true, afterSnip: 'window' }), 'focus');
  }
});

test('background copies and cancelled snips never take focus or un-minimize the window', () => {
  for (const captured of [true, false]) {
    assert.equal(
      afterSnipWindow({ wasOnScreen: true, captured, afterSnip: 'notify' }),
      'show-inactive',
    );
    assert.equal(afterSnipWindow({ wasOnScreen: false, captured, afterSnip: 'notify' }), 'none');
  }
  assert.equal(
    afterSnipWindow({ wasOnScreen: true, captured: false, afterSnip: 'window' }),
    'show-inactive',
  );
  assert.equal(
    afterSnipWindow({ wasOnScreen: false, captured: false, afterSnip: 'window' }),
    'none',
  );
});
