import { app, BrowserWindow, nativeImage, nativeTheme, screen } from 'electron';
import type { Language } from '../shared/types';
import { centredOver, createAboutHtml } from './about-content';

const WIDTH = 460;
let aboutWindow: BrowserWindow | null = null;

/** A small modal dialog; `iconPath` should be the large PNG so the icon is sharp on HiDPI. */
export function showAboutWindow(parent: BrowserWindow, language: Language, iconPath: string): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }
  if (parent.isDestroyed()) return;
  const win = new BrowserWindow({
    parent,
    modal: true,
    width: WIDTH,
    height: 430,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    show: false,
    // Matches the page, so a dark-mode dialog never flashes white while it loads.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111827' : '#ffffff',
    title: language === 'zh-CN' ? '关于 OpenMathpix' : 'About OpenMathpix',
    icon: iconPath,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  aboutWindow = win;
  win.setMenu(null);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      win.close();
    }
  });
  win.once('closed', () => {
    aboutWindow = null;
  });
  // Size the dialog to its content (text length differs by language) and centre it over the
  // main window, as Windows does for dialogs, before it becomes visible.
  win.webContents.once('did-finish-load', () => {
    void win.webContents
      .executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)')
      .then((height: unknown) => {
        if (win.isDestroyed()) return;
        if (typeof height === 'number' && height > 200 && height < 800) {
          win.setContentSize(WIDTH, height);
        }
        if (!parent.isDestroyed()) {
          const area = screen.getDisplayMatching(parent.getBounds()).workArea;
          win.setBounds(centredOver(parent.getBounds(), win.getBounds(), area));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!win.isDestroyed()) win.show();
      });
  });
  // Shown at 76 CSS pixels; 256 pixels stays sharp up to 300 % display scaling.
  const icon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 256, height: 256, quality: 'best' })
    .toDataURL();
  void win
    .loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(createAboutHtml(language, app.getVersion(), icon))}`,
    )
    .catch(() => {
      if (!win.isDestroyed()) win.close();
    });
}
