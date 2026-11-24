import type { ProjectManifest, Risk } from '../schemas/project';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: 'Rare',
  2: 'Unlikely',
  3: 'Possible',
  4: 'Likely',
  5: 'Almost certain'
};

export const IMPACT_LABELS: Record<number, string> = {
  1: 'Negligible',
  2: 'Minor',
  3: 'Moderate',
  4: 'Major',
  5: 'Severe'
};

export const RISK_SCORE_EXPLANATION =
  'Risk score = likelihood (1–5) × impact (1–5), giving 1–25. Levels: 1–4 low, 5–9 medium, 10–14 high, 15–25 critical. ' +
  'Ratings are the author’s own qualitative judgement and are not a substitute for a formal risk assessment.';

export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

export function inherentRiskScore(risk: Risk): number {
  return riskScore(risk.likelihood, risk.impact);
}

/** Residual score when both residual ratings are set, otherwise the inherent score. */
export function effectiveRiskScore(risk: Risk): number {
  if (risk.residualLikelihood !== null && risk.residualImpact !== null) {
    return riskScore(risk.residualLikelihood, risk.residualImpact);
  }
  return inherentRiskScore(risk);
}

export function isUnresolved(risk: Risk): boolean {
  return !risk.archived && (risk.status === 'open' || risk.status === 'mitigating');
}

export function unresolvedHighRisks(manifest: ProjectManifest): Risk[] {
  return manifest.risks
    .filter((r) => {
      if (!isUnresolved(r)) return false;
      const level = riskLevel(effectiveRiskScore(r));
      return level === 'high' || level === 'critical';
    })
    .sort((a, b) => effectiveRiskScore(b) - effectiveRiskScore(a));
}
