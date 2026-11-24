import { describe, expect, it } from 'vitest';
import {
  addLink,
  buildTraceabilityRows,
  detectTraceabilityIssues,
  evidenceCoverage,
  isLinked,
  linkedRefs,
  removeLink,
  removeLinksFor,
  resolveRef,
  traceabilityCoverage
} from '../../shared/utilities/traceability';
import type { Asset, Evidence } from '../../shared/schemas/project';
import { NOW, makeArgument, makeManifest, makeRequirement } from './fixtures/manifestFixture';

const req = (id: string) => ({ type: 'requirement' as const, id });
const argRef = (id: string) => ({ type: 'argument' as const, id });
const opts = (id: string) => ({ id, now: NOW });

const asset = (o: Partial<Asset> = {}): Asset => ({
  id: 'as-1', drawingId: 'DRW-001', title: '', relativePath: '03/plan.dwg', description: '', revision: '',
  modelUnit: '', sizeBytes: 1, fileModifiedAt: null, importedAt: NOW, ...o
});
const evidence = (o: Partial<Evidence> = {}): Evidence => ({
  id: 'ev-1', code: 'VER-001', title: 'Test report', method: 'physical-test', summary: '', outcome: 'supports',
  recordedBy: '', date: '', createdAt: NOW, modifiedAt: NOW, ...o
});

describe('link management', () => {
  const m0 = makeManifest({ requirements: [makeRequirement()], arguments: [makeArgument()] });

  it('adds links immutably, undirected, without duplicates or self-links', () => {
    const m1 = addLink(m0, req('req-1'), argRef('arg-1'), { id: 'l1', now: NOW, note: 'n' });
    expect(m0.links).toHaveLength(0);
    expect(m1.links).toHaveLength(1);
    expect(m1.links[0]!.note).toBe('n');
    expect(isLinked(m1, argRef('arg-1'), req('req-1'))).toBe(true);
    expect(addLink(m1, argRef('arg-1'), req('req-1'), opts('l2')).links).toHaveLength(1);
    expect(addLink(m1, req('req-1'), req('req-1'), opts('l3')).links).toHaveLength(1);
  });

  it('removes in either direction and removes all links for a record', () => {
    let m = addLink(m0, req('req-1'), argRef('arg-1'), opts('l1'));
    m = addLink(m, req('req-1'), { type: 'calculation', id: 'c1' }, opts('l2'));
    expect(removeLink(m, argRef('arg-1'), req('req-1')).links.map((l) => l.id)).toEqual(['l2']);
    expect(removeLinksFor(m, req('req-1')).links).toEqual([]);
    expect(removeLinksFor(m, argRef('arg-1')).links.map((l) => l.id)).toEqual(['l2']);
  });

  it('linkedRefs works from either end and filters by type', () => {
    let m = addLink(m0, req('req-1'), argRef('arg-1'), opts('l1'));
    m = addLink(m, { type: 'calculation', id: 'c1' }, req('req-1'), opts('l2'));
    expect(linkedRefs(m, req('req-1')).map((r) => r.type).sort()).toEqual(['argument', 'calculation']);
    expect(linkedRefs(m, req('req-1'), 'calculation')).toEqual([{ type: 'calculation', id: 'c1' }]);
    expect(linkedRefs(m, argRef('arg-1'))).toEqual([req('req-1')]);
  });
});

describe('resolveRef', () => {
  it('resolves codes and titles, including assets and deleted records', () => {
    const m = makeManifest({
      requirements: [makeRequirement({ title: 'Span' })],
      assets: [asset(), asset({ id: 'as-2', drawingId: '', title: '', relativePath: 'a/b/model.stl' })]
    });
    expect(resolveRef(m, req('req-1'))).toMatchObject({ code: 'REQ-001', title: 'Span', exists: true, archived: false });
    expect(resolveRef(m, { type: 'asset', id: 'as-1' })).toMatchObject({ code: 'DRW-001', title: 'plan.dwg' });
    expect(resolveRef(m, { type: 'asset', id: 'as-2' })).toMatchObject({ code: 'model.stl', title: 'model.stl' });
    expect(resolveRef(m, req('nope'))).toMatchObject({ exists: false });
  });
});

describe('rows and coverage', () => {
  function project() {
    let m = makeManifest({
      requirements: [
        makeRequirement({ id: 'r1', code: 'REQ-001', status: 'verified', verificationNotes: 'Checked by hand calc.' }),
        makeRequirement({ id: 'r2', code: 'REQ-002' }),
        makeRequirement({ id: 'r3', code: 'REQ-003', status: 'not-applicable' }),
        makeRequirement({ id: 'r4', code: 'REQ-004', archived: true }),
        makeRequirement({ id: 'r5', code: 'REQ-005', classification: 'objective' })
      ],
      arguments: [makeArgument()],
      assets: [asset()],
      evidence: [evidence()]
    });
    m = addLink(m, req('r1'), argRef('arg-1'), opts('l1'));
    m = addLink(m, req('r2'), { type: 'asset', id: 'as-1' }, opts('l2'));
    m = addLink(m, req('r5'), { type: 'evidence', id: 'ev-1' }, opts('l3'));
    return m;
  }

  it('builds one row per non-archived requirement with evidence status', () => {
    const rows = buildTraceabilityRows(project(), new Set(['03/plan.dwg']));
    expect(rows.map((r) => r.requirement.code)).toEqual(['REQ-001', 'REQ-002', 'REQ-003', 'REQ-005']);
    const r1 = rows[0]!;
    const r2 = rows[1]!;
    const r5 = rows[3]!;
    expect(r1.evidenceStatus).toBe('notes-only');
    expect(r1.arguments.map((a) => a.code)).toEqual(['ARG-001']);
    expect(r2.evidenceStatus).toBe('missing');
    expect(r2.missingAssets.map((a) => a.code)).toEqual(['DRW-001']);
    expect(r5.evidenceStatus).toBe('has-evidence');
  });

  it('computes coverage with an explicit definition', () => {
    const c = traceabilityCoverage(project());
    // Applicable: r1, r2, r5 (r3 n/a, r4 archived). All three have a linked record.
    expect(c).toMatchObject({ covered: 3, total: 3, ratio: 1 });
    expect(c.definition).toContain('Not applicable');
    const e = evidenceCoverage(project());
    // r1 via notes, r5 via evidence; r2 none.
    expect(e).toMatchObject({ covered: 2, total: 3 });
    expect(e.ratio).toBeCloseTo(2 / 3);
  });

  it('does not count links to archived or deleted records as coverage; null ratio when empty', () => {
    let m = makeManifest({
      requirements: [makeRequirement({ id: 'r1' })],
      arguments: [makeArgument({ archived: true })]
    });
    m = addLink(m, req('r1'), argRef('arg-1'), opts('l1'));
    m = addLink(m, req('r1'), { type: 'calculation', id: 'deleted' }, opts('l2'));
    expect(traceabilityCoverage(m)).toMatchObject({ covered: 0, total: 1, ratio: 0 });
    expect(traceabilityCoverage(makeManifest()).ratio).toBeNull();
    expect(buildTraceabilityRows(m, new Set())[0]!.brokenLinks).toHaveLength(2);
  });
});

describe('detectTraceabilityIssues', () => {
  const ids = (issues: { id: string }[]) => issues.map((i) => i.id);

  it('reports each rule with the correct severity', () => {
    let m = makeManifest({
      requirements: [
        makeRequirement({ id: 'r1', code: 'REQ-001', status: 'verified' }), // verified w/o evidence -> critical
        makeRequirement({ id: 'r2', code: 'REQ-002', status: 'in-progress', verificationNotes: 'notes' }), // mandatory, unverified, no arg
        makeRequirement({
          id: 'r3', code: 'REQ-003', status: 'verified', verificationNotes: 'ok',
          notApplicableLinks: { argument: 'Not design related', calculation: '', asset: '' }
        })
      ],
      arguments: [makeArgument({ id: 'a1' }), makeArgument({ id: 'a2', code: 'ARG-002', archived: true })],
      assets: [asset()]
    });
    m = addLink(m, req('r1'), { type: 'calculation', id: 'gone' }, opts('l1'));
    const issues = detectTraceabilityIssues(m, new Set(['03/plan.dwg']));
    const byId = Object.fromEntries(issues.map((i) => [i.id, i]));

    expect(byId['req-verified-no-evidence:r1']!.severity).toBe('critical');
    expect(byId['req-verified-no-evidence:r1']!.message).toContain('marked Verified but verification evidence is missing');
    expect(byId['req-no-evidence:r1']!.severity).toBe('warning');
    expect(byId['req-no-evidence:r2']).toBeUndefined(); // has notes
    expect(byId['req-mandatory-no-argument:r2']!.severity).toBe('warning');
    expect(byId['req-mandatory-no-argument:r3']).toBeUndefined(); // justified n/a
    expect(byId['req-mandatory-unverified:r2']!.message).toContain('Unverified mandatory constraint');
    expect(byId['req-mandatory-unverified:r3']).toBeUndefined();
    expect(byId['asset-missing:as-1']!.severity).toBe('critical');
    expect(byId['arg-no-requirements:a1']!.severity).toBe('warning');
    expect(byId['arg-no-requirements:a2']).toBeUndefined(); // archived
    expect(ids(issues).some((i) => i.startsWith('broken-link:r1:calculation:gone'))).toBe(true);
    expect(issues.find((i) => i.id.startsWith('broken-link:r1'))!.severity).toBe('critical');
  });

  it('reports a link to an archived record as a warning, and is clean for a fully traced requirement', () => {
    let m = makeManifest({
      requirements: [makeRequirement({ id: 'r1', status: 'verified' })],
      arguments: [makeArgument({ id: 'a1', archived: true }), makeArgument({ id: 'a2', code: 'ARG-002' })],
      evidence: [evidence()]
    });
    m = addLink(m, req('r1'), argRef('a1'), opts('l1'));
    m = addLink(m, req('r1'), argRef('a2'), opts('l2'));
    m = addLink(m, req('r1'), { type: 'evidence', id: 'ev-1' }, opts('l3'));
    const issues = detectTraceabilityIssues(m, new Set());
    expect(issues).toHaveLength(1);
    expect(issues[0]!).toMatchObject({ severity: 'warning' });
    expect(issues[0]!.id).toBe('broken-link:r1:argument:a1');
  });
});
