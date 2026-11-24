import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Scale } from 'lucide-react';
import type { ArgumentStatus } from '@shared/schemas/project';
import { computeMatrix, formatScore, mandatoryRequirementsForArgument } from '@shared/utilities/decisionMatrix';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { navigate, useUiStore } from '@/stores/uiStore';
import { ARGUMENT_STATUS, ELIGIBILITY, formatDate } from '@/lib/labels';
import { Button, Checkbox, Code, EmptyState, PageBody, PageHeader, SearchInput, Select, StatusPill, th, td } from '@/components/common/ui';
import { makeNewArgument } from '@/components/arguments/argumentOps';

export default function ArgumentsPage() {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const focusToken = useUiStore((s) => s.searchFocusToken);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ArgumentStatus | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const initialToken = useRef(focusToken);

  useEffect(() => {
    if (focusToken !== initialToken.current) searchRef.current?.focus();
  }, [focusToken]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return manifest.arguments
      .filter((a) => (showArchived ? true : !a.archived))
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => !q || `${a.code} ${a.title}`.toLowerCase().includes(q))
      .map((a) => {
        const result = computeMatrix(a, mandatoryRequirementsForArgument(manifest, a.id));
        const sel = result.alternatives.find((x) => x.isSelected);
        const completeCount = result.alternatives.filter((x) => x.complete).length;
        return { arg: a, sel, completeCount, total: result.alternatives.length };
      });
  }, [manifest, query, status, showArchived]);

  const create = () => {
    const created = makeNewArgument(
      manifest.arguments.map((a) => a.code),
      manifest.project.author,
      new Date().toISOString()
    );
    update((d) => void d.arguments.push(created));
    navigate({ view: 'argument', id: created.id });
  };

  const live = manifest.arguments.filter((a) => !a.archived).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Engineering arguments"
        subtitle="Structured records of why technical design decisions were made."
        actions={
          <Button variant="primary" icon={Plus} onClick={create}>
            New argument
          </Button>
        }
      />
      <PageBody>
        {manifest.arguments.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="No engineering arguments yet"
            message="An engineering argument is a structured record explaining why a specific technical design decision was made: the alternatives considered, how they were scored against weighted criteria, which mandatory constraints they must meet, and the final justification."
            action={
              <Button variant="primary" icon={Plus} onClick={create}>
                New argument
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput className="w-64" value={query} onChange={setQuery} placeholder="Search arguments…" inputRef={searchRef} />
              <Select aria-label="Filter by status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value as ArgumentStatus | 'all')}>
                <option value="all">All statuses</option>
                {(Object.keys(ARGUMENT_STATUS) as ArgumentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {ARGUMENT_STATUS[s].label}
                  </option>
                ))}
              </Select>
              <Checkbox checked={showArchived} onChange={setShowArchived} label="Show archived" />
              <span className="ml-auto font-mono text-2xs text-dim">
                {rows.length} of {live} shown
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gunmetal">
              <table className="w-full min-w-[900px] border-separate border-spacing-0" aria-label="Engineering arguments">
                <thead>
                  <tr>
                    <th className={th}>Code</th>
                    <th className={th}>Title</th>
                    <th className={th}>Status</th>
                    <th className={th}>Rev</th>
                    <th className={th}>Selected alternative</th>
                    <th className={th}>Eligibility</th>
                    <th className={th}>Matrix</th>
                    <th className={th}>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className={`${td} text-xs text-dim`} colSpan={8}>
                        No arguments match the current filters.
                      </td>
                    </tr>
                  ) : null}
                  {rows.map(({ arg, sel, completeCount, total }) => (
                    <tr
                      key={arg.id}
                      className="cursor-pointer bg-carbon hover:bg-matte"
                      onClick={() => navigate({ view: 'argument', id: arg.id })}
                    >
                      <td className={td}>
                        <Code className="text-crimson-hover">{arg.code}</Code>
                      </td>
                      <td className={td}>
                        <button
                          type="button"
                          className="text-left font-medium text-white hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({ view: 'argument', id: arg.id });
                          }}
                        >
                          {arg.title || 'Untitled argument'}
                        </button>
                        {arg.archived ? <span className="ml-2 text-2xs text-amber">(archived)</span> : null}
                      </td>
                      <td className={td}>
                        <StatusPill meta={ARGUMENT_STATUS[arg.status]} />
                      </td>
                      <td className={td}>
                        <Code>{arg.revision}</Code>
                      </td>
                      <td className={td}>
                        {sel ? (
                          <span className="text-white">
                            {sel.name} <span className="font-mono text-2xs text-silver">{formatScore(sel.weightedScore)}</span>
                          </span>
                        ) : (
                          <span className="text-dim">None selected</span>
                        )}
                      </td>
                      <td className={td}>{sel ? <StatusPill meta={ELIGIBILITY[sel.eligibility]} /> : <span className="text-dim">—</span>}</td>
                      <td className={td}>
                        <span className="font-mono text-xs text-silver">
                          {total === 0 ? 'No alternatives' : `${completeCount}/${total} scored`}
                        </span>
                      </td>
                      <td className={`${td} whitespace-nowrap text-xs text-silver`}>{formatDate(arg.modifiedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageBody>
    </div>
  );
}
