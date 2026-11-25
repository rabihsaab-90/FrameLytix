/**
 * FrameLytix Electron main process entry.
 * Security model: see SECURITY.md and shared/types/ipc.ts. All file logic is in services/.
 */
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { BRANDING } from '../src/config/branding';
import { AppState } from './appState';
import { registerIpc } from './ipc';
import { buildMenu } from './menu';
import { applyHardening } from './security/hardening';
import { APP_ORIGIN, registerAppProtocol, registerAssetProtocol, registerPrivilegedSchemes } from './security/protocols';
import { DemoService } from './services/demoService';
import { Logger } from './services/logger';
import { ProjectService } from './services/projectService';
import { SettingsService } from './services/settingsService';
import { createMainWindow } from './windows/mainWindow';

// Must happen before the app is ready.
registerPrivilegedSchemes();
// Automated tests run the unpackaged build with an isolated settings folder. Ignored in packaged builds.
const testUserData = !app.isPackaged ? process.env['FRAMELYTIX_TEST_USER_DATA'] : undefined;
if (testUserData) app.setPath('userData', testUserData);
app.setName(BRANDING.appName);
if (process.platform === 'win32') app.setAppUserModelId(BRANDING.appId);

const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const devOrigin = devUrl ? new URL(devUrl).origin : null;

let state: AppState | null = null;
let cleanedUp = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = state?.mainWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  void app.whenReady().then(async () => {
    const userData = app.getPath('userData');
    const logger = new Logger(path.join(userData, 'logs'));
    const settings = new SettingsService(userData);
    await settings.load().catch((err: unknown) => logger.error('settings-load', err));
    const projects = new ProjectService({
      appVersion: BRANDING.version,
      getRetention: async () => (await settings.get()).backupRetention
    });
    const samplesDir = app.isPackaged ? path.join(process.resourcesPath, 'samples') : path.join(app.getAppPath(), 'samples');
    const demo = new DemoService({ samplesDir, tempRoot: app.getPath('temp'), projects, appVersion: BRANDING.version });

    state = new AppState({
      settings,
      projects,
      demo,
      logger,
      devOrigin,
      defaultProjectsDir: path.join(app.getPath('documents'), `${BRANDING.appName} Projects`),
      exportTempDir: path.join(app.getPath('temp'), `${BRANDING.appName}-Export`)
    });
    const s = state;

    applyHardening({
      devOrigin,
      fileAllowedWebContents: s.fileAllowedWebContents,
      log: (m) => console.warn(`[security] ${m}`)
    });
    registerAppProtocol(path.join(__dirname, '../renderer'));
    registerAssetProtocol(
      () => s.rootPath,
      () => (devOrigin ? [APP_ORIGIN, devOrigin] : [APP_ORIGIN])
    );
    registerIpc(s);
    buildMenu(s);
    await demo.cleanupOld().catch((err: unknown) => logger.error('demo-cleanup', err));
    createMainWindow(s);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(s);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Release the project lock and stop the watcher before exiting.
  app.on('will-quit', (event) => {
    if (cleanedUp || !state) return;
    event.preventDefault();
    const s = state;
    void s
      .shutdown()
      .catch((err: unknown) => s.logger.error('shutdown', err))
      .finally(() => {
        cleanedUp = true;
        // Quit was already requested and windows are gone; exit directly (a second app.quit()
        // from inside a prevented will-quit does not reliably terminate on all platforms).
        app.exit(0);
      });
  });
}
