import type { ArgumentContent, EngineeringArgument, Revision } from '../schemas/project';

/** Bijective base-26: 0→REV-A, 25→REV-Z, 26→REV-AA. */
export function revisionCode(index: number): string {
  let n = Math.max(0, Math.floor(index)) + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `REV-${letters}`;
}

function revisionIndex(code: string): number | null {
  const letters = /^REV-([A-Z]+)$/.exec(code)?.[1];
  if (letters === undefined) return null;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function nextRevisionCode(existing: string[]): string {
  let max = -1;
  for (const c of existing) {
    const i = revisionIndex(c);
    if (i !== null && i > max) max = i;
  }
  return revisionCode(max + 1);
}

export function stripArgument(arg: EngineeringArgument): ArgumentContent {
   
  const { revisions: _revisions, ...content } = arg;
  return structuredClone(content);
}

export interface RevisionOptions {
  author: string;
  summary: string;
  now: string;
  id: string;
}

/** Record the current state as a revision and move the argument on to the next revision code. */
export function issueRevision(arg: EngineeringArgument, opts: RevisionOptions): EngineeringArgument {
  const recorded: Revision = {
    id: opts.id,
    code: arg.revision,
    timestamp: opts.now,
    author: opts.author,
    summary: opts.summary,
    snapshot: stripArgument(arg)
  };
  const next = structuredClone(arg);
  const codes = [arg.revision, ...arg.revisions.map((r) => r.code)];
  next.revisions = [...structuredClone(arg.revisions), recorded];
  next.revision = nextRevisionCode(codes);
  next.modifiedAt = opts.now;
  return next;
}

/** Restore a prior snapshot, first recording the current state. History is never removed. */
export function restoreRevision(
  arg: EngineeringArgument,
  revisionId: string,
  opts: { author: string; now: string; id: string }
): EngineeringArgument {
  const target = arg.revisions.find((r) => r.id === revisionId);
  if (!target) throw new Error(`Revision ${revisionId} was not found.`);
  const withSnapshot = issueRevision(arg, {
    author: opts.author,
    summary: `Automatic snapshot before restoring ${target.code}`,
    now: opts.now,
    id: opts.id
  });
  const snap = structuredClone(target.snapshot);
  return {
    ...snap,
    id: arg.id,
    code: arg.code,
    createdAt: arg.createdAt,
    revision: withSnapshot.revision,
    revisions: withSnapshot.revisions,
    modifiedAt: opts.now,
    status: 'draft'
  };
}

const MATERIAL_FIELDS = [
  'title',
  'problemStatement',
  'objective',
  'alternatives',
  'matrix',
  'constraintEvaluations',
  'assumptions',
  'selectedAlternativeId',
  'selectionRationale',
  'justification',
  'risksAndLimitations'
] as const;

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export function isMaterialChange(prev: ArgumentContent, next: ArgumentContent): boolean {
  return MATERIAL_FIELDS.some((f) => stableStringify(prev[f]) !== stableStringify(next[f]));
}

/** An approved argument that is materially edited must be re-reviewed. */
export function applyApprovalGuard<T extends ArgumentContent>(prev: ArgumentContent, next: T): T {
  if (prev.status === 'approved' && next.status === 'approved' && isMaterialChange(prev, next)) {
    return { ...next, status: 'under-review' };
  }
  return next;
}

export interface ArgumentDiffEntry {
  field: string;
  label: string;
  before: string;
  after: string;
}

const LABELS: Record<(typeof MATERIAL_FIELDS)[number], string> = {
  title: 'Title',
  problemStatement: 'Problem statement',
  objective: 'Objective',
  alternatives: 'Alternatives',
  matrix: 'Decision matrix',
  constraintEvaluations: 'Constraint evaluations',
  assumptions: 'Assumptions',
  selectedAlternativeId: 'Selected alternative',
  selectionRationale: 'Selection rationale',
  justification: 'Justification',
  risksAndLimitations: 'Risks and limitations'
};

function summariseAlternatives(c: ArgumentContent): string {
  return c.alternatives.length === 0 ? '(none)' : c.alternatives.map((a) => a.name).join('; ');
}

function summariseMatrix(c: ArgumentContent): string {
  const m = c.matrix;
  const crit = m.criteria.length === 0 ? 'no criteria' : m.criteria.map((k) => `${k.name} (${k.weight}%)`).join('; ');
  const scored = m.scores.filter((s) => s.score !== null).length;
  return `Criteria: ${crit}. ${scored} score${scored === 1 ? '' : 's'} entered.`;
}

function summariseEvaluations(c: ArgumentContent): string {
  const counts: Record<string, number> = {};
  for (const e of c.constraintEvaluations) counts[e.result] = (counts[e.result] ?? 0) + 1;
  const parts = Object.keys(counts)
    .sort()
    .map((k) => `${counts[k]} ${k}`);
  return parts.length ? parts.join(', ') : '(none)';
}

function describe(field: (typeof MATERIAL_FIELDS)[number], c: ArgumentContent): string {
  switch (field) {
    case 'alternatives':
      return summariseAlternatives(c);
    case 'matrix':
      return summariseMatrix(c);
    case 'constraintEvaluations':
      return summariseEvaluations(c);
    case 'assumptions':
      return c.assumptions.length ? c.assumptions.join('; ') : '(none)';
    case 'selectedAlternativeId': {
      if (c.selectedAlternativeId === null) return '(none)';
      return c.alternatives.find((a) => a.id === c.selectedAlternativeId)?.name ?? c.selectedAlternativeId;
    }
    default: {
      const v = c[field];
      return typeof v === 'string' && v !== '' ? v : '(empty)';
    }
  }
}

export function diffArguments(a: ArgumentContent, b: ArgumentContent): ArgumentDiffEntry[] {
  const out: ArgumentDiffEntry[] = [];
  for (const field of MATERIAL_FIELDS) {
    if (stableStringify(a[field]) !== stableStringify(b[field])) {
      out.push({ field, label: LABELS[field], before: describe(field, a), after: describe(field, b) });
    }
  }
  return out;
}
