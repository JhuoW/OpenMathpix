import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AppSettings } from '../src/shared/types';
import { createSettingsAutosave } from '../src/renderer/settings-autosave';

const initial: AppSettings = {
  ocrEngine: 'mfr',
  mfrModelPath: '',
  apiUrl: '',
  accessToken: '',
  pipeline: 'PP-StructureV3',
  snipHotkey: 'CommandOrControl+Shift+S',
  defaultOutputFormat: 'latex',
  historyLimit: 100,
  theme: 'system',
  language: 'en',
  afterSnip: 'window',
  latexCopyStyle: 'plain',
  cleanLatex: true,
  modelSource: 'huggingface',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for the autosave queue');
    await sleep(2);
  }
}

test('API drafts are coalesced and preserved after leaving the Settings page', async () => {
  const patches: Partial<AppSettings>[] = [];
  let committed = initial;
  const session = createSettingsAutosave(
    async (patch) => {
      patches.push(patch);
      return { ...initial, ...patch };
    },
    (settings) => {
      committed = settings;
    },
    60_000,
  );
  session.accept(initial);
  const unsubscribe = session.subscribe(() => {});
  session.edit('ocrEngine', 'paddleocr');
  session.edit('apiUrl', ' https://example.com/ocr ');
  session.edit('accessToken', ' token ');
  session.flush(); // Settings unmount flushes, but does not cancel the queue.
  unsubscribe();
  await until(() => committed.ocrEngine === 'paddleocr');
  assert.deepEqual(patches, [
    { ocrEngine: 'paddleocr', apiUrl: 'https://example.com/ocr', accessToken: 'token' },
  ]);
  assert.equal(session.getSnapshot().draft?.apiUrl, 'https://example.com/ocr');
  assert.equal(session.getSnapshot().draft?.accessToken, 'token');
});

test('a pending API check does not block preferences or overwrite a newer imported model path', async () => {
  const api = deferred<AppSettings>();
  const patches: Partial<AppSettings>[] = [];
  let committed = initial;
  const session = createSettingsAutosave(
    async (patch) => {
      patches.push(patch);
      if (patch.ocrEngine) return api.promise;
      return { ...committed, ...patch };
    },
    (settings) => {
      committed = settings;
    },
    0,
  );
  session.accept(initial);
  session.edit('ocrEngine', 'paddleocr');
  session.edit('apiUrl', 'https://example.com/ocr');
  await until(() => patches.length === 1);
  session.edit('theme', 'dark', true);
  await until(() => committed.theme === 'dark');
  const external = { ...committed, mfrModelPath: '/models/validated-local' };
  session.accept(external);
  api.resolve({ ...initial, ocrEngine: 'paddleocr', apiUrl: 'https://example.com/ocr' });
  await until(() => committed.ocrEngine === 'paddleocr');
  assert.equal(committed.theme, 'dark');
  assert.equal(committed.mfrModelPath, '/models/validated-local');
  assert.equal(session.getSnapshot().draft?.theme, 'dark');
  assert.equal(session.getSnapshot().draft?.mfrModelPath, '/models/validated-local');
});

test('new edits survive an earlier success and the same group applies in order', async () => {
  const first = deferred<AppSettings>();
  const second = deferred<AppSettings>();
  const patches: Partial<AppSettings>[] = [];
  let committed = initial;
  const session = createSettingsAutosave(
    (patch) => {
      patches.push(patch);
      return patches.length === 1 ? first.promise : second.promise;
    },
    (settings) => {
      committed = settings;
    },
    0,
  );
  session.accept(initial);
  session.edit('snipHotkey', 'CommandOrControl+Shift+A');
  await until(() => patches.length === 1);
  session.edit('snipHotkey', 'CommandOrControl+Shift+B');
  await sleep(5);
  assert.equal(patches.length, 1);
  first.resolve({ ...initial, snipHotkey: 'CommandOrControl+Shift+A' });
  await until(() => patches.length === 2);
  assert.equal(session.getSnapshot().draft?.snipHotkey, 'CommandOrControl+Shift+B');
  second.resolve({ ...initial, snipHotkey: 'CommandOrControl+Shift+B' });
  await until(() => !session.getSnapshot().saving);
  assert.equal(committed.snipHotkey, 'CommandOrControl+Shift+B');
});

test('returning to the original value during an in-flight change still persists the reversal', async () => {
  const first = deferred<AppSettings>();
  const patches: Partial<AppSettings>[] = [];
  let committed = initial;
  const session = createSettingsAutosave(
    async (patch) => {
      patches.push(patch);
      if (patches.length === 1) return first.promise;
      return { ...initial, ...patch };
    },
    (settings) => {
      committed = settings;
    },
    0,
  );
  session.accept(initial);
  session.edit('theme', 'dark');
  await until(() => patches.length === 1);
  session.edit('theme', 'system');
  first.resolve({ ...initial, theme: 'dark' });
  await until(() => patches.length === 2 && !session.getSnapshot().saving);
  assert.equal(committed.theme, 'system');
  assert.deepEqual(patches, [{ theme: 'dark' }, { theme: 'system' }]);
});

test('invalid drafts retain the previous applied value and do not block unrelated changes', async () => {
  const patches: Partial<AppSettings>[] = [];
  let committed = initial;
  const session = createSettingsAutosave(
    async (patch) => {
      patches.push(patch);
      return { ...committed, ...patch };
    },
    (settings) => {
      committed = settings;
    },
    0,
  );
  session.accept(initial);
  session.edit('historyLimit', 1);
  session.edit('defaultOutputFormat', 'markdown');
  await until(
    () =>
      !!session.getSnapshot().errors.historyLimit && committed.defaultOutputFormat === 'markdown',
  );
  assert.equal(committed.historyLimit, 100);
  assert.equal(session.getSnapshot().draft?.historyLimit, 1);
  assert.deepEqual(patches, [{ defaultOutputFormat: 'markdown' }]);
  session.edit('historyLimit', 50);
  await until(() => committed.historyLimit === 50);
  assert.equal(session.getSnapshot().errors.historyLimit, undefined);
});

test('a failed old request cannot replace the feedback for a corrected draft', async () => {
  const first = deferred<AppSettings>();
  let calls = 0;
  const session = createSettingsAutosave(
    async (patch) => {
      calls += 1;
      if (calls === 1) return first.promise;
      return { ...initial, ...patch };
    },
    () => {},
    0,
  );
  session.accept(initial);
  session.edit('snipHotkey', 'CommandOrControl+Shift+A');
  await until(() => calls === 1);
  session.edit('snipHotkey', 'CommandOrControl+Shift+B');
  first.reject(new Error('This shortcut is unavailable.'));
  await until(() => calls === 2 && !session.getSnapshot().saving);
  assert.equal(session.getSnapshot().errors.snipHotkey, undefined);
  assert.equal(session.getSnapshot().applied?.snipHotkey, 'CommandOrControl+Shift+B');
});

test('failed engine activation keeps the active engine and a later correction retries automatically', async () => {
  let fail = true;
  let committed = initial;
  const session = createSettingsAutosave(
    async (patch) => {
      if (fail)
        throw new Error("Error invoking remote method 'settings:set': Error: Connection refused");
      return { ...committed, ...patch };
    },
    (settings) => {
      committed = settings;
    },
    0,
  );
  session.accept(initial);
  session.edit('ocrEngine', 'paddleocr');
  session.edit('apiUrl', 'https://example.com/ocr');
  await until(() => !!session.getSnapshot().errors.recognition);
  assert.equal(session.getSnapshot().applied?.ocrEngine, 'mfr');
  assert.equal(session.getSnapshot().draft?.ocrEngine, 'paddleocr');
  assert.equal(session.getSnapshot().errors.recognition, 'Connection refused');
  fail = false;
  session.edit('accessToken', 'corrected-token');
  await until(() => committed.ocrEngine === 'paddleocr');
  assert.equal(committed.apiUrl, 'https://example.com/ocr');
  assert.equal(committed.accessToken, 'corrected-token');
});

test('a language change from the native menu survives an older preference response', async () => {
  const first = deferred<AppSettings>();
  let started = false;
  let committed = initial;
  const session = createSettingsAutosave(
    async () => {
      started = true;
      return first.promise;
    },
    (settings) => {
      committed = settings;
    },
    0,
  );
  session.accept(initial);
  session.edit('theme', 'dark');
  await until(() => started);
  session.accept({ ...initial, language: 'zh-CN' });
  first.resolve({ ...initial, theme: 'dark' });
  await until(() => !session.getSnapshot().saving);
  assert.equal(committed.language, 'zh-CN');
  assert.equal(committed.theme, 'dark');
  assert.equal(session.getSnapshot().draft?.language, 'zh-CN');
});
