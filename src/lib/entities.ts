import type { EntityRef, EntityType, ProjectManifest } from '@shared/schemas/project';
import type { WorkspaceRoute } from './navigation';

export const ENTITY_LABEL: Record<EntityType, { singular: string; plural: string; icon: string }> = {
  requirement: { singular: 'Requirement', plural: 'Requirements', icon: 'ListChecks' },
  argument: { singular: 'Engineering argument', plural: 'Engineering arguments', icon: 'Scale' },
  calculation: { singular: 'Calculation', plural: 'Calculations', icon: 'Sigma' },
  asset: { singular: 'Technical asset', plural: 'Technical assets', icon: 'FileImage' },
  evidence: { singular: 'Verification evidence', plural: 'Verification evidence', icon: 'BadgeCheck' },
  risk: { singular: 'Risk', plural: 'Risks', icon: 'TriangleAlert' }
};

/** Route that displays a given record. */
export function routeForEntity(manifest: ProjectManifest, ref: EntityRef): WorkspaceRoute | null {
  switch (ref.type) {
    case 'requirement':
      return { view: 'requirements', id: ref.id };
    case 'argument':
      return { view: 'argument', id: ref.id };
    case 'calculation':
      return { view: 'calculations', id: ref.id };
    case 'evidence':
      return { view: 'evidence', id: ref.id };
    case 'risk':
      return { view: 'risks', id: ref.id };
    case 'asset': {
      const asset = manifest.assets.find((a) => a.id === ref.id);
      return asset ? { view: 'file', path: asset.relativePath } : null;
    }
  }
}

/** Records of a type that can be linked (non-archived), with code + title for pickers. */
export function linkableRecords(manifest: ProjectManifest, type: EntityType): { id: string; code: string; title: string }[] {
  switch (type) {
    case 'requirement':
      return manifest.requirements.filter((r) => !r.archived).map((r) => ({ id: r.id, code: r.code, title: r.title }));
    case 'argument':
      return manifest.arguments.filter((r) => !r.archived).map((r) => ({ id: r.id, code: r.code, title: r.title }));
    case 'calculation':
      return manifest.calculations.filter((r) => !r.archived).map((r) => ({ id: r.id, code: r.code, title: r.title }));
    case 'evidence':
      return manifest.evidence.map((r) => ({ id: r.id, code: r.code, title: r.title }));
    case 'risk':
      return manifest.risks.filter((r) => !r.archived).map((r) => ({ id: r.id, code: r.code, title: r.title }));
    case 'asset':
      return manifest.assets.map((a) => {
        const name = a.relativePath.split('/').pop() ?? a.relativePath;
        return { id: a.id, code: a.drawingId || name, title: a.title || name };
      });
  }
}
