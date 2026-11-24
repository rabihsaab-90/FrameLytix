import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PathSecurityError } from '../../electron/security/paths';
import { buildTree, createFolder, createProjectWatcher, ImportService, statMany } from '../../electron/services/fileService';
import { sha256 } from '../../electron/services/fsUtils';
import { makeTempDir, removeTempDir, sha256OfFile, waitFor } from './helpers';

let tmp: string;
let root: string;
let src: string;
let imports: ImportService;

beforeEach(async () => {
  tmp = await makeTempDir();
  root = path.join(tmp, 'project');
  src = path.join(tmp, 'source');
  await mkdir(path.join(root, 'drawings'), { recursive: true });
  await mkdir(path.join(root, '.framelytix', 'backups'), { recursive: true });
  await writeFile(path.join(root, 'framelytix-project.json'), '{}');
  await mkdir(src);
  await writeFile(path.join(src, 'plan.pdf'), 'PDF-v1');
  await writeFile(path.join(src, 'notes.txt'), 'notes');
  await writeFile(path.join(src, 'calc.m'), 'x = 1;');
  await writeFile(path.join(src, 'evil.exe'), 'MZ');
  await mkdir(path.join(src, 'folder'));
  imports = new ImportService();
});

afterEach(async () => {
  await removeTempDir(tmp);
});

const s = (n: string) => path.join(src, n);

describe('import', () => {
  it('imports plain files, rejects blocked types and folders, never alters originals', async () => {
    const before = await Promise.all(['plan.pdf', 'notes.txt', 'calc.m'].map((n) => sha256OfFile(s(n))));
    const plan = await imports.planImport(root, [s('plan.pdf'), s('notes.txt'), s('calc.m'), s('evil.exe'), s('folder'), s('missing.txt')], 'drawings');
    expect(plan.items.map((i) => i.rejected)).toEqual([false, false, false, true, true, true]);
    expect(plan.items[3]!.rejectReason).toMatch(/blocked/);
    const result = await imports.commitImport(root, plan.token, {});
    expect(result.imported.map((i) => i.relativePath).sort()).toEqual(['drawings/calc.m', 'drawings/notes.txt', 'drawings/plan.pdf']);
    expect(result.errors.length).toBe(3);
    expect(await readFile(path.join(root, 'drawings', 'plan.pdf'), 'utf8')).toBe('PDF-v1');
    const after = await Promise.all(['plan.pdf', 'notes.txt', 'calc.m'].map((n) => sha256OfFile(s(n))));
    expect(after).toEqual(before);
    // Tokens are single-use.
    await expect(imports.commitImport(root, plan.token, {})).rejects.toBeInstanceOf(PathSecurityError);
  });

  it('detects identical collisions; default decision is skip (never overwrite)', async () => {
    await writeFile(path.join(root, 'drawings', 'plan.pdf'), 'PDF-v1');
    const p1 = await imports.planImport(root, [s('plan.pdf')], 'drawings');
    expect(p1.items[0]).toMatchObject({ collision: true, identical: true });

    await writeFile(path.join(root, 'drawings', 'plan.pdf'), 'EXISTING');
    const p2 = await imports.planImport(root, [s('plan.pdf')], 'drawings');
    expect(p2.items[0]).toMatchObject({ collision: true, identical: false });
    const r2 = await imports.commitImport(root, p2.token, {});
    expect(r2.skipped).toEqual(['plan.pdf']);
    expect(await readFile(path.join(root, 'drawings', 'plan.pdf'), 'utf8')).toBe('EXISTING');
  });

  it('keep-both picks "name (2).ext", "name (3).ext"', async () => {
    await writeFile(path.join(root, 'drawings', 'plan.pdf'), 'EXISTING');
    for (const expected of ['drawings/plan (2).pdf', 'drawings/plan (3).pdf']) {
      const p = await imports.planImport(root, [s('plan.pdf')], 'drawings');
      const r = await imports.commitImport(root, p.token, { 0: 'keep-both' });
      expect(r.imported.map((i) => i.relativePath)).toEqual([expected]);
    }
    expect(await readFile(path.join(root, 'drawings', 'plan.pdf'), 'utf8')).toBe('EXISTING');
  });

  it('replace overwrites only when explicitly chosen', async () => {
    await writeFile(path.join(root, 'drawings', 'plan.pdf'), 'EXISTING');
    const srcHash = await sha256OfFile(s('plan.pdf'));
    const p = await imports.planImport(root, [s('plan.pdf')], 'drawings');
    const r = await imports.commitImport(root, p.token, { 0: 'replace' });
    expect(r.imported.length).toBe(1);
    expect(await sha256OfFile(path.join(root, 'drawings', 'plan.pdf'))).toBe(srcHash);
    expect(await sha256OfFile(s('plan.pdf'))).toBe(srcHash);
  });

  it('rejects destinations outside the project', async () => {
    await expect(imports.planImport(root, [s('plan.pdf')], '../source')).rejects.toBeInstanceOf(PathSecurityError);
    await expect(imports.planImport(root, [s('plan.pdf')], 'C:\\Windows')).rejects.toBeInstanceOf(PathSecurityError);
  });
});

describe('tree, stats and folders', () => {
  it('skips .framelytix and the manifest; dirs first; natural sort', async () => {
    await writeFile(path.join(root, 'file10.txt'), '');
    await writeFile(path.join(root, 'file2.txt'), '');
    await writeFile(path.join(root, 'framelytix-project.json.tmp'), '');
    const tree = await buildTree(root);
    const names = tree.children!.map((c) => c.name);
    expect(names).toEqual(['drawings', 'file2.txt', 'file10.txt']);
    expect(tree.children![0]!.relativePath).toBe('drawings');
  });

  it('statMany reports invalid and missing paths as not existing', async () => {
    await writeFile(path.join(root, 'drawings', 'a.txt'), 'abc');
    const r = await statMany(root, ['drawings/a.txt', '../source/plan.pdf', 'nope.txt']);
    expect(r['drawings/a.txt']).toMatchObject({ exists: true, isFile: true, sizeBytes: 3 });
    expect(r['../source/plan.pdf']!.exists).toBe(false);
    expect(r['nope.txt']!.exists).toBe(false);
  });

  it('createFolder validates names and never overwrites', async () => {
    expect(await createFolder(root, 'drawings', 'Sub')).toEqual({ ok: true, relativePath: 'drawings/Sub' });
    expect((await createFolder(root, 'drawings', 'Sub')).ok).toBe(false);
    expect((await createFolder(root, '', 'bad|name')).ok).toBe(false);
    expect((await createFolder(root, '../x', 'ok')).ok).toBe(false);
  });
});

describe('watcher', () => {
  it('reports file changes and only external manifest changes', async () => {
    const manifestFile = path.join(root, 'framelytix-project.json');
    let known = sha256('{}');
    const changes: string[][] = [];
    let manifestChanges = 0;
    const w = createProjectWatcher(root, {
      onChange: (p) => changes.push(p),
      onManifestChange: () => manifestChanges++,
      getLastKnownHash: () => known,
      debounceMs: 100
    });
    try {
      await new Promise((r) => setTimeout(r, 200));
      await writeFile(path.join(root, 'drawings', 'new.txt'), 'x');
      expect(await waitFor(() => changes.flat().some((p) => p.includes('new.txt')))).toBe(true);

      // "Our own" save: hash matches → no notification.
      known = sha256('{"own":true}');
      await writeFile(manifestFile, '{"own":true}');
      await new Promise((r) => setTimeout(r, 600));
      expect(manifestChanges).toBe(0);

      await writeFile(manifestFile, '{"external":true}');
      expect(await waitFor(() => manifestChanges > 0)).toBe(true);
      expect(changes.flat()).not.toContain('framelytix-project.json');
    } finally {
      w.close();
    }
  });
});
