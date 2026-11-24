/**
 * Manifest backups and recovery. Backups live in `<root>/.framelytix/backups/`:
 *  - manifest-<ts>.json   rolling backups before saves (pruned to the retention setting)
 *  - external-<ts>.json   a version changed outside FrameLytix that was overwritten by a forced save
 *  - corrupted-<ts>.json  a damaged manifest preserved before a recovery replaced it
 */
import { lstat, mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parseManifest } from '../../shared/schemas/project';
import type { BackupInfo } from '../../shared/types/ipc';
import { BRANDING } from '../../src/config/branding';
import { errnoCode, fileTimestamp, readIfExists, writeFileAtomic, writeFileExclusive } from './fsUtils';

export const BACKUP_NAME_RE = /^(manifest|external)-[\w.-]+\.json$/;
export const OTHER_BACKUP_CAP = 20;
const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export function backupsDir(root: string): string {
  return path.join(root, BRANDING.metadataDirName, BRANDING.backupsDirName);
}

export function manifestPath(root: string): string {
  return path.join(root, BRANDING.manifestFileName);
}

export async function ensureBackupsDir(root: string): Promise<string> {
  const dir = backupsDir(root);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Write `data` to `<backups>/<prefix>-<ts>.json` without ever overwriting an existing backup.
 * Returns the file name.
 */
export async function writeBackup(root: string, prefix: 'manifest' | 'external' | 'corrupted', data: Uint8Array | string): Promise<string> {
  const dir = await ensureBackupsDir(root);
  const ts = fileTimestamp();
  for (let i = 0; i < 100; i++) {
    const name = i === 0 ? `${prefix}-${ts}.json` : `${prefix}-${ts}-${String(i).padStart(2, '0')}.json`;
    try {
      await writeFileExclusive(path.join(dir, name), data);
      return name;
    } catch (err) {
      if (errnoCode(err) !== 'EEXIST') throw err;
    }
  }
  throw new Error('Could not allocate a backup file name.');
}

interface BackupEntry {
  name: string;
  mtimeMs: number;
  size: number;
}

async function listEntries(root: string, re: RegExp): Promise<BackupEntry[]> {
  let names: string[];
  try {
    names = await readdir(backupsDir(root));
  } catch (err) {
    if (errnoCode(err) === 'ENOENT') return [];
    throw err;
  }
  const out: BackupEntry[] = [];
  for (const name of names) {
    if (!re.test(name)) continue;
    try {
      const s = await lstat(path.join(backupsDir(root), name));
      if (!s.isFile()) continue;
      out.push({ name, mtimeMs: s.mtimeMs, size: s.size });
    } catch {
      /* vanished */
    }
  }
  // Newest first. Names embed ISO timestamps (+ "-N" on same-millisecond collisions), so the
  // name without ".json" sorts chronologically and breaks mtime ties.
  const stem = (n: string): string => n.replace(/\.json$/, '').replace(/^[a-z]+-/, '');
  out.sort((a, b) => (stem(a.name) < stem(b.name) ? 1 : stem(a.name) > stem(b.name) ? -1 : b.mtimeMs - a.mtimeMs));
  return out;
}

/** Keep the newest `retention` manifest-* backups; cap external-* and corrupted-* at 20 each. */
export async function pruneBackups(root: string, retention: number): Promise<void> {
  const groups: [RegExp, number][] = [
    [/^manifest-[\w.-]+\.json$/, Math.max(1, retention)],
    [/^external-[\w.-]+\.json$/, OTHER_BACKUP_CAP],
    [/^corrupted-[\w.-]+\.json$/, OTHER_BACKUP_CAP]
  ];
  for (const [re, keep] of groups) {
    const entries = await listEntries(root, re);
    for (const e of entries.slice(keep)) {
      await unlink(path.join(backupsDir(root), e.name)).catch(() => undefined);
    }
  }
}

export async function listBackups(root: string): Promise<BackupInfo[]> {
  const entries = await listEntries(root, BACKUP_NAME_RE);
  const out: BackupInfo[] = [];
  for (const e of entries) {
    let valid = false;
    let projectTitle = '';
    if (e.size <= MAX_BACKUP_BYTES) {
      try {
        const data: unknown = JSON.parse((await readFile(path.join(backupsDir(root), e.name), 'utf8')).replace(/^\uFEFF/, ''));
        const parsed = parseManifest(data);
        if (parsed.ok) {
          valid = true;
          projectTitle = parsed.manifest.project.title;
        } else {
          const t = (data as { project?: { title?: unknown } } | null)?.project?.title;
          if (typeof t === 'string') projectTitle = t.slice(0, 200);
        }
      } catch {
        valid = false;
      }
    }
    out.push({ fileName: e.name, createdAt: new Date(e.mtimeMs).toISOString(), sizeBytes: e.size, valid, projectTitle });
  }
  return out;
}

export class RecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryError';
  }
}

/**
 * Replace the project manifest with a backup. The current (damaged) manifest is first
 * preserved as corrupted-<ts>.json. Only plain backup file names are accepted.
 */
export async function recoverFromBackup(root: string, backupFileName: string): Promise<{ preservedAs: string | null }> {
  if (typeof backupFileName !== 'string' || !BACKUP_NAME_RE.test(backupFileName)) {
    throw new RecoveryError('That backup name is not valid.');
  }
  const src = path.join(backupsDir(root), backupFileName);
  const s = await lstat(src).catch(() => null);
  if (!s || !s.isFile()) throw new RecoveryError('The selected backup no longer exists.');
  if (s.size > MAX_BACKUP_BYTES) throw new RecoveryError('The selected backup is too large.');
  const bytes = await readFile(src);
  let parsedOk: boolean;
  try {
    parsedOk = parseManifest(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))).ok;
  } catch {
    parsedOk = false;
  }
  if (!parsedOk) throw new RecoveryError('The selected backup is not a valid FrameLytix project file and cannot be restored.');

  const target = manifestPath(root);
  let preservedAs: string | null = null;
  const current = await readIfExists(target);
  if (current !== null) {
    preservedAs = await writeBackup(root, 'corrupted', current);
  }
  await writeFileAtomic(target, bytes);
  return { preservedAs };
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
