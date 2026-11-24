import { useMemo, useState } from 'react';
import { Download, Network, ShieldAlert } from 'lucide-react';
import type { RequirementClassification } from '@shared/schemas/project';
import { traceabilityCsv } from '@shared/utilities/csv';
import {
  buildTraceabilityRows,
  detectTraceabilityIssues,
  evidenceCoverage,
  traceabilityCoverage,
  type Coverage,
  type ResolvedRef,
  type TraceabilityRow
} from '@shared/utilities/traceability';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { CLASSIFICATION, REQUIREMENT_STATUS, formatPercent } from '@/lib/labels';
import {
  Badge,
  Button,
  Checkbox,
  Code,
  DynamicIcon,
  EmptyState,
  Meter,
  PageBody,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  StatusPill,
  cx,
  td,
  th
} from '@/components/common/ui';
import { EntityChip } from '@/components/traceability/LinkManager';
import { EVIDENCE_STATUS_LABEL, TraceChain } from '@/components/traceability/TraceChain';
import { IssueList } from '@/components/review/IssueList';
import { exportCsvFile } from '@/components/review/exportHelpers';

const TH = cx(th, 'sticky top-0 z-10');

/** A gap = any link category with nothing linked (and no recorded "not applicable" justification), no evidence, or a broken link. */
function gapsOf(row: TraceabilityRow): string[] {
  const r = row.requirement;
  if (r.status === 'not-applicable') return [];
  const gaps: string[] = [];
  const live = (refs: ResolvedRef[]) => refs.some((x) => x.exists && !x.archived);
  if (!live(row.arguments) && !r.notApplicableLinks.argument.trim()) gaps.push('arguments');
  if (!live(row.calculations) && !r.notApplicableLinks.calculation.trim()) gaps.push('calculations');
  if (!live(row.assets) && !r.notApplicableLinks.asset.trim()) gaps.push('assets');
  if (row.evidenceStatus === 'missing') gaps.push('evidence');
  if (row.brokenLinks.length > 0) gaps.push('broken links');
  if (row.missingAssets.length > 0) gaps.push('missing files');
  return gaps;
}

function Cell({ refs, na, missingIds }: { refs: ResolvedRef[]; na?: string; missingIds?: Set<string> }) {
  if (refs.length === 0) {
    return na && na.trim() ? (
      <span className="text-xs text-silver">
        <Badge tone="neutral">N/A</Badge> <span title={na}>{na}</span>
      </span>
    ) : (
      <span className="text-xs text-dim">—</span>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {refs.map((r) => (
        <EntityChip key={r.ref.id} entity={r.ref} missing={missingIds?.has(r.ref.id)} />
      ))}
    </div>
  );
}

function CoverageCard({ title, c }: { title: string; c: Coverage }) {
  return (
    <div className="min-w-0 rounded-lg border border-gunmetal bg-carbon p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-silver">{title}</span>
        <span className="font-mono text-lg font-semibold text-white">{formatPercent(c.ratio)}</span>
      </div>
      <div className="mt-1.5">
        <Meter ratio={c.ratio} tone="info" label={title} />
      </div>
      <p className="mt-1.5 font-mono text-xs text-white">
        {c.covered} of {c.total} <span className="font-sans text-dim">active requirements</span>
      </p>
      <p className="mt-1 text-2xs leading-snug text-dim">{c.definition}</p>
    </div>
  );
}

export default function TraceabilityPage() {
  const manifest = useManifest();
  const missingAssets = useProjectStore((s) => s.missingAssets);
  const missingSet = useMemo(() => new Set(missingAssets), [missingAssets]);
  const [query, setQuery] = useState('');
  const [classification, setClassification] = useState<'' | RequirementClassification>('');
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => buildTraceabilityRows(manifest, missingSet), [manifest, missingSet]);
  const issues = useMemo(() => detectTraceabilityIssues(manifest, missingSet), [manifest, missingSet]);
  const tCov = useMemo(() => traceabilityCoverage(manifest), [manifest]);
  const eCov = useMemo(() => evidenceCoverage(manifest), [manifest]);
  const gapCount = useMemo(() => rows.filter((r) => gapsOf(r).length > 0).length, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const r = row.requirement;
      if (classification && r.classification !== classification) return false;
      if (onlyGaps && gapsOf(row).length === 0) return false;
      if (q) {
        const hay = [r.code, r.title, ...[...row.arguments, ...row.calculations, ...row.assets, ...row.evidence].map((x) => `${x.code} ${x.title}`)].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, classification, onlyGaps]);

  const selected = selectedId ? rows.find((r) => r.requirement.id === selectedId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Requirements Traceability Matrix"
        subtitle="How each requirement links to arguments, calculations, drawings and evidence. Select a row to trace it."
        actions={
          <Button icon={Download} onClick={() => void exportCsvFile(traceabilityCsv(manifest, missingSet), 'traceability-matrix.csv', 'Traceability matrix')} disabled={rows.length === 0}>
            Export CSV
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PageBody className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CoverageCard title="Traceability coverage" c={tCov} />
            <CoverageCard title="Evidence coverage" c={eCov} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search requirements and links…" className="w-64" />
            <Select value={classification} onChange={(e) => setClassification(e.target.value as '' | RequirementClassification)} aria-label="Filter by classification" className="w-48">
              <option value="">All classifications</option>
              {(Object.keys(CLASSIFICATION) as RequirementClassification[]).map((c) => (
                <option key={c} value={c}>
                  {CLASSIFICATION[c].label}
                </option>
              ))}
            </Select>
            <span title="Rows with no linked arguments, calculations or assets (without a not-applicable justification), no evidence, or broken or missing links.">
              <Checkbox checked={onlyGaps} onChange={setOnlyGaps} label={`Only gaps (${gapCount})`} />
            </span>
            <span className="ml-auto font-mono text-xs text-dim">
              {visible.length} of {rows.length} requirements
            </span>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={Network} title="No requirements to trace" message="Add requirements first, then link them to engineering arguments, calculations, drawings and evidence." />
          ) : (
            <div className="max-h-[62vh] min-h-[260px] shrink-0 overflow-auto rounded-lg border border-gunmetal">
              <table className="w-full min-w-[1180px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={TH}>Requirement</th>
                    <th className={TH}>Title</th>
                    <th className={TH}>Class</th>
                    <th className={TH}>Arguments</th>
                    <th className={TH}>Calculations</th>
                    <th className={TH}>Technical assets</th>
                    <th className={TH}>Evidence</th>
                    <th className={TH}>Verification</th>
                    <th className={TH}>Evidence status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const r = row.requirement;
                    const missingIds = new Set(row.missingAssets.map((m) => m.ref.id));
                    const ev = EVIDENCE_STATUS_LABEL[row.evidenceStatus];
                    const isSel = selectedId === r.id;
                    return (
                      <tr key={r.id} className={cx('hover:bg-matte/60', isSel && 'bg-crimson/10')} aria-selected={isSel}>
                        <td className={td}>
                          <button type="button" onClick={() => setSelectedId(isSel ? null : r.id)} className="flex items-center gap-1.5 text-left hover:text-white" aria-pressed={isSel} title="Trace this requirement">
                            <Network size={12} className={isSel ? 'text-crimson-hover' : 'text-dim'} aria-hidden="true" />
                            <Code className="text-crimson-hover">{r.code}</Code>
                          </button>
                        </td>
                        <td className={cx(td, 'max-w-[260px] text-white')}>{r.title}</td>
                        <td className={td}>
                          <StatusPill meta={CLASSIFICATION[r.classification]} />
                        </td>
                        <td className={td}>
                          <Cell refs={row.arguments} na={r.notApplicableLinks.argument} />
                        </td>
                        <td className={td}>
                          <Cell refs={row.calculations} na={r.notApplicableLinks.calculation} />
                        </td>
                        <td className={td}>
                          <Cell refs={row.assets} na={r.notApplicableLinks.asset} missingIds={missingIds} />
                        </td>
                        <td className={td}>
                          <Cell refs={row.evidence} />
                        </td>
                        <td className={td}>
                          <StatusPill meta={REQUIREMENT_STATUS[row.verificationStatus]} />
                        </td>
                        <td className={td}>
                          <Badge tone={ev.tone}>
                            <DynamicIcon name={ev.icon} size={11} />
                            {ev.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={cx(td, 'py-6 text-center text-silver')}>
                        No requirements match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          <Panel
            title={
              <span className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-silver" aria-hidden="true" /> Traceability issues <span className="font-mono text-2xs text-dim">{issues.length}</span>
              </span>
            }
            bodyClassName="max-h-64 overflow-auto"
          >
            {issues.length === 0 ? (
              <p className="text-xs text-silver">No traceability issues detected. This checks documentation links only.</p>
            ) : (
              <IssueList issues={issues} manifest={manifest} />
            )}
          </Panel>
        </PageBody>
        {selected ? <TraceChain row={selected} onClose={() => setSelectedId(null)} /> : null}
      </div>
    </div>
  );
}
