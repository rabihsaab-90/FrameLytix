import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppSettingsSchema } from '../../shared/schemas/settings';
import { SettingsService } from '../../electron/services/settingsService';
import { makeTempDir, removeTempDir } from './helpers';

let dir: string;

beforeEach(async () => {
  dir = await makeTempDir();
});
afterEach(async () => {
  await removeTempDir(dir);
});

const recent = (p: string, title = 'P') => ({ path: p, title, discipline: 'civil' as const, identifier: 'X', lastOpened: '2026-11-24T00:00:00.000Z' });

describe('SettingsService', () => {
  it('uses defaults when no file exists, then persists updates atomically', async () => {
    const svc = new SettingsService(dir);
    expect((await svc.get()).autosaveDelayMs).toBe(1500);
    await svc.update({ autosaveDelayMs: 3000, reducedMotion: true });
    const fresh = new SettingsService(dir);
    expect((await fresh.get()).autosaveDelayMs).toBe(3000);
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects invalid patches', async () => {
    const svc = new SettingsService(dir);
    await expect(svc.update({ autosaveDelayMs: 1 })).rejects.toThrow();
    await expect(svc.update({ recentProjects: [] } as never)).rejects.toThrow();
  });

  it.each(['{ not json', JSON.stringify({ autosaveDelayMs: 'soon' })])('recovers from a corrupt file %#', async (content) => {
    await writeFile(path.join(dir, 'settings.json'), content);
    const svc = new SettingsService(dir);
    const s = await svc.get();
    expect(s).toEqual(AppSettingsSchema.parse({}));
    const corrupt = (await readdir(dir)).filter((n) => n.startsWith('settings.corrupt-'));
    expect(corrupt.length).toBe(1);
    expect(await readFile(path.join(dir, corrupt[0]!), 'utf8')).toBe(content);
    expect(AppSettingsSchema.safeParse(JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'))).success).toBe(true);
  });

  it('manages recent projects: dedupe, newest first, max 20, availability; reset keeps them', async () => {
    const svc = new SettingsService(dir);
    const projA = path.join(dir, 'A');
    await mkdir(projA);
    await writeFile(path.join(projA, 'framelytix-project.json'), '{}');
    for (let i = 0; i < 25; i++) await svc.addRecent(recent(path.join(dir, `P${i}`)));
    await svc.addRecent(recent(projA, 'A'));
    const caseVariant = process.platform === 'win32' ? projA.toUpperCase() : projA;
    await svc.addRecent(recent(caseVariant, 'A2'));
    const list = await svc.listRecent();
    expect(list.length).toBe(20);
    expect(list[0]!.title).toBe('A2');
    expect(list[0]!.available).toBe(true);
    expect(list[1]!.available).toBe(false);
    expect(list.filter((r) => r.path.toLowerCase() === projA.toLowerCase()).length).toBe(1);

    await svc.update({ sidebarWidth: 400 });
    const reset = await svc.reset();
    expect(reset.sidebarWidth).toBe(280);
    expect(reset.recentProjects.length).toBe(20);

    await svc.removeRecent(projA);
    expect((await svc.listRecent()).some((r) => r.title === 'A2')).toBe(false);
  });
});
