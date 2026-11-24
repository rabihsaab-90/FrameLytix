import { describe, expect, it } from 'vitest';
import {
  applyApprovalGuard,
  diffArguments,
  isMaterialChange,
  issueRevision,
  nextRevisionCode,
  restoreRevision,
  revisionCode,
  stripArgument
} from '../../shared/utilities/revisions';
import { makeArgument } from './fixtures/manifestFixture';

describe('revision codes', () => {
  it('uses bijective base-26', () => {
    expect(revisionCode(0)).toBe('REV-A');
    expect(revisionCode(25)).toBe('REV-Z');
    expect(revisionCode(26)).toBe('REV-AA');
    expect(revisionCode(27)).toBe('REV-AB');
    expect(revisionCode(51)).toBe('REV-AZ');
    expect(revisionCode(52)).toBe('REV-BA');
    expect(revisionCode(701)).toBe('REV-ZZ');
    expect(revisionCode(702)).toBe('REV-AAA');
  });
  it('nextRevisionCode follows the highest valid code', () => {
    expect(nextRevisionCode([])).toBe('REV-A');
    expect(nextRevisionCode(['REV-A', 'REV-C', 'REV-B'])).toBe('REV-D');
    expect(nextRevisionCode(['REV-Z'])).toBe('REV-AA');
    expect(nextRevisionCode(['REV-AZ', 'REV-B'])).toBe('REV-BA');
    expect(nextRevisionCode(['bogus', 'REV-1'])).toBe('REV-A');
  });
});

describe('issueRevision', () => {
  it('records the current state, advances the code and does not mutate', () => {
    const arg = makeArgument({ title: 'Original' });
    const before = JSON.stringify(arg);
    const next = issueRevision(arg, { author: 'Sam', summary: 'First issue', now: 'T1', id: 'rev-1' });
    expect(JSON.stringify(arg)).toBe(before);
    expect(next.revision).toBe('REV-B');
    expect(next.revisions).toHaveLength(1);
    expect(next.revisions[0]!).toMatchObject({ id: 'rev-1', code: 'REV-A', author: 'Sam', summary: 'First issue', timestamp: 'T1' });
    expect(next.revisions[0]!.snapshot.title).toBe('Original');
    expect('revisions' in next.revisions[0]!.snapshot).toBe(false);
    const again = issueRevision(next, { author: 'Sam', summary: 'Second', now: 'T2', id: 'rev-2' });
    expect(again.revision).toBe('REV-C');
    expect(again.revisions.map((r) => r.code)).toEqual(['REV-A', 'REV-B']);
  });

  it('snapshots are deep copies', () => {
    const arg = makeArgument();
    const next = issueRevision(arg, { author: '', summary: '', now: 'T', id: 'r' });
    next.revisions[0]!.snapshot.alternatives[0]!.name = 'changed';
    expect(arg.alternatives[0]!.name).toBe('Warren truss');
  });
});

describe('restoreRevision', () => {
  it('restores content, keeps full history and records an automatic snapshot', () => {
    const v1 = makeArgument({ title: 'Version one', status: 'approved' });
    const issued = issueRevision(v1, { author: 'A', summary: 'Issue 1', now: 'T1', id: 'rev-1' });
    const edited = { ...issued, title: 'Version two', status: 'approved' as const };
    const restored = restoreRevision(edited, 'rev-1', { author: 'B', now: 'T3', id: 'rev-2' });

    expect(restored.title).toBe('Version one');
    expect(restored.status).toBe('draft');
    expect(restored.id).toBe(v1.id);
    expect(restored.code).toBe(v1.code);
    expect(restored.createdAt).toBe(v1.createdAt);
    expect(restored.modifiedAt).toBe('T3');
    expect(restored.revisions).toHaveLength(2);
    expect(restored.revisions[0]!.id).toBe('rev-1');
    expect(restored.revisions[1]!).toMatchObject({ id: 'rev-2', author: 'B', summary: 'Automatic snapshot before restoring REV-A' });
    expect(restored.revisions[1]!.snapshot.title).toBe('Version two');
    expect(restored.revision).toBe('REV-C');
  });

  it('throws for an unknown revision and never mutates input', () => {
    const arg = makeArgument();
    expect(() => restoreRevision(arg, 'nope', { author: '', now: 'T', id: 'x' })).toThrow();
    expect(arg.revisions).toHaveLength(0);
  });
});

describe('approval guard and material changes', () => {
  it('stripArgument drops revisions only', () => {
    const s = stripArgument(makeArgument());
    expect('revisions' in s).toBe(false);
    expect(s.title).toBe('Structural system');
  });

  it('non-material fields do not count', () => {
    const a = makeArgument();
    expect(isMaterialChange(a, { ...a, reviewer: 'X', author: 'Y', evidenceSummary: 'z', modifiedAt: 'T9' })).toBe(false);
    expect(isMaterialChange(a, { ...a, title: 'New' })).toBe(true);
    expect(isMaterialChange(a, { ...a, assumptions: ['One', 'Two'] })).toBe(true);
    expect(isMaterialChange(a, { ...a, selectedAlternativeId: 'alt-a' })).toBe(true);
  });

  it('compares nested matrix content, independent of key order', () => {
    const a = makeArgument();
    const reordered = { ...a, matrix: { scores: [], criteria: a.matrix.criteria, scaleMax: 5, scaleMin: 1 } };
    expect(isMaterialChange(a, reordered)).toBe(false);
    const changed = structuredClone(a);
    changed.matrix.criteria[0]!.weight = 41;
    expect(isMaterialChange(a, changed)).toBe(true);
  });

  it('sends a materially edited approved argument back to review', () => {
    const prev = makeArgument({ status: 'approved' });
    expect(applyApprovalGuard(prev, { ...prev, justification: 'Changed' }).status).toBe('under-review');
    expect(applyApprovalGuard(prev, { ...prev, reviewer: 'R' }).status).toBe('approved');
    expect(applyApprovalGuard(makeArgument(), { ...prev, status: 'approved', title: 'x' }).status).toBe('approved');
    expect(applyApprovalGuard(prev, { ...prev, title: 'x', status: 'draft' }).status).toBe('draft');
  });
});

describe('diffArguments', () => {
  it('summarises changed fields readably', () => {
    const a = makeArgument();
    const b = structuredClone(a);
    b.title = 'Renamed';
    b.alternatives.push({ id: 'alt-c', name: 'Howe truss', description: '' });
    b.matrix.criteria[0]!.weight = 50;
    b.matrix.scores.push({ alternativeId: 'alt-a', criterionId: 'crit-1', score: 4, rationale: '' });
    b.selectedAlternativeId = 'alt-c';
    const d = diffArguments(a, b);
    const by = Object.fromEntries(d.map((x) => [x.field, x]));
    expect(by.title).toMatchObject({ label: 'Title', before: 'Structural system', after: 'Renamed' });
    expect(by.alternatives!.after).toBe('Warren truss; Pratt truss; Howe truss');
    expect(by.matrix!.after).toContain('Cost (50%)');
    expect(by.matrix!.after).toContain('1 score entered');
    expect(by.selectedAlternativeId).toMatchObject({ before: '(none)', after: 'Howe truss' });
    expect(d.every((x) => x.label.length > 0)).toBe(true);
    expect(diffArguments(a, structuredClone(a))).toEqual([]);
  });
});
