import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSettingsUpdates } from '../src/shared/settings';
import { saveWithShortcut } from '../src/main/shortcuts';

test('settings accept local endpoints, normalize text, and allow clearing a token', () => {
  assert.deepEqual(
    validateSettingsUpdates({
      apiUrl: ' http://localhost:8080/layout-parsing ',
      accessToken: '  ',
      historyLimit: 10,
    }),
    { apiUrl: 'http://localhost:8080/layout-parsing', accessToken: '', historyLimit: 10 },
  );
});

test('invalid settings cannot cross the IPC boundary', () => {
  for (const updates of [
    null,
    [],
    { apiUrl: 'file:///tmp/test' },
    { apiUrl: 'https://user:pass@example.com' },
    { historyLimit: 0 },
    { historyLimit: 501 },
    { historyLimit: NaN },
    { historyLimit: 10.5 },
    { pipeline: 'unknown' },
    { ocrEngine: 'unknown' },
    { theme: 'invalid' },
    { defaultOutputFormat: 'image' },
    { snipHotkey: ' ' },
    { encryptedToken: 'injected' },
    { accessToken: 123 },
  ]) {
    assert.throws(() => validateSettingsUpdates(updates));
  }
});

test('local OCR settings need no cloud credentials', () => {
  assert.deepEqual(validateSettingsUpdates({ ocrEngine: 'mfr' }), { ocrEngine: 'mfr' });
  assert.deepEqual(validateSettingsUpdates({ ocrEngine: 'paddleocr' }), { ocrEngine: 'paddleocr' });
});

function registry(accept = true) {
  const registered = new Set(['Control+Shift+S']);
  return {
    registered,
    register: (key: string) => {
      if (accept) registered.add(key);
      return accept;
    },
    unregister: (key: string) => {
      registered.delete(key);
    },
    isRegistered: (key: string) => registered.has(key),
  };
}

test('a conflicting shortcut leaves the previous shortcut and persisted settings intact', () => {
  const shortcuts = registry(false);
  let saved = false;
  assert.throws(
    () =>
      saveWithShortcut(
        'Control+Shift+S',
        'Control+Shift+D',
        shortcuts,
        () => {},
        () => {
          saved = true;
        },
      ),
    /unavailable/,
  );
  assert.equal(saved, false);
  assert.deepEqual([...shortcuts.registered], ['Control+Shift+S']);
});

test('failed persistence releases the new shortcut without losing the old one', () => {
  const shortcuts = registry();
  assert.throws(
    () =>
      saveWithShortcut(
        'Control+Shift+S',
        'Control+Shift+D',
        shortcuts,
        () => {},
        () => {
          throw new Error('disk full');
        },
      ),
    /disk full/,
  );
  assert.deepEqual([...shortcuts.registered], ['Control+Shift+S']);
});

test('saving a new shortcut immediately replaces the old shortcut', () => {
  const shortcuts = registry();
  let saved = false;
  saveWithShortcut(
    'Control+Shift+S',
    'Control+Shift+D',
    shortcuts,
    () => {},
    () => {
      saved = true;
    },
  );
  assert.equal(saved, true);
  assert.deepEqual([...shortcuts.registered], ['Control+Shift+D']);
});

test('saving retries a shortcut whose startup registration failed', () => {
  const shortcuts = registry();
  shortcuts.registered.clear();
  saveWithShortcut(
    'Control+Shift+S',
    'Control+Shift+S',
    shortcuts,
    () => {},
    () => {},
  );
  assert.deepEqual([...shortcuts.registered], ['Control+Shift+S']);
});
