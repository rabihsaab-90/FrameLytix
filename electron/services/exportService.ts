/** Report / CSV export helpers. Plain Node only. */
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectManifest } from '../../shared/schemas/project';
import { REPORT_IMAGE_EXTENSIONS } from '../../shared/report/buildReport';
import { extensionOf, toFolderName } from '../../shared/utilities/paths';
import { resolveInsideRoot } from '../security/paths';
import { writeFileAtomic } from './fsUtils';

export const MAX_REPORT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REPORT_IMAGES = 40;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml'
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `<folder-safe title>-Design-Report-YYYY-MM-DD.<ext>` using the local date. */
export function suggestReportFileName(manifest: ProjectManifest, ext: string, date: Date = new Date()): string {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${toFolderName(manifest.project.title)}-Design-Report-${d}.${ext.replace(/^\./, '')}`;
}

export async function writeHtmlReport(filePath: string, html: string): Promise<void> {
  await writeFileAtomic(filePath, html, { uniqueTemp: true });
}

/** Content is written as-is (the shared CSV builder already adds the UTF-8 BOM). */
export async function writeCsv(filePath: string, content: string): Promise<void> {
  await writeFileAtomic(filePath, content, { uniqueTemp: true });
}

/** Embed report images as data: URIs (bounded count and size; inside the project only). */
export async function collectReportImages(
  root: string,
  manifest: ProjectManifest
): Promise<{ images: Record<string, string>; missingAssetPaths: string[] }> {
  const allowed = new Set(REPORT_IMAGE_EXTENSIONS.map((e) => e.toLowerCase()));
  const images: Record<string, string> = {};
  const missingAssetPaths: string[] = [];
  let count = 0;
  for (const asset of manifest.assets) {
    const rel = asset.relativePath;
    let abs: string;
    let s;
    try {
      abs = await resolveInsideRoot(root, rel);
      s = await lstat(abs);
    } catch {
      missingAssetPaths.push(rel);
      continue;
    }
    if (!s.isFile()) {
      missingAssetPaths.push(rel);
      continue;
    }
    const ext = extensionOf(rel);
    if (!allowed.has(ext) || !MIME[ext]) continue;
    if (count >= MAX_REPORT_IMAGES || s.size > MAX_REPORT_IMAGE_BYTES || images[rel]) continue;
    try {
      const bytes = await readFile(abs);
      images[rel] = `data:${MIME[ext]};base64,${bytes.toString('base64')}`;
      count++;
    } catch {
      missingAssetPaths.push(rel);
    }
  }
  return { images, missingAssetPaths };
}

/** Files exported this session; export.open/reveal only act on these. */
export class ExportTracker {
  private readonly paths = new Set<string>();
  private key(p: string): string {
    const r = path.resolve(p);
    return process.platform === 'win32' ? r.toLowerCase() : r;
  }
  add(p: string): void {
    this.paths.add(this.key(p));
  }
  has(p: string): boolean {
    return typeof p === 'string' && path.isAbsolute(p) && this.paths.has(this.key(p));
  }
}
