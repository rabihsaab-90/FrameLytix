/**
 * Shared helpers for the Electron end-to-end suite. Everything here uses temp directories only;
 * the bundled sample and real user folders are never written to.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';

export const REPO = path.resolve(__dirname, '..', '..');
export const SAMPLE_DIR = path.join(REPO, 'samples', 'pedestrian-truss-bridge');

export interface Launched {
  app: ElectronApplication;
  page: Page;
  userData: string;
  /** Every request URL the renderer issued. */
  requests: string[];
  pageErrors: string[];
}

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `flx-e2e-${prefix}-`));
}

export function removeDir(dir: string | undefined): void {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    /* best effort */
  }
}

export async function launchApp(userData: string): Promise<Launched> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  env['FRAMELYTIX_TEST_USER_DATA'] = userData;
  const app = await electron.launch({ args: [REPO], cwd: REPO, env, timeout: 60_000 });
  const page = await app.firstWindow();
  const requests: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w?.setContentSize(1440, 900);
  });
  await page.waitForLoadState('domcontentloaded');
  return { app, page, userData, requests, pageErrors };
}

export async function stubOpenDialog(app: ElectronApplication, filePaths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as typeof dialog.showOpenDialog;
  }, filePaths);
}

export async function stubSaveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
  }, filePath);
}

/** SHA-256 of every file under a directory, keyed by POSIX relative path. */
export function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

/** Lists files and directories (relative POSIX paths) so that empty folders are compared too. */
export function listEntries(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      out.push(path.relative(dir, p).split(path.sep).join('/') + (e.isDirectory() ? '/' : ''));
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Builds a small valid PNG (solid colour, `size` x `size`). */
export function makePng(rgb: [number, number, number], size = 1): Buffer {
  const crc = (buf: Buffer): number => zlib.crc32(buf) >>> 0;
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export const explorer = (page: Page) => page.getByRole('navigation', { name: 'Project explorer' });

export async function nav(page: Page, name: RegExp | string): Promise<void> {
  await explorer(page).getByRole('button', { name }).first().click();
}

export const h1 = (page: Page, name: RegExp | string) => page.getByRole('heading', { level: 1, name });

/**
 * After an action that may prompt ("Unsaved changes"), click the confirm button if the dialog appears,
 * otherwise do nothing. `until` resolves when the action completed without a prompt.
 */
export async function confirmIfPrompted(page: Page, confirmName: RegExp | string, until: () => Promise<unknown>): Promise<void> {
  const dialog = page.getByRole('dialog');
  const done = until().then(() => 'done' as const);
  const prompted = dialog.waitFor({ state: 'visible' }).then(() => 'dialog' as const);
  const first = await Promise.race([done, prompted]);
  if (first === 'dialog') {
    await dialog.getByRole('button', { name: confirmName }).click();
    await until();
  }
  void done.catch(() => undefined);
  void prompted.catch(() => undefined);
}

export async function expectNoPageErrors(l: Launched): Promise<void> {
  expect(l.pageErrors, 'renderer uncaught exceptions').toEqual([]);
}

/** Returns to the welcome screen (answering any save prompt) and then closes the app, never hanging. */
export async function shutdown(l: Launched | undefined): Promise<void> {
  if (!l) return;
  try {
    const home = l.page.getByRole('button', { name: 'Home' });
    if (await home.isVisible()) {
      await home.click();
      await confirmIfPrompted(l.page, /^(Save|Leave demo)$/, () => l.page.getByRole('button', { name: /Load Sample Civil Bridge Project/ }).waitFor({ timeout: 15_000 }));
    }
  } catch {
    /* fall through to closing */
  }
  const closed = await Promise.race([l.app.close().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 20_000))]).catch(() => true);
  if (!closed) l.app.process().kill();
}