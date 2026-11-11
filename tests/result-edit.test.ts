import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type { HistoryUpdate, OCRResult } from '../src/shared/types';
import {
  applyEdit,
  createHistorySaver,
  historyChanges,
  isEdited,
} from '../src/renderer/result-edit';

const formula: OCRResult = {
  latex: 'x',
  markdown: '$$\nx\n$$',
  text: 'x',
  rawResponse: null,
  kind: 'formula',
  historyId: 4,
};

test('editing a formula keeps Markdown and text consistent with its LaTeX', () => {
  const edited = applyEdit(formula, 'latex', 'x+1');
  assert.equal(edited.markdown, '$$\nx+1\n$$');
  assert.equal(edited.text, 'x+1');
  assert.equal(edited.historyId, 4);
  assert.deepEqual(historyChanges(formula, edited), {
    resultLatex: 'x+1',
    resultMarkdown: '$$\nx+1\n$$',
    resultText: 'x+1',
  });
  assert.equal(isEdited(edited, formula), true);
  assert.equal(isEdited(formula, formula), false);
});

test('document formats are edited independently', () => {
  const document: OCRResult = { ...formula, kind: 'document', markdown: '# A', text: 'A' };
  const edited = applyEdit(document, 'markdown', '# B');
  assert.equal(edited.markdown, '# B');
  assert.equal(edited.text, 'A');
  assert.deepEqual(historyChanges(document, edited), { resultMarkdown: '# B' });
});

test('history receives only the newest edit after typing pauses', async () => {
  const saved: [number, HistoryUpdate][] = [];
  const saver = createHistorySaver(
    async (id, updates) => {
      saved.push([id, updates]);
    },
    () => assert.fail('no error expected'),
    20,
  );
  saver.schedule(1, { resultLatex: 'a' });
  saver.schedule(1, { resultLatex: 'ab', resultText: 'ab' });
  saver.schedule(2, { resultMarkdown: 'm' });
  assert.deepEqual(saved, []);
  saver.flushAll();
  assert.deepEqual(saved, [
    [1, { resultLatex: 'ab', resultText: 'ab' }],
    [2, { resultMarkdown: 'm' }],
  ]);
  saver.schedule(1, { resultLatex: 'abc' });
  await sleep(40);
  assert.deepEqual(saved.at(-1), [1, { resultLatex: 'abc' }]);
});

test('exit flush waits for pending writes, retries failures, and keeps the latest correction', async () => {
  let release!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: HistoryUpdate[] = [];
  const saver = createHistorySaver(
    async (_id, updates) => {
      writes.push(updates);
      if (writes.length === 1) await firstWrite;
    },
    () => assert.fail('no failure expected'),
    60_000,
  );
  saver.schedule(1, { resultLatex: 'first' });
  saver.flushAll();
  saver.schedule(1, { resultLatex: 'last' });
  let finished = false;
  const exiting = saver.flushAndWait().then((saved) => {
    finished = true;
    return saved;
  });
  await sleep(5);
  assert.equal(finished, false);
  assert.equal(writes.length, 1);
  release();
  assert.equal(await exiting, true);
  assert.deepEqual(writes, [{ resultLatex: 'first' }, { resultLatex: 'last' }]);

  let attempts = 0;
  const retry = createHistorySaver(
    async () => {
      attempts++;
      if (attempts === 1) throw new Error('Disk unavailable');
    },
    () => {},
    60_000,
  );
  retry.schedule(2, { resultText: 'keep me' });
  assert.equal(await retry.flushAndWait(), false);
  assert.equal(await retry.flushAndWait(), true);
});

test('a newer correction recovers all fields of an earlier failed history write', async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: HistoryUpdate[] = [];
  const saver = createHistorySaver(
    async (_id, updates) => {
      writes.push(updates);
      if (writes.length === 1) {
        await hold;
        throw new Error('Temporary disk failure');
      }
    },
    () => {},
    60_000,
  );
  saver.schedule(3, { resultLatex: 'first', resultText: 'retained' });
  saver.flushAll();
  saver.schedule(3, { resultLatex: 'final' });
  const finished = saver.flushAndWait();
  release();
  assert.equal(await finished, true);
  assert.deepEqual(writes.at(-1), { resultLatex: 'final', resultText: 'retained' });
});

test('confirmed deletion cancels delayed corrections without affecting another history record', async () => {
  const saved: number[] = [];
  const saver = createHistorySaver(
    async (id) => {
      saved.push(id);
    },
    () => assert.fail('no errors'),
    60_000,
  );
  saver.schedule(1, { resultText: 'deleted' });
  saver.schedule(2, { resultText: 'keep' });
  saver.forget(1);
  assert.equal(await saver.flushAndWait(), true);
  assert.deepEqual(saved, [2]);
  saver.schedule(1, { resultText: 'stale UI edit' });
  assert.equal(await saver.flushAndWait(), true);
  assert.deepEqual(saved, [2]);
});

test('late in-flight failure after deletion cannot recreate a permanent unsaved edit', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_, fail) => {
    reject = fail;
  });
  let writes = 0;
  let errors = 0;
  const saver = createHistorySaver(
    () => {
      writes++;
      return pending;
    },
    () => {
      errors++;
    },
    60_000,
  );
  saver.schedule(7, { resultText: 'first' });
  saver.flushAll();
  saver.schedule(7, { resultText: 'queued' });
  saver.flushAll();
  saver.forget(7);
  reject(new Error('History entry was deleted'));
  assert.equal(await saver.flushAndWait(), true);
  assert.equal(writes, 1, 'a queued write must also be cancelled');
  assert.equal(errors, 0);
});

test('clearing history forgets failed retries and later entries still save normally', async () => {
  let writes = 0;
  const saver = createHistorySaver(
    async () => {
      writes++;
      if (writes === 1) throw new Error('Disk was unavailable');
    },
    () => {},
    60_000,
  );
  saver.schedule(3, { resultText: 'failed' });
  assert.equal(await saver.flushAndWait(), false);
  saver.forget();
  assert.equal(await saver.flushAndWait(), true);
  assert.equal(writes, 1);
  saver.schedule(4, { resultText: 'new recognition' });
  assert.equal(await saver.flushAndWait(), true);
  assert.equal(writes, 2);
});

test('synchronous save failures remain retryable without losing the correction', async () => {
  let writes = 0;
  const saver = createHistorySaver(
    () => {
      writes++;
      if (writes === 1) throw new Error('IPC is unavailable');
      return Promise.resolve();
    },
    () => {},
    60_000,
  );
  saver.schedule(9, { resultText: 'retain' });
  assert.equal(await saver.flushAndWait(), false);
  assert.equal(await saver.flushAndWait(), true);
});
