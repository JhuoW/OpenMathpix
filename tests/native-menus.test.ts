import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MenuItemConstructorOptions } from 'electron';
import {
  createApplicationMenuTemplate,
  createTextContextMenuTemplate,
  createTrayMenuTemplate,
  type MenuActions,
} from '../src/main/native-menus';

function setup(language: 'en' | 'zh-CN' = 'en') {
  const calls: string[] = [];
  const actions: MenuActions = {
    changeLanguage: (value) => calls.push(value),
    snip: () => calls.push('snip'),
    open: () => calls.push('open'),
    settings: () => calls.push('settings'),
    result: () => calls.push('result'),
    history: () => calls.push('history'),
    pasteImage: () => calls.push('pasteImage'),
    copyResult: () => calls.push('copyResult'),
    about: () => calls.push('about'),
    checkUpdates: () => calls.push('checkUpdates'),
    openGuide: () => calls.push('openGuide'),
    reportIssue: () => calls.push('reportIssue'),
    quit: () => calls.push('quit'),
  };
  return { calls, actions, menu: createApplicationMenuTemplate(language, 'win32', actions) };
}

function flatten(menu: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return menu.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ]);
}

test('Windows menus expose working task actions and omit developer and redundant window entries', () => {
  const { menu, calls } = setup();
  assert.deepEqual(
    menu.map((item) => item.label),
    ['File', 'Edit', 'View', 'Help'],
  );
  const items = flatten(menu);
  for (const id of [
    'new-snip',
    'paste-image',
    'copy-result',
    'settings',
    'result',
    'history',
    'user-guide',
    'report-issue',
    'check-updates',
    'about',
    'exit',
  ]) {
    (items.find((item) => item.id === id)!.click as () => void)();
  }
  assert.deepEqual(calls, [
    'snip',
    'pasteImage',
    'copyResult',
    'settings',
    'result',
    'history',
    'openGuide',
    'reportIssue',
    'checkUpdates',
    'about',
    'quit',
  ]);
  const help = menu.find((item) => item.id === 'help')!.submenu as MenuItemConstructorOptions[];
  assert.deepEqual(
    help.filter((item) => item.type !== 'separator').map((item) => item.label),
    ['User Guide', 'Report an Issue…', 'Check for Updates…', 'About OpenMathpix'],
  );
  assert.equal(help.find((item) => item.id === 'user-guide')?.accelerator, 'F1');
  assert.ok(
    items.every(
      (item) =>
        !['reload', 'forceReload', 'toggleDevTools', 'window', 'close'].includes(item.role ?? ''),
    ),
  );
  const accelerators = items.filter((item) => item.accelerator).map((item) => item.accelerator);
  assert.equal(new Set(accelerators).size, accelerators.length);
  assert.equal(items.find((item) => item.label === 'Copy')?.role, 'copy');
  assert.equal(items.find((item) => item.label === 'Select All')?.role, 'selectAll');
});

test('language changes, Help actions, and tray controls have Chinese labels', () => {
  const { menu, calls, actions } = setup('zh-CN');
  assert.deepEqual(
    menu.map((item) => item.label),
    ['文件', '编辑', '视图', '帮助'],
  );
  const items = flatten(menu);
  const choices = items.filter((item) => item.type === 'radio');
  assert.equal(choices.find((item) => item.checked)?.id, 'language-zh-CN');
  (choices.find((item) => item.id === 'language-en')!.click as () => void)();
  assert.deepEqual(calls, ['en']);
  const tray = createTrayMenuTemplate('zh-CN', actions);
  assert.deepEqual(
    tray.filter((item) => item.type !== 'separator').map((item) => item.label),
    ['显示主窗口', '新建截图', '设置…', '退出'],
  );
  for (const item of tray) if (item.click) (item.click as () => void)();
  assert.deepEqual(calls.slice(1), ['open', 'snip', 'settings', 'quit']);
});

const editFlags = {
  canUndo: false,
  canRedo: false,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canDelete: true,
  canSelectAll: true,
  canEditRichly: false,
};

test('source editor context menu uses native text actions and current selection capabilities', () => {
  const editable = createTextContextMenuTemplate('en', {
    isEditable: true,
    selectionText: 'x^2',
    editFlags,
  });
  assert.equal(editable.find((item) => item.role === 'copy')?.enabled, true);
  assert.equal(editable.find((item) => item.role === 'selectAll')?.enabled, true);
  assert.equal(editable.find((item) => item.role === 'undo')?.enabled, false);
  assert.equal(editable.find((item) => item.role === 'paste')?.enabled, true);
  const noSelection = createTextContextMenuTemplate('en', {
    isEditable: true,
    selectionText: '',
    editFlags: { ...editFlags, canCopy: false, canCut: false },
  });
  assert.equal(noSelection.find((item) => item.role === 'copy')?.enabled, false);
  assert.equal(noSelection.find((item) => item.role === 'selectAll')?.enabled, true);
  const readOnly = createTextContextMenuTemplate('zh-CN', {
    isEditable: false,
    selectionText: 'x',
    editFlags,
  });
  assert.deepEqual(
    readOnly.filter((item) => item.role).map((item) => item.label),
    ['复制', '全选'],
  );
  assert.deepEqual(
    createTextContextMenuTemplate('en', { isEditable: false, selectionText: '', editFlags }),
    [],
  );
});
