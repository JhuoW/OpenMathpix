import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createWindowCloseHandler, type CloseChoice } from '../src/main/window-close';
import {
  createApplicationMenuTemplate,
  createCloseDialogOptions,
  createTrayMenuTemplate,
} from '../src/main/native-menus';
import type { MenuItemConstructorOptions } from 'electron';

function deferred() {
  let resolve!: (choice: CloseChoice) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CloseChoice>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup() {
  const response = deferred();
  const calls: string[] = [];
  const state = { quitting: false, destroyed: false };
  const handler = createWindowCloseHandler({
    isQuitting: () => state.quitting,
    isDestroyed: () => state.destroyed,
    ask: () => {
      calls.push('ask');
      return response.promise;
    },
    minimize: () => calls.push('minimize'),
    quit: () => calls.push('quit'),
    onError: () => calls.push('error'),
  });
  return {
    response,
    calls,
    state,
    close: () => handler({ preventDefault: () => calls.push('prevent') }),
  };
}

test('closing the window offers a choice, and minimize keeps the application running', async () => {
  const window = setup();
  window.close();
  assert.deepEqual(window.calls, ['prevent', 'ask']);
  window.response.resolve('minimize');
  await setImmediate();
  assert.deepEqual(window.calls, ['prevent', 'ask', 'minimize']);
});

test('close cancellation has no side effect; explicit Quit confirms exit', async () => {
  for (const choice of ['cancel', 'quit'] as const) {
    const window = setup();
    window.close();
    window.response.resolve(choice);
    await setImmediate();
    assert.deepEqual(window.calls, ['prevent', 'ask', ...(choice === 'quit' ? ['quit'] : [])]);
  }
});

test('repeated close requests share the open prompt and permit a later attempt', async () => {
  const window = setup();
  window.close();
  window.close();
  assert.deepEqual(window.calls, ['prevent', 'ask', 'prevent']);
  window.response.resolve('cancel');
  await setImmediate();
  window.close();
  assert.equal(window.calls.filter((call) => call === 'ask').length, 2);
});

test('an explicit application quit bypasses prompting and a late dialog response is ignored', async () => {
  const quitting = setup();
  quitting.state.quitting = true;
  quitting.close();
  assert.deepEqual(quitting.calls, []);

  for (const state of ['quitting', 'destroyed'] as const) {
    const window = setup();
    window.close();
    window.state[state] = true;
    window.response.resolve('minimize');
    await setImmediate();
    assert.deepEqual(window.calls, ['prevent', 'ask']);
  }
});

test('dialog failure does not quit or minimize the window and does not lock future prompts', async () => {
  const window = setup();
  window.close();
  window.response.reject(new Error('Dialog unavailable'));
  await setImmediate();
  assert.deepEqual(window.calls, ['prevent', 'ask', 'error']);
  window.close();
  assert.equal(window.calls.filter((call) => call === 'ask').length, 2);
  await setImmediate();
});

const noAction = () => {};
function menu(
  language: 'en' | 'zh-CN',
  changeLanguage: (language: 'en' | 'zh-CN') => void = () => {},
) {
  return createApplicationMenuTemplate(language, 'win32', {
    changeLanguage,
    snip: noAction,
    open: noAction,
    settings: noAction,
    close: noAction,
    quit: noAction,
  });
}

function languageItems(template: MenuItemConstructorOptions[]) {
  const view = template.find((entry) => entry.id === 'view')!;
  const language = (view.submenu as MenuItemConstructorOptions[]).find(
    (entry) => entry.id === 'language',
  )!;
  return { view, language, choices: language.submenu as MenuItemConstructorOptions[] };
}

test('View contains persistent language radio choices and keeps standard view controls', () => {
  for (const selected of ['en', 'zh-CN'] as const) {
    const chosen: string[] = [];
    const { view, language, choices } = languageItems(
      menu(selected, (value) => chosen.push(value)),
    );
    assert.equal(view.label, selected === 'en' ? 'View' : '视图');
    assert.equal(language.label, selected === 'en' ? 'Language' : '语言');
    assert.deepEqual(
      choices.map((choice) => choice.label),
      ['English', '简体中文'],
    );
    assert.equal(choices.filter((choice) => choice.checked).length, 1);
    assert.equal(choices.find((choice) => choice.checked)?.id, `language-${selected}`);
    (choices.find((choice) => choice.id === 'language-zh-CN')!.click as () => void)();
    assert.deepEqual(chosen, ['zh-CN']);
    const roles = (view.submenu as MenuItemConstructorOptions[]).map((item) => item.role);
    assert.ok(roles.includes('reload'));
    assert.ok(roles.includes('toggleDevTools'));
    assert.ok(roles.includes('togglefullscreen'));
  }
});

test('close dialogs and tray menus follow language and Escape always means cancel', () => {
  for (const language of ['en', 'zh-CN'] as const) {
    const dialog = createCloseDialogOptions(language);
    assert.equal(dialog.cancelId, 2);
    assert.equal(dialog.defaultId, 0);
    assert.equal(dialog.buttons?.[0], language === 'en' ? 'Minimize to taskbar' : '缩小到任务栏');
    assert.equal(dialog.buttons?.[2], language === 'en' ? 'Cancel' : '取消');
    const tray = createTrayMenuTemplate(language, {
      snip: noAction,
      open: noAction,
      settings: noAction,
      quit: noAction,
    });
    assert.equal(tray[2].label, language === 'en' ? 'Settings' : '设置');
    assert.equal(tray.at(-1)?.label, language === 'en' ? 'Quit' : '退出软件');
  }
});
