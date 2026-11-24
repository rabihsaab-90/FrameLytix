import type {
  Asset,
  EntityRef,
  EntityType,
  ProjectManifest,
  Requirement,
  RequirementStatus
} from '../schemas/project';
import type { Issue } from './issues';

export interface ResolvedRef {
  ref: EntityRef;
  code: string;
  title: string;
  archived: boolean;
  exists: boolean;
}

const same = (x: EntityRef, y: EntityRef): boolean => x.type === y.type && x.id === y.id;

export function linkedRefs(manifest: ProjectManifest, ref: EntityRef, targetType?: EntityType): EntityRef[] {
  const out: EntityRef[] = [];
  const seen = new Set<string>();
  for (const l of manifest.links) {
    let other: EntityRef | null = null;
    if (same(l.a, ref)) other = l.b;
    else if (same(l.b, ref)) other = l.a;
    if (!other) continue;
    if (targetType && other.type !== targetType) continue;
    const key = `${other.type}:${other.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: other.type, id: other.id });
  }
  return out;
}

export function isLinked(manifest: ProjectManifest, x: EntityRef, y: EntityRef): boolean {
  return manifest.links.some((l) => (same(l.a, x) && same(l.b, y)) || (same(l.a, y) && same(l.b, x)));
}

export function addLink(
  manifest: ProjectManifest,
  x: EntityRef,
  y: EntityRef,
  opts: { id: string; now: string; note?: string }
): ProjectManifest {
  if (same(x, y) || isLinked(manifest, x, y)) return manifest;
  return {
    ...manifest,
    links: [
      ...manifest.links,
      {
        id: opts.id,
        a: { type: x.type, id: x.id },
        b: { type: y.type, id: y.id },
        note: opts.note ?? '',
        createdAt: opts.now
      }
    ]
  };
}

export function removeLink(manifest: ProjectManifest, x: EntityRef, y: EntityRef): ProjectManifest {
  return {
    ...manifest,
    links: manifest.links.filter((l) => !((same(l.a, x) && same(l.b, y)) || (same(l.a, y) && same(l.b, x))))
  };
}

export function removeLinksFor(manifest: ProjectManifest, ref: EntityRef): ProjectManifest {
  return { ...manifest, links: manifest.links.filter((l) => !same(l.a, ref) && !same(l.b, ref)) };
}

function fileNameOfPath(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

export function assetCode(a: Asset): string {
  return a.drawingId || fileNameOfPath(a.relativePath);
}

export function resolveRef(manifest: ProjectManifest, ref: EntityRef): ResolvedRef {
  const missing: ResolvedRef = { ref, code: ref.id, title: '(deleted record)', archived: false, exists: false };
  switch (ref.type) {
    case 'requirement': {
      const r = manifest.requirements.find((x) => x.id === ref.id);
      return r ? { ref, code: r.code, title: r.title, archived: r.archived, exists: true } : missing;
    }
    case 'argument': {
      const r = manifest.arguments.find((x) => x.id === ref.id);
      return r ? { ref, code: r.code, title: r.title, archived: r.archived, exists: true } : missing;
    }
    case 'calculation': {
      const r = manifest.calculations.find((x) => x.id === ref.id);
      return r ? { ref, code: r.code, title: r.title, archived: r.archived, exists: true } : missing;
    }
    case 'asset': {
      const r = manifest.assets.find((x) => x.id === ref.id);
      return r
        ? { ref, code: assetCode(r), title: r.title || fileNameOfPath(r.relativePath), archived: false, exists: true }
        : missing;
    }
    case 'evidence': {
      const r = manifest.evidence.find((x) => x.id === ref.id);
      return r ? { ref, code: r.code, title: r.title, archived: false, exists: true } : missing;
    }
    case 'risk': {
      const r = manifest.risks.find((x) => x.id === ref.id);
      return r ? { ref, code: r.code, title: r.title, archived: r.archived, exists: true } : missing;
    }
  }
}

export type EvidenceStatus = 'has-evidence' | 'notes-only' | 'missing';

export interface TraceabilityRow {
  requirement: Requirement;
  arguments: ResolvedRef[];
  calculations: ResolvedRef[];
  assets: ResolvedRef[];
  evidence: ResolvedRef[];
  risks: ResolvedRef[];
  verificationStatus: RequirementStatus;
  evidenceStatus: EvidenceStatus;
  missingAssets: ResolvedRef[];
  /** Linked targets that were deleted or archived. */
  brokenLinks: ResolvedRef[];
}

function resolvedLinks(manifest: ProjectManifest, req: Requirement, type: EntityType): ResolvedRef[] {
  return linkedRefs(manifest, { type: 'requirement', id: req.id }, type).map((r) => resolveRef(manifest, r));
}

const isLive = (r: ResolvedRef): boolean => r.exists && !r.archived;

export function buildTraceabilityRows(manifest: ProjectManifest, missingAssetPaths: Set<string>): TraceabilityRow[] {
  return manifest.requirements
    .filter((r) => !r.archived)
    .map((requirement) => {
      const args = resolvedLinks(manifest, requirement, 'argument');
      const calcs = resolvedLinks(manifest, requirement, 'calculation');
      const assets = resolvedLinks(manifest, requirement, 'asset');
      const evidence = resolvedLinks(manifest, requirement, 'evidence');
      const risks = resolvedLinks(manifest, requirement, 'risk');
      const missingAssets = assets.filter((a) => {
        const asset = manifest.assets.find((x) => x.id === a.ref.id);
        return asset ? missingAssetPaths.has(asset.relativePath) : false;
      });
      const brokenLinks = [...args, ...calcs, ...assets, ...evidence, ...risks].filter((r) => !isLive(r));
      const hasEvidence = evidence.some(isLive);
      const evidenceStatus: EvidenceStatus = hasEvidence
        ? 'has-evidence'
        : requirement.verificationNotes.trim() !== ''
          ? 'notes-only'
          : 'missing';
      return {
        requirement,
        arguments: args,
        calculations: calcs,
        assets,
        evidence,
        risks,
        verificationStatus: requirement.status,
        evidenceStatus,
        missingAssets,
        brokenLinks
      };
    });
}

export interface Coverage {
  covered: number;
  total: number;
  ratio: number | null;
  definition: string;
}

function coverageOf(manifest: ProjectManifest, types: EntityType[], extra: (r: Requirement) => boolean, definition: string): Coverage {
  const applicable = manifest.requirements.filter((r) => !r.archived && r.status !== 'not-applicable');
  let covered = 0;
  for (const req of applicable) {
    const refs = linkedRefs(manifest, { type: 'requirement', id: req.id }).filter((r) => types.includes(r.type));
    if (refs.some((r) => isLive(resolveRef(manifest, r))) || extra(req)) covered++;
  }
  return { covered, total: applicable.length, ratio: applicable.length === 0 ? null : covered / applicable.length, definition };
}

export function traceabilityCoverage(manifest: ProjectManifest): Coverage {
  return coverageOf(
    manifest,
    ['argument', 'calculation', 'asset', 'evidence'],
    () => false,
    'Traceability coverage is the share of active requirements (excluding those marked Not applicable) that are linked to at least one existing, non-archived argument, calculation, drawing/asset or evidence record. It measures documentation links only, not engineering validity.'
  );
}

export function evidenceCoverage(manifest: ProjectManifest): Coverage {
  return coverageOf(
    manifest,
    ['evidence'],
    (r) => r.verificationNotes.trim() !== '',
    'Evidence coverage is the share of active requirements (excluding those marked Not applicable) that are linked to at least one existing evidence record or have verification notes. It measures whether evidence is recorded, not whether it is sufficient.'
  );
}

export function detectTraceabilityIssues(manifest: ProjectManifest, missingAssetPaths: Set<string>): Issue[] {
  const issues: Issue[] = [];
  const rows = buildTraceabilityRows(manifest, missingAssetPaths);

  for (const row of rows) {
    const req = row.requirement;
    const target = { view: 'requirements' as const, id: req.id };
    const applicable = req.status !== 'not-applicable';

    if (applicable && row.evidenceStatus === 'missing') {
      issues.push({
        id: `req-no-evidence:${req.id}`,
        severity: 'warning',
        category: 'evidence',
        message: `${req.code} has no linked evidence or verification notes.`,
        target
      });
    }
    if (
      applicable &&
      req.classification === 'mandatory' &&
      !row.arguments.some(isLive) &&
      req.notApplicableLinks.argument.trim() === ''
    ) {
      issues.push({
        id: `req-mandatory-no-argument:${req.id}`,
        severity: 'warning',
        category: 'constraints',
        message: `Mandatory requirement ${req.code} is not linked to an engineering argument.`,
        target
      });
    }
    if (req.classification === 'mandatory' && req.status !== 'verified' && req.status !== 'not-applicable') {
      issues.push({
        id: `req-mandatory-unverified:${req.id}`,
        severity: 'warning',
        category: 'constraints',
        message: `Unverified mandatory constraint: ${req.code} is “${req.status}”.`,
        target
      });
    }
    if (req.status === 'verified' && req.verificationNotes.trim() === '' && !row.evidence.some(isLive)) {
      issues.push({
        id: `req-verified-no-evidence:${req.id}`,
        severity: 'critical',
        category: 'evidence',
        message: `${req.code} is marked Verified but verification evidence is missing.`,
        target
      });
    }
    for (const b of row.brokenLinks) {
      issues.push({
        id: `broken-link:${req.id}:${b.ref.type}:${b.ref.id}`,
        severity: b.exists ? 'warning' : 'critical',
        category: 'references',
        message: b.exists
          ? `${req.code} is linked to an archived ${b.ref.type} (${b.code}).`
          : `${req.code} is linked to a ${b.ref.type} that no longer exists.`,
        target
      });
    }
  }

  // Links to deleted records that the per-requirement rows above did not already report.
  const activeReqIds = new Set(manifest.requirements.filter((r) => !r.archived).map((r) => r.id));
  for (const l of manifest.links) {
    for (const [end, other] of [
      [l.a, l.b],
      [l.b, l.a]
    ] as const) {
      if (resolveRef(manifest, end).exists) continue;
      if (other.type === 'requirement' && activeReqIds.has(other.id)) continue; // reported per requirement
      issues.push({
        id: `broken-link:${l.id}:${end.type}:${end.id}`,
        severity: 'critical',
        category: 'references',
        message: `A link points to a ${end.type} that no longer exists.`
      });
    }
  }

  for (const asset of manifest.assets) {
    if (missingAssetPaths.has(asset.relativePath)) {
      issues.push({
        id: `asset-missing:${asset.id}`,
        severity: 'critical',
        category: 'drawings',
        message: `The file for ${assetCode(asset)} is missing from the project folder (${asset.relativePath}).`,
        target: { view: 'asset', id: asset.id }
      });
    }
  }

  for (const arg of manifest.arguments) {
    if (arg.archived) continue;
    const linkedReqs = linkedRefs(manifest, { type: 'argument', id: arg.id }, 'requirement').filter((r) =>
      isLive(resolveRef(manifest, r))
    );
    if (linkedReqs.length === 0) {
      issues.push({
        id: `arg-no-requirements:${arg.id}`,
        severity: 'warning',
        category: 'decisions',
        message: `${arg.code} is not linked to any requirement.`,
        target: { view: 'argument', id: arg.id }
      });
    }
  }

  return issues;
}
