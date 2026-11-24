import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../../shared/utilities/html';
import { decisionMatrixCsv, requirementsCsv, risksCsv, toCsv, traceabilityCsv } from '../../shared/utilities/csv';
import { makeArgument, makeManifest, makeRequirement } from './fixtures/manifestFixture';

describe('escapeHtml', () => {
  it('escapes the five special characters', () => {
    expect(escapeHtml(`<script>alert("x")&'</script>`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;&lt;/script&gt;');
  });
  it('handles null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('does not double-escape in a single pass', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('toCsv', () => {
  const body = (s: string): string => s.slice(1);

  it('starts with a BOM and uses CRLF', () => {
    const out = toCsv([['a', 'b'], ['c', 'd']]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(body(out)).toBe('a,b\r\nc,d\r\n');
  });

  it('quotes commas, quotes, newlines and edge spaces, doubling quotes', () => {
    expect(body(toCsv([['a,b', 'say "hi"', 'l1\nl2', ' lead', 'trail ', 'plain']]))).toBe(
      '"a,b","say ""hi""","l1\nl2"," lead","trail ",plain\r\n'
    );
  });

  it('renders null/undefined as empty cells', () => {
    expect(body(toCsv([['a', null, undefined, 'b']]))).toBe('a,,,b\r\n');
  });

  it('guards against formula injection in strings', () => {
    expect(body(toCsv([['=SUM(A1)', '+1+2', '@cmd', '-cmd', '\tTab', '=1,2']]))).toBe(
      "'=SUM(A1),'+1+2,'@cmd,'-cmd,'\tTab,\"'=1,2\"\r\n"
    );
  });

  it('does not alter real numbers or numeric strings', () => {
    expect(body(toCsv([[-12.5, 0, '-12.5', '+3', '1e-3', 42]]))).toBe('-12.5,0,-12.5,+3,1e-3,42\r\n');
  });

  it('still guards non-numeric strings starting with a minus', () => {
    expect(body(toCsv([['-12.5kg', '- 5']]))).toBe("'-12.5kg,'- 5\r\n");
  });
});

describe('csv builders', () => {
  it('requirementsCsv neutralises injected titles and skips archived rows', () => {
    const m = makeManifest({
      requirements: [
        makeRequirement({ id: 'a', code: 'REQ-001', title: '=HYPERLINK("http://x")' }),
        makeRequirement({ id: 'b', code: 'REQ-002', title: 'Gone', archived: true })
      ]
    });
    const csv = requirementsCsv(m);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toContain('REQ-002');
    expect(csv).toContain('Acceptance criterion');
  });

  it('decisionMatrixCsv includes weights, totals and eligibility', () => {
    const req = makeRequirement({ id: 'q', code: 'REQ-009' });
    const arg = makeArgument({
      matrix: {
        scaleMin: 1,
        scaleMax: 5,
        criteria: [{ id: 'c', name: 'Cost', weight: 100, description: '' }],
        scores: [
          { alternativeId: 'alt-a', criterionId: 'c', score: 4, rationale: '' },
          { alternativeId: 'alt-b', criterionId: 'c', score: null, rationale: '' }
        ]
      },
      constraintEvaluations: [{ alternativeId: 'alt-a', requirementId: 'q', result: 'pass', justification: '' }]
    });
    const csv = decisionMatrixCsv(arg, [req]);
    expect(csv).toContain('Criterion,Weight (%),Warren truss,Pratt truss');
    expect(csv).toContain('Cost,100,4,');
    expect(csv).toContain('4.00,Incomplete');
    expect(csv).toContain('Eligibility,,eligible,provisional');
    expect(csv).toContain('REQ-009');
  });

  it('traceabilityCsv and risksCsv produce headed output', () => {
    const m = makeManifest({ requirements: [makeRequirement()] });
    expect(traceabilityCsv(m, new Set())).toContain('Evidence status');
    expect(traceabilityCsv(m, new Set())).toContain('REQ-001');
    expect(risksCsv(m)).toContain('Effective score');
  });
});
