import { describe, expect, it } from 'vitest';
import {
  IMPACT_LABELS,
  LIKELIHOOD_LABELS,
  RISK_SCORE_EXPLANATION,
  effectiveRiskScore,
  isUnresolved,
  riskLevel,
  unresolvedHighRisks
} from '../../shared/utilities/risk';
import type { Risk } from '../../shared/schemas/project';
import { NOW, makeManifest } from './fixtures/manifestFixture';

function risk(o: Partial<Risk>): Risk {
  return {
    id: 'r', code: 'RSK-001', title: 'Risk', description: '', category: '', likelihood: 3, impact: 3,
    residualLikelihood: null, residualImpact: null, mitigation: '', owner: '', status: 'open', notes: '',
    archived: false, createdAt: NOW, modifiedAt: NOW, ...o
  };
}

describe('risk', () => {
  it('maps scores to levels at the boundaries', () => {
    expect([1, 4, 5, 9, 10, 14, 15, 25].map(riskLevel)).toEqual([
      'low', 'low', 'medium', 'medium', 'high', 'high', 'critical', 'critical'
    ]);
  });

  it('uses residual only when both residual ratings are set', () => {
    expect(effectiveRiskScore(risk({ likelihood: 5, impact: 4 }))).toBe(20);
    expect(effectiveRiskScore(risk({ likelihood: 5, impact: 4, residualLikelihood: 2, residualImpact: 3 }))).toBe(6);
    expect(effectiveRiskScore(risk({ likelihood: 5, impact: 4, residualLikelihood: 2 }))).toBe(20);
  });

  it('isUnresolved covers open and mitigating but not archived/accepted/closed', () => {
    expect(isUnresolved(risk({ status: 'open' }))).toBe(true);
    expect(isUnresolved(risk({ status: 'mitigating' }))).toBe(true);
    expect(isUnresolved(risk({ status: 'accepted' }))).toBe(false);
    expect(isUnresolved(risk({ status: 'closed' }))).toBe(false);
    expect(isUnresolved(risk({ archived: true }))).toBe(false);
  });

  it('unresolvedHighRisks filters by effective level and sorts by score descending', () => {
    const m = makeManifest({
      risks: [
        risk({ id: 'a', likelihood: 3, impact: 4 }), // 12 high
        risk({ id: 'b', likelihood: 5, impact: 5 }), // 25 critical
        risk({ id: 'c', likelihood: 5, impact: 5, residualLikelihood: 1, residualImpact: 2 }), // residual 2 low
        risk({ id: 'd', likelihood: 5, impact: 5, status: 'closed' }),
        risk({ id: 'e', likelihood: 2, impact: 2 })
      ]
    });
    expect(unresolvedHighRisks(m).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('exports labels and explanation', () => {
    expect(LIKELIHOOD_LABELS[1]).toBe('Rare');
    expect(LIKELIHOOD_LABELS[5]).toBe('Almost certain');
    expect(IMPACT_LABELS[1]).toBe('Negligible');
    expect(IMPACT_LABELS[5]).toBe('Severe');
    expect(RISK_SCORE_EXPLANATION).toContain('likelihood');
  });
});
