import type { MenuItemConstructorOptions } from 'electron';
import type { Language } from '../shared/types';

const nativeText = {
  en: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    help: 'Help',
    language: 'Language',
    about: 'About OpenMathpix',
    checkUpdates: 'Check for Updates…',
    guide: 'User Guide',
    reportIssue: 'Report an Issue…',
    services: 'Services',
    hide: 'Hide OpenMathpix',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: 'Exit',
    snip: 'New Snip',
    open: 'Show Main Window',
    settings: 'Settings…',
    result: 'Result',
    history: 'History',
    pasteImage: 'Recognize Clipboard Image',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    copyResult: 'Copy Result',
    paste: 'Paste',
    selectAll: 'Select All',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    languageFailed: 'Could not change the language.',
    languageFailedDetail: 'The previous language remains active. Please try again.',
  },
  'zh-CN': {
    file: '文件',
    edit: '编辑',
    view: '视图',
    help: '帮助',
    language: '语言',
    about: '关于 OpenMathpix',
    checkUpdates: '检查更新…',
    guide: '使用指南',
    reportIssue: '报告问题…',
    services: '服务',
    hide: '隐藏 OpenMathpix',
    hideOthers: '隐藏其他应用',
    unhide: '显示全部',
    quit: '退出',
    snip: '新建截图',
    open: '显示主窗口',
    settings: '设置…',
    result: '识别结果',
    history: '历史记录',
    pasteImage: '识别剪贴板图片',
    copyResult: '复制识别结果',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    resetZoom: '实际大小',
    zoomIn: '放大',
    zoomOut: '缩小',
    languageFailed: '无法切换语言。',
    languageFailedDetail: '已保留之前的语言设置，请重试。',
  },
};

export function getNativeText(language: Language) {
  return nativeText[language];
}

export interface MenuActions {
  changeLanguage(language: Language): void;
  snip(): void;
  open(): void;
  settings(): void;
  result(): void;
  history(): void;
  pasteImage(): void;
  copyResult(): void;
  about(): void;
  checkUpdates(): void;
  openGuide(): void;
  reportIssue(): void;
  quit(): void;
}

export function createApplicationMenuTemplate(
  language: Language,
  platform: NodeJS.Platform,
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const text = getNativeText(language);
  const mac = platform === 'darwin';
  const menu: MenuItemConstructorOptions[] = [];
  if (mac) {
    menu.push({
      label: 'OpenMathpix',
      submenu: [
        { label: text.about, click: actions.about },
        { type: 'separator' },
        { label: text.settings, accelerator: 'Command+,', click: actions.settings },
        { type: 'separator' },
        { label: text.services, role: 'services' },
        { type: 'separator' },
        { label: text.hide, role: 'hide' },
        { label: text.hideOthers, role: 'hideOthers' },
        { label: text.unhide, role: 'unhide' },
        { type: 'separator' },
        { label: text.quit, accelerator: 'Command+Q', click: actions.quit },
      ],
    });
  }
  menu.push(
    {
      id: 'file',
      label: text.file,
      submenu: [
        {
          id: 'new-snip',
          label: text.snip,
          accelerator: 'CommandOrControl+N',
          click: actions.snip,
        },
        {
          id: 'paste-image',
          label: text.pasteImage,
          accelerator: 'CommandOrControl+Shift+V',
          click: actions.pasteImage,
        },
        ...(!mac
          ? [
              { type: 'separator' as const },
              {
                id: 'settings',
                label: text.settings,
                accelerator: 'Control+,',
                click: actions.settings,
              },
              { type: 'separator' as const },
              { id: 'exit', label: text.quit, click: actions.quit },
            ]
          : []),
      ],
    },
    {
      id: 'edit',
      label: text.edit,
      submenu: [
        { label: text.undo, role: 'undo' },
        { label: text.redo, role: 'redo' },
        { type: 'separator' },
        { label: text.cut, role: 'cut' },
        { label: text.copy, role: 'copy' },
        { label: text.paste, role: 'paste' },
        { type: 'separator' },
        { label: text.selectAll, role: 'selectAll' },
        { type: 'separator' },
        {
          // The whole current result in the chosen format and copy style, from any page.
          id: 'copy-result',
          label: text.copyResult,
          accelerator: 'CommandOrControl+Shift+C',
          click: actions.copyResult,
        },
      ],
    },
    {
      id: 'view',
      label: text.view,
      submenu: [
        {
          id: 'result',
          label: text.result,
          accelerator: 'CommandOrControl+1',
          click: actions.result,
        },
        {
          id: 'history',
          label: text.history,
          accelerator: 'CommandOrControl+2',
          click: actions.history,
        },
        { type: 'separator' },
        { label: text.resetZoom, role: 'resetZoom' },
        { label: text.zoomIn, role: 'zoomIn' },
        { label: text.zoomOut, role: 'zoomOut' },
        { type: 'separator' },
        {
          id: 'language',
          label: text.language,
          submenu: [
            {
              id: 'language-en',
              label: 'English',
              type: 'radio',
              checked: language === 'en',
              click: () => actions.changeLanguage('en'),
            },
            {
              id: 'language-zh-CN',
              label: '简体中文',
              type: 'radio',
              checked: language === 'zh-CN',
              click: () => actions.changeLanguage('zh-CN'),
            },
          ],
        },
      ],
    },
    {
      id: 'help',
      label: text.help,
      submenu: [
        // F1 is the Windows convention for help.
        { id: 'user-guide', label: text.guide, accelerator: 'F1', click: actions.openGuide },
        { id: 'report-issue', label: text.reportIssue, click: actions.reportIssue },
        { type: 'separator' },
        { id: 'check-updates', label: text.checkUpdates, click: actions.checkUpdates },
        ...(!mac
          ? [
              { type: 'separator' as const },
              { id: 'about', label: text.about, click: actions.about },
            ]
          : []),
      ],
    },
  );
  return menu;
}

export function createTrayMenuTemplate(
  language: Language,
  actions: Pick<MenuActions, 'snip' | 'open' | 'settings' | 'quit'>,
): MenuItemConstructorOptions[] {
  const text = getNativeText(language);
  return [
    { label: text.open, click: actions.open },
    { label: text.snip, click: actions.snip },
    { label: text.settings, click: actions.settings },
    { type: 'separator' },
    { label: text.quit, click: actions.quit },
  ];
}

/** Use Chromium's focused text editor and selection, without replacing clipboard shortcuts. */
export function createTextContextMenuTemplate(
  language: Language,
  params: Pick<Electron.ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags'>,
): MenuItemConstructorOptions[] {
  if (!params.isEditable && !params.selectionText) return [];
  const text = getNativeText(language);
  const flags = params.editFlags;
  return [
    ...(params.isEditable
      ? [
          { label: text.undo, role: 'undo' as const, enabled: flags.canUndo },
          { label: text.redo, role: 'redo' as const, enabled: flags.canRedo },
          { type: 'separator' as const },
          { label: text.cut, role: 'cut' as const, enabled: flags.canCut },
        ]
      : []),
    { label: text.copy, role: 'copy', enabled: flags.canCopy },
    ...(params.isEditable
      ? [{ label: text.paste, role: 'paste' as const, enabled: flags.canPaste }]
      : []),
    { type: 'separator' },
    { label: text.selectAll, role: 'selectAll', enabled: flags.canSelectAll },
  ];
}
