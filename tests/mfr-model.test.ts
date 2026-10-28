import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { test, type TestContext } from 'node:test';
import { MfrModelManager, type ModelFile } from '../src/services/mfr-model';
import type { MfrStatus } from '../src/shared/types';

function modelFile(name: string, content: string): ModelFile {
  return {
    name,
    size: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function directory(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), 'openmathpix-model-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('verified existing model files can be reused offline without fetching', async (t) => {
  const dir = await directory(t);
  const file = modelFile('model.onnx', 'model-contents');
  await writeFile(join(dir, file.name), 'model-contents');
  const manager = new MfrModelManager(dir, undefined, [file], async () => {
    throw new Error('Network must not be used');
  });

  assert.equal((await manager.getStatus()).state, 'ready');
  assert.equal(await manager.ensureReady(), dir);
  await manager.download();
  const status = await manager.getStatus();
  assert.equal(status.downloadedBytes, file.size);
  assert.equal(status.modelPath, dir);
  status.state = 'error';
  assert.equal((await manager.getStatus()).state, 'ready', 'status callers receive a copy');
});

test('same-size corrupt and truncated files on disk do not make the model ready', async (t) => {
  const dir = await directory(t);
  const first = modelFile('first.onnx', 'first-model');
  const second = modelFile('second.onnx', 'second-model');
  await writeFile(join(dir, first.name), 'x'.repeat(first.size));
  await writeFile(join(dir, second.name), 'short');
  const manager = new MfrModelManager(dir, undefined, [first, second]);

  assert.equal((await manager.getStatus()).state, 'not-downloaded');
  assert.equal((await manager.getStatus()).downloadedBytes, 0);
  await assert.rejects(manager.ensureReady(), /not ready/);
});

for (const [kind, response] of [
  ['incorrect hash', 'xxxxxxxx'],
  ['truncated data', 'short'],
  ['oversized data', 'longer-than-expected'],
] as const) {
  test(`${kind} never becomes ready and removes the temporary download`, async (t) => {
    const dir = await directory(t);
    const file = modelFile('model.onnx', 'expected');
    const statuses: MfrStatus[] = [];
    const manager = new MfrModelManager(
      dir,
      (status) => statuses.push(status),
      [file],
      async () => Readable.from([Buffer.from(response)]),
    );

    await assert.rejects(manager.download(), /integrity check failed|Unexpected size/);
    assert.equal((await manager.getStatus()).state, 'error');
    assert.equal((await manager.getStatus()).downloadedBytes, 0);
    assert.ok(statuses.every((status) => status.state !== 'ready'));
    await assert.rejects(access(join(dir, file.name)));
    await assert.rejects(access(join(dir, `${file.name}.part`)));
  });
}

test('a download replaces its destination only after the entire file is verified', async (t) => {
  const dir = await directory(t);
  const contents = 'verified-model';
  const file = modelFile('model.onnx', contents);
  await writeFile(join(dir, file.name), 'old-invalid-model');
  const started = deferred();
  const firstChunk = deferred();
  const source = new PassThrough();
  const manager = new MfrModelManager(
    dir,
    (status) => {
      if (status.state === 'downloading' && status.downloadedBytes > 0) firstChunk.resolve();
    },
    [file],
    async () => {
      started.resolve();
      return source;
    },
  );
  const task = manager.download();
  await started.promise;
  source.write(contents.slice(0, 4));
  await firstChunk.promise;
  assert.equal(await readFile(join(dir, file.name), 'utf8'), 'old-invalid-model');
  assert.equal((await manager.getStatus()).state, 'downloading');

  source.end(contents.slice(4));
  await task;
  assert.equal(await readFile(join(dir, file.name), 'utf8'), contents);
  assert.equal((await manager.getStatus()).state, 'ready');
  await assert.rejects(access(join(dir, `${file.name}.part`)));
});

test('failed downloads retain verified files and retry only incomplete files', async (t) => {
  const dir = await directory(t);
  const first = modelFile('first.onnx', 'first');
  const second = modelFile('second.onnx', 'second');
  const calls: string[] = [];
  let fail = true;
  const manager = new MfrModelManager(dir, undefined, [first, second], async (file) => {
    calls.push(file.name);
    const body = file.name === first.name ? 'first' : fail ? 'xxxxxx' : 'second';
    return Readable.from([Buffer.from(body)]);
  });

  await assert.rejects(manager.download(), /integrity check failed/);
  assert.equal((await manager.getStatus()).downloadedBytes, first.size);
  assert.equal(await readFile(join(dir, first.name), 'utf8'), 'first');
  await assert.rejects(access(join(dir, `${second.name}.part`)));

  fail = false;
  await manager.download();
  assert.deepEqual(calls, [first.name, second.name, second.name]);
  assert.equal((await manager.getStatus()).state, 'ready');
  assert.equal((await manager.getStatus()).error, undefined);
});

test('a failed network stream leaves no partial file or unverified destination', async (t) => {
  const dir = await directory(t);
  const file = modelFile('model.onnx', 'model');
  const manager = new MfrModelManager(dir, undefined, [file], async () =>
    Readable.from(
      (async function* () {
        yield Buffer.from('mo');
        throw new Error('Connection closed');
      })(),
    ),
  );

  await assert.rejects(manager.download(), /Connection closed/);
  assert.equal((await manager.getStatus()).state, 'error');
  await assert.rejects(access(join(dir, file.name)));
  await assert.rejects(access(join(dir, `${file.name}.part`)));
});

test('concurrent download calls share one task and one network request', async (t) => {
  const dir = await directory(t);
  const file = modelFile('model.onnx', 'model');
  const started = deferred();
  const source = new PassThrough();
  let calls = 0;
  const manager = new MfrModelManager(dir, undefined, [file], async () => {
    calls += 1;
    started.resolve();
    return source;
  });

  const first = manager.download();
  const second = manager.download();
  assert.equal(first, second);
  await started.promise;
  source.end('model');
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal((await manager.getStatus()).state, 'ready');
});

test('cancelling an in-progress download cleans temporary data and permits retry', async (t) => {
  const dir = await directory(t);
  const file = modelFile('model.onnx', 'model');
  const started = deferred();
  const source = new PassThrough();
  let retry = false;
  const manager = new MfrModelManager(dir, undefined, [file], async () => {
    started.resolve();
    return retry ? Readable.from([Buffer.from('model')]) : source;
  });

  const task = manager.download();
  const rejection = assert.rejects(task, /cancelled/);
  await started.promise;
  source.write('mo');
  manager.cancel();
  await rejection;
  assert.equal((await manager.getStatus()).state, 'error');
  assert.ok(source.destroyed);
  await assert.rejects(access(join(dir, file.name)));
  await assert.rejects(access(join(dir, `${file.name}.part`)));

  retry = true;
  await manager.download();
  assert.equal((await manager.getStatus()).state, 'ready');
});

test('cancelling immediately after download starts is not lost during initialization', async (t) => {
  const dir = await directory(t);
  const file = modelFile('model.onnx', 'model');
  let calls = 0;
  const manager = new MfrModelManager(dir, undefined, [file], async () => {
    calls += 1;
    return Readable.from([Buffer.from('model')]);
  });

  const task = manager.download();
  manager.cancel();
  await assert.rejects(task, /cancelled/);
  assert.equal(calls, 0);
  assert.equal((await manager.getStatus()).state, 'error');
  await assert.rejects(access(join(dir, file.name)));
});

test('cancellation after the final file is installed does not emit a later ready status', async (t) => {
  const dir = await directory(t);
  const file = modelFile('model.onnx', 'model');
  const statuses: MfrStatus[] = [];
  const manager = new MfrModelManager(
    dir,
    (status) => {
      statuses.push(status);
      if (
        status.state === 'downloading' &&
        status.downloadedBytes === file.size &&
        existsSync(join(dir, file.name))
      ) {
        manager.cancel();
      }
    },
    [file],
    async () => Readable.from([Buffer.from('model')]),
  );

  await assert.rejects(manager.download(), /cancelled/);
  assert.equal((await manager.getStatus()).state, 'error');
  assert.equal((await manager.getStatus()).modelPath, undefined);
  assert.ok(statuses.every((status) => status.state !== 'ready'));
  // A completely verified file is still reusable on the next attempt.
  assert.equal(await readFile(join(dir, file.name), 'utf8'), 'model');
});
