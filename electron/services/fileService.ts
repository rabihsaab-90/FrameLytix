/**
 * Project file tree, stats, safe import (copy-only, never silently overwrites) and the
 * project folder watcher. Plain Node only.
 */
import { randomUUID } from 'node:crypto';
import { constants as fsConstants, watch, type FSWatcher } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { FileNode, FileStat, ImportDecision, ImportPlan, ImportPlanItem, ImportResult } from '../../shared/types/ipc';
import { extensionOf, validateFileName } from '../../shared/utilities/paths';
import { BRANDING } from '../../src/config/branding';
import { isBlockedExtension, PathSecurityError, resolveInsideRoot, safeSegments, toRelativePosix } from '../security/paths';
import { errnoCode, readIfExists, renameWithRetry, sha256, sha256File } from './fsUtils';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_IMPORT_FILES = 500;
export const MAX_STAT_PATHS = 2000;
export const PLAN_TTL_MS = 15 * 60 * 1000;

const SKIP_ANYWHERE = new Set(['.git', 'node_modules']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const caseInsensitiveFs = process.platform === 'win32' || process.platform === 'darwin';

function nameKey(name: string): string {
  return caseInsensitiveFs ? name.toLowerCase() : name;
}

/** Relative POSIX path from validated segments. */
function relFromSegments(segments: string[]): string {
  return segments.join('/');
}

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

export interface TreeOptions {
  maxDepth?: number;
  maxEntries?: number;
}

export async function buildTree(root: string, opts: TreeOptions = {}): Promise<FileNode> {
  const maxDepth = opts.maxDepth ?? 10;
  const maxEntries = opts.maxEntries ?? 5000;
  let count = 0;
  const manifestLower = BRANDING.manifestFileName.toLowerCase();

  async function walk(abs: string, rel: string, depth: number): Promise<FileNode[]> {
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return [];
    }
    const dirs: FileNode[] = [];
    const files: FileNode[] = [];
    for (const entry of entries) {
      if (count >= maxEntries) break;
      const name = entry.name;
      const lower = name.toLowerCase();
      if (SKIP_ANYWHERE.has(lower)) continue;
      if (rel === '' && (lower === BRANDING.metadataDirName || lower === manifestLower || lower === `${manifestLower}.tmp`)) continue;
      if (entry.isSymbolicLink()) continue;
      const childAbs = path.join(abs, name);
      let s;
      try {
        s = await lstat(childAbs); // never follow links/junctions
      } catch {
        continue;
      }
      if (s.isSymbolicLink()) continue;
      const childRel = rel === '' ? name : `${rel}/${name}`;
      if (s.isDirectory()) {
        count++;
        const node: FileNode = { name, relativePath: childRel, kind: 'directory', modifiedAt: s.mtime.toISOString(), children: [] };
        if (depth < maxDepth) node.children = await walk(childAbs, childRel, depth + 1);
        dirs.push(node);
      } else if (s.isFile()) {
        count++;
        files.push({
          name,
          relativePath: childRel,
          kind: 'file',
          sizeBytes: s.size,
          modifiedAt: s.mtime.toISOString(),
          extension: extensionOf(name)
        });
      }
    }
    dirs.sort((a, b) => collator.compare(a.name, b.name));
    files.sort((a, b) => collator.compare(a.name, b.name));
    return [...dirs, ...files];
  }

  const children = await walk(root, '', 1);
  return { name: path.basename(root), relativePath: '', kind: 'directory', children };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function statMany(root: string, rels: string[]): Promise<Record<string, FileStat>> {
  const out: Record<string, FileStat> = {};
  for (const rel of rels.slice(0, MAX_STAT_PATHS)) {
    if (typeof rel !== 'string') continue;
    let result: FileStat = { exists: false, isFile: false, sizeBytes: 0, modifiedAt: null };
    try {
      const abs = await resolveInsideRoot(root, rel);
      const s = await stat(abs);
      result = { exists: true, isFile: s.isFile(), sizeBytes: s.size, modifiedAt: s.mtime.toISOString() };
    } catch {
      /* invalid or missing → exists:false */
    }
    out[rel] = result;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createFolder(
  root: string,
  parentRel: string,
  name: string
): Promise<{ ok: true; relativePath: string } | { ok: false; message: string }> {
  const nameError = validateFileName(name);
  if (nameError) return { ok: false, message: nameError };
  let parentSegs: string[];
  try {
    parentSegs = safeSegments(parentRel);
  } catch {
    return { ok: false, message: 'The parent folder is not inside the project.' };
  }
  const rel = relFromSegments([...parentSegs, name]);
  if (parentSegs.length === 0 && name.toLowerCase() === BRANDING.metadataDirName) {
    return { ok: false, message: 'That folder name is reserved by FrameLytix.' };
  }
  try {
    const parentAbs = await resolveInsideRoot(root, relFromSegments(parentSegs));
    const ps = await stat(parentAbs).catch(() => null);
    if (!ps || !ps.isDirectory()) return { ok: false, message: 'The parent folder does not exist.' };
    const abs = await resolveInsideRoot(root, rel);
    await mkdir(abs);
    return { ok: true, relativePath: rel };
  } catch (err) {
    if (err instanceof PathSecurityError) return { ok: false, message: err.message };
    if (errnoCode(err) === 'EEXIST') return { ok: false, message: 'A file or folder with that name already exists.' };
    return { ok: false, message: 'The folder could not be created.' };
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

interface StoredItem extends ImportPlanItem {
  targetName: string;
}

interface StoredPlan {
  root: string;
  destSegments: string[];
  items: StoredItem[];
  createdAt: number;
}

async function filesIdentical(a: string, b: string, sizeA: number): Promise<boolean> {
  const sb = await lstat(b).catch(() => null);
  if (!sb || !sb.isFile() || sb.size !== sizeA) return false;
  const [ha, hb] = await Promise.all([sha256File(a), sha256File(b)]);
  return ha === hb;
}

/** "name.ext" → "name (2).ext", "name (3).ext", … */
export function numberedName(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
  return `${name} (${n})`;
}

export class ImportService {
  private readonly plans = new Map<string, StoredPlan>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  private purge(): void {
    const t = this.now();
    for (const [k, p] of this.plans) if (t - p.createdAt > PLAN_TTL_MS) this.plans.delete(k);
  }

  async planImport(root: string, sourcePaths: string[], destRelDir: string): Promise<ImportPlan> {
    this.purge();
    const destSegments = safeSegments(destRelDir);
    const destRel = relFromSegments(destSegments);
    const destAbs = await resolveInsideRoot(root, destRel);
    const ds = await stat(destAbs).catch(() => null);
    if (!ds || !ds.isDirectory()) throw new PathSecurityError('The destination folder does not exist in the project.');

    const items: StoredItem[] = [];
    const plannedNames = new Set<string>();
    for (const [index, src] of sourcePaths.slice(0, MAX_IMPORT_FILES).entries()) {
      const sourceName = path.basename(src);
      const item: StoredItem = {
        index,
        sourceName,
        sourcePath: src,
        sizeBytes: 0,
        targetRelativePath: destRel === '' ? sourceName : `${destRel}/${sourceName}`,
        targetName: sourceName,
        collision: false,
        identical: false,
        rejected: false
      };
      items.push(item);
      const reject = (reason: string): void => {
        item.rejected = true;
        item.rejectReason = reason;
      };
      if (!path.isAbsolute(src)) {
        reject('The source path is not valid.');
        continue;
      }
      const s = await lstat(src).catch(() => null);
      if (!s) {
        reject('The file could not be found.');
        continue;
      }
      if (s.isSymbolicLink()) {
        reject('Shortcuts and symbolic links cannot be imported. Import the original file instead.');
        continue;
      }
      if (s.isDirectory()) {
        reject('Folders cannot be imported directly. Import the files inside it instead.');
        continue;
      }
      if (!s.isFile()) {
        reject('Only regular files can be imported.');
        continue;
      }
      item.sizeBytes = s.size;
      if (s.size > MAX_IMPORT_BYTES) {
        reject('Files larger than 2 GB cannot be imported.');
        continue;
      }
      if (isBlockedExtension(sourceName)) {
        reject(`.${extensionOf(sourceName)} files are blocked because they can run code on this computer.`);
        continue;
      }
      const nameError = validateFileName(sourceName);
      if (nameError) {
        reject(nameError);
        continue;
      }
      const key = nameKey(sourceName);
      const targetAbs = path.join(destAbs, sourceName);
      const existing = await lstat(targetAbs).catch(() => null);
      if (existing) {
        item.collision = true;
        item.identical = existing.isFile() && (await filesIdentical(src, targetAbs, s.size));
      } else if (plannedNames.has(key)) {
        item.collision = true; // two selected files share a name
      }
      plannedNames.add(key);
    }

    const token = randomUUID();
    this.plans.set(token, { root, destSegments, items, createdAt: this.now() });
    return {
      token,
      destRelativeDir: destRel,
      items: items.map(({ targetName: _t, ...rest }) => rest)
    };
  }

  async commitImport(root: string, token: string, decisions: Record<number, ImportDecision>): Promise<ImportResult> {
    this.purge();
    const plan = this.plans.get(token);
    this.plans.delete(token); // single use
    if (!plan) throw new PathSecurityError('This import has expired. Choose the files again.');
    if (path.resolve(plan.root) !== path.resolve(root)) throw new PathSecurityError('This import belongs to a different project.');

    const result: ImportResult = { imported: [], skipped: [], errors: [] };
    const destRel = relFromSegments(plan.destSegments);
    for (const item of plan.items) {
      if (item.rejected) {
        result.errors.push({ sourceName: item.sourceName, message: item.rejectReason ?? 'Rejected.' });
        continue;
      }
      try {
        const destAbs = await resolveInsideRoot(root, destRel);
        // Re-validate the source at commit time.
        const s = await lstat(item.sourcePath).catch(() => null);
        if (!s || !s.isFile() || s.isSymbolicLink()) throw new UserError('The source file is no longer available.');
        if (s.size > MAX_IMPORT_BYTES) throw new UserError('Files larger than 2 GB cannot be imported.');

        const targetRel = destRel === '' ? item.targetName : `${destRel}/${item.targetName}`;
        const targetAbs = await resolveInsideRoot(root, targetRel);
        const exists = await lstat(targetAbs).catch(() => null);
        const decision: ImportDecision | undefined = decisions[item.index];

        let finalAbs: string;
        if (decision === 'skip') {
          result.skipped.push(item.sourceName);
          continue;
        }
        if (!exists) {
          await copyFile(item.sourcePath, targetAbs, fsConstants.COPYFILE_EXCL);
          finalAbs = targetAbs;
        } else if (decision === 'keep-both') {
          finalAbs = await this.copyKeepBoth(item.sourcePath, destAbs, item.targetName);
        } else if (decision === 'replace') {
          if (!exists.isFile()) throw new UserError('The existing item is not a regular file and cannot be replaced.');
          const tmp = path.join(destAbs, `.${randomUUID().slice(0, 12)}.framelytix-import.tmp`);
          try {
            await copyFile(item.sourcePath, tmp, fsConstants.COPYFILE_EXCL);
            await renameWithRetry(tmp, targetAbs);
          } catch (err) {
            await unlink(tmp).catch(() => undefined);
            throw err;
          }
          finalAbs = targetAbs;
        } else {
          // Collision with no explicit decision: never overwrite.
          result.skipped.push(item.sourceName);
          continue;
        }
        const fs2 = await stat(finalAbs);
        result.imported.push({
          relativePath: toRelativePosix(await resolveInsideRoot(root, ''), finalAbs) ?? targetRel,
          sizeBytes: fs2.size,
          modifiedAt: fs2.mtime.toISOString()
        });
      } catch (err) {
        const message =
          err instanceof UserError || err instanceof PathSecurityError
            ? err.message
            : `The file could not be copied${errnoCode(err) ? ` (${errnoCode(err)})` : ''}.`;
        result.errors.push({ sourceName: item.sourceName, message });
      }
    }
    return result;
  }

  private async copyKeepBoth(src: string, destAbs: string, name: string): Promise<string> {
    for (let n = 2; n < 1000; n++) {
      const candidate = path.join(destAbs, numberedName(name, n));
      if (await lstat(candidate).catch(() => null)) continue;
      try {
        await copyFile(src, candidate, fsConstants.COPYFILE_EXCL);
        return candidate;
      } catch (err) {
        if (errnoCode(err) !== 'EEXIST') throw err;
      }
    }
    throw new UserError('Could not find a free file name.');
  }

  /** Test helper. */
  get size(): number {
    return this.plans.size;
  }
}

class UserError extends Error {}

// ---------------------------------------------------------------------------
// Watcher
// ---------------------------------------------------------------------------

export interface ProjectWatcher {
  close(): void;
  readonly failed: boolean;
}

export interface WatcherHandlers {
  onChange(paths: string[]): void;
  onManifestChange(): void;
  /** Hash of the manifest as FrameLytix last read/wrote it. */
  getLastKnownHash(): string;
  debounceMs?: number;
}

export function createProjectWatcher(root: string, handlers: WatcherHandlers): ProjectWatcher {
  const debounce = handlers.debounceMs ?? 400;
  const manifestLower = BRANDING.manifestFileName.toLowerCase();
  const pending = new Set<string>();
  let manifestPending = false;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  let failed = false;
  let watcher: FSWatcher | null = null;

  const flush = async (): Promise<void> => {
    timer = null;
    if (closed) return;
    const paths = [...pending].slice(0, 200);
    pending.clear();
    if (paths.length > 0) handlers.onChange(paths);
    if (manifestPending) {
      manifestPending = false;
      const bytes = await readIfExists(path.join(root, BRANDING.manifestFileName)).catch(() => null);
      const hash = bytes ? sha256(bytes) : 'missing';
      if (!closed && hash !== handlers.getLastKnownHash()) handlers.onManifestChange();
    }
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounce);
  };

  try {
    watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
      if (closed) return;
      const rel = filename ? String(filename).split(path.sep).join('/').replace(/^\/+/, '') : '';
      const lower = rel.toLowerCase();
      const first = lower.split('/')[0] ?? '';
      if (first === BRANDING.metadataDirName || SKIP_ANYWHERE.has(first) || lower.endsWith('.tmp')) return;
      if (lower === manifestLower) {
        manifestPending = true;
      } else if (pending.size < 1000) {
        pending.add(rel);
      }
      schedule();
    });
    watcher.on('error', () => {
      failed = true;
      api.close();
    });
  } catch {
    failed = true;
  }

  const api: ProjectWatcher = {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      try {
        watcher?.close();
      } catch {
        /* ignore */
      }
      watcher = null;
    },
    get failed() {
      return failed;
    }
  };
  return api;
}
