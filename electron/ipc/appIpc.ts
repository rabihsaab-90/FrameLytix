import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS, type AppInfo } from '../../shared/types/ipc';
import { BRANDING } from '../../src/config/branding';
import type { AppState } from '../appState';
import { handle } from './handle';

const NOTICES_FILE = 'THIRD_PARTY_NOTICES.md';
const MAX_NOTICES_BYTES = 4 * 1024 * 1024;

export function noticesPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, NOTICES_FILE) : path.join(app.getAppPath(), NOTICES_FILE);
}

export function registerAppIpc(state: AppState): void {
  handle(state, IPC_CHANNELS.appGetInfo, z.tuple([]), (): AppInfo => ({
    version: BRANDING.version,
    platform: process.platform,
    isPackaged: app.isPackaged,
    defaultProjectsDir: state.defaultProjectsDir
  }));

  handle(state, IPC_CHANNELS.appSetDirty, z.tuple([z.boolean()]), (dirty) => {
    state.dirty = dirty;
  });

  handle(state, IPC_CHANNELS.appCloseNow, z.tuple([]), () => {
    state.closeConfirmed = true;
    const win = state.mainWindow;
    if (win && !win.isDestroyed()) setImmediate(() => win.close());
  });

  handle(state, IPC_CHANNELS.appGetNotices, z.tuple([]), async () => {
    const file = noticesPath();
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile() || s.size > MAX_NOTICES_BYTES) {
      return 'Third-party notices are not available in this build. See the project repository for licence information.';
    }
    return readFile(file, 'utf8');
  });
}
