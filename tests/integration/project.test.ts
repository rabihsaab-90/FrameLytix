import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectManifestSchema, type ProjectManifest } from '../../shared/schemas/project';
import { statMany } from '../../electron/services/fileService';
import { ProjectService, type ProjectSession } from '../../electron/services/projectService';
import { backupsDir, listBackups } from '../../electron/services/recoveryService';
import { FIXTURE_TEMPLATE, fixtureContext, fixtureInput, makeTempDir, removeTempDir, sha256OfFile } from './helpers';

const MANIFEST = 'framelytix-project.json';

let tmp: string;
let svc: ProjectService;
let retention = 10;
const sessions: ProjectSession[] = [];

beforeEach(async () => {
  tmp = await makeTempDir();
  retention = 10;
  svc = new ProjectService({ appVersion: '0.1.0', instanceId: 'test-instance-A', getRetention: () => retention });
});

afterEach(async () => {
  for (const s of sessions.splice(0)) await svc.closeSession(s).catch(() => undefined);
  await removeTempDir(tmp);
});

async function createOpen(folder = 'Test-Project'): Promise<{ session: ProjectSession; manifest: ProjectManifest; root: string }> {
  const res = await svc.createProject(fixtureInput(tmp, folder), FIXTURE_TEMPLATE, fixtureContext());
  if (!res.ok) throw new Error(res.message);
  sessions.push(res.session);
  return { session: res.session, manifest: res.manifest, root: res.session.rootPath };
}

function edited(m: ProjectManifest, label: string): ProjectManifest {
  const copy = structuredClone(m);
  copy.requirements[0]!.title = `Requirement ${label}`;
  copy.project.modifiedAt = new Date().toISOString();
  return copy;
}

async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const pid = child.pid!;
  await new Promise((r) => child.on('exit', r));
  return pid;
}

describe('create', () => {
  it('creates folders, metadata, .gitignore and a valid manifest', async () => {
    const { root, manifest } = await createOpen();
    for (const f of FIXTURE_TEMPLATE.folders) expect((await stat(path.join(root, f))).isDirectory()).toBe(true);
    expect((await stat(backupsDir(root))).isDirectory()).toBe(true);
    const raw = JSON.parse(await readFile(path.join(root, MANIFEST), 'utf8'));
    expect(ProjectManifestSchema.safeParse(raw).success).toBe(true);
    expect(manifest.project.title).toBe('Fixture Footbridge');
    const gi = await readFile(path.join(root, '.gitignore'), 'utf8');
    expect(gi).toContain('.framelytix/backups/');
    expect(gi).toContain('.framelytix/lock.json');
    expect(gi).not.toMatch(/^\*\.dwg$/m);
    expect(gi).not.toContain(MANIFEST + '\n');
    await expect(access(path.join(root, '.git'))).rejects.toThrow();
  });

  it('refuses to create into an existing folder and leaves it untouched', async () => {
    const existing = path.join(tmp, 'Existing');
    await mkdir(existing);
    await writeFile(path.join(existing, 'keep.txt'), 'keep');
    const check = await svc.checkTarget(tmp, 'Existing');
    expect(check.ok).toBe(false);
    const res = await svc.createProject(fixtureInput(tmp, 'Existing'), FIXTURE_TEMPLATE, fixtureContext());
    expect(res.ok).toBe(false);
    expect(await readdir(existing)).toEqual(['keep.txt']);
  });

  it('rejects invalid folder names', async () => {
    expect((await svc.checkTarget(tmp, 'bad:name')).ok).toBe(false);
    expect((await svc.checkTarget(tmp, 'CON')).ok).toBe(false);
    expect((await svc.checkTarget(tmp, '..')).ok).toBe(false);
  });
});

describe('save and reopen', () => {
  it('preserves requirement and argument edits; atomic save leaves no .tmp', async () => {
    const { session, manifest, root } = await createOpen();
    const next = structuredClone(manifest);
    next.requirements[0]!.title = 'Edited requirement';
    next.requirements[0]!.targetValue = '5.0';
    next.arguments[0]!.alternatives.push({ id: 'alt-new', name: 'Howe', description: 'Added' });
    next.arguments[0]!.selectionRationale = 'Because.';
    const res = await svc.saveManifest(session, next, { manual: true });
    expect(res.ok).toBe(true);
    expect((await readdir(root)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    await svc.closeSession(session);

    const reopened = await svc.openProject(root);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    sessions.push(reopened.session);
    expect(reopened.manifest.requirements[0]!.title).toBe('Edited requirement');
    expect(reopened.manifest.requirements[0]!.targetValue).toBe('5.0');
    expect(reopened.manifest.arguments[0]!.alternatives.map((a) => a.name)).toContain('Howe');
    expect(reopened.manifest.arguments[0]!.selectionRationale).toBe('Because.');
  });

  it('opens when the manifest file itself is selected', async () => {
    const { session, root } = await createOpen();
    await svc.closeSession(session);
    const res = await svc.openProject(path.join(root, MANIFEST));
    expect(res.ok).toBe(true);
    if (res.ok) sessions.push(res.session);
  });

  it('survives relocation: data intact and asset relative paths resolve', async () => {
    const { session, manifest, root } = await createOpen();
    await writeFile(path.join(root, '03-CAD-and-Technical-Drawings', 'Drawings', 'plan.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const next = structuredClone(manifest);
    next.assets.push({
      id: 'asset-1',
      drawingId: 'DRW-001',
      title: 'Plan',
      relativePath: '03-CAD-and-Technical-Drawings/Drawings/plan.svg',
      description: '',
      revision: 'A',
      modelUnit: '',
      sizeBytes: 10,
      fileModifiedAt: null,
      importedAt: '2026-11-24T12:00:00.000Z'
    });
    expect((await svc.saveManifest(session, next, { manual: true })).ok).toBe(true);
    await svc.closeSession(session);

    const moved = path.join(tmp, 'moved', 'Renamed-Project');
    await mkdir(path.dirname(moved));
    await rename(root, moved);
    const res = await svc.openProject(moved);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    sessions.push(res.session);
    expect(res.warnings).toEqual([]);
    expect(res.manifest.assets[0]!.relativePath).toBe('03-CAD-and-Technical-Drawings/Drawings/plan.svg');
    expect(res.manifest.project.id).toBe(manifest.project.id);
    const stats = await statMany(moved, [res.manifest.assets[0]!.relativePath]);
    expect(stats[res.manifest.assets[0]!.relativePath]!.exists).toBe(true);
  });

  it('reports missing referenced files on open', async () => {
    const { session, manifest, root } = await createOpen();
    const next = structuredClone(manifest);
    next.assets.push({
      id: 'asset-missing',
      drawingId: '',
      title: 'Gone',
      relativePath: '03-CAD-and-Technical-Drawings/gone.pdf',
      description: '',
      revision: '',
      modelUnit: '',
      sizeBytes: 0,
      fileModifiedAt: null,
      importedAt: '2026-11-24T12:00:00.000Z'
    });
    await svc.saveManifest(session, next, { manual: false });
    await svc.closeSession(session);
    const res = await svc.openProject(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    sessions.push(res.session);
    expect(res.warnings.join(' ')).toContain('03-CAD-and-Technical-Drawings/gone.pdf');
  });

  it('rejects invalid manifests without writing', async () => {
    const { session, manifest, root } = await createOpen();
    const before = await sha256OfFile(path.join(root, MANIFEST));
    const bad = structuredClone(manifest) as unknown as { project: { title: string } };
    bad.project.title = '';
    const res = await svc.saveManifest(session, bad as unknown as ProjectManifest, { manual: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('invalid');
    expect(await sha256OfFile(path.join(root, MANIFEST))).toBe(before);
  });

  it('serialises concurrent saves: final file equals the last manifest', async () => {
    const { session, manifest, root } = await createOpen();
    const promises = Array.from({ length: 10 }, (_, i) => svc.saveManifest(session, edited(manifest, `v${i}`), { manual: i % 3 === 0 }));
    const results = await Promise.all(promises);
    expect(results.every((r) => r.ok)).toBe(true);
    const final = JSON.parse(await readFile(path.join(root, MANIFEST), 'utf8')) as ProjectManifest;
    expect(final.requirements[0]!.title).toBe('Requirement v9');
    for (const name of await readdir(backupsDir(root))) {
      const content = await readFile(path.join(backupsDir(root), name), 'utf8');
      expect(ProjectManifestSchema.safeParse(JSON.parse(content)).success).toBe(true);
    }
  });
});

describe('backups', () => {
  it('creates a backup on manual save and prunes to retention', async () => {
    retention = 3;
    const { session, manifest, root } = await createOpen();
    for (let i = 0; i < 6; i++) {
      const res = await svc.saveManifest(session, edited(manifest, `m${i}`), { manual: true });
      expect(res.ok).toBe(true);
    }
    const names = (await readdir(backupsDir(root))).filter((n) => n.startsWith('manifest-'));
    expect(names.length).toBe(3);
    const listed = await listBackups(root);
    expect(listed.every((b) => b.valid)).toBe(true);
    expect(listed[0]!.projectTitle).toBe('Fixture Footbridge');
  });

  it('autosave backs up at most once per interval', async () => {
    const { session, manifest, root } = await createOpen();
    await svc.saveManifest(session, edited(manifest, 'a1'), { manual: false });
    await svc.saveManifest(session, edited(manifest, 'a2'), { manual: false });
    await svc.saveManifest(session, edited(manifest, 'a3'), { manual: false });
    const names = (await readdir(backupsDir(root))).filter((n) => n.startsWith('manifest-'));
    expect(names.length).toBe(1);
  });
});

describe('corruption and recovery', () => {
  it('reports invalid with backups, recovers and preserves the corrupted copy', async () => {
    const { session, manifest, root } = await createOpen();
    await svc.saveManifest(session, edited(manifest, 'good-1'), { manual: true });
    await svc.saveManifest(session, edited(manifest, 'good-2'), { manual: true });
    await svc.closeSession(session);
    const garbage = '{ "schemaVersion": 1, "project": { truncated';
    await writeFile(path.join(root, MANIFEST), garbage);

    const res = await svc.openProject(root);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('invalid');
    expect(res.recovery?.backups.length).toBeGreaterThan(0);
    const backup = res.recovery!.backups[0]!;
    expect(backup.valid).toBe(true);

    await expect(svc.recover(root, '../framelytix-project.json')).resolves.toMatchObject({ ok: false });
    const rec = await svc.recover(root, backup.fileName);
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    sessions.push(rec.session);
    expect(rec.manifest.requirements[0]!.title).toBe('Requirement good-1');
    const corrupted = (await readdir(backupsDir(root))).filter((n) => n.startsWith('corrupted-'));
    expect(corrupted.length).toBe(1);
    expect(await readFile(path.join(backupsDir(root), corrupted[0]!), 'utf8')).toBe(garbage);
  });

  it('rejects a future schema version without touching the file', async () => {
    const { session, manifest, root } = await createOpen();
    await svc.closeSession(session);
    const future = { ...structuredClone(manifest), schemaVersion: 99 };
    const file = path.join(root, MANIFEST);
    await writeFile(file, JSON.stringify(future, null, 2));
    const before = await readFile(file);
    const res = await svc.openProject(root);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('future-version');
    expect(Buffer.compare(await readFile(file), before)).toBe(0);
    await expect(access(path.join(root, '.framelytix', 'lock.json'))).rejects.toThrow();
  });

  it('reports legacy-only folders clearly', async () => {
    const dir = path.join(tmp, 'Legacy');
    await mkdir(dir);
    await writeFile(path.join(dir, 'structura-project.json'), '{}');
    const res = await svc.openProject(dir);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/legacy/i);
  });
});

describe('external modification', () => {
  it('detects conflicts and force-save backs up the external version', async () => {
    const { session, manifest, root } = await createOpen();
    const file = path.join(root, MANIFEST);
    const external = JSON.parse(await readFile(file, 'utf8')) as ProjectManifest;
    external.project.description = 'Changed in another editor';
    const externalText = JSON.stringify(external, null, 2) + '\n';
    await writeFile(file, externalText);

    const res = await svc.saveManifest(session, edited(manifest, 'mine'), { manual: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('conflict');
    expect(await readFile(file, 'utf8')).toBe(externalText);

    const forced = await svc.saveManifest(session, edited(manifest, 'mine'), { manual: false, force: true });
    expect(forced.ok).toBe(true);
    const ext = (await readdir(backupsDir(root))).filter((n) => n.startsWith('external-'));
    expect(ext.length).toBe(1);
    expect(await readFile(path.join(backupsDir(root), ext[0]!), 'utf8')).toBe(externalText);
    const saved = JSON.parse(await readFile(file, 'utf8')) as ProjectManifest;
    expect(saved.requirements[0]!.title).toBe('Requirement mine');
  });

  it('reload adopts the external version', async () => {
    const { session, root } = await createOpen();
    const file = path.join(root, MANIFEST);
    const external = JSON.parse(await readFile(file, 'utf8')) as ProjectManifest;
    external.project.summary = 'External summary';
    await writeFile(file, JSON.stringify(external));
    const r = await svc.reload(session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.project.summary).toBe('External summary');
    if (r.ok) expect((await svc.saveManifest(session, r.manifest, { manual: false })).ok).toBe(true);
  });
});

describe('locking', () => {
  async function prepared(): Promise<string> {
    const { session, root } = await createOpen();
    await svc.closeSession(session);
    sessions.splice(sessions.indexOf(session), 1);
    return root;
  }
  const lockFile = (root: string) => path.join(root, '.framelytix', 'lock.json');
  const writeLock = (root: string, lock: object) => writeFile(lockFile(root), JSON.stringify(lock));

  it('refuses a live lock held by another window (same pid, different instance)', async () => {
    const root = await prepared();
    await writeLock(root, { pid: process.pid, hostname: os.hostname(), appVersion: '0.1.0', acquiredAt: new Date().toISOString(), instanceId: 'other' });
    const res = await svc.openProject(root);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('locked');
      expect(res.message).toContain('another FrameLytix window');
    }
  });

  it('takes over a stale lock from a dead process with a warning', async () => {
    const root = await prepared();
    await writeLock(root, { pid: await deadPid(), hostname: os.hostname(), appVersion: '0.1.0', acquiredAt: new Date().toISOString(), instanceId: 'old' });
    const res = await svc.openProject(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    sessions.push(res.session);
    expect(res.warnings.join(' ')).toMatch(/stale lock/i);
    const lock = JSON.parse(await readFile(lockFile(root), 'utf8'));
    expect(lock.instanceId).toBe('test-instance-A');
  });

  it('respects a fresh foreign-host lock but takes over one older than 12 h', async () => {
    const root = await prepared();
    await writeLock(root, { pid: 1234, hostname: 'other-host', appVersion: '0.1.0', acquiredAt: new Date().toISOString(), instanceId: 'x' });
    const r1 = await svc.openProject(root);
    expect(r1.ok).toBe(false);
    await writeLock(root, { pid: 1234, hostname: 'other-host', appVersion: '0.1.0', acquiredAt: new Date(Date.now() - 13 * 3600_000).toISOString(), instanceId: 'x' });
    const r2 = await svc.openProject(root);
    expect(r2.ok).toBe(true);
    if (r2.ok) sessions.push(r2.session);
  });

  it('releases the lock on close', async () => {
    const { session, root } = await createOpen();
    await access(lockFile(root));
    await svc.closeSession(session);
    await expect(access(lockFile(root))).rejects.toThrow();
  });
});
