/** Helpers that create / mutate asset records in the manifest (shared by import, register and file pages). */
import type { Draft } from 'immer';
import type { Asset, ProjectManifest } from '@shared/schemas/project';
import { newId } from '@shared/utilities/ids';
import { fileNameOf } from '@shared/utilities/paths';
import { removeLinksFor } from '@shared/utilities/traceability';

export function titleFromFileName(relativePath: string): string {
  const name = fileNameOf(relativePath);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function buildAsset(relativePath: string, sizeBytes: number, fileModifiedAt: string | null, now: string): Asset {
  return {
    id: newId(),
    drawingId: '',
    title: titleFromFileName(relativePath),
    relativePath,
    description: '',
    revision: '',
    modelUnit: '',
    sizeBytes: Math.max(0, Math.round(sizeBytes)),
    fileModifiedAt,
    importedAt: now
  };
}

/** Add a record for the path, or refresh size/modified when one already references it. Returns true when added. */
export function upsertAssetForFile(draft: Draft<ProjectManifest>, relativePath: string, sizeBytes: number, modifiedAt: string | null, now: string): boolean {
  const existing = draft.assets.find((a) => a.relativePath === relativePath);
  if (existing) {
    existing.sizeBytes = Math.max(0, Math.round(sizeBytes));
    existing.fileModifiedAt = modifiedAt;
    return false;
  }
  draft.assets.push(buildAsset(relativePath, sizeBytes, modifiedAt, now));
  return true;
}

/** Remove the register entry and every link to it. The file itself is never touched. */
export function removeAssetRecord(draft: Draft<ProjectManifest>, assetId: string): void {
  draft.assets = draft.assets.filter((a) => a.id !== assetId);
  draft.links = removeLinksFor(draft as unknown as ProjectManifest, { type: 'asset', id: assetId }).links as typeof draft.links;
}

/** Flatten the file tree into file nodes. */
export function flattenFiles<T extends { kind: 'file' | 'directory'; children?: T[] }>(root: T | null): T[] {
  const out: T[] = [];
  const walk = (n: T) => {
    if (n.kind === 'file') out.push(n);
    n.children?.forEach(walk);
  };
  if (root) walk(root);
  return out;
}
