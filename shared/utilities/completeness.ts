import type { ArgumentStatus, ProjectManifest } from '../schemas/project';
import { computeMatrix, mandatoryRequirementsForArgument } from './decisionMatrix';
import { sortIssues, type Issue } from './issues';
import { extensionOf } from './paths';
import { effectiveRiskScore, isUnresolved, riskLevel, unresolvedHighRisks } from './risk';
import { detectTraceabilityIssues, traceabilityCoverage, type Coverage } from './traceability';

export interface ProjectStats {
  requirements: {
    total: number;
    active: number;
    verified: number;
    notApplicable: number;
    /** (verified + not applicable) ÷ active; null when there are no active requirements. */
    completionRatio: number | null;
    mandatory: number;
    mandatoryVerified: number;
  };
  arguments: { total: number; byStatus: Record<ArgumentStatus, number> };
  calculations: { total: number };
  assets: {
    total: number;
    missing: number;
    byKind: { drawings2d: number; models3d: number; documents: number; images: number; other: number };
  };
  risks: { total: number; unresolved: number; unresolvedHigh: number };
  review: { total: number; complete: number; notApplicable: number; open: number; completenessRatio: number | null };
  traceability: Coverage;
}

const EXT_2D = ['dwg', 'dxf'];
const EXT_3D = ['step', 'stp', 'iges', 'igs', 'stl', 'sldprt', 'sldasm'];
const EXT_DOC = ['pdf', 'txt', 'csv', 'xlsx', 'm'];
const EXT_IMG = ['png', 'jpg', 'jpeg', 'svg'];

export function projectStats(manifest: ProjectManifest, missingAssetPaths: Set<string>): ProjectStats {
  const reqs = manifest.requirements.filter((r) => !r.archived);
  const active = reqs.filter((r) => r.status !== 'not-applicable');
  const verified = reqs.filter((r) => r.status === 'verified').length;
  const notApplicable = reqs.length - active.length;
  const mandatory = reqs.filter((r) => r.classification === 'mandatory' && r.status !== 'not-applicable');

  const args = manifest.arguments.filter((a) => !a.archived);
  const byStatus: Record<ArgumentStatus, number> = { draft: 0, 'under-review': 0, approved: 0, 'needs-revision': 0 };
  for (const a of args) byStatus[a.status]++;

  const byKind = { drawings2d: 0, models3d: 0, documents: 0, images: 0, other: 0 };
  let missing = 0;
  for (const a of manifest.assets) {
    const ext = extensionOf(a.relativePath);
    if (EXT_2D.includes(ext)) byKind.drawings2d++;
    else if (EXT_3D.includes(ext)) byKind.models3d++;
    else if (EXT_DOC.includes(ext)) byKind.documents++;
    else if (EXT_IMG.includes(ext)) byKind.images++;
    else byKind.other++;
    if (missingAssetPaths.has(a.relativePath)) missing++;
  }

  const risks = manifest.risks.filter((r) => !r.archived);
  const items = manifest.reviewItems;
  const complete = items.filter((i) => i.status === 'complete').length;
  const na = items.filter((i) => i.status === 'not-applicable').length;
  const applicable = items.length - na;

  return {
    requirements: {
      total: reqs.length,
      active: active.length,
      verified,
      notApplicable,
      completionRatio: active.length === 0 ? null : (verified + notApplicable) / active.length,
      mandatory: mandatory.length,
      mandatoryVerified: mandatory.filter((r) => r.status === 'verified').length
    },
    arguments: { total: args.length, byStatus },
    calculations: { total: manifest.calculations.filter((c) => !c.archived).length },
    assets: { total: manifest.assets.length, missing, byKind },
    risks: {
      total: risks.length,
      unresolved: risks.filter(isUnresolved).length,
      unresolvedHigh: unresolvedHighRisks(manifest).length
    },
    review: {
      total: items.length,
      complete,
      notApplicable: na,
      open: items.filter((i) => i.status === 'open').length,
      completenessRatio: applicable <= 0 ? null : complete / applicable
    },
    traceability: traceabilityCoverage(manifest)
  };
}

export function documentationCompleteness(manifest: ProjectManifest): {
  complete: number;
  applicable: number;
  ratio: number | null;
  definition: string;
} {
  const applicableItems = manifest.reviewItems.filter((i) => i.status !== 'not-applicable');
  const complete = applicableItems.filter((i) => i.status === 'complete').length;
  return {
    complete,
    applicable: applicableItems.length,
    ratio: applicableItems.length === 0 ? null : complete / applicableItems.length,
    definition:
      'Documentation completeness is the share of applicable design-review checklist items marked complete. It measures documentation checklist completion only and does not indicate engineering validity, safety or code compliance.'
  };
}

export function detectProjectIssues(manifest: ProjectManifest, missingAssetPaths: Set<string>): Issue[] {
  const issues: Issue[] = [...detectTraceabilityIssues(manifest, missingAssetPaths)];

  if (manifest.project.title.trim() === '') {
    issues.push({ id: 'project-no-title', severity: 'warning', category: 'scope', message: 'The project has no title.', target: { view: 'overview' } });
  }
  if (manifest.project.scope.trim() === '') {
    issues.push({
      id: 'project-no-scope',
      severity: 'warning',
      category: 'scope',
      message: 'The project scope statement is empty.',
      target: { view: 'overview' }
    });
  }

  for (const arg of manifest.arguments) {
    if (arg.archived) continue;
    const target = { view: 'argument' as const, id: arg.id };
    const push = (key: string, severity: Issue['severity'], category: Issue['category'], message: string): void => {
      issues.push({ id: `arg-${key}:${arg.id}`, severity, category, message, target });
    };
    if (arg.title.trim() === '') push('no-title', 'warning', 'decisions', `${arg.code} has no title.`);
    if (arg.assumptions.filter((a) => a.trim() !== '').length === 0) {
      push('no-assumptions', 'warning', 'assumptions', `${arg.code} lists no assumptions.`);
    }
    if (arg.justification.trim() === '') push('no-justification', 'warning', 'decisions', `${arg.code} has no justification.`);

    const result = computeMatrix(arg, mandatoryRequirementsForArgument(manifest, arg.id));
    if (!result.weightsValid) {
      push('invalid-weights', 'warning', 'decisions', `${arg.code} has invalid criterion weights: ${result.weightIssues.map((w) => w.message).join(' ')}`);
    }
    const incomplete = result.alternatives.filter((a) => !a.complete);
    if (arg.alternatives.length > 0 && incomplete.length > 0) {
      push(
        'incomplete-matrix',
        'warning',
        'decisions',
        `${arg.code} has an incomplete decision matrix (${incomplete.map((a) => a.name).join(', ')} still need scores).`
      );
    }
    const sel = result.alternatives.find((a) => a.isSelected);
    if (!sel) {
      push('no-selection', 'info', 'decisions', `${arg.code} has no selected alternative.`);
    } else {
      const reqs = mandatoryRequirementsForArgument(manifest, arg.id);
      if (sel.failedRequirementIds.length > 0) {
        const codes = sel.failedRequirementIds.map((id) => reqs.find((r) => r.id === id)?.code ?? id).join(', ');
        push('selected-fails', 'critical', 'constraints', `The selected alternative in ${arg.code} (${sel.name}) fails mandatory constraint ${codes}.`);
      }
      if (sel.eligibility === 'ineligible' && sel.failedRequirementIds.length === 0) {
        push('selected-ineligible', 'critical', 'constraints', `The selected alternative in ${arg.code} (${sel.name}) is ineligible.`);
      }
      if (result.selectionNeedsRationale) {
        push('selection-no-rationale', 'warning', 'decisions', `${arg.code}: the selection differs from the recommendation and has no rationale.`);
      }
    }
  }

  for (const calc of manifest.calculations) {
    if (calc.archived) continue;
    const target = { view: 'calculation' as const, id: calc.id };
    if (calc.equation.trim() === '' && calc.expression.trim() === '') {
      issues.push({ id: `calc-no-equation:${calc.id}`, severity: 'warning', category: 'calculations', message: `${calc.code} has no equation.`, target });
    }
    if (calc.resultValue.trim() === '') {
      issues.push({ id: `calc-no-result:${calc.id}`, severity: 'warning', category: 'calculations', message: `${calc.code} has no recorded result.`, target });
    }
  }

  for (const risk of unresolvedHighRisks(manifest)) {
    issues.push({
      id: `risk-unresolved-high:${risk.id}`,
      severity: 'warning',
      category: 'risks',
      message: `${risk.code} is an unresolved ${riskLevel(effectiveRiskScore(risk))} risk (${risk.status}).`,
      target: { view: 'risks', id: risk.id }
    });
  }

  const open = manifest.reviewItems.filter((i) => i.status === 'open').length;
  if (open > 0) {
    issues.push({
      id: 'review-open-items',
      severity: 'info',
      category: 'reporting',
      message: `${open} design-review checklist item${open === 1 ? ' is' : 's are'} still open.`,
      target: { view: 'review' }
    });
  }

  return sortIssues(issues);
}
