import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Copy, Download, FileSearch, History, Info, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import type { EngineeringArgument, EntityRef } from '@shared/schemas/project';
import { computeMatrix, mandatoryRequirementsForArgument } from '@shared/utilities/decisionMatrix';
import { decisionMatrixCsv } from '@shared/utilities/csv';
import { issueRevision, restoreRevision } from '@shared/utilities/revisions';
import { addLink, linkedRefs, removeLinksFor } from '@shared/utilities/traceability';
import { newId, nextCode } from '@shared/utilities/ids';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { confirmDialog, navigate, notify } from '@/stores/uiStore';
import { api } from '@/lib/api';
import { ARGUMENT_STATUS, CLASSIFICATION, formatDateTime } from '@/lib/labels';
import {
  Badge,
  Button,
  Callout,
  CollapsibleSection,
  Code,
  EmptyState,
  Field,
  Select,
  StatusPill,
  TextArea,
  TextInput
} from '@/components/common/ui';
import { EntityChip, LinkManager } from '@/components/traceability/LinkManager';
import { DecisionMatrix } from '@/components/arguments/DecisionMatrix';
import { ConstraintMatrix } from '@/components/arguments/ConstraintMatrix';
import { DecisionSummary } from '@/components/arguments/DecisionSummary';
import { SensitivityPanel } from '@/components/arguments/SensitivityPanel';
import { RevisionHistory, IssueRevisionModal } from '@/components/arguments/RevisionHistory';
import { AlternativesEditor } from '@/components/arguments/AlternativesEditor';
import { ListEditor } from '@/components/arguments/ListEditor';
import { ValidationSummary } from '@/components/arguments/ValidationSummary';
import { argumentIssues, type SectionId } from '@/components/arguments/validation';
import { duplicateArgument, type EditFn } from '@/components/arguments/argumentOps';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'problem', label: 'Problem & objective' },
  { id: 'requirements', label: 'Related requirements' },
  { id: 'alternatives', label: 'Alternatives' },
  { id: 'matrix', label: 'Decision matrix' },
  { id: 'constraints', label: 'Constraint evaluation' },
  { id: 'summary', label: 'Results & selection' },
  { id: 'sensitivity', label: 'Sensitivity analysis' },
  { id: 'assumptions', label: 'Key assumptions' },
  { id: 'calculations', label: 'Equations & calculations' },
  { id: 'evidence', label: 'Supporting evidence' },
  { id: 'justification', label: 'Final justification' },
  { id: 'risks', label: 'Risks & limitations' },
  { id: 'references', label: 'References' },
  { id: 'revisions', label: 'Revision history' }
];

const scrollToSection = (id: SectionId) => {
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function ArgumentPage({ id }: { id: string }) {
  const manifest = useManifest();
  const arg = manifest.arguments.find((a) => a.id === id);
  if (!arg) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileSearch}
          title="This engineering argument no longer exists"
          message="It may have been deleted. Return to the list to open another argument."
          action={
            <Button icon={ArrowLeft} onClick={() => navigate({ view: 'arguments' })}>
              Back to arguments
            </Button>
          }
        />
      </div>
    );
  }
  return <ArgumentEditor key={arg.id} arg={arg} />;
}

function ArgumentEditor({ arg }: { arg: EngineeringArgument }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const updateArgument = useProjectStore((s) => s.updateArgument);
  const argRef: EntityRef = useMemo(() => ({ type: 'argument', id: arg.id }), [arg.id]);
  const edit: EditFn = useCallback((recipe) => updateArgument(arg.id, recipe), [updateArgument, arg.id]);

  const mandatory = useMemo(() => mandatoryRequirementsForArgument(manifest, arg.id), [manifest, arg.id]);
  const result = useMemo(() => computeMatrix(arg, mandatory), [arg, mandatory]);
  const issues = useMemo(() => argumentIssues(arg, mandatory, result), [arg, mandatory, result]);
  const issueCount = (s: SectionId) => issues.filter((i) => i.section === s).length;
  const gapBadge = (s: SectionId): ReactNode => {
    const n = issueCount(s);
    return n > 0 ? (
      <Badge tone="amber" title="Documentation gaps in this section">
        {n} to resolve
      </Badge>
    ) : null;
  };

  // Approval guard notice: status went approved -> under-review without the user choosing it.
  const prevStatus = useRef(arg.status);
  const manualStatusChange = useRef(false);
  const [guardNotice, setGuardNotice] = useState(false);
  useEffect(() => {
    if (prevStatus.current === 'approved' && arg.status === 'under-review' && !manualStatusChange.current) setGuardNotice(true);
    if (arg.status !== 'under-review') setGuardNotice(false);
    manualStatusChange.current = false;
    prevStatus.current = arg.status;
  }, [arg.status]);

  const [issueOpen, setIssueOpen] = useState(false);

  const linkedReqs = linkedRefs(manifest, argRef, 'requirement')
    .map((r) => manifest.requirements.find((x) => x.id === r.id))
    .filter((r): r is NonNullable<typeof r> => !!r);
  const linkedCalcs = linkedRefs(manifest, argRef, 'calculation')
    .map((r) => manifest.calculations.find((x) => x.id === r.id))
    .filter((r): r is NonNullable<typeof r> => !!r);

  const exportCsv = async () => {
    try {
      const res = await api().export.csv(decisionMatrixCsv(arg, mandatory), `${arg.code}-decision-matrix.csv`);
      if (res.ok) notify({ tone: 'success', message: `Exported ${res.fileName}` });
      else if (!res.cancelled) notify({ tone: 'error', message: 'Export failed', detail: res.message });
    } catch (err) {
      notify({ tone: 'error', message: 'Export failed', detail: err instanceof Error ? err.message : String(err) });
    }
  };

  const duplicate = () => {
    const copy = duplicateArgument(arg, manifest.arguments.map((a) => a.code), new Date().toISOString());
    update((d) => {
      d.arguments.push(copy);
      // Keep the same relationships so mandatory constraints remain evaluable on the copy.
      const now = new Date().toISOString();
      let working = d as never as typeof manifest;
      for (const l of manifest.links) {
        const other = l.a.type === 'argument' && l.a.id === arg.id ? l.b : l.b.type === 'argument' && l.b.id === arg.id ? l.a : null;
        if (other) working = addLink(working, { type: 'argument', id: copy.id }, other, { id: newId(), now, note: l.note });
      }
      d.links = working.links as never;
    });
    notify({ tone: 'success', message: `Created ${copy.code}`, detail: 'Duplicated with new identifiers; revisions cleared and status set to Draft.' });
    navigate({ view: 'argument', id: copy.id });
  };

  const toggleArchive = () => {
    edit((d) => void (d.archived = !arg.archived));
    notify({ tone: 'info', message: arg.archived ? `${arg.code} restored` : `${arg.code} archived` });
  };

  const remove = async () => {
    const choice = await confirmDialog({
      title: `Delete ${arg.code}?`,
      message: `Permanently delete “${arg.title}” including its matrix, constraint evaluations and revision history, and remove its links to other records? This cannot be undone. Consider archiving instead.`,
      confirmLabel: 'Delete argument',
      danger: true
    });
    if (choice !== 'confirm') return;
    update((d) => {
      const next = removeLinksFor(d as never, argRef);
      d.links = next.links as never;
      d.arguments = d.arguments.filter((a) => a.id !== arg.id);
    });
    navigate({ view: 'arguments' });
  };

  const issueRev = (author: string, summary: string) => {
    const latest = useProjectStore.getState().manifest?.arguments.find((a) => a.id === arg.id) ?? arg;
    const next = issueRevision(latest, { author, summary, now: new Date().toISOString(), id: newId() });
    updateArgument(arg.id, (d) => void Object.assign(d, next));
    setIssueOpen(false);
    notify({ tone: 'success', message: `Revision ${latest.revision} recorded`, detail: `Now at ${next.revision}.` });
  };

  const restoreRev = (revisionId: string) => {
    const latest = useProjectStore.getState().manifest?.arguments.find((a) => a.id === arg.id) ?? arg;
    try {
      const next = restoreRevision(latest, revisionId, { author: latest.author, now: new Date().toISOString(), id: newId() });
      updateArgument(arg.id, (d) => void Object.assign(d, next));
      notify({ tone: 'success', message: 'Revision restored', detail: 'The previous state was recorded as a new revision. Status is Draft.' });
    } catch (err) {
      notify({ tone: 'error', message: 'Could not restore revision', detail: err instanceof Error ? err.message : String(err) });
    }
  };

  const newCalculation = () => {
    const calcId = newId();
    const now = new Date().toISOString();
    update((d) => {
      d.calculations.push({
        id: calcId,
        code: nextCode('CALC', d.calculations.map((c) => c.code)),
        title: `Calculation for ${arg.code}`,
        purpose: '',
        equation: '',
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
        author: manifest.project.author,
        archived: false,
        createdAt: now,
        modifiedAt: now
      });
      const next = addLink(d as never, argRef, { type: 'calculation', id: calcId }, { id: newId(), now });
      d.links = next.links as never;
    });
    navigate({ view: 'calculations', id: calcId });
  };

  const selected = arg.alternatives.find((a) => a.id === arg.selectedAlternativeId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="border-b border-gunmetal px-6 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Code className="text-crimson-hover">{arg.code}</Code>
            <TextInput
              aria-label="Argument title"
              className="max-w-xl text-base font-semibold"
              value={arg.title}
              onChange={(e) => edit((d) => void (d.title = e.target.value))}
            />
            {arg.archived ? <Badge tone="amber">Archived</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="primary" icon={History} onClick={() => setIssueOpen(true)}>
              Issue revision
            </Button>
            <Button size="sm" icon={Copy} onClick={duplicate}>
              Duplicate
            </Button>
            <Button size="sm" icon={Download} onClick={() => void exportCsv()}>
              Export matrix CSV
            </Button>
            <Button size="sm" icon={arg.archived ? ArchiveRestore : Archive} onClick={toggleArchive}>
              {arg.archived ? 'Restore' : 'Archive'}
            </Button>
            <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 items-end gap-x-4 gap-y-2 md:grid-cols-3 xl:grid-cols-6">
          <Field label="Documentation status" help="Approved is an internal documentation status only. It is NOT professional certification or safety approval.">
            {(fid) => (
              <Select
                id={fid}
                value={arg.status}
                title="Approved is an internal documentation status — NOT professional certification or safety approval."
                onChange={(e) => {
                  manualStatusChange.current = true;
                  const v = e.target.value as EngineeringArgument['status'];
                  edit((d) => void (d.status = v));
                }}
              >
                {(Object.keys(ARGUMENT_STATUS) as (keyof typeof ARGUMENT_STATUS)[]).map((s) => (
                  <option key={s} value={s}>
                    {ARGUMENT_STATUS[s].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-silver">Revision</span>
            <span className="flex h-8 items-center gap-2">
              <Code className="text-white">{arg.revision}</Code>
              <StatusPill meta={ARGUMENT_STATUS[arg.status]} />
            </span>
          </div>
          <Field label="Author">
            {(fid) => <TextInput id={fid} value={arg.author} onChange={(e) => edit((d) => void (d.author = e.target.value))} />}
          </Field>
          <Field label="Reviewer (optional)">
            {(fid) => <TextInput id={fid} value={arg.reviewer} onChange={(e) => edit((d) => void (d.reviewer = e.target.value))} />}
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-silver">Created</span>
            <span className="flex h-8 items-center font-mono text-2xs text-silver">{formatDateTime(arg.createdAt)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-silver">Modified</span>
            <span className="flex h-8 items-center font-mono text-2xs text-silver">{formatDateTime(arg.modifiedAt)}</span>
          </div>
        </div>
        <p className="mt-1 text-2xs text-dim">
          “Approved” is an internal documentation status — not professional certification or safety approval.
          {selected ? ` Selected: ${selected.name}.` : ''}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto flex max-w-[1400px] gap-6">
          <nav aria-label="Argument sections" className="sticky top-0 hidden w-44 shrink-0 self-start xl:block">
            <ul className="flex flex-col gap-0.5 border-l border-gunmetal">
              {SECTIONS.map((s) => {
                const n = issueCount(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollToSection(s.id)}
                      className="flex w-full items-center justify-between gap-2 py-1 pr-1 pl-3 text-left text-xs text-silver hover:text-white"
                    >
                      <span className="truncate">{s.label}</span>
                      {n > 0 ? (
                        <span className="font-mono text-2xs text-[#fcd34d]" aria-label={`${n} to resolve`}>
                          {n}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {guardNotice ? (
              <Callout tone="info" icon={Info} title="Returned to Under Review">
                This argument was Approved, but a material change (alternatives, matrix, constraints, selection or justification) was made, so it has returned to Under Review. Re-approval is required.
              </Callout>
            ) : null}
            <ValidationSummary issues={issues} onGo={scrollToSection} />

            <CollapsibleSection id="sec-problem" title="Problem statement & design objective" status={gapBadge('problem')}>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Field label="Problem statement" hint="What problem does this decision solve, and in what context?">
                  {(fid) => <TextArea id={fid} minRows={4} value={arg.problemStatement} onChange={(e) => edit((d) => void (d.problemStatement = e.target.value))} />}
                </Field>
                <Field label="Design objective" hint="What must the chosen design achieve?">
                  {(fid) => <TextArea id={fid} minRows={4} value={arg.objective} onChange={(e) => edit((d) => void (d.objective = e.target.value))} />}
                </Field>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="sec-requirements" title="Related requirements" status={gapBadge('requirements')}>
              <div className="flex flex-col gap-3">
                <p className="text-xs text-silver">Mandatory requirements linked here are evaluated as constraints for every alternative.</p>
                <LinkManager source={argRef} targetType="requirement" label="Linked requirements" emptyText="No requirements linked yet." />
                {linkedReqs.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {linkedReqs.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                        {r.classification === 'mandatory' ? <ShieldAlert size={13} className="text-crimson-hover" aria-label="Mandatory constraint" /> : null}
                        <Code className="text-crimson-hover">{r.code}</Code>
                        <span className="text-white">{r.title}</span>
                        <StatusPill meta={CLASSIFICATION[r.classification]} />
                        {r.archived ? <span className="text-2xs text-amber">(archived, not evaluated)</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="sec-alternatives" title="Alternatives" status={gapBadge('alternatives')}>
              <AlternativesEditor argument={arg} onEdit={edit} />
            </CollapsibleSection>

            <CollapsibleSection id="sec-matrix" title="Decision matrix" status={gapBadge('matrix')}>
              <DecisionMatrix argument={arg} mandatory={mandatory} onEdit={edit} />
            </CollapsibleSection>

            <CollapsibleSection id="sec-constraints" title="Mandatory constraint evaluation" status={gapBadge('constraints')}>
              <ConstraintMatrix argument={arg} mandatory={mandatory} onEdit={edit} onGoToRequirements={() => scrollToSection('requirements')} />
            </CollapsibleSection>

            <CollapsibleSection id="sec-summary" title="Results & selection summary" status={gapBadge('summary')}>
              <DecisionSummary argument={arg} mandatory={mandatory} onEdit={edit} />
            </CollapsibleSection>

            <CollapsibleSection id="sec-sensitivity" title="Sensitivity analysis" defaultOpen={false} description="Temporarily adjust weights to test the recommendation">
              <SensitivityPanel argument={arg} mandatory={mandatory} onEdit={edit} />
            </CollapsibleSection>

            <CollapsibleSection id="sec-assumptions" title="Key assumptions" status={gapBadge('assumptions')}>
              <ListEditor
                label="Assumption"
                items={arg.assumptions}
                onChange={(items) => edit((d) => void (d.assumptions = items))}
                addLabel="Add assumption"
                placeholder="State the assumption and why it is reasonable"
                emptyText="No assumptions recorded. List the conditions this decision relies on."
              />
            </CollapsibleSection>

            <CollapsibleSection
              id="sec-calculations"
              title="Equations & calculations"
              actions={
                <Button size="xs" variant="outline" icon={Plus} onClick={newCalculation}>
                  New calculation
                </Button>
              }
            >
              <div className="flex flex-col gap-3">
                <LinkManager source={argRef} targetType="calculation" label="Linked calculations" emptyText="No calculations linked yet." />
                {linkedCalcs.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {linkedCalcs.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <EntityChip entity={{ type: 'calculation', id: c.id }} />
                        <span className="font-mono text-silver">{c.resultValue ? `${c.resultValue} ${c.resultUnit}`.trim() : 'no result recorded'}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="sec-evidence" title="Supporting evidence">
              <div className="flex flex-col gap-3">
                <Field label="Evidence summary">
                  {(fid) => <TextArea id={fid} minRows={3} value={arg.evidenceSummary} onChange={(e) => edit((d) => void (d.evidenceSummary = e.target.value))} />}
                </Field>
                <LinkManager source={argRef} targetType="evidence" label="Verification evidence" emptyText="No evidence linked yet." />
                <LinkManager source={argRef} targetType="asset" label="Drawings and models" emptyText="No drawings or models linked yet." />
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="sec-justification" title="Final engineering justification" status={gapBadge('justification')}>
              <div className="flex flex-col gap-2">
                {selected && arg.justification.trim() === '' ? (
                  <Callout tone="amber">An alternative is selected but the final justification is empty. Explain why it is the right choice.</Callout>
                ) : null}
                <Field label="Justification">
                  {(fid) => <TextArea id={fid} minRows={4} value={arg.justification} onChange={(e) => edit((d) => void (d.justification = e.target.value))} />}
                </Field>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="sec-risks" title="Risks & limitations">
              <div className="flex flex-col gap-3">
                <Field label="Risks and limitations">
                  {(fid) => <TextArea id={fid} minRows={3} value={arg.risksAndLimitations} onChange={(e) => edit((d) => void (d.risksAndLimitations = e.target.value))} />}
                </Field>
                <LinkManager source={argRef} targetType="risk" label="Linked risks" emptyText="No risks linked yet." />
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="sec-references" title="References">
              <ListEditor
                label="Reference"
                items={arg.references}
                onChange={(items) => edit((d) => void (d.references = items))}
                addLabel="Add reference"
                placeholder="Standard, report, datasheet or other source"
                emptyText="No references recorded."
              />
            </CollapsibleSection>

            <CollapsibleSection id="sec-revisions" title="Revision history" defaultOpen={false} description={`${arg.revisions.length} issued`}>
              <RevisionHistory argument={arg} onRequestIssue={() => setIssueOpen(true)} onRestore={restoreRev} />
            </CollapsibleSection>
          </div>
        </div>
      </div>

      <IssueRevisionModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        defaultAuthor={arg.author}
        currentCode={arg.revision}
        onIssue={issueRev}
      />
    </div>
  );
}
