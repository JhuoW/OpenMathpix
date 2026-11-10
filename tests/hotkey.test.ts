import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceleratorFromKey, acceleratorKeys, type KeyInput } from '../src/renderer/hotkey';

const key = (code: string, modifiers: Partial<KeyInput> = {}): KeyInput => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
});

test('key presses become portable Electron accelerators', () => {
  assert.deepEqual(acceleratorFromKey(key('KeyS', { ctrlKey: true, shiftKey: true }), false), {
    kind: 'accelerator',
    accelerator: 'CommandOrControl+Shift+S',
  });
  assert.deepEqual(acceleratorFromKey(key('KeyS', { metaKey: true, altKey: true }), true), {
    kind: 'accelerator',
    accelerator: 'CommandOrControl+Alt+S',
  });
  assert.deepEqual(acceleratorFromKey(key('Digit2', { altKey: true }), false), {
    kind: 'accelerator',
    accelerator: 'Alt+2',
  });
  assert.deepEqual(acceleratorFromKey(key('F9'), false), {
    kind: 'accelerator',
    accelerator: 'F9',
  });
});

test('shortcuts that would block typing, or are only modifiers, are not accepted', () => {
  assert.deepEqual(acceleratorFromKey(key('KeyS'), false), { kind: 'incomplete' });
  assert.deepEqual(acceleratorFromKey(key('KeyS', { shiftKey: true }), false), {
    kind: 'incomplete',
  });
  assert.deepEqual(acceleratorFromKey(key('ControlLeft', { ctrlKey: true }), false), {
    kind: 'incomplete',
  });
  assert.deepEqual(acceleratorFromKey(key('Escape'), false), { kind: 'cancel' });
});

test('accelerators are displayed with platform key names', () => {
  assert.deepEqual(acceleratorKeys('CommandOrControl+Shift+S', false), ['Ctrl', 'Shift', 'S']);
  assert.deepEqual(acceleratorKeys('CommandOrControl+Shift+S', true), ['⌘', '⇧', 'S']);
  assert.deepEqual(acceleratorKeys('Alt+F2', false), ['Alt', 'F2']);
});
