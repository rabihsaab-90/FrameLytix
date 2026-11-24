import type { ProjectManifest } from '@shared/schemas/project';
import type { Issue } from '@shared/utilities/issues';
import { routeForEntity } from './entities';
import type { WorkspaceRoute } from './navigation';

/** Maps an automatically detected issue to the workspace route that lets the user fix it (or null when it has no target). */
export function routeForIssue(issue: Issue, manifest: ProjectManifest): WorkspaceRoute | null {
  const target = issue.target;
  if (!target) return null;
  switch (target.view) {
    case 'overview':
      return { view: 'overview' };
    case 'requirements':
      return target.id ? { view: 'requirements', id: target.id } : { view: 'requirements' };
    case 'argument':
      return target.id ? { view: 'argument', id: target.id } : { view: 'arguments' };
    case 'calculation':
      return target.id ? { view: 'calculations', id: target.id } : { view: 'calculations' };
    case 'asset':
      return target.id ? routeForEntity(manifest, { type: 'asset', id: target.id }) : { view: 'assets' };
    case 'traceability':
      return { view: 'traceability' };
    case 'risks':
      return target.id ? { view: 'risks', id: target.id } : { view: 'risks' };
    case 'review':
      return { view: 'review' };
    case 'report':
      return { view: 'report' };
  }
}
