import { Menu, type BrowserWindow } from 'electron';
import type { Language } from '../shared/types';
import { createTextContextMenuTemplate } from './native-menus';

export function attachTextContextMenu(win: BrowserWindow, getLanguage: () => Language): void {
  win.webContents.on('context-menu', (_event, params) => {
    const template = createTextContextMenuTemplate(getLanguage(), params);
    if (template.length && !win.isDestroyed()) {
      Menu.buildFromTemplate(template).popup({ window: win });
    }
  });
}
