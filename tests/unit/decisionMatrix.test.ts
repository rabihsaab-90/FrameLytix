import { describe, expect, it } from 'vitest';
import {
  computeMatrix,
  formatScore,
  getScore,
  mandatoryRequirementsForArgument,
  normaliseWeights
} from '../../shared/utilities/decisionMatrix';
import type { ConstraintEvaluation, EngineeringArgument, ScoreEntry } from '../../shared/schemas/project';
import { makeArgument, makeManifest, makeRequirement } from './fixtures/manifestFixture';

/** Scores: [altA crit1, altA crit2, altB crit1, altB crit2]. */
function scoresFor(a1: number | null, a2: number | null, b1: number | null, b2: number | null): ScoreEntry[] {
  const mk = (alt: string, crit: string, score: number | null): ScoreEntry => ({ alternativeId: alt, criterionId: crit, score, rationale: '' });
  return [mk('alt-a', 'crit-1', a1), mk('alt-a', 'crit-2', a2), mk('alt-b', 'crit-1', b1), mk('alt-b', 'crit-2', b2)];
}

function arg(scores: ScoreEntry[], extra: Partial<EngineeringArgument> = {}): EngineeringArgument {
  const base = makeArgument();
  return makeArgument({ matrix: { ...base.matrix, scores }, ...extra });
}

const ev = (alt: string, req: string, result: ConstraintEvaluation['result'], justification = ''): ConstraintEvaluation => ({
  alternativeId: alt, requirementId: req, result, justification
});

const r1 = makeRequirement({ id: 'q1', code: 'REQ-001' });
const r2 = makeRequirement({ id: 'q2', code: 'REQ-002' });

const byId = (res: ReturnType<typeof computeMatrix>, id: string) => res.alternatives.find((a) => a.alternativeId === id)!;

describe('weighted score arithmetic', () => {
  it('computes Σ(score × weight) / Σ(weight)', () => {
    // A: (4*40 + 5*60)/100 = 4.6 ; B: (3*40 + 2*60)/100 = 2.4
    const res = computeMatrix(arg(scoresFor(4, 5, 3, 2)), []);
    expect(res.weightsValid).toBe(true);
    expect(res.weightTotal).toBe(100);
    expect(byId(res, 'alt-a').weightedScore).toBeCloseTo(4.6, 10);
    expect(byId(res, 'alt-b').weightedScore).toBeCloseTo(2.4, 10);
    expect(res.highestScoreIds).toEqual(['alt-a']);
    expect(res.recommendedIds).toEqual(['alt-a']);
    expect(res.tie).toBe(false);
    expect(res.weightIssues).toEqual([]);
  });

  it('still computes by Σw when weights do not total 100, and flags it', () => {
    const base = makeArgument();
    const a = makeArgument({
      matrix: {
        ...base.matrix,
        criteria: [
          { id: 'crit-1', name: 'Cost', weight: 10, description: '' },
          { id: 'crit-2', name: 'Safety', weight: 30, description: '' }
        ],
        scores: scoresFor(4, 5, 3, 2)
      }
    });
    const res = computeMatrix(a, []);
    expect(res.weightsValid).toBe(true);
    expect(res.weightTotal).toBe(40);
    expect(res.weightIssues.map((w) => w.kind)).toEqual(['not-100']);
    // (4*10 + 5*30)/40 = 4.75
    expect(byId(res, 'alt-a').weightedScore).toBeCloseTo(4.75, 10);
  });

  it('accepts a total within 0.01 of 100 without an issue', () => {
    const res = computeMatrix(arg(scoresFor(4, 5, 3, 2)), [], { 'crit-1': 40.005 });
    expect(res.weightIssues).toEqual([]);
  });

  it('applies weight overrides without mutating the argument', () => {
    const a = arg(scoresFor(4, 5, 3, 2));
    const res = computeMatrix(a, [], { 'crit-1': 100, 'crit-2': 0 });
    expect(byId(res, 'alt-a').weightedScore).toBeCloseTo(4, 10);
    expect(a.matrix.criteria[0]!.weight).toBe(40);
  });

  it('does not require scores for zero-weight criteria', () => {
    const res = computeMatrix(arg(scoresFor(4, null, 3, null)), [], { 'crit-1': 100, 'crit-2': 0 });
    expect(byId(res, 'alt-a').complete).toBe(true);
    expect(byId(res, 'alt-a').weightedScore).toBe(4);
  });

  it('formatScore gives two decimals and a dash for null', () => {
    expect(formatScore(4.6)).toBe('4.60');
    expect(formatScore(3.14159)).toBe('3.14');
    expect(formatScore(null)).toBe('—');
    expect(getScore(arg(scoresFor(4, 5, 3, 2)).matrix, 'alt-a', 'crit-2')).toBe(5);
    expect(getScore(arg([]).matrix, 'alt-a', 'crit-2')).toBeNull();
  });
});

describe('weight validation', () => {
  const withWeights = (w1: number, w2: number) => {
    const base = makeArgument();
    return makeArgument({
      matrix: {
        ...base.matrix,
        criteria: [
          { id: 'crit-1', name: 'Cost', weight: w1, description: '' },
          { id: 'crit-2', name: 'Safety', weight: w2, description: '' }
        ],
        scores: scoresFor(4, 5, 3, 2)
      }
    });
  };

  it('rejects a negative weight', () => {
    const res = computeMatrix(withWeights(-10, 110), []);
    expect(res.weightsValid).toBe(false);
    expect(res.weightIssues).toContainEqual(expect.objectContaining({ kind: 'negative', criterionId: 'crit-1' }));
    expect(res.alternatives.every((a) => a.weightedScore === null)).toBe(true);
    expect(res.recommendedIds).toEqual([]);
  });

  it('rejects zero total weight', () => {
    const res = computeMatrix(withWeights(0, 0), []);
    expect(res.weightsValid).toBe(false);
    expect(res.weightIssues.map((w) => w.kind)).toContain('zero-total');
    expect(res.alternatives.every((a) => a.weightedScore === null)).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite weight %s', (bad) => {
    const res = computeMatrix(withWeights(bad, 50), []);
    expect(res.weightsValid).toBe(false);
    expect(res.weightIssues.map((w) => w.kind)).toContain('non-finite');
    expect(res.alternatives.every((a) => a.weightedScore === null)).toBe(true);
    expect(Number.isFinite(res.weightTotal)).toBe(true);
  });

  it('reports no-criteria', () => {
    const base = makeArgument();
    const res = computeMatrix(makeArgument({ matrix: { ...base.matrix, criteria: [], scores: [] } }), []);
    expect(res.weightsValid).toBe(false);
    expect(res.weightIssues.map((w) => w.kind)).toEqual(['no-criteria']);
    expect(res.alternatives.every((a) => !a.complete && a.weightedScore === null)).toBe(true);
  });
});

describe('missing and invalid scores', () => {
  it('keeps an alternative with a missing score incomplete (never zero)', () => {
    const res = computeMatrix(arg(scoresFor(5, null, 3, 2)), []);
    const a = byId(res, 'alt-a');
    expect(a.complete).toBe(false);
    expect(a.missingCount).toBe(1);
    expect(a.weightedScore).toBeNull();
    // B is complete and so is the only candidate, rather than A being ranked with a 0.
    expect(res.recommendedIds).toEqual(['alt-b']);
    expect(res.messages.some((m) => m.includes('Warren truss is incomplete'))).toBe(true);
  });

  it('counts a missing ScoreEntry the same as a null score', () => {
    const res = computeMatrix(arg([]), []);
    expect(byId(res, 'alt-a').missingCount).toBe(2);
    expect(res.recommendedIds).toEqual([]);
  });

  it('treats out-of-range and non-finite scores as invalid and incomplete', () => {
    const res = computeMatrix(arg(scoresFor(6, 5, 0, NaN)), []);
    expect(byId(res, 'alt-a')).toMatchObject({ invalidCount: 1, missingCount: 0, complete: false, weightedScore: null });
    expect(byId(res, 'alt-b')).toMatchObject({ invalidCount: 2, complete: false, weightedScore: null });
  });

  it('accepts fractional scores inside the scale and the bounds themselves', () => {
    const res = computeMatrix(arg(scoresFor(1, 5, 2.5, 3.5)), []);
    expect(byId(res, 'alt-a').complete).toBe(true);
    expect(byId(res, 'alt-b').weightedScore).toBeCloseTo((2.5 * 40 + 3.5 * 60) / 100, 10);
  });
});

describe('ties', () => {
  it('flags a tie between two recommended alternatives', () => {
    const res = computeMatrix(arg(scoresFor(4, 4, 4, 4)), []);
    expect(res.recommendedIds.sort()).toEqual(['alt-a', 'alt-b']);
    expect(res.tie).toBe(true);
    expect(res.messages.some((m) => m.startsWith('Tie:'))).toBe(true);
  });

  it('treats floating-point near-equality as a tie', () => {
    // 0.1*3 + 0.9*3 vs 3: both equal 3 within tolerance
    const res = computeMatrix(arg(scoresFor(3, 3, 3, 3)), [], { 'crit-1': 0.1 + 0.2, 'crit-2': 0.3 });
    expect(res.tie).toBe(true);
  });

  it('selecting one of the tied alternatives needs no rationale', () => {
    const res = computeMatrix(arg(scoresFor(4, 4, 4, 4), { selectedAlternativeId: 'alt-b' }), []);
    expect(res.selectionDiffersFromRecommendation).toBe(false);
    expect(res.selectionNeedsRationale).toBe(false);
  });
});

describe('mandatory constraints and eligibility', () => {
  it('a failed constraint makes the top scorer ineligible; recommendation falls to the next eligible', () => {
    const a = arg(scoresFor(5, 5, 3, 3), {
      constraintEvaluations: [
        ev('alt-a', 'q1', 'pass'), ev('alt-a', 'q2', 'fail'),
        ev('alt-b', 'q1', 'pass'), ev('alt-b', 'q2', 'pass')
      ]
    });
    const res = computeMatrix(a, [r1, r2]);
    const A = byId(res, 'alt-a');
    expect(A.eligibility).toBe('ineligible');
    expect(A.failedRequirementIds).toEqual(['q2']);
    expect(A.isHighestScore).toBe(true);
    expect(A.isRecommended).toBe(false);
    expect(byId(res, 'alt-b').eligibility).toBe('eligible');
    expect(res.highestScoreIds).toEqual(['alt-a']);
    expect(res.recommendedIds).toEqual(['alt-b']);
    expect(res.recommendedIsProvisional).toBe(false);
    expect(res.messages).toContain('Warren truss has the highest weighted score but fails REQ-002 and is ineligible.');
  });

  it('never recommends anything when every complete alternative is ineligible', () => {
    const a = arg(scoresFor(5, 5, 3, 3), {
      constraintEvaluations: [ev('alt-a', 'q1', 'fail'), ev('alt-b', 'q1', 'fail'), ev('alt-a', 'q2', 'pass'), ev('alt-b', 'q2', 'pass')]
    });
    const res = computeMatrix(a, [r1, r2]);
    expect(res.recommendedIds).toEqual([]);
    expect(res.tie).toBe(false);
    expect(res.messages).toContain('No alternative is currently eligible for recommendation.');
  });

  it('unverified (including missing evaluation) is provisional; recommendation is provisional when nothing is fully eligible', () => {
    const a = arg(scoresFor(5, 5, 3, 3), {
      constraintEvaluations: [ev('alt-a', 'q1', 'pass'), ev('alt-a', 'q2', 'unverified')]
    });
    const res = computeMatrix(a, [r1, r2]);
    expect(byId(res, 'alt-a')).toMatchObject({ eligibility: 'provisional', unverifiedRequirementIds: ['q2'] });
    expect(byId(res, 'alt-b')).toMatchObject({ eligibility: 'provisional', unverifiedRequirementIds: ['q1', 'q2'] });
    expect(res.recommendedIds).toEqual(['alt-a']);
    expect(res.recommendedIsProvisional).toBe(true);
  });

  it('prefers a lower-scoring fully eligible alternative over a higher-scoring provisional one', () => {
    const a = arg(scoresFor(5, 5, 3, 3), {
      constraintEvaluations: [
        ev('alt-a', 'q1', 'pass'), ev('alt-a', 'q2', 'unverified'),
        ev('alt-b', 'q1', 'pass'), ev('alt-b', 'q2', 'pass')
      ]
    });
    const res = computeMatrix(a, [r1, r2]);
    expect(res.recommendedIds).toEqual(['alt-b']);
    expect(res.recommendedIsProvisional).toBe(false);
  });

  it('treats n/a without justification as unverified, and justified n/a as ok', () => {
    const a = arg(scoresFor(4, 4, 3, 3), {
      constraintEvaluations: [
        ev('alt-a', 'q1', 'not-applicable', '   '),
        ev('alt-b', 'q1', 'not-applicable', 'No water crossing on this site.')
      ]
    });
    const res = computeMatrix(a, [r1]);
    expect(byId(res, 'alt-a')).toMatchObject({ eligibility: 'provisional', unverifiedRequirementIds: ['q1'] });
    expect(byId(res, 'alt-b').eligibility).toBe('eligible');
    expect(res.messages.some((m) => m.includes('REQ-001 as not applicable without a justification'))).toBe(true);
    expect(res.recommendedIds).toEqual(['alt-b']);
  });

  it('with no mandatory requirements everything is eligible', () => {
    const res = computeMatrix(arg(scoresFor(4, 4, 3, 3)), []);
    expect(res.alternatives.every((a) => a.eligibility === 'eligible')).toBe(true);
    expect(res.mandatoryRequirementIds).toEqual([]);
  });

  it('ranks incomplete alternatives out even if eligible', () => {
    const res = computeMatrix(arg(scoresFor(5, null, 2, 2)), []);
    expect(res.recommendedIds).toEqual(['alt-b']);
    expect(res.highestScoreIds).toEqual(['alt-b']);
  });
});

describe('selection', () => {
  it('requires a rationale when the selection differs from the recommendation', () => {
    const a = arg(scoresFor(5, 5, 3, 3), { selectedAlternativeId: 'alt-b' });
    const res = computeMatrix(a, []);
    expect(res.selectedId).toBe('alt-b');
    expect(res.selectionDiffersFromRecommendation).toBe(true);
    expect(res.selectionNeedsRationale).toBe(true);
    expect(byId(res, 'alt-b').isSelected).toBe(true);

    const withRationale = computeMatrix({ ...a, selectionRationale: 'Constructability on site.' }, []);
    expect(withRationale.selectionDiffersFromRecommendation).toBe(true);
    expect(withRationale.selectionNeedsRationale).toBe(false);

    const whitespace = computeMatrix({ ...a, selectionRationale: '  \n ' }, []);
    expect(whitespace.selectionNeedsRationale).toBe(true);
  });

  it('does not need a rationale when selecting the recommendation', () => {
    const res = computeMatrix(arg(scoresFor(5, 5, 3, 3), { selectedAlternativeId: 'alt-a' }), []);
    expect(res.selectionDiffersFromRecommendation).toBe(false);
    expect(res.selectionNeedsRationale).toBe(false);
    expect(res.selectionIsIneligible).toBe(false);
  });

  it('flags selection of an ineligible alternative', () => {
    const a = arg(scoresFor(5, 5, 3, 3), {
      selectedAlternativeId: 'alt-a',
      constraintEvaluations: [ev('alt-a', 'q1', 'fail'), ev('alt-b', 'q1', 'pass')]
    });
    const res = computeMatrix(a, [r1]);
    expect(res.selectionIsIneligible).toBe(true);
    expect(res.selectionDiffersFromRecommendation).toBe(true);
    expect(res.selectionNeedsRationale).toBe(true);
    expect(res.messages.some((m) => m.includes('is selected but fails a mandatory constraint'))).toBe(true);
  });

  it('ignores a selected id that no longer exists', () => {
    const res = computeMatrix(arg(scoresFor(5, 5, 3, 3), { selectedAlternativeId: 'ghost' }), []);
    expect(res.selectedId).toBeNull();
    expect(res.selectionDiffersFromRecommendation).toBe(false);
    expect(res.selectionNeedsRationale).toBe(false);
  });
});

describe('normaliseWeights', () => {
  const crit = (weights: number[]) => weights.map((w, i) => ({ id: `c${i}`, name: `C${i}`, weight: w, description: '' }));
  const sumTenths = (cs: { weight: number }[]) => cs.reduce((s, c) => s + Math.round(c.weight * 10), 0);

  it('scales to exactly 100.0 with one decimal place', () => {
    for (const ws of [[1, 1, 1], [30, 40, 50], [33.3, 33.3, 33.3], [0.1, 0.2, 0.3, 7], [1, 2, 3, 4, 5, 6, 7]]) {
      const out = normaliseWeights(crit(ws));
      expect(sumTenths(out)).toBe(1000);
      for (const c of out) expect(Math.round(c.weight * 10) / 10).toBe(c.weight);
    }
  });

  it('gives the rounding remainder to the largest weight', () => {
    const out = normaliseWeights(crit([1, 1, 2]));
    expect(out.map((c) => c.weight)).toEqual([25, 25, 50]);
    const three = normaliseWeights(crit([1, 1, 1]));
    expect(three.map((c) => c.weight)).toEqual([33.4, 33.3, 33.3]);
  });

  it('distributes equally when the total is zero', () => {
    expect(normaliseWeights(crit([0, 0, 0])).map((c) => c.weight)).toEqual([33.4, 33.3, 33.3]);
    expect(sumTenths(normaliseWeights(crit([0, 0, 0, 0])))).toBe(1000);
  });

  it('zeroes negative and non-finite weights first', () => {
    expect(normaliseWeights(crit([-5, NaN, Infinity, 10])).map((c) => c.weight)).toEqual([0, 0, 0, 100]);
    expect(sumTenths(normaliseWeights(crit([-5, -5])))).toBe(1000);
  });

  it('handles empty input and does not mutate', () => {
    expect(normaliseWeights([])).toEqual([]);
    const input = crit([1, 3]);
    normaliseWeights(input);
    expect(input.map((c) => c.weight)).toEqual([1, 3]);
  });
});

describe('mandatoryRequirementsForArgument', () => {
  it('finds non-archived mandatory requirements linked in either direction', () => {
    const m = makeManifest({
      requirements: [
        makeRequirement({ id: 'm1', code: 'REQ-001' }),
        makeRequirement({ id: 'm2', code: 'REQ-002' }),
        makeRequirement({ id: 'o1', code: 'REQ-003', classification: 'objective' }),
        makeRequirement({ id: 'x1', code: 'REQ-004', archived: true }),
        makeRequirement({ id: 'u1', code: 'REQ-005' })
      ],
      arguments: [makeArgument()],
      links: [
        { id: 'l1', a: { type: 'requirement', id: 'm1' }, b: { type: 'argument', id: 'arg-1' }, note: '', createdAt: 'T' },
        { id: 'l2', a: { type: 'argument', id: 'arg-1' }, b: { type: 'requirement', id: 'm2' }, note: '', createdAt: 'T' },
        { id: 'l3', a: { type: 'requirement', id: 'o1' }, b: { type: 'argument', id: 'arg-1' }, note: '', createdAt: 'T' },
        { id: 'l4', a: { type: 'requirement', id: 'x1' }, b: { type: 'argument', id: 'arg-1' }, note: '', createdAt: 'T' }
      ]
    });
    expect(mandatoryRequirementsForArgument(m, 'arg-1').map((r) => r.code)).toEqual(['REQ-001', 'REQ-002']);
    expect(mandatoryRequirementsForArgument(m, 'other')).toEqual([]);
  });
});
