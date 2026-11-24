import { ChevronRight } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore, navigate } from '@/stores/uiStore';
import { PHASE_LABELS, type WorkspaceRoute } from '@/lib/navigation';
import type { ProjectManifest } from '@shared/schemas/project';

function crumbs(route: WorkspaceRoute, m: ProjectManifest): { label: string; route?: WorkspaceRoute }[] {
  const phase1 = { label: 'Phase 1 — Scope and Requirements', route: { view: 'requirements' } as WorkspaceRoute };
  const phase2 = { label: 'Phase 2 — Engineering Arguments', route: { view: 'arguments' } as WorkspaceRoute };
  const phase3 = { label: 'Phase 3 — CAD and Drawings', route: { view: 'assets' } as WorkspaceRoute };
  const phase4 = { label: PHASE_LABELS.phase4.replace('Phase 4 — ', 'Phase 4 — ') };
  switch (route.view) {
    case 'overview':
      return [{ label: 'Project Overview' }];
    case 'requirements': {
      const r = route.id ? m.requirements.find((x) => x.id === route.id) : undefined;
      const sectionLabel = route.section ? m.project.sectionLabels[route.section] : 'All requirements';
      return [phase1, { label: sectionLabel, route: route.section ? { view: 'requirements', section: route.section } : undefined }, ...(r ? [{ label: `${r.code} ${r.title}` }] : [])];
    }
    case 'arguments':
      return [phase2, { label: 'All arguments' }];
    case 'argument': {
      const a = m.arguments.find((x) => x.id === route.id);
      return [phase2, { label: a ? `${a.code} ${a.title}` : 'Argument not found' }];
    }
    case 'calculations': {
      const c = route.id ? m.calculations.find((x) => x.id === route.id) : undefined;
      return [phase2, { label: 'Supporting calculations', route: { view: 'calculations' } }, ...(c ? [{ label: `${c.code} ${c.title}` }] : [])];
    }
    case 'evidence':
      return [phase2, { label: 'Verification evidence' }];
    case 'assets':
      return [phase3, { label: 'Technical asset register' }];
    case 'file': {
      const parts = route.path.split('/');
      return [phase3, ...parts.slice(1, -1).map((p) => ({ label: p.replace(/-/g, ' ') })), { label: parts[parts.length - 1] ?? route.path }];
    }
    case 'traceability':
      return [phase4, { label: 'Requirements Traceability' }];
    case 'risks':
      return [phase4, { label: 'Risk Register' }];
    case 'review':
      return [phase4, { label: 'Review Checklist' }];
    case 'report':
      return [phase4, { label: 'Report Preview' }];
    case 'exports':
      return [phase4, { label: 'Export History' }];
  }
}

export function Breadcrumbs() {
  const manifest = useProjectStore((s) => s.manifest);
  const route = useUiStore((s) => s.route);
  if (!manifest) return null;
  const items = [{ label: manifest.project.identifier, route: { view: 'overview' } as WorkspaceRoute }, ...crumbs(route, manifest)];
  return (
    <nav aria-label="Breadcrumb" className="flex h-8 shrink-0 items-center gap-1 overflow-hidden border-b border-gunmetal bg-obsidian px-4 text-2xs text-silver">
      <ol className="flex min-w-0 items-center gap-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRight size={11} className="shrink-0 text-dim" aria-hidden="true" /> : null}
              {c.route && !last ? (
                <button type="button" onClick={() => navigate(c.route!)} className={i === 0 ? 'font-mono hover:text-white' : 'truncate hover:text-white'}>
                  {c.label}
                </button>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'truncate text-white' : 'truncate'}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
