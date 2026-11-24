/**
 * Weighted decision matrix with mandatory-constraint eligibility.
 *
 * Scores use the matrix scale (default 1–5) where higher is always more favourable
 * (including cost). Missing scores are never treated as zero: an alternative with any
 * missing score on a weighted criterion is incomplete and has no weighted score.
 */
import type {
  ArgumentContent,
  Criterion,
  DecisionMatrix,
  ProjectManifest,
  Requirement
} from '../schemas/project';

export type Eligibility = 'eligible' | 'provisional' | 'ineligible';

export interface AlternativeResult {
  alternativeId: string;
  name: string;
  /** null when the alternative is incomplete or the weights are invalid. */
  weightedScore: number | null;
  complete: boolean;
  missingCount: number;
  invalidCount: number;
  eligibility: Eligibility;
  failedRequirementIds: string[];
  unverifiedRequirementIds: string[];
  isHighestScore: boolean;
  isRecommended: boolean;
  isSelected: boolean;
}

export interface WeightIssue {
  kind: 'negative' | 'non-finite' | 'zero-total' | 'not-100' | 'no-criteria';
  message: string;
  criterionId?: string;
}

export interface MatrixResult {
  alternatives: AlternativeResult[];
  weightTotal: number;
  weightsValid: boolean;
  weightIssues: WeightIssue[];
  highestScoreIds: string[];
  recommendedIds: string[];
  recommendedIsProvisional: boolean;
  tie: boolean;
  selectedId: string | null;
  selectionDiffersFromRecommendation: boolean;
  selectionNeedsRationale: boolean;
  selectionIsIneligible: boolean;
  mandatoryRequirementIds: string[];
  messages: string[];
}

const WEIGHT_TOTAL_TOLERANCE = 0.01;
const SCORE_TIE_TOLERANCE = 1e-9;

/** Two-decimal display string; full precision is retained in results. */
export function formatScore(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

export function getScore(matrix: DecisionMatrix, altId: string, critId: string): number | null {
  const entry = matrix.scores.find((s) => s.alternativeId === altId && s.criterionId === critId);
  return entry ? entry.score : null;
}

function maxIds(items: { id: string; score: number }[]): string[] {
  if (items.length === 0) return [];
  const max = Math.max(...items.map((i) => i.score));
  return items.filter((i) => max - i.score <= SCORE_TIE_TOLERANCE).map((i) => i.id);
}

export function computeMatrix(
  argument: ArgumentContent,
  mandatoryRequirements: Requirement[],
  weightOverrides?: Record<string, number>
): MatrixResult {
  const { matrix } = argument;
  const criteria = matrix.criteria.map((c) => ({
    ...c,
    weight: weightOverrides?.[c.id] ?? c.weight
  }));

  // ---- weights ----
  const weightIssues: WeightIssue[] = [];
  let structurallyValid = true;
  if (criteria.length === 0) {
    weightIssues.push({ kind: 'no-criteria', message: 'The matrix has no criteria yet. Add at least one weighted criterion.' });
    structurallyValid = false;
  }
  for (const c of criteria) {
    if (!Number.isFinite(c.weight)) {
      weightIssues.push({
        kind: 'non-finite',
        criterionId: c.id,
        message: `The weight for “${c.name}” is not a finite number.`
      });
      structurallyValid = false;
    } else if (c.weight < 0) {
      weightIssues.push({
        kind: 'negative',
        criterionId: c.id,
        message: `The weight for “${c.name}” is negative. Weights must be zero or greater.`
      });
      structurallyValid = false;
    }
  }
  const weightTotal = criteria.reduce((sum, c) => sum + (Number.isFinite(c.weight) ? c.weight : 0), 0);
  if (structurallyValid && criteria.length > 0 && weightTotal <= 0) {
    weightIssues.push({ kind: 'zero-total', message: 'The criterion weights add up to zero, so no weighted score can be calculated.' });
    structurallyValid = false;
  }
  if (structurallyValid && Math.abs(weightTotal - 100) > WEIGHT_TOTAL_TOLERANCE) {
    weightIssues.push({
      kind: 'not-100',
      message: `The criterion weights total ${trimNumber(weightTotal)}% rather than 100%. Scores are still calculated as Σ(score × weight) ÷ Σ(weight); normalise the weights to make them easier to compare.`
    });
  }
  const weightsValid = structurallyValid;

  // ---- mandatory requirement lookups ----
  const reqById = new Map(mandatoryRequirements.map((r) => [r.id, r]));
  const messages: string[] = weightIssues.map((w) => w.message);
  const reqLabel = (id: string): string => reqById.get(id)?.code ?? id;

  // ---- per-alternative evaluation ----
  const alternatives: AlternativeResult[] = argument.alternatives.map((alt) => {
    let missingCount = 0;
    let invalidCount = 0;
    let weightedSum = 0;
    let usedWeight = 0;
    for (const c of criteria) {
      if (!(Number.isFinite(c.weight) && c.weight > 0)) continue;
      const score = getScore(matrix, alt.id, c.id);
      if (score === null) {
        missingCount++;
      } else if (!Number.isFinite(score) || score < matrix.scaleMin || score > matrix.scaleMax) {
        invalidCount++;
      } else {
        weightedSum += score * c.weight;
        usedWeight += c.weight;
      }
    }
    const hasWeightedCriteria = criteria.some((c) => Number.isFinite(c.weight) && c.weight > 0);
    const complete = hasWeightedCriteria && missingCount === 0 && invalidCount === 0;
    const weightedScore = complete && weightsValid && usedWeight > 0 ? weightedSum / usedWeight : null;

    const failed: string[] = [];
    const unverified: string[] = [];
    for (const req of mandatoryRequirements) {
      const ev = argument.constraintEvaluations.find(
        (e) => e.alternativeId === alt.id && e.requirementId === req.id
      );
      if (!ev || ev.result === 'unverified') {
        unverified.push(req.id);
      } else if (ev.result === 'fail') {
        failed.push(req.id);
      } else if (ev.result === 'not-applicable' && ev.justification.trim() === '') {
        unverified.push(req.id);
        messages.push(
          `${alt.name} marks ${req.code} as not applicable without a justification, so it is treated as unverified.`
        );
      }
    }
    const eligibility: Eligibility = failed.length > 0 ? 'ineligible' : unverified.length > 0 ? 'provisional' : 'eligible';

    return {
      alternativeId: alt.id,
      name: alt.name,
      weightedScore,
      complete,
      missingCount,
      invalidCount,
      eligibility,
      failedRequirementIds: failed,
      unverifiedRequirementIds: unverified,
      isHighestScore: false,
      isRecommended: false,
      isSelected: false
    };
  });

  // ---- ranking ----
  const scored = alternatives.filter((a) => a.weightedScore !== null);
  const highestScoreIds = maxIds(scored.map((a) => ({ id: a.alternativeId, score: a.weightedScore as number })));

  const eligible = scored.filter((a) => a.eligibility === 'eligible');
  const provisional = scored.filter((a) => a.eligibility === 'provisional');
  let recommendedIsProvisional = false;
  let pool = eligible;
  if (eligible.length === 0 && provisional.length > 0) {
    pool = provisional;
    recommendedIsProvisional = true;
  }
  const recommendedIds = maxIds(pool.map((a) => ({ id: a.alternativeId, score: a.weightedScore as number })));
  const tie = recommendedIds.length > 1;

  // ---- selection ----
  const selectedId =
    argument.selectedAlternativeId !== null && argument.alternatives.some((a) => a.id === argument.selectedAlternativeId)
      ? argument.selectedAlternativeId
      : null;
  const selectionDiffersFromRecommendation = selectedId !== null && !recommendedIds.includes(selectedId);
  const selectionNeedsRationale = selectionDiffersFromRecommendation && argument.selectionRationale.trim() === '';
  const selectedResult = alternatives.find((a) => a.alternativeId === selectedId);
  const selectionIsIneligible = selectedResult?.eligibility === 'ineligible';

  for (const a of alternatives) {
    a.isHighestScore = highestScoreIds.includes(a.alternativeId);
    a.isRecommended = recommendedIds.includes(a.alternativeId);
    a.isSelected = a.alternativeId === selectedId;
  }

  // ---- messages ----
  for (const a of alternatives) {
    if (!a.complete && (a.missingCount > 0 || a.invalidCount > 0)) {
      const parts: string[] = [];
      if (a.missingCount > 0) parts.push(`${a.missingCount} missing score${a.missingCount === 1 ? '' : 's'}`);
      if (a.invalidCount > 0) parts.push(`${a.invalidCount} out-of-range or invalid score${a.invalidCount === 1 ? '' : 's'}`);
      messages.push(`${a.name} is incomplete (${parts.join(', ')}); no weighted score is shown.`);
    }
    if (a.eligibility === 'ineligible') {
      const codes = a.failedRequirementIds.map(reqLabel).join(', ');
      if (a.isHighestScore) {
        messages.push(`${a.name} has the highest weighted score but fails ${codes} and is ineligible.`);
      } else {
        messages.push(`${a.name} fails ${codes} and is ineligible.`);
      }
    } else if (a.eligibility === 'provisional' && a.unverifiedRequirementIds.length > 0) {
      messages.push(
        `${a.name} is provisional: ${a.unverifiedRequirementIds.map(reqLabel).join(', ')} ${a.unverifiedRequirementIds.length === 1 ? 'is' : 'are'} not yet verified.`
      );
    }
  }
  if (recommendedIds.length > 0) {
    const names = alternatives.filter((a) => a.isRecommended).map((a) => a.name);
    if (tie) {
      messages.push(`Tie: ${names.join(' and ')} have the same highest weighted score among eligible options. Document the reason for the choice.`);
    } else if (recommendedIsProvisional) {
      messages.push(`${names[0]} has the highest score among remaining options, but the recommendation is provisional until mandatory constraints are verified.`);
    }
  } else if (alternatives.length > 0 && scored.length > 0) {
    messages.push('No alternative is currently eligible for recommendation.');
  }
  if (selectedId !== null) {
    const name = selectedResult?.name ?? 'The selected alternative';
    if (selectionIsIneligible) {
      messages.push(`${name} is selected but fails a mandatory constraint and is ineligible.`);
    }
    if (selectionNeedsRationale) {
      messages.push(`${name} differs from the recommended alternative; a selection rationale is required.`);
    }
  }

  return {
    alternatives,
    weightTotal,
    weightsValid,
    weightIssues,
    highestScoreIds,
    recommendedIds,
    recommendedIsProvisional,
    tie,
    selectedId,
    selectionDiffersFromRecommendation,
    selectionNeedsRationale,
    selectionIsIneligible,
    mandatoryRequirementIds: mandatoryRequirements.map((r) => r.id),
    messages
  };
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

/**
 * Scale non-negative finite weights so they total exactly 100.0 with one decimal place.
 * Negative / non-finite weights become 0 first; an all-zero set is distributed equally.
 */
export function normaliseWeights(criteria: Criterion[]): Criterion[] {
  const n = criteria.length;
  if (n === 0) return [];
  const cleaned = criteria.map((c) => (Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0));
  const total = cleaned.reduce((a, b) => a + b, 0);
  let tenths: number[];
  if (total <= 0) {
    const base = Math.floor(1000 / n);
    const remainder = 1000 - base * n;
    tenths = cleaned.map((_, i) => (i === 0 ? base + remainder : base));
  } else {
    tenths = cleaned.map((w) => Math.round((w * 1000) / total));
    const diff = 1000 - tenths.reduce((a, b) => a + b, 0);
    let largest = 0;
    tenths.forEach((t, i) => {
      if (t > (tenths[largest] ?? 0)) largest = i;
    });
    tenths = tenths.map((t, i) => (i === largest ? t + diff : t));
  }
  return criteria.map((c, i) => ({ ...c, weight: (tenths[i] ?? 0) / 10 }));
}

/** Non-archived mandatory requirements linked (either direction) to the argument. */
export function mandatoryRequirementsForArgument(manifest: ProjectManifest, argumentId: string): Requirement[] {
  const ids = new Set<string>();
  for (const l of manifest.links) {
    if (l.a.type === 'argument' && l.a.id === argumentId && l.b.type === 'requirement') ids.add(l.b.id);
    else if (l.b.type === 'argument' && l.b.id === argumentId && l.a.type === 'requirement') ids.add(l.a.id);
  }
  return manifest.requirements.filter((r) => ids.has(r.id) && !r.archived && r.classification === 'mandatory');
}
