import { useMemo, type ReactNode } from 'react';
import { ArrowUpRight, FileText, Info, Scale, ShieldAlert } from 'lucide-react';
import type { ArgumentStatus } from '@shared/schemas/project';
import { detectProjectIssues, projectStats } from '@shared/utilities/completeness';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { navigate } from '@/stores/uiStore';
import type { WorkspaceRoute } from '@/lib/navigation';
import { ARGUMENT_STATUS, DISCIPLINE_LABEL, formatDate, formatPercent, type Tone } from '@/lib/labels';
import { Callout, Code, EmptyState, Field, Meter, Panel, PageBody, PageHeader, TextArea, cx } from '@/components/common/ui';
import { COMPLETENESS_NOTE, IssueList } from '@/components/review/IssueList';

const BAR_TONE: Record<Tone, string> = { neutral: 'bg-silver', crimson: 'bg-crimson', amber: 'bg-amber', emerald: 'bg-emerald', info: 'bg-info' };

function StatCard({ title, route, value, unit, children, hint }: { title: string; route: WorkspaceRoute; value: ReactNode; unit?: string; children?: ReactNode; hint?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => navigate(route)}
      className="group flex min-w-0 flex-col gap-2 rounded-lg border border-gunmetal bg-carbon p-3.5 text-left transition-colors hover:border-steel hover:bg-matte"
    >
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-silver">
        {title}
        <ArrowUpRight size={13} className="text-dim group-hover:text-white" aria-hidden="true" />
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold text-white">{value}</span>
        {unit ? <span className="font-mono text-xs text-silver">{unit}</span> : null}
      </span>
      {children}
      {hint ? <span className="text-2xs text-dim">{hint}</span> : null}
    </button>
  );
}

function MetaItem({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs tracking-wide text-dim uppercase">{label}</dt>
      <dd className={cx('truncate text-[13px] text-white', mono && 'font-mono text-[12px]')} title={typeof children === 'string' ? children : undefined}>
        {children}
      </dd>
    </div>
  );
}

export default function OverviewPage() {
  const manifest = useManifest();
  const missingAssets = useProjectStore((s) => s.missingAssets);
  const update = useProjectStore((s) => s.update);
  const stats = useMemo(() => projectStats(manifest, new Set(missingAssets)), [manifest, missingAssets]);
  const issues = useMemo(() => detectProjectIssues(manifest, new Set(missingAssets)), [manifest, missingAssets]);
  const p = manifest.project;
  const { requirements: rq, arguments: ag, assets, risks, review, traceability: tr } = stats;
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  const statuses = Object.keys(ARGUMENT_STATUS) as ArgumentStatus[];
  const shownIssues = issues.slice(0, 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={p.title}
        subtitle={p.description || 'No project description yet.'}
        badges={<Code className="text-crimson-hover">{p.identifier}</Code>}
      />
      <PageBody className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-gunmetal bg-carbon p-4 md:grid-cols-4">
          <MetaItem label="Discipline">{p.disciplineLabel || DISCIPLINE_LABEL[p.discipline] || p.discipline}</MetaItem>
          <MetaItem label="Archetype">{p.archetypeName}</MetaItem>
          <MetaItem label="Identifier" mono>{p.identifier}</MetaItem>
          <MetaItem label="Unit system">{p.unitSystem}</MetaItem>
          <MetaItem label="Author / team">{p.author || '—'}</MetaItem>
          <MetaItem label="Organization">{p.organization || '—'}</MetaItem>
          <MetaItem label="Created">{formatDate(p.createdAt)}</MetaItem>
          <MetaItem label="Last modified">{formatDate(p.modifiedAt)}</MetaItem>
        </dl>

        <Callout tone="info" icon={Info} title="Documentation completeness is not engineering safety">
          {COMPLETENESS_NOTE}
        </Callout>

        <section aria-label="Project statistics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Requirements completion"
            route={{ view: 'requirements' }}
            value={formatPercent(rq.completionRatio)}
            hint={rq.active === 0 ? 'No active requirements yet' : `${rq.verified + rq.notApplicable} of ${rq.active} verified or not applicable`}
          >
            <Meter ratio={rq.completionRatio} tone="emerald" label="Requirements verified or not applicable" />
          </StatCard>

          <StatCard
            title="Mandatory constraints verified"
            route={{ view: 'requirements' }}
            value={rq.mandatory === 0 ? '—' : `${rq.mandatoryVerified} of ${rq.mandatory}`}
            hint={rq.mandatory === 0 ? 'No mandatory constraints defined' : 'User-recorded status, not independently checked'}
          >
            <Meter ratio={rq.mandatory === 0 ? null : rq.mandatoryVerified / rq.mandatory} tone="emerald" label="Mandatory constraints verified" />
          </StatCard>

          <StatCard title="Engineering arguments" route={{ view: 'arguments' }} value={ag.total}>
            {ag.total === 0 ? (
              <span className="text-2xs text-dim">No arguments yet — create your first engineering argument.</span>
            ) : (
              <>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gunmetal" role="img" aria-label={statuses.map((s) => `${ag.byStatus[s]} ${ARGUMENT_STATUS[s].label}`).join(', ')}>
                  {statuses.map((s) =>
                    ag.byStatus[s] > 0 ? <div key={s} className={BAR_TONE[ARGUMENT_STATUS[s].tone]} style={{ width: `${(ag.byStatus[s] / ag.total) * 100}%` }} /> : null
                  )}
                </div>
                <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-silver">
                  {statuses.map((s) => (
                    <li key={s} className="flex items-center gap-1">
                      <span className={cx('h-2 w-2 rounded-sm', BAR_TONE[ARGUMENT_STATUS[s].tone])} aria-hidden="true" />
                      {ARGUMENT_STATUS[s].label} <span className="font-mono text-white">{ag.byStatus[s]}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </StatCard>

          <StatCard title="Calculations" route={{ view: 'calculations' }} value={stats.calculations.total} hint={stats.calculations.total === 0 ? 'No calculations recorded yet' : undefined} />

          <StatCard
            title="Drawings & models"
            route={{ view: 'assets' }}
            value={assets.total}
            hint={
              assets.total === 0 ? (
                'No files imported yet'
              ) : assets.missing > 0 ? (
                <span className="text-[#fca5a5]">{assets.missing} file{assets.missing === 1 ? '' : 's'} missing from the project folder</span>
              ) : (
                'All referenced files found'
              )
            }
          />

          <StatCard
            title="Unresolved risks"
            route={{ view: 'risks' }}
            value={risks.unresolved}
            hint={risks.total === 0 ? 'No risks recorded yet' : `${risks.unresolvedHigh} high-priority (high or critical) · ${risks.total} in register`}
          />

          <StatCard
            title="Outstanding review items"
            route={{ view: 'review' }}
            value={review.open}
            unit={review.total > 0 ? `of ${review.total}` : undefined}
            hint={review.total === 0 ? 'No review checklist items' : `${review.complete} complete · ${review.notApplicable} not applicable`}
          >
            {review.total > 0 ? <Meter ratio={review.completenessRatio} tone="info" label="Review checklist completion" /> : null}
          </StatCard>

          <StatCard
            title="Traceability coverage"
            route={{ view: 'traceability' }}
            value={formatPercent(tr.ratio)}
            hint={tr.total === 0 ? 'No active requirements to trace' : `${tr.covered} of ${tr.total} active requirements linked`}
          >
            <Meter ratio={tr.ratio} tone="info" label="Traceability coverage" />
            <span className="text-2xs text-dim" title={tr.definition}>
              Definition: share of active requirements with at least one live link. Hover for full definition.
            </span>
          </StatCard>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <Panel
            className="xl:col-span-3"
            title={
              <span className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-silver" aria-hidden="true" /> Issues detected
              </span>
            }
            actions={
              <button type="button" className="text-2xs text-silver hover:text-white" onClick={() => navigate({ view: 'review' })}>
                Open design review
              </button>
            }
          >
            {issues.length === 0 ? (
              <EmptyState
                icon={Scale}
                title="No documentation issues detected"
                message="Automated checks cover documentation only. This does not mean the design has been checked or is correct."
              />
            ) : (
              <>
                <p className="mb-2 text-xs text-silver">
                  <span className="font-mono text-white">{counts.critical}</span> critical · <span className="font-mono text-white">{counts.warning}</span> warnings ·{' '}
                  <span className="font-mono text-white">{counts.info}</span> info. Automatically detected — documentation checks only.
                </p>
                <IssueList issues={shownIssues} manifest={manifest} />
                {issues.length > shownIssues.length ? (
                  <button type="button" className="mt-2 text-xs text-crimson-hover hover:underline" onClick={() => navigate({ view: 'review' })}>
                    Show all {issues.length} issues in Design Review
                  </button>
                ) : null}
              </>
            )}
          </Panel>

          <Panel
            className="xl:col-span-2"
            title={
              <span className="flex items-center gap-2">
                <FileText size={14} className="text-silver" aria-hidden="true" /> Project scope
              </span>
            }
            bodyClassName="flex flex-col gap-3"
          >
            <Field label="Scope" hint="What problem are we solving? What is in and out of scope?">
              {(id, d) => (
                <TextArea
                  id={id}
                  aria-describedby={d}
                  minRows={4}
                  value={p.scope}
                  onChange={(e) => update((m) => void (m.project.scope = e.target.value))}
                  placeholder="Describe the problem, boundaries and key assumptions."
                />
              )}
            </Field>
            <Field label="Summary" hint="Used as the executive summary in the report.">
              {(id, d) => (
                <TextArea
                  id={id}
                  aria-describedby={d}
                  minRows={4}
                  value={p.summary}
                  onChange={(e) => update((m) => void (m.project.summary = e.target.value))}
                  placeholder="A short summary of the design and its current state."
                />
              )}
            </Field>
          </Panel>
        </div>
      </PageBody>
    </div>
  );
}
