import { useMemo, useRef, useState } from 'react';
import { Download, Link2, ListChecks, MousePointerClick, Plus, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { Requirement, RequirementClassification, RequirementSection, RequirementStatus } from '@shared/schemas/project';
import { newId, nextCode } from '@shared/utilities/ids';
import { requirementsCsv } from '@shared/utilities/csv';
import { linkedRefs, resolveRef } from '@shared/utilities/traceability';
import { api } from '@/lib/api';
import { CLASSIFICATION, PRIORITY, REQUIREMENT_STATUS } from '@/lib/labels';
import { getTemplate } from '@/templates/templates';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { navigate, notify } from '@/stores/uiStore';
import { Badge, Button, Checkbox, Code, DynamicIcon, EmptyState, PageHeader, Select, SearchInput, StatusPill, cx } from '@/components/common/ui';
import { MasterDetail, useScrollSelectedIntoView, useSearchFocus } from '@/components/requirements/MasterDetail';
import { RequirementEditor } from '@/components/requirements/RequirementEditor';

export default function RequirementsPage({ section, selectedId }: { section?: RequirementSection; selectedId?: string }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const searchRef = useSearchFocus();
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'' | RequirementStatus>('');
  const [classification, setClassification] = useState<'' | RequirementClassification>('');
  const [showArchived, setShowArchived] = useState(false);

  const template = getTemplate(manifest.project.templateId);
  const categories = useMemo(() => {
    const set = new Set<string>(template?.requirementCategories ?? []);
    for (const r of manifest.requirements) if (r.category.trim()) set.add(r.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'en-CA'));
  }, [manifest.requirements, template]);

  const inSection = useMemo(() => manifest.requirements.filter((r) => !section || r.section === section), [manifest.requirements, section]);
  const selected = selectedId ? manifest.requirements.find((r) => r.id === selectedId) : undefined;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inSection.filter((r) => {
      // Always keep the selected record visible so the editor and list agree.
      if (r.archived && !showArchived && r.id !== selectedId) return false;
      if (category && r.category !== category) return false;
      if (status && r.status !== status) return false;
      if (classification && r.classification !== classification) return false;
      if (q && !`${r.code} ${r.title} ${r.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inSection, query, category, status, classification, showArchived, selectedId]);

  useScrollSelectedIntoView(selectedId, listRef);

  const sectionTitle = section ? manifest.project.sectionLabels[section] : 'All requirements';
  const active = inSection.filter((r) => !r.archived);
  const mandatoryCount = active.filter((r) => r.classification === 'mandatory').length;
  const verifiedCount = active.filter((r) => r.status === 'verified').length;

  const select = (id: string) => navigate({ view: 'requirements', section, id });

  const create = () => {
    const id = newId();
    const now = new Date().toISOString();
    const sec: RequirementSection = section ?? 'criteria';
    update((d) => {
      d.requirements.push({
        id,
        code: nextCode('REQ', d.requirements.map((r) => r.code)),
        title: 'New requirement',
        description: '',
        section: sec,
        category: '',
        priority: 'medium',
        classification: 'objective',
        acceptanceCriterion: '',
        targetValue: '',
        unit: '',
        source: '',
        verificationMethod: 'document-review',
        status: 'not-started',
        verificationNotes: '',
        notes: '',
        notApplicableLinks: { argument: '', calculation: '', asset: '' },
        archived: false,
        createdAt: now,
        modifiedAt: now
      });
    });
    setQuery('');
    navigate({ view: 'requirements', section, id });
  };

  const exportCsv = async () => {
    try {
      const res = await api().export.csv(requirementsCsv(manifest), `${manifest.project.identifier}-requirements.csv`);
      if (res.ok) {
        notify({
          tone: 'success',
          message: `Exported ${res.fileName}`,
          actions: [{ label: 'Reveal', run: () => void api().export.reveal(res.filePath) }]
        });
      } else if (!res.cancelled) {
        notify({ tone: 'error', message: 'Could not export the CSV file.', detail: res.message });
      }
    } catch (err) {
      notify({ tone: 'error', message: 'Could not export the CSV file.', detail: err instanceof Error ? err.message : String(err) });
    }
  };

  const list = (
    <>
      <div className="flex flex-col gap-2 border-b border-gunmetal p-3">
        <SearchInput inputRef={searchRef} value={query} onChange={setQuery} placeholder="Search code, title or description" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as '' | RequirementStatus)}>
            <option value="">All statuses</option>
            {(Object.keys(REQUIREMENT_STATUS) as RequirementStatus[]).map((s) => (
              <option key={s} value={s}>
                {REQUIREMENT_STATUS[s].label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by classification" value={classification} onChange={(e) => setClassification(e.target.value as '' | RequirementClassification)}>
            <option value="">All classifications</option>
            {(Object.keys(CLASSIFICATION) as RequirementClassification[]).map((c) => (
              <option key={c} value={c}>
                {CLASSIFICATION[c].label}
              </option>
            ))}
          </Select>
        </div>
        <Checkbox checked={showArchived} onChange={setShowArchived} label="Show archived" />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Requirements list">
        {rows.length === 0 ? (
          <div className="p-4">
            {inSection.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title={section ? `No requirements in ${sectionTitle} yet` : 'No requirements yet'}
                message="Requirements capture what the design must achieve. Start with the criteria, constraints and site conditions that drive your decisions."
                action={
                  <Button variant="primary" icon={Plus} onClick={create}>
                    New requirement
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={ListChecks} title="No requirements match the filters" message="Clear the search or filters, or enable Show archived." />
            )}
          </div>
        ) : (
          rows.map((r) => <RequirementRow key={r.id} req={r} selected={r.id === selectedId} onSelect={() => select(r.id)} />)
        )}
      </div>
    </>
  );

  const detail = selected ? (
    <RequirementEditor key={selected.id} id={selected.id} categories={categories} />
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={MousePointerClick}
        title={selectedId ? 'Requirement not found' : 'No requirement selected'}
        message={selectedId ? 'The selected requirement no longer exists.' : 'Select a requirement from the list to edit it, or create a new one.'}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={sectionTitle}
        subtitle={
          <span className="font-mono">
            {active.length} active · {mandatoryCount} mandatory · {verifiedCount} marked verified (user-recorded)
            {inSection.length !== active.length ? ` · ${inSection.length - active.length} archived` : ''}
          </span>
        }
        actions={
          <>
            <Button icon={Download} onClick={() => void exportCsv()}>
              Export CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={create}>
              New requirement
            </Button>
          </>
        }
      />
      <MasterDetail list={list} detail={detail} />
    </div>
  );
}

function RequirementRow({ req, selected, onSelect }: { req: Requirement; selected: boolean; onSelect: () => void }) {
  const manifest = useManifest();
  const refs = linkedRefs(manifest, { type: 'requirement', id: req.id });
  const hasEvidence = refs.some((r) => r.type === 'evidence' && resolveRef(manifest, r).exists);
  const noEvidence = req.status !== 'not-applicable' && !hasEvidence && req.verificationNotes.trim() === '';
  const cls = CLASSIFICATION[req.classification];
  const mandatory = req.classification === 'mandatory';
  return (
    <button
      type="button"
      data-row-id={req.id}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cx(
        'flex w-full flex-col gap-1 border-b border-l-2 border-b-gunmetal px-3 py-2 text-left hover:bg-matte',
        selected ? 'border-l-crimson bg-matte' : 'border-l-transparent',
        req.archived && 'opacity-60'
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Code className="shrink-0 text-crimson-hover">{req.code}</Code>
        {mandatory ? <ShieldAlert size={13} className="shrink-0 text-crimson-hover" aria-label="Mandatory constraint" /> : null}
        <span className="truncate text-[13px] text-white">{req.title || '(untitled)'}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={cls.tone} className={mandatory ? 'font-semibold' : undefined} title={cls.description}>
          <DynamicIcon name={cls.icon} size={11} />
          {cls.label}
        </Badge>
        <Badge tone={PRIORITY[req.priority].tone} title="Priority">
          <DynamicIcon name={PRIORITY[req.priority].icon} size={11} />
          {PRIORITY[req.priority].label}
        </Badge>
        <StatusPill meta={REQUIREMENT_STATUS[req.status]} />
        <span className="inline-flex items-center gap-0.5 font-mono text-2xs text-dim" title={`${refs.length} trace link${refs.length === 1 ? '' : 's'}`}>
          <Link2 size={11} aria-hidden="true" />
          {refs.length}
        </span>
        {noEvidence ? (
          <Badge tone="amber" title="No linked evidence or verification notes">
            <TriangleAlert size={11} aria-hidden="true" />
            No evidence
          </Badge>
        ) : null}
        {req.archived ? <Badge>Archived</Badge> : null}
      </span>
    </button>
  );
}
