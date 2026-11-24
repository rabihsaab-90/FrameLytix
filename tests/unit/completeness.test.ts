import { describe, expect, it } from 'vitest';
import { detectProjectIssues, documentationCompleteness, projectStats } from '../../shared/utilities/completeness';
import { addLink } from '../../shared/utilities/traceability';
import type { Asset, Calculation, Risk, ReviewItem, ScoreEntry } from '../../shared/schemas/project';
import { NOW, makeArgument, makeManifest, makeRequirement } from './fixtures/manifestFixture';

const asset = (id: string, relativePath: string): Asset => ({
  id, drawingId: '', title: '', relativePath, description: '', revision: '', modelUnit: '', sizeBytes: 0, fileModifiedAt: null, importedAt: NOW
});
const risk = (o: Partial<Risk>): Risk => ({
  id: 'k', code: 'RSK-001', title: 'R', description: '', category: '', likelihood: 3, impact: 3, residualLikelihood: null,
  residualImpact: null, mitigation: '', owner: '', status: 'open', notes: '', archived: false, createdAt: NOW, modifiedAt: NOW, ...o
});
const item = (id: string, status: ReviewItem['status']): ReviewItem => ({
  id, category: 'scope', text: 'Item', source: 'template', status, naJustification: '', reviewer: '', notes: '', modifiedAt: NOW
});
const calc = (o: Partial<Calculation>): Calculation => ({
  id: 'c1', code: 'CALC-001', title: 'C', purpose: '', equation: 'x', variables: [], expression: '', method: '', assumptions: '',
  resultValue: '1', resultUnit: '', resultSource: 'manual', reference: '', verificationNotes: '', revision: 'REV-A', author: '',
  archived: false, createdAt: NOW, modifiedAt: NOW, ...o
});

describe('projectStats', () => {
  it('counts requirements, assets, risks and review items', () => {
    const m = makeManifest({
      requirements: [
        makeRequirement({ id: 'a', status: 'verified' }),
        makeRequirement({ id: 'b', status: 'not-applicable' }),
        makeRequirement({ id: 'c', classification: 'objective', status: 'in-progress' }),
        makeRequirement({ id: 'd', status: 'in-progress' }),
        makeRequirement({ id: 'e', archived: true, status: 'verified' })
      ],
      arguments: [makeArgument({ status: 'approved' }), makeArgument({ id: 'a2', status: 'draft' }), makeArgument({ id: 'a3', archived: true })],
      calculations: [calc({}), calc({ id: 'c2', archived: true })],
      assets: [
        asset('1', 'x/a.dwg'), asset('2', 'x/b.STEP'), asset('3', 'x/c.pdf'), asset('4', 'x/d.png'), asset('5', 'x/e.zip'), asset('6', 'x/f.stl')
      ],
      risks: [
        risk({ id: '1', likelihood: 5, impact: 5 }),
        risk({ id: '2', likelihood: 1, impact: 1 }),
        risk({ id: '3', status: 'closed' }),
        risk({ id: '4', archived: true, likelihood: 5, impact: 5 })
      ],
      reviewItems: [item('1', 'complete'), item('2', 'complete'), item('3', 'open'), item('4', 'not-applicable')]
    });
    const s = projectStats(m, new Set(['x/b.STEP']));
    expect(s.requirements).toMatchObject({ total: 4, active: 3, verified: 1, notApplicable: 1, mandatory: 2, mandatoryVerified: 1 });
    expect(s.requirements.completionRatio).toBeCloseTo(2 / 3);
    expect(s.arguments.total).toBe(2);
    expect(s.arguments.byStatus).toEqual({ draft: 1, 'under-review': 0, approved: 1, 'needs-revision': 0 });
    expect(s.calculations.total).toBe(1);
    expect(s.assets).toEqual({ total: 6, missing: 1, byKind: { drawings2d: 1, models3d: 2, documents: 1, images: 1, other: 1 } });
    expect(s.risks).toEqual({ total: 3, unresolved: 2, unresolvedHigh: 1 });
    expect(s.review).toMatchObject({ total: 4, complete: 2, notApplicable: 1, open: 1 });
    expect(s.review.completenessRatio).toBeCloseTo(2 / 3);
    expect(s.traceability.total).toBe(3);
  });

  it('gives null ratios for an empty project (never a fake 100%)', () => {
    const s = projectStats(makeManifest(), new Set());
    expect(s.requirements.completionRatio).toBeNull();
    expect(s.review.completenessRatio).toBeNull();
    expect(s.traceability.ratio).toBeNull();
  });
});

describe('documentationCompleteness', () => {
  it('measures checklist completion and says it is not engineering validity', () => {
    const d = documentationCompleteness(
      makeManifest({ reviewItems: [item('1', 'complete'), item('2', 'open'), item('3', 'not-applicable')] })
    );
    expect(d).toMatchObject({ complete: 1, applicable: 2, ratio: 0.5 });
    expect(d.definition).toMatch(/does not indicate engineering validity, safety or code compliance/);
    expect(documentationCompleteness(makeManifest()).ratio).toBeNull();
  });
});

describe('detectProjectIssues', () => {
  const scores = (v: Record<string, number | null>): ScoreEntry[] =>
    Object.entries(v).map(([k, score]) => {
      const [alt = '', crit = ''] = k.split('|');
      return { alternativeId: alt, criterionId: crit, score, rationale: '' };
    });

  it('flags a selected alternative that fails a mandatory constraint as critical, sorted first', () => {
    let m = makeManifest({
      requirements: [makeRequirement({ id: 'q1', code: 'REQ-001', status: 'verified', verificationNotes: 'ok' })],
      arguments: [
        makeArgument({
          selectedAlternativeId: 'alt-a',
          matrix: {
            scaleMin: 1,
            scaleMax: 5,
            criteria: makeArgument().matrix.criteria,
            scores: scores({ 'alt-a|crit-1': 5, 'alt-a|crit-2': 5, 'alt-b|crit-1': 3, 'alt-b|crit-2': 3 })
          },
          constraintEvaluations: [
            { alternativeId: 'alt-a', requirementId: 'q1', result: 'fail', justification: '' },
            { alternativeId: 'alt-b', requirementId: 'q1', result: 'pass', justification: '' }
          ]
        })
      ]
    });
    m = addLink(m, { type: 'requirement', id: 'q1' }, { type: 'argument', id: 'arg-1' }, { id: 'l', now: NOW });
    const issues = detectProjectIssues(m, new Set());
    const sel = issues.filter((i) => i.id.startsWith('arg-selected-fails'));
    expect(sel).toHaveLength(1);
    expect(sel[0]!.severity).toBe('critical');
    expect(sel[0]!.message).toContain('REQ-001');
    expect(issues.some((i) => i.id.startsWith('arg-selection-no-rationale'))).toBe(true);
    expect(issues[0]!.severity).toBe('critical');
    const order = issues.map((i) => i.severity);
    expect(order).toEqual([...order].sort((x, y) => ['critical', 'warning', 'info'].indexOf(x) - ['critical', 'warning', 'info'].indexOf(y)));
  });

  it('reports incomplete matrices, invalid weights, missing content and unselected arguments', () => {
    const base = makeArgument();
    const m = makeManifest({
      project: { ...makeManifest().project, scope: '  ' },
      arguments: [
        makeArgument({ title: '', assumptions: [], justification: '' }),
        makeArgument({
          id: 'a2', code: 'ARG-002',
          matrix: { ...base.matrix, criteria: [{ id: 'crit-1', name: 'Cost', weight: -1, description: '' }] }
        })
      ],
      calculations: [calc({ equation: '', expression: '', resultValue: '' })],
      risks: [risk({ id: 'hi', likelihood: 5, impact: 4 })],
      reviewItems: [item('1', 'open'), item('2', 'open')]
    });
    const issues = detectProjectIssues(m, new Set());
    const has = (prefix: string) => issues.some((i) => i.id.startsWith(prefix));
    expect(has('project-no-scope')).toBe(true);
    expect(has('arg-no-title:arg-1')).toBe(true);
    expect(has('arg-no-assumptions:arg-1')).toBe(true);
    expect(has('arg-no-justification:arg-1')).toBe(true);
    expect(has('arg-incomplete-matrix:arg-1')).toBe(true);
    expect(has('arg-invalid-weights:a2')).toBe(true);
    expect(has('arg-no-selection:arg-1')).toBe(true);
    expect(issues.find((i) => i.id === 'arg-no-selection:arg-1')!.severity).toBe('info');
    expect(has('calc-no-equation')).toBe(true);
    expect(has('calc-no-result')).toBe(true);
    expect(issues.find((i) => i.id === 'risk-unresolved-high:hi')!.severity).toBe('warning');
    const review = issues.filter((i) => i.id === 'review-open-items');
    expect(review).toHaveLength(1);
    expect(review[0]!.message).toContain('2');
  });

  it('is stable: identical input gives identical ordered output', () => {
    const m = makeManifest({ arguments: [makeArgument()], requirements: [makeRequirement()] });
    expect(detectProjectIssues(m, new Set())).toEqual(detectProjectIssues(m, new Set()));
  });
});
