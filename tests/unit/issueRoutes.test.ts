import { describe, expect, it } from 'vitest';
import { routeForIssue } from '../../src/lib/issueRoutes';
import type { Issue } from '../../shared/utilities/issues';
import { makeManifest } from './fixtures/manifestFixture';

const issue = (target?: Issue['target']): Issue => ({ id: 'x', severity: 'warning', category: 'scope', message: 'm', target });

describe('routeForIssue', () => {
  const manifest = makeManifest({
    assets: [
      { id: 'asset-1', drawingId: '', title: '', relativePath: '03-CAD/a.pdf', description: '', revision: '', modelUnit: '', sizeBytes: 0, fileModifiedAt: null, importedAt: '2026-01-01T00:00:00.000Z' }
    ]
  });

  it('returns null without a target', () => {
    expect(routeForIssue(issue(), manifest)).toBeNull();
  });
  it('maps requirement, argument and calculation targets', () => {
    expect(routeForIssue(issue({ view: 'requirements', id: 'r1' }), manifest)).toEqual({ view: 'requirements', id: 'r1' });
    expect(routeForIssue(issue({ view: 'argument', id: 'a1' }), manifest)).toEqual({ view: 'argument', id: 'a1' });
    expect(routeForIssue(issue({ view: 'calculation', id: 'c1' }), manifest)).toEqual({ view: 'calculations', id: 'c1' });
  });
  it('maps an asset to its file route and returns null when the asset is gone', () => {
    expect(routeForIssue(issue({ view: 'asset', id: 'asset-1' }), manifest)).toEqual({ view: 'file', path: '03-CAD/a.pdf' });
    expect(routeForIssue(issue({ view: 'asset', id: 'nope' }), manifest)).toBeNull();
  });
  it('maps page-level targets', () => {
    expect(routeForIssue(issue({ view: 'traceability' }), manifest)).toEqual({ view: 'traceability' });
    expect(routeForIssue(issue({ view: 'risks', id: 'k1' }), manifest)).toEqual({ view: 'risks', id: 'k1' });
    expect(routeForIssue(issue({ view: 'risks' }), manifest)).toEqual({ view: 'risks' });
    expect(routeForIssue(issue({ view: 'review' }), manifest)).toEqual({ view: 'review' });
    expect(routeForIssue(issue({ view: 'report' }), manifest)).toEqual({ view: 'report' });
    expect(routeForIssue(issue({ view: 'overview' }), manifest)).toEqual({ view: 'overview' });
  });
});
