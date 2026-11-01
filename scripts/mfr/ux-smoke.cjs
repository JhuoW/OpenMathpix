// Linux/X11 only. Native menus, window events, settings persistence and app exit are real;
// responses to native dialogs are simulated to avoid interactive test prompts.
if (process.platform !== 'linux') throw new Error('This UX smoke test supports Linux/X11 only.');
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}
const { _electron: electron } = require(argument('--playwright-module', 'playwright-core'));
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { waitForApp } = require('./desktop-wait.cjs');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const modelDir = argument('--model-dir', process.env.OPENMATHPIX_MFR_MODEL_DIR);
const packaged = process.argv.includes('--packaged');
const report = {
  checks: [],
  rendererErrors: [],
  dialogs: 'responses mocked; actual menu actions, IPC, persistence, window events and exit',
};

async function main() {
  if (!modelDir) throw new Error('Pass --model-dir or OPENMATHPIX_MFR_MODEL_DIR.');
  const parent = path.resolve(argument('--output-dir', os.tmpdir()));
  const relative = path.relative(os.tmpdir(), parent);
  assert.ok(
    !relative.startsWith('..') && !path.isAbsolute(relative),
    'Use a temporary output directory.',
  );
  await fs.mkdir(parent, { recursive: true });
  const base = await fs.mkdtemp(path.join(parent, 'openmathpix-ux-'));
  report.outputDirectory = base;
  const { MFR_REVISION, MFR_FILES } = require(
    path.join(root, '.test-dist/src/services/mfr-model.js'),
  );
  const managed = path.join(base, 'profile/openmathpix/models/mfr-1.5', MFR_REVISION);
  await fs.mkdir(path.dirname(managed), { recursive: true });
  // Clearing this cache must unlink the managed symlink, never the real model files.
  await fs.symlink(path.resolve(modelDir), managed);
  await fs.mkdir(path.join(base, 'screenshots'));
  const environment = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(base, 'profile'),
    XDG_CACHE_HOME: path.join(base, 'cache'),
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  let app;
  let page;
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
      env: environment,
      timeout: 30000,
    });
    app.context().setDefaultTimeout(30000);
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(path.resolve(userData), path.join(base, 'profile/openmathpix'));
    page = await app.firstWindow();
    page.on('pageerror', (error) => report.rendererErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.api));
  };
  const nativeLanguage = () =>
    app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      return {
        view: menu.getMenuItemById('view').label,
        language: menu.getMenuItemById('language').label,
        en: menu.getMenuItemById('language-en').checked,
        zh: menu.getMenuItemById('language-zh-CN').checked,
      };
    });
  const setLanguage = async (language) => {
    await app.evaluate(({ Menu }, selected) => {
      Menu.getApplicationMenu().getMenuItemById(`language-${selected}`).click();
    }, language);
    await waitForApp(
      page,
      async (value) => (await window.api.getSettings()).language === value,
      language,
    );
    await page
      .getByRole('button', { name: language === 'en' ? 'Settings' : '设置', exact: true })
      .waitFor();
    assert.deepEqual(await nativeLanguage(), {
      view: language === 'en' ? 'View' : '视图',
      language: language === 'en' ? 'Language' : '语言',
      en: language === 'en',
      zh: language === 'zh-CN',
    });
  };
  const installCloseSpy = async (probeFile, response) =>
    app.evaluate(
      async ({ app, BrowserWindow, dialog }, { probeFile, response }) => {
        const fs = process.getBuiltinModule('fs');
        const window = BrowserWindow.getAllWindows()[0];
        const originalMinimize = window.minimize.bind(window);
        globalThis.__openmathpixUx = { calls: [], minimized: 0, response, pending: false };
        window.minimize = () => {
          globalThis.__openmathpixUx.minimized++;
          originalMinimize();
        };
        dialog.showMessageBox = (_window, options) => {
          const state = globalThis.__openmathpixUx;
          state.calls.push({
            title: options.title,
            message: options.message,
            buttons: options.buttons,
          });
          if (state.pending) {
            return new Promise((resolve) => {
              state.resolve = resolve;
            });
          }
          return Promise.resolve({ response: state.response, checkboxChecked: false });
        };
        app.once('will-quit', () => {
          const state = globalThis.__openmathpixUx;
          fs.writeFileSync(
            probeFile,
            JSON.stringify({ calls: state.calls, minimized: state.minimized }),
          );
        });
      },
      { probeFile, response },
    );
  try {
    await launch();
    await waitForApp(page, async () => (await window.api.getMfrStatus()).state === 'ready');
    assert.equal((await page.evaluate(() => window.api.getSettings())).language, 'en');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.equal(
      await page.getByRole('button', { name: 'Download Local Model', exact: true }).isDisabled(),
      true,
    );
    report.checks.push('ready model disables the download button');

    await setLanguage('zh-CN');
    await setLanguage('en');
    await setLanguage('zh-CN');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.screenshot({
      path: path.join(base, 'screenshots/chinese-settings.png'),
      fullPage: true,
    });
    assert.equal(
      JSON.parse(await fs.readFile(path.join(base, 'profile/openmathpix/config.json'), 'utf8'))
        .language,
      'zh-CN',
    );
    report.checks.push(
      'View language choices translate renderer and native menus immediately and persist Chinese',
    );

    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    });
    await page.getByRole('button', { name: '清理模型缓存', exact: true }).click();
    await waitForApp(
      page,
      async () => (await window.api.getMfrStatus()).state === 'not-downloaded',
    );
    await page.waitForFunction(() => {
      const download = [...document.querySelectorAll('button')].find(
        (button) => button.textContent.trim() === '下载本地模型',
      );
      return download && !download.disabled;
    });
    assert.equal((await page.evaluate(() => window.api.getSettings())).mfrModelPath, '');
    await assert.rejects(fs.lstat(managed), { code: 'ENOENT' });
    for (const file of MFR_FILES) {
      const data = await fs.readFile(path.join(modelDir, file.name));
      assert.equal(data.length, file.size);
      assert.equal(crypto.createHash('sha256').update(data).digest('hex'), file.sha256);
    }
    report.checks.push(
      'clearing managed cache re-enables download without deleting the symlink target model files',
    );

    const firstExit = path.join(base, 'explicit-quit.json');
    await installCloseSpy(firstExit, 2);
    await app.evaluate(async ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
      await new Promise((resolve) => setImmediate(resolve));
    });
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isDestroyed()),
      false,
    );
    assert.deepEqual(await app.evaluate(() => globalThis.__openmathpixUx.calls[0].buttons), [
      '缩小到任务栏',
      '退出软件',
      '取消',
    ]);
    await app.evaluate(({ BrowserWindow }) => {
      globalThis.__openmathpixUx.pending = true;
      const window = BrowserWindow.getAllWindows()[0];
      window.close();
      window.close();
    });
    assert.equal(await app.evaluate(() => globalThis.__openmathpixUx.calls.length), 2);
    await app.evaluate(async () => {
      globalThis.__openmathpixUx.resolve({ response: 2, checkboxChecked: false });
      await new Promise((resolve) => setImmediate(resolve));
    });
    await app.evaluate(async ({ BrowserWindow }) => {
      globalThis.__openmathpixUx.pending = false;
      globalThis.__openmathpixUx.response = 0;
      BrowserWindow.getAllWindows()[0].close();
      await new Promise((resolve) => setImmediate(resolve));
    });
    const minimized = await app.evaluate(({ BrowserWindow }) => ({
      calls: globalThis.__openmathpixUx.calls.length,
      minimized: globalThis.__openmathpixUx.minimized,
      alive: !BrowserWindow.getAllWindows()[0].isDestroyed(),
    }));
    assert.deepEqual(minimized, { calls: 3, minimized: 1, alive: true });
    report.checks.push(
      'Cancel keeps the window; repeated close shares one prompt; minimize invokes the real minimize operation without quitting',
    );
    const explicitClosed = app.waitForEvent('close');
    await app.evaluate(({ app }) => {
      setTimeout(() => app.quit(), 25);
    });
    await explicitClosed;
    app = undefined;
    const firstProbe = JSON.parse(await fs.readFile(firstExit, 'utf8'));
    assert.equal(firstProbe.calls.length, 3, 'Explicit quit must bypass another close prompt');
    report.checks.push('explicit application quit exits without a second confirmation');

    await launch();
    assert.equal((await page.evaluate(() => window.api.getSettings())).language, 'zh-CN');
    assert.deepEqual(await nativeLanguage(), {
      view: '视图',
      language: '语言',
      en: false,
      zh: true,
    });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await waitForApp(
      page,
      async () => (await window.api.getMfrStatus()).state === 'not-downloaded',
    );
    assert.equal(
      await page.getByRole('button', { name: '下载本地模型', exact: true }).isEnabled(),
      true,
    );
    await page.screenshot({
      path: path.join(base, 'screenshots/chinese-restarted.png'),
      fullPage: true,
    });
    report.checks.push(
      'restart restores Chinese menus and interface while the cleared model remains unloaded',
    );

    const secondExit = path.join(base, 'confirmed-quit.json');
    await installCloseSpy(secondExit, 1);
    const closed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => {
      // Let evaluate acknowledge before the real process exits.
      setTimeout(() => BrowserWindow.getAllWindows()[0].close(), 25);
    });
    await closed;
    app = undefined;
    const secondProbe = JSON.parse(await fs.readFile(secondExit, 'utf8'));
    assert.equal(secondProbe.calls.length, 1);
    assert.equal(secondProbe.minimized, 0);
    report.checks.push(
      'choosing Quit in the close dialog terminates the actual Electron application',
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
