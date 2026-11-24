import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CreateProjectInput } from '../../shared/types/ipc';
import type { FactoryContext } from '../../shared/utilities/projectFactory';
import type { ProjectTemplate } from '../../src/templates/types';

export const FIXTURE_TEMPLATE: ProjectTemplate = {
  id: 'test-fixture-template',
  discipline: 'civil',
  archetype: 'Fixture Footbridge',
  description: 'Inline test fixture.',
  version: '1.0.0',
  icon: 'box',
  sectionLabels: { criteria: 'Design Criteria', constraints: 'Load and Safety Constraints', environment: 'Site Data' },
  folders: [
    '01-Scope-and-Requirements',
    '02-Engineering-Arguments',
    '03-CAD-and-Technical-Drawings',
    '03-CAD-and-Technical-Drawings/Drawings',
    '04-Design-Review-and-Export'
  ],
  defaultAssetFolder: '03-CAD-and-Technical-Drawings/Drawings',
  requirementCategories: ['Loads'],
  suggestedRequirements: [
    {
      section: 'criteria',
      category: 'Loads',
      title: 'Carry the pedestrian live load',
      description: 'Fixture requirement.',
      classification: 'mandatory',
      priority: 'high',
      verificationMethod: 'calculation',
      acceptanceCriterion: 'Editable suggestion.'
    }
  ],
  suggestedArguments: [{ title: 'Truss configuration', problemStatement: 'Choose a truss.', objective: 'Pick one.', alternatives: ['Pratt', 'Warren'] }],
  calculationTypes: [],
  deliverables: [],
  riskCategories: [],
  reviewChecklist: [{ category: 'scope', text: 'Scope is defined.' }],
  designConsiderations: []
};

let counter = 0;
export function fixtureContext(): FactoryContext {
  return {
    now: '2026-11-24T12:00:00.000Z',
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    appVersion: '0.1.0',
    disciplineLabel: 'Civil Engineering'
  };
}

export function fixtureInput(parentDirectory: string, folderName = 'Test-Project'): CreateProjectInput {
  return {
    parentDirectory,
    folderName,
    templateId: FIXTURE_TEMPLATE.id,
    title: 'Fixture Footbridge',
    description: 'Integration test project',
    identifier: 'FX-001',
    author: 'Test Author',
    organization: 'Test Org',
    unitSystem: 'SI',
    writeGitignore: true
  };
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'framelytix-test-'));
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

export async function sha256OfFile(p: string): Promise<string> {
  return createHash('sha256').update(await readFile(p)).digest('hex');
}

/** Hash of every file (relative path + bytes) in a tree, for "never modified" assertions. */
export async function hashTree(root: string): Promise<string> {
  const hash = createHash('sha256');
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        hash.update(`D:${childRel}\n`);
        await walk(abs, childRel);
      } else {
        hash.update(`F:${childRel}\n`);
        hash.update(await readFile(abs));
      }
    }
  }
  await walk(root, '');
  return hash.digest('hex');
}

export async function waitFor(cond: () => boolean, timeoutMs = 4000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
}
