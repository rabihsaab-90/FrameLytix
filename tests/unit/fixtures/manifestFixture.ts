import {
  ProjectManifestSchema,
  type EngineeringArgument,
  type ProjectManifest,
  type Requirement
} from '../../../shared/schemas/project';

export const NOW = '2026-01-01T00:00:00.000Z';

export function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    code: 'REQ-001',
    title: 'Requirement',
    description: '',
    section: 'constraints',
    category: '',
    priority: 'medium',
    classification: 'mandatory',
    acceptanceCriterion: '',
    targetValue: '',
    unit: '',
    source: '',
    verificationMethod: 'document-review',
    status: 'not-started',
    verificationNotes: '',
    notes: '',
    notApplicableLinks: { argument: '', calculation: '', asset: '' },
    archived: false,
    createdAt: NOW,
    modifiedAt: NOW,
    ...overrides
  };
}

/** Argument with alternatives A/B (ids alt-a, alt-b) and criteria Cost/Safety (ids crit-1, crit-2), no scores. */
export function makeArgument(overrides: Partial<EngineeringArgument> = {}): EngineeringArgument {
  return {
    id: 'arg-1',
    code: 'ARG-001',
    title: 'Structural system',
    problemStatement: 'Problem',
    objective: 'Objective',
    alternatives: [
      { id: 'alt-a', name: 'Warren truss', description: '' },
      { id: 'alt-b', name: 'Pratt truss', description: '' }
    ],
    matrix: {
      scaleMin: 1,
      scaleMax: 5,
      criteria: [
        { id: 'crit-1', name: 'Cost', weight: 40, description: '' },
        { id: 'crit-2', name: 'Safety', weight: 60, description: '' }
      ],
      scores: []
    },
    constraintEvaluations: [],
    assumptions: ['Assumption'],
    evidenceSummary: '',
    selectedAlternativeId: null,
    selectionRationale: '',
    justification: 'Because.',
    risksAndLimitations: '',
    references: [],
    author: 'Author',
    reviewer: '',
    revision: 'REV-A',
    status: 'draft',
    archived: false,
    createdAt: NOW,
    modifiedAt: NOW,
    revisions: [],
    ...overrides
  };
}

export function makeManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  const base: ProjectManifest = {
    schemaVersion: 1,
    appVersion: '0.1.0',
    project: {
      id: 'project-1',
      title: 'Test project',
      description: '',
      identifier: 'TEST-001',
      discipline: 'civil',
      disciplineLabel: 'Civil',
      templateId: 'test-template',
      archetypeName: 'Test',
      templateVersion: '1.0.0',
      author: 'Author',
      organization: '',
      unitSystem: 'SI',
      scope: 'Scope statement',
      summary: '',
      sectionLabels: { criteria: 'Criteria', constraints: 'Constraints', environment: 'Environment' },
      isSample: false,
      createdAt: NOW,
      modifiedAt: NOW
    },
    folders: [],
    requirements: [],
    arguments: [],
    calculations: [],
    assets: [],
    evidence: [],
    risks: [],
    reviewItems: [],
    links: [],
    exportHistory: [],
    settings: { reportSections: ['cover', 'summary'], defaultAssetFolder: '' }
  };
  return ProjectManifestSchema.parse({ ...base, ...overrides });
}
