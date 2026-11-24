/**
 * FrameLytix portable project manifest schema (framelytix-project.json).
 *
 * This is the single authoritative data model shared by the Electron main process,
 * the renderer and the report generator. Every record has a stable UUID `id` used for
 * relationships, plus a human-readable `code` (REQ-001, ARG-001, …) for display.
 *
 * Paths are always stored relative to the project root using forward slashes.
 * Key order in these schemas defines the serialised key order (deterministic JSON).
 */
import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const DisciplineSchema = z.enum(['civil', 'mechanical', 'aerospace', 'electrical', 'custom']);
export type Discipline = z.infer<typeof DisciplineSchema>;

export const UnitSystemSchema = z.enum(['SI', 'Imperial']);
export type UnitSystem = z.infer<typeof UnitSystemSchema>;

/** Phase 1 sub-sections shown in the project explorer. */
export const RequirementSectionSchema = z.enum(['criteria', 'constraints', 'environment']);
export type RequirementSection = z.infer<typeof RequirementSectionSchema>;

export const PrioritySchema = z.enum(['high', 'medium', 'low']);
export type Priority = z.infer<typeof PrioritySchema>;

/** mandatory = hard constraint, objective = design objective, preference = nice-to-have. */
export const RequirementClassificationSchema = z.enum(['mandatory', 'objective', 'preference']);
export type RequirementClassification = z.infer<typeof RequirementClassificationSchema>;

export const VerificationMethodSchema = z.enum([
  'calculation',
  'inspection',
  'analysis',
  'physical-test',
  'simulation',
  'document-review',
  'other'
]);
export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;

export const RequirementStatusSchema = z.enum([
  'not-started',
  'in-progress',
  'verified',
  'needs-revision',
  'not-applicable'
]);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

/** Internal documentation workflow status. "approved" is NOT professional certification. */
export const ArgumentStatusSchema = z.enum(['draft', 'under-review', 'approved', 'needs-revision']);
export type ArgumentStatus = z.infer<typeof ArgumentStatusSchema>;

export const ConstraintResultSchema = z.enum(['pass', 'fail', 'unverified', 'not-applicable']);
export type ConstraintResult = z.infer<typeof ConstraintResultSchema>;

export const RiskStatusSchema = z.enum(['open', 'mitigating', 'accepted', 'closed']);
export type RiskStatus = z.infer<typeof RiskStatusSchema>;

export const ReviewCategorySchema = z.enum([
  'scope',
  'decisions',
  'constraints',
  'assumptions',
  'calculations',
  'evidence',
  'drawings',
  'risks',
  'references',
  'reporting'
]);
export type ReviewCategory = z.infer<typeof ReviewCategorySchema>;

export const ReviewItemStatusSchema = z.enum(['open', 'complete', 'not-applicable']);
export type ReviewItemStatus = z.infer<typeof ReviewItemStatusSchema>;

export const EvidenceOutcomeSchema = z.enum(['supports', 'inconclusive', 'does-not-support']);
export type EvidenceOutcome = z.infer<typeof EvidenceOutcomeSchema>;

export const EntityTypeSchema = z.enum(['requirement', 'argument', 'calculation', 'asset', 'evidence', 'risk']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const Id = z.string().min(1).max(64);
const Timestamp = z.string().min(1).max(40); // ISO 8601
const ShortText = z.string().max(300);
const LongText = z.string().max(50_000);

/** A project-relative POSIX path. Rejects absolute paths and parent traversal. */
export const RelativePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((p) => !p.includes('\\'), 'Relative paths must use forward slashes')
  .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p), 'Path must be relative to the project root')
  .refine((p) => !p.split('/').some((seg) => seg === '..' || seg === ''), 'Path must not contain ".." or empty segments');

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export const NotApplicableLinksSchema = z.object({
  argument: ShortText.default(''),
  calculation: ShortText.default(''),
  asset: ShortText.default('')
});
export type NotApplicableLinks = z.infer<typeof NotApplicableLinksSchema>;

export const RequirementSchema = z.object({
  id: Id,
  code: z.string().min(1).max(20),
  title: ShortText,
  description: LongText.default(''),
  section: RequirementSectionSchema,
  category: ShortText.default(''),
  priority: PrioritySchema.default('medium'),
  classification: RequirementClassificationSchema,
  acceptanceCriterion: LongText.default(''),
  targetValue: ShortText.default(''),
  unit: z.string().max(40).default(''),
  source: ShortText.default(''),
  verificationMethod: VerificationMethodSchema.default('document-review'),
  status: RequirementStatusSchema.default('not-started'),
  /** User-supplied description of how verification was performed. */
  verificationNotes: LongText.default(''),
  notes: LongText.default(''),
  /** Justifications for why a trace link type is not applicable to this requirement. */
  notApplicableLinks: NotApplicableLinksSchema.default({ argument: '', calculation: '', asset: '' }),
  archived: z.boolean().default(false),
  createdAt: Timestamp,
  modifiedAt: Timestamp
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const AlternativeSchema = z.object({
  id: Id,
  name: ShortText,
  description: LongText.default('')
});
export type Alternative = z.infer<typeof AlternativeSchema>;

export const CriterionSchema = z.object({
  id: Id,
  name: ShortText,
  /** Percentage weight (non-negative). Totals are validated, not enforced, so users can normalise. */
  weight: z.number(),
  description: ShortText.default('')
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const ScoreEntrySchema = z.object({
  alternativeId: Id,
  criterionId: Id,
  /** 1–5 where higher is always more favourable. null = not yet scored (never treated as 0). */
  score: z.number().nullable(),
  rationale: LongText.default('')
});
export type ScoreEntry = z.infer<typeof ScoreEntrySchema>;

export const DecisionMatrixSchema = z.object({
  scaleMin: z.number().int().default(1),
  scaleMax: z.number().int().default(5),
  criteria: z.array(CriterionSchema).default([]),
  scores: z.array(ScoreEntrySchema).default([])
});
export type DecisionMatrix = z.infer<typeof DecisionMatrixSchema>;

export const ConstraintEvaluationSchema = z.object({
  alternativeId: Id,
  requirementId: Id,
  result: ConstraintResultSchema,
  justification: LongText.default('')
});
export type ConstraintEvaluation = z.infer<typeof ConstraintEvaluationSchema>;

/** Argument content without revision history; used for revision snapshots. */
export const ArgumentContentSchema = z.object({
  id: Id,
  code: z.string().min(1).max(20),
  title: ShortText,
  problemStatement: LongText.default(''),
  objective: LongText.default(''),
  alternatives: z.array(AlternativeSchema).default([]),
  matrix: DecisionMatrixSchema.default({ scaleMin: 1, scaleMax: 5, criteria: [], scores: [] }),
  constraintEvaluations: z.array(ConstraintEvaluationSchema).default([]),
  assumptions: z.array(z.string().max(5000)).default([]),
  evidenceSummary: LongText.default(''),
  selectedAlternativeId: Id.nullable().default(null),
  /** Required when the selected alternative is not the highest-scoring eligible alternative. */
  selectionRationale: LongText.default(''),
  justification: LongText.default(''),
  risksAndLimitations: LongText.default(''),
  references: z.array(z.string().max(2000)).default([]),
  author: ShortText.default(''),
  reviewer: ShortText.default(''),
  revision: z.string().max(20).default('REV-A'),
  status: ArgumentStatusSchema.default('draft'),
  archived: z.boolean().default(false),
  createdAt: Timestamp,
  modifiedAt: Timestamp
});
export type ArgumentContent = z.infer<typeof ArgumentContentSchema>;

export const RevisionSchema = z.object({
  id: Id,
  code: z.string().min(1).max(20),
  timestamp: Timestamp,
  author: ShortText.default(''),
  summary: LongText.default(''),
  /** Recorded state of the argument at the time the revision was issued. */
  snapshot: ArgumentContentSchema
});
export type Revision = z.infer<typeof RevisionSchema>;

export const EngineeringArgumentSchema = ArgumentContentSchema.extend({
  revisions: z.array(RevisionSchema).default([])
});
export type EngineeringArgument = z.infer<typeof EngineeringArgumentSchema>;

export const CalcVariableSchema = z.object({
  symbol: z.string().min(1).max(40),
  description: ShortText.default(''),
  value: z.string().max(100).default(''),
  unit: z.string().max(40).default('')
});
export type CalcVariable = z.infer<typeof CalcVariableSchema>;

export const CalculationSchema = z.object({
  id: Id,
  code: z.string().min(1).max(20),
  title: ShortText,
  purpose: LongText.default(''),
  /** LaTeX source rendered with KaTeX (trust disabled). */
  equation: z.string().max(5000).default(''),
  variables: z.array(CalcVariableSchema).default([]),
  /** Optional restricted arithmetic expression using variable symbols, e.g. "w*L^2/8". */
  expression: z.string().max(1000).default(''),
  method: LongText.default(''),
  assumptions: LongText.default(''),
  resultValue: z.string().max(100).default(''),
  resultUnit: z.string().max(40).default(''),
  /** "manual" = typed by the user; "evaluated" = computed by the restricted expression parser. */
  resultSource: z.enum(['manual', 'evaluated']).default('manual'),
  reference: LongText.default(''),
  verificationNotes: LongText.default(''),
  revision: z.string().max(20).default('REV-A'),
  author: ShortText.default(''),
  archived: z.boolean().default(false),
  createdAt: Timestamp,
  modifiedAt: Timestamp
});
export type Calculation = z.infer<typeof CalculationSchema>;

export const AssetSchema = z.object({
  id: Id,
  /** Optional drawing / document identifier, e.g. DRW-001. */
  drawingId: z.string().max(40).default(''),
  title: ShortText.default(''),
  relativePath: RelativePathSchema,
  description: LongText.default(''),
  revision: z.string().max(20).default(''),
  /** For STL models: user-declared unit for model coordinates. Empty = unknown "model units". */
  modelUnit: z.string().max(20).default(''),
  sizeBytes: z.number().int().nonnegative().default(0),
  fileModifiedAt: Timestamp.nullable().default(null),
  importedAt: Timestamp
});
export type Asset = z.infer<typeof AssetSchema>;

export const EvidenceSchema = z.object({
  id: Id,
  code: z.string().min(1).max(20),
  title: ShortText,
  method: VerificationMethodSchema,
  summary: LongText.default(''),
  outcome: EvidenceOutcomeSchema.default('supports'),
  recordedBy: ShortText.default(''),
  date: z.string().max(40).default(''),
  createdAt: Timestamp,
  modifiedAt: Timestamp
});
export type Evidence = z.infer<typeof EvidenceSchema>;

const Rating = z.number().int().min(1).max(5);

export const RiskSchema = z.object({
  id: Id,
  code: z.string().min(1).max(20),
  title: ShortText,
  description: LongText.default(''),
  category: ShortText.default(''),
  /** Inherent (pre-mitigation) ratings, 1–5. */
  likelihood: Rating,
  impact: Rating,
  /** Residual (post-mitigation) ratings; null when not assessed. */
  residualLikelihood: Rating.nullable().default(null),
  residualImpact: Rating.nullable().default(null),
  mitigation: LongText.default(''),
  owner: ShortText.default(''),
  status: RiskStatusSchema.default('open'),
  notes: LongText.default(''),
  archived: z.boolean().default(false),
  createdAt: Timestamp,
  modifiedAt: Timestamp
});
export type Risk = z.infer<typeof RiskSchema>;

export const ReviewItemSchema = z.object({
  id: Id,
  category: ReviewCategorySchema,
  text: z.string().min(1).max(2000),
  source: z.enum(['template', 'custom']).default('custom'),
  status: ReviewItemStatusSchema.default('open'),
  naJustification: LongText.default(''),
  reviewer: ShortText.default(''),
  notes: LongText.default(''),
  modifiedAt: Timestamp
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const EntityRefSchema = z.object({ type: EntityTypeSchema, id: Id });
export type EntityRef = z.infer<typeof EntityRefSchema>;

/** Undirected relationship between two records. Stored once; never duplicated on records. */
export const TraceLinkSchema = z.object({
  id: Id,
  a: EntityRefSchema,
  b: EntityRefSchema,
  note: ShortText.default(''),
  createdAt: Timestamp
});
export type TraceLink = z.infer<typeof TraceLinkSchema>;

export const ExportRecordSchema = z.object({
  id: Id,
  format: z.enum(['pdf', 'html', 'csv']),
  fileName: ShortText,
  description: ShortText.default(''),
  exportedAt: Timestamp
});
export type ExportRecord = z.infer<typeof ExportRecordSchema>;

export const ReportSectionKeySchema = z.enum([
  'cover',
  'metadata',
  'summary',
  'scope',
  'criteria',
  'requirements',
  'arguments',
  'calculations',
  'traceability',
  'risks',
  'revisions',
  'drawings',
  'review',
  'outstanding',
  'references',
  'disclaimer'
]);
export type ReportSectionKey = z.infer<typeof ReportSectionKeySchema>;

export const ProjectInfoSchema = z.object({
  id: Id,
  title: z.string().min(1).max(200),
  description: LongText.default(''),
  /** Short identifier such as "PTB-2026". */
  identifier: z.string().min(1).max(40),
  discipline: DisciplineSchema,
  disciplineLabel: ShortText.default(''),
  templateId: z.string().min(1).max(80),
  archetypeName: ShortText,
  templateVersion: z.string().max(20),
  author: ShortText.default(''),
  organization: ShortText.default(''),
  unitSystem: UnitSystemSchema.default('SI'),
  /** Project scope statement — "What problem are we solving?" */
  scope: LongText.default(''),
  /** Executive / project summary used in reports. */
  summary: LongText.default(''),
  /** Phase 1 section labels (template-specific). */
  sectionLabels: z
    .object({ criteria: ShortText, constraints: ShortText, environment: ShortText })
    .default({
      criteria: 'Design Criteria',
      constraints: 'Load and Safety Constraints',
      environment: 'Site and Environment Data'
    }),
  /** True only for the bundled educational sample project. */
  isSample: z.boolean().default(false),
  createdAt: Timestamp,
  modifiedAt: Timestamp
});
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;

export const ProjectSettingsSchema = z.object({
  reportSections: z.array(ReportSectionKeySchema).default([...ReportSectionKeySchema.options]),
  /** Folder used as the default import destination for drawings, relative to the root. */
  defaultAssetFolder: z.string().max(1024).default('')
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ProjectManifestSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  appVersion: z.string().max(40),
  project: ProjectInfoSchema,
  /** Project-relative folders created from the template. */
  folders: z.array(RelativePathSchema).default([]),
  requirements: z.array(RequirementSchema).default([]),
  arguments: z.array(EngineeringArgumentSchema).default([]),
  calculations: z.array(CalculationSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  risks: z.array(RiskSchema).default([]),
  reviewItems: z.array(ReviewItemSchema).default([]),
  links: z.array(TraceLinkSchema).default([]),
  exportHistory: z.array(ExportRecordSchema).default([]),
  settings: ProjectSettingsSchema.default({ reportSections: [...ReportSectionKeySchema.options], defaultAssetFolder: '' })
});
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;
/** Input type (defaults optional) — useful for fixtures. */
export type ProjectManifestInput = z.input<typeof ProjectManifestSchema>;

/**
 * Parse a manifest that may come from disk. Returns a discriminated result rather
 * than throwing so callers can present recoverable errors.
 */
export function parseManifest(
  data: unknown
):
  | { ok: true; manifest: ProjectManifest }
  | { ok: false; reason: 'future-version' | 'invalid'; message: string } {
  if (data && typeof data === 'object' && 'schemaVersion' in data) {
    const v = (data as { schemaVersion: unknown }).schemaVersion;
    if (typeof v === 'number' && v > CURRENT_SCHEMA_VERSION) {
      return {
        ok: false,
        reason: 'future-version',
        message: `This project uses schema version ${v}, which is newer than this version of FrameLytix supports (${CURRENT_SCHEMA_VERSION}). Update FrameLytix to open it. The file has not been modified.`
      };
    }
  }
  const result = ProjectManifestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, reason: 'invalid', message: `The project manifest is not valid. ${issues}` };
  }
  return { ok: true, manifest: result.data };
}

/** Deterministic, human-readable serialisation (schema key order, 2-space indent, trailing newline). */
export function serializeManifest(manifest: ProjectManifest): string {
  const parsed = ProjectManifestSchema.parse(manifest);
  return JSON.stringify(parsed, null, 2) + '\n';
}
