import type { ArgumentContent, ProjectManifest, Requirement } from '../schemas/project';
import { computeMatrix, formatScore, getScore } from './decisionMatrix';
import { effectiveRiskScore, inherentRiskScore, riskLevel } from './risk';
import { buildTraceabilityRows } from './traceability';

export type CsvCell = string | number | null | undefined;

const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** Neutralise spreadsheet formula injection in string cells. */
function guardFormula(s: string): string {
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) return `'${s}`;
  return s;
}

function encodeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  let s: string;
  if (typeof cell === 'number') {
    s = Number.isFinite(cell) ? String(cell) : '';
  } else {
    s = guardFormula(cell);
  }
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** RFC 4180 CSV with CRLF line endings, UTF-8 BOM and a formula-injection guard. */
export function toCsv(rows: CsvCell[][]): string {
  return '﻿' + rows.map((r) => r.map(encodeCell).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');
}

export function requirementsCsv(manifest: ProjectManifest): string {
  const rows: CsvCell[][] = [
    ['Code', 'Title', 'Section', 'Category', 'Classification', 'Priority', 'Acceptance criterion', 'Target value', 'Unit', 'Source', 'Verification method', 'Status', 'Verification notes']
  ];
  for (const r of manifest.requirements.filter((x) => !x.archived)) {
    rows.push([
      r.code, r.title, r.section, r.category, r.classification, r.priority, r.acceptanceCriterion,
      r.targetValue, r.unit, r.source, r.verificationMethod, r.status, r.verificationNotes
    ]);
  }
  return toCsv(rows);
}

export function decisionMatrixCsv(argument: ArgumentContent, mandatoryRequirements: Requirement[]): string {
  const result = computeMatrix(argument, mandatoryRequirements);
  const alts = argument.alternatives;
  const rows: CsvCell[][] = [['Criterion', 'Weight (%)', ...alts.map((a) => a.name)]];
  for (const c of argument.matrix.criteria) {
    rows.push([c.name, c.weight, ...alts.map((a) => getScore(argument.matrix, a.id, c.id))]);
  }
  rows.push([]);
  rows.push([
    'Weighted score (total weight ' + result.weightTotal + '%)',
    '',
    ...result.alternatives.map((a) => (a.weightedScore === null ? 'Incomplete' : formatScore(a.weightedScore)))
  ]);
  rows.push(['Eligibility', '', ...result.alternatives.map((a) => a.eligibility)]);
  rows.push([
    'Recommended',
    '',
    ...result.alternatives.map((a) => (a.isRecommended ? (result.recommendedIsProvisional ? 'Yes (provisional)' : 'Yes') : ''))
  ]);
  rows.push(['Selected', '', ...result.alternatives.map((a) => (a.isSelected ? 'Yes' : ''))]);
  if (mandatoryRequirements.length > 0) {
    rows.push([]);
    rows.push(['Mandatory constraint', 'Requirement', ...alts.map((a) => a.name)]);
    for (const req of mandatoryRequirements) {
      rows.push([
        req.code,
        req.title,
        ...alts.map((a) => {
          const ev = argument.constraintEvaluations.find((e) => e.alternativeId === a.id && e.requirementId === req.id);
          return ev ? ev.result : 'unverified';
        })
      ]);
    }
  }
  return toCsv(rows);
}

export function traceabilityCsv(manifest: ProjectManifest, missingAssetPaths: Set<string>): string {
  const rows: CsvCell[][] = [
    ['Requirement', 'Title', 'Status', 'Arguments', 'Calculations', 'Drawings and files', 'Evidence', 'Risks', 'Evidence status', 'Missing files', 'Broken links']
  ];
  const codes = (refs: { code: string }[]): string => refs.map((r) => r.code).join('; ');
  for (const row of buildTraceabilityRows(manifest, missingAssetPaths)) {
    rows.push([
      row.requirement.code, row.requirement.title, row.verificationStatus,
      codes(row.arguments), codes(row.calculations), codes(row.assets), codes(row.evidence), codes(row.risks),
      row.evidenceStatus, codes(row.missingAssets), codes(row.brokenLinks)
    ]);
  }
  return toCsv(rows);
}

export function risksCsv(manifest: ProjectManifest): string {
  const rows: CsvCell[][] = [
    ['Code', 'Title', 'Category', 'Likelihood', 'Impact', 'Inherent score', 'Residual likelihood', 'Residual impact', 'Effective score', 'Level', 'Status', 'Owner', 'Mitigation']
  ];
  for (const r of manifest.risks.filter((x) => !x.archived)) {
    const eff = effectiveRiskScore(r);
    rows.push([
      r.code, r.title, r.category, r.likelihood, r.impact, inherentRiskScore(r),
      r.residualLikelihood, r.residualImpact, eff, riskLevel(eff), r.status, r.owner, r.mitigation
    ]);
  }
  return toCsv(rows);
}
