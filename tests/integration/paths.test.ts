import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isBlockedExtension, isInside, PathSecurityError, resolveInsideRoot } from '../../electron/security/paths';
import { buildTree } from '../../electron/services/fileService';
import { makeTempDir, removeTempDir } from './helpers';

/** Detect whether this machine/user can create junctions (dirs) / symlinks. */
async function canCreateLink(): Promise<boolean> {
  const dir = await makeTempDir();
  try {
    await mkdir(path.join(dir, 'target'));
    await symlink(path.join(dir, 'target'), path.join(dir, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  } finally {
    await removeTempDir(dir);
  }
}
const linksSupported = await canCreateLink();

let tmp: string;
let root: string;
let outside: string;

beforeEach(async () => {
  tmp = await makeTempDir();
  root = path.join(tmp, 'project');
  outside = path.join(tmp, 'outside');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(outside);
  await writeFile(path.join(outside, 'secret.txt'), 'secret');
  await writeFile(path.join(root, 'docs', 'a.txt'), 'a');
});

afterEach(async () => {
  await removeTempDir(tmp);
});

describe('resolveInsideRoot', () => {
  it('resolves normal relative paths (existing and not yet existing)', async () => {
    const a = await resolveInsideRoot(root, 'docs/a.txt');
    expect(a.toLowerCase()).toContain(path.join('project', 'docs', 'a.txt').toLowerCase());
    const b = await resolveInsideRoot(root, 'docs/new/deeper/file.txt');
    expect(isInside(await realpath(root), b)).toBe(true);
    expect(await resolveInsideRoot(root, '')).toBeTruthy();
  });

  it.each([
    '../x',
    '..\\x',
    'docs/../../x',
    'docs\\..\\..\\x',
    '/etc/passwd',
    '\\x',
    'C:\\x',
    'C:x',
    'c:/Windows',
    '\\\\server\\share',
    '//server/share',
    '\\\\?\\C:\\Windows',
    'docs/a.txt\0.png',
    'docs/a.txt:stream',
    'docs/.. /x',
    '...'
  ])('rejects %j', async (bad) => {
    await expect(resolveInsideRoot(root, bad)).rejects.toBeInstanceOf(PathSecurityError);
  });

  it.skipIf(!linksSupported)('rejects junction/symlink escapes and the tree skips links', async () => {
    await symlink(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(resolveInsideRoot(root, 'link/secret.txt')).rejects.toBeInstanceOf(PathSecurityError);
    await expect(resolveInsideRoot(root, 'link')).rejects.toBeInstanceOf(PathSecurityError);
    await expect(resolveInsideRoot(root, 'link/new-file.txt')).rejects.toBeInstanceOf(PathSecurityError);
    const tree = await buildTree(root);
    expect(tree.children?.map((c) => c.name)).not.toContain('link');
  });
});

describe('blocked extensions', () => {
  it('blocks executables and scripts, allows documents and MATLAB .m', () => {
    for (const n of ['setup.exe', 'RUN.BAT', 'x.ps1', 'a.js', 'b.lnk', 'c.pdf.exe', 'd.exe.', 'e.exe ', 'f.appref-ms', 'g.iso']) {
      expect(isBlockedExtension(n), n).toBe(true);
    }
    for (const n of ['drawing.dwg', 'model.stl', 'calc.m', 'report.pdf', 'data.csv', 'README']) {
      expect(isBlockedExtension(n), n).toBe(false);
    }
  });
});

describe('isInside', () => {
  it('handles prefixes and case on Windows', () => {
    expect(isInside(path.join(os.tmpdir(), 'abc'), path.join(os.tmpdir(), 'abcd'))).toBe(false);
    expect(isInside(path.join(os.tmpdir(), 'abc'), path.join(os.tmpdir(), 'abc', '..', 'x'))).toBe(false);
    expect(isInside(path.join(os.tmpdir(), 'abc'), path.join(os.tmpdir(), 'abc', '..foo'))).toBe(true);
    if (process.platform === 'win32') {
      expect(isInside('C:\\Data\\Proj', 'c:\\data\\proj\\file.txt')).toBe(true);
    }
  });
});
