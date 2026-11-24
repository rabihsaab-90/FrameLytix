import type { ReviewCategory } from '../schemas/project';

export type IssueSeverity = 'critical' | 'warning' | 'info';

export interface NavTarget {
  view: 'overview' | 'requirements' | 'argument' | 'calculation' | 'asset' | 'traceability' | 'risks' | 'review' | 'report';
  id?: string;
}

export interface Issue {
  /** Deterministic, e.g. 'req-no-evidence:<reqId>'. */
  id: string;
  severity: IssueSeverity;
  category: ReviewCategory;
  message: string;
  target?: NavTarget;
}

const ORDER: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Stable sort: critical → warning → info, original order otherwise preserved. */
export function sortIssues(issues: Issue[]): Issue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((x, y) => ORDER[x.issue.severity] - ORDER[y.issue.severity] || x.index - y.index)
    .map((x) => x.issue);
}
