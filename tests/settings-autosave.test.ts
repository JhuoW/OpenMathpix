import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AppSettings } from '../src/shared/types';
import { createSettingsAutosave } from '../src/renderer/settings-autosave';

const initial: AppSettings = {
  ocrEngine: 'mfr',
  mfrModelPath: '',
  mfrDownloadDirectory: '',
  mfrModelEnabled: true,
  apiUrl: '',
  accessToken: '',
  textellerModelPath: '',
  textellerModelEnabled: true,
  textellerDownloadDirectory: '',
  pipeline: 'PP-StructureV3',
  snipHotkey: 'CommandOrControl+Shift+S',
  defaultOutputFormat: 'latex',
  historyLimit: 100,
  theme: 'system',
  language: 'en',
  afterSnip: 'window',
  latexCopyStyle: 'plain',
  cleanLatex: true,
  launchAtLogin: true,
  autoCheckUpdates: true,
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

test('API drafts survive page changes and only explicit Connect & Use commits them', async () => {
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
  session.flush(); // Navigation cannot initiate a billable connection test.
  unsubscribe();
  await sleep(5);
  assert.equal(patches.length, 0);
  assert.equal(committed.ocrEngine, 'mfr');
  assert.equal(await session.connect(), true);
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
  const connecting = session.connect();
  await until(() => patches.length === 1);
  session.edit('theme', 'dark', true);
  await until(() => committed.theme === 'dark');
  const external = { ...committed, mfrModelPath: '/models/validated-local' };
  session.accept(external);
  api.resolve({ ...initial, ocrEngine: 'paddleocr', apiUrl: 'https://example.com/ocr' });
  await connecting;
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

test('failed engine activation retains the active engine and corrections require an explicit retry', async () => {
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
  assert.equal(await session.connect(), false);
  await until(() => !!session.getSnapshot().errors.recognition);
  assert.equal(session.getSnapshot().applied?.ocrEngine, 'mfr');
  assert.equal(session.getSnapshot().draft?.ocrEngine, 'paddleocr');
  assert.equal(session.getSnapshot().errors.recognition, 'Connection refused');
  fail = false;
  session.edit('accessToken', 'corrected-token');
  await sleep(5);
  assert.equal(committed.ocrEngine, 'mfr');
  assert.equal(await session.connect(), true);
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

test('shutdown flush waits for settings to persist and reports unsaved drafts', async () => {
  const writing = deferred<AppSettings>();
  const session = createSettingsAutosave(
    () => writing.promise,
    () => {},
    60_000,
  );
  session.accept(initial);
  session.edit('theme', 'dark');
  let finished = false;
  const exiting = session.flushAndWait().then((saved) => {
    finished = true;
    return saved;
  });
  await until(() => session.getSnapshot().saving === 'theme');
  assert.equal(finished, false);
  writing.resolve({ ...initial, theme: 'dark' });
  assert.equal(await exiting, true);

  const failed = createSettingsAutosave(
    async () => {
      throw new Error('Disk full');
    },
    () => {},
    60_000,
  );
  failed.accept(initial);
  failed.edit('theme', 'dark');
  assert.equal(await failed.flushAndWait(), false);
  assert.equal(failed.getSnapshot().draft?.theme, 'dark');
});

test('PaddleOCR drafts are never sent by autosave or shutdown and can be discarded without a request', async () => {
  const saves: Partial<AppSettings>[] = [];
  const connects: Partial<AppSettings>[] = [];
  let applied = initial;
  const session = createSettingsAutosave(
    async (patch) => {
      saves.push(patch);
      return { ...applied, ...patch };
    },
    (fresh) => {
      applied = fresh;
    },
    0,
    async (patch) => {
      connects.push(patch);
      return { ...applied, ...patch };
    },
  );
  session.accept(initial);
  session.edit('ocrEngine', 'paddleocr');
  session.edit('apiUrl', 'https://example.test');
  session.edit('accessToken', 'secret');
  session.edit('theme', 'dark');
  assert.equal(await session.flushAndWait(), false);
  assert.deepEqual(saves, [{ theme: 'dark' }]);
  assert.deepEqual(connects, []);
  assert.equal(applied.ocrEngine, 'mfr');
  session.resetRecognition();
  assert.equal(await session.flushAndWait(), true);
  assert.equal(session.getSnapshot().draft?.accessToken, '');
  assert.equal(session.getSnapshot().draft?.theme, 'dark');
  assert.deepEqual(connects, []);
});

test('editing PaddleOCR credentials during connection preserves the newer draft without running another test', async () => {
  const response = deferred<AppSettings>();
  const connects: Partial<AppSettings>[] = [];
  let applied = initial;
  const session = createSettingsAutosave(
    async (patch) => ({ ...applied, ...patch }),
    (fresh) => {
      applied = fresh;
    },
    0,
    async (patch) => {
      connects.push(patch);
      return connects.length === 1 ? response.promise : { ...applied, ...patch };
    },
  );
  session.accept(initial);
  session.edit('ocrEngine', 'paddleocr');
  session.edit('apiUrl', 'https://example.test');
  session.edit('accessToken', 'first-key');
  const first = session.connect();
  assert.equal(
    await session.connect(),
    false,
    'double clicks cannot launch two validation requests',
  );
  session.edit('accessToken', 'second-key');
  response.resolve({
    ...initial,
    ocrEngine: 'paddleocr',
    apiUrl: 'https://example.test',
    accessToken: 'first-key',
  });
  assert.equal(await first, false, 'a newer draft still needs explicit validation');
  await sleep(5);
  assert.equal(connects.length, 1);
  assert.equal(applied.accessToken, 'first-key');
  assert.equal(session.getSnapshot().draft?.accessToken, 'second-key');
  assert.equal(await session.connect(), true);
  assert.equal(connects.length, 2);
  assert.equal(applied.accessToken, 'second-key');
});

test('an explicit reconnect tests an unchanged cloud configuration exactly once', async () => {
  const connected = {
    ...initial,
    ocrEngine: 'paddleocr' as const,
    apiUrl: 'https://example.test',
    accessToken: 'key',
  };
  const patches: Partial<AppSettings>[] = [];
  const session = createSettingsAutosave(
    async (patch) => {
      patches.push(patch);
      return { ...connected, ...patch };
    },
    () => {},
    0,
  );
  session.accept(connected);
  assert.equal(await session.flushAndWait(), true);
  assert.equal(patches.length, 0);
  assert.equal(await session.connect(), true);
  assert.deepEqual(patches, [{ ocrEngine: 'paddleocr' }]);
});

test('switching an unfinished cloud draft to either local engine discards hidden invalid fields', async () => {
  for (const engine of ['mfr', 'texteller'] as const) {
    const connected = {
      ...initial,
      ocrEngine: 'paddleocr' as const,
      apiUrl: 'https://example.test',
      accessToken: 'saved',
    };
    const patches: Partial<AppSettings>[] = [];
    let saved = connected as AppSettings;
    const session = createSettingsAutosave(
      async (patch) => {
        patches.push(patch);
        return { ...saved, ...patch };
      },
      (fresh) => {
        saved = fresh;
      },
      0,
    );
    session.accept(connected);
    session.edit('apiUrl', 'not a URL');
    session.edit('accessToken', 'unfinished');
    session.edit('ocrEngine', engine, true);
    assert.equal(await session.flushAndWait(), true);
    assert.deepEqual(patches, [{ ocrEngine: engine }]);
    assert.equal(saved.apiUrl, connected.apiUrl);
    assert.equal(saved.accessToken, connected.accessToken);
  }
});

test('returning cloud fields to their saved values leaves no pending edits or exit warning', async () => {
  const connected = {
    ...initial,
    ocrEngine: 'paddleocr' as const,
    apiUrl: 'https://example.test',
    accessToken: 'key',
  };
  let requests = 0;
  const session = createSettingsAutosave(
    async (patch) => {
      requests += 1;
      return { ...connected, ...patch };
    },
    () => {},
    0,
  );
  session.accept(connected);
  session.edit('accessToken', 'different');
  assert.equal(session.getSnapshot().pending, true);
  session.edit('accessToken', 'key');
  assert.equal(session.getSnapshot().pending, false);
  assert.equal(await session.flushAndWait(), true);
  assert.equal(requests, 0);
});

test('choosing a local engine without a model previews it and keeps the engine in use', async () => {
  let installed = false;
  const patches: Partial<AppSettings>[] = [];
  let saved = initial;
  const session = createSettingsAutosave(
    async (patch) => {
      patches.push(patch);
      return { ...saved, ...patch };
    },
    (fresh) => {
      saved = fresh;
    },
    0,
    undefined,
    (engine) => engine === 'paddleocr' || (engine === 'texteller' && !installed),
  );
  session.accept(initial);
  session.edit('ocrEngine', 'texteller', true);
  // A preview is neither applied nor reported as an unsaved change (e.g. when quitting).
  assert.equal(await session.flushAndWait(), true);
  assert.deepEqual(patches, []);
  assert.equal(session.getSnapshot().pending, false);
  assert.equal(session.getSnapshot().draft?.ocrEngine, 'texteller');
  assert.equal(session.getSnapshot().applied?.ocrEngine, 'mfr');
  // Cancel returns to the engine in use.
  session.resetRecognition();
  assert.equal(session.getSnapshot().draft?.ocrEngine, 'mfr');
  // Once the model is installed, choosing the engine applies it.
  session.edit('ocrEngine', 'texteller', true);
  installed = true;
  session.edit('ocrEngine', 'texteller', true);
  assert.equal(await session.flushAndWait(), true);
  assert.deepEqual(patches, [{ ocrEngine: 'texteller' }]);
  assert.equal(saved.ocrEngine, 'texteller');
});
