/**
 * Main-process state: the ONE current project session, its watcher, dialog grants and
 * window close state. Electron glue only; file logic lives in services/.
 */
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type { OpenResult } from '../shared/types/ipc';
import { IPC_EVENTS } from '../shared/types/ipc';
import { isInside, samePath } from './security/paths';
import type { DemoService } from './services/demoService';
import { createProjectWatcher, ImportService, type ProjectWatcher } from './services/fileService';
import { ExportTracker } from './services/exportService';
import type { Logger } from './services/logger';
import type { ProjectService, ProjectSession, ServiceOpenResult } from './services/projectService';
import type { SettingsService } from './services/settingsService';

export interface AppStateDeps {
  settings: SettingsService;
  projects: ProjectService;
  demo: DemoService;
  logger: Logger;
  devOrigin: string | null;
  defaultProjectsDir: string;
  exportTempDir: string;
}

export class AppState {
  readonly settings: SettingsService;
  readonly projects: ProjectService;
  readonly demo: DemoService;
  readonly logger: Logger;
  readonly devOrigin: string | null;
  readonly defaultProjectsDir: string;
  readonly exportTempDir: string;
  readonly imports = new ImportService();
  readonly exports = new ExportTracker();
  readonly fileAllowedWebContents = new Set<number>();

  mainWindow: BrowserWindow | null = null;
  session: ProjectSession | null = null;
  watcher: ProjectWatcher | null = null;
  /** Root of the last project that failed to open (allowed target for recovery). */
  lastFailedOpenPath: string | null = null;
  dirty = false;
  closeConfirmed = false;
  private readonly grantedDirs = new Set<string>();

  constructor(deps: AppStateDeps) {
    this.settings = deps.settings;
    this.projects = deps.projects;
    this.demo = deps.demo;
    this.logger = deps.logger;
    this.devOrigin = deps.devOrigin;
    this.defaultProjectsDir = deps.defaultProjectsDir;
    this.exportTempDir = deps.exportTempDir;
  }

  private key(p: string): string {
    const r = path.resolve(p);
    return process.platform === 'win32' ? r.toLowerCase() : r;
  }

  grantDirectory(p: string): void {
    this.grantedDirs.add(this.key(p));
  }

  isGrantedDirectory(p: string): boolean {
    return this.grantedDirs.has(this.key(p));
  }

  send(channel: string, payload?: unknown): void {
    const win = this.mainWindow;
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  get rootPath(): string | null {
    return this.session && !this.session.closed ? this.session.rootPath : null;
  }

  stopWatcher(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  /** Restart the watcher for the current session (after an operation stopped it). */
  resumeWatcher(): void {
    if (this.session && !this.session.closed) this.startWatcher(this.session);
  }

  private startWatcher(session: ProjectSession): void {
    this.stopWatcher();
    this.watcher = createProjectWatcher(session.rootPath, {
      onChange: (paths) => this.send(IPC_EVENTS.filesChanged, { paths }),
      onManifestChange: () => this.send(IPC_EVENTS.manifestChangedExternally),
      getLastKnownHash: () => session.lastKnownHash
    });
  }

  /** Close the current session (watcher, lock) and dispose a demo copy if appropriate. */
  closeSession(opts: { keepLockFor?: string } = {}): Promise<void> {
    // Serialised so a quit waits for a close already in flight (e.g. from the window 'closed' event).
    const p = this.closeChain.then(() => this.doCloseSession(opts));
    this.closeChain = p.catch(() => undefined);
    return p;
  }

  private closeChain: Promise<void> = Promise.resolve();

  private async doCloseSession(opts: { keepLockFor?: string }): Promise<void> {
    const s = this.session;
    this.stopWatcher();
    if (!s) return;
    this.session = null;
    const sameFolder = !!opts.keepLockFor && samePath(opts.keepLockFor, s.rootPath);
    if (sameFolder) {
      await s.queue.run(async () => undefined);
      s.closed = true; // the new session for the same folder owns the (same-instance) lock
      return;
    }
    await this.projects.closeSession(s);
    if (s.isDemo) {
      const current = this.demo.currentCopy;
      if (current && isInside(current, s.rootPath)) await this.demo.disposeCurrent();
      await this.demo.cleanupOld(); // removes earlier demo copies (never the current one)
    }
  }

  /**
   * Install a successful open as the current session (closing the previous one) or record the
   * failure. Returns the renderer-facing OpenResult.
   */
  async activate(result: ServiceOpenResult, attemptedPath?: string): Promise<OpenResult> {
    if (!result.ok) {
      this.lastFailedOpenPath = result.recovery?.projectPath ?? attemptedPath ?? null;
      return result;
    }
    const next = result.session;
    if (this.session && this.session !== next) {
      await this.closeSession({ keepLockFor: next.rootPath });
    }
    this.session = next;
    this.lastFailedOpenPath = null;
    this.dirty = false;
    this.startWatcher(next);
    if (!next.isDemo) {
      await this.settings
        .addRecent({
          path: next.rootPath,
          title: result.manifest.project.title,
          discipline: result.manifest.project.discipline,
          identifier: result.manifest.project.identifier,
          lastOpened: new Date().toISOString()
        })
        .catch((err: unknown) => this.logger.error('recent', err));
    }
    return {
      ok: true,
      session: { rootPath: next.rootPath, folderName: next.folderName, isDemo: next.isDemo },
      manifest: result.manifest,
      warnings: result.warnings
    };
  }

  async shutdown(): Promise<void> {
    await this.closeSession();
    await this.settings.flush().catch(() => undefined);
  }
}
