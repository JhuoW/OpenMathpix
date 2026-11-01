import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { stageModelCacheRemoval } from '../src/services/mfr-cache';

const revision = '1cef9f0bdcd6a4c63df7de1311fb0894593340cc';

async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'openmathpix-cache-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const userData = join(root, 'profile');
  const parent = join(userData, 'models', 'mfr-1.5');
  const cache = join(parent, revision);
  const external = join(root, 'my-downloaded-model');
  await mkdir(parent, { recursive: true });
  await mkdir(external);
  await writeFile(join(external, 'original.onnx'), 'externally managed model');
  return { root, userData, parent, cache, external };
}

test('committing a staged model cache removes only the application cache and permits re-download', async (t) => {
  const { userData, parent, cache, external } = await setup(t);
  await mkdir(cache);
  await writeFile(join(cache, 'encoder_model.onnx'), 'cached model');
  await writeFile(join(parent, 'unrelated-file'), 'keep');
  const clear = await stageModelCacheRemoval(userData, revision);
  assert.equal(existsSync(cache), false, 'staging moves the original cache atomically');
  assert.equal((await readdir(parent)).filter((name) => name.includes('.clearing-')).length, 1);
  await clear.commit();
  await clear.rollback();
  assert.deepEqual(await readdir(parent), ['unrelated-file']);
  assert.equal(await readFile(join(external, 'original.onnx'), 'utf8'), 'externally managed model');
  await mkdir(cache);
  await writeFile(join(cache, 'new-model.onnx'), 'downloaded again');
  assert.equal(await readFile(join(cache, 'new-model.onnx'), 'utf8'), 'downloaded again');
});

test('cancelled cleanup restores every model file before any deletion takes place', async (t) => {
  const { userData, parent, cache } = await setup(t);
  await mkdir(cache);
  await writeFile(join(cache, 'model.onnx'), 'working model');
  const clear = await stageModelCacheRemoval(userData, revision);
  await clear.rollback();
  await clear.commit();
  assert.equal(await readFile(join(cache, 'model.onnx'), 'utf8'), 'working model');
  assert.deepEqual(await readdir(parent), [revision]);
});

test('clearing a cached directory link never removes the user-selected model it points to', async (t) => {
  const { userData, cache, external } = await setup(t);
  await symlink(external, cache, 'junction');
  const clear = await stageModelCacheRemoval(userData, revision);
  await clear.commit();
  assert.equal(existsSync(cache), false);
  assert.equal(await readFile(join(external, 'original.onnx'), 'utf8'), 'externally managed model');
});

test('nested links inside a cache are unlinked without traversing external content', async (t) => {
  const { userData, cache, external } = await setup(t);
  await mkdir(cache);
  await symlink(external, join(cache, 'outside'), 'junction');
  const clear = await stageModelCacheRemoval(userData, revision);
  await clear.commit();
  assert.equal(await readFile(join(external, 'original.onnx'), 'utf8'), 'externally managed model');
});

test('linked managed parent directories are rejected before touching the target', async (t) => {
  const { userData, external } = await setup(t);
  await rm(join(userData, 'models'), { recursive: true });
  await symlink(external, join(userData, 'models'), 'junction');
  await assert.rejects(
    stageModelCacheRemoval(userData, revision),
    /not a regular application directory/,
  );
  assert.equal(await readFile(join(external, 'original.onnx'), 'utf8'), 'externally managed model');
});

test('cleanup reports retained files on deletion failure and a later cleanup removes its remnants', async (t) => {
  const { userData, parent, cache } = await setup(t);
  await mkdir(cache);
  await writeFile(join(cache, 'model.onnx'), 'cached');
  const clear = await stageModelCacheRemoval(userData, revision, {
    rename,
    remove: async () => {
      throw new Error('access denied');
    },
  });
  await assert.rejects(clear.commit(), /Remaining cache:.*\.clearing-.*retry Clear Model Cache/);
  await clear.rollback();
  assert.equal(
    existsSync(cache),
    false,
    'committed cleanup must not restore a partially deleted model',
  );
  const remnants = await readdir(parent);
  assert.equal(remnants.length, 1);
  assert.match(remnants[0], /\.clearing-/);
  const retry = await stageModelCacheRemoval(userData, revision);
  await retry.commit();
  assert.deepEqual(await readdir(parent), []);
});

test('an absent cache is a no-op and arbitrary revisions cannot expand deletion scope', async (t) => {
  const { userData, external } = await setup(t);
  await rm(join(userData, 'models'), { recursive: true });
  const clear = await stageModelCacheRemoval(userData, revision);
  await clear.commit();
  for (const invalid of ['../../my-downloaded-model', '', '/', 'not-a-revision']) {
    await assert.rejects(
      stageModelCacheRemoval(userData, invalid),
      /Invalid application model cache location/,
    );
  }
  assert.equal(await readFile(join(external, 'original.onnx'), 'utf8'), 'externally managed model');
});
