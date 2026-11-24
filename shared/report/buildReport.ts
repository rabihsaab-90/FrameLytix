/**
 * Pure HTML engineering design report builder. Runs in Node (Electron main) and the browser:
 * no fs, no DOM APIs, no scripts, no external URLs.
 */
import katex from 'katex';
import { BRANDING } from '../../src/config/branding';
import type {
  Asset,
  EngineeringArgument,
  EntityRef,
  ProjectManifest,
  ReportSectionKey,
  Requirement,
  Risk
} from '../schemas/project';
import { computeMatrix, formatScore, mandatoryRequirementsForArgument, type MatrixResult } from '../utilities/decisionMatrix';
import { documentationCompleteness, detectProjectIssues, projectStats } from '../utilities/completeness';
import { escapeHtml } from '../utilities/html';
import { fileNameOf, extensionOf } from '../utilities/paths';
import {
  effectiveRiskScore,
  inherentRiskScore,
  IMPACT_LABELS,
  LIKELIHOOD_LABELS,
  RISK_SCORE_EXPLANATION,
  riskLevel,
  unresolvedHighRisks
} from '../utilities/risk';
import {
  assetCode,
  buildTraceabilityRows,
  evidenceCoverage,
  linkedRefs,
  resolveRef,
  traceabilityCoverage,
  type ResolvedRef
} from '../utilities/traceability';
import { reportCss } from './reportStyles';

export const REPORT_IMAGE_EXTENSIONS: string[] = ['png', 'jpg', 'jpeg', 'svg'];

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, string> = {
  cover: 'Cover page',
  metadata: 'Project metadata',
  summary: 'Executive summary',
  scope: 'Scope and description',
  criteria: 'Design criteria',
  requirements: 'Requirements',
  arguments: 'Engineering arguments',
  calculations: 'Calculations',
  traceability: 'Requirements traceability',
  risks: 'Risk register',
  revisions: 'Revision history',
  drawings: 'Drawings and models',
  review: 'Design review',
  outstanding: 'Outstanding items',
  references: 'References',
  disclaimer: 'Disclaimer and limitations'
};

const SECTION_ORDER: ReportSectionKey[] = [
  'cover',
  'metadata',
  'summary',
  'scope',
  'criteria',
  'requirements',
  'arguments',
  'calculations',
  'traceability',
  'risks',
  'revisions',
  'drawings',
  'review',
  'outstanding',
  'references',
  'disclaimer'
];

export interface ReportOptions {
  sections: ReportSectionKey[];
  generatedAt: string;
  /** relativePath → data: URI */
  images: Record<string, string>;
  missingAssetPaths: string[];
  mode: 'preview' | 'export';
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const e = escapeHtml;

/** Escape then convert line breaks to <br>. */
function t(s: string | number | null | undefined): string {
  return e(s).replace(/\r\n|\r|\n/g, '<br>');
}

function titleCase(s: string): string {
  const w = s.replace(/-/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return e(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return e(iso);
  return `${fmtDate(iso)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function fmtPct(ratio: number | null): string {
  return ratio === null ? 'not applicable' : `${Math.round(ratio * 100)}%`;
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function trimNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

function badge(kind: string, label: string): string {
  return `<span class="badge badge-${e(kind)}">${e(label)}</span>`;
}

function th(label: string, cls = ''): string {
  return `<th scope="col"${cls ? ` class="${cls}"` : ''}>${e(label)}</th>`;
}

function table(headers: string[], rows: string[], opts: { cls?: string; foot?: string } = {}): string {
  return (
    `<table${opts.cls ? ` class="${opts.cls}"` : ''}><thead><tr>${headers.map((h) => (h.startsWith('<th') ? h : th(h))).join('')}</tr></thead>` +
    `<tbody>${rows.join('')}</tbody>${opts.foot ? `<tfoot>${opts.foot}</tfoot>` : ''}</table>`
  );
}

function tr(cells: string[]): string {
  return `<tr>${cells.map((c) => (c.startsWith('<td') || c.startsWith('<th') ? c : `<td>${c}</td>`)).join('')}</tr>`;
}

function kv(pairs: Array<[string, string]>): string {
  return `<dl class="kv">${pairs.map(([k, v]) => `<dt>${e(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

function textBlock(label: string, value: string): string {
  if (value.trim() === '') return `<h4>${e(label)}</h4><p class="muted">Not recorded.</p>`;
  return `<h4>${e(label)}</h4><p>${t(value)}</p>`;
}

function refLabel(r: ResolvedRef, missingPaths?: Set<string>, manifest?: ProjectManifest): string {
  let s = `<span class="mono">${e(r.code)}</span>`;
  if (!r.exists) s += ' <span class="marker">[deleted record]</span>';
  else if (r.archived) s += ' <span class="marker">[archived]</span>';
  if (missingPaths && manifest && r.ref.type === 'asset') {
    const asset = manifest.assets.find((a) => a.id === r.ref.id);
    if (asset && missingPaths.has(asset.relativePath)) s += ' <span class="marker">[missing file]</span>';
  }
  return s;
}

function refList(refs: ResolvedRef[], missingPaths?: Set<string>, manifest?: ProjectManifest): string {
  return refs.length === 0 ? '—' : refs.map((r) => refLabel(r, missingPaths, manifest)).join('<br>');
}

function linkedResolved(manifest: ProjectManifest, ref: EntityRef, type: EntityRef['type']): ResolvedRef[] {
  return linkedRefs(manifest, ref, type).map((r) => resolveRef(manifest, r));
}

function equationHtml(latex: string): string {
  if (latex.trim() === '') return '<p class="muted">No equation recorded.</p>';
  const src = `<div class="latex-src">${e(latex)}</div>`;
  try {
    const rendered = katex
      .renderToString(latex, {
        output: 'mathml',
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        displayMode: true,
        maxSize: 20,
        maxExpand: 200
      })
      // The MathML namespace attribute is optional in HTML5; remove it so the report holds no URLs.
      .replace(/\sxmlns="[^"]*"/g, '');
    if (!rendered.includes('<math') || rendered.includes('katex-error')) throw new Error('render failed');
    return `<div class="equation">${rendered}${src}</div>`;
  } catch {
    return `<div class="equation"><p class="marker small">Equation could not be rendered.</p><div class="equation-error">${e(latex)}</div></div>`;
  }
}

function safeImage(images: Record<string, string>, path: string): string | null {
  const uri = Object.prototype.hasOwnProperty.call(images, path) ? images[path] : undefined;
  if (typeof uri !== 'string') return null;
  return /^data:image\//i.test(uri) ? uri : null;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface Ctx {
  m: ProjectManifest;
  opts: ReportOptions;
  missing: Set<string>;
  reqCode: (id: string) => string;
}

function sectionWrap(key: ReportSectionKey, body: string, pageBreak: boolean): string {
  return (
    `<section id="sec-${key}" class="report-section${pageBreak ? ' page-break' : ''}">` +
    `<h2>${e(REPORT_SECTION_LABELS[key])}</h2>${body}</section>`
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function coverSection(c: Ctx): string {
  const p = c.m.project;
  const disc = p.disciplineLabel || titleCase(p.discipline);
  const rows: Array<[string, string]> = [
    ['Project identifier', `<span class="mono">${e(p.identifier)}</span>`],
    ['Discipline', e(disc)],
    ['Archetype', e(p.archetypeName)],
    ['Author / team', p.author ? e(p.author) : '—'],
    ['Organization', p.organization ? e(p.organization) : '—'],
    ['Report generated', e(c.opts.generatedAt ? fmtDate(c.opts.generatedAt) : '—')]
  ];
  return (
    `<header id="sec-cover" class="cover report-section">` +
    `<div class="wordmark">${e(BRANDING.appName)}</div><div class="tagline">${e(BRANDING.category)}</div>` +
    `<h1>${t(p.title)}</h1><div class="subtitle">Engineering design documentation report</div>` +
    (p.isSample
      ? `<div class="banner" role="note">Educational sample project — illustrative values — not for construction.</div>`
      : '') +
    kv(rows) +
    `<p><strong>Report status:</strong> Generated from the project record. Contents have not been independently reviewed or certified; argument statuses shown are internal documentation workflow statuses only.</p>` +
    `<div class="notice strong" role="note">Documentation package — not a certification of engineering adequacy.</div>` +
    `</header>`
  );
}

function metadataSection(c: Ctx): string {
  const p = c.m.project;
  const rows: Array<[string, string]> = [
    ['Project UUID', `<span class="mono">${e(p.id)}</span>`],
    ['Identifier', `<span class="mono">${e(p.identifier)}</span>`],
    ['Template', `<span class="mono">${e(p.templateId)}</span> (version ${e(p.templateVersion)})`],
    ['Archetype', e(p.archetypeName)],
    ['Discipline', e(p.disciplineLabel || titleCase(p.discipline))],
    ['Unit system', e(p.unitSystem)],
    ['Created', fmtDateTime(p.createdAt)],
    ['Last modified', fmtDateTime(p.modifiedAt)],
    ['FrameLytix version (file)', e(c.m.appVersion)],
    ['Schema version', e(c.m.schemaVersion)]
  ];
  return sectionWrap('metadata', `<table class="auto"><thead><tr>${th('Field')}${th('Value')}</tr></thead><tbody>${rows
    .map(([k, v]) => `<tr><th scope="row">${e(k)}</th><td>${v}</td></tr>`)
    .join('')}</tbody></table>`, false);
}

function summarySection(c: Ctx): string {
  const stats = projectStats(c.m, c.missing);
  const doc = documentationCompleteness(c.m);
  const cov = stats.traceability;
  const s = stats.arguments.byStatus;
  const rows: Array<[string, string]> = [
    [
      'Requirement completion',
      `${e(fmtPct(stats.requirements.completionRatio))} (${stats.requirements.verified} verified + ${stats.requirements.notApplicable} not applicable of ${stats.requirements.active + stats.requirements.notApplicable} active requirements)`
    ],
    ['Mandatory constraints verified', `${stats.requirements.mandatoryVerified} of ${stats.requirements.mandatory}`],
    [
      'Engineering arguments',
      `${stats.arguments.total} total — draft ${s.draft}, under review ${s['under-review']}, approved (internal status) ${s.approved}, needs revision ${s['needs-revision']}`
    ],
    ['Calculations', String(stats.calculations.total)],
    ['Drawings and assets', `${stats.assets.total} registered, ${stats.assets.missing} missing from the project folder`],
    ['Unresolved high or critical risks', String(stats.risks.unresolvedHigh)],
    [
      'Traceability coverage',
      `${e(fmtPct(cov.ratio))} (${cov.covered} of ${cov.total})<div class="small muted">${e(cov.definition)}</div>`
    ],
    [
      'Documentation completeness',
      `${e(fmtPct(doc.ratio))} (${doc.complete} of ${doc.applicable})<div class="small muted">${e(doc.definition)}</div>`
    ]
  ];
  const body =
    (c.m.project.summary.trim() !== '' ? `<p>${t(c.m.project.summary)}</p>` : '<p class="muted">No project summary has been recorded.</p>') +
    `<h3>At a glance</h3>` +
    `<table class="auto"><thead><tr>${th('Measure')}${th('Value')}</tr></thead><tbody>${rows
      .map(([k, v]) => `<tr><th scope="row">${e(k)}</th><td>${v}</td></tr>`)
      .join('')}</tbody></table>` +
    `<div class="notice">These figures describe the state of the documentation only. They are not safety indicators and do not establish that the design is adequate, safe or compliant.</div>`;
  return sectionWrap('summary', body, true);
}

function scopeSection(c: Ctx): string {
  const p = c.m.project;
  return sectionWrap('scope', textBlock('Scope', p.scope) + textBlock('Description', p.description), false);
}

function criteriaSection(c: Ctx): string {
  const reqs = c.m.requirements.filter((r) => !r.archived && r.section === 'criteria');
  const label = c.m.project.sectionLabels.criteria;
  if (reqs.length === 0) return sectionWrap('criteria', `<p class="muted">No design criteria (${e(label)}) have been recorded.</p>`, false);
  const rows = reqs.map((r) =>
    tr([
      `<span class="mono">${e(r.code)}</span>`,
      t(r.title),
      e(titleCase(r.classification)),
      r.targetValue || r.unit ? `${e(r.targetValue)} ${e(r.unit)}`.trim() : '—',
      r.acceptanceCriterion ? t(r.acceptanceCriterion) : '—'
    ])
  );
  return sectionWrap(
    'criteria',
    `<p class="muted">Section: ${e(label)}</p>` + table(['Code', 'Title', 'Classification', 'Target', 'Acceptance criterion'], rows),
    false
  );
}

function requirementsSection(c: Ctx): string {
  const active = c.m.requirements.filter((r) => !r.archived);
  const rows = (reqs: Requirement[]): string[] => {
    const trace = new Map(buildTraceabilityRows(c.m, c.missing).map((r) => [r.requirement.id, r.evidenceStatus]));
    return reqs.map((r) =>
      tr([
        `<span class="mono">${e(r.code)}</span>`,
        t(r.title),
        e(titleCase(r.classification)),
        e(titleCase(r.priority)),
        e(titleCase(r.verificationMethod)),
        e(titleCase(r.status)),
        e(titleCase(trace.get(r.id) ?? 'missing'))
      ])
    );
  };
  let body = '';
  for (const key of ['criteria', 'constraints', 'environment'] as const) {
    const group = active.filter((r) => r.section === key);
    body += `<h3>${e(c.m.project.sectionLabels[key])}</h3>`;
    body += group.length === 0
      ? '<p class="muted">None recorded.</p>'
      : table(['Code', 'Title', 'Classification', 'Priority', 'Verification method', 'Status', 'Evidence status'], rows(group));
  }
  const mandatory = active.filter((r) => r.classification === 'mandatory');
  body += `<h3>Mandatory constraints</h3>`;
  body += mandatory.length === 0
    ? '<p class="muted">No mandatory constraints are recorded.</p>'
    : `<ul class="mandatory-list">${mandatory
        .map(
          (r) =>
            `<li class="avoid-break"><strong class="mono">${e(r.code)}</strong> ${t(r.title)} — ${badge('neutral', 'Mandatory')} ${
              r.targetValue ? `target ${e(r.targetValue)} ${e(r.unit)} — ` : ''
            }status: ${e(titleCase(r.status))}</li>`
        )
        .join('')}</ul>`;
  return sectionWrap('requirements', body, true);
}

// ---- arguments ----

function eligibilityCell(res: MatrixResult, altId: string, c: Ctx): string {
  const a = res.alternatives.find((x) => x.alternativeId === altId);
  if (!a) return '—';
  if (a.eligibility === 'ineligible') {
    return `${badge('ineligible', 'Ineligible')}<div class="small">fails ${e(a.failedRequirementIds.map(c.reqCode).join(', '))}</div>`;
  }
  if (a.eligibility === 'provisional') {
    return `${badge('provisional', 'Provisional')}<div class="small">not yet verified: ${e(a.unverifiedRequirementIds.map(c.reqCode).join(', '))}</div>`;
  }
  return badge('eligible', 'Eligible');
}

function matrixHtml(arg: EngineeringArgument, res: MatrixResult, mandatory: Requirement[], c: Ctx): string {
  if (arg.alternatives.length === 0) return '<p class="muted">No alternatives have been recorded.</p>';
  const m = arg.matrix;
  const altHeaders = arg.alternatives.map((a) => th(a.name));
  const critRows = m.criteria.map((cr) => {
    const cells = arg.alternatives.map((alt) => {
      const entry = m.scores.find((s) => s.alternativeId === alt.id && s.criterionId === cr.id);
      const sc = entry ? entry.score : null;
      let val: string;
      if (sc === null || sc === undefined) val = '<span class="incomplete">incomplete</span>';
      else if (!Number.isFinite(sc) || sc < m.scaleMin || sc > m.scaleMax) val = `${e(sc)} <span class="marker">(out of range ${m.scaleMin}–${m.scaleMax})</span>`;
      else val = e(trimNum(sc));
      const rat = entry && entry.rationale.trim() !== '' ? `<div class="small muted">${t(entry.rationale)}</div>` : '';
      return `<td class="num">${val}${rat}</td>`;
    });
    return `<tr><th scope="row">${t(cr.name)}${cr.description ? `<div class="small muted">${t(cr.description)}</div>` : ''}</th><td class="num">${e(trimNum(cr.weight))}%</td>${cells.join('')}</tr>`;
  });
  const totals = res.alternatives.map((a) => {
    let v: string;
    if (a.weightedScore !== null) v = e(formatScore(a.weightedScore));
    else if (!a.complete) v = '<span class="incomplete">incomplete</span>';
    else v = '<span class="incomplete">not calculated (invalid weights)</span>';
    return `<td class="num">${v}</td>`;
  });
  const weightOk = res.weightsValid && Math.abs(res.weightTotal - 100) <= 0.01;
  const foot =
    `<tr class="total"><th scope="row">Weighted total (scale ${m.scaleMin}–${m.scaleMax}, higher is more favourable)</th><td class="num">${e(trimNum(res.weightTotal))}%${weightOk ? '' : ' <span class="marker">check</span>'}</td>${totals.join('')}</tr>`;
  let html = `<h4>Decision matrix</h4>` + table(['Criterion', 'Weight', ...[]].map((h) => th(h)).concat(altHeaders), critRows, { foot });
  if (!res.weightsValid || !weightOk) {
    const msgs = res.weightIssues.map((w) => w.message);
    if (msgs.length === 0) msgs.push(`The criterion weights total ${trimNum(res.weightTotal)}%, not 100%.`);
    html += `<div class="warn">Weight warning: ${msgs.map(e).join(' ')}</div>`;
  }

  if (mandatory.length > 0) {
    const cRows = mandatory.map((r) => {
      const cells = arg.alternatives.map((alt) => {
        const ev = arg.constraintEvaluations.find((x) => x.alternativeId === alt.id && x.requirementId === r.id);
        let word: string;
        let kind: string;
        if (!ev) {
          word = 'Unverified';
          kind = 'unverified';
        } else if (ev.result === 'pass') {
          word = 'Pass';
          kind = 'pass';
        } else if (ev.result === 'fail') {
          word = 'Fail';
          kind = 'fail';
        } else if (ev.result === 'not-applicable') {
          word = 'N/A';
          kind = 'na';
        } else {
          word = 'Unverified';
          kind = 'unverified';
        }
        const just = ev && ev.justification.trim() !== '' ? `<div class="small muted">${t(ev.justification)}</div>` : ev ? '' : '<div class="small muted">Not evaluated.</div>';
        return `<td>${badge(kind, word)}${just}</td>`;
      });
      return `<tr><th scope="row"><span class="mono">${e(r.code)}</span> ${t(r.title)}</th>${cells.join('')}</tr>`;
    });
    const foot2 = `<tr class="total"><th scope="row">Eligibility</th>${arg.alternatives.map((a) => `<td>${eligibilityCell(res, a.id, c)}</td>`).join('')}</tr>`;
    html += `<h4>Mandatory constraint evaluation</h4>` + table(['Mandatory requirement', ...[]].map((h) => th(h)).concat(altHeaders), cRows, { foot: foot2 });
  } else {
    html += `<p class="muted">No mandatory requirements are linked to this argument, so no constraint evaluation is shown.</p>`;
  }
  return html;
}

function outcomeList(arg: EngineeringArgument, res: MatrixResult, c: Ctx): string {
  const byId = (id: string) => res.alternatives.find((a) => a.alternativeId === id);
  const describe = (id: string): string => {
    const a = byId(id);
    if (!a) return '';
    let s = `${a.name} (${formatScore(a.weightedScore)}) — ${a.eligibility}`;
    if (a.eligibility === 'ineligible') s += ` (fails ${a.failedRequirementIds.map(c.reqCode).join(', ')})`;
    else if (a.eligibility === 'provisional') s += ` (unverified: ${a.unverifiedRequirementIds.map(c.reqCode).join(', ')})`;
    return s;
  };
  const highest = res.highestScoreIds.length > 0 ? res.highestScoreIds.map(describe).join('; ') : 'Not available — no alternative has a complete set of valid scores.';
  let recommended: string;
  if (res.recommendedIds.length === 0) recommended = 'None — no alternative is currently eligible.';
  else {
    const names = res.recommendedIds
      .map((id) => `${byId(id)?.name ?? id} (${formatScore(byId(id)?.weightedScore)})`)
      .join(' and ');
    recommended = res.recommendedIsProvisional ? `Provisional only: ${names} — mandatory constraints not yet fully verified.` : names + (res.tie ? ' (tie)' : '');
  }
  const sel = res.selectedId ? byId(res.selectedId) : undefined;
  const selected = sel ? `${sel.name} — ${sel.eligibility}${sel.eligibility === 'ineligible' ? ' (fails a mandatory constraint)' : ''}` : 'No alternative selected.';
  const docStatus = `${titleCase(arg.status)} (internal documentation workflow status only)`;
  return (
    `<h4>Outcome summary</h4><dl class="kv avoid-break">` +
    `<dt>Highest numerical score</dt><dd>${e(highest)}</dd>` +
    `<dt>Recommended eligible alternative</dt><dd>${e(recommended)}</dd>` +
    `<dt>User-selected alternative</dt><dd>${e(selected)}</dd>` +
    `<dt>Documentation status</dt><dd>${e(docStatus)}</dd></dl>`
  );
}

function argumentHtml(arg: EngineeringArgument, c: Ctx): string {
  const mandatory = mandatoryRequirementsForArgument(c.m, arg.id);
  const res = computeMatrix(arg, mandatory);
  const ref: EntityRef = { type: 'argument', id: arg.id };
  const reqs = linkedResolved(c.m, ref, 'requirement');
  const calcs = linkedResolved(c.m, ref, 'calculation');
  const evid = linkedResolved(c.m, ref, 'evidence');
  const assumptions = arg.assumptions.filter((a) => a.trim() !== '');
  const sel = arg.alternatives.find((a) => a.id === res.selectedId);
  let selection: string;
  if (sel) {
    selection = `<h4>Selected alternative</h4><p><strong>${t(sel.name)}</strong></p>`;
    if (arg.selectionRationale.trim() !== '') selection += `<p>${t(arg.selectionRationale)}</p>`;
    else if (res.selectionNeedsRationale) selection += `<div class="danger">Selection rationale is required but missing: the selected alternative differs from the recommendation.</div>`;
    else selection += `<p class="muted">No selection rationale recorded.</p>`;
    if (res.selectionIsIneligible) selection += `<div class="danger">The selected alternative fails a mandatory constraint and is ineligible.</div>`;
  } else {
    selection = `<h4>Selected alternative</h4><p class="muted">No alternative has been selected.</p>`;
  }
  return (
    `<article class="argument page-break" id="arg-${e(arg.code)}">` +
    `<h3><span class="mono">${e(arg.code)}</span> ${t(arg.title)}</h3>` +
    kv([
      ['Status', `${e(titleCase(arg.status))} <span class="small muted">(internal documentation workflow status)</span>`],
      ['Revision', e(arg.revision)],
      ['Author', arg.author ? e(arg.author) : '—'],
      ['Reviewer', arg.reviewer ? e(arg.reviewer) : '—']
    ]) +
    textBlock('Problem statement', arg.problemStatement) +
    textBlock('Objective', arg.objective) +
    `<h4>Related requirements</h4>` +
    (reqs.length === 0
      ? '<p class="muted">None linked.</p>'
      : `<ul>${reqs.map((r) => `<li>${refLabel(r)} ${t(r.title)}</li>`).join('')}</ul>`) +
    `<h4>Alternatives</h4>` +
    (arg.alternatives.length === 0
      ? '<p class="muted">None recorded.</p>'
      : `<ul>${arg.alternatives.map((a) => `<li><strong>${t(a.name)}</strong>${a.description ? ` — ${t(a.description)}` : ''}</li>`).join('')}</ul>`) +
    matrixHtml(arg, res, mandatory, c) +
    (res.messages.length > 0 ? `<h4>Matrix notes</h4><ul>${res.messages.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : '') +
    outcomeList(arg, res, c) +
    `<h4>Assumptions</h4>` +
    (assumptions.length === 0 ? '<p class="muted">None recorded.</p>' : `<ul>${assumptions.map((a) => `<li>${t(a)}</li>`).join('')}</ul>`) +
    `<h4>Linked calculations</h4>` +
    (calcs.length === 0 ? '<p class="muted">None linked.</p>' : `<ul>${calcs.map((r) => `<li>${refLabel(r)} ${t(r.title)}</li>`).join('')}</ul>`) +
    textBlock('Evidence summary', arg.evidenceSummary) +
    (evid.length > 0 ? `<p class="small">Linked evidence records: ${evid.map((r) => refLabel(r)).join(', ')}</p>` : '') +
    selection +
    textBlock('Final justification', arg.justification) +
    textBlock('Risks and limitations', arg.risksAndLimitations) +
    `<h4>References</h4>` +
    (arg.references.filter((r) => r.trim() !== '').length === 0
      ? '<p class="muted">None recorded.</p>'
      : `<ol>${arg.references.filter((r) => r.trim() !== '').map((r) => `<li>${t(r)}</li>`).join('')}</ol>`) +
    `</article>`
  );
}

function argumentsSection(c: Ctx): string {
  const args = c.m.arguments.filter((a) => !a.archived);
  const body =
    `<div class="notice">Approved denotes internal documentation workflow status only. It is not a professional certification or a statement of engineering adequacy.</div>` +
    (args.length === 0 ? '<p class="muted">No engineering arguments have been recorded.</p>' : args.map((a) => argumentHtml(a, c)).join(''));
  return sectionWrap('arguments', body, true);
}

// ---- calculations ----

function calculationsSection(c: Ctx): string {
  const calcs = c.m.calculations.filter((x) => !x.archived);
  if (calcs.length === 0) return sectionWrap('calculations', '<p class="muted">No calculations have been recorded.</p>', true);
  const body = calcs
    .map((calc) => {
      const ref: EntityRef = { type: 'calculation', id: calc.id };
      const reqs = linkedResolved(c.m, ref, 'requirement');
      const args = linkedResolved(c.m, ref, 'argument');
      const vars = calc.variables.length === 0
        ? '<p class="muted">No variables recorded.</p>'
        : table(
            ['Symbol', 'Description', 'Value', 'Unit'],
            calc.variables.map((v) => tr([`<span class="mono">${e(v.symbol)}</span>`, t(v.description), `<span class="mono">${e(v.value)}</span>`, e(v.unit)]))
          );
      const source =
        calc.resultSource === 'evaluated'
          ? 'Result source: evaluated by FrameLytix restricted arithmetic parser (no unit conversion).'
          : 'Result source: manually entered.';
      const result =
        calc.resultValue.trim() === ''
          ? '<span class="incomplete">No result recorded</span>'
          : `<strong class="mono">${e(calc.resultValue)}</strong> ${e(calc.resultUnit)}`;
      return (
        `<article class="calculation avoid-break"><h3><span class="mono">${e(calc.code)}</span> ${t(calc.title)}</h3>` +
        kv([
          ['Revision', e(calc.revision)],
          ['Author', calc.author ? e(calc.author) : '—']
        ]) +
        textBlock('Purpose', calc.purpose) +
        `<h4>Equation</h4>${equationHtml(calc.equation)}` +
        `<h4>Variables</h4>${vars}` +
        textBlock('Method', calc.method) +
        textBlock('Assumptions', calc.assumptions) +
        `<h4>Result</h4><p>${result}</p><p class="small muted">${e(source)}</p>` +
        textBlock('Reference', calc.reference) +
        textBlock('Verification notes', calc.verificationNotes) +
        `<p class="small"><strong>Linked requirements:</strong> ${refList(reqs)}<br><strong>Linked arguments:</strong> ${refList(args)}</p>` +
        `</article>`
      );
    })
    .join('');
  return sectionWrap('calculations', body, true);
}

// ---- traceability ----

function traceabilitySection(c: Ctx): string {
  const rows = buildTraceabilityRows(c.m, c.missing);
  const cov = traceabilityCoverage(c.m);
  const ev = evidenceCoverage(c.m);
  const tbl =
    rows.length === 0
      ? '<p class="muted">No active requirements.</p>'
      : table(
          ['Requirement ID', 'Title', 'Classification', 'Linked arguments', 'Linked calculations', 'Linked assets', 'Verification status', 'Evidence status'],
          rows.map((r) =>
            tr([
              `<span class="mono">${e(r.requirement.code)}</span>`,
              t(r.requirement.title),
              e(titleCase(r.requirement.classification)),
              refList(r.arguments),
              refList(r.calculations),
              refList(r.assets, c.missing, c.m),
              e(titleCase(r.verificationStatus)),
              e(titleCase(r.evidenceStatus))
            ])
          )
        );
  const broken = rows.filter((r) => r.brokenLinks.length > 0);
  const body =
    tbl +
    (broken.length > 0
      ? `<div class="warn"><strong>Broken or archived links:</strong> ${broken
          .map((r) => `<span class="mono">${e(r.requirement.code)}</span> → ${r.brokenLinks.map((b) => refLabel(b)).join(', ')}`)
          .join('; ')}</div>`
      : '') +
    `<h3>Coverage</h3>` +
    kv([
      ['Traceability coverage', `${e(fmtPct(cov.ratio))} (${cov.covered} of ${cov.total} active requirements)`],
      ['Evidence coverage', `${e(fmtPct(ev.ratio))} (${ev.covered} of ${ev.total} active requirements)`]
    ]) +
    `<p class="small muted">${e(cov.definition)}</p><p class="small muted">${e(ev.definition)}</p>`;
  return sectionWrap('traceability', body, true);
}

// ---- risks ----

function levelBadge(score: number): string {
  const lvl = riskLevel(score);
  const kind = lvl === 'critical' ? 'critical' : lvl === 'high' ? 'fail' : lvl === 'medium' ? 'warning' : 'neutral';
  return `${badge(kind, titleCase(lvl))} <span class="small">(${score})</span>`;
}

function risksSection(c: Ctx): string {
  const risks = c.m.risks.filter((r) => !r.archived);
  const resid = (r: Risk): string =>
    r.residualLikelihood !== null && r.residualImpact !== null ? String(r.residualLikelihood * r.residualImpact) : '—';
  const unresolved = unresolvedHighRisks(c.m);
  const body =
    (risks.length === 0
      ? '<p class="muted">No risks have been recorded.</p>'
      : table(
          ['Code', 'Title', 'Category', 'L', 'I', 'Inherent score', 'Residual score', 'Level', 'Status', 'Mitigation', 'Linked records'],
          risks.map((r) => {
            const linked = linkedRefs(c.m, { type: 'risk', id: r.id }).map((x) => resolveRef(c.m, x));
            return tr([
              `<span class="mono">${e(r.code)}</span>`,
              t(r.title),
              r.category ? e(r.category) : '—',
              `<td class="num" title="${e(LIKELIHOOD_LABELS[r.likelihood] ?? '')}">${r.likelihood}</td>`,
              `<td class="num" title="${e(IMPACT_LABELS[r.impact] ?? '')}">${r.impact}</td>`,
              `<td class="num">${inherentRiskScore(r)}</td>`,
              `<td class="num">${resid(r)}</td>`,
              levelBadge(effectiveRiskScore(r)),
              e(titleCase(r.status)),
              r.mitigation ? t(r.mitigation) : '—',
              refList(linked)
            ]);
          })
        )) +
    `<h3>Unresolved high-priority risks</h3>` +
    (unresolved.length === 0
      ? '<p class="muted">No unresolved high or critical risks are recorded.</p>'
      : `<ul>${unresolved
          .map((r) => `<li><span class="mono">${e(r.code)}</span> ${t(r.title)} — ${levelBadge(effectiveRiskScore(r))} ${e(titleCase(r.status))}</li>`)
          .join('')}</ul>`) +
    `<h3>How scores are calculated</h3><p class="small">${e(RISK_SCORE_EXPLANATION)}</p>` +
    `<div class="notice">Numerical risk scores do not establish engineering safety. The level shown uses the residual score where one has been assessed, otherwise the inherent score.</div>`;
  return sectionWrap('risks', body, true);
}

// ---- revisions ----

function revisionsSection(c: Ctx): string {
  const args = c.m.arguments.filter((a) => !a.archived);
  if (args.length === 0) return sectionWrap('revisions', '<p class="muted">No engineering arguments have been recorded.</p>', false);
  const body = args
    .map(
      (a) =>
        `<h3><span class="mono">${e(a.code)}</span> ${t(a.title)}</h3><p>Current revision: <strong>${e(a.revision)}</strong></p>` +
        (a.revisions.length === 0
          ? '<p class="muted">No issued revisions are recorded.</p>'
          : table(
              ['Code', 'Timestamp', 'Author', 'Summary'],
              a.revisions.map((r) => tr([`<span class="mono">${e(r.code)}</span>`, fmtDateTime(r.timestamp), r.author ? e(r.author) : '—', r.summary ? t(r.summary) : '—'])),
              { cls: 'avoid-break' }
            ))
    )
    .join('');
  return sectionWrap('revisions', body, false);
}

// ---- drawings ----

function drawingsSection(c: Ctx): string {
  const assets = c.m.assets;
  if (assets.length === 0) return sectionWrap('drawings', '<p class="muted">No drawings or models have been registered.</p>', true);
  const rows = assets.map((a) => {
    const reqs = linkedResolved(c.m, { type: 'asset', id: a.id }, 'requirement');
    const missing = c.missing.has(a.relativePath);
    return tr([
      a.drawingId ? `<span class="mono">${e(a.drawingId)}</span>` : '—',
      a.title ? t(a.title) : '—',
      e(fileNameOf(a.relativePath)),
      `<span class="mono">${e(a.relativePath)}</span>`,
      a.revision ? e(a.revision) : '—',
      e(fmtSize(a.sizeBytes)),
      refList(reqs),
      missing ? badge('missing', 'Missing') : badge('complete', 'Present')
    ]);
  });
  const figures: string[] = [];
  const notes: string[] = [];
  for (const a of assets) {
    const ext = extensionOf(a.relativePath);
    const label = `${a.drawingId ? `${a.drawingId} — ` : ''}${a.title || fileNameOf(a.relativePath)}`;
    if (ext === 'stl') {
      const unit = a.modelUnit.trim() !== '' ? `units: ${a.modelUnit}` : 'model units (unit not declared)';
      notes.push(`<li><span class="mono">${e(assetCode(a))}</span> — 3D model (view in FrameLytix); ${e(unit)}</li>`);
    } else if (REPORT_IMAGE_EXTENSIONS.includes(ext) && !c.missing.has(a.relativePath)) {
      const uri = safeImage(c.opts.images, a.relativePath);
      if (uri) figures.push(thumb(a, uri, label));
    }
  }
  const body =
    table(['Drawing ID', 'Title', 'File name', 'Relative path', 'Revision', 'Size', 'Linked requirements', 'Status'], rows) +
    (notes.length > 0 ? `<h3>3D models</h3><ul>${notes.join('')}</ul>` : '') +
    (figures.length > 0 ? `<h3>Image previews</h3><div class="figure-grid">${figures.join('')}</div>` : '');
  return sectionWrap('drawings', body, true);
}

function thumb(a: Asset, uri: string, label: string): string {
  return `<figure class="thumb"><img src="${e(uri)}" alt="${e(label)}"><figcaption>${e(label)}${a.revision ? ` (${e(a.revision)})` : ''}</figcaption></figure>`;
}

// ---- review ----

function reviewSection(c: Ctx): string {
  const items = c.m.reviewItems;
  const doc = documentationCompleteness(c.m);
  let body = '';
  if (items.length === 0) body += '<p class="muted">No design review checklist items have been recorded.</p>';
  const cats = Array.from(new Set(items.map((i) => i.category)));
  for (const cat of cats) {
    body += `<h3>${e(titleCase(cat))}</h3>`;
    body += table(
      ['Status', 'Checklist item', 'Reviewer', 'Notes'],
      items
        .filter((i) => i.category === cat)
        .map((i) => {
          const status = i.status === 'complete' ? '[x] Complete' : i.status === 'open' ? '[ ] Open' : 'N/A';
          const notes = [i.status === 'not-applicable' ? `Justification: ${i.naJustification || '(none given)'}` : '', i.notes]
            .filter((x) => x !== '')
            .map(t)
            .join('<br>');
          return tr([`<span class="mono">${e(status)}</span>`, t(i.text), i.reviewer ? e(i.reviewer) : '—', notes || '—']);
        })
    );
  }
  body +=
    `<h3>Documentation completeness</h3><p>${e(fmtPct(doc.ratio))} (${doc.complete} of ${doc.applicable} applicable items complete)</p>` +
    `<p class="small muted">${e(doc.definition)}</p>`;
  return sectionWrap('review', body, true);
}

// ---- outstanding ----

function outstandingSection(c: Ctx): string {
  const issues = detectProjectIssues(c.m, c.missing);
  const open = c.m.reviewItems.filter((i) => i.status === 'open');
  if (issues.length === 0 && open.length === 0) {
    return sectionWrap('outstanding', '<p>No outstanding items were detected automatically. This does not establish engineering adequacy.</p>', false);
  }
  let body = '';
  const groups: Array<['critical' | 'warning' | 'info', string]> = [
    ['critical', 'Critical'],
    ['warning', 'Warning'],
    ['info', 'Information']
  ];
  for (const [sev, label] of groups) {
    const list = issues.filter((i) => i.severity === sev);
    if (list.length === 0) continue;
    body += `<h3>${label} (${list.length})</h3><ul>${list
      .map((i) => `<li class="avoid-break">${badge(sev === 'info' ? 'info' : sev, label)} ${e(i.message)}</li>`)
      .join('')}</ul>`;
  }
  if (open.length > 0) {
    body += `<h3>Open review items (${open.length})</h3><ul>${open.map((i) => `<li>[ ] ${e(titleCase(i.category))}: ${t(i.text)}</li>`).join('')}</ul>`;
  }
  return sectionWrap('outstanding', body, false);
}

// ---- references ----

function referencesSection(c: Ctx): string {
  const map = new Map<string, { text: string; cited: string[] }>();
  const add = (raw: string, code: string): void => {
    for (const line of raw.split(/\r?\n/)) {
      const text = line.trim();
      if (text === '') continue;
      const key = text.toLowerCase();
      const entry = map.get(key) ?? { text, cited: [] };
      if (!entry.cited.includes(code)) entry.cited.push(code);
      map.set(key, entry);
    }
  };
  for (const a of c.m.arguments) if (!a.archived) for (const r of a.references) add(r, a.code);
  for (const k of c.m.calculations) if (!k.archived) add(k.reference, k.code);
  const entries = Array.from(map.values());
  const body =
    entries.length === 0
      ? '<p class="muted">No references have been recorded.</p>'
      : `<ol>${entries.map((r) => `<li>${t(r.text)} <span class="small muted">— cited by ${r.cited.map((x) => `<span class="mono">${e(x)}</span>`).join(', ')}</span></li>`).join('')}</ol>`;
  return sectionWrap('references', body, false);
}

function disclaimerSection(): string {
  return sectionWrap(
    'disclaimer',
    `<p>${e(BRANDING.disclaimer)}</p>` +
      `<ul>` +
      `<li>FrameLytix is not certified software.</li>` +
      `<li>No claim of compliance with any building code, standard or regulation is made or implied.</li>` +
      `<li>Use of this report does not imply that its authors or users are licensed professional engineers.</li>` +
      `<li>Conceptual designs documented here are not construction-ready.</li>` +
      `</ul>`,
    true
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildReportHtml(manifest: ProjectManifest, options: ReportOptions): string {
  const reqById = new Map(manifest.requirements.map((r) => [r.id, r.code]));
  const c: Ctx = {
    m: manifest,
    opts: options,
    missing: new Set(options.missingAssetPaths),
    reqCode: (id: string) => reqById.get(id) ?? id
  };
  const wanted = new Set(options.sections);
  const included = SECTION_ORDER.filter((k) => wanted.has(k));

  const builders: Record<ReportSectionKey, () => string> = {
    cover: () => coverSection(c),
    metadata: () => metadataSection(c),
    summary: () => summarySection(c),
    scope: () => scopeSection(c),
    criteria: () => criteriaSection(c),
    requirements: () => requirementsSection(c),
    arguments: () => argumentsSection(c),
    calculations: () => calculationsSection(c),
    traceability: () => traceabilitySection(c),
    risks: () => risksSection(c),
    revisions: () => revisionsSection(c),
    drawings: () => drawingsSection(c),
    review: () => reviewSection(c),
    outstanding: () => outstandingSection(c),
    references: () => referencesSection(c),
    disclaimer: () => disclaimerSection()
  };

  const tocEntries = included.filter((k) => k !== 'cover');
  const toc =
    tocEntries.length > 0
      ? `<nav class="toc" aria-label="Table of contents"><h2>Contents</h2><ol>${tocEntries
          .map((k, i) => `<li>${i + 1}. ${e(REPORT_SECTION_LABELS[k])}</li>`)
          .join('')}</ol></nav>`
      : '';

  const parts: string[] = [];
  for (const k of included) {
    parts.push(builders[k]());
    if (k === 'cover') parts.push(toc);
  }
  if (!included.includes('cover')) parts.unshift(toc);

  const p = manifest.project;
  const modeClass = options.mode === 'preview' ? 'mode-preview' : 'mode-export';
  const footer = `<footer class="report-footer">${e(BRANDING.appName)} — ${e(p.identifier)} — generated ${e(fmtDate(options.generatedAt))}. Documentation package; not a certification of engineering adequacy.</footer>`;
  return (
    `<!doctype html><html lang="en-CA"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${e(p.title)} — ${e(BRANDING.appName)} report</title>` +
    `<style>${reportCss(options.mode)}</style></head>` +
    `<body class="${modeClass}"><div class="sheet">${parts.join('\n')}${footer}</div></body></html>`
  );
}
