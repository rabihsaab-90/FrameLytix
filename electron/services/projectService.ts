/**
 * Project lifecycle: create, open, lock, save (atomic, serialised, conflict-aware), reload,
 * recover. Plain Node only — the Electron glue owns dialogs and the single current session.
 */
import { hostname as osHostname, uptime } from 'node:os';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  parseManifest,
  ProjectManifestSchema,
  serializeManifest,
  type ProjectManifest
} from '../../shared/schemas/project';
import type { CreateProjectInput, OpenResult, SaveOptions, SaveResult, TargetCheck } from '../../shared/types/ipc';
import { createManifestFromTemplate, type FactoryContext } from '../../shared/utilities/projectFactory';
import { normaliseRelativePath, validateFileName } from '../../shared/utilities/paths';
import { BRANDING } from '../../src/config/branding';
import type { ProjectTemplate } from '../../src/templates/types';
import { isInside, resolveInsideRoot } from '../security/paths';
import {
  errnoCode,
  readIfExists,
  SerialQueue,
  sha256,
  writeFileAtomic,
  writeFileExclusive
} from './fsUtils';
import {
  ensureBackupsDir,
  listBackups,
  manifestPath,
  pruneBackups,
  recoverFromBackup,
  writeBackup
} from './recoveryService';

export const LEGACY_MANIFEST = 'structura-project.json';
export const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;
export const STALE_FOREIGN_LOCK_MS = 12 * 60 * 60 * 1000;
const MAX_MANIFEST_BYTES = 200 * 1024 * 1024;
const MISSING_HASH = 'missing';

export const GITIGNORE_LINES = [
  '.framelytix/backups/',
  '.framelytix/lock.json',
  '*.tmp',
  '~$*',
  '.DS_Store',
  'Thumbs.db',
  '*.bak',
  '*.dwl',
  '*.dwl2',
  '*.sv$'
];
const GITIGNORE_HEADER =
  '# FrameLytix: local metadata, temporary files and CAD autosave/lock files.\n' +
  '# Project data (framelytix-project.json) and CAD/drawing files are intentionally tracked.\n';

const LockSchema = z.object({
  pid: z.number().int(),
  hostname: z.string(),
  appVersion: z.string(),
  acquiredAt: z.string(),
  instanceId: z.string()
});
export type LockFile = z.infer<typeof LockSchema>;

export interface ProjectSession {
  /** Canonical absolute project folder. */
  rootPath: string;
  folderName: string;
  isDemo: boolean;
  projectId: string;
  lock: LockFile | null;
  /** sha256 of the manifest bytes FrameLytix last read or wrote. */
  lastKnownHash: string;
  /** ms epoch of the last rolling backup (0 = none this session). */
  lastBackupAt: number;
  queue: SerialQueue;
  closed: boolean;
}

export type OpenFailure = Extract<OpenResult, { ok: false }>;
export type ServiceOpenResult =
  | { ok: true; session: ProjectSession; manifest: ProjectManifest; warnings: string[] }
  | OpenFailure;

export interface ProjectServiceOptions {
  appVersion?: string;
  instanceId?: string;
  hostname?: string;
  /** Backup retention (manifest-* files kept). */
  getRetention?: () => number | Promise<number>;
  now?: () => Date;
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return errnoCode(err) === 'EPERM';
  }
}

export class ProjectService {
  readonly appVersion: string;
  readonly instanceId: string;
  readonly hostname: string;
  private readonly getRetention: () => number | Promise<number>;
  private readonly now: () => Date;

  constructor(opts: ProjectServiceOptions = {}) {
    this.appVersion = opts.appVersion ?? BRANDING.version;
    this.instanceId = opts.instanceId ?? randomUUID();
    this.hostname = opts.hostname ?? osHostname();
    this.getRetention = opts.getRetention ?? (() => 10);
    this.now = opts.now ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async checkTarget(parentDirectory: string, folderName: string): Promise<TargetCheck> {
    const nameError = validateFileName(folderName);
    const targetPath = path.join(path.resolve(parentDirectory || '.'), folderName ?? '');
    if (nameError) return { ok: false, targetPath, message: nameError };
    if (!path.isAbsolute(parentDirectory)) return { ok: false, targetPath, message: 'Choose a parent folder.' };
    const parent = await stat(parentDirectory).catch(() => null);
    if (!parent || !parent.isDirectory()) return { ok: false, targetPath, message: 'The parent folder does not exist.' };
    const existing = await lstat(targetPath).catch(() => null);
    if (existing) {
      return { ok: false, targetPath, message: 'A file or folder with this name already exists. Choose a different folder name.' };
    }
    return { ok: true, targetPath, message: 'The project folder will be created here.' };
  }

  async createProject(input: CreateProjectInput, template: ProjectTemplate, ctx: FactoryContext): Promise<ServiceOpenResult> {
    const check = await this.checkTarget(input.parentDirectory, input.folderName);
    if (!check.ok) return { ok: false, code: 'error', message: check.message };
    const target = check.targetPath;
    const parent = path.resolve(input.parentDirectory);

    // Non-recursive: fails with EEXIST if something appeared meanwhile — never overwrite.
    try {
      await mkdir(target);
    } catch (err) {
      const message =
        errnoCode(err) === 'EEXIST'
          ? 'A file or folder with this name already exists. Choose a different folder name.'
          : 'The project folder could not be created. Check that you have permission to write to the parent folder.';
      return { ok: false, code: 'error', message };
    }

    try {
      for (const folder of template.folders) {
        const rel = normaliseRelativePath(folder);
        if (!rel) continue;
        await mkdir(await resolveInsideRoot(target, rel), { recursive: true });
      }
      await ensureBackupsDir(target);
      const manifest = createManifestFromTemplate(template, input, ctx);
      await writeFileExclusive(manifestPath(target), serializeManifest(manifest));
      if (input.writeGitignore) await this.writeGitignore(target);
    } catch (err) {
      // Roll back: the folder was created empty by this call, so everything in it is ours.
      if (isInside(parent, target) && path.resolve(target) !== parent) {
        await rm(target, { recursive: true, force: true }).catch(() => undefined);
      }
      return {
        ok: false,
        code: 'error',
        message: `The project could not be created${errnoCode(err) ? ` (${errnoCode(err)})` : ''}. Nothing was left behind.`
      };
    }
    return this.openProject(target);
  }

  /** Write or extend the project .gitignore. Existing lines are never removed. No git repo is created. */
  async writeGitignore(root: string): Promise<{ ok: boolean; message?: string }> {
    const file = path.join(root, '.gitignore');
    const existing = await readIfExists(file);
    if (existing === null) {
      await writeFileExclusive(file, GITIGNORE_HEADER + GITIGNORE_LINES.join('\n') + '\n');
      return { ok: true, message: 'Created .gitignore.' };
    }
    const text = existing.toString('utf8');
    const present = new Set(text.split(/\r?\n/).map((l) => l.trim()));
    const missing = GITIGNORE_LINES.filter((l) => !present.has(l));
    if (missing.length === 0) return { ok: true, message: '.gitignore already contains the FrameLytix entries.' };
    const sep = text.endsWith('\n') || text === '' ? '' : '\n';
    await writeFileAtomic(file, text + sep + '\n' + GITIGNORE_HEADER + missing.join('\n') + '\n', { uniqueTemp: true });
    return { ok: true, message: 'Added FrameLytix entries to the existing .gitignore.' };
  }

  // -------------------------------------------------------------------------
  // Open
  // -------------------------------------------------------------------------

  private async recoveryInfo(root: string): Promise<OpenFailure['recovery']> {
    const backups = await listBackups(root).catch(() => []);
    return backups.length > 0 ? { projectPath: root, backups } : undefined;
  }

  /** Locate the project folder from a folder or manifest-file selection. */
  async locate(selection: string): Promise<{ ok: true; root: string } | OpenFailure> {
    const s = await stat(selection).catch(() => null);
    if (!s) return { ok: false, code: 'not-found', message: 'The project folder could not be found. It may have been moved, renamed or deleted.' };
    let dir = selection;
    if (s.isFile()) {
      const base = path.basename(selection).toLowerCase();
      if (base === BRANDING.manifestFileName.toLowerCase() || base === LEGACY_MANIFEST) dir = path.dirname(selection);
      else return { ok: false, code: 'not-a-project', message: `Select a project folder or its ${BRANDING.manifestFileName} file.` };
    }
    let root: string;
    try {
      root = await realpath(dir);
    } catch {
      return { ok: false, code: 'not-found', message: 'The project folder could not be found.' };
    }
    return { ok: true, root };
  }

  private async readManifestAt(root: string): Promise<
    { ok: true; manifest: ProjectManifest; hash: string } | OpenFailure
  > {
    const file = manifestPath(root);
    const info = await stat(file).catch(() => null);
    if (!info) {
      if (await stat(path.join(root, LEGACY_MANIFEST)).catch(() => null)) {
        return {
          ok: false,
          code: 'not-a-project',
          message: `This folder contains a project file from an earlier prototype (${LEGACY_MANIFEST}). That legacy format is not supported by this version of FrameLytix.`
        };
      }
      return { ok: false, code: 'not-a-project', message: `This folder is not a FrameLytix project (no ${BRANDING.manifestFileName} was found).` };
    }
    if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) {
      return { ok: false, code: 'invalid', message: 'The project file is not a readable manifest.', recovery: await this.recoveryInfo(root) };
    }
    const bytes = await readFile(file);
    const hash = sha256(bytes);
    let data: unknown;
    try {
      data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    } catch {
      return {
        ok: false,
        code: 'invalid',
        message: 'The project file is damaged (it is not valid JSON). You can restore a backup.',
        recovery: await this.recoveryInfo(root)
      };
    }
    const parsed = parseManifest(data);
    if (!parsed.ok) {
      if (parsed.reason === 'future-version') return { ok: false, code: 'future-version', message: parsed.message };
      return { ok: false, code: 'invalid', message: parsed.message, recovery: await this.recoveryInfo(root) };
    }
    return { ok: true, manifest: parsed.manifest, hash };
  }

  async missingAssetWarnings(root: string, manifest: ProjectManifest): Promise<string[]> {
    const missing: string[] = [];
    for (const asset of manifest.assets) {
      let exists: boolean;
      try {
        const abs = await resolveInsideRoot(root, asset.relativePath);
        exists = (await stat(abs)).isFile();
      } catch {
        exists = false;
      }
      if (!exists) missing.push(asset.relativePath);
    }
    if (missing.length === 0) return [];
    const shown = missing.slice(0, 10).join(', ');
    const more = missing.length > 10 ? ` and ${missing.length - 10} more` : '';
    return [`${missing.length} referenced file${missing.length === 1 ? ' is' : 's are'} missing: ${shown}${more}. Relink or restore them.`];
  }

  async openProject(selection: string, opts: { isDemo?: boolean } = {}): Promise<ServiceOpenResult> {
    const located = await this.locate(selection);
    if (!located.ok) return located;
    const root = located.root;
    const read = await this.readManifestAt(root);
    if (!read.ok) return read;

    const lock = await this.acquireLock(root);
    if (!lock.ok) return { ok: false, code: 'locked', message: lock.message };

    const warnings: string[] = [];
    if (lock.warning) warnings.push(lock.warning);
    await ensureBackupsDir(root).catch(() => undefined);
    warnings.push(...(await this.missingAssetWarnings(root, read.manifest)));

    const session: ProjectSession = {
      rootPath: root,
      folderName: path.basename(root),
      isDemo: opts.isDemo === true,
      projectId: read.manifest.project.id,
      lock: lock.lock,
      lastKnownHash: read.hash,
      lastBackupAt: 0,
      queue: new SerialQueue(),
      closed: false
    };
    return { ok: true, session, manifest: read.manifest, warnings };
  }

  async reload(session: ProjectSession): Promise<ServiceOpenResult> {
    return session.queue.run(async () => {
      const read = await this.readManifestAt(session.rootPath);
      if (!read.ok) return read;
      session.lastKnownHash = read.hash;
      session.projectId = read.manifest.project.id;
      const warnings = await this.missingAssetWarnings(session.rootPath, read.manifest);
      return { ok: true as const, session, manifest: read.manifest, warnings };
    });
  }

  /** Restore a backup, then open the project normally. Close any session on `root` first. */
  async recover(root: string, backupFileName: string, opts: { isDemo?: boolean } = {}): Promise<ServiceOpenResult> {
    const located = await this.locate(root);
    if (!located.ok) return located;
    try {
      await recoverFromBackup(located.root, backupFileName);
    } catch (err) {
      return { ok: false, code: 'error', message: err instanceof Error && err.name === 'RecoveryError' ? err.message : 'The backup could not be restored.' };
    }
    return this.openProject(located.root, opts);
  }

  // -------------------------------------------------------------------------
  // Lock
  // -------------------------------------------------------------------------

  lockPath(root: string): string {
    return path.join(root, BRANDING.metadataDirName, BRANDING.lockFileName);
  }

  async acquireLock(root: string): Promise<{ ok: true; lock: LockFile; warning?: string } | { ok: false; message: string }> {
    const file = this.lockPath(root);
    await mkdir(path.dirname(file), { recursive: true });
    const mine: LockFile = {
      pid: process.pid,
      hostname: this.hostname,
      appVersion: this.appVersion,
      acquiredAt: this.now().toISOString(),
      instanceId: this.instanceId
    };
    const data = JSON.stringify(mine, null, 2) + '\n';
    try {
      await writeFileExclusive(file, data);
      return { ok: true, lock: mine };
    } catch (err) {
      if (errnoCode(err) !== 'EEXIST') throw err;
    }

    let existing: LockFile | null;
    try {
      const parsed = LockSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      existing = parsed.success ? parsed.data : null;
    } catch {
      existing = null;
    }

    let warning: string | undefined;
    if (!existing) {
      warning = 'A damaged project lock file was replaced.';
    } else if (existing.pid === process.pid && existing.instanceId === this.instanceId) {
      warning = undefined; // our own lock (e.g. reopening after recovery)
    } else {
      const acquired = Date.parse(existing.acquiredAt);
      const bootTime = Date.now() - uptime() * 1000;
      const preReboot = Number.isFinite(acquired) && acquired < bootTime - 60_000;
      if (existing.hostname === this.hostname) {
        if (isPidAlive(existing.pid) && !preReboot) {
          return { ok: false, message: 'This project appears to be open in another FrameLytix window. Close it there first.' };
        }
        warning = 'A stale lock from a FrameLytix session that did not close cleanly was cleared.';
      } else {
        const age = this.now().getTime() - acquired;
        if (Number.isFinite(age) && age < STALE_FOREIGN_LOCK_MS) {
          return {
            ok: false,
            message: `This project appears to be open in FrameLytix on another computer (${existing.hostname.slice(0, 80)}). Close it there first. A lock older than 12 hours is cleared automatically.`
          };
        }
        warning = `A stale lock from another computer (${existing.hostname.slice(0, 80)}) was cleared.`;
      }
    }
    await writeFileAtomic(file, data, { uniqueTemp: true });
    return warning ? { ok: true, lock: mine, warning } : { ok: true, lock: mine };
  }

  async releaseLock(session: ProjectSession): Promise<void> {
    if (!session.lock) return;
    const file = this.lockPath(session.rootPath);
    try {
      const current = LockSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      if (current.success && current.data.instanceId === this.instanceId && current.data.pid === process.pid) {
        await unlink(file);
      }
    } catch {
      /* already gone or unreadable: leave it */
    }
    session.lock = null;
  }

  async closeSession(session: ProjectSession): Promise<void> {
    // Let in-flight saves finish before releasing the lock.
    await session.queue.run(async () => undefined);
    session.closed = true;
    await this.releaseLock(session);
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  saveManifest(session: ProjectSession, manifest: ProjectManifest, options: SaveOptions): Promise<SaveResult> {
    return session.queue.run(() => this.doSave(session, manifest, options));
  }

  private async doSave(session: ProjectSession, manifest: ProjectManifest, options: SaveOptions): Promise<SaveResult> {
    if (session.closed) return { ok: false, code: 'no-project', message: 'No project is open.' };
    const parsed = ProjectManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      return { ok: false, code: 'invalid', message: `The project data is not valid and was not saved. ${issues}` };
    }
    const next = parsed.data;
    if (next.project.id !== session.projectId) {
      return { ok: false, code: 'invalid', message: 'The data being saved belongs to a different project and was not written.' };
    }
    next.appVersion = this.appVersion;

    const root = session.rootPath;
    const target = manifestPath(root);
    try {
      const bytes = serializeManifest(next);
      const newHash = sha256(bytes);
      const current = await readIfExists(target);
      const currentHash = current ? sha256(current) : MISSING_HASH;
      const nowMs = this.now().getTime();
      let backedUp = false;

      if (currentHash !== session.lastKnownHash) {
        if (!options.force) {
          return {
            ok: false,
            code: 'conflict',
            message:
              'The project file was changed outside FrameLytix since it was opened. Reload to use the external version, or overwrite it (the external version will be backed up first).'
          };
        }
        if (current) {
          await writeBackup(root, 'external', current);
          backedUp = true;
        }
      } else if (current && currentHash !== newHash && (options.manual || nowMs - session.lastBackupAt >= AUTO_BACKUP_INTERVAL_MS)) {
        await writeBackup(root, 'manifest', current);
        session.lastBackupAt = nowMs;
        backedUp = true;
      }
      if (backedUp) await pruneBackups(root, await this.getRetention());

      await writeFileAtomic(target, bytes);
      session.lastKnownHash = newHash;
      return { ok: true, savedAt: this.now().toISOString() };
    } catch (err) {
      const code = errnoCode(err);
      return {
        ok: false,
        code: 'error',
        message: `FrameLytix could not write the project file${code ? ` (${code})` : ''}. Your changes are still open; check that the folder is writable and try again.`
      };
    }
  }
}
