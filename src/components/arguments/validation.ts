/** Derived (never stored) list of documentation gaps for an argument. */
import type { ArgumentContent, Requirement } from '@shared/schemas/project';
import { computeMatrix, type MatrixResult } from '@shared/utilities/decisionMatrix';

export type SectionId =
  | 'problem'
  | 'requirements'
  | 'alternatives'
  | 'matrix'
  | 'constraints'
  | 'summary'
  | 'sensitivity'
  | 'assumptions'
  | 'calculations'
  | 'evidence'
  | 'justification'
  | 'risks'
  | 'references'
  | 'revisions';

export interface ArgumentIssue {
  id: string;
  message: string;
  section: SectionId;
}

export function argumentIssues(arg: ArgumentContent, mandatory: Requirement[], result?: MatrixResult): ArgumentIssue[] {
  const r = result ?? computeMatrix(arg, mandatory);
  const out: ArgumentIssue[] = [];
  if (arg.problemStatement.trim() === '') out.push({ id: 'problem', message: 'The problem statement is empty.', section: 'problem' });
  if (arg.alternatives.length < 2) out.push({ id: 'alts', message: 'Fewer than two alternatives are defined.', section: 'alternatives' });
  const incomplete = r.alternatives.filter((a) => !a.complete);
  if (incomplete.length > 0) {
    out.push({ id: 'matrix', message: `The decision matrix is incomplete (${incomplete.map((a) => a.name).join(', ')}).`, section: 'matrix' });
  }
  if (!r.weightsValid) out.push({ id: 'weights', message: r.weightIssues[0]?.message ?? 'Criterion weights are invalid.', section: 'matrix' });
  else if (r.weightIssues.some((w) => w.kind === 'not-100')) {
    out.push({ id: 'weights', message: `Weights total ${Math.round(r.weightTotal * 1000) / 1000}% rather than 100%.`, section: 'matrix' });
  }
  const unverified = r.alternatives.reduce((n, a) => n + a.unverifiedRequirementIds.length, 0);
  if (mandatory.length > 0 && unverified > 0) {
    out.push({ id: 'unverified', message: `${unverified} mandatory constraint evaluation${unverified === 1 ? ' is' : 's are'} unverified.`, section: 'constraints' });
  }
  const naMissing = arg.constraintEvaluations.filter(
    (e) => e.result === 'not-applicable' && e.justification.trim() === '' && mandatory.some((m) => m.id === e.requirementId)
  ).length;
  if (naMissing > 0) {
    out.push({ id: 'na', message: `${naMissing} “not applicable” constraint evaluation${naMissing === 1 ? ' has' : 's have'} no justification.`, section: 'constraints' });
  }
  if (r.selectedId === null && arg.alternatives.length > 0) out.push({ id: 'noselect', message: 'No alternative has been selected.', section: 'summary' });
  if (r.selectionIsIneligible) out.push({ id: 'inelig', message: 'The selected alternative fails a mandatory constraint.', section: 'summary' });
  if (r.selectionNeedsRationale) out.push({ id: 'rationale', message: 'The selection differs from the recommendation and has no selection rationale.', section: 'summary' });
  if (arg.justification.trim() === '') out.push({ id: 'justification', message: 'The final engineering justification is empty.', section: 'justification' });
  if (arg.assumptions.filter((a) => a.trim() !== '').length === 0) out.push({ id: 'assumptions', message: 'No key assumptions are recorded.', section: 'assumptions' });
  return out;
}
