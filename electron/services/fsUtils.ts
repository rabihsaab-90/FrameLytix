/** Durable file-write helpers shared by the services. Plain Node only. */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, rename, unlink } from 'node:fs/promises';

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const BACKOFF_MS = [50, 100, 200, 300, 400];

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function errnoCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Stream-hash a file (no whole-file buffering). */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Read a file, returning null when it does not exist. */
export async function readIfExists(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch (err) {
    if (errnoCode(err) === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Rename with retry: on Windows, antivirus / indexers / sync clients briefly hold handles,
 * causing EPERM/EBUSY/EACCES. Retries up to 5 times with 50–400 ms backoff.
 */
export async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = errnoCode(err);
      if (!code || !RETRYABLE.has(code) || attempt >= BACKOFF_MS.length) throw err;
      await sleep(BACKOFF_MS[attempt] ?? 400);
    }
  }
}

/**
 * Atomic replace: write `<target>.tmp` (or a unique temp name), fsync, then rename over the
 * target. Readers never observe a half-written file. The temp file is removed on failure.
 */
export async function writeFileAtomic(target: string, data: string | Uint8Array, opts: { uniqueTemp?: boolean } = {}): Promise<void> {
  const tmp = opts.uniqueTemp ? `${target}.${randomUUID().slice(0, 8)}.tmp` : `${target}.tmp`;
  let fh;
  try {
    fh = await open(tmp, 'w');
    await fh.writeFile(data);
    await fh.sync();
    await fh.close();
    fh = undefined;
    await renameWithRetry(tmp, target);
  } catch (err) {
    if (fh) await fh.close().catch(() => undefined);
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Write a new file; fails with EEXIST rather than overwriting. */
export async function writeFileExclusive(target: string, data: string | Uint8Array): Promise<void> {
  const fh = await open(target, 'wx');
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

/** Timestamp safe for file names: 2026-11-24T10-11-12-345Z. */
export function fileTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

/** Simple promise queue: tasks run strictly one after another. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
