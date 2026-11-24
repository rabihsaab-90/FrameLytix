/**
 * Display metadata for enumerations: Canadian English labels, tone (colour family) and
 * a lucide icon name so status is never communicated by colour alone.
 */
import type {
  ArgumentStatus,
  ConstraintResult,
  EvidenceOutcome,
  Priority,
  RequirementClassification,
  RequirementStatus,
  ReviewCategory,
  ReviewItemStatus,
  RiskStatus,
  VerificationMethod
} from '@shared/schemas/project';

export type Tone = 'neutral' | 'crimson' | 'amber' | 'emerald' | 'info';

export interface EnumMeta {
  label: string;
  tone: Tone;
  icon: string;
  description?: string;
}

export const REQUIREMENT_STATUS: Record<RequirementStatus, EnumMeta> = {
  'not-started': { label: 'Not Started', tone: 'neutral', icon: 'Circle' },
  'in-progress': { label: 'In Progress', tone: 'amber', icon: 'CircleDashed' },
  verified: { label: 'Verified', tone: 'emerald', icon: 'CircleCheck', description: 'User-recorded verification' },
  'needs-revision': { label: 'Needs Revision', tone: 'crimson', icon: 'CircleAlert' },
  'not-applicable': { label: 'Not Applicable', tone: 'neutral', icon: 'CircleSlash' }
};

export const CLASSIFICATION: Record<RequirementClassification, EnumMeta> = {
  mandatory: {
    label: 'Mandatory constraint',
    tone: 'crimson',
    icon: 'ShieldAlert',
    description: 'Must be satisfied. A failing alternative is ineligible regardless of score.'
  },
  objective: { label: 'Design objective', tone: 'info', icon: 'Target', description: 'Should be achieved as well as practical.' },
  preference: { label: 'Preference', tone: 'neutral', icon: 'Star', description: 'Desirable but optional.' }
};

export const PRIORITY: Record<Priority, EnumMeta> = {
  high: { label: 'High', tone: 'crimson', icon: 'ChevronsUp' },
  medium: { label: 'Medium', tone: 'amber', icon: 'ChevronUp' },
  low: { label: 'Low', tone: 'neutral', icon: 'ChevronDown' }
};

export const VERIFICATION_METHOD: Record<VerificationMethod, string> = {
  calculation: 'Calculation',
  inspection: 'Inspection',
  analysis: 'Analysis',
  'physical-test': 'Physical test',
  simulation: 'Simulation',
  'document-review': 'Document review',
  other: 'Other'
};

export const ARGUMENT_STATUS: Record<ArgumentStatus, EnumMeta> = {
  draft: { label: 'Draft', tone: 'amber', icon: 'FilePen' },
  'under-review': { label: 'Under Review', tone: 'info', icon: 'FileSearch' },
  approved: {
    label: 'Approved',
    tone: 'emerald',
    icon: 'FileCheck',
    description: 'Internal documentation status only — not professional certification.'
  },
  'needs-revision': { label: 'Needs Revision', tone: 'crimson', icon: 'FileWarning' }
};

export const CONSTRAINT_RESULT: Record<ConstraintResult, EnumMeta> = {
  pass: { label: 'Pass', tone: 'emerald', icon: 'Check' },
  fail: { label: 'Fail', tone: 'crimson', icon: 'X' },
  unverified: { label: 'Unverified', tone: 'amber', icon: 'HelpCircle' },
  'not-applicable': { label: 'Not applicable', tone: 'neutral', icon: 'Minus', description: 'Requires a justification' }
};

export const ELIGIBILITY: Record<'eligible' | 'provisional' | 'ineligible', EnumMeta> = {
  eligible: { label: 'Eligible', tone: 'emerald', icon: 'ShieldCheck', description: 'Passes all mandatory constraints.' },
  provisional: {
    label: 'Provisional',
    tone: 'amber',
    icon: 'ShieldQuestion',
    description: 'One or more mandatory constraints are unverified.'
  },
  ineligible: {
    label: 'Ineligible',
    tone: 'crimson',
    icon: 'ShieldX',
    description: 'Fails at least one mandatory constraint. Cannot be the preferred valid design.'
  }
};

export const RISK_STATUS: Record<RiskStatus, EnumMeta> = {
  open: { label: 'Open', tone: 'crimson', icon: 'CircleAlert' },
  mitigating: { label: 'Mitigating', tone: 'amber', icon: 'ShieldHalf' },
  accepted: { label: 'Accepted', tone: 'info', icon: 'Handshake' },
  closed: { label: 'Closed', tone: 'emerald', icon: 'CircleCheck' }
};

export const RISK_LEVEL: Record<'low' | 'medium' | 'high' | 'critical', EnumMeta> = {
  low: { label: 'Low', tone: 'emerald', icon: 'SignalLow' },
  medium: { label: 'Medium', tone: 'amber', icon: 'SignalMedium' },
  high: { label: 'High', tone: 'crimson', icon: 'SignalHigh' },
  critical: { label: 'Critical', tone: 'crimson', icon: 'Siren' }
};

export const REVIEW_CATEGORY: Record<ReviewCategory, string> = {
  scope: 'Scope and requirements',
  decisions: 'Engineering decisions',
  constraints: 'Mandatory constraints',
  assumptions: 'Assumptions',
  calculations: 'Calculations',
  evidence: 'Supporting evidence',
  drawings: 'Technical drawings',
  risks: 'Risk documentation',
  references: 'References',
  reporting: 'Final reporting'
};

export const REVIEW_STATUS: Record<ReviewItemStatus, EnumMeta> = {
  open: { label: 'Open', tone: 'amber', icon: 'Square' },
  complete: { label: 'Complete', tone: 'emerald', icon: 'SquareCheck' },
  'not-applicable': { label: 'Not applicable', tone: 'neutral', icon: 'SquareMinus' }
};

export const EVIDENCE_OUTCOME: Record<EvidenceOutcome, EnumMeta> = {
  supports: { label: 'Supports', tone: 'emerald', icon: 'ThumbsUp' },
  inconclusive: { label: 'Inconclusive', tone: 'amber', icon: 'Scale' },
  'does-not-support': { label: 'Does not support', tone: 'crimson', icon: 'ThumbsDown' }
};

export const DISCIPLINE_LABEL: Record<string, string> = {
  civil: 'Civil Engineering',
  mechanical: 'Mechanical Engineering',
  aerospace: 'Aerospace Engineering',
  electrical: 'Electrical Engineering',
  custom: 'Custom Discipline'
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}
