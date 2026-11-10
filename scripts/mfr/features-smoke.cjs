// Linux/X11 only, under a graphical session or Xvfb. Playwright is test-only.
// Exercises snipping, copy styles, editing, background mode, the hotkey recorder,
// PaddleOCR (against a local fake server), navigation/CSP and history recovery in the
// real app with the real model. Notifications and external URLs are recorded, not shown.
// --only <text> runs only the steps whose name contains <text>.
if (process.platform !== 'linux')
  throw new Error('This isolated feature smoke test supports Linux/X11 only.');
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
const base = path.resolve(
  argument(
    '--output-dir',
    require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'openmathpix-features-')),
  ),
);
const modelArgument = argument('--model-dir', process.env.OPENMATHPIX_MFR_MODEL_DIR);
if (!modelArgument) throw new Error('Pass --model-dir or OPENMATHPIX_MFR_MODEL_DIR.');
const modelDir = path.resolve(modelArgument);
const only = argument('--only', '');

const report = { steps: [], rendererErrors: [], consoleErrors: [], mainLog: [] };
const fixtures = {};
let app;
let page;
let fixtureWindow;

const QUADRATIC = 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}';
const QUADRATIC_REGION = [90, 90, 394, 202];
const MATRIX_REGION = [90, 250, 290, 367];
const BLANK_REGION = [450, 300, 600, 420];

async function step(name, fn) {
  if (only && !name.includes(only) && !name.startsWith('setup')) return;
  const started = Date.now();
  try {
    const details = await fn();
    report.steps.push({ name, ok: true, ms: Date.now() - started, details });
    console.log(`PASS ${name}${details ? ' ' + JSON.stringify(details) : ''}`);
  } catch (error) {
    report.steps.push({ name, ok: false, ms: Date.now() - started, error: error.stack });
    console.log(`FAIL ${name}\n  ${String(error.stack).split('\n').slice(0, 6).join('\n  ')}`);
    await page?.screenshot({ path: path.join(base, `fail-${name.replace(/\W+/g, '-')}.png`) });
  }
}

async function launch() {
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(base, 'profile'),
    XDG_CACHE_HOME: path.join(base, 'cache'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/electron'),
    args: ['--disable-gpu', root],
    env,
    timeout: 30000,
  });
  app.context().setDefaultTimeout(15000);
  app.process().stdout.on('data', (d) => report.mainLog.push(String(d)));
  app.process().stderr.on('data', (d) => report.mainLog.push(String(d)));
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  assert.ok(userData.startsWith(base), 'refusing to test outside the isolated profile');
  page = await app.firstWindow();
  page.on('pageerror', (e) => report.rendererErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && report.consoleErrors.push(m.text()));
  await page.waitForFunction(() => Boolean(window.api));
  await waitForApp(page, async () => (await window.api.getMfrStatus()).state === 'ready');
  // Record instead of reaching the desktop: notifications and external URLs.
  await app.evaluate(({ Notification, shell }) => {
    globalThis.__notes = [];
    globalThis.__external = [];
    Notification.isSupported = () => true;
    Notification.prototype.show = function () {
      globalThis.__notes.push(this);
    };
    shell.openExternal = async (url) => {
      globalThis.__external.push(url);
    };
  });
  return userData;
}

async function showFixtures() {
  const windowPromise = app.waitForEvent('window');
  await app.evaluate(async ({ BrowserWindow }, images) => {
    const w = new BrowserWindow({
      x: 0,
      y: 0,
      width: 640,
      height: 480,
      frame: false,
      show: true,
      backgroundColor: '#ffffff',
      webPreferences: { contextIsolation: true },
    });
    globalThis.__fixtureWindow = w;
    const img = (data, left, top) =>
      `<img style="position:absolute;left:${left}px;top:${top}px" src="data:image/png;base64,${data}">`;
    await w.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          `<body style="margin:0;background:white">${img(images.quadratic, 100, 100)}${img(images.matrix, 100, 260)}</body>`,
        ),
    );
  }, fixtures);
  fixtureWindow = await windowPromise;
  await fixtureWindow.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete),
  );
}

const settings = () => page.evaluate(() => window.api.getSettings());
const setSettings = (update) => page.evaluate((u) => window.api.setSettings(u), update);
const history = () => page.evaluate(() => window.api.getHistory());
const clipboardText = () => app.evaluate(({ clipboard }) => clipboard.readText());
const clearClipboard = () => app.evaluate(({ clipboard }) => clipboard.writeText('<empty>'));
const mainState = () =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().endsWith('/renderer/index.html'),
    );
    return { visible: w.isVisible(), focused: w.isFocused(), minimized: w.isMinimized() };
  });
const notes = () =>
  app.evaluate(() => globalThis.__notes.map(({ title, body }) => ({ title, body })));
const goto = async (name) => {
  await page.locator('header nav').getByRole('button', { name, exact: true }).click();
};

/** Opens the snip overlay with `trigger`, then drags `region` (or runs `act`). */
async function snip(trigger, region, act) {
  const overlayPromise = app.waitForEvent('window');
  await trigger();
  const overlay = await overlayPromise;
  await overlay.waitForFunction(
    () => document.querySelector('canvas')?.width === innerWidth * devicePixelRatio,
  );
  await overlay.waitForTimeout(100);
  if (act) return act(overlay);
  const [x1, y1, x2, y2] = region;
  await overlay.mouse.move(x1, y1);
  await overlay.mouse.down();
  await overlay.mouse.move(x2, y2, { steps: 6 });
  await overlay.mouse.up();
  return overlay;
}
const snipFromApi = () => page.evaluate(() => window.api.startSnip());
/** Escape/right-click destroy the overlay before the key or button is released. */
async function closesOverlay(overlay, action) {
  const closed = overlay.waitForEvent('close');
  await action().catch((error) => {
    if (!/closed/.test(error.message)) throw error;
  });
  await closed;
}

async function waitHistoryLength(length) {
  await waitForApp(page, async (n) => (await window.api.getHistory()).length === n, length);
}

(async () => {
  // The profile must start empty; never delete a directory passed by the caller.
  if ((await fs.readdir(base).catch(() => [])).length)
    throw new Error(`--output-dir must be empty or missing: ${base}`);
  const modelParent = path.join(base, 'profile/openmathpix/models/mfr-1.5');
  await fs.mkdir(modelParent, { recursive: true });
  const { MFR_REVISION } = require(path.join(root, '.test-dist/src/services/mfr-model.js'));
  await fs.symlink(modelDir, path.join(modelParent, MFR_REVISION));
  for (const name of ['quadratic', 'matrix', 'blank', 'gaussian-integral', 'low-resolution']) {
    fixtures[name] = (
      await fs.readFile(path.join(root, `tests/fixtures/mfr/${name}.png`))
    ).toString('base64');
  }
  const userData = await launch();
  const historyFile = path.join(userData, 'history.json');

  await step('setup: defaults of new settings', async () => {
    const s = await settings();
    assert.equal(s.afterSnip, 'window');
    assert.equal(s.latexCopyStyle, 'plain');
    assert.equal(s.cleanLatex, true);
    assert.equal(s.modelSource, 'huggingface');
    return { afterSnip: s.afterSnip, latexCopyStyle: s.latexCopyStyle };
  });
  await showFixtures();

  await step('toolbar shows the hotkey in the New Snip tooltip', async () => {
    const title = await page
      .locator('header')
      .getByRole('button', { name: 'New Snip', exact: true })
      .getAttribute('title');
    assert.equal(title, 'New Snip (Ctrl+Shift+S)');
    return { title };
  });

  await step('warm-up starts the local model before the selection is made', async () => {
    const utility = () =>
      app.evaluate(({ app }) =>
        app.getAppMetrics().filter((m) => m.type === 'Utility' && /MFR/.test(m.name ?? '')),
      );
    const before = (await utility()).length;
    let during;
    await snip(
      () => page.locator('header').getByRole('button', { name: 'New Snip', exact: true }).click(),
      null,
      async (overlay) => {
        await waitForApp(
          page,
          async () => true, // keep page responsive
        );
        await new Promise((r) => setTimeout(r, 300));
        during = (await utility()).length;
        await closesOverlay(overlay, () => overlay.keyboard.press('Escape'));
      },
    );
    await waitForApp(page, async () => document.visibilityState === 'visible');
    assert.equal(before, 0, 'no worker before the first snip');
    assert.equal(during, 1, 'worker is started while the overlay is open');
    // The model was loaded during the cancelled snip, so this recognition loads nothing.
    await page.waitForTimeout(1500);
    const warm = await page.evaluate((d) => window.api.recognize(d), fixtures.quadratic);
    await page.evaluate(() => window.api.clearHistory());
    assert.ok(
      warm.rawResponse.loadMs < 5,
      `model already loaded (loadMs ${warm.rawResponse.loadMs})`,
    );
    return {
      before,
      during,
      loadMs: warm.rawResponse.loadMs,
      engineMs: warm.rawResponse.elapsedMs,
    };
  });

  await step('snip in window mode: tidied LaTeX, focused window, plain copy', async () => {
    await clearClipboard();
    const started = Date.now();
    await snip(
      () => page.locator('header').getByRole('button', { name: 'New Snip', exact: true }).click(),
      QUADRATIC_REGION,
    );
    await waitHistoryLength(1);
    await page.locator('.katex').first().waitFor();
    const elapsed = Date.now() - started;
    const source = page.getByRole('textbox', { name: 'LaTeX source', exact: true });
    assert.equal(await source.inputValue(), QUADRATIC);
    await waitForApp(page, async () => true);
    const state = await mainState();
    assert.equal(state.visible, true);
    assert.equal(state.focused, true);
    await page.waitForTimeout(200);
    assert.equal(await clipboardText(), QUADRATIC);
    assert.equal((await history())[0].resultLatex, QUADRATIC);
    assert.deepEqual(await notes(), [], 'no notification while the window is in front');
    await page.screenshot({ path: path.join(base, 'result.png') });
    return { elapsedMs: elapsed, state };
  });

  await step('window mode restores a minimized window after the snip', async () => {
    const minimized = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().endsWith('/renderer/index.html'),
      );
      w.minimize();
      await new Promise((r) => setTimeout(r, 500));
      return w.isMinimized();
    });
    if (!minimized) return { skipped: 'Xvfb without a window manager cannot minimize' };
    const count = (await history()).length;
    await snip(snipFromApi, QUADRATIC_REGION);
    await waitHistoryLength(count + 1);
    await page.waitForTimeout(500);
    const state = await mainState();
    assert.equal(state.minimized, false);
    assert.equal(state.visible, true);
    return state;
  });

  await step('copy-as chips write every style to the system clipboard', async () => {
    const copies = {};
    for (const label of ['LaTeX', '$ … $', '$$ … $$', '\\[ … \\]', 'equation', 'MathML']) {
      await clearClipboard();
      await page.getByRole('button', { name: label, exact: true }).click();
      await waitForApp(page, async () => true);
      await page.waitForTimeout(100);
      copies[label] = await clipboardText();
    }
    assert.equal(copies['LaTeX'], QUADRATIC);
    assert.equal(copies['$ … $'], `$${QUADRATIC}$`);
    assert.equal(copies['$$ … $$'], `$$\n${QUADRATIC}\n$$`);
    assert.equal(copies['\\[ … \\]'], `\\[\n${QUADRATIC}\n\\]`);
    assert.equal(copies['equation'], `\\begin{equation}\n${QUADRATIC}\n\\end{equation}`);
    assert.match(copies['MathML'], /^<math xmlns="http:\/\/www.w3.org\/1998\/Math\/MathML"/);
    assert.match(copies['MathML'], /<mfrac>/);
    assert.doesNotMatch(copies['MathML'], /annotation|semantics/);
    return { mathml: copies['MathML'].slice(0, 80) + '…' };
  });

  await step('copy style setting drives the Copy button', async () => {
    await goto('Settings');
    await page.getByRole('combobox', { name: 'LaTeX copy style' }).selectOption('display');
    await waitForApp(
      page,
      async () => (await window.api.getSettings()).latexCopyStyle === 'display',
    );
    await goto('Result');
    const copy = page.getByRole('button', { name: /^Copy/ }).first();
    const text = (await copy.textContent()).trim();
    await clearClipboard();
    await copy.click();
    await page.waitForTimeout(200);
    assert.equal(await clipboardText(), `$$\n${QUADRATIC}\n$$`);
    return { button: text };
  });

  await step('editing the source updates preview, Reset, history and copies', async () => {
    const source = page.getByRole('textbox', { name: 'LaTeX source', exact: true });
    const id = (await history())[0].id;
    const edited = QUADRATIC.replace('2a', '2a^{3}');
    await source.fill(edited);
    await page.getByRole('button', { name: 'Reset', exact: true }).waitFor();
    const notice = page.getByRole('button', { name: 'Reset', exact: true }).locator('..');
    assert.equal((await notice.textContent()).trim(), 'EditedReset');
    // The preview shows the edit (an extra superscript 3 in the denominator).
    const katexText = await page.locator('.katex-html').first().textContent();
    assert.match(katexText, /2a3/);
    await waitForApp(
      page,
      async ({ id, edited }) =>
        (await window.api.getHistory()).find((item) => item.id === id).resultLatex === edited,
      { id, edited },
    );
    const item = (await history()).find((h) => h.id === id);
    assert.equal(item.resultMarkdown, `$$\n${edited}\n$$`);
    await clearClipboard();
    await page.getByRole('button', { name: 'LaTeX', exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(await clipboardText(), edited);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await source.inputValue(), QUADRATIC);
    await waitForApp(
      page,
      async ({ id, original }) =>
        (await window.api.getHistory()).find((item) => item.id === id).resultLatex === original,
      { id, original: QUADRATIC },
    );
    // An edit followed immediately by navigation is flushed, not lost.
    await source.fill(edited);
    await goto('History');
    await page.getByText('MFR-1.5', { exact: true }).first().waitFor();
    const saved = (await history()).find((h) => h.id === id).resultLatex;
    assert.equal(saved, edited);
    return { saved };
  });

  await step('history page: inline preview, search, copy, reopen with edit', async () => {
    await page.locator('main .katex').first().waitFor();
    await page.getByPlaceholder('Search history...').fill('2a^{3}');
    await page.waitForTimeout(400);
    const rows = await page.getByRole('button', { name: 'Copy', exact: true }).count();
    assert.equal(rows, 1);
    await page.getByPlaceholder('Search history...').fill('no-such-formula');
    await page.getByText('No matching history.').waitFor();
    await page.getByPlaceholder('Search history...').fill('');
    await page.waitForTimeout(300);
    await clearClipboard();
    await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
    await page.waitForTimeout(200);
    const copied = await clipboardText();
    assert.equal(copied, `$$\n${QUADRATIC.replace('2a', '2a^{3}')}\n$$`);
    await page.getByText('MFR-1.5', { exact: true }).first().click();
    const source = page.getByRole('textbox', { name: 'LaTeX source', exact: true });
    assert.equal(await source.inputValue(), QUADRATIC.replace('2a', '2a^{3}'));
    // The reopened, already-saved entry is the new baseline.
    assert.equal(await page.getByRole('button', { name: 'Reset', exact: true }).count(), 0);
    await source.fill(QUADRATIC);
    await page.waitForTimeout(900);
    return { copied };
  });

  await step('confidence notice follows the model confidence', async () => {
    const results = {};
    for (const name of ['quadratic', 'gaussian-integral', 'low-resolution']) {
      const result = await page.evaluate((data) => window.api.recognize(data), fixtures[name]);
      results[name] = { latex: result.latex, kind: result.kind, confidence: result.confidence };
      assert.equal(result.kind, 'formula');
      assert.ok(result.confidence.lowest > 0 && result.confidence.lowest <= 1);
      assert.ok(result.confidence.average >= result.confidence.lowest);
      assert.equal(typeof result.historyId, 'number');
    }
    return results;
  });

  await step('drag-and-drop shows the drop hint and recognizes the image', async () => {
    const count = (await history()).length;
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
      document
        .querySelector('#root > div')
        .dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
    });
    await page.getByText('Drop the image to recognize it').waitFor();
    await page.screenshot({ path: path.join(base, 'drag.png') });
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'matrix.png', { type: 'image/png' }));
      document
        .querySelector('#root > div')
        .dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }),
        );
    }, fixtures.matrix);
    await waitHistoryLength(count + 1);
    assert.equal(await page.getByText('Drop the image to recognize it').count(), 0);
    await page.getByRole('textbox', { name: 'LaTeX source', exact: true }).waitFor();
    const latex = await page
      .getByRole('textbox', { name: 'LaTeX source', exact: true })
      .inputValue();
    assert.match(latex, /\\begin\{pmatrix\}/);
    return { latex };
  });

  await step('pasting an image with Ctrl+V recognizes it', async () => {
    const count = (await history()).length;
    await app.evaluate(({ clipboard, nativeImage }, base64) => {
      clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(base64, 'base64')));
    }, fixtures['gaussian-integral']);
    await page.locator('header').click({ position: { x: 400, y: 20 } });
    await page.keyboard.press('Control+V');
    await waitHistoryLength(count + 1);
    const latex = (await history())[0].resultLatex;
    assert.match(latex, /\\int/);
    return { latex };
  });

  await step('blank image shows an error with Retry and no history', async () => {
    const count = (await history()).length;
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'blank.png', { type: 'image/png' }));
      document
        .querySelector('#root > div')
        .dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }),
        );
    }, fixtures.blank);
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    const message = await page.locator('main').innerText();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.equal((await history()).length, count);
    await page.screenshot({ path: path.join(base, 'error.png') });
    return { message: message.split('\n').slice(0, 3).join(' | ') };
  });

  await step('tidy setting off returns the raw tokenized LaTeX', async () => {
    await goto('Settings');
    await page.getByRole('checkbox', { name: /Tidy local model LaTeX/ }).uncheck();
    await waitForApp(page, async () => (await window.api.getSettings()).cleanLatex === false);
    const raw = await page.evaluate((d) => window.api.recognize(d), fixtures.quadratic);
    await page.getByRole('checkbox', { name: /Tidy local model LaTeX/ }).check();
    await waitForApp(page, async () => (await window.api.getSettings()).cleanLatex === true);
    const tidy = await page.evaluate((d) => window.api.recognize(d), fixtures.quadratic);
    assert.match(raw.latex, / \\frac \{/);
    assert.equal(tidy.latex, QUADRATIC);
    assert.equal(raw.rawResponse.rawLatex, raw.latex);
    return { raw: raw.latex };
  });

  await step('overlay: right-click while dragging resets, right-click again cancels', async () => {
    const count = (await history()).length;
    await snip(snipFromApi, null, async (overlay) => {
      await overlay.mouse.move(90, 90);
      await overlay.mouse.down();
      await overlay.mouse.move(300, 200, { steps: 4 });
      await overlay.mouse.click(300, 200, { button: 'right' });
      await overlay.mouse.up();
      await overlay.waitForTimeout(300);
      assert.equal(overlay.isClosed(), false, 'right-click during a drag keeps the overlay');
      await closesOverlay(overlay, () => overlay.mouse.click(500, 500, { button: 'right' }));
    });
    await waitForApp(page, async () => document.visibilityState === 'visible');
    const state = await mainState();
    assert.equal(state.visible, true);
    assert.equal((await history()).length, count);
    return state;
  });

  await step('overlay: Escape cancels, and a new snip can start afterwards', async () => {
    await snip(snipFromApi, null, async (overlay) => {
      await closesOverlay(overlay, () => overlay.keyboard.press('Escape'));
    });
    const count = (await history()).length;
    await snip(snipFromApi, MATRIX_REGION);
    await waitHistoryLength(count + 1);
    return { latex: (await history())[0].resultLatex };
  });

  await step('background mode: window stays unfocused, copies and notifies', async () => {
    await goto('Settings');
    await page.getByRole('radio', { name: /Copy in the background/ }).check();
    await waitForApp(page, async () => (await window.api.getSettings()).afterSnip === 'notify');
    await setSettings({ latexCopyStyle: 'inline' });
    await app.evaluate(() => {
      globalThis.__notes.length = 0;
      globalThis.__fixtureWindow.focus();
    });
    await clearClipboard();
    const count = (await history()).length;
    await snip(snipFromApi, QUADRATIC_REGION);
    await waitHistoryLength(count + 1);
    await waitForApp(page, async () => true);
    await page.waitForTimeout(300);
    const state = await mainState();
    const text = await clipboardText();
    const shown = await notes();
    assert.equal(state.focused, false, 'background mode must not focus the main window');
    assert.equal(text, `$${QUADRATIC}$`);
    assert.deepEqual(shown, [{ title: 'Copied to clipboard', body: `$${QUADRATIC}$` }]);
    return { state, shown };
  });

  await step('background mode with hidden window: stays hidden; click opens it', async () => {
    await app.evaluate(({ BrowserWindow }) => {
      globalThis.__notes.length = 0;
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('/renderer/index.html'))
        .hide();
    });
    const count = (await history()).length;
    await snip(snipFromApi, MATRIX_REGION);
    await waitHistoryLength(count + 1);
    await waitForApp(page, async () => true);
    await page.waitForTimeout(300);
    const hidden = await mainState();
    assert.equal(hidden.visible, false, 'a hidden window stays hidden');
    const shown = await notes();
    assert.equal(shown.length, 1);
    assert.equal(shown[0].title, 'Copied to clipboard');
    await app.evaluate(() => globalThis.__notes[0].emit('click'));
    await page.waitForTimeout(300);
    const after = await mainState();
    assert.equal(after.visible, true);
    return { shown, after };
  });

  await step('background mode: a failed recognition notifies the error', async () => {
    await app.evaluate(() => {
      globalThis.__notes.length = 0;
      globalThis.__fixtureWindow.focus();
    });
    await snip(snipFromApi, BLANK_REGION);
    await waitForApp(page, async () => true);
    await new Promise((r) => setTimeout(r, 4000));
    const shown = await notes();
    assert.equal(shown.length, 1);
    assert.equal(shown[0].title, 'Recognition failed');
    return { shown };
  });

  await step('background notification follows the interface language', async () => {
    await setSettings({ language: 'zh-CN' });
    await app.evaluate(() => {
      globalThis.__notes.length = 0;
      globalThis.__fixtureWindow.focus();
    });
    const count = (await history()).length;
    await snip(snipFromApi, QUADRATIC_REGION);
    await waitHistoryLength(count + 1);
    await waitForApp(page, async () => true);
    await page.waitForTimeout(300);
    const shown = await notes();
    await setSettings({ language: 'en', afterSnip: 'window', latexCopyStyle: 'plain' });
    assert.deepEqual(shown, [{ title: '已复制到剪贴板', body: '$' + QUADRATIC + '$' }]);
    return { shown };
  });

  await step('hotkey recorder registers a new global shortcut', async () => {
    await page.bringToFront();
    await goto('Settings');
    const recorder = page.getByRole('button', { name: 'Snip Hotkey', exact: true });
    await recorder.click();
    await page.getByText('Press the new shortcut. Esc cancels.').waitFor();
    await page.keyboard.press('Shift+A'); // Shift alone is not enough
    await page.getByText('Press the new shortcut. Esc cancels.').waitFor();
    await page.keyboard.press('Escape');
    await page.getByText('Click to change').waitFor();
    assert.equal((await settings()).snipHotkey, 'CommandOrControl+Shift+S');
    await recorder.click();
    await page.keyboard.press('Control+Alt+K');
    await waitForApp(
      page,
      async () => (await window.api.getSettings()).snipHotkey === 'CommandOrControl+Alt+K',
    );
    const registered = await app.evaluate(({ globalShortcut }) => ({
      next: globalShortcut.isRegistered('CommandOrControl+Alt+K'),
      old: globalShortcut.isRegistered('CommandOrControl+Shift+S'),
    }));
    assert.deepEqual(registered, { next: true, old: false });
    const title = await page
      .locator('header')
      .getByRole('button', { name: 'New Snip', exact: true })
      .getAttribute('title');
    assert.equal(title, 'New Snip (Ctrl+Alt+K)');
    await page.screenshot({ path: path.join(base, 'hotkey.png') });
    return { registered, title };
  });

  await step('hotkey recorder captures menu shortcuts instead of running them', async () => {
    const recorder = page.getByRole('button', { name: 'Snip Hotkey', exact: true });
    const results = {};
    await page.evaluate(() => {
      window.__notReloaded = true;
    });
    for (const [keys, expected] of [
      ['Control+R', 'CommandOrControl+R'],
      ['Control+Shift+R', 'CommandOrControl+Shift+R'],
      ['Control+M', 'CommandOrControl+M'],
      ['Control+W', 'CommandOrControl+W'],
    ]) {
      await recorder.click();
      await page.getByText('Press the new shortcut. Esc cancels.').waitFor();
      await page.keyboard.press(keys);
      await page.waitForTimeout(400);
      const state = await mainState();
      const stillSamePage = await page.evaluate(() => window.__notReloaded === true);
      results[keys] = { saved: (await settings()).snipHotkey, state, stillSamePage };
      assert.equal(stillSamePage, true, `${keys} reloaded the page`);
      assert.equal(state.visible && !state.minimized, true, `${keys} hid the window`);
      assert.equal(results[keys].saved, expected);
    }
    return results;
  });

  await step('every key the recorder produces registers as a global shortcut', async () => {
    const accelerators = [
      'CommandOrControl+Alt+-',
      'CommandOrControl+Alt+=',
      'CommandOrControl+Alt+[',
      'CommandOrControl+Alt+]',
      'CommandOrControl+Alt+\\',
      'CommandOrControl+Alt+;',
      "CommandOrControl+Alt+'",
      'CommandOrControl+Alt+,',
      'CommandOrControl+Alt+.',
      'CommandOrControl+Alt+/',
      'CommandOrControl+Alt+`',
      'CommandOrControl+Alt+num1',
      'CommandOrControl+Alt+Space',
      // Not Ctrl+Alt+arrows: desktop window managers commonly own them.
      'CommandOrControl+Shift+Up',
      'CommandOrControl+Shift+Enter',
      'CommandOrControl+Alt+Backspace',
      'CommandOrControl+PrintScreen',
      'Super+Shift+S',
      'F9',
      'Shift+F10',
    ];
    const outcome = await app.evaluate(({ globalShortcut }, list) => {
      const result = {};
      for (const accelerator of list) {
        try {
          result[accelerator] = globalShortcut.register(accelerator, () => undefined);
          globalShortcut.unregister(accelerator);
        } catch (error) {
          result[accelerator] = `throws: ${error.message}`;
        }
      }
      return result;
    }, accelerators);
    const failed = Object.entries(outcome).filter(([, ok]) => ok !== true);
    assert.deepEqual(failed, []);
    return { checked: accelerators.length };
  });

  await step('an unavailable hotkey shows an error and keeps the working one', async () => {
    await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
    await waitForApp(
      page,
      async () => (await window.api.getSettings()).snipHotkey === 'CommandOrControl+Shift+S',
    );
    // Another application already owns Ctrl+Alt+J.
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.register('CommandOrControl+Alt+J', () => undefined),
    );
    const recorder = page.getByRole('button', { name: 'Snip Hotkey', exact: true });
    await recorder.click();
    await page.keyboard.press('Control+Alt+J');
    const error = page.getByText('This snip hotkey is unavailable. Choose a different shortcut.');
    await error.waitFor();
    await page.waitForTimeout(800);
    const s = await settings();
    const registered = await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered('CommandOrControl+Shift+S'),
    );
    const shown = (await recorder.innerText()).replace(/\s+/g, ' ');
    await page.screenshot({ path: path.join(base, 'hotkey-conflict.png') });
    await app.evaluate(({ globalShortcut }) => globalShortcut.unregister('CommandOrControl+Alt+J'));
    assert.equal(s.snipHotkey, 'CommandOrControl+Shift+S');
    assert.equal(registered, true);
    // Then record a working one again for the restart check below.
    await recorder.click();
    await page.keyboard.press('Control+Alt+K');
    await waitForApp(
      page,
      async () => (await window.api.getSettings()).snipHotkey === 'CommandOrControl+Alt+K',
    );
    await error.waitFor({ state: 'detached' });
    return { shown };
  });

  await step('mirror download source changes the model page URL', async () => {
    await setSettings({ modelSource: 'hf-mirror' });
    await page.evaluate(() => window.api.openMfrModelPage());
    await setSettings({ modelSource: 'huggingface' });
    await page.evaluate(() => window.api.openMfrModelPage());
    const urls = await app.evaluate(() => globalThis.__external.slice(-2));
    assert.match(urls[0], /^https:\/\/hf-mirror\.com\//);
    assert.match(urls[1], /^https:\/\/huggingface\.co\//);
    return { urls };
  });

  await step('PaddleOCR single formula: bare LaTeX copy, document kind, history', async () => {
    const http = require('node:http');
    const requests = [];
    let markdown = '$$\nE=mc^{2}\n$$';
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        requests.push({ url: req.url, auth: req.headers.authorization, size: body.length });
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            errorCode: 0,
            errorMsg: 'Success',
            result: { layoutParsingResults: [{ markdown: { text: markdown } }] },
          }),
        );
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    server.unref(); // never keep the test process alive
    globalThis.__paddle = { server, requests, set: (next) => (markdown = next) };
    await setSettings({
      ocrEngine: 'paddleocr',
      apiUrl: `http://127.0.0.1:${server.address().port}`,
      // Tokens need the system keyring (safeStorage), which Xvfb does not provide.
      pipeline: 'PP-StructureV3',
    });
    await goto('Result');
    await clearClipboard();
    const count = (await history()).length;
    await snip(snipFromApi, QUADRATIC_REGION);
    await waitHistoryLength(count + 1);
    await page.locator('.katex').first().waitFor();
    await page.waitForTimeout(300);
    const copied = await clipboardText();
    const item = (await history())[0];
    assert.equal(requests.at(-1).url, '/layout-parsing');
    assert.equal(item.pipeline, 'PP-StructureV3');
    assert.equal(copied, 'E=mc^{2}');
    const source = page.getByRole('textbox', { name: 'LaTeX source', exact: true });
    const shownSource = await source.inputValue();
    await page.screenshot({ path: path.join(base, 'paddle-formula.png') });
    return { copied, latex: item.resultLatex, shownSource };
  });

  await step(
    'PaddleOCR document: Markdown tab, multi-formula copy, markdown edit saved',
    async () => {
      globalThis.__paddle.set(
        '## Results\n\nThe energy is $E=mc^{2}$ and\n\n$$\n\\int_0^1 x\\,dx=\\frac{1}{2}\n$$\n\n| a | b |\n| --- | --- |\n| 1 | 2 |',
      );
      const count = (await history()).length;
      await snip(snipFromApi, QUADRATIC_REGION);
      await waitHistoryLength(count + 1);
      await page.waitForTimeout(300);
      const item = (await history())[0];
      const copied = await clipboardText();
      await page.screenshot({ path: path.join(base, 'paddle-document-latex.png') });
      await page.getByRole('tab', { name: 'Markdown' }).click();
      await page.locator('.markdown-body h2').waitFor();
      await page.screenshot({ path: path.join(base, 'paddle-document-markdown.png') });
      await page.locator('summary').click();
      const md = page.getByRole('textbox', { name: 'Markdown source', exact: true });
      await md.fill(item.resultMarkdown.replace('Results', 'Edited results'));
      await page.locator('.markdown-body h2', { hasText: 'Edited results' }).waitFor();
      await waitForApp(
        page,
        async (id) =>
          (await window.api.getHistory())
            .find((h) => h.id === id)
            .resultMarkdown.includes('Edited results'),
        item.id,
      );
      return { latex: item.resultLatex, copied, text: item.resultText.slice(0, 60) };
    },
  );
  if (globalThis.__paddle) {
    await setSettings({ ocrEngine: 'mfr' });
    globalThis.__paddle.server.closeAllConnections();
    globalThis.__paddle.server.close();
  }

  await step('navigation guard and CSP', async () => {
    const before = page.url();
    const opened = await page.evaluate(() => window.open('https://example.com/opened') === null);
    await page.evaluate(() => {
      location.href = 'https://example.com/navigated';
    });
    await page.waitForTimeout(500);
    const external = await app.evaluate(() => globalThis.__external.slice(-2));
    const inline = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__inlineRan = true';
      document.head.appendChild(script);
      return window.__inlineRan === true;
    });
    const csp = await page.evaluate(
      () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
    );
    assert.equal(opened, true);
    assert.equal(page.url(), before, 'in-app navigation away is blocked');
    // Links leave the app through the system browser, never inside the app window.
    assert.deepEqual(external, ['https://example.com/opened', 'https://example.com/navigated']);
    assert.equal(inline, false, 'inline scripts are blocked');
    assert.match(csp, /script-src 'self'/);
    return { external, csp: csp.slice(0, 40) + '…' };
  });

  await step('restart keeps settings and edited history', async () => {
    const id = (await history()).at(-1).id;
    await page.evaluate(({ id }) => window.api.updateHistoryItem(id, { resultLatex: 'y=1' }), {
      id,
    });
    await app.close();
    await launch();
    const s = await settings();
    assert.equal(s.snipHotkey, 'CommandOrControl+Alt+K');
    assert.equal(s.cleanLatex, true);
    const item = (await history()).find((h) => h.id === id);
    assert.equal(item.resultLatex, 'y=1');
    const registered = await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered('CommandOrControl+Alt+K'),
    );
    assert.equal(registered, true);
    return { entries: (await history()).length };
  });

  await step('corrupt history file is backed up and the app recovers', async () => {
    await app.close();
    await fs.writeFile(historyFile, '{"items": [ broken');
    await launch();
    assert.deepEqual(await history(), []);
    const files = await fs.readdir(userData);
    const backup = files.find((f) => /^history\.corrupt-.*\.json$/.test(f));
    assert.ok(backup, 'corrupt file is kept as a backup');
    assert.equal(await fs.readFile(path.join(userData, backup), 'utf8'), '{"items": [ broken');
    await page.evaluate((d) => window.api.recognize(d), fixtures.quadratic);
    const saved = JSON.parse(await fs.readFile(historyFile, 'utf8'));
    assert.ok(saved);
    assert.equal((await history()).length, 1);
    return { backup, tmpLeft: files.filter((f) => f.endsWith('.tmp')) };
  });

  await app.close();
  // The CSP check deliberately injects an inline script.
  report.consoleErrors = report.consoleErrors.filter(
    (e) => !/Executing inline script violates/.test(e),
  );
  report.ok = report.steps.every((s) => s.ok);
  await fs.writeFile(path.join(base, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    `\n${report.steps.filter((s) => s.ok).length}/${report.steps.length} passed; renderer errors: ${report.rendererErrors.length}; console errors: ${report.consoleErrors.length}`,
  );
  for (const e of [...report.rendererErrors, ...report.consoleErrors]) console.log('  ' + e);
  process.exitCode = report.ok ? 0 : 1;
})().catch(async (error) => {
  console.error(error);
  await app?.close().catch(() => undefined);
  process.exitCode = 1;
});
