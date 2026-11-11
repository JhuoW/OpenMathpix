// Windows desktop regression checks with an isolated profile. Playwright is test-only:
// node scripts/desktop-smoke.cjs <absolute-path-to-playwright-core> [model-directory]
const { _electron: electron } = require(process.argv[2] || 'playwright-core');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let model = process.argv[3] || process.env.OPENMATHPIX_MFR_MODEL_DIR;
let textellerModel = process.env.OPENMATHPIX_TEXTELLER_MODEL_DIR;
const { waitForApp } = require('./mfr/desktop-wait.cjs');
const modelFiles = [
  'encoder_model.onnx',
  'decoder_model.onnx',
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!model)
    model =
      (
        await fs
          .readFile(path.join(root, '.test-dist/debug-model-path.txt'), 'utf8')
          .catch(() => '')
      ).trim() || undefined;
  if (!textellerModel)
    textellerModel =
      (
        await fs
          .readFile(path.join(root, '.test-dist/texteller-model-path.txt'), 'utf8')
          .catch(() => '')
      ).trim() || undefined;
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'openmathpix-windows-'));
  const profile = path.join(base, 'profile');
  await fs.mkdir(profile);
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.writeFile(
    path.join(base, 'package.json'),
    JSON.stringify({
      name: 'openmathpix-qa',
      version: pkg.version,
      main: 'main.cjs',
    }),
  );
  await fs.writeFile(
    path.join(base, 'main.cjs'),
    `
    const {app,Tray}=require('electron');
    const originalTrayMenu=Tray.prototype.setContextMenu;
    Tray.prototype.setContextMenu=function(menu){globalThis.qaTray=this;globalThis.qaTrayMenu=menu;return originalTrayMenu.call(this,menu);};
    const axios=require(${JSON.stringify(path.join(root, 'node_modules/axios/dist/node/axios.cjs'))});
    const originalPost=axios.post.bind(axios);
    globalThis.qaPaddleCalls=[];
    globalThis.qaPaddleFailure=false;
    axios.post=async(url,body,options)=>{
      if(url!=='http://127.0.0.1:39111/layout-parsing')return originalPost(url,body,options);
      globalThis.qaPaddleCalls.push({url,body});
      await new Promise(resolve=>setTimeout(resolve,100));
      if(globalThis.qaPaddleFailure)throw new axios.AxiosError('Mock authentication failure','ERR_BAD_REQUEST',undefined,undefined,{status:401,data:{errorCode:401,errorMsg:'unauthorized'},headers:{}});
      return {status:200,data:{errorCode:0,result:{layoutParsingResults:[{markdown:{text:'$$x^2+1$$'}}]}},headers:{}};
    };
    app.setPath('userData',${JSON.stringify(profile)});
    app.setName('OpenMathpix-QA');
    require(${JSON.stringify(path.join(root, 'out/main/index.js'))});
  `,
  );
  const fixture = await fs.readFile(path.join(root, 'tests/fixtures/mfr/quadratic.png'));
  await fs.writeFile(
    path.join(profile, 'history.json'),
    JSON.stringify({
      nextId: 2,
      items: [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          pipeline: 'MFR-1.5',
          imageThumbnail: fixture.toString('base64'),
          resultLatex: 'x^2+1',
          resultMarkdown: '$$\nx^2+1\n$$',
          resultText: 'x^2+1',
        },
      ],
    }),
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  let page;
  let managedDirectory;
  const custom = path.join(base, 'custom-models');
  const importedDirectory = path.join(base, 'imported-model');
  const copyModel = async (destination, source = model, files = modelFiles) => {
    assert.ok(
      path.resolve(destination).startsWith(path.resolve(base) + path.sep),
      'model writes must stay inside isolated test directory',
    );
    await fs.mkdir(destination, { recursive: true });
    for (const filename of files)
      await fs.copyFile(path.join(source, filename), path.join(destination, filename));
  };
  const engineCard = (name) => page.getByRole('radio', { name: new RegExp(name) }).locator('..');
  const exitApp = async () => {
    await app.evaluate(({ clipboard }) => clipboard.write(globalThis.qaClipboard));
    const closed = app.waitForEvent('close');
    await clickMenu('exit');
    await closed;
    app = undefined;
  };
  const assertModelInactive = async () => {
    await waitForApp(page, async () => {
      const s = await window.api.getMfrStatus();
      const engines = await window.api.getEngineStatuses();
      return !s.operational && engines.mfr.state === 'inactive';
    });
    await engineCard('Local MFR-1.5').getByText('Inactive', { exact: true }).waitFor();
    assert.match(
      await engineCard('Local MFR-1.5')
        .getByText('Inactive', { exact: true })
        .getAttribute('class'),
      /text-gray/,
    );
  };
  const assertModelActive = async () => {
    await waitForApp(page, async () => {
      const s = await window.api.getMfrStatus();
      const engines = await window.api.getEngineStatuses();
      return s.state === 'ready' && s.operational && engines.mfr.state === 'ready';
    });
    await engineCard('Local MFR-1.5').getByText('Active', { exact: true }).waitFor();
    assert.match(
      await engineCard('Local MFR-1.5').getByText('Active', { exact: true }).getAttribute('class'),
      /text-green/,
    );
  };
  const errors = [];
  const checks = [];
  const check = async (name, action) => {
    await action();
    checks.push(name);
    console.log(`PASS ${name}`);
  };
  const clickMenu = (id) =>
    app.evaluate(({ Menu }, id) => {
      const item = Menu.getApplicationMenu().getMenuItemById(id);
      if (!item) throw new Error(`Missing menu: ${id}`);
      item.click();
    }, id);
  const launch = async () => {
    app = await electron.launch({
      executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
      args: [base],
      env,
      timeout: 30_000,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.api));
    // The start page also offers New Snip when there is no result yet; use the header's.
    await page.locator('header').getByRole('button', { name: 'New Snip', exact: true }).waitFor();
    assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
    await app.evaluate(({ BrowserWindow, clipboard, shell, dialog, net }) => {
      globalThis.qaOriginalFetch = net.fetch.bind(net);
      globalThis.qaMain = BrowserWindow.getAllWindows()[0];
      globalThis.qaClipboard = {
        text: clipboard.readText(),
        html: clipboard.readHTML(),
        rtf: clipboard.readRTF(),
        image: clipboard.readImage(),
      };
      globalThis.qaLinks = [];
      shell.openExternal = async (url) => {
        globalThis.qaLinks.push(url);
      };
      globalThis.qaDialogs = [];
      dialog.showMessageBox = async (_parent, options) => {
        globalThis.qaDialogs.push(options);
        return { response: options.type === 'warning' ? 0 : 0, checkboxChecked: false };
      };
    });
    await app.evaluate(
      () =>
        new Promise((resolve) => {
          if (globalThis.qaMain.isVisible()) resolve();
          else globalThis.qaMain.once('show', resolve);
        }),
    );
  };
  try {
    await launch();
    await check('menus have useful commands and no Window/developer menu', async () => {
      const menus = await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu().items.map((i) => i.label),
      );
      assert.deepEqual(menus, ['File', 'Edit', 'View', 'Help']);
    });
    await check('minimize uses taskbar; close hides; activate restores', async () => {
      await app.evaluate(
        () =>
          new Promise((resolve) => {
            globalThis.qaMain.once('minimize', resolve);
            globalThis.qaMain.minimize();
          }),
      );
      assert.equal(await app.evaluate(() => globalThis.qaMain.isMinimized()), true);
      await app.evaluate(({ app }) => app.emit('activate'));
      await delay(200);
      assert.equal(await app.evaluate(() => globalThis.qaMain.isMinimized()), false);
      await app.evaluate(() => globalThis.qaMain.close());
      assert.equal(await app.evaluate(() => globalThis.qaMain.isVisible()), false);
      assert.equal(await app.evaluate(() => globalThis.qaMain.isDestroyed()), false);
      await app.evaluate(() => globalThis.qaTray.emit('click'));
      assert.equal(await app.evaluate(() => globalThis.qaMain.isVisible()), true);
      assert.deepEqual(
        await app.evaluate(() =>
          globalThis.qaTrayMenu.items.filter((i) => i.type !== 'separator').map((i) => i.label),
        ),
        ['Show Main Window', 'New Snip', 'Settings\u2026', 'Exit'],
      );
      await app.evaluate(() =>
        globalThis.qaTrayMenu.items.find((i) => i.label.startsWith('Settings')).click(),
      );
      await page.getByText('Recognition Engine', { exact: true }).waitFor();
    });
    await check(
      'source supports Ctrl+A, Ctrl+C and a functional native right-click Copy',
      async () => {
        await clickMenu('history');
        await page.locator('button[title="Open"]').click();
        const source = page.getByRole('textbox', { name: 'LaTeX Source' });
        await source.click();
        await source.press('Control+a');
        await source.press('Control+c');
        assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'x^2+1');
        await app.evaluate(({ Menu, clipboard }) => {
          clipboard.writeText('before context copy');
          const original = Menu.prototype.popup;
          Menu.prototype.popup = function () {
            globalThis.qaContext = this.items.map((i) => ({ role: i.role, enabled: i.enabled }));
            this.items
              .find((i) => i.role === 'copy')
              .click({}, globalThis.qaMain, globalThis.qaMain.webContents);
            Menu.prototype.popup = original;
          };
        });
        await source.click({ button: 'right' });
        await delay(150);
        const context = await app.evaluate(() => globalThis.qaContext);
        assert.ok(context.some((i) => i.role === 'copy' && i.enabled));
        assert.ok(context.some((i) => i.role === 'selectall'));
        assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'x^2+1');
        await page.screenshot({ path: path.join(base, 'source.png') });
      },
    );
    await check('About shows runtime version and working developer/source links', async () => {
      const opened = app.waitForEvent('window');
      await clickMenu('about');
      const about = await opened;
      await about.getByText(`Version ${pkg.version}`, { exact: true }).waitFor();
      await about.getByRole('link', { name: 'Wei Zhuo', exact: true }).click();
      await about.getByRole('link', { name: 'github.com/JhuoW/OpenMathpix', exact: true }).click();
      await delay(100);
      assert.deepEqual(await app.evaluate(() => globalThis.qaLinks), [
        'https://wei2hu0.github.io/',
        'https://github.com/JhuoW/OpenMathpix',
      ]);
      assert.ok(
        await about.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
      );
      await about.screenshot({ path: path.join(base, 'about.png') });
      await about.getByRole('button', { name: 'OK', exact: true }).click();
    });
    await check('update check handles available, current and offline responses', async () => {
      for (const mode of ['new', 'current', 'offline']) {
        await app.evaluate(({ net }, mode) => {
          net.fetch = async () => {
            if (mode === 'offline') throw new Error('offline');
            return {
              ok: true,
              json: async () => ({
                tag_name: mode === 'new' ? 'v2027.1.1' : 'v2026.11.01',
                draft: false,
                prerelease: false,
              }),
            };
          };
        }, mode);
        await clickMenu('check-updates');
        await delay(200);
        const dialog = await app.evaluate(() => globalThis.qaDialogs.at(-1));
        assert.match(
          dialog.message,
          mode === 'new' ? /is available/ : mode === 'current' ? /up to date/ : /Could not check/,
        );
      }
      await app.evaluate(({ net }) => {
        net.fetch = globalThis.qaOriginalFetch;
      });
    });
    await check('unconfigured engines show grey Inactive and compact setup', async () => {
      await clickMenu('settings');
      await page.getByText('Recommended', { exact: true }).waitFor();
      await assertModelInactive();
      assert.equal(await page.getByText('Active', { exact: true }).count(), 0);
      assert.equal((await page.getByText('Inactive', { exact: true }).count()) >= 2, true);
      await page.getByRole('button', { name: 'Download Local Model', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Import Existing Model...', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('button', { name: 'Verify Model', exact: true }).count(),
        0,
      );
      assert.equal(
        await page
          .locator('summary')
          .filter({ hasText: 'Advanced model options' })
          .evaluate((e) => e.parentElement.open),
        false,
      );
      await page.screenshot({ path: path.join(base, 'settings-inactive-en.png') });
    });
    await check('TexTeller downloads, loads and uninstalls in independent storage', async () => {
      await page.getByRole('radio', { name: /Local TexTeller/ }).check();
      await waitForApp(
        page,
        async () => (await window.api.getSettings()).ocrEngine === 'texteller',
      );
      await engineCard('Local TexTeller').getByText('Inactive', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('API URL', { exact: true }).count(), 0);
      await page
        .getByText('Offline formula recognition, about 320 MB, no API account needed', {
          exact: true,
        })
        .waitFor();
      await page.locator('summary').filter({ hasText: 'Advanced model options' }).click();
      // Both local models come from Hugging Face, so both offer the mirror.
      assert.equal(await page.getByText('Download source', { exact: true }).count(), 1);
      const directory = path.join(base, 'texteller-storage');
      await fs.mkdir(directory);
      await app.evaluate(({ dialog }, directory) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
      }, directory);
      await page
        .getByRole('button', { name: 'Change TexTeller storage location', exact: true })
        .click();
      await waitForApp(
        page,
        async (directory) =>
          (await window.api.getSettings()).textellerDownloadDirectory === directory,
        directory,
      );
      assert.equal((await page.evaluate(() => window.api.getSettings())).mfrDownloadDirectory, '');
      if (textellerModel) {
        const destination = (await page.evaluate(() => window.api.getTextellerStatus()))
          .downloadDirectory;
        const files = [
          'encoder_model_int8.onnx',
          'decoder_model_merged_int8.onnx',
          'config.json',
          'generation_config.json',
          'preprocessor_config.json',
          'tokenizer.json',
        ];
        await assert.rejects(fs.access(path.join(destination, 'encoder_model_int8.onnx')));
        await page.evaluate(() => {
          globalThis.qaDownloadProgress = [];
          window.api.onTextellerStatus((status) => {
            globalThis.qaDownloadProgress.push({
              state: status.state,
              bytes: status.downloadedBytes,
            });
          });
        });
        await page.getByRole('button', { name: 'Download Local Model', exact: true }).click();
        await waitForApp(
          page,
          async () => (await window.api.getTextellerStatus()).operational === true,
          undefined,
          180000,
        );
        await engineCard('Local TexTeller').getByText('Active', { exact: true }).waitFor();
        const downloaded = await page.evaluate(() => window.api.getTextellerStatus());
        assert.equal(downloaded.managed, true);
        assert.ok(
          await page.evaluate(() =>
            globalThis.qaDownloadProgress.some((s) => s.state === 'downloading' && s.bytes > 0),
          ),
        );
        await page
          .getByText('Click New Snip in the top-right corner to start.', { exact: true })
          .waitFor();
        await page.screenshot({ path: path.join(base, 'settings-texteller-ready-en.png') });
        const result = await page.evaluate(
          (image) => window.api.recognize(image),
          fixture.toString('base64'),
        );
        assert.ok(result.latex.length > 0);
        assert.match(result.latex, /frac|sqrt/);
        assert.ok(
          (await page.evaluate(() => window.api.getHistory())).some(
            (item) => item.pipeline === 'TexTeller',
          ),
        );
        await page.getByRole('button', { name: 'Uninstall TexTeller', exact: true }).click();
        await waitForApp(page, async () => !(await window.api.getSettings()).textellerModelEnabled);
        await engineCard('Local TexTeller').getByText('Inactive', { exact: true }).waitFor();
        await assert.rejects(fs.access(path.join(destination, 'encoder_model_int8.onnx')));
        for (const file of files) await fs.access(path.join(textellerModel, file));
        await page.evaluate(() => {
          globalThis.qaStatusEvents = 0;
          window.api.onTextellerStatus(() => globalThis.qaStatusEvents++);
        });
        for (let i = 0; i < 3; i++) await page.evaluate(() => window.api.getEngineStatuses());
        await delay(250);
        assert.ok(
          await page.evaluate(() => globalThis.qaStatusEvents < 3),
          'readiness reads must not emit an event loop',
        );
      }
      await page.getByRole('radio', { name: /Local MFR-1.5/ }).check();
      await waitForApp(page, async () => (await window.api.getSettings()).ocrEngine === 'mfr');
      await assertModelInactive();
    });
    await check(
      'PaddleOCR credentials stay draft until Connect and Cancel discards them',
      async () => {
        await page.getByRole('radio', { name: /PaddleOCR API/ }).check();
        await page.getByLabel('API URL', { exact: true }).fill('http://127.0.0.1:39111');
        await page.getByLabel('Access Token', { exact: true }).fill('qa-secret-api-key');
        await delay(650);
        assert.equal(await app.evaluate(() => globalThis.qaPaddleCalls.length), 0);
        const before = await page.evaluate(() => window.api.getSettings());
        assert.equal(before.ocrEngine, 'mfr');
        assert.equal(before.accessToken, '');
        await engineCard('PaddleOCR API').getByText('Inactive', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.getByRole('button', { name: 'Download Local Model', exact: true }).waitFor();
        assert.equal(await app.evaluate(() => globalThis.qaPaddleCalls.length), 0);
      },
    );
    await check(
      'PaddleOCR explicit connection validates once, becomes Active and encrypts the key',
      async () => {
        await page.getByRole('radio', { name: /PaddleOCR API/ }).check();
        await page.getByLabel('API URL', { exact: true }).fill('http://127.0.0.1:39111');
        await page.getByLabel('Access Token', { exact: true }).fill('qa-secret-api-key');
        await page.getByRole('button', { name: 'Connect & Use', exact: true }).click();
        await waitForApp(
          page,
          async () =>
            (await window.api.getSettings()).ocrEngine === 'paddleocr' &&
            (await window.api.getEngineStatuses()).paddleocr.state === 'ready',
        );
        await engineCard('PaddleOCR API').getByText('Active', { exact: true }).waitFor();
        assert.equal(await app.evaluate(() => globalThis.qaPaddleCalls.length), 1);
        assert.equal(
          (await fs.readFile(path.join(profile, 'config.json'), 'utf8')).includes(
            'qa-secret-api-key',
          ),
          false,
        );
        await page.getByLabel('Access Token', { exact: true }).fill('qa-secret-api-key-edited');
        await delay(600);
        assert.equal(await app.evaluate(() => globalThis.qaPaddleCalls.length), 1);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(
          await page.getByLabel('Access Token', { exact: true }).inputValue(),
          'qa-secret-api-key',
        );
      },
    );
    await check('PaddleOCR 401 preserves the previous engine and working credentials', async () => {
      await app.evaluate(() => {
        globalThis.qaPaddleFailure = true;
      });
      await page.getByLabel('Access Token', { exact: true }).fill('qa-rejected-key');
      await page.getByRole('button', { name: 'Connect & Use', exact: true }).click();
      await page
        .getByText('Authentication failed. Check your Access Token and API URL in Settings.', {
          exact: true,
        })
        .waitFor();
      const current = await page.evaluate(() => window.api.getSettings());
      assert.equal(current.ocrEngine, 'paddleocr');
      assert.equal(current.accessToken, 'qa-secret-api-key');
      assert.equal(await app.evaluate(() => globalThis.qaPaddleCalls.length), 2);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await app.evaluate(() => {
        globalThis.qaPaddleFailure = false;
      });
    });
    await check(
      'PaddleOCR clipboard recognition saves PaddleOCR history and copies LaTeX',
      async () => {
        await app.evaluate(
          ({ clipboard, nativeImage }, image) =>
            clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(image, 'base64'))),
          fixture.toString('base64'),
        );
        await clickMenu('paste-image');
        await page.getByRole('textbox', { name: 'LaTeX Source' }).waitFor();
        await waitForApp(page, async () =>
          (await window.api.getHistory()).some(
            (item) => item.pipeline === 'PP-StructureV3' && item.resultLatex.includes('x^2+1'),
          ),
        );
        assert.match(
          await page.getByRole('textbox', { name: 'LaTeX Source' }).inputValue(),
          /x\^2\+1/,
        );
        assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /x\^2\+1/);
        assert.equal(await app.evaluate(() => globalThis.qaPaddleCalls.length), 3);
        await clickMenu('settings');
        // MFR-1.5 is not installed yet: choosing it previews its setup and PaddleOCR stays
        // in use until the model has been downloaded.
        await page.getByRole('radio', { name: /Local MFR-1.5/ }).check();
        await page
          .getByText('PaddleOCR API stays in use until this model is installed.', { exact: true })
          .waitFor();
        assert.equal((await page.evaluate(() => window.api.getSettings())).ocrEngine, 'paddleocr');
        await engineCard('PaddleOCR API').getByText('Active', { exact: true }).waitFor();
        await assertModelInactive();
      },
    );
    await check(
      'custom location persists and successful model setup needs no extra action',
      async () => {
        await page.locator('summary').filter({ hasText: 'Advanced model options' }).click();
        await fs.mkdir(custom);
        await app.evaluate(({ dialog }, custom) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [custom] });
        }, custom);
        await page
          .getByRole('button', { name: 'Change MFR-1.5 storage location', exact: true })
          .click();
        await waitForApp(
          page,
          async (custom) => (await window.api.getSettings()).mfrDownloadDirectory === custom,
          custom,
        );
        managedDirectory = (await page.evaluate(() => window.api.getMfrStatus())).downloadDirectory;
        if (model) {
          await copyModel(managedDirectory);
          await page.getByRole('button', { name: 'Download Local Model', exact: true }).click();
          await assertModelActive();
          assert.equal((await page.evaluate(() => window.api.getMfrStatus())).managed, true);
          await page
            .getByText('Click New Snip in the top-right corner to start.', { exact: true })
            .waitFor();
          const setupToast = page
            .locator('.toast-visible')
            .filter({ hasText: 'Model setup complete.' });
          await setupToast.waitFor();
          assert.ok(
            await setupToast.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              return Math.abs((bounds.left + bounds.right) / 2 - window.innerWidth / 2) < 1;
            }),
            'success toast stays centered after its animation styles apply',
          );
          await page.getByRole('button', { name: 'Uninstall MFR-1.5', exact: true }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Verify Model', exact: true }).count(),
            0,
          );
        }
        await page.locator('summary').filter({ hasText: 'Advanced model options' }).click();
        await page.evaluate(() => window.api.setSettings({ theme: 'light' }));
        await page.screenshot({ path: path.join(base, 'settings-ready-en-light.png') });
        await page.evaluate(() => window.api.setSettings({ language: 'zh-CN', theme: 'dark' }));
        await page.waitForFunction(
          () =>
            document.documentElement.lang === 'zh-CN' &&
            document.documentElement.classList.contains('dark'),
        );
        await page.screenshot({ path: path.join(base, 'settings-ready-zh-dark.png') });
        await page.evaluate(() => window.api.setSettings({ language: 'en', theme: 'light' }));
      },
    );
    // The real-desktop snip needs an idle screen: any always-on-top window over the fixture
    // is captured instead. Set OPENMATHPIX_SKIP_DESKTOP_SNIP=1 on a machine in use.
    if (model && process.env.OPENMATHPIX_SKIP_DESKTOP_SNIP !== '1')
      await check('New Snip captures a real desktop formula and produces LaTeX', async () => {
        const selection = await app.evaluate(
          async ({ BrowserWindow, screen, nativeImage }, image) => {
            const display = screen.getPrimaryDisplay();
            const size = nativeImage.createFromBuffer(Buffer.from(image, 'base64')).getSize();
            const bounds = {
              x: display.bounds.x + 80,
              y: display.bounds.y + 80,
              width: size.width + 40,
              height: size.height + 40,
            };
            const fixtureWindow = new BrowserWindow({
              ...bounds,
              frame: false,
              resizable: false,
              backgroundColor: '#fff',
              webPreferences: { sandbox: true },
            });
            // Match the target monitor's DPI after Windows creates the native window.
            fixtureWindow.setBounds(bounds);
            fixtureWindow.setMenu(null);
            fixtureWindow.setAlwaysOnTop(true);
            await fixtureWindow.loadURL(
              'data:text/html,' +
                encodeURIComponent(
                  `<body style="margin:20px;background:white;overflow:hidden"><img style="display:block" src="data:image/png;base64,${image}"></body>`,
                ),
            );
            fixtureWindow.show();
            globalThis.qaFixture = fixtureWindow;
            return { display: display.bounds, bounds: fixtureWindow.getBounds() };
          },
          fixture.toString('base64'),
        );
        await delay(300);
        await clickMenu('new-snip');
        // Every display gets its own overlay; select on the primary display's one, where
        // the fixture is (the first overlay to open may belong to another monitor).
        const { bounds, display } = selection;
        const region = {
          x: (bounds.x + 8 - display.x) / display.width,
          y: (bounds.y + 8 - display.y) / display.height,
          width: (bounds.width - 16) / display.width,
          height: (bounds.height - 16) / display.height,
        };
        const deadline = Date.now() + 15_000;
        let sent = false;
        while (!sent && Date.now() < deadline) {
          sent = await app.evaluate(async ({ BrowserWindow, screen }, region) => {
            const primary = screen.getPrimaryDisplay().bounds;
            const overlay = BrowserWindow.getAllWindows().find((window) => {
              if (!window.webContents.getURL().includes('overlay.html') || !window.isVisible())
                return false;
              const b = window.getBounds();
              return b.x === primary.x && b.y === primary.y;
            });
            if (!overlay || overlay.webContents.isLoading()) return false;
            const ready = await overlay.webContents
              .executeJavaScript('Boolean(window.api)')
              .catch(() => false);
            if (!ready) return false;
            await new Promise((resolve) => setTimeout(resolve, 300));
            await overlay.webContents
              .executeJavaScript(`window.api.sendOverlaySelection(${JSON.stringify(region)})`)
              .catch(() => undefined);
            return true;
          }, region);
          if (!sent) await delay(100);
        }
        assert.ok(sent, 'the primary display overlay opened');
        await app.evaluate(() => globalThis.qaFixture.destroy());
        await page.getByRole('textbox', { name: 'LaTeX Source' }).waitFor();
        // Poll from Node: a polling waitForFunction needs eval, which the page's CSP forbids.
        await waitForApp(
          page,
          async () =>
            document.querySelector('textarea[aria-label="LaTeX source"]')?.value.includes('sqrt'),
          undefined,
          30_000,
        );
        assert.equal(
          (await page.getByRole('textbox', { name: 'LaTeX Source' }).inputValue()).replace(
            /\s/g,
            '',
          ),
          'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}',
        );
        await page.screenshot({ path: path.join(base, 'snip-result.png') });
      });
    await check('Exit flushes a last-moment formula edit before terminating', async () => {
      await clickMenu('history');
      await page.locator('button[title="Open"]').last().click();
      await page.getByRole('textbox', { name: 'LaTeX Source' }).fill('x^2+42');
      await app.evaluate(({ clipboard }) => clipboard.write(globalThis.qaClipboard));
      const closed = app.waitForEvent('close');
      await clickMenu('exit');
      await closed;
      app = undefined;
      const history = JSON.parse(await fs.readFile(path.join(profile, 'history.json'), 'utf8'));
      assert.equal(history.items.find((item) => item.id === 1).resultLatex, 'x^2+42');
    });
    await check('custom storage and selected model survive restart', async () => {
      await launch();
      const settings = await page.evaluate(() => window.api.getSettings());
      assert.equal(settings.mfrDownloadDirectory, path.join(base, 'custom-models'));
      if (model) {
        assert.equal(settings.mfrModelPath, managedDirectory);
        await waitForApp(page, async () => (await window.api.getMfrStatus()).operational === true);
        const result = await page.evaluate(
          (image) => window.api.recognize(image),
          fixture.toString('base64'),
        );
        assert.equal(result.latex.replace(/\s/g, ''), 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}');
      }
      await app.evaluate(({ clipboard }) => clipboard.write(globalThis.qaClipboard));
      const closed = app.waitForEvent('close');
      await clickMenu('exit');
      await closed;
      app = undefined;
    });
    if (model) {
      await check(
        'uninstall removes only the app-managed model and marks it Inactive',
        async () => {
          await launch();
          await clickMenu('settings');
          await assertModelActive();
          await fs.writeFile(path.join(managedDirectory, 'keep-user-file.txt'), 'keep');
          await page.getByRole('button', { name: 'Uninstall MFR-1.5', exact: true }).click();
          await assertModelInactive();
          assert.equal(
            (await page.evaluate(() => window.api.getSettings())).mfrModelEnabled,
            false,
          );
          await assert.rejects(fs.access(path.join(managedDirectory, 'encoder_model.onnx')));
          assert.equal(
            await fs.readFile(path.join(managedDirectory, 'keep-user-file.txt'), 'utf8'),
            'keep',
          );
          await fs.access(path.join(model, 'encoder_model.onnx'));
          await exitApp();
        },
      );
      await check('uninstalled model stays Inactive after restart', async () => {
        await launch();
        await clickMenu('settings');
        await assertModelInactive();
        assert.equal((await page.evaluate(() => window.api.getSettings())).mfrModelEnabled, false);
        await page.screenshot({ path: path.join(base, 'settings-uninstalled-en.png') });
      });
      await check(
        'imported model disconnect keeps external files and a cached model cannot auto-load',
        async () => {
          await copyModel(managedDirectory);
          await page.getByRole('button', { name: 'Download Local Model', exact: true }).click();
          await assertModelActive();
          await copyModel(importedDirectory);
          await page.locator('summary').filter({ hasText: 'Advanced model options' }).click();
          await app.evaluate(({ dialog }, directory) => {
            dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
          }, importedDirectory);
          await page.getByRole('button', { name: 'Import Existing Model...', exact: true }).click();
          await waitForApp(
            page,
            async (directory) => (await window.api.getSettings()).mfrModelPath === directory,
            importedDirectory,
          );
          await assertModelActive();
          assert.equal((await page.evaluate(() => window.api.getMfrStatus())).managed, false);
          await page.getByRole('button', { name: 'Disconnect MFR-1.5', exact: true }).click();
          await assertModelInactive();
          for (const filename of modelFiles) {
            await fs.access(path.join(importedDirectory, filename));
            await fs.access(path.join(managedDirectory, filename));
          }
          await exitApp();
          await launch();
          await clickMenu('settings');
          await assertModelInactive();
          assert.equal(
            (await page.evaluate(() => window.api.getSettings())).mfrModelEnabled,
            false,
          );
          await exitApp();
        },
      );
    }
    await check(
      'a missing saved model shows a repair action instead of Active on restart',
      async () => {
        const configPath = path.join(profile, 'config.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        config.mfrModelPath = path.join(base, 'missing-model');
        config.mfrModelEnabled = true;
        await fs.writeFile(configPath, JSON.stringify(config));
        await launch();
        await clickMenu('settings');
        // The missing folder was imported, not downloaded: offer a fresh download (not
        // "Repair") and show which folder is gone.
        await page.getByRole('button', { name: 'Download Local Model', exact: true }).waitFor();
        assert.equal(
          await page.getByRole('button', { name: 'Repair Download', exact: true }).count(),
          0,
        );
        await page
          .getByText(`Model folder: ${config.mfrModelPath}`, { exact: true })
          .first()
          .waitFor();
        await engineCard('Local MFR-1.5').getByText('Inactive', { exact: true }).waitFor();
        assert.equal((await page.evaluate(() => window.api.getMfrStatus())).state, 'error');
        assert.equal(
          await page.getByRole('button', { name: 'Verify Model', exact: true }).count(),
          0,
        );
        await page.screenshot({ path: path.join(base, 'missing-model.png') });
        await exitApp();
      },
    );
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(base, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`Artifacts: ${base}`);
  } catch (error) {
    await page?.screenshot({ path: path.join(base, 'failure.png') }).catch(() => {});
    await fs.writeFile(
      path.join(base, 'report.json'),
      JSON.stringify({ checks, errors, failure: String(error.stack || error) }, null, 2),
    );
    console.error(`Artifacts: ${base}`);
    throw error;
  } finally {
    if (app) {
      await app
        .evaluate(({ clipboard }) => {
          if (globalThis.qaClipboard) clipboard.write(globalThis.qaClipboard);
        })
        .catch(() => {});
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
