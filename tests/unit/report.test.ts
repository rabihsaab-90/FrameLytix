import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReportHtml, REPORT_SECTION_LABELS } from '../../shared/report/buildReport';
import { parseManifest, type ProjectManifest, type ReportSectionKey } from '../../shared/schemas/project';
import { makeArgument, makeManifest, makeRequirement, NOW } from './fixtures/manifestFixture';

const ALL = Object.keys(REPORT_SECTION_LABELS) as ReportSectionKey[];
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function fixture(): ProjectManifest {
  const reqs = [
    makeRequirement({ id: 'req-1', code: 'REQ-001', title: 'Span <img src=x onerror=alert(1)>', classification: 'mandatory', section: 'constraints' }),
    makeRequirement({ id: 'req-2', code: 'REQ-002', title: 'Cost objective', classification: 'objective', section: 'criteria', targetValue: '50000', unit: 'CAD' })
  ];
  const arg = makeArgument({
    id: 'arg-1',
    code: 'ARG-001',
    title: 'Structural <script>alert(1)</script> system',
    problemStatement: 'Line one\nLine two',
    matrix: {
      scaleMin: 1,
      scaleMax: 5,
      criteria: [
        { id: 'crit-1', name: 'Cost', weight: 40, description: '' },
        { id: 'crit-2', name: 'Safety', weight: 60, description: '' }
      ],
      scores: [
        { alternativeId: 'alt-a', criterionId: 'crit-1', score: 5, rationale: 'cheap' },
        { alternativeId: 'alt-a', criterionId: 'crit-2', score: 5, rationale: '' },
        { alternativeId: 'alt-b', criterionId: 'crit-1', score: 3, rationale: '' }
        // alt-b / crit-2 intentionally missing
      ]
    },
    constraintEvaluations: [
      { alternativeId: 'alt-a', requirementId: 'req-1', result: 'fail', justification: 'Exceeds span limit' },
      { alternativeId: 'alt-b', requirementId: 'req-1', result: 'pass', justification: 'OK' }
    ],
    references: ['CSA S6 reference', 'Shared ref'],
    revisions: []
  });
  const alts = [
    { id: 'alt-a', name: 'Warren truss', description: '' },
    { id: 'alt-b', name: 'Pratt truss', description: '' }
  ];
  const links: ProjectManifest['links'] = ['req-1', 'req-2'].map((id, i) => ({
    id: `l${i}`,
    a: { type: 'requirement' as const, id },
    b: { type: 'argument' as const, id: 'arg-1' },
    note: '',
    createdAt: NOW
  }));
  links.push({ id: 'l9', a: { type: 'requirement', id: 'req-1' }, b: { type: 'asset', id: 'asset-1' }, note: '', createdAt: NOW });
  links.push({ id: 'l10', a: { type: 'calculation', id: 'calc-1' }, b: { type: 'argument', id: 'arg-1' }, note: '', createdAt: NOW });
  return makeManifest({
    project: { ...makeManifest().project, isSample: true, title: 'Bridge <b>x</b>' },
    requirements: reqs,
    arguments: [{ ...arg, alternatives: alts }],
    calculations: [
      {
        id: 'calc-1',
        code: 'CALC-001',
        title: 'Moment',
        purpose: '',
        equation: 'M = \\frac{wL^2}{8}',
        variables: [{ symbol: 'w', description: 'load', value: '5', unit: 'kN/m' }],
        expression: '',
        method: '',
        assumptions: '',
        resultValue: '12.5',
        resultUnit: 'kNm',
        resultSource: 'evaluated',
        reference: 'Shared ref',
        verificationNotes: '',
        revision: 'REV-A',
        author: '',
        archived: false,
        createdAt: NOW,
        modifiedAt: NOW
      },
      {
        id: 'calc-2',
        code: 'CALC-002',
        title: 'Bad',
        purpose: '',
        equation: '\\frac{',
        variables: [],
        expression: '',
        method: '',
        assumptions: '',
        resultValue: '',
        resultUnit: '',
        resultSource: 'manual',
        reference: '',
        verificationNotes: '',
        revision: 'REV-A',
        author: '',
        archived: false,
        createdAt: NOW,
        modifiedAt: NOW
      }
    ],
    assets: [
      { id: 'asset-1', drawingId: 'DRW-001', title: 'General arrangement', relativePath: 'drawings/ga.png', description: '', revision: 'A', modelUnit: '', sizeBytes: 2048, fileModifiedAt: null, importedAt: NOW },
      { id: 'asset-2', drawingId: 'DRW-002', title: 'Evil', relativePath: 'drawings/evil.png', description: '', revision: 'A', modelUnit: '', sizeBytes: 10, fileModifiedAt: null, importedAt: NOW },
      { id: 'asset-3', drawingId: 'DRW-003', title: 'Gone', relativePath: 'drawings/gone.png', description: '', revision: 'A', modelUnit: '', sizeBytes: 10, fileModifiedAt: null, importedAt: NOW },
      { id: 'asset-4', drawingId: 'DRW-004', title: 'Model', relativePath: 'models/deck.stl', description: '', revision: 'A', modelUnit: '', sizeBytes: 10, fileModifiedAt: null, importedAt: NOW }
    ],
    risks: [
      {
        id: 'risk-1',
        code: 'RISK-001',
        title: 'Vibration',
        description: '',
        category: 'Serviceability',
        likelihood: 4,
        impact: 4,
        residualLikelihood: null,
        residualImpact: null,
        mitigation: 'Add dampers',
        owner: '',
        status: 'open',
        notes: '',
        archived: false,
        createdAt: NOW,
        modifiedAt: NOW
      }
    ],
    reviewItems: [{ id: 'rv1', category: 'scope', text: 'Scope reviewed', source: 'custom', status: 'open', naJustification: '', reviewer: '', notes: '', modifiedAt: NOW }],
    links
  });
}

function build(m: ProjectManifest, sections: ReportSectionKey[] = ALL, extra: Partial<Parameters<typeof buildReportHtml>[1]> = {}): string {
  return buildReportHtml(m, {
    sections,
    generatedAt: '2026-03-05T12:00:00.000Z',
    images: {},
    missingAssetPaths: [],
    mode: 'export',
    ...extra
  });
}

describe('buildReportHtml', () => {
  it('produces a self-contained document without scripts or URLs', () => {
    const html = build(fixture());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en-CA">');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });

  it('escapes user text', () => {
    const html = build(fixture());
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Line one<br>Line two');
  });

  it('includes only the requested sections', () => {
    const html = build(fixture(), ['cover', 'risks']);
    expect(html).toContain('Risk register');
    expect(html).not.toContain('Requirements traceability');
    expect(html).not.toContain('Engineering arguments');
  });

  it('shows incomplete matrix scores and never 0.00', () => {
    const html = build(fixture(), ['arguments']);
    expect(html).toContain('incomplete');
    expect(html).not.toContain('0.00');
  });

  it('labels a failing alternative Ineligible and does not recommend it', () => {
    const html = build(fixture(), ['arguments']);
    expect(html).toContain('Ineligible');
    const rec = /Recommended eligible alternative<\/dt><dd>([^<]*)/.exec(html);
    expect(rec).not.toBeNull();
    expect(rec?.[1]).not.toContain('Warren');
    const hi = /Highest numerical score<\/dt><dd>([^<]*)/.exec(html);
    expect(hi?.[1]).toContain('Warren truss (5.00)');
    expect(hi?.[1]).toContain('ineligible');
    expect(hi?.[1]).toContain('REQ-001');
  });

  it('renders equations as MathML and falls back for invalid LaTeX', () => {
    const html = build(fixture(), ['calculations']);
    expect(html).toContain('<math');
    expect(html).toContain('evaluated by FrameLytix restricted arithmetic parser');
    expect(html).toContain('Equation could not be rendered');
    expect(html).not.toContain('http://');
  });

  it('includes the disclaimer and sample banner', () => {
    const html = build(fixture(), ['cover', 'disclaimer']);
    expect(html).toContain('not certified engineering design software');
    expect(html).toContain('Educational sample project');
    const plain = makeManifest();
    expect(build(plain, ['cover'])).not.toContain('Educational sample project');
  });

  it('embeds only data:image URIs and marks missing assets', () => {
    const html = build(fixture(), ['drawings'], {
      images: { 'drawings/ga.png': PNG, 'drawings/evil.png': 'javascript:alert(1)', 'drawings/gone.png': PNG },
      missingAssetPaths: ['drawings/gone.png']
    });
    expect(html).toContain(`src="${PNG}"`);
    expect(html).not.toContain('javascript:');
    expect(html.match(/<img /g)?.length).toBe(1);
    expect(html).toContain('Missing');
    expect(html).toContain('3D model (view in FrameLytix)');
    expect(html).toContain('model units (unit not declared)');
  });

  it('lists a critical issue in outstanding items', () => {
    const html = build(fixture(), ['outstanding'], { missingAssetPaths: ['drawings/gone.png'] });
    expect(html).toContain('Critical');
    expect(html).toContain('is missing from the project folder');
  });

  it('states when nothing is outstanding', () => {
    const m = makeManifest();
    const html = build(m, ['outstanding']);
    expect(html).toContain('No outstanding items were detected automatically');
  });

  it('de-duplicates references and lists citing records', () => {
    const html = build(fixture(), ['references']);
    expect(html.match(/Shared ref/g)?.length).toBe(1);
    expect(html).toContain('CALC-001');
  });
});

const samplePath = resolve(__dirname, '../../samples/pedestrian-truss-bridge/framelytix-project.json');
describe('sample project report', () => {
  it.skipIf(!existsSync(samplePath))('builds a full report from the sample', () => {
    const parsed = parseManifest(JSON.parse(readFileSync(samplePath, 'utf8')));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const html = build(parsed.manifest);
    expect(html).toContain('Pratt');
    expect(html).toContain('Warren');
    expect(html).toContain('Ineligible');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('http://');
  });
});
