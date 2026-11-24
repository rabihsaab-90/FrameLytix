import { useMemo, useState } from 'react';
import { ClipboardCheck, Plus } from 'lucide-react';
import type { ReviewCategory } from '@shared/schemas/project';
import { detectProjectIssues, documentationCompleteness } from '@shared/utilities/completeness';
import type { IssueSeverity } from '@shared/utilities/issues';
import { newId } from '@shared/utilities/ids';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { REVIEW_CATEGORY, formatPercent } from '@/lib/labels';
import { Button, Checkbox, EmptyState, Meter, PageBody, PageHeader, Panel, Select, TextInput } from '@/components/common/ui';
import { IssueList, SEVERITY_META } from '@/components/review/IssueList';
import { ReviewItemRow } from '@/components/review/ReviewItemRow';

const CATEGORIES = Object.keys(REVIEW_CATEGORY) as ReviewCategory[];
const SEVERITIES: IssueSeverity[] = ['critical', 'warning', 'info'];

function Legend() {
  const rows: { term: string; text: string; strong?: boolean }[] = [
    { term: 'Automatically detected documentation completeness', text: 'Checks run by FrameLytix on the project data: missing links, empty fields, unverified constraints, open checklist items.' },
    { term: 'User-entered verification', text: 'Requirement statuses (for example “Verified”) are recorded by the user. FrameLytix does not check the basis for them.' },
    { term: 'Internal review status', text: 'Engineering argument statuses (Draft, Under Review, Approved) are internal workflow labels. “Approved” is not professional certification.' },
    { term: 'Actual engineering validity', text: 'Not assessed by FrameLytix; requires qualified professional review.', strong: true }
  ];
  return (
    <Panel title="What these measures mean">
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.term} className={r.strong ? 'rounded-md border border-crimson/40 bg-crimson/5 p-2.5' : 'rounded-md border border-gunmetal p-2.5'}>
            <dt className="text-xs font-semibold text-white">{r.term}</dt>
            <dd className="mt-0.5 text-xs text-silver">{r.text}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export default function ReviewPage() {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const missingAssets = useProjectStore((s) => s.missingAssets);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [category, setCategory] = useState<'' | ReviewCategory>('');
  const [newCategory, setNewCategory] = useState<ReviewCategory>('scope');
  const [newText, setNewText] = useState('');

  const issues = useMemo(() => detectProjectIssues(manifest, new Set(missingAssets)), [manifest, missingAssets]);
  const completeness = useMemo(() => documentationCompleteness(manifest), [manifest]);

  const grouped = useMemo(() => {
    const items = manifest.reviewItems.filter((i) => {
      if (category && i.category !== category) return false;
      if (incompleteOnly && !(i.status === 'open' || (i.status === 'not-applicable' && i.naJustification.trim() === ''))) return false;
      return true;
    });
    return CATEGORIES.map((c) => ({ category: c, items: items.filter((i) => i.category === c) })).filter((g) => g.items.length > 0);
  }, [manifest.reviewItems, category, incompleteOnly]);

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    update((m) => {
      m.reviewItems.push({
        id: newId(),
        category: newCategory,
        text,
        source: 'custom',
        status: 'open',
        naJustification: '',
        reviewer: '',
        notes: '',
        modifiedAt: new Date().toISOString()
      });
    });
    setNewText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Design Review" subtitle="Documentation checks and the design-review checklist. Neither establishes that the design is correct." />
      <PageBody className="flex flex-col gap-5">
        <Legend />

        <Panel title="Documentation completeness">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-mono text-2xl font-semibold text-white">{formatPercent(completeness.ratio)}</span>
            <div className="min-w-[200px] flex-1">
              <Meter ratio={completeness.ratio} tone="info" label="Documentation completeness" />
              <p className="mt-1 font-mono text-xs text-white">
                {completeness.complete} of {completeness.applicable} <span className="font-sans text-dim">applicable checklist items complete</span>
              </p>
            </div>
          </div>
          <p className="mt-2 text-2xs text-dim">{completeness.definition}</p>
        </Panel>

        <Panel
          title="Detected documentation issues"
          actions={<span className="text-2xs text-dim">Automatically detected — documentation checks only</span>}
        >
          {issues.length === 0 ? (
            <p className="text-xs text-silver">No documentation issues detected. This does not mean the design has been checked or is correct.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {SEVERITIES.map((sev) => {
                const list = issues.filter((i) => i.severity === sev);
                if (list.length === 0) return null;
                const m = SEVERITY_META[sev];
                const Icon = m.icon;
                return (
                  <section key={sev} aria-label={`${m.label} issues`}>
                    <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Icon size={13} aria-hidden="true" /> {m.label}
                      <span className="font-mono text-2xs text-dim">{list.length}</span>
                    </h3>
                    <IssueList issues={list} manifest={manifest} showSeverity={false} />
                  </section>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Review checklist" bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-gunmetal px-4 py-2.5">
            <Checkbox checked={incompleteOnly} onChange={setIncompleteOnly} label="Incomplete only" />
            <Select value={category} onChange={(e) => setCategory(e.target.value as '' | ReviewCategory)} aria-label="Filter by category" className="w-52">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {REVIEW_CATEGORY[c]}
                </option>
              ))}
            </Select>
            <span className="ml-auto font-mono text-xs text-dim">{manifest.reviewItems.length} items</span>
          </div>

          <form
            className="flex flex-wrap items-center gap-2 border-b border-gunmetal px-4 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              addItem();
            }}
          >
            <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value as ReviewCategory)} aria-label="Category for the new item" className="w-52">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {REVIEW_CATEGORY[c]}
                </option>
              ))}
            </Select>
            <TextInput value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Add a custom checklist item…" aria-label="Custom checklist item text" className="min-w-[240px] flex-1" maxLength={2000} />
            <Button type="submit" icon={Plus} disabled={newText.trim() === ''}>
              Add item
            </Button>
          </form>

          {manifest.reviewItems.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={ClipboardCheck} title="No checklist items" message="Add your own items above to track what needs to be reviewed before the report is issued." />
            </div>
          ) : grouped.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-silver">No checklist items match the current filters.</p>
          ) : (
            grouped.map((g) => {
              const all = manifest.reviewItems.filter((i) => i.category === g.category);
              const done = all.filter((i) => i.status === 'complete').length;
              const applicable = all.filter((i) => i.status !== 'not-applicable').length;
              return (
                <section key={g.category} aria-label={REVIEW_CATEGORY[g.category]}>
                  <h3 className="flex items-center justify-between border-b border-gunmetal bg-matte px-4 py-1.5 text-xs font-semibold text-white">
                    {REVIEW_CATEGORY[g.category]}
                    <span className="font-mono text-2xs font-normal text-silver">
                      {done} of {applicable} complete
                    </span>
                  </h3>
                  <ul>
                    {g.items.map((item) => (
                      <ReviewItemRow key={item.id} item={item} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </Panel>
      </PageBody>
    </div>
  );
}
