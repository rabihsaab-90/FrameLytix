import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { IPC_EVENTS } from '../../shared/types/ipc';
import { BRANDING, COLOURS } from '../../src/config/branding';
import type { AppState } from '../appState';
import { APP_ENTRY_URL } from '../security/protocols';

function iconPath(): string | undefined {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'icons') : path.join(app.getAppPath(), 'build', 'icons');
  const file = path.join(base, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  return existsSync(file) ? file : undefined;
}

export function createMainWindow(state: AppState): BrowserWindow {
  const icon = iconPath();
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: COLOURS.obsidian,
    show: false,
    title: BRANDING.appName,
    ...(icon ? { icon } : {}),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged
    }
  });
  state.mainWindow = win;
  state.closeConfirmed = false;

  win.once('ready-to-show', () => win.show());

  win.on('close', (event) => {
    if (state.dirty && !state.closeConfirmed) {
      event.preventDefault();
      win.webContents.send(IPC_EVENTS.closeRequested);
    }
  });

  win.on('closed', () => {
    if (state.mainWindow === win) state.mainWindow = null;
    void state.closeSession().catch((err: unknown) => state.logger.error('close-session', err));
  });

  // A renderer crash must not leave the project locked forever (lock is released on close/quit).
  win.webContents.on('render-process-gone', (_e, details) => {
    state.logger.write('error', `Renderer process gone: ${details.reason}`);
  });

  if (state.devOrigin && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadURL(APP_ENTRY_URL);
  }
  return win;
}
