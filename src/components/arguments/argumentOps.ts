/**
 * Pure helpers for editing engineering arguments. All scoring and eligibility logic lives in
 * shared/utilities/decisionMatrix.ts; these helpers only mutate stored inputs.
 */
import type { ArgumentContent, ConstraintResult, EngineeringArgument } from '@shared/schemas/project';
import { DEFAULT_CRITERIA } from '@shared/utilities/projectFactory';
import { newId, nextCode } from '@shared/utilities/ids';

/** Edit callback: applies a recipe to the (draft) argument. */
export type EditFn = (recipe: (draft: ArgumentContent) => void) => void;

export function upsertScore(
  d: ArgumentContent,
  alternativeId: string,
  criterionId: string,
  patch: { score?: number | null; rationale?: string }
): void {
  const existing = d.matrix.scores.find((s) => s.alternativeId === alternativeId && s.criterionId === criterionId);
  if (existing) {
    if (patch.score !== undefined) existing.score = patch.score;
    if (patch.rationale !== undefined) existing.rationale = patch.rationale;
    return;
  }
  d.matrix.scores.push({
    alternativeId,
    criterionId,
    score: patch.score ?? null,
    rationale: patch.rationale ?? ''
  });
}

export function upsertEvaluation(
  d: ArgumentContent,
  alternativeId: string,
  requirementId: string,
  patch: { result?: ConstraintResult; justification?: string }
): void {
  const existing = d.constraintEvaluations.find((e) => e.alternativeId === alternativeId && e.requirementId === requirementId);
  if (existing) {
    if (patch.result !== undefined) existing.result = patch.result;
    if (patch.justification !== undefined) existing.justification = patch.justification;
    return;
  }
  d.constraintEvaluations.push({
    alternativeId,
    requirementId,
    result: patch.result ?? 'unverified',
    justification: patch.justification ?? ''
  });
}

export function removeAlternative(d: ArgumentContent, alternativeId: string): void {
  d.alternatives = d.alternatives.filter((a) => a.id !== alternativeId);
  d.matrix.scores = d.matrix.scores.filter((s) => s.alternativeId !== alternativeId);
  d.constraintEvaluations = d.constraintEvaluations.filter((e) => e.alternativeId !== alternativeId);
  if (d.selectedAlternativeId === alternativeId) d.selectedAlternativeId = null;
}

export function removeCriterion(d: ArgumentContent, criterionId: string): void {
  d.matrix.criteria = d.matrix.criteria.filter((c) => c.id !== criterionId);
  d.matrix.scores = d.matrix.scores.filter((s) => s.criterionId !== criterionId);
}

/** Default shape for a new argument (matches the project explorer). */
export function makeNewArgument(existingCodes: string[], author: string, now: string): EngineeringArgument {
  return {
    id: newId(),
    code: nextCode('ARG', existingCodes),
    title: 'New engineering argument',
    problemStatement: '',
    objective: '',
    alternatives: [],
    matrix: {
      scaleMin: 1,
      scaleMax: 5,
      criteria: DEFAULT_CRITERIA.map((c) => ({ id: newId(), name: c.name, weight: c.weight, description: c.description ?? '' })),
      scores: []
    },
    constraintEvaluations: [],
    assumptions: [],
    evidenceSummary: '',
    selectedAlternativeId: null,
    selectionRationale: '',
    justification: '',
    risksAndLimitations: '',
    references: [],
    author,
    reviewer: '',
    revision: 'REV-A',
    status: 'draft',
    archived: false,
    createdAt: now,
    modifiedAt: now,
    revisions: []
  };
}

/** Deep copy with fresh ids, next code, "(copy)" title, cleared revisions and draft status. */
export function duplicateArgument(source: EngineeringArgument, existingCodes: string[], now: string): EngineeringArgument {
  const copy = JSON.parse(JSON.stringify(source)) as EngineeringArgument;
  const altMap = new Map<string, string>();
  const critMap = new Map<string, string>();
  copy.id = newId();
  copy.code = nextCode('ARG', existingCodes);
  copy.title = `${source.title} (copy)`;
  copy.alternatives = copy.alternatives.map((a) => {
    const id = newId();
    altMap.set(a.id, id);
    return { ...a, id };
  });
  copy.matrix.criteria = copy.matrix.criteria.map((c) => {
    const id = newId();
    critMap.set(c.id, id);
    return { ...c, id };
  });
  copy.matrix.scores = copy.matrix.scores.map((s) => ({
    ...s,
    alternativeId: altMap.get(s.alternativeId) ?? s.alternativeId,
    criterionId: critMap.get(s.criterionId) ?? s.criterionId
  }));
  copy.constraintEvaluations = copy.constraintEvaluations.map((e) => ({
    ...e,
    alternativeId: altMap.get(e.alternativeId) ?? e.alternativeId
  }));
  copy.selectedAlternativeId = source.selectedAlternativeId ? (altMap.get(source.selectedAlternativeId) ?? null) : null;
  copy.revisions = [];
  copy.revision = 'REV-A';
  copy.status = 'draft';
  copy.archived = false;
  copy.createdAt = now;
  copy.modifiedAt = now;
  return copy;
}
