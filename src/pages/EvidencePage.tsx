import { useMemo, useRef, useState } from 'react';
import { BadgeCheck, Info, MousePointerClick, Plus, Trash2, TriangleAlert } from 'lucide-react';
import type { EntityRef, Evidence, EvidenceOutcome, VerificationMethod } from '@shared/schemas/project';
import { newId, nextCode } from '@shared/utilities/ids';
import { linkedRefs, removeLinksFor } from '@shared/utilities/traceability';
import { EVIDENCE_OUTCOME, VERIFICATION_METHOD, formatDate } from '@/lib/labels';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { confirmDialog, navigate } from '@/stores/uiStore';
import { Button, Callout, Code, EmptyState, Field, PageHeader, Panel, SearchInput, Select, StatusPill, TextArea, TextInput, cx } from '@/components/common/ui';
import { LinkManager } from '@/components/traceability/LinkManager';
import { MasterDetail, useScrollSelectedIntoView, useSearchFocus } from '@/components/requirements/MasterDetail';

export default function EvidencePage({ selectedId }: { selectedId?: string }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const searchRef = useSearchFocus();
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');

  const selected = selectedId ? manifest.evidence.find((e) => e.id === selectedId) : undefined;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return manifest.evidence.filter((e) => !q || `${e.code} ${e.title} ${e.summary}`.toLowerCase().includes(q));
  }, [manifest.evidence, query]);
  useScrollSelectedIntoView(selectedId, listRef);

  const create = () => {
    const id = newId();
    const now = new Date().toISOString();
    update((d) => {
      d.evidence.push({
        id,
        code: nextCode('VER', d.evidence.map((e) => e.code)),
        title: 'New evidence record',
        method: 'document-review',
        summary: '',
        outcome: 'inconclusive',
        recordedBy: manifest.project.author,
        date: now.slice(0, 10),
        createdAt: now,
        modifiedAt: now
      });
    });
    setQuery('');
    navigate({ view: 'evidence', id });
  };

  const list = (
    <>
      <div className="border-b border-gunmetal p-3">
        <SearchInput inputRef={searchRef} value={query} onChange={setQuery} placeholder="Search code, title or summary" />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Evidence list">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BadgeCheck}
              title={manifest.evidence.length === 0 ? 'No evidence recorded yet' : 'No evidence matches'}
              message={manifest.evidence.length === 0 ? 'Record reviews, tests and analyses, then link them to the requirements they relate to.' : 'Clear the search.'}
              action={
                manifest.evidence.length === 0 ? (
                  <Button variant="primary" icon={Plus} onClick={create}>
                    New evidence record
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          rows.map((e) => {
            const reqCount = linkedRefs(manifest, { type: 'evidence', id: e.id }, 'requirement').length;
            const sel = e.id === selectedId;
            return (
              <button
                key={e.id}
                type="button"
                data-row-id={e.id}
                aria-current={sel ? 'true' : undefined}
                onClick={() => navigate({ view: 'evidence', id: e.id })}
                className={cx(
                  'flex w-full flex-col gap-1 border-b border-l-2 border-b-gunmetal px-3 py-2 text-left hover:bg-matte',
                  sel ? 'border-l-crimson bg-matte' : 'border-l-transparent'
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Code className="shrink-0 text-crimson-hover">{e.code}</Code>
                  <span className="truncate text-[13px] text-white">{e.title || '(untitled)'}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusPill meta={EVIDENCE_OUTCOME[e.outcome]} />
                  <span className="text-2xs text-silver">{VERIFICATION_METHOD[e.method]}</span>
                  <span className="font-mono text-2xs text-dim">{e.date ? formatDate(e.date) : 'No date'}</span>
                  <span className="font-mono text-2xs text-dim">{reqCount} req</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  const detail = selected ? (
    <EvidenceEditor key={selected.id} id={selected.id} />
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={MousePointerClick}
        title={selectedId ? 'Evidence record not found' : 'No evidence record selected'}
        message={selectedId ? 'The selected record no longer exists.' : 'Select a record from the list, or create a new one.'}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Verification evidence"
        subtitle={<span className="font-mono">{manifest.evidence.length} record{manifest.evidence.length === 1 ? '' : 's'}</span>}
        actions={
          <Button variant="primary" icon={Plus} onClick={create}>
            New evidence record
          </Button>
        }
      />
      <div className="border-b border-gunmetal px-6 py-2">
        <Callout tone="info" icon={Info}>
          Evidence records document how a requirement was checked (e.g. document review, test). Linking evidence does not certify a requirement.
        </Callout>
      </div>
      <MasterDetail list={list} detail={detail} />
    </div>
  );
}

function EvidenceEditor({ id }: { id: string }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const ev = manifest.evidence.find((e) => e.id === id);
  const source: EntityRef = useMemo(() => ({ type: 'evidence', id }), [id]);

  if (!ev) {
    return (
      <div className="p-6">
        <Callout tone="amber" icon={TriangleAlert} title="Evidence record not found">
          This record no longer exists.
        </Callout>
      </div>
    );
  }

  const set = (patch: Partial<Evidence>) =>
    update((d) => {
      const e = d.evidence.find((x) => x.id === id);
      if (!e) return;
      Object.assign(e, patch);
      e.modifiedAt = new Date().toISOString();
    });

  const remove = async () => {
    const choice = await confirmDialog({
      title: `Delete ${ev.code}?`,
      message: 'This permanently deletes the evidence record and removes its links to requirements, files and calculations. Requirements that relied on it may then show missing evidence.',
      confirmLabel: 'Delete evidence',
      danger: true
    });
    if (choice !== 'confirm') return;
    update((d) => {
      d.evidence = d.evidence.filter((e) => e.id !== id);
      d.links = removeLinksFor(d as never, source).links as never;
    });
    navigate({ view: 'evidence' });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Code className="text-sm text-crimson-hover">{ev.code}</Code>
          <StatusPill meta={EVIDENCE_OUTCOME[ev.outcome]} />
        </div>
        <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove()}>
          Delete
        </Button>
      </div>

      <Panel title="Record" bodyClassName="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Title" required className="md:col-span-2">
          {(fid) => <TextInput id={fid} value={ev.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} />}
        </Field>
        <Field label="Method">
          {(fid) => (
            <Select id={fid} value={ev.method} onChange={(e) => set({ method: e.target.value as VerificationMethod })}>
              {(Object.keys(VERIFICATION_METHOD) as VerificationMethod[]).map((m) => (
                <option key={m} value={m}>
                  {VERIFICATION_METHOD[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Outcome">
          {(fid) => (
            <Select id={fid} value={ev.outcome} onChange={(e) => set({ outcome: e.target.value as EvidenceOutcome })}>
              {(Object.keys(EVIDENCE_OUTCOME) as EvidenceOutcome[]).map((o) => (
                <option key={o} value={o}>
                  {EVIDENCE_OUTCOME[o].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Recorded by">
          {(fid) => <TextInput id={fid} value={ev.recordedBy} maxLength={300} onChange={(e) => set({ recordedBy: e.target.value })} />}
        </Field>
        <Field label="Date">
          {(fid) => <TextInput id={fid} type="date" mono value={ev.date.slice(0, 10)} onChange={(e) => set({ date: e.target.value })} />}
        </Field>
        <Field label="Summary" className="md:col-span-2" hint="What was checked, how, and what was found.">
          {(fid, d) => <TextArea id={fid} aria-describedby={d} minRows={4} value={ev.summary} onChange={(e) => set({ summary: e.target.value })} />}
        </Field>
      </Panel>

      <Panel title="Traceability" bodyClassName="flex flex-col gap-4">
        <LinkManager source={source} targetType="requirement" />
        <LinkManager source={source} targetType="asset" />
        <LinkManager source={source} targetType="calculation" />
      </Panel>
    </div>
  );
}
