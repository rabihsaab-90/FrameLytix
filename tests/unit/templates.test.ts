import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISCIPLINES,
  TEMPLATES,
  getDiscipline,
  getTemplate,
  getTemplatesForDiscipline
} from '../../src/templates/templates';
import { PHASE_FOLDERS } from '../../src/templates/types';
import { DisciplineSchema, ReviewCategorySchema } from '../../shared/schemas/project';

const EXPECTED_IDS: Record<string, string[]> = {
  civil: ['civil-bridge', 'civil-foundation', 'civil-water-drainage', 'civil-roadway', 'civil-building-structure'],
  mechanical: ['mech-robotics', 'mech-hvac', 'mech-pressure-vessel', 'mech-transmission', 'mech-machine-component'],
  aerospace: ['aero-wing', 'aero-uav', 'aero-propulsion', 'aero-satellite-structure'],
  electrical: ['elec-power-distribution', 'elec-embedded-control', 'elec-pcb', 'elec-renewable', 'elec-motor-control'],
  custom: ['custom-generic', 'custom-user-defined']
};

const RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)
]);

const lucideDts = readFileSync(join(process.cwd(), 'node_modules', 'lucide-react', 'dist', 'lucide-react.d.ts'), 'utf8');
const lucideHas = (name: string): boolean => new RegExp(`declare const ${name}\\b`).test(lucideDts);

describe('discipline catalogue', () => {
  it('lists every discipline once with the expected names', () => {
    expect(DISCIPLINES.map((d) => d.id).sort()).toEqual([...DisciplineSchema.options].sort());
    expect(DISCIPLINES.map((d) => d.name)).toEqual([
      'Civil Engineering', 'Mechanical Engineering', 'Aerospace Engineering', 'Electrical Engineering', 'Custom Discipline'
    ]);
    for (const d of DISCIPLINES) expect(d.description.length).toBeGreaterThan(20);
  });

  it('resolves disciplines by id', () => {
    expect(getDiscipline('civil')?.name).toBe('Civil Engineering');
    expect(getDiscipline('nope')).toBeUndefined();
  });

  it('uses icons that exist in lucide-react', () => {
    for (const d of DISCIPLINES) expect(lucideHas(d.icon), `${d.id}: ${d.icon}`).toBe(true);
    for (const t of TEMPLATES) expect(lucideHas(t.icon), `${t.id}: ${t.icon}`).toBe(true);
  });
});

describe('template identity', () => {
  it('has unique kebab-case ids', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('contains exactly the specified archetypes per discipline', () => {
    for (const [disc, ids] of Object.entries(EXPECTED_IDS)) {
      const found = getTemplatesForDiscipline(disc as never).map((t) => t.id);
      expect(found.sort()).toEqual([...ids].sort());
    }
    expect(TEMPLATES).toHaveLength(21);
    expect(getTemplatesForDiscipline('civil')).toHaveLength(5);
    expect(getTemplatesForDiscipline('mechanical')).toHaveLength(5);
    expect(getTemplatesForDiscipline('aerospace')).toHaveLength(4);
    expect(getTemplatesForDiscipline('electrical')).toHaveLength(5);
    expect(getTemplatesForDiscipline('custom')).toHaveLength(2);
  });

  it('returns only templates of the requested discipline', () => {
    for (const d of DISCIPLINES) {
      const list = getTemplatesForDiscipline(d.id);
      expect(list.length).toBeGreaterThanOrEqual(1);
      for (const t of list) expect(t.discipline).toBe(d.id);
    }
  });

  it('looks templates up by id and uses the specified archetype names', () => {
    expect(getTemplate('civil-bridge')?.archetype).toBe('Bridge Design');
    expect(getTemplate('elec-pcb')?.archetype).toBe('PCB Design');
    expect(getTemplate('custom-user-defined')?.archetype).toBe('User-defined Project Type');
    expect(getTemplate('missing')).toBeUndefined();
  });

  it('has semver versions', () => {
    for (const t of TEMPLATES) expect(t.version, t.id).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('template folders', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s has a valid folder tree', (_id, t) => {
    for (const phase of PHASE_FOLDERS) expect(t.folders).toContain(phase);
    expect(new Set(t.folders).size).toBe(t.folders.length);

    for (const f of t.folders) {
      expect(f.startsWith('/'), f).toBe(false);
      expect(f.includes('\\'), f).toBe(false);
      expect(/^[A-Za-z]:/.test(f), f).toBe(false);
      const segs = f.split('/');
      for (const s of segs) {
        expect(s.length, `empty segment in ${f}`).toBeGreaterThan(0);
        expect(s, f).not.toBe('..');
        expect(s, f).not.toBe('.');
        expect(s, f).not.toBe('.framelytix');
        // eslint-disable-next-line no-control-regex -- deliberately checks for control characters
        expect(/[<>:"|?*\\\u0000-\u001f]/.test(s), `invalid char in ${f}`).toBe(false);
        expect(/[. ]$/.test(s), `trailing dot or space in ${f}`).toBe(false);
        expect(RESERVED.has(s.split('.')[0]!.toUpperCase()), `reserved name in ${f}`).toBe(false);
        expect(s, f).toMatch(/^[A-Za-z0-9][A-Za-z0-9-]*$/);
      }
      if (segs.length > 1) {
        expect(t.folders, `parent of ${f}`).toContain(segs.slice(0, -1).join('/'));
      }
    }
    expect(t.folders.some((f) => f.toLowerCase().includes('.framelytix'))).toBe(false);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s has a phase 3 default asset folder and CAD subfolders', (_id, t) => {
    expect(t.folders).toContain(t.defaultAssetFolder);
    expect(t.defaultAssetFolder.startsWith('03-CAD-and-Technical-Drawings/')).toBe(true);
    const cad = t.folders.filter((f) => f.startsWith('03-CAD-and-Technical-Drawings/'));
    expect(cad.length).toBeGreaterThanOrEqual(2);
    expect(t.folders).toContain('04-Design-Review-and-Export/Reports');
  });

  it('gives the PCB template its electronics-specific drawing folders', () => {
    const pcb = getTemplate('elec-pcb')!;
    for (const f of ['Schematics', 'PCB-Layout', 'Enclosure-3D-Models']) {
      expect(pcb.folders).toContain(`03-CAD-and-Technical-Drawings/${f}`);
    }
  });
});

describe('template content', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s has well-formed requirements', (_id, t) => {
    expect(t.requirementCategories.length).toBeGreaterThanOrEqual(5);
    expect(t.requirementCategories.length).toBeLessThanOrEqual(9);
    expect(new Set(t.requirementCategories).size).toBe(t.requirementCategories.length);

    const reqs = t.suggestedRequirements;
    expect(reqs.length).toBeGreaterThanOrEqual(6);
    expect(reqs.length).toBeLessThanOrEqual(9);
    for (const section of ['criteria', 'constraints', 'environment'] as const) {
      expect(reqs.some((r) => r.section === section), `${t.id} lacks ${section}`).toBe(true);
    }
    expect(reqs.filter((r) => r.classification === 'mandatory').length).toBeGreaterThanOrEqual(2);
    expect(reqs.some((r) => r.classification === 'objective')).toBe(true);
    expect(reqs.some((r) => r.classification === 'preference')).toBe(true);
    expect(new Set(reqs.map((r) => r.title)).size).toBe(reqs.length);
    for (const r of reqs) {
      expect(t.requirementCategories, `${t.id}: ${r.title}`).toContain(r.category);
      expect(r.title.length).toBeGreaterThan(5);
      expect(r.description.length).toBeGreaterThan(10);
      expect(r.acceptanceCriterion.length).toBeGreaterThan(15);
      // No fabricated clause references.
      expect(/(clause|section|§)\s*\d/i.test(r.acceptanceCriterion), r.title).toBe(false);
    }
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s has valid decisions', (_id, t) => {
    expect(t.suggestedArguments.length).toBeGreaterThanOrEqual(2);
    expect(t.suggestedArguments.length).toBeLessThanOrEqual(4);
    for (const a of t.suggestedArguments) {
      expect(a.alternatives.length, a.title).toBeGreaterThanOrEqual(2);
      expect(a.alternatives.length, a.title).toBeLessThanOrEqual(4);
      expect(new Set(a.alternatives).size).toBe(a.alternatives.length);
      expect(a.problemStatement.length).toBeGreaterThan(10);
      expect(a.objective.length).toBeGreaterThan(10);
      if (a.criteria) {
        const total = a.criteria.reduce((s, c) => s + c.weight, 0);
        expect(Math.abs(total - 100), `${t.id}/${a.title} weights total ${total}`).toBeLessThan(0.001);
        for (const c of a.criteria) {
          expect(c.weight).toBeGreaterThanOrEqual(0);
          if (c.name === 'Cost') expect(c.description).toContain('higher score = more favourable (lower) cost');
        }
      }
    }
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s has calculations, lists and checklist within bounds', (_id, t) => {
    expect(t.calculationTypes.length).toBeGreaterThanOrEqual(2);
    expect(t.calculationTypes.length).toBeLessThanOrEqual(4);
    for (const c of t.calculationTypes) {
      expect(c.equation.length).toBeGreaterThan(0);
      // Braces must balance so KaTeX can parse the source.
      let depth = 0;
      for (const ch of c.equation) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        expect(depth, `${t.id}: ${c.equation}`).toBeGreaterThanOrEqual(0);
      }
      expect(depth, `${t.id}: ${c.equation}`).toBe(0);
    }
    expect(t.deliverables.length).toBeGreaterThanOrEqual(3);
    expect(t.deliverables.length).toBeLessThanOrEqual(6);
    expect(t.riskCategories.length).toBeGreaterThanOrEqual(4);
    expect(t.riskCategories.length).toBeLessThanOrEqual(6);
    expect(t.designConsiderations.length).toBeGreaterThanOrEqual(4);
    expect(t.designConsiderations.length).toBeLessThanOrEqual(8);
    expect(t.reviewChecklist.length).toBeGreaterThanOrEqual(8);
    expect(t.reviewChecklist.length).toBeLessThanOrEqual(14);
    for (const item of t.reviewChecklist) {
      expect(ReviewCategorySchema.options).toContain(item.category);
      expect(item.text.length).toBeGreaterThan(10);
    }
    for (const label of Object.values(t.sectionLabels)) expect(label.length).toBeGreaterThan(3);
  });

  it('shows specific section labels for representative archetypes', () => {
    expect(getTemplate('civil-bridge')!.sectionLabels).toEqual({
      criteria: 'Design Criteria',
      constraints: 'Load and Safety Constraints',
      environment: 'Site and Environment Data'
    });
    expect(getTemplate('elec-pcb')!.sectionLabels.constraints).toBe('Electrical and Safety Constraints');
    expect(getTemplate('mech-hvac')!.sectionLabels.environment).toBe('Building and Climate Data');
  });

  it('is genuinely archetype-specific, not renamed copies', () => {
    const signatures = TEMPLATES.map((t) => t.suggestedRequirements.map((r) => r.title).sort().join('|'));
    expect(new Set(signatures).size).toBe(TEMPLATES.length);
    const folderSigs = TEMPLATES.map((t) => [...t.folders].sort().join('|'));
    expect(new Set(folderSigs).size).toBe(TEMPLATES.length);
    const categorySigs = TEMPLATES.map((t) => [...t.requirementCategories].sort().join('|'));
    expect(new Set(categorySigs).size).toBe(TEMPLATES.length);
    // Requirement titles should be (almost) unique across the whole catalogue.
    const allTitles = TEMPLATES.flatMap((t) => t.suggestedRequirements.map((r) => r.title));
    const dupes = allTitles.length - new Set(allTitles).size;
    expect(dupes).toBeLessThanOrEqual(2);
  });

  it('uses Canadian spellings', () => {
    const text = JSON.stringify(TEMPLATES);
    for (const word of ['analyze', 'color', 'meter ', 'center', 'behavior', 'modeling', 'favorable']) {
      expect(text.toLowerCase(), word).not.toContain(word);
    }
  });
});
