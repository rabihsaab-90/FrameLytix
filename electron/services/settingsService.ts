/**
 * Application settings persisted as `settings.json` in the Electron userData folder
 * (the directory is passed in so this stays plain Node and testable).
 *
 * - Loaded with Zod. A corrupt or invalid file is preserved as `settings.corrupt-<ts>.json`
 *   and defaults are used.
 * - Writes are atomic (temp file + rename with retry) and serialised.
 * - `reset()` restores preference defaults but KEEPS the recent-projects list, because that
 *   list is navigation history rather than a preference and losing it surprises users.
 */
import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AppSettingsPatchSchema,
  AppSettingsSchema,
  type AppSettings,
  type AppSettingsPatch,
  type RecentProject
} from '../../shared/schemas/settings';
import { BRANDING } from '../../src/config/branding';
import { errnoCode, fileTimestamp, SerialQueue, writeFileAtomic } from './fsUtils';

export const MAX_RECENT = 20;
const isWin = process.platform === 'win32';

function samePathKey(p: string): string {
  const n = path.resolve(p);
  return isWin ? n.toLowerCase() : n;
}

export class SettingsService {
  private settings: AppSettings | null = null;
  private readonly queue = new SerialQueue();
  readonly filePath: string;
  /** Set when the last load found a damaged file (path of the preserved copy). */
  lastCorruptBackup: string | null = null;

  constructor(private readonly dir: string) {
    this.filePath = path.join(dir, 'settings.json');
  }

  async load(): Promise<AppSettings> {
    if (this.settings) return this.settings;
    let raw: string | null = null;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (err) {
      if (errnoCode(err) !== 'ENOENT') throw err;
    }
    if (raw === null) {
      this.settings = AppSettingsSchema.parse({});
      return this.settings;
    }
    let parsed: AppSettings | null = null;
    try {
      const result = AppSettingsSchema.safeParse(JSON.parse(raw.replace(/^\uFEFF/, '')));
      if (result.success) parsed = result.data;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      const backup = path.join(this.dir, `settings.corrupt-${fileTimestamp()}.json`);
      await copyFile(this.filePath, backup).catch(() => undefined);
      this.lastCorruptBackup = backup;
      parsed = AppSettingsSchema.parse({});
      this.settings = parsed;
      await this.persist();
    }
    this.settings = parsed;
    return parsed;
  }

  async get(): Promise<AppSettings> {
    return structuredClone(await this.load());
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.settings, null, 2) + '\n';
    return this.queue.run(async () => {
      await mkdir(this.dir, { recursive: true });
      await writeFileAtomic(this.filePath, snapshot);
    });
  }

  async update(patch: AppSettingsPatch): Promise<AppSettings> {
    const valid = AppSettingsPatchSchema.parse(patch);
    const current = await this.load();
    this.settings = AppSettingsSchema.parse({ ...current, ...valid });
    await this.persist();
    return this.get();
  }

  /** Restore preference defaults; the recent-projects list is kept (see file header). */
  async reset(): Promise<AppSettings> {
    const current = await this.load();
    this.settings = AppSettingsSchema.parse({ recentProjects: current.recentProjects });
    await this.persist();
    return this.get();
  }

  async addRecent(entry: RecentProject): Promise<void> {
    const current = await this.load();
    const key = samePathKey(entry.path);
    const rest = current.recentProjects.filter((r) => samePathKey(r.path) !== key);
    current.recentProjects = [entry, ...rest].slice(0, MAX_RECENT);
    this.settings = AppSettingsSchema.parse(current);
    await this.persist();
  }

  async removeRecent(p: string): Promise<void> {
    const current = await this.load();
    const key = samePathKey(p);
    current.recentProjects = current.recentProjects.filter((r) => samePathKey(r.path) !== key);
    await this.persist();
  }

  async findRecent(p: string): Promise<RecentProject | undefined> {
    const current = await this.load();
    const key = samePathKey(p);
    return current.recentProjects.find((r) => samePathKey(r.path) === key);
  }

  async listRecent(): Promise<(RecentProject & { available: boolean })[]> {
    const current = await this.load();
    return Promise.all(
      current.recentProjects.map(async (r) => {
        let available = true;
        try {
          await access(path.join(r.path, BRANDING.manifestFileName));
        } catch {
          available = false;
        }
        return { ...r, available };
      })
    );
  }

  /** Wait for pending writes (used on quit and in tests). */
  flush(): Promise<void> {
    return this.queue.run(async () => undefined);
  }
}
