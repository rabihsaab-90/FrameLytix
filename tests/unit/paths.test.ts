import { describe, expect, it } from 'vitest';
import {
  assetKind,
  dirnameOf,
  extensionOf,
  fileNameOf,
  joinRelative,
  normaliseRelativePath,
  previewableKinds,
  toFolderName,
  validateFileName,
  validateProjectIdentifier
} from '../../shared/utilities/paths';

describe('normaliseRelativePath', () => {
  it('normalises separators, duplicates, leading ./ and trailing /', () => {
    expect(normaliseRelativePath('03-CAD\\drawings//a.dwg')).toBe('03-CAD/drawings/a.dwg');
    expect(normaliseRelativePath('./a/b/')).toBe('a/b');
    expect(normaliseRelativePath('.\\a')).toBe('a');
  });
  it.each(['', '   ', '/etc/passwd', 'C:\\Windows', 'c:/x', '\\\\server\\share\\f', '../x', 'a/../b', 'a/..', '..', '.', './'])(
    'rejects %j',
    (p) => {
      expect(normaliseRelativePath(p)).toBeNull();
    }
  );
});

describe('path helpers', () => {
  it('joins, splits and extracts extensions', () => {
    expect(joinRelative('a/', '/b', 'c.txt')).toBe('a/b/c.txt');
    expect(fileNameOf('a/b/c.STEP')).toBe('c.STEP');
    expect(extensionOf('a/b/c.STEP')).toBe('step');
    expect(extensionOf('a/b/.hidden')).toBe('');
    expect(extensionOf('a/b/noext')).toBe('');
    expect(dirnameOf('a/b/c.txt')).toBe('a/b');
    expect(dirnameOf('c.txt')).toBe('');
  });
});

describe('validateFileName', () => {
  it('accepts ordinary names', () => {
    expect(validateFileName('Bridge plan rev A.dwg')).toBeNull();
    expect(validateFileName('con_tract.txt')).toBeNull();
  });
  it.each([
    '', ' ', '.', '..', 'a<b', 'a>b', 'a:b', 'a"b', 'a/b', 'a\\b', 'a|b', 'a?b', 'a*b', 'bad\u0001name',
    'trailing.', 'trailing ', 'CON', 'con.txt', 'Nul.tar.gz', 'COM0', 'com9.log', 'LPT1', 'aux'
  ])('rejects %j', (n) => {
    expect(validateFileName(n)).not.toBeNull();
  });
  it('rejects names over 255 characters', () => {
    expect(validateFileName('a'.repeat(256))).not.toBeNull();
    expect(validateFileName('a'.repeat(255))).toBeNull();
  });
});

describe('toFolderName', () => {
  it('slugifies and folds accents', () => {
    expect(toFolderName('Pedestrian Truss Bridge — Concept!')).toBe('Pedestrian-Truss-Bridge-Concept');
    expect(toFolderName('Pont piétonnier Québec')).toBe('Pont-pietonnier-Quebec');
  });
  it('limits length and falls back', () => {
    const out = toFolderName('word '.repeat(40));
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('-')).toBe(false);
    expect(toFolderName('!!!')).toBe('FrameLytix-Project');
    expect(toFolderName('')).toBe('FrameLytix-Project');
  });
});

describe('validateProjectIdentifier', () => {
  it('accepts valid identifiers', () => {
    expect(validateProjectIdentifier('PTB-2026')).toBeNull();
    expect(validateProjectIdentifier('a.b_c-1')).toBeNull();
  });
  it.each(['', 'a', '-ab', '_ab', 'ab cd', 'ab/cd', 'a'.repeat(41)])('rejects %j', (id) => {
    expect(validateProjectIdentifier(id)).not.toBeNull();
  });
});

describe('assetKind', () => {
  it('classifies extensions', () => {
    expect(assetKind('png')).toBe('image');
    expect(assetKind('SVG')).toBe('svg');
    expect(assetKind('.pdf')).toBe('pdf');
    expect(assetKind('stl')).toBe('stl');
    expect(assetKind('dwg')).toBe('native-cad');
    expect(assetKind('step')).toBe('native-cad');
    expect(assetKind('txt')).toBe('text');
    expect(assetKind('xlsx')).toBe('spreadsheet');
    expect(assetKind('m')).toBe('matlab');
    expect(assetKind('zip')).toBe('other');
  });
  it('lists previewable kinds', () => {
    expect(previewableKinds).toContain('pdf');
    expect(previewableKinds).not.toContain('native-cad');
  });
});
