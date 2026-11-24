import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { ProjectManifestSchema, type ProjectManifest } from '../../shared/schemas/project';
import { evaluateCalculation } from '../../shared/utilities/expression';
import { computeMatrix, mandatoryRequirementsForArgument } from '../../shared/utilities/decisionMatrix';

const SAMPLE = join(__dirname, '..', '..', 'samples', 'pedestrian-truss-bridge');
const raw = JSON.parse(readFileSync(join(SAMPLE, 'framelytix-project.json'), 'utf8'));
const manifest: ProjectManifest = ProjectManifestSchema.parse(raw);
const assetPath = (rel: string) => join(SAMPLE, ...rel.split('/'));

describe('bundled sample project: pedestrian-truss-bridge', () => {
  it('parses with the manifest schema and is flagged as a sample', () => {
    expect(ProjectManifestSchema.safeParse(raw).success).toBe(true);
    expect(manifest.project.isSample).toBe(true);
    expect(manifest.project.identifier).toBe('PTB-2026');
  });

  it('is serialised in schema key order (re-serialising yields no diff)', () => {
    expect(JSON.stringify(manifest, null, 2) + '\n').toBe(readFileSync(join(SAMPLE, 'framelytix-project.json'), 'utf8'));
  });

  it('has unique codes per record type', () => {
    const unique = (codes: string[]) => expect(new Set(codes).size).toBe(codes.length);
    unique(manifest.requirements.map((r) => r.code));
    unique(manifest.arguments.map((a) => a.code));
    unique(manifest.calculations.map((c) => c.code));
    unique(manifest.evidence.map((e) => e.code));
    unique(manifest.risks.map((r) => r.code));
    unique(manifest.assets.map((a) => a.drawingId));
    const ids = [
      ...manifest.requirements, ...manifest.arguments, ...manifest.calculations, ...manifest.assets,
      ...manifest.evidence, ...manifest.risks
    ].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has every link endpoint resolving to an existing record', () => {
    const byType: Record<string, Set<string>> = {
      requirement: new Set(manifest.requirements.map((r) => r.id)),
      argument: new Set(manifest.arguments.map((r) => r.id)),
      calculation: new Set(manifest.calculations.map((r) => r.id)),
      asset: new Set(manifest.assets.map((r) => r.id)),
      evidence: new Set(manifest.evidence.map((r) => r.id)),
      risk: new Set(manifest.risks.map((r) => r.id))
    };
    for (const l of manifest.links) {
      expect(byType[l.a.type]?.has(l.a.id), `link ${l.id} endpoint a`).toBe(true);
      expect(byType[l.b.type]?.has(l.b.id), `link ${l.id} endpoint b`).toBe(true);
    }
  });

  it('leaves REQ-010 intentionally without links', () => {
    const req = manifest.requirements.find((r) => r.code === 'REQ-010')!;
    expect(manifest.links.some((l) => l.a.id === req.id || l.b.id === req.id)).toBe(false);
  });

  it('has every asset file present with a matching size', () => {
    expect(manifest.assets.length).toBeGreaterThanOrEqual(7);
    for (const a of manifest.assets) {
      const p = assetPath(a.relativePath);
      expect(existsSync(p), a.relativePath).toBe(true);
      expect(statSync(p).size, a.relativePath).toBe(a.sizeBytes);
    }
    for (const f of manifest.folders) expect(existsSync(assetPath(f)), f).toBe(true);
    expect(existsSync(join(SAMPLE, '.framelytix', 'backups'))).toBe(true);
  });

  it('has a valid PDF drawing that pdf-lib can reload', async () => {
    const buf = readFileSync(assetPath('03-CAD-and-Technical-Drawings/AutoCAD-2D/PTB-GA-001_General-Arrangement.pdf'));
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([width, height]).toEqual([1224, 792]);
  });

  it('has a valid binary STL (size = 84 + 50 x triangles, > 100 triangles)', () => {
    const buf = readFileSync(assetPath('03-CAD-and-Technical-Drawings/3D-Models/PTB-Pratt-Truss-Concept.stl'));
    const count = buf.readUInt32LE(80);
    expect(count).toBeGreaterThan(100);
    expect(buf.length).toBe(84 + 50 * count);
    expect(buf.subarray(0, 80).toString('latin1')).toContain('NOT FOR CONSTRUCTION');
    // All coordinates finite; bounding box matches the concept geometry (metres).
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < count; i++) {
      const o = 84 + 50 * i;
      for (let k = 0; k < 12; k++) expect(Number.isFinite(buf.readFloatLE(o + k * 4))).toBe(true);
      for (let vtx = 0; vtx < 3; vtx++) {
        const x = buf.readFloatLE(o + 12 + vtx * 12);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    expect(minX).toBeLessThan(0);
    expect(maxX).toBeGreaterThan(24);
  });

  it('has static SVGs with no scripts or external references', () => {
    for (const rel of [
      '03-CAD-and-Technical-Drawings/Diagrams-and-Schematics/truss-configurations.svg',
      '03-CAD-and-Technical-Drawings/Diagrams-and-Schematics/load-diagram.svg'
    ]) {
      const s = readFileSync(assetPath(rel), 'utf8');
      expect(s).toContain('<svg');
      expect(s).not.toContain('<script');
      expect(s).not.toContain('href="http');
      expect(s).not.toContain('xlink:href="http');
    }
  });

  it('has verification notes or linked evidence for every verified requirement', () => {
    const verified = manifest.requirements.filter((r) => r.status === 'verified');
    expect(verified.length).toBeGreaterThan(0);
    for (const r of verified) {
      const hasEvidence = manifest.links.some(
        (l) => (l.a.id === r.id && l.b.type === 'evidence') || (l.b.id === r.id && l.a.type === 'evidence')
      );
      expect(r.verificationNotes.trim().length > 0 || hasEvidence, r.code).toBe(true);
    }
  });

  it('evaluates each calculation expression to its stated result', () => {
    expect(manifest.calculations).toHaveLength(5);
    for (const c of manifest.calculations) {
      const r = evaluateCalculation(c);
      expect(r.ok, `${c.code}: ${r.ok ? '' : r.error}`).toBe(true);
      if (r.ok) {
        const expected = Number(c.resultValue);
        expect(Math.abs(r.value - expected) / Math.abs(expected), c.code).toBeLessThan(1e-9);
      }
    }
  });

  it('ARG-001: Warren scores highest but is ineligible; Pratt is the provisional recommendation', () => {
    const arg = manifest.arguments.find((a) => a.code === 'ARG-001')!;
    const result = computeMatrix(arg, mandatoryRequirementsForArgument(manifest, arg.id));
    const id = (name: string) => arg.alternatives.find((a) => a.name.startsWith(name))!.id;
    expect(result.highestScoreIds).toContain(id('Warren'));
    expect(result.alternatives.find((a) => a.alternativeId === id('Warren'))!.eligibility).toBe('ineligible');
    expect(result.recommendedIds).toContain(id('Pratt'));
    expect(result.recommendedIds).not.toContain(id('Warren'));
    expect(result.recommendedIsProvisional).toBe(true);
    expect(arg.selectedAlternativeId).toBe(id('Pratt'));
    expect(arg.revisions).toHaveLength(1);
    expect(arg.revisions[0]!.snapshot.selectedAlternativeId).toBe(id('Warren'));
    const score = (n: string) => result.alternatives.find((a) => a.alternativeId === id(n))!.weightedScore!;
    expect(score('Pratt')).toBeCloseTo(3.7, 9);
    expect(score('Warren')).toBeCloseTo(4.3, 9);
    expect(score('Howe')).toBeCloseTo(3.0, 9);
  });

  it('ARG-002: galvanized steel is the eligible recommendation', () => {
    const arg = manifest.arguments.find((a) => a.code === 'ARG-002')!;
    const result = computeMatrix(arg, mandatoryRequirementsForArgument(manifest, arg.id));
    const galv = arg.alternatives.find((a) => a.name.startsWith('Galvanized'))!.id;
    expect(result.recommendedIds).toEqual([galv]);
    expect(arg.selectedAlternativeId).toBe(galv);
  });

  it('ARG-003: the incomplete alternative has a null weighted score', () => {
    const arg = manifest.arguments.find((a) => a.code === 'ARG-003')!;
    const result = computeMatrix(arg, mandatoryRequirementsForArgument(manifest, arg.id));
    const nulls = result.alternatives.filter((a) => a.weightedScore === null);
    expect(nulls).toHaveLength(1);
    expect(nulls[0]!.alternativeId).toBe(arg.alternatives.find((a) => a.name.startsWith('FRP'))!.id);
  });
});
