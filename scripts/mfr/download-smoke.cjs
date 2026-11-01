// Linux/X11 only. Requires a built app, compiled tests, Playwright, and existing model files.
// All network responses are mocked; this does NOT verify real system proxy connectivity.
if (process.platform !== 'linux')
  throw new Error('This isolated download smoke test supports Linux/X11 only.');
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const { _electron: electron } = require(argument('--playwright-module', 'playwright-core'));
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const { waitForApp } = require('./desktop-wait.cjs');
const os = require('node:os');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const sourceDirectory = argument('--model-dir', process.env.OPENMATHPIX_MFR_MODEL_DIR);
const parent = path.resolve(argument('--output-dir', os.tmpdir()));
const report = {
  checks: [],
  rendererErrors: [],
  network: 'mocked streaming responses; no external model downloads',
};

function inside(parentDirectory, candidate) {
  const relative = path.relative(parentDirectory, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function main() {
  if (!sourceDirectory)
    throw new Error('Pass --model-dir pointing to existing original model files.');
  assert.ok(
    parent === path.resolve(os.tmpdir()) || inside(path.resolve(os.tmpdir()), parent),
    '--output-dir must be inside the operating system temporary directory.',
  );
  await fs.mkdir(parent, { recursive: true });
  // Even when an output parent is supplied, create a new profile on every run.
  const base = await fs.mkdtemp(path.join(parent, 'openmathpix-download-'));
  report.outputDirectory = base;
  const importedPath = path.resolve(sourceDirectory);
  const { MFR_REVISION, MFR_FILES, validateMfrDirectory } = require(
    path.join(root, '.test-dist/src/services/mfr-model.js'),
  );
  // This check reads source files; the script never writes inside the source model folder.
  await validateMfrDirectory(importedPath);
  const formula = (await fs.readFile(path.join(root, 'tests/fixtures/mfr/quadratic.png'))).toString(
    'base64',
  );
  const launchEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(base, 'profile'),
    XDG_CACHE_HOME: path.join(base, 'cache'),
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({
      executablePath: argument(
        '--executable',
        path.join(root, 'node_modules/electron/dist/electron'),
      ),
      args: [
        ...(process.argv.includes('--no-sandbox') ? ['--no-sandbox'] : []),
        '--disable-gpu',
        ...(process.argv.includes('--packaged') ? [] : [root]),
      ],
      env: launchEnv,
      timeout: 30000,
    });
    app.context().setDefaultTimeout(30000);
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    assert.ok(inside(base, userData), 'Refusing to operate outside the isolated profile.');
    const managedPath = path.join(userData, 'models', 'mfr-1.5', MFR_REVISION);
    report.userData = userData;
    await app.evaluate(
      ({ net }, { source, revision, files }) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        const { Readable } = process.getBuiltinModule('stream');
        const allowed = new Map(files.map((file) => [file.name, file]));
        const state = { mode: 'timeout', calls: [], chunks: 0, streamedBytes: 0 };
        globalThis.__openmathpixDownloadSmoke = state;
        // Never call the original net.fetch: even unexpected URLs fail locally.
        net.fetch = async (input, init = {}) => {
          const url = new URL(typeof input === 'string' ? input : input.url);
          const fileName = url.pathname.split('/').at(-1);
          const expectedPath = `/breezedeus/pix2text-mfr-1.5/resolve/${revision}/${fileName}`;
          if (
            url.origin !== 'https://huggingface.co' ||
            url.pathname !== expectedPath ||
            url.searchParams.get('download') !== 'true' ||
            !allowed.has(fileName)
          )
            throw new Error('Unexpected network request blocked by download smoke test.');
          state.calls.push({ file: fileName, mode: state.mode });
          if (state.mode === 'timeout') throw new Error('net::ERR_CONNECTION_TIMED_OUT');
          init.signal?.throwIfAborted();
          const body = fs.createReadStream(path.join(source, fileName), {
            highWaterMark: 16 * 1024,
            signal: init.signal,
          });
          body.on('data', (chunk) => {
            state.chunks += 1;
            state.streamedBytes += chunk.length;
          });
          return new Response(Readable.toWeb(body), {
            status: 200,
            headers: {
              'content-type': 'application/octet-stream',
              'content-length': String(allowed.get(fileName).size),
            },
          });
        };
      },
      { source: importedPath, revision: MFR_REVISION, files: MFR_FILES },
    );
    const page = await app.firstWindow();
    page.on('pageerror', (error) => report.rendererErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.api));
    assert.equal((await page.evaluate(() => window.api.getMfrStatus())).state, 'not-downloaded');
    assert.equal((await page.evaluate(() => window.api.getSettings())).mfrModelPath, '');
    await assert.rejects(fs.access(managedPath));
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const download = page.getByRole('button', { name: 'Download Local Model', exact: true });
    const select = page.getByRole('button', { name: 'Select Local Model', exact: true });
    await download.waitFor();
    const waitIdle = () =>
      page.waitForFunction(() => {
        const button = Array.from(document.querySelectorAll('button')).find(
          (item) => item.textContent?.trim() === 'Download Local Model',
        );
        return button && !button.disabled;
      });
    const waitReady = () =>
      waitForApp(page, async () => (await window.api.getMfrStatus()).state === 'ready');
    const recognize = () => page.evaluate((image) => window.api.recognize(image), formula);

    // Fresh installation: failure reaches the actual UI through production IPC.
    await download.click();
    await page
      .getByRole('alert')
      .filter({ hasText: /network or system proxy/ })
      .first()
      .waitFor();
    await waitIdle();
    const failed = await page.evaluate(() => window.api.getMfrStatus());
    assert.equal(failed.state, 'error');
    assert.match(failed.error, /Select Local Model/);
    assert.equal(await select.isEnabled(), true);
    await page.getByText('Manual download', { exact: true }).waitFor();
    assert.deepEqual(
      await fs.readdir(managedPath),
      [],
      'failed download must leave no partial files',
    );
    report.checks.push(
      'fresh-profile download timeout produces manual-download guidance and permits local model selection',
    );

    // Replace only the native dialog response. Validation/loading/persistence stay real.
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, importedPath);
    await select.click();
    await waitForApp(
      page,
      async (expected) => (await window.api.getSettings()).mfrModelPath === expected,
      importedPath,
    );
    await waitReady();
    assert.equal((await page.evaluate(() => window.api.getSettings())).mfrModelPath, importedPath);
    const original = await recognize();
    assert.match(original.latex, /sqrt/);
    assert.equal(original.rawResponse.engine, 'MFR-1.5');
    report.checks.push(
      'manual selection of existing real model files recovers from download timeout and enables real ONNX recognition',
    );

    // A ready model must block repeat downloads in both UI and main-process IPC.
    await page.waitForFunction(() => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (item) => item.textContent?.trim() === 'Download Local Model',
      );
      return button && button.disabled;
    });
    const beforeClear = await page.evaluate(() => window.api.getSettings());
    await assert.rejects(
      page.evaluate(() => window.api.downloadMfrModel()),
      /already ready/,
    );
    assert.equal((await recognize()).latex, original.latex);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    assert.equal(await page.evaluate(() => window.api.clearMfrModel()), null);
    assert.deepEqual(await page.evaluate(() => window.api.getSettings()), beforeClear);
    report.checks.push(
      'ready model disables downloads; backend rejects duplicate downloads and cancelled cleanup preserves the model',
    );

    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    });
    await page.getByRole('button', { name: 'Clear Model Cache', exact: true }).click();
    await waitForApp(
      page,
      async () => (await window.api.getMfrStatus()).state === 'not-downloaded',
    );
    await waitIdle();
    assert.equal((await page.evaluate(() => window.api.getSettings())).mfrModelPath, '');
    await validateMfrDirectory(importedPath);
    report.checks.push(
      'confirmed cleanup deactivates imported model without deleting external files and re-enables download',
    );

    // Serve existing weights through an actual web ReadableStream, exercising
    // net.fetch -> Readable.fromWeb -> pipeline -> checksum -> prepare -> commit.
    await app.evaluate(() => {
      globalThis.__openmathpixDownloadSmoke.mode = 'success';
    });
    await download.click();
    await waitForApp(page, async () => {
      const settings = await window.api.getSettings();
      const status = await window.api.getMfrStatus();
      return settings.mfrModelPath === '' && status.state === 'ready';
    });
    assert.equal((await page.evaluate(() => window.api.getMfrStatus())).modelPath, managedPath);
    const config = JSON.parse(await fs.readFile(path.join(userData, 'config.json'), 'utf8'));
    assert.equal(config.mfrModelPath, '');
    await validateMfrDirectory(managedPath);
    const installed = await fs.readdir(managedPath);
    assert.deepEqual(installed.sort(), MFR_FILES.map((file) => file.name).sort());
    for (const file of MFR_FILES) {
      const local = path.join(managedPath, file.name);
      assert.equal((await fs.lstat(local)).isSymbolicLink(), false);
      assert.equal(
        crypto
          .createHash('sha256')
          .update(await fs.readFile(local))
          .digest('hex'),
        file.sha256,
      );
    }
    assert.equal((await recognize()).latex, original.latex);
    report.mock = await app.evaluate(() => globalThis.__openmathpixDownloadSmoke);
    assert.equal(report.mock.calls.filter((call) => call.mode === 'timeout').length, 1);
    assert.deepEqual(
      report.mock.calls.filter((call) => call.mode === 'success').map((call) => call.file),
      MFR_FILES.map((file) => file.name),
    );
    assert.equal(
      report.mock.streamedBytes,
      MFR_FILES.reduce((total, file) => total + file.size, 0),
    );
    assert.ok(report.mock.chunks > 8, 'large models must be streamed over multiple chunks');
    report.checks.push(
      'retry streams and installs all eight original files in the isolated managed cache, validates/loads them, persists the default path, and preserves real OCR output',
    );
    await page.screenshot({ path: path.join(base, 'download-recovered.png'), fullPage: true });
    await page.getByRole('button', { name: 'Clear Model Cache', exact: true }).click();
    await waitForApp(
      page,
      async () => (await window.api.getMfrStatus()).state === 'not-downloaded',
    );
    await waitIdle();
    await assert.rejects(fs.access(managedPath));
    await validateMfrDirectory(importedPath);
    assert.equal((await page.evaluate(() => window.api.getSettings())).mfrModelPath, '');
    report.checks.push(
      'clearing a downloaded model deletes managed files, retains external files, and enables another download',
    );
    assert.deepEqual(report.rendererErrors, []);
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = error.stack;
    process.exitCode = 1;
  } finally {
    if (app) await app.close();
    await fs.writeFile(path.join(base, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
