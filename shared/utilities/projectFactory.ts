import type { ProjectTemplate } from '../../src/templates/types';
import {
  CURRENT_SCHEMA_VERSION,
  ProjectManifestSchema,
  type EngineeringArgument,
  type ProjectManifest,
  type Requirement,
  type UnitSystem
} from '../schemas/project';
import { nextCode } from './ids';

export interface FactoryInput {
  title: string;
  description: string;
  identifier: string;
  author: string;
  organization: string;
  unitSystem: UnitSystem;
  customArchetypeName?: string;
}

export interface FactoryContext {
  now: string;
  newId: () => string;
  appVersion: string;
  disciplineLabel: string;
}

export const DEFAULT_CRITERIA: { name: string; weight: number; description: string }[] = [
  { name: 'Cost', weight: 30, description: 'Higher score = more favourable cost outcome (lower expected cost).' },
  { name: 'Safety or Strength', weight: 40, description: 'Higher score = more favourable safety or strength outcome.' },
  { name: 'Feasibility', weight: 30, description: 'Higher score = more feasible to design, build and operate.' }
];

export const OPTIONAL_CRITERIA = [
  'Durability',
  'Maintainability',
  'Environmental impact',
  'Energy efficiency',
  'Manufacturing complexity',
  'Performance'
];

export function createManifestFromTemplate(
  template: ProjectTemplate,
  input: FactoryInput,
  ctx: FactoryContext
): ProjectManifest {
  const { now, newId } = ctx;

  const requirements: Requirement[] = [];
  for (const t of template.suggestedRequirements) {
    requirements.push({
      id: newId(),
      code: nextCode('REQ', requirements.map((r) => r.code)),
      title: t.title,
      description: t.description,
      section: t.section,
      category: t.category,
      priority: t.priority,
      classification: t.classification,
      acceptanceCriterion: t.acceptanceCriterion,
      targetValue: '',
      unit: t.unit ?? '',
      source: 'Template suggestion — edit or remove',
      verificationMethod: t.verificationMethod,
      status: 'not-started',
      verificationNotes: '',
      notes: '',
      notApplicableLinks: { argument: '', calculation: '', asset: '' },
      archived: false,
      createdAt: now,
      modifiedAt: now
    });
  }

  const args: EngineeringArgument[] = [];
  for (const t of template.suggestedArguments) {
    const criteria = (t.criteria && t.criteria.length > 0 ? t.criteria : DEFAULT_CRITERIA).map((c) => ({
      id: newId(),
      name: c.name,
      weight: c.weight,
      description: c.description ?? ''
    }));
    args.push({
      id: newId(),
      code: nextCode('ARG', args.map((a) => a.code)),
      title: t.title,
      problemStatement: t.problemStatement,
      objective: t.objective,
      alternatives: t.alternatives.map((name) => ({ id: newId(), name, description: '' })),
      matrix: { scaleMin: 1, scaleMax: 5, criteria, scores: [] },
      constraintEvaluations: [],
      assumptions: [],
      evidenceSummary: '',
      selectedAlternativeId: null,
      selectionRationale: '',
      justification: '',
      risksAndLimitations: '',
      references: [],
      author: input.author,
      reviewer: '',
      revision: 'REV-A',
      status: 'draft',
      archived: false,
      createdAt: now,
      modifiedAt: now,
      revisions: []
    });
  }

  const manifest: ProjectManifest = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: ctx.appVersion,
    project: {
      id: newId(),
      title: input.title,
      description: input.description,
      identifier: input.identifier,
      discipline: template.discipline,
      disciplineLabel: ctx.disciplineLabel,
      templateId: template.id,
      archetypeName: input.customArchetypeName?.trim() || template.archetype,
      templateVersion: template.version,
      author: input.author,
      organization: input.organization,
      unitSystem: input.unitSystem,
      scope: '',
      summary: '',
      sectionLabels: { ...template.sectionLabels },
      isSample: false,
      createdAt: now,
      modifiedAt: now
    },
    folders: [...template.folders],
    requirements,
    arguments: args,
    calculations: [],
    assets: [],
    evidence: [],
    risks: [],
    reviewItems: template.reviewChecklist.map((r) => ({
      id: newId(),
      category: r.category,
      text: r.text,
      source: 'template' as const,
      status: 'open' as const,
      naJustification: '',
      reviewer: '',
      notes: '',
      modifiedAt: now
    })),
    links: [],
    exportHistory: [],
    settings: {
      reportSections: [...ProjectManifestSchema.shape.settings.parse({}).reportSections],
      defaultAssetFolder: template.defaultAssetFolder
    }
  };
  return ProjectManifestSchema.parse(manifest);
}

/** Duplicate a project as a new, non-sample project. Record ids are kept; the project id is new. */
export function cloneAsNewProject(
  manifest: ProjectManifest,
  ctx: { now: string; newId: () => string; appVersion: string }
): ProjectManifest {
  const copy = structuredClone(manifest);
  copy.appVersion = ctx.appVersion;
  copy.project.id = ctx.newId();
  copy.project.isSample = false;
  copy.project.createdAt = ctx.now;
  copy.project.modifiedAt = ctx.now;
  copy.exportHistory = [];
  return copy;
}
