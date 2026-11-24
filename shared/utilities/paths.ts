/** Pure path and file-name helpers (POSIX project-relative paths). No Node `path` dependency. */

/**
 * Normalise a user/relative path to a project-relative POSIX path.
 * Returns null for empty, absolute (/x, C:\, \\server) or traversal ('..') paths.
 */
export function normaliseRelativePath(input: string): string | null {
  if (typeof input !== 'string') return null;
  let p = input.trim().replace(/\\/g, '/');
  if (p === '') return null;
  // Absolute: leading slash (also covers UNC \\server → //server) or drive letter.
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null;
  p = p.replace(/\/{2,}/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  p = p.replace(/\/+$/, '');
  if (p === '' || p === '.') return null;
  const segments = p.split('/').filter((s) => s !== '.');
  if (segments.length === 0) return null;
  if (segments.some((s) => s === '..')) return null;
  return segments.join('/');
}

export function joinRelative(...parts: string[]): string {
  const segs: string[] = [];
  for (const part of parts) {
    for (const s of part.replace(/\\/g, '/').split('/')) {
      if (s !== '' && s !== '.') segs.push(s);
    }
  }
  return segs.join('/');
}

export function fileNameOf(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i >= 0 ? rel.slice(i + 1) : rel;
}

/** Lowercase extension without the dot ('' when none). */
export function extensionOf(rel: string): string {
  const name = fileNameOf(rel);
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
}

export function dirnameOf(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i >= 0 ? rel.slice(0, i) : '';
}

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** Returns an error message, or null when the name is acceptable on Windows, macOS and Linux. */
export function validateFileName(name: string): string | null {
  if (typeof name !== 'string' || name.trim() === '') return 'The name cannot be empty.';
  if (name.length > 255) return 'The name must be 255 characters or fewer.';
  if (name === '.' || name === '..') return 'The name cannot be “.” or “..”.';
  if (/[<>:"/\\|?*]/.test(name)) return 'The name cannot contain any of these characters: < > : " / \\ | ? *';
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 32) return 'The name cannot contain control characters.';
  }
  if (/[. ]$/.test(name)) return 'The name cannot end with a dot or a space.';
  const stem = (name.split('.')[0] ?? '').trim();
  if (RESERVED.test(stem)) return `“${stem}” is a reserved name on Windows. Choose a different name.`;
  return null;
}

/** 'Pedestrian Truss Bridge — Concept!' → 'Pedestrian-Truss-Bridge-Concept'. */
export function toFolderName(title: string): string {
  const folded = (title ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return folded === '' ? 'FrameLytix-Project' : folded;
}

/** 2–40 characters: letters, digits, dash, underscore, dot; must start with a letter or digit. */
export function validateProjectIdentifier(id: string): string | null {
  if (typeof id !== 'string' || id.length < 2 || id.length > 40) return 'The identifier must be 2 to 40 characters long.';
  if (!/^[A-Za-z0-9]/.test(id)) return 'The identifier must start with a letter or digit.';
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return 'The identifier may only contain letters, digits, dashes, underscores and dots.';
  return null;
}

export type AssetKind = 'image' | 'svg' | 'pdf' | 'stl' | 'native-cad' | 'text' | 'spreadsheet' | 'matlab' | 'other';

/** Classify by lowercase extension (with or without a leading dot). */
export function assetKind(ext: string): AssetKind {
  const e = ext.replace(/^\./, '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(e)) return 'image';
  if (e === 'svg') return 'svg';
  if (e === 'pdf') return 'pdf';
  if (e === 'stl') return 'stl';
  if (['dwg', 'dxf', 'step', 'stp', 'iges', 'igs', 'sldprt', 'sldasm', 'slddrw', 'ipt', 'iam', 'f3d', '3dm', 'skp'].includes(e)) {
    return 'native-cad';
  }
  if (['txt', 'md', 'log', 'json'].includes(e)) return 'text';
  if (['csv', 'xlsx', 'xls', 'ods'].includes(e)) return 'spreadsheet';
  if (e === 'm' || e === 'mat' || e === 'slx') return 'matlab';
  return 'other';
}

/** Kinds the in-app viewer can render directly. */
export const previewableKinds: readonly AssetKind[] = ['image', 'svg', 'pdf', 'stl', 'text'];
