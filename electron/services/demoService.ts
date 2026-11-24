/**
 * The bundled educational demo project. The bundled sample folder is NEVER written: the demo
 * is always a fresh copy in `<temp>/FrameLytix-Demo/<uuid>/Pedestrian-Truss-Bridge`.
 * Plain Node only.
 */
import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { serializeManifest, type ProjectManifest } from '../../shared/schemas/project';
import { cloneAsNewProject } from '../../shared/utilities/projectFactory';
import { newId } from '../../shared/utilities/ids';
import { validateFileName } from '../../shared/utilities/paths';
import { BRANDING } from '../../src/config/branding';
import { isInside, samePath } from '../security/paths';
import { writeFileAtomic } from './fsUtils';
import type { ProjectService, ProjectSession, ServiceOpenResult } from './projectService';
import { ensureBackupsDir, manifestPath } from './recoveryService';

export const DEMO_DIR_NAME = 'FrameLytix-Demo';
export const DEMO_FOLDER_NAME = 'Pedestrian-Truss-Bridge';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Copy a project tree, excluding the lock file, backups, symbolic links and (optionally)
 * the manifest. `dest` must not exist.
 */
export async function copyProjectTree(src: string, dest: string, opts: { excludeManifest?: boolean } = {}): Promise<void> {
  const lockRel = path.join(BRANDING.metadataDirName, BRANDING.lockFileName).toLowerCase();
  const backupsRel = path.join(BRANDING.metadataDirName, BRANDING.backupsDirName).toLowerCase();
  const manifestRel = BRANDING.manifestFileName.toLowerCase();
  const filter = async (from: string): Promise<boolean> => {
    const rel = path.relative(src, from).toLowerCase();
    if (rel === lockRel || rel === backupsRel || rel.startsWith(backupsRel + path.sep)) return false;
    if (rel === `${manifestRel}.tmp`) return false;
    if (opts.excludeManifest && rel === manifestRel) return false;
    const s = await lstat(from).catch(() => null);
    return !!s && !s.isSymbolicLink();
  };
  // `dest` may already exist as an empty folder claimed by the caller; copy entry by entry
  // so nothing in it is ever overwritten (errorOnExist + force:false).
  await mkdir(dest, { recursive: true });
  for (const name of await readdir(src)) {
    const from = path.join(src, name);
    if (!(await filter(from))) continue;
    await cp(from, path.join(dest, name), { recursive: true, errorOnExist: true, force: false, filter });
  }
}

export interface DemoServiceOptions {
  /** Folder containing the bundled samples (dev: <repo>/samples; packaged: resources/samples). */
  samplesDir: string;
  /** Parent temp folder; the demo base is `<tempRoot>/FrameLytix-Demo`. */
  tempRoot: string;
  projects: ProjectService;
  appVersion?: string;
}

export class DemoService {
  readonly base: string;
  private currentDir: string | null = null;

  constructor(private readonly opts: DemoServiceOptions) {
    this.base = path.join(opts.tempRoot, DEMO_DIR_NAME);
  }

  get sampleSource(): string {
    return path.join(this.opts.samplesDir, BRANDING.sampleProjectFolder);
  }

  /** The demo working copy currently in use (the <uuid> folder), if any. */
  get currentCopy(): string | null {
    return this.currentDir;
  }

  /** Remove demo copies left over from earlier runs (only inside the demo base). */
  async cleanupOld(): Promise<void> {
    const entries = await readdir(this.base).catch(() => [] as string[]);
    for (const name of entries) {
      const dir = path.join(this.base, name);
      if (!UUID_RE.test(name) || !isInside(this.base, dir) || samePath(this.base, dir)) continue;
      if (this.currentDir && samePath(dir, this.currentDir)) continue;
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async openDemo(): Promise<ServiceOpenResult> {
    const src = this.sampleSource;
    const s = await stat(path.join(src, BRANDING.manifestFileName)).catch(() => null);
    if (!s) return { ok: false, code: 'not-found', message: 'The bundled demo project is missing from this installation.' };
    const dir = path.join(this.base, randomUUID());
    const target = path.join(dir, DEMO_FOLDER_NAME);
    await mkdir(dir, { recursive: true });
    try {
      await copyProjectTree(src, target);
    } catch {
      await this.removeCopy(dir);
      return { ok: false, code: 'error', message: 'The demo project could not be prepared in the temporary folder.' };
    }
    const result = await this.opts.projects.openProject(target, { isDemo: true });
    if (!result.ok) {
      await this.removeCopy(dir);
      return result;
    }
    this.currentDir = dir;
    return result;
  }

  private async removeCopy(dir: string): Promise<void> {
    if (!isInside(this.base, dir) || samePath(this.base, dir)) return;
    await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
  }

  /** Delete the current demo copy (caller has closed its session and watcher). */
  async disposeCurrent(): Promise<void> {
    if (this.currentDir) await this.removeCopy(this.currentDir);
    this.currentDir = null;
  }

  /** Discard the working copy and start again from the bundled sample. */
  async resetDemo(): Promise<ServiceOpenResult> {
    await this.disposeCurrent();
    return this.openDemo();
  }

  /**
   * Copy the session's folder to `destination` (must not exist) as a new non-sample project
   * with a new UUID, then open it as a normal project. The caller closes the old session
   * first; a demo copy is disposed afterwards.
   */
  async saveAsNew(session: ProjectSession, manifest: ProjectManifest, destination: string): Promise<ServiceOpenResult> {
    const dest = path.resolve(destination);
    const nameError = validateFileName(path.basename(dest));
    if (nameError) return { ok: false, code: 'error', message: nameError };
    if (await lstat(dest).catch(() => null)) {
      return { ok: false, code: 'error', message: 'A file or folder with this name already exists. Choose a different name.' };
    }
    if (isInside(session.rootPath, dest)) {
      return { ok: false, code: 'error', message: 'Choose a location outside the current project folder.' };
    }
    const parent = await stat(path.dirname(dest)).catch(() => null);
    if (!parent || !parent.isDirectory()) return { ok: false, code: 'error', message: 'The destination folder does not exist.' };

    try {
      // Claim the destination atomically (non-recursive mkdir fails if it appeared meanwhile).
      await mkdir(dest);
    } catch {
      return { ok: false, code: 'error', message: 'The destination folder could not be created.' };
    }
    try {
      await copyProjectTree(session.rootPath, dest, { excludeManifest: true });
      await ensureBackupsDir(dest);
      const next = cloneAsNewProject(manifest, {
        now: new Date().toISOString(),
        newId,
        appVersion: this.opts.appVersion ?? BRANDING.version
      });
      await writeFileAtomic(manifestPath(dest), serializeManifest(next));
    } catch {
      await rm(dest, { recursive: true, force: true }).catch(() => undefined);
      return { ok: false, code: 'error', message: 'The project could not be copied to the new location.' };
    }
    const opened = await this.opts.projects.openProject(dest);
    if (opened.ok && session.isDemo) {
      await this.opts.projects.closeSession(session);
      await this.disposeCurrent();
    }
    return opened;
  }
}
