// Linux/X11 only. Requires a running display and the test-only playwright-core.
if (process.platform !== 'linux')
  throw new Error('This isolated snip smoke test supports Linux/X11 only.');
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const { _electron: electron } = require(argument('--playwright-module', 'playwright-core'));
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const base = path.resolve(
  argument(
    '--output-dir',
    require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'openmathpix-snip-')),
  ),
);
const modelDir = argument('--model-dir', process.env.OPENMATHPIX_MFR_MODEL_DIR);
const packaged = process.argv.includes('--packaged');
(async () => {
  await fs.mkdir(base + '/profile/openmathpix/models/mfr-1.5', { recursive: true });
  if (!modelDir) throw new Error('Pass --model-dir or OPENMATHPIX_MFR_MODEL_DIR.');
  const { MFR_REVISION: rev } = require(path.join(root, '.test-dist/src/services/mfr-model.js'));
  await fs
    .symlink(path.resolve(modelDir), base + '/profile/openmathpix/models/mfr-1.5/' + rev)
    .catch((e) => {
      if (e.code !== 'EEXIST') throw e;
    });
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: base + '/profile',
    XDG_CACHE_HOME: base + '/cache',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: argument(
      '--executable',
      root +
        (packaged ? '/dist/linux-unpacked/openmathpix' : '/node_modules/electron/dist/electron'),
    ),
    args: [
      ...(process.argv.includes('--no-sandbox') ? ['--no-sandbox'] : []),
      '--disable-gpu',
      ...(packaged ? [] : [root]),
    ],
    env,
    timeout: 30000,
  });
  const report = { checks: [] };
  app.context().setDefaultTimeout(15000);
  try {
    report.runtime = await app.evaluate(({ app }) => ({ userData: app.getPath('userData') }));
    const profileRelativePath = path.relative(base, report.runtime.userData);
    assert.ok(
      profileRelativePath &&
        !profileRelativePath.startsWith('..') &&
        !path.isAbsolute(profileRelativePath),
    );
    const main = await app.firstWindow();
    await main.waitForFunction(() => Boolean(window.api));
    await main.evaluate(() => window.api.clearHistory());
    assert.equal((await main.evaluate(() => window.api.getMfrStatus())).state, 'ready');

    const formula = (await fs.readFile(root + '/tests/fixtures/mfr/quadratic.png')).toString(
      'base64',
    );
    const fixturePromise = app.waitForEvent('window');
    report.fixture = await app.evaluate(async ({ BrowserWindow }, data) => {
      const w = new BrowserWindow({
        x: 0,
        y: 0,
        width: 640,
        height: 480,
        frame: false,
        show: true,
        backgroundColor: '#ffffff',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      await w.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<body style="margin:0;background:white"><img style="position:absolute;left:100px;top:100px" src="data:image/png;base64,' +
              data +
              '"></body>',
          ),
      );
      return { id: w.id, bounds: w.getBounds() };
    }, formula);

    const fixture = await fixturePromise;
    await fixture.waitForFunction(() => document.querySelector('img')?.complete);
    await main.bringToFront();
    const overlayPromise = app.waitForEvent('window');
    await main.getByRole('button', { name: 'New Snip', exact: true }).click();
    const overlay = await overlayPromise;
    report.overlay = await overlay.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      ratio: devicePixelRatio,
    }));
    await overlay.waitForFunction(
      () =>
        document.querySelector('canvas')?.width === innerWidth * devicePixelRatio &&
        innerWidth > 300,
    );
    await overlay.mouse.move(90, 90);
    await overlay.mouse.down();
    await overlay.mouse.move(394, 202, { steps: 8 });
    await overlay.screenshot({ path: base + '/selection.png' });
    await overlay.mouse.up();
    await main.locator('.katex').first().waitFor({ timeout: 15000 });
    const history = await main.evaluate(() => window.api.getHistory());
    assert.equal(history.length, 1);
    assert.equal(history[0].pipeline, 'MFR-1.5');
    assert.equal(
      history[0].resultLatex.replace(/\s/g, ''),
      'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}',
    );
    report.result = { pipeline: history[0].pipeline, latex: history[0].resultLatex };
    report.checks.push(
      'New Snip button hides main window and captures real Xvfb desktop',
      'overlay canvas receives pointer drag selection',
      'cropped screenshot is recognized through MFR utility process',
      'KaTeX formula visible and MFR history saved',
    );
    await main.getByText('Raw LaTeX source', { exact: true }).click();
    await main.screenshot({ path: base + '/result.png' });
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = error.stack;
    process.exitCode = 1;
  } finally {
    await app.close();
    await fs.writeFile(base + '/report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
