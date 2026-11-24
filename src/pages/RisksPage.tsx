import { useMemo, useState } from 'react';
import { Download, Plus, TriangleAlert } from 'lucide-react';
import type { RiskStatus } from '@shared/schemas/project';
import { newId, nextCode } from '@shared/utilities/ids';
import { risksCsv } from '@shared/utilities/csv';
import {
  IMPACT_LABELS,
  LIKELIHOOD_LABELS,
  RISK_SCORE_EXPLANATION,
  effectiveRiskScore,
  inherentRiskScore,
  riskLevel,
  unresolvedHighRisks,
  type RiskLevel
} from '@shared/utilities/risk';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { navigate } from '@/stores/uiStore';
import { RISK_LEVEL, RISK_STATUS } from '@/lib/labels';
import { Button, Callout, Checkbox, Code, EmptyState, PageBody, PageHeader, Panel, Select, SearchInput, StatusPill, cx, td, th } from '@/components/common/ui';
import { RiskEditor } from '@/components/review/RiskEditor';
import { exportCsvFile } from '@/components/review/exportHelpers';

const TH = cx(th, 'sticky top-0 z-10');
const CELL_TONE: Record<RiskLevel, string> = {
  low: 'border-emerald/30 bg-emerald/10',
  medium: 'border-amber/30 bg-amber/10',
  high: 'border-crimson/40 bg-crimson/10',
  critical: 'border-crimson/70 bg-crimson/25'
};

export default function RisksPage({ selectedId }: { selectedId?: string }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | RiskStatus>('');
  const [level, setLevel] = useState<'' | RiskLevel>('');
  const [showClosed, setShowClosed] = useState(false);

  const selected = selectedId ? manifest.risks.find((r) => r.id === selectedId) : undefined;
  const urgent = useMemo(() => unresolvedHighRisks(manifest), [manifest]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return manifest.risks
      .filter((r) => {
        if (r.id === selectedId) return true;
        if (!showClosed && (r.archived || r.status === 'closed')) return false;
        if (status && r.status !== status) return false;
        if (level && riskLevel(effectiveRiskScore(r)) !== level) return false;
        if (q && !`${r.code} ${r.title} ${r.category} ${r.owner}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => effectiveRiskScore(b) - effectiveRiskScore(a) || a.code.localeCompare(b.code));
  }, [manifest.risks, query, status, level, showClosed, selectedId]);

  // Matrix of counts by current (residual where assessed) likelihood and impact, non-archived risks only.
  const matrix = useMemo(() => {
    const grid: number[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
    for (const r of manifest.risks) {
      if (r.archived) continue;
      const l = r.residualLikelihood !== null && r.residualImpact !== null ? r.residualLikelihood : r.likelihood;
      const i = r.residualLikelihood !== null && r.residualImpact !== null ? r.residualImpact : r.impact;
      grid[l - 1]![i - 1]!++;
    }
    return grid;
  }, [manifest.risks]);

  const create = () => {
    const id = newId();
    const now = new Date().toISOString();
    update((m) => {
      m.risks.push({
        id,
        code: nextCode('RSK', m.risks.map((r) => r.code)),
        title: 'New risk',
        description: '',
        category: '',
        likelihood: 3,
        impact: 3,
        residualLikelihood: null,
        residualImpact: null,
        mitigation: '',
        owner: '',
        status: 'open',
        notes: '',
        archived: false,
        createdAt: now,
        modifiedAt: now
      });
    });
    navigate({ view: 'risks', id });
  };

  const open = (id: string) => navigate({ view: 'risks', id });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Risk Register"
        subtitle="Lightweight qualitative register. Scores are your own judgement."
        actions={
          <>
            <Button icon={Download} onClick={() => void exportCsvFile(risksCsv(manifest), 'risk-register.csv', 'Risk register')} disabled={manifest.risks.length === 0}>
              Export CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={create}>
              New risk
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PageBody className="flex min-w-0 flex-1 flex-col gap-4">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <TriangleAlert size={14} className="text-crimson-hover" aria-hidden="true" /> Unresolved high-priority risks
                <span className="font-mono text-2xs text-dim">{urgent.length}</span>
              </span>
            }
          >
            {urgent.length === 0 ? (
              <p className="text-xs text-silver">No unresolved high or critical risks are recorded. This reflects the register only; it does not show the design is free of risk.</p>
            ) : (
              <ul className="divide-y divide-gunmetal">
                {urgent.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => open(r.id)} className="flex w-full items-center gap-2.5 px-1 py-1.5 text-left hover:bg-matte">
                      <Code className="text-crimson-hover">{r.code}</Code>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-white">{r.title}</span>
                      <StatusPill meta={RISK_LEVEL[riskLevel(effectiveRiskScore(r))]} />
                      <span className="font-mono text-xs text-silver">{effectiveRiskScore(r)}</span>
                      <StatusPill meta={RISK_STATUS[r.status]} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search risks…" className="w-56" />
            <Select value={status} onChange={(e) => setStatus(e.target.value as '' | RiskStatus)} aria-label="Filter by status" className="w-40">
              <option value="">All statuses</option>
              {(Object.keys(RISK_STATUS) as RiskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {RISK_STATUS[s].label}
                </option>
              ))}
            </Select>
            <Select value={level} onChange={(e) => setLevel(e.target.value as '' | RiskLevel)} aria-label="Filter by level" className="w-36">
              <option value="">All levels</option>
              {(Object.keys(RISK_LEVEL) as RiskLevel[]).map((l) => (
                <option key={l} value={l}>
                  {RISK_LEVEL[l].label}
                </option>
              ))}
            </Select>
            <Checkbox checked={showClosed} onChange={setShowClosed} label="Show closed / archived" />
            <span className="ml-auto font-mono text-xs text-dim">
              {rows.length} of {manifest.risks.length}
            </span>
          </div>

          {manifest.risks.length === 0 ? (
            <EmptyState
              icon={TriangleAlert}
              title="No risks recorded yet"
              message="Record what could go wrong with the design, rate likelihood and impact, and note the mitigation."
              action={
                <Button variant="primary" icon={Plus} onClick={create}>
                  Add the first risk
                </Button>
              }
            />
          ) : (
            <div className="max-h-[48vh] min-h-[200px] overflow-auto rounded-lg border border-gunmetal">
              <table className="w-full min-w-[900px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={TH}>Code</th>
                    <th className={TH}>Title</th>
                    <th className={TH}>Category</th>
                    <th className={cx(TH, 'text-right')} title="Likelihood 1–5">L</th>
                    <th className={cx(TH, 'text-right')} title="Impact 1–5">I</th>
                    <th className={cx(TH, 'text-right')}>Inherent</th>
                    <th className={cx(TH, 'text-right')}>Residual</th>
                    <th className={TH}>Level</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const eff = effectiveRiskScore(r);
                    const assessed = r.residualLikelihood !== null && r.residualImpact !== null;
                    return (
                      <tr key={r.id} className={cx('cursor-pointer hover:bg-matte/60', r.id === selectedId && 'bg-crimson/10', r.archived && 'opacity-60')} onClick={() => open(r.id)}>
                        <td className={td}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              open(r.id);
                            }}
                            aria-current={r.id === selectedId}
                          >
                            <Code className="text-crimson-hover">{r.code}</Code>
                          </button>
                        </td>
                        <td className={cx(td, 'max-w-[280px] text-white')}>
                          {r.title}
                          {r.archived ? <span className="ml-1.5 text-2xs text-amber">(archived)</span> : null}
                        </td>
                        <td className={cx(td, 'text-silver')}>{r.category || '—'}</td>
                        <td className={cx(td, 'text-right font-mono')}>{r.likelihood}</td>
                        <td className={cx(td, 'text-right font-mono')}>{r.impact}</td>
                        <td className={cx(td, 'text-right font-mono')}>{inherentRiskScore(r)}</td>
                        <td className={cx(td, 'text-right font-mono')}>{assessed ? eff : '—'}</td>
                        <td className={td}>
                          <StatusPill meta={RISK_LEVEL[riskLevel(eff)]} />
                        </td>
                        <td className={td}>
                          <StatusPill meta={RISK_STATUS[r.status]} />
                        </td>
                        <td className={cx(td, 'text-silver')}>{r.owner || '—'}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className={cx(td, 'py-6 text-center text-silver')}>
                        No risks match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Likelihood × impact matrix (counts)">
              <table className="border-separate border-spacing-1 text-center" aria-label="Count of risks by likelihood and impact">
                <thead>
                  <tr>
                    <th className="text-2xs font-normal text-dim" scope="col">L \ I</th>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <th key={i} scope="col" className="w-16 text-2xs font-normal text-silver">
                        {i} {IMPACT_LABELS[i]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[5, 4, 3, 2, 1].map((l) => (
                    <tr key={l}>
                      <th scope="row" className="pr-1 text-right text-2xs font-normal text-silver">
                        {l} {LIKELIHOOD_LABELS[l]}
                      </th>
                      {[1, 2, 3, 4, 5].map((i) => {
                        const n = matrix[l - 1]![i - 1]!;
                        return (
                          <td
                            key={i}
                            className={cx('h-9 rounded border font-mono text-xs', CELL_TONE[riskLevel(l * i)], n === 0 ? 'text-dim' : 'font-semibold text-white')}
                            aria-label={`Likelihood ${l}, impact ${i}, score ${l * i}: ${n} risk${n === 1 ? '' : 's'}`}
                          >
                            {n}
                            <span className="ml-1 text-[9px] font-normal text-dim">/{l * i}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-2xs text-dim">Counts non-archived risks at their current rating (residual where assessed). Small figure after the slash is the cell score.</p>
            </Panel>
            <Callout tone="neutral" title="About risk scores">
              {RISK_SCORE_EXPLANATION} Numerical risk scores do not establish engineering safety.
            </Callout>
          </div>
        </PageBody>
        {selected ? <RiskEditor key={selected.id} risk={selected} /> : null}
      </div>
    </div>
  );
}
