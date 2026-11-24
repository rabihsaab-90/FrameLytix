/**
 * Bounded local diagnostic log (userData/logs/main.log, ~1 MB, one rotated file).
 * Never log document contents — only channel names, error names, codes and messages.
 * Plain Node only.
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1024 * 1024;

export class Logger {
  private readonly file: string;
  constructor(private readonly dir: string) {
    this.file = path.join(dir, 'main.log');
  }

  write(level: 'info' | 'warn' | 'error', message: string): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      try {
        if (statSync(this.file).size > MAX_BYTES) renameSync(this.file, path.join(this.dir, 'main.old.log'));
      } catch {
        /* no file yet */
      }
      const line = `${new Date().toISOString()} [${level}] ${message.replace(/[\r\n]+/g, ' ').slice(0, 2000)}\n`;
      appendFileSync(this.file, line, 'utf8');
    } catch {
      /* logging must never throw */
    }
  }

  error(context: string, err: unknown): void {
    const e = err as (Error & { code?: string }) | undefined;
    const desc = e instanceof Error ? `${e.name}${e.code ? `(${e.code})` : ''}: ${e.message}` : String(err);
    this.write('error', `${context}: ${desc}`);
  }
}
