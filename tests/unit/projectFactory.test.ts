import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA, OPTIONAL_CRITERIA, cloneAsNewProject, createManifestFromTemplate } from '../../shared/utilities/projectFactory';
import { ProjectManifestSchema } from '../../shared/schemas/project';
import type { ProjectTemplate } from '../../src/templates/types';
import { makeArgument, makeManifest, makeRequirement } from './fixtures/manifestFixture';

const template: ProjectTemplate = {
  id: 'test-bridge',
  discipline: 'civil',
  archetype: 'Truss Bridge',
  description: 'Fixture',
  version: '1.2.0',
  icon: 'Bridge',
  sectionLabels: { criteria: 'Crit', constraints: 'Cons', environment: 'Env' },
  folders: ['01-Scope-and-Requirements', '02-Engineering-Arguments', '03-CAD-and-Technical-Drawings', '04-Design-Review-and-Export'],
  defaultAssetFolder: '03-CAD-and-Technical-Drawings',
  requirementCategories: ['Loads'],
  suggestedRequirements: [
    { section: 'constraints', category: 'Loads', title: 'Span', description: 'd', classification: 'mandatory', priority: 'high', verificationMethod: 'calculation', acceptanceCriterion: 'Edit me', unit: 'm' },
    { section: 'criteria', category: 'Cost', title: 'Budget', description: 'd', classification: 'objective', priority: 'low', verificationMethod: 'analysis', acceptanceCriterion: '' }
  ],
  suggestedArguments: [
    { title: 'Structural type', problemStatement: 'p', objective: 'o', alternatives: ['Warren', 'Pratt'] },
    { title: 'Deck', problemStatement: 'p', objective: 'o', alternatives: ['Timber', 'Steel'], criteria: [{ name: 'Weight', weight: 100 }] }
  ],
  calculationTypes: [{ title: 'Bending', purpose: 'p', equation: 'M' }],
  deliverables: [],
  riskCategories: [],
  reviewChecklist: [{ category: 'scope', text: 'Scope is defined' }, { category: 'risks', text: 'Risks recorded' }],
  designConsiderations: []
};

const input = { title: 'My Bridge', description: 'desc', identifier: 'MB-1', author: 'Sam', organization: 'Org', unitSystem: 'SI' as const };

function make(counter = { n: 0 }, extra: Partial<typeof input & { customArchetypeName: string }> = {}) {
  return createManifestFromTemplate(template, { ...input, ...extra }, {
    now: '2026-02-02T00:00:00.000Z',
    newId: () => `id-${++counter.n}`,
    appVersion: '0.1.0',
    disciplineLabel: 'Civil'
  });
}

describe('createManifestFromTemplate', () => {
  it('produces a schema-valid manifest from template data', () => {
    const m = make();
    expect(ProjectManifestSchema.safeParse(m).success).toBe(true);
    expect(m.project).toMatchObject({
      title: 'My Bridge', identifier: 'MB-1', discipline: 'civil', disciplineLabel: 'Civil', templateId: 'test-bridge',
      archetypeName: 'Truss Bridge', templateVersion: '1.2.0', author: 'Sam', isSample: false
    });
    expect(m.project.sectionLabels).toEqual(template.sectionLabels);
    expect(m.folders).toEqual(template.folders);
    expect(m.settings.defaultAssetFolder).toBe('03-CAD-and-Technical-Drawings');
    expect(m.links).toEqual([]);
    expect(m.calculations).toEqual([]);
  });

  it('numbers requirements and arguments and marks template suggestions', () => {
    const m = make();
    expect(m.requirements.map((r) => r.code)).toEqual(['REQ-001', 'REQ-002']);
    expect(m.requirements[0]!).toMatchObject({ source: 'Template suggestion — edit or remove', status: 'not-started', targetValue: '', unit: 'm' });
    expect(m.requirements[1]!.unit).toBe('');
    expect(m.arguments.map((a) => a.code)).toEqual(['ARG-001', 'ARG-002']);
  });

  it('builds unscored matrices with default or template criteria and fresh ids', () => {
    const m = make();
    const a1 = m.arguments[0]!;
    const a2 = m.arguments[1]!;
    expect(a1.matrix.criteria.map((c) => [c.name, c.weight])).toEqual(DEFAULT_CRITERIA.map((c) => [c.name, c.weight]));
    expect(a1.matrix.criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(a2.matrix.criteria.map((c) => c.name)).toEqual(['Weight']);
    expect(a1.matrix.scores).toEqual([]);
    expect(a1).toMatchObject({ status: 'draft', revision: 'REV-A', author: 'Sam', selectedAlternativeId: null });
    expect(a1.alternatives.map((a) => a.name)).toEqual(['Warren', 'Pratt']);
    const ids = [m.project.id, ...m.requirements.map((r) => r.id), ...m.arguments.flatMap((a) => [a.id, ...a.alternatives.map((x) => x.id), ...a.matrix.criteria.map((c) => c.id)]), ...m.reviewItems.map((r) => r.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('creates review items from the checklist and honours a custom archetype name', () => {
    const m = make({ n: 0 }, { customArchetypeName: '  Footbridge  ' });
    expect(m.reviewItems.map((r) => [r.category, r.source, r.status])).toEqual([['scope', 'template', 'open'], ['risks', 'template', 'open']]);
    expect(m.project.archetypeName).toBe('Footbridge');
    expect(make({ n: 0 }, { customArchetypeName: '   ' }).project.archetypeName).toBe('Truss Bridge');
  });

  it('does not share references with the template', () => {
    const m = make();
    m.folders.push('x');
    expect(template.folders).toHaveLength(4);
  });

  it('exposes the optional criteria list', () => {
    expect(OPTIONAL_CRITERIA).toContain('Durability');
    expect(OPTIONAL_CRITERIA).toHaveLength(6);
  });
});

describe('cloneAsNewProject', () => {
  it('assigns a new project id, clears the sample flag and keeps record ids', () => {
    const src = makeManifest({
      project: { ...makeManifest().project, isSample: true },
      requirements: [makeRequirement()],
      arguments: [makeArgument()]
    });
    const copy = cloneAsNewProject(src, { now: '2027-01-01T00:00:00.000Z', newId: () => 'new-project', appVersion: '9.9.9' });
    expect(copy.project.id).toBe('new-project');
    expect(copy.project.isSample).toBe(false);
    expect(copy.project.createdAt).toBe('2027-01-01T00:00:00.000Z');
    expect(copy.project.modifiedAt).toBe('2027-01-01T00:00:00.000Z');
    expect(copy.appVersion).toBe('9.9.9');
    expect(copy.requirements[0]!.id).toBe('req-1');
    expect(src.project.id).toBe('project-1');
    expect(src.project.isSample).toBe(true);
    expect(copy.arguments).not.toBe(src.arguments);
    expect(ProjectManifestSchema.safeParse(copy).success).toBe(true);
  });
});
