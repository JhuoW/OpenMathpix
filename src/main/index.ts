import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
} from 'electron';
import path from 'path';
import { getSettings } from './store';
import { initDb } from './db';
import { registerIpcHandlers } from './ipc';
import { startSnip } from './capture';

// Ensure only one instance runs at a time
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

function getIconPath(): string {
  // In production, icon is in build/ relative to the app root (resources/app.asar)
  // electron-builder copies buildResources into the package
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }
  return path.join(__dirname, '../../build/icon.png');
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 480,
    minHeight: 400,
    show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => win.show());

  // Minimize to tray instead of quitting
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

function createTray(): void {
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('OpenMathpix');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Snip',
      click: () => {
        if (mainWindow) startSnip(mainWindow);
      },
    },
    {
      label: 'Open Window',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('navigate', 'settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function registerGlobalShortcut(): void {
  const settings = getSettings();
  globalShortcut.unregisterAll();
  globalShortcut.register(settings.snipHotkey, () => {
    if (mainWindow) startSnip(mainWindow);
  });
}

function applyTheme(): void {
  const settings = getSettings();
  if (settings.theme === 'system') {
    nativeTheme.themeSource = 'system';
  } else {
    nativeTheme.themeSource = settings.theme;
  }
}

app.whenReady().then(() => {
  initDb();
  mainWindow = createMainWindow();
  registerIpcHandlers(mainWindow);
  createTray();
  registerGlobalShortcut();
  applyTheme();
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
});

app.on('activate', () => {
  mainWindow?.show();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
