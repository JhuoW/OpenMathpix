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
const { waitForApp } = require('./desktop-wait.cjs');
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
  let page;
  const launchEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(base, 'profile'),
    XDG_CACHE_HOME: path.join(base, 'cache'),
  };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  await fs.mkdir(path.join(base, 'screenshots'), { recursive: true });
  const modelParent = path.join(base, 'profile', 'openmathpix', 'models', 'mfr-1.5');
  await fs.mkdir(modelParent, { recursive: true });
  const { MFR_REVISION, MFR_FILES } = require(
    path.join(root, '.test-dist/src/services/mfr-model.js'),
  );
  if (migration) {
    await fs.writeFile(
      path.join(base, 'profile/openmathpix/config.json'),
      JSON.stringify({ ocrEngine: 'paddleocr', apiUrl: 'https://example.invalid/ocr' }),
    );
  } else {
    if (!modelDir)
      throw new Error(
        'Pass --model-dir or OPENMATHPIX_MFR_MODEL_DIR pointing to the verified model directory.',
      );
    await fs
      .symlink(path.resolve(modelDir), path.join(modelParent, MFR_REVISION))
      .catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
  }
  const launch = async () => {
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
    app.context().setDefaultTimeout(30000);
    const runtime = await app.evaluate(({ app }) => ({
      userData: app.getPath('userData'),
      versions: process.versions,
    }));
    const profileRelativePath = path.relative(base, runtime.userData);
    assert.ok(
      profileRelativePath &&
        !profileRelativePath.startsWith('..') &&
        !path.isAbsolute(profileRelativePath),
      'Refusing to test outside the isolated profile.',
    );
    page = await app.firstWindow();
    page.on('pageerror', (error) => report.rendererErrors.push(error.message));
    page.on('console', (event) => {
      if (event.type() === 'error') report.consoleErrors.push(event.text());
    });
    await page.waitForFunction(() => Boolean(window.api));
    return runtime;
  };
  const waitSetting = async (key, value) =>
    waitForApp(page, async ({ key, value }) => (await window.api.getSettings())[key] === value, {
      key,
      value,
    });
  const waitReady = async () =>
    waitForApp(page, async () => (await window.api.getMfrStatus()).state === 'ready');
  const selectDirectory = async (directory) => {
    // Only the native picker response is replaced. Validation, inference, IPC,
    // persistence, status broadcasts, and rollback run through production code.
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({
        canceled: selected === null,
        filePaths: selected === null ? [] : [selected],
      });
    }, directory);
    await page.getByRole('button', { name: 'Select Local Model', exact: true }).click();
    await page.waitForFunction(() => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (item) => item.textContent?.trim() === 'Select Local Model',
      );
      return button && !button.disabled;
    });
  };
  const drop = async (base64, name) =>
    page.evaluate(
      ({ base64, name }) =>
        new Promise((resolve, reject) => {
          const target = document.querySelector('#root > div');
          let started = false;
          const observer = new MutationObserver(() => {
            const recognizing = Array.from(target.querySelectorAll('span')).some(
              (element) => element.textContent === 'Recognizing with MFR-1.5...',
            );
            if (recognizing) started = true;
            if (started && !recognizing) {
              clearTimeout(timer);
              observer.disconnect();
              resolve();
            }
          });
          const timer = setTimeout(() => {
            observer.disconnect();
            reject(new Error('Recognition did not complete its visible loading cycle.'));
          }, 30000);
          // Observe before dispatch: IPC can persist history before React replaces
          // the old preview, and fast requests can render a very brief spinner.
          observer.observe(target, { childList: true, subtree: true, characterData: true });
          const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
          const transfer = new DataTransfer();
          transfer.items.add(new File([bytes], name, { type: 'image/png' }));
          target.dispatchEvent(
            new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }),
          );
        }),
      { base64, name },
    );
  try {
    report.runtime = await launch();
    await page.evaluate(() => window.api.clearHistory());
    report.settings = await page.evaluate(() => window.api.getSettings());
    if (migration) {
      const checkLocalSetup = async (language) => {
        const chinese = language === 'zh-CN';
        await waitSetting('ocrEngine', 'mfr');
        await page
          .getByRole('button', { name: chinese ? '设置' : 'Settings', exact: true })
          .click();
        await waitForApp(
          page,
          async () => (await window.api.getMfrStatus()).state === 'not-downloaded',
        );
        await page.waitForFunction(
          ({ download, pending, active, activeEngine }) => {
            const button = [...document.querySelectorAll('button')].find(
              (item) => item.textContent.trim() === download,
            );
            const selected = document.querySelector('input[name="ocrEngine"]:checked');
            const activeSelection = [
              ...(selected?.closest('label')?.querySelectorAll('span') ?? []),
            ].some((item) => item.textContent.trim() === active);
            return (
              button &&
              !button.disabled &&
              activeSelection &&
              document.body.textContent.includes(activeEngine) &&
              !document.body.textContent.includes(pending) &&
              document.querySelectorAll('[role="alert"]').length === 0
            );
          },
          {
            download: chinese ? '下载本地模型' : 'Download Local Model',
            pending: chinese ? '等待验证' : 'Pending validation',
            active: chinese ? '使用中' : 'Active',
            activeEngine: chinese ? '当前引擎：本地 MFR-1.5。' : 'Active engine: Local MFR-1.5.',
          },
        );
        assert.equal(
          await page
            .getByRole('radio', { name: chinese ? /本地 MFR-1.5/ : /Local MFR-1.5/ })
            .isChecked(),
          true,
        );
      };
      assert.equal(report.settings.ocrEngine, 'mfr');
      assert.equal(report.settings.language, 'en');
      assert.equal(report.settings.apiUrl, 'https://example.invalid/ocr');
      await checkLocalSetup('en');
      await page.screenshot({
        path: path.join(base, 'screenshots/migrated-local-english.png'),
        fullPage: true,
      });
      assert.equal(
        await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('view').label),
        'View',
      );
      const configPath = path.join(report.runtime.userData, 'config.json');
      const migrated = JSON.parse(await fs.readFile(configPath, 'utf8'));
      assert.equal(migrated.localMfrDefaultApplied, true);
      assert.equal(migrated.ocrEngine, 'mfr');
      report.checks.push(
        'old explicit PaddleOCR settings switch once to active local MFR with English, retain the API URL, and allow model download without pending validation',
      );

      // Seed explicit choices while the isolated app is stopped. Do not contact a real API.
      await app.close();
      app = undefined;
      const legacy = JSON.parse(await fs.readFile(configPath, 'utf8'));
      await fs.writeFile(
        configPath,
        JSON.stringify({
          ...legacy,
          localMfrDefaultApplied: true,
          ocrEngine: 'paddleocr',
          language: 'zh-CN',
        }),
      );
      report.restartedRuntime = await launch();
      const explicit = await page.evaluate(() => window.api.getSettings());
      assert.equal(explicit.ocrEngine, 'paddleocr');
      assert.equal(explicit.language, 'zh-CN');
      await page.getByRole('button', { name: '设置', exact: true }).waitFor();
      assert.equal(
        await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('view').label),
        '视图',
      );
      await assert.rejects(
        page.evaluate(() => window.api.setSettings({ apiUrl: '' })),
        /API URL|API 地址/i,
      );
      const unchanged = await page.evaluate(() => window.api.getSettings());
      assert.equal(unchanged.ocrEngine, 'paddleocr');
      assert.equal(unchanged.language, 'zh-CN');
      assert.equal(unchanged.apiUrl, 'https://example.invalid/ocr');
      const persisted = JSON.parse(await fs.readFile(configPath, 'utf8'));
      assert.equal(persisted.ocrEngine, 'paddleocr');
      assert.equal(persisted.language, 'zh-CN');
      assert.equal(persisted.apiUrl, 'https://example.invalid/ocr');
      report.checks.push(
        'explicit PaddleOCR and Chinese choices survive restart; an invalid cloud edit leaves those choices and the API URL unchanged',
      );

      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('radio', { name: /本地 MFR-1.5/ }).check();
      await checkLocalSetup('zh-CN');
      assert.equal(JSON.parse(await fs.readFile(configPath, 'utf8')).ocrEngine, 'mfr');
      await page.screenshot({
        path: path.join(base, 'screenshots/local-before-download.png'),
        fullPage: true,
      });
      await app.close();
      app = undefined;
      await launch();
      await checkLocalSetup('zh-CN');
      report.checks.push(
        'selecting local MFR before downloading a model becomes the saved active engine without pending validation or errors and survives restart',
      );

      await app.close();
      app = undefined;
      const beforeBrokenCache = JSON.parse(await fs.readFile(configPath, 'utf8'));
      await fs.writeFile(
        configPath,
        JSON.stringify({
          ...beforeBrokenCache,
          localMfrDefaultApplied: true,
          ocrEngine: 'paddleocr',
        }),
      );
      const brokenCache = path.join(modelParent, MFR_REVISION);
      await fs.mkdir(brokenCache, { recursive: true });
      await fs.writeFile(path.join(brokenCache, 'config.json'), 'invalid model configuration');
      await launch();
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('radio', { name: /本地 MFR-1.5/ }).check();
      await page
        .getByRole('alert')
        .filter({ hasText: /encoder_model\.onnx|config\.json/ })
        .first()
        .waitFor();
      assert.equal((await page.evaluate(() => window.api.getSettings())).ocrEngine, 'paddleocr');
      assert.equal(await page.getByRole('radio', { name: /本地 MFR-1.5/ }).isChecked(), true);
      await page.getByText('等待验证', { exact: true }).waitFor();
      await app.evaluate(({ dialog }) => {
        const original = dialog.showMessageBox;
        dialog.showMessageBox = async (...args) => {
          if (args.at(-1).title === '清理模型缓存') {
            return { response: 0, checkboxChecked: false };
          }
          return original.apply(dialog, args);
        };
      });
      await page.getByRole('button', { name: '清理模型缓存', exact: true }).click();
      await checkLocalSetup('zh-CN');
      assert.equal(JSON.parse(await fs.readFile(configPath, 'utf8')).ocrEngine, 'mfr');
      await assert.rejects(fs.access(brokenCache), { code: 'ENOENT' });
      await page.screenshot({
        path: path.join(base, 'screenshots/local-after-clearing-invalid-cache.png'),
        fullPage: true,
      });
      report.checks.push(
        'a damaged default cache rejects the local engine choice and retains PaddleOCR; clearing the cache retries that choice and activates local MFR without pending validation or stale errors',
      );

      await app.close();
      app = undefined;
      await fs.rm(configPath);
      await launch();
      const fresh = await page.evaluate(() => window.api.getSettings());
      assert.equal(fresh.ocrEngine, 'mfr');
      assert.equal(fresh.language, 'en');
      assert.equal(fresh.apiUrl, '');
      await checkLocalSetup('en');
      await page.screenshot({
        path: path.join(base, 'screenshots/fresh-local-english.png'),
        fullPage: true,
      });
      report.checks.push(
        'a fresh empty configuration starts with active local MFR and English before any model download',
      );
      assert.deepEqual(report.rendererErrors, []);
      report.ok = true;
      return;
    }
    assert.equal(report.settings.ocrEngine, 'mfr');
    await waitReady();
    report.status = await page.evaluate(() => window.api.getMfrStatus());
    report.checks.push('isolated new profile defaults to MFR; verified model initializes');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Select Local Model', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Save/ }).count(), 0);
    await page.getByRole('radio', { name: 'Dark', exact: true }).check();
    await waitSetting('theme', 'dark');
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark');
    await page.getByLabel('History Limit', { exact: true }).fill('144');
    // Navigate immediately, before the text debounce would normally expire.
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await waitSetting('historyLimit', 144);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.equal(await page.getByLabel('History Limit', { exact: true }).inputValue(), '144');
    report.checks.push(
      'Settings has no Save buttons; theme applies immediately and pending text preferences save when navigating away',
    );
    await page.getByLabel('History Limit', { exact: true }).fill('1');
    await page.getByLabel('History Limit', { exact: true }).blur();
    await page
      .getByRole('alert')
      .filter({ hasText: /10.*500/ })
      .first()
      .waitFor();
    assert.equal((await page.evaluate(() => window.api.getSettings())).historyLimit, 144);
    await page.getByRole('radio', { name: 'Light', exact: true }).check();
    await waitSetting('theme', 'light');
    await page.getByLabel('History Limit', { exact: true }).fill('144');
    await page.getByLabel('History Limit', { exact: true }).blur();
    report.checks.push(
      'invalid preference preserves its previous value without blocking unrelated valid preference changes',
    );

    const importedPath = path.resolve(modelDir);
    await selectDirectory(importedPath);
    await waitSetting('mfrModelPath', importedPath);
    await waitReady();
    report.imported = await page.evaluate(() => window.api.getMfrStatus());
    assert.equal(report.imported.modelPath, importedPath);
    await page.screenshot({ path: path.join(base, 'screenshots/settings.png'), fullPage: true });
    report.checks.push(
      'Select Local Model verifies and initializes the real selected model folder',
    );
    const beforeCancel = await page.evaluate(() => window.api.getSettings());
    await selectDirectory(null);
    assert.deepEqual(await page.evaluate(() => window.api.getSettings()), beforeCancel);
    report.checks.push(
      'cancelling the directory picker leaves the active model and settings unchanged',
    );

    report.connection = await page.evaluate(() => window.api.testConnection());
    assert.equal(report.connection.ok, true);
    const formula = (
      await fs.readFile(path.join(root, 'tests/fixtures/mfr/quadratic.png'))
    ).toString('base64');
    report.recognition = await page.evaluate((data) => window.api.recognize(data), formula);
    assert.match(report.recognition.latex, /sqrt/);
    assert.equal(report.recognition.rawResponse.engine, 'MFR-1.5');
    report.checks.push(
      'renderer preload -> IPC -> utility process -> real ONNX formula recognition using the selected folder',
    );
    const history = await page.evaluate(() => window.api.getHistory());
    assert.equal(history.length, 1, 'model setup tests must not create recognition history');
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
    const rawSource = page.locator('details').filter({
      has: page.getByText('Raw LaTeX source', { exact: true }),
    });
    assert.equal(await rawSource.evaluate((element) => element.open), true);
    await page.getByText('Raw LaTeX source', { exact: true }).click();
    assert.equal(await rawSource.evaluate((element) => element.open), false);
    await page.getByText('Raw LaTeX source', { exact: true }).click();
    assert.equal(await rawSource.evaluate((element) => element.open), true);
    await page.screenshot({ path: path.join(base, 'screenshots/formula.png'), fullPage: true });
    await page.getByText('Raw LaTeX source', { exact: true }).click();
    await drop(formula, 'quadratic-again.png');
    await waitForApp(page, async () => (await window.api.getHistory()).length === 2);
    await page.locator('.katex').first().waitFor();
    assert.equal(await rawSource.evaluate((element) => element.open), true);
    report.checks.push(
      'Raw LaTeX source starts expanded, supports manual toggling, and expands for a new recognition with identical LaTeX',
    );
    const blank = (await fs.readFile(path.join(root, 'tests/fixtures/mfr/blank.png'))).toString(
      'base64',
    );
    await drop(blank, 'blank.png');
    await page
      .getByText(/No recognizable formula|截图中没有可辨认的公式/)
      .first()
      .waitFor();
    await page.screenshot({ path: path.join(base, 'screenshots/blank-error.png'), fullPage: true });
    assert.equal((await page.evaluate(() => window.api.getHistory())).length, 2);
    await drop(formula, 'quadratic.png');
    await waitForApp(page, async () => (await window.api.getHistory()).length === 3);
    await page.locator('.katex').first().waitFor();
    assert.equal(await page.getByText(/No recognizable formula|截图中没有可辨认的公式/).count(), 0);
    await page.screenshot({
      path: path.join(base, 'screenshots/recovered-formula.png'),
      fullPage: true,
    });
    report.checks.push(
      'UI drag/drop rejects blank image without adding history, then recovers with a valid formula',
    );

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    for (const kind of ['missing', 'corrupt']) {
      const candidate = path.join(base, `${kind}-model`);
      await fs.mkdir(candidate, { recursive: true });
      for (const file of MFR_FILES) {
        if (file.name === 'config.json') {
          if (kind === 'corrupt') {
            // Same length, invalid hash/JSON; never overwrite the source model.
            await fs.writeFile(path.join(candidate, file.name), Buffer.alloc(file.size, 120));
          }
        } else {
          await fs.symlink(path.join(importedPath, file.name), path.join(candidate, file.name));
        }
      }
      await selectDirectory(candidate);
      await page
        .getByRole('alert')
        .filter({ hasText: /config\.json/ })
        .first()
        .waitFor();
      await waitReady();
      const retained = await page.evaluate(() => window.api.getSettings());
      assert.equal(retained.mfrModelPath, importedPath);
      assert.equal((await page.evaluate(() => window.api.getMfrStatus())).modelPath, importedPath);
      const result = await page.evaluate((data) => window.api.recognize(data), formula);
      assert.equal(result.latex, report.recognition.latex);
      report.checks.push(
        `${kind} model is rejected with a named file error; previous settings and usable inference remain intact`,
      );
    }

    await app.close();
    app = undefined;
    report.restartedRuntime = await launch();
    await waitReady();
    const restored = await page.evaluate(() => window.api.getSettings());
    assert.equal(restored.mfrModelPath, importedPath);
    assert.equal(restored.ocrEngine, 'mfr');
    assert.equal(restored.theme, 'light');
    assert.equal(restored.historyLimit, 144);
    assert.equal((await page.evaluate(() => window.api.getMfrStatus())).modelPath, importedPath);
    const restartedResult = await page.evaluate((data) => window.api.recognize(data), formula);
    assert.equal(restartedResult.latex, report.recognition.latex);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.equal(await page.getByLabel('History Limit', { exact: true }).inputValue(), '144');
    assert.equal(await page.getByRole('radio', { name: 'Light', exact: true }).isChecked(), true);
    report.checks.push(
      'restart restores the selected model folder, preferences, and real formula recognition',
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
