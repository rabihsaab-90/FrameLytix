import type { RequirementSection } from '@shared/schemas/project';

/** Top-level screens. */
export type Screen = 'welcome' | 'onboarding' | 'workspace' | 'settings';

/** Workspace routes. Every view is reachable from the project explorer or by links. */
export type WorkspaceRoute =
  | { view: 'overview' }
  | { view: 'requirements'; section?: RequirementSection; id?: string }
  | { view: 'arguments' }
  | { view: 'argument'; id: string }
  | { view: 'calculations'; id?: string }
  | { view: 'evidence'; id?: string }
  | { view: 'assets'; folder?: string }
  | { view: 'file'; path: string }
  | { view: 'traceability' }
  | { view: 'risks'; id?: string }
  | { view: 'review' }
  | { view: 'report' }
  | { view: 'exports' };

export type WorkspaceView = WorkspaceRoute['view'];

export function routeKey(route: WorkspaceRoute): string {
  return JSON.stringify(route);
}

export function sameRoute(a: WorkspaceRoute, b: WorkspaceRoute): boolean {
  return routeKey(a) === routeKey(b);
}

export const PHASE_LABELS = {
  phase1: 'Phase 1 — Project Scope and Requirements',
  phase2: 'Phase 2 — Engineering Arguments',
  phase3: 'Phase 3 — CAD and Technical Drawings',
  phase4: 'Phase 4 — Design Review and Export'
} as const;
