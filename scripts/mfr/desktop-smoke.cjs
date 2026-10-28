// Linux/X11 only, under a graphical session or Xvfb. Playwright is test-only.
// --playwright-module accepts an absolute path to an external playwright-core install.
if (process.platform !== 'linux')
  throw new Error('This isolated desktop smoke test supports Linux/X11 only.');
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const { _electron: electron } = require(argument('--playwright-module', 'playwright-core'));
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const packaged = process.argv.includes('--packaged');
const migration = process.argv.includes('--migration');
const modelDir = argument('--model-dir', process.env.OPENMATHPIX_MFR_MODEL_DIR);
const base = path.resolve(
  argument(
    '--output-dir',
    require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'openmathpix-desktop-')),
  ),
);
const report = { checks: [], rendererErrors: [], consoleErrors: [] };
async function main() {
  let app;
  const launchEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(base, 'profile'),
    XDG_CACHE_HOME: path.join(base, 'cache'),
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  await fs.mkdir(path.join(base, 'screenshots'), { recursive: true });
  const modelParent = path.join(base, 'profile', 'openmathpix', 'models', 'mfr-1.5');
  await fs.mkdir(modelParent, { recursive: true });
  if (migration) {
    await fs.writeFile(
      path.join(base, 'profile/openmathpix/config.json'),
      JSON.stringify({ apiUrl: 'https://example.invalid/ocr' }),
    );
  } else {
    if (!modelDir)
      throw new Error(
        'Pass --model-dir or OPENMATHPIX_MFR_MODEL_DIR pointing to the verified model directory.',
      );
    const { MFR_REVISION } = require(path.join(root, '.test-dist/src/services/mfr-model.js'));
    await fs
      .symlink(path.resolve(modelDir), path.join(modelParent, MFR_REVISION))
      .catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
  }
  try {
    app = await electron.launch({
      executablePath: argument(
        '--executable',
        path.join(
          root,
          packaged ? 'dist/linux-unpacked/openmathpix' : 'node_modules/electron/dist/electron',
        ),
      ),
      args: [
        ...(process.argv.includes('--no-sandbox') ? ['--no-sandbox'] : []),
        '--disable-gpu',
        ...(packaged ? [] : [root]),
      ],
      env: launchEnv,
      timeout: 30000,
    });
    app.context().setDefaultTimeout(15000);
    report.runtime = await app.evaluate(({ app }) => ({
      userData: app.getPath('userData'),
      versions: process.versions,
    }));
    const profileRelativePath = path.relative(base, report.runtime.userData);
    assert.ok(
      profileRelativePath &&
        !profileRelativePath.startsWith('..') &&
        !path.isAbsolute(profileRelativePath),
    );
    const page = await app.firstWindow();
    page.on('pageerror', (error) => report.rendererErrors.push(error.message));
    page.on('console', (event) => {
      if (event.type() === 'error') report.consoleErrors.push(event.text());
    });
    await page.waitForFunction(() => Boolean(window.api));
    await page.evaluate(() => window.api.clearHistory());
    report.settings = await page.evaluate(() => window.api.getSettings());
    if (migration) {
      assert.equal(report.settings.ocrEngine, 'paddleocr');
      const cleared = await page.evaluate(() => window.api.setSettings({ apiUrl: '' }));
      assert.equal(cleared.ocrEngine, 'paddleocr');
      assert.equal((await page.evaluate(() => window.api.getSettings())).ocrEngine, 'paddleocr');
      const persisted = JSON.parse(
        await fs.readFile(path.join(report.runtime.userData, 'config.json'), 'utf8'),
      );
      assert.equal(persisted.ocrEngine, 'paddleocr');
      assert.equal(persisted.apiUrl, '');
      report.checks.push(
        'old cloud-only settings migrate to a persisted PaddleOCR engine; clearing the URL preserves that engine',
      );
      report.ok = true;
      return;
    }
    assert.equal(report.settings.ocrEngine, 'mfr');
    report.status = await page.evaluate(() => window.api.getMfrStatus());
    assert.equal(report.status.state, 'ready');
    report.checks.push('isolated new profile defaults to MFR; verified model is ready');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Save & Test Local Model' }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Save & Test Local Model' }).isEnabled(),
      true,
    );
    await page.screenshot({ path: path.join(base, 'screenshots/settings.png'), fullPage: true });
    report.connection = await page.evaluate(() => window.api.testConnection());
    assert.equal(report.connection.ok, true);
    report.checks.push('real Electron utility-process inference via testConnection');
    const formula = (
      await fs.readFile(path.join(root, 'tests/fixtures/mfr/quadratic.png'))
    ).toString('base64');
    report.recognition = await page.evaluate((data) => window.api.recognize(data), formula);
    assert.match(report.recognition.latex, /sqrt/);
    assert.equal(report.recognition.rawResponse.engine, 'MFR-1.5');
    report.checks.push(
      'renderer preload -> IPC -> utility process -> real ONNX formula recognition',
    );
    const history = await page.evaluate(() => window.api.getHistory());
    assert.equal(history.length, 1);
    assert.equal(history[0].pipeline, 'MFR-1.5');
    assert.equal(history[0].resultLatex, report.recognition.latex);
    report.history = history.map(({ id, pipeline, resultLatex }) => ({
      id,
      pipeline,
      resultLatex,
    }));
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.getByText('MFR-1.5', { exact: true }).first().click();
    await page.locator('.katex').first().waitFor();
    await page.getByText('Raw LaTeX source', { exact: true }).click();
    await page.screenshot({ path: path.join(base, 'screenshots/formula.png'), fullPage: true });
    report.checks.push(
      'history persists MFR-1.5 source and opens a visibly rendered KaTeX formula',
    );
    const drop = async (base64, name) =>
      page.evaluate(
        ({ base64, name }) => {
          const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
          const transfer = new DataTransfer();
          transfer.items.add(new File([bytes], name, { type: 'image/png' }));
          document
            .querySelector('#root > div')
            .dispatchEvent(
              new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
            );
        },
        { base64, name },
      );
    const blank = (await fs.readFile(path.join(root, 'tests/fixtures/mfr/blank.png'))).toString(
      'base64',
    );
    await drop(blank, 'blank.png');
    await page
      .getByText(/截图中没有可辨认的公式/)
      .first()
      .waitFor();
    await page.screenshot({ path: path.join(base, 'screenshots/blank-error.png'), fullPage: true });
    assert.equal((await page.evaluate(() => window.api.getHistory())).length, 1);
    await drop(formula, 'quadratic.png');
    await page.locator('.katex').first().waitFor();
    assert.equal(await page.getByText(/截图中没有可辨认的公式/).count(), 0);
    assert.equal((await page.evaluate(() => window.api.getHistory())).length, 2);
    await page.screenshot({
      path: path.join(base, 'screenshots/recovered-formula.png'),
      fullPage: true,
    });
    report.checks.push(
      'UI drag/drop rejects blank image without adding history, then recovers with a valid formula',
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
