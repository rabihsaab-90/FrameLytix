import { ReportSectionKeySchema, type ReportSectionKey } from '@shared/schemas/project';

/** Canonical section order. Labels mirror shared/report/buildReport.ts (kept local so the renderer does not bundle the report builder and KaTeX). */
export const REPORT_SECTION_KEYS: ReportSectionKey[] = [...ReportSectionKeySchema.options];

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, string> = {
  cover: 'Cover page',
  metadata: 'Project metadata',
  summary: 'Executive summary',
  scope: 'Scope and description',
  criteria: 'Design criteria',
  requirements: 'Requirements',
  arguments: 'Engineering arguments',
  calculations: 'Calculations',
  traceability: 'Requirements traceability',
  risks: 'Risk register',
  revisions: 'Revision history',
  drawings: 'Drawings and models',
  review: 'Design review',
  outstanding: 'Outstanding items',
  references: 'References',
  disclaimer: 'Disclaimer and limitations'
};
