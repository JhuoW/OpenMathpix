import type { MenuItemConstructorOptions, MessageBoxOptions } from 'electron';
import type { AppSettings } from '../shared/types';

type Language = AppSettings['language'];

const nativeText = {
  en: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    language: 'Language',
    about: 'About OpenMathpix',
    services: 'Services',
    hide: 'Hide OpenMathpix',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    close: 'Close Window',
    quit: 'Quit',
    snip: 'New Snip',
    open: 'Open Window',
    settings: 'Settings',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    reload: 'Reload',
    forceReload: 'Force Reload',
    devTools: 'Toggle Developer Tools',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullScreen: 'Toggle Full Screen',
    minimize: 'Minimize',
    front: 'Bring All to Front',
    closeTitle: 'Close OpenMathpix',
    closeMessage: 'Minimize to the taskbar or quit OpenMathpix?',
    closeDetail:
      'Minimizing keeps OpenMathpix running so you can continue using the snip shortcut.',
    minimizeTaskbar: 'Minimize to taskbar',
    cancel: 'Cancel',
    languageFailed: 'Could not change the language.',
    languageFailedDetail: 'The previous language remains active. Please try again.',
  },
  'zh-CN': {
    file: '文件',
    edit: '编辑',
    view: '视图',
    window: '窗口',
    language: '语言',
    about: '关于 OpenMathpix',
    services: '服务',
    hide: '隐藏 OpenMathpix',
    hideOthers: '隐藏其他应用',
    unhide: '显示全部',
    close: '关闭窗口',
    quit: '退出软件',
    snip: '新建截图',
    open: '打开窗口',
    settings: '设置',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    reload: '重新加载',
    forceReload: '强制重新加载',
    devTools: '切换开发者工具',
    resetZoom: '实际大小',
    zoomIn: '放大',
    zoomOut: '缩小',
    fullScreen: '切换全屏',
    minimize: '最小化',
    front: '全部置于前面',
    closeTitle: '关闭 OpenMathpix',
    closeMessage: '缩小到任务栏，还是直接退出软件？',
    closeDetail: '缩小到任务栏后，OpenMathpix 会继续运行，仍可使用截图快捷键。',
    minimizeTaskbar: '缩小到任务栏',
    cancel: '取消',
    languageFailed: '无法切换语言。',
    languageFailedDetail: '已保留之前的语言设置，请重试。',
  },
};

export function getNativeText(language: Language) {
  return nativeText[language];
}

interface MenuActions {
  changeLanguage(language: Language): void;
  snip(): void;
  open(): void;
  settings(): void;
  close(): void;
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
        { label: text.about, role: 'about' },
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
        { label: text.snip, click: actions.snip },
        { label: text.settings, click: actions.settings },
        { type: 'separator' },
        { label: text.close, accelerator: 'CommandOrControl+W', click: actions.close },
        ...(!mac ? [{ label: text.quit, click: actions.quit }] : []),
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
        { label: text.selectAll, role: 'selectAll' },
      ],
    },
    {
      id: 'view',
      label: text.view,
      submenu: [
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
        { type: 'separator' },
        { label: text.reload, role: 'reload' },
        { label: text.forceReload, role: 'forceReload' },
        { label: text.devTools, role: 'toggleDevTools' },
        { type: 'separator' },
        { label: text.resetZoom, role: 'resetZoom' },
        { label: text.zoomIn, role: 'zoomIn' },
        { label: text.zoomOut, role: 'zoomOut' },
        { type: 'separator' },
        { label: text.fullScreen, role: 'togglefullscreen' },
      ],
    },
    {
      id: 'window',
      label: text.window,
      submenu: [
        { label: text.minimize, role: 'minimize' },
        { label: text.open, click: actions.open },
        ...(mac ? [{ label: text.front, role: 'front' as const }] : []),
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
    { label: text.snip, click: actions.snip },
    { label: text.open, click: actions.open },
    { label: text.settings, click: actions.settings },
    { type: 'separator' },
    { label: text.quit, click: actions.quit },
  ];
}

export function createCloseDialogOptions(language: Language): MessageBoxOptions {
  const text = getNativeText(language);
  return {
    type: 'question',
    title: text.closeTitle,
    message: text.closeMessage,
    detail: text.closeDetail,
    buttons: [text.minimizeTaskbar, text.quit, text.cancel],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
}
