import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createOperationTracker } from '../src/main/operations';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { resolve, reject, promise };
}

test('exit waits for all concurrent recognition, settings and model operations', async () => {
  const tracker = createOperationTracker();
  const first = deferred();
  const second = deferred();
  const a = tracker.run(() => first.promise);
  const b = tracker.run(() => second.promise);
  let completed = false;
  const idle = tracker.waitForIdle().then((saved) => {
    completed = saved;
    return saved;
  });
  first.resolve();
  await a;
  await setImmediate();
  assert.equal(completed, false);
  second.resolve();
  await b;
  assert.equal(await idle, true);
  assert.equal(await tracker.waitForIdle(), true);
});

test('a failed operation releases the wait while preserving its rejection for the caller', async () => {
  const tracker = createOperationTracker();
  const pending = deferred();
  const running = tracker.run(() => pending.promise);
  const idle = tracker.waitForIdle();
  pending.reject(new Error('Disk unavailable'));
  await assert.rejects(running, /Disk unavailable/);
  assert.equal(await idle, true);
  await assert.rejects(
    tracker.run(() => {
      throw new Error('Synchronous failure');
    }),
    /Synchronous/,
  );
  assert.equal(await tracker.waitForIdle(), true);
});

test('timeout reports unfinished work without cancelling it and a later exit can wait again', async () => {
  const tracker = createOperationTracker();
  const pending = deferred();
  const running = tracker.run(() => pending.promise);
  assert.equal(await tracker.waitForIdle(5), false);
  const retry = tracker.waitForIdle();
  pending.resolve();
  await running;
  assert.equal(await retry, true);
});
