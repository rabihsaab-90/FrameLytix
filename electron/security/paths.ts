/**
 * Path containment for every renderer-initiated file operation.
 *
 * The renderer only ever sends project-RELATIVE paths. `resolveInsideRoot` rejects anything
 * that could escape the project root (absolute paths, drive letters, UNC/device paths, `..`,
 * NUL bytes, NTFS alternate data streams) and then canonicalises the deepest existing
 * ancestor with `realpath`, so symbolic links and NTFS junctions that point outside the
 * root are rejected as well.
 *
 * Plain Node only (no `electron` import) so it can be integration-tested.
 */
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { extensionOf } from '../../shared/utilities/paths';

export class PathSecurityError extends Error {
  readonly code = 'PATH_SECURITY';
  constructor(message = 'The path is outside the project folder or is not allowed.') {
    super(message);
    this.name = 'PathSecurityError';
  }
}

const isWin = process.platform === 'win32';

function cmp(p: string): string {
  return isWin ? p.toLowerCase() : p;
}

/** True when `candidate` is `root` itself or inside it (lexical check on already-absolute paths). */
export function isInside(root: string, candidate: string): boolean {
  const r = path.resolve(root);
  const c = path.resolve(candidate);
  const rel = path.relative(cmp(r), cmp(c));
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith('..' + path.sep);
}

/** Compare two absolute paths for equality (case-insensitive on Windows). */
export function samePath(a: string, b: string): boolean {
  return cmp(path.resolve(a)) === cmp(path.resolve(b));
}

/**
 * Validate and split a project-relative path into safe segments. '' and '.' mean the root.
 * Throws PathSecurityError for anything suspicious.
 */
export function safeSegments(relativePath: string): string[] {
  if (typeof relativePath !== 'string') throw new PathSecurityError();
  if (relativePath.length > 1024) throw new PathSecurityError('The path is too long.');
  if (relativePath.includes('\0')) throw new PathSecurityError();
  const raw = relativePath;
  if (raw === '' || raw === '.') return [];
  // Absolute POSIX, absolute/UNC/device Windows paths (\\server\share, \\?\C:\, //x), drive letters.
  if (/^[\\/]/.test(raw) || /^[A-Za-z]:/.test(raw) || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new PathSecurityError();
  }
  const segments = raw.split(/[\\/]+/).filter((s) => s !== '' && s !== '.');
  for (const seg of segments) {
    // '..', and Windows variants such as '.. ' or '...' that the OS may collapse.
    if (/^[. ]+$/.test(seg)) throw new PathSecurityError();
    // NTFS alternate data streams / drive-relative tricks.
    if (seg.includes(':')) throw new PathSecurityError();
    if (isWin && /[. ]$/.test(seg)) throw new PathSecurityError();
  }
  return segments;
}

function isMissing(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Resolve `relativePath` inside `root` and return the canonical absolute path.
 * The target itself need not exist; its deepest existing ancestor is canonicalised.
 */
export async function resolveInsideRoot(root: string, relativePath: string): Promise<string> {
  const segments = safeSegments(relativePath);
  let canonRoot: string;
  try {
    canonRoot = await realpath(root);
  } catch {
    throw new PathSecurityError('The project folder is no longer available.');
  }
  const candidate = path.resolve(canonRoot, ...segments);
  if (!isInside(canonRoot, candidate)) throw new PathSecurityError();

  let existing = candidate;
  const remainder: string[] = [];
  let canonical: string;
  for (;;) {
    try {
      canonical = await realpath(existing);
      break;
    } catch (err) {
      if (!isMissing(err)) throw new PathSecurityError();
      const parent = path.dirname(existing);
      if (parent === existing || !isInside(canonRoot, parent)) throw new PathSecurityError();
      remainder.unshift(path.basename(existing));
      existing = parent;
    }
  }
  const finalPath = remainder.length > 0 ? path.join(canonical, ...remainder) : canonical;
  if (!isInside(canonRoot, finalPath)) throw new PathSecurityError();
  return finalPath;
}

/** Convert an absolute path inside root to a project-relative POSIX path (null if outside). */
export function toRelativePosix(root: string, absolute: string): string | null {
  if (!isInside(root, absolute)) return null;
  const rel = path.relative(path.resolve(root), path.resolve(absolute));
  return rel.split(path.sep).join('/');
}

/**
 * File types that are never imported into a project and never opened with the system
 * handler, because opening them could execute code. MATLAB `.m` files are deliberately NOT
 * blocked: they are text; FrameLytix never runs them, and opening one hands it to the
 * associated editor (MATLAB opens .m files in its editor, it does not execute them).
 */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  // Windows executables, installers and script hosts
  'exe', 'msi', 'msp', 'mst', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'dll', 'ocx', 'sys', 'drv',
  'ps1', 'psm1', 'psd1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2',
  'vb', 'vbs', 'vbe', 'js', 'jse', 'ws', 'wsc', 'wsf', 'wsh', 'sct', 'shb', 'shs', 'hta', 'chm', 'hlp',
  'msc', 'gadget', 'application', 'appref-ms', 'xbap', 'jnlp', 'jar',
  'msix', 'msixbundle', 'appx', 'appxbundle', 'diagcab', 'inf', 'ins', 'isp', 'reg', 'scf',
  // Shortcuts and shell locations that can point anywhere
  'lnk', 'url', 'website', 'settingcontent-ms', 'library-ms', 'search-ms', 'searchconnector-ms',
  // Disk images that auto-mount
  'iso', 'img', 'vhd', 'vhdx',
  // macOS / Linux
  'app', 'command', 'sh', 'tool', 'pkg', 'mpkg', 'dmg', 'scpt', 'applescript', 'workflow', 'action',
  'terminal', 'prefpane', 'kext', 'desktop', 'run', 'appimage', 'deb', 'rpm'
]);

/** Extension as Windows would interpret it (trailing dots/spaces and ADS suffixes ignored). */
export function effectiveExtension(nameOrPath: string): string {
  let base = nameOrPath.split(/[\\/]/).pop() ?? '';
  const colon = base.indexOf(':');
  if (colon >= 0) base = base.slice(0, colon);
  base = base.replace(/[. ]+$/, '');
  return extensionOf(base);
}

export function isBlockedExtension(nameOrPath: string): boolean {
  return BLOCKED_EXTENSIONS.has(effectiveExtension(nameOrPath));
}

/**
 * Script files that may be imported (engineers keep analysis scripts with a project) but are
 * never handed to the system handler, because a default association can run them.
 */
export const OPEN_BLOCKED_SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set(['py', 'pyw', 'pyc', 'pyo', 'pyz', 'pl', 'rb']);

/** True when FrameLytix must not open this file with its associated application. */
export function isBlockedForOpen(nameOrPath: string): boolean {
  const ext = effectiveExtension(nameOrPath);
  return BLOCKED_EXTENSIONS.has(ext) || OPEN_BLOCKED_SCRIPT_EXTENSIONS.has(ext);
}
