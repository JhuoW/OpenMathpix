import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { cleanupAppData, assertModelsOutsideInstallDirectory } from '../src/main/app-data-cleanup';
import {
  adoptLegacyManagedDownloads,
  DOWNLOAD_LEDGER,
  DOWNLOAD_MARKER,
  isManagedDownload,
  registerManagedDownload,
  removeAllManagedDownloads,
  removeManagedDownload,
} from '../src/main/managed-downloads';

const REVISION = '1cef9f0bdcd6a4c63df7de1311fb0894593340cc';

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'openmathpix-uninstall-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profile = join(root, 'openmathpix');
  const model = (name: string) => join(root, name, 'models', 'mfr-1.5', REVISION);
  await mkdir(profile);
  await writeFile(
    join(profile, 'config.json'),
    JSON.stringify({ encryptedToken: 'encrypted-api-key' }),
  );
  await writeFile(join(profile, 'history.json'), JSON.stringify([{ latex: 'x^2' }]));
  return { root, profile, model };
}

async function download(profile: string, directory: string) {
  await registerManagedDownload(profile, directory);
  await writeFile(join(directory, 'encoder_model.onnx'), 'downloaded model');
  await writeFile(join(directory, 'decoder_model.onnx.part'), 'partial download');
}

test('full cleanup removes credentials, history, and downloads in every recorded storage root', async (t) => {
  const { root, profile, model } = await fixture(t);
  const first = model('first-location');
  const second = model('second-location');
  await download(profile, first);
  await download(profile, second);
  await writeFile(join(root, 'first-location', 'personal.txt'), 'keep');
  await writeFile(join(first, 'my-notes.txt'), 'keep');
  await cleanupAppData(profile);
  assert.equal(existsSync(profile), false);
  assert.equal(existsSync(join(first, 'encoder_model.onnx')), false);
  assert.equal(existsSync(join(first, 'decoder_model.onnx.part')), false);
  assert.equal(existsSync(second), false);
  assert.equal(await readFile(join(first, 'my-notes.txt'), 'utf8'), 'keep');
  assert.equal(await readFile(join(root, 'first-location', 'personal.txt'), 'utf8'), 'keep');
});

test('a registry entry for a model type this version does not know is ignored, never deleted', async (t) => {
  const { root, profile, model } = await fixture(t);
  const known = model('known');
  await download(profile, known);
  const unknown = join(root, 'old', 'models', 'retired-engine', REVISION);
  await mkdir(unknown, { recursive: true });
  await writeFile(join(unknown, 'encoder.onnx'), 'not ours any more');
  const ledger = JSON.parse(await readFile(join(profile, DOWNLOAD_LEDGER), 'utf8'));
  ledger.downloads.push({ directory: unknown, token: '04152558-091d-448a-bb78-a006c1c30bee' });
  await writeFile(join(profile, DOWNLOAD_LEDGER), JSON.stringify(ledger));
  assert.equal(await isManagedDownload(profile, known), true);
  assert.equal(await isManagedDownload(profile, unknown), false);
  await cleanupAppData(profile);
  assert.equal(existsSync(known), false);
  assert.equal(await readFile(join(unknown, 'encoder.onnx'), 'utf8'), 'not ours any more');
});

test('removing the active managed model preserves another download root and the app profile', async (t) => {
  const { profile, model } = await fixture(t);
  const active = model('previous-root');
  const future = model('new-root');
  await download(profile, active);
  await download(profile, future);
  await removeManagedDownload(profile, active);
  assert.equal(existsSync(active), false);
  assert.equal(await isManagedDownload(profile, future), true);
  assert.equal(await isManagedDownload(profile, active), false);
  assert.equal(existsSync(join(profile, 'history.json')), true);
});

test('both local engines clean recorded roots using their own file allowlists', async (t) => {
  const { root, profile, model } = await fixture(t);
  const mfr = model('mfr-root');
  const texteller = join(root, 'texteller-root', 'models', 'texteller', REVISION);
  await download(profile, mfr);
  await registerManagedDownload(profile, texteller);
  for (const name of [
    'encoder_model_int8.onnx',
    'decoder_model_merged_int8.onnx',
    'preprocessor_config.json',
    'tokenizer.json.part',
  ]) {
    await writeFile(join(texteller, name), 'texteller download');
  }
  await writeFile(join(texteller, 'encoder_model.onnx'), 'unrelated MFR file');
  await writeFile(join(mfr, 'encoder_model_int8.onnx'), 'unrelated TexTeller file');
  await cleanupAppData(profile);
  assert.equal(existsSync(join(texteller, 'encoder_model_int8.onnx')), false);
  assert.equal(existsSync(join(texteller, 'decoder_model_merged_int8.onnx')), false);
  assert.equal(existsSync(join(texteller, 'tokenizer.json.part')), false);
  assert.equal(await readFile(join(texteller, 'encoder_model.onnx'), 'utf8'), 'unrelated MFR file');
  assert.equal(
    await readFile(join(mfr, 'encoder_model_int8.onnx'), 'utf8'),
    'unrelated TexTeller file',
  );
});

test('legacy TexTeller settings adopt the saved root and active location only', async (t) => {
  const { root, profile } = await fixture(t);
  const directory = join(root, 'texteller-root', 'models', 'texteller', REVISION);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'decoder_model_merged_int8.onnx.part'), 'interrupted download');
  await writeFile(join(profile, 'config.json'), JSON.stringify({ textellerModelPath: directory }));
  await cleanupAppData(profile);
  assert.equal(existsSync(directory), false);
});

test('a subsequent import matching the cache layout never becomes owned by migration', async (t) => {
  const { root, profile, model } = await fixture(t);
  await adoptLegacyManagedDownloads(profile);
  const imported = model('external-import');
  await mkdir(imported, { recursive: true });
  await writeFile(join(imported, 'encoder_model.onnx'), 'external original');
  await writeFile(
    join(profile, 'config.json'),
    JSON.stringify({
      mfrModelPath: imported,
      mfrDownloadDirectory: join(root, 'external-import'),
    }),
  );
  await adoptLegacyManagedDownloads(profile, { modelPath: imported });
  assert.equal(await isManagedDownload(profile, imported), false);
  await cleanupAppData(profile);
  assert.equal(await readFile(join(imported, 'encoder_model.onnx'), 'utf8'), 'external original');
});

test('Keep and upgrade preflight blocks active models inside the installation tree', async (t) => {
  const { root, profile } = await fixture(t);
  const install = join(root, 'installed-app');
  const model = join(install, 'imported-model');
  await mkdir(model, { recursive: true });
  await writeFile(join(model, 'encoder_model_int8.onnx'), 'keep on refusal');
  await writeFile(join(profile, 'config.json'), JSON.stringify({ textellerModelPath: model }));
  await assert.rejects(
    assertModelsOutsideInstallDirectory(profile, install),
    /inside the installation folder/,
  );
  assert.equal(await readFile(join(model, 'encoder_model_int8.onnx'), 'utf8'), 'keep on refusal');
  assert.equal(existsSync(join(profile, 'history.json')), true);
});

test('Keep preflight checks older ledger downloads and exact directory boundaries', async (t) => {
  const { root, profile } = await fixture(t);
  const install = join(root, 'installed-app');
  const model = join(install, 'models', 'mfr-1.5', REVISION);
  await download(profile, model);
  await assert.rejects(
    assertModelsOutsideInstallDirectory(profile, install),
    /inside the installation folder/,
  );
  const differentInstall = join(root, 'installed');
  await mkdir(differentInstall);
  await assertModelsOutsideInstallDirectory(profile, differentInstall);
  await assertModelsOutsideInstallDirectory(join(root, 'absent-profile'), install);
});

test('Keep preflight resolves an imported junction into the installation tree', async (t) => {
  const { root, profile } = await fixture(t);
  const install = join(root, 'installed-app');
  const model = join(install, 'models');
  const alias = join(root, 'external-alias');
  await mkdir(model, { recursive: true });
  await symlink(model, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(profile, 'config.json'), JSON.stringify({ mfrModelPath: alias }));
  await assert.rejects(
    assertModelsOutsideInstallDirectory(profile, install),
    /inside the installation folder/,
  );
});

test('Keep preflight detects legacy download roots before a ledger or active path exists', async (t) => {
  const { root, profile } = await fixture(t);
  const install = join(root, 'installed-app');
  const storage = join(install, 'old-storage');
  await mkdir(join(storage, 'models', 'texteller', REVISION), { recursive: true });
  await writeFile(
    join(profile, 'config.json'),
    JSON.stringify({ textellerDownloadDirectory: storage }),
  );
  await assert.rejects(
    assertModelsOutsideInstallDirectory(profile, install),
    /inside the installation folder/,
  );
  assert.equal(existsSync(join(profile, DOWNLOAD_LEDGER)), false);
});

test('legacy managed caches are adopted but arbitrary imported models remain untouched', async (t) => {
  const { root, profile, model } = await fixture(t);
  const imported = join(root, 'imported-model');
  await mkdir(imported);
  await writeFile(join(imported, 'encoder_model.onnx'), 'external original');
  const current = model('current-root');
  const oldActive = model('previous-root');
  const defaults = join(profile, 'models', 'mfr-1.5', REVISION);
  for (const directory of [current, oldActive, defaults]) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'encoder_model.onnx'), 'legacy download');
  }
  await adoptLegacyManagedDownloads(profile, {
    downloadRoot: join(root, 'current-root'),
    modelPath: oldActive,
  });
  await writeFile(join(profile, 'config.json'), JSON.stringify({ mfrModelPath: imported }));
  await cleanupAppData(profile);
  for (const directory of [current, oldActive, defaults])
    assert.equal(existsSync(directory), false);
  assert.equal(await readFile(join(imported, 'encoder_model.onnx'), 'utf8'), 'external original');
});

test('all ownership markers are validated before any model or profile is deleted', async (t) => {
  const { profile, model } = await fixture(t);
  const first = model('one');
  const second = model('two');
  await download(profile, first);
  await download(profile, second);
  await writeFile(
    join(second, DOWNLOAD_MARKER),
    JSON.stringify({ version: 1, appId: 'other-app', token: 'other' }),
  );
  await assert.rejects(cleanupAppData(profile), /ownership marker/);
  assert.equal(existsSync(join(first, 'encoder_model.onnx')), true);
  assert.equal(existsSync(join(profile, 'config.json')), true);
});

test('linked storage ancestors fail closed and do not delete linked or other model contents', async (t) => {
  const { root, profile, model } = await fixture(t);
  const first = model('one');
  const second = model('two');
  await download(profile, first);
  await download(profile, second);
  await rm(join(root, 'two'), { recursive: true });
  await symlink(join(root, 'one'), join(root, 'two'), 'junction');
  await assert.rejects(removeAllManagedDownloads(profile), /linked/);
  assert.equal(existsSync(join(first, 'encoder_model.onnx')), true);
  assert.equal(existsSync(join(profile, 'history.json')), true);
});

test('corrupt registries and arbitrary profile paths are rejected without broad deletion', async (t) => {
  const { root, profile, model } = await fixture(t);
  await download(profile, model('models'));
  await writeFile(
    join(profile, DOWNLOAD_LEDGER),
    JSON.stringify({ version: 1, downloads: [{ directory: root, token: 'bad' }] }),
  );
  await assert.rejects(cleanupAppData(profile), /registry/);
  await assert.rejects(cleanupAppData(root), /not the OpenMathpix profile/);
  assert.equal(existsSync(join(profile, 'config.json')), true);
});

test('concurrent registrations retain all destinations and repeated cleanup is harmless', async (t) => {
  const { profile, model } = await fixture(t);
  const directories = ['a', 'b', 'c'].map(model);
  await Promise.all(directories.map((directory) => download(profile, directory)));
  for (const directory of directories)
    assert.equal(await isManagedDownload(profile, directory), true);
  await cleanupAppData(profile);
  await cleanupAppData(profile);
  for (const directory of directories) assert.equal(existsSync(directory), false);
});

test('a downloaded model replaced by a directory is rejected before deleting other models', async (t) => {
  const { profile, model } = await fixture(t);
  const first = model('first');
  const second = model('second');
  await download(profile, first);
  await download(profile, second);
  await rm(join(second, 'encoder_model.onnx'));
  await mkdir(join(second, 'encoder_model.onnx'));
  await writeFile(join(second, 'encoder_model.onnx', 'personal.txt'), 'keep');
  await assert.rejects(cleanupAppData(profile), /replaced with a directory/);
  assert.equal(existsSync(join(first, 'encoder_model.onnx')), true);
});
