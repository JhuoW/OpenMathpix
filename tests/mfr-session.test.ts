import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MfrSession, type MfrWorkerTransport, type WorkerResponse } from '../src/main/mfr-session';

function worker() {
  let onMessage: (response: WorkerResponse) => void = () => {};
  let onFailure: (error: Error) => void = () => {};
  const requests: Parameters<MfrWorkerTransport['send']>[0][] = [];
  let kills = 0;
  return {
    transport: {
      send: (request) => requests.push(request),
      kill: () => {
        kills += 1;
      },
      onMessage: (listener) => {
        onMessage = listener;
      },
      onFailure: (listener) => {
        onFailure = listener;
      },
    } satisfies MfrWorkerTransport,
    requests,
    get kills() {
      return kills;
    },
    succeed: (latex = 'x+1') => onMessage({ id: requests.at(-1)!.id, result: { latex } }),
    respond: (result: WorkerResponse['result']) => onMessage({ id: requests.at(-1)!.id, result }),
    fail: (error: string) => onFailure(new Error(error)),
  };
}

test('switching models lets the old recognition finish while the candidate is already usable', async () => {
  const oldWorker = worker();
  const newWorker = worker();
  const old = new MfrSession('/old', () => oldWorker.transport);
  const next = new MfrSession('/new', () => newWorker.transport);
  try {
    const pendingOld = old.recognize('original screenshot');
    const candidate = next.recognize('test image');
    newWorker.succeed();
    await candidate;
    old.retire();
    assert.equal(oldWorker.kills, 0, 'an in-flight recognition remains alive');
    const nextScreenshot = next.recognize('new screenshot');
    newWorker.succeed('y+2');
    assert.equal((await nextScreenshot).latex, 'y+2');
    oldWorker.succeed('old result');
    assert.equal((await pendingOld).latex, 'old result');
    assert.equal(oldWorker.kills, 1);
    assert.deepEqual(
      oldWorker.requests.map((request) => request.modelDir),
      ['/old'],
    );
    assert.deepEqual(
      newWorker.requests.map((request) => request.modelDir),
      ['/new', '/new'],
    );
    await assert.rejects(old.recognize('another screenshot'), /replaced/);
  } finally {
    old.dispose();
    next.dispose();
  }
});

test('a candidate initialization failure leaves the previously active session working', async () => {
  const oldWorker = worker();
  const badWorker = worker();
  const old = new MfrSession('/old', () => oldWorker.transport);
  const bad = new MfrSession('/bad', () => badWorker.transport);
  try {
    const pending = bad.recognize('test image');
    badWorker.fail('Could not initialize ONNX');
    await assert.rejects(pending, /Could not initialize ONNX/);
    bad.dispose();
    const result = old.recognize('screenshot');
    oldWorker.succeed();
    assert.equal((await result).latex, 'x+1');
    assert.equal(oldWorker.kills, 0);
  } finally {
    old.dispose();
    bad.dispose();
  }
});

test('timed out sessions replace the worker and ignore delayed responses from the old worker', async () => {
  const first = worker();
  const second = worker();
  let count = 0;
  const session = new MfrSession(
    '/model',
    () => (++count === 1 ? first : second).transport,
    undefined,
    20,
  );
  try {
    const timedOut = session.recognize('first');
    await assert.rejects(session.recognize('concurrent'), /already running/);
    await assert.rejects(timedOut, /timed out/);
    const retry = session.recognize('retry');
    first.succeed('stale');
    second.succeed('fresh');
    assert.equal((await retry).latex, 'fresh');
    assert.equal(first.kills, 1);
  } finally {
    session.dispose();
  }
});

test('cache cleanup waits for the worker to release its native model files', async () => {
  const active = worker();
  let exited!: () => void;
  let stopped = false;
  const session = new MfrSession('/model', () => ({
    ...active.transport,
    waitForExit: () =>
      new Promise<void>((resolve) => {
        exited = resolve;
      }),
  }));
  const recognition = session.recognize('image');
  active.succeed();
  await recognition;
  const shutdown = session.disposeAndWait().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(active.kills, 1);
  assert.equal(stopped, false, 'cleanup must wait for worker exit after requesting termination');
  exited();
  await shutdown;
  assert.equal(stopped, true);
  await assert.rejects(session.recognize('image'), /replaced/);
});

test('model output is tidied for display while the raw output and confidence are kept', async () => {
  const fake = worker();
  const session = new MfrSession('/model', () => fake.transport);
  try {
    const pending = session.recognize('image', {
      formatLatex: (latex) => latex.replace(/ /g, ''),
    });
    fake.respond({ latex: 'x ^ { 2 }', confidence: 0.98, lowestTokenProbability: 0.3 });
    const result = await pending;
    assert.equal(result.latex, 'x^{2}');
    assert.equal(result.markdown, '$$\nx^{2}\n$$');
    assert.equal(result.text, 'x^{2}');
    assert.equal(result.kind, 'formula');
    assert.deepEqual(result.confidence, { average: 0.98, lowest: 0.3 });
    assert.equal((result.rawResponse as { rawLatex: string }).rawLatex, 'x ^ { 2 }');
  } finally {
    session.dispose();
  }
});

test('warm-up starts the worker without a request that needs a reply', async () => {
  const fake = worker();
  let created = 0;
  const session = new MfrSession('/model', () => {
    created += 1;
    return fake.transport;
  });
  try {
    session.warmup();
    assert.equal(created, 1);
    assert.deepEqual(fake.requests, [{ id: 0, modelDir: '/model' }]);
    // A recognition reuses the warmed worker.
    const pending = session.recognize('image');
    assert.equal(created, 1);
    fake.succeed('x');
    assert.equal((await pending).latex, 'x');
  } finally {
    session.dispose();
  }
});
