import { useId, useMemo } from 'react';
import { Archive, ArchiveRestore, Copy, ShieldAlert, Trash2, TriangleAlert, Info } from 'lucide-react';
import type {
  EntityRef,
  Priority,
  Requirement,
  RequirementClassification,
  RequirementSection,
  RequirementStatus,
  VerificationMethod
} from '@shared/schemas/project';
import { newId, nextCode } from '@shared/utilities/ids';
import { linkedRefs, removeLinksFor, resolveRef } from '@shared/utilities/traceability';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { confirmDialog, navigate } from '@/stores/uiStore';
import { CLASSIFICATION, PRIORITY, REQUIREMENT_STATUS, VERIFICATION_METHOD } from '@/lib/labels';
import { Badge, Button, Callout, Code, Field, Panel, Select, StatusPill, TextArea, TextInput, DynamicIcon } from '@/components/common/ui';
import { LinkManager } from '@/components/traceability/LinkManager';

const SECTIONS: RequirementSection[] = ['criteria', 'constraints', 'environment'];

export function RequirementEditor({ id, categories }: { id: string; categories: string[] }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const listId = useId();
  const req = manifest.requirements.find((r) => r.id === id);
  const source: EntityRef = useMemo(() => ({ type: 'requirement', id }), [id]);

  if (!req) {
    return (
      <div className="p-6">
        <Callout tone="amber" icon={TriangleAlert} title="Requirement not found">
          This requirement no longer exists. Select another one from the list.
        </Callout>
      </div>
    );
  }

  const set = (patch: Partial<Requirement>) =>
    update((d) => {
      const r = d.requirements.find((x) => x.id === id);
      if (!r) return;
      Object.assign(r, patch);
      r.modifiedAt = new Date().toISOString();
    });
  const setNa = (key: 'argument' | 'calculation' | 'asset', value: string) =>
    update((d) => {
      const r = d.requirements.find((x) => x.id === id);
      if (!r) return;
      r.notApplicableLinks[key] = value;
      r.modifiedAt = new Date().toISOString();
    });

  const liveEvidence = linkedRefs(manifest, source, 'evidence').filter((r) => resolveRef(manifest, r).exists);
  const verifiedWithoutEvidence = req.status === 'verified' && req.verificationNotes.trim() === '' && liveEvidence.length === 0;
  const cls = CLASSIFICATION[req.classification];

  const duplicate = () => {
    const now = new Date().toISOString();
    const copyId = newId();
    update((d) => {
      const code = nextCode('REQ', d.requirements.map((r) => r.code));
      d.requirements.push({
        ...JSON.parse(JSON.stringify(req)),
        id: copyId,
        code,
        title: `${req.title} (copy)`,
        // A copy never inherits verification: that must be recorded again for the new record.
        status: 'not-started',
        verificationNotes: '',
        archived: false,
        createdAt: now,
        modifiedAt: now
      });
    });
    navigate({ view: 'requirements', section: req.section, id: copyId });
  };

  const toggleArchive = () => set({ archived: !req.archived });

  const remove = async () => {
    const linkCount = manifest.links.filter((l) => (l.a.id === id && l.a.type === 'requirement') || (l.b.id === id && l.b.type === 'requirement')).length;
    const evalCount = manifest.arguments.reduce((n, a) => n + a.constraintEvaluations.filter((e) => e.requirementId === id).length, 0);
    const choice = await confirmDialog({
      title: `Delete ${req.code}?`,
      message: `This permanently deletes the requirement. Its ${linkCount} trace link${linkCount === 1 ? '' : 's'} will also be removed${
        evalCount > 0 ? `, along with ${evalCount} constraint evaluation${evalCount === 1 ? '' : 's'} in engineering arguments` : ''
      }. Linked records themselves are kept. Consider archiving instead if you may need it later.`,
      confirmLabel: 'Delete requirement',
      danger: true
    });
    if (choice !== 'confirm') return;
    update((d) => {
      d.requirements = d.requirements.filter((r) => r.id !== id);
      d.links = removeLinksFor(d as never, source).links as never;
      for (const a of d.arguments) a.constraintEvaluations = a.constraintEvaluations.filter((e) => e.requirementId !== id);
    });
    navigate({ view: 'requirements', section: req.section });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Code className="text-sm text-crimson-hover">{req.code}</Code>
          <StatusPill meta={REQUIREMENT_STATUS[req.status]} />
          {req.archived ? <Badge tone="amber">Archived</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" icon={Copy} onClick={duplicate}>
            Duplicate
          </Button>
          <Button size="sm" icon={req.archived ? ArchiveRestore : Archive} onClick={toggleArchive}>
            {req.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </div>

      {verifiedWithoutEvidence ? (
        <Callout tone="crimson" icon={TriangleAlert} title="Marked Verified but verification evidence is missing">
          Record how this was verified in the verification notes below, or link a verification evidence record.
        </Callout>
      ) : null}

      <Panel title="Definition" bodyClassName="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Title" required className="md:col-span-2">
          {(fid, d) => <TextInput id={fid} aria-describedby={d} value={req.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} />}
        </Field>
        <Field label="Description" className="md:col-span-2">
          {(fid, d) => <TextArea id={fid} aria-describedby={d} value={req.description} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <Field label="Section">
          {(fid) => (
            <Select id={fid} value={req.section} onChange={(e) => set({ section: e.target.value as RequirementSection })}>
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {manifest.project.sectionLabels[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Category">
          {(fid) => (
            <>
              <TextInput id={fid} list={listId} value={req.category} maxLength={300} onChange={(e) => set({ category: e.target.value })} placeholder="Choose or type a category" />
              <datalist id={listId}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Classification" className="md:col-span-2" hint={cls.description}>
          {(fid, d) => (
            <div className="flex flex-col gap-1.5">
              <Select id={fid} aria-describedby={d} value={req.classification} onChange={(e) => set({ classification: e.target.value as RequirementClassification })}>
                {(Object.keys(CLASSIFICATION) as RequirementClassification[]).map((c) => (
                  <option key={c} value={c}>
                    {CLASSIFICATION[c].label}
                  </option>
                ))}
              </Select>
              {req.classification === 'mandatory' ? (
                <p className="flex items-center gap-1.5 text-2xs text-[#fca5a5]">
                  <ShieldAlert size={12} aria-hidden="true" /> Mandatory constraints make failing alternatives ineligible in decision matrices.
                </p>
              ) : null}
            </div>
          )}
        </Field>
        <Field label="Priority">
          {(fid) => (
            <Select id={fid} value={req.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Source / reference">
          {(fid) => <TextInput id={fid} value={req.source} maxLength={300} onChange={(e) => set({ source: e.target.value })} placeholder="Client brief, standard, stakeholder…" />}
        </Field>
      </Panel>

      <Panel title="Acceptance" bodyClassName="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Acceptance criterion" className="md:col-span-2">
          {(fid) => <TextArea id={fid} minRows={2} value={req.acceptanceCriterion} onChange={(e) => set({ acceptanceCriterion: e.target.value })} />}
        </Field>
        <Field label="Target value">
          {(fid) => <TextInput id={fid} mono value={req.targetValue} maxLength={300} onChange={(e) => set({ targetValue: e.target.value })} />}
        </Field>
        <Field label="Unit">
          {(fid) => <TextInput id={fid} mono value={req.unit} maxLength={40} onChange={(e) => set({ unit: e.target.value })} />}
        </Field>
      </Panel>

      <Panel title="Verification" bodyClassName="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Callout tone="info" icon={Info}>
            FrameLytix never verifies requirements automatically; Verified reflects information you record.
          </Callout>
        </div>
        <Field label="Verification method">
          {(fid) => (
            <Select id={fid} value={req.verificationMethod} onChange={(e) => set({ verificationMethod: e.target.value as VerificationMethod })}>
              {(Object.keys(VERIFICATION_METHOD) as VerificationMethod[]).map((m) => (
                <option key={m} value={m}>
                  {VERIFICATION_METHOD[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status">
          {(fid) => (
            <Select id={fid} value={req.status} onChange={(e) => set({ status: e.target.value as RequirementStatus })}>
              {(Object.keys(REQUIREMENT_STATUS) as RequirementStatus[]).map((s) => (
                <option key={s} value={s}>
                  {REQUIREMENT_STATUS[s].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Verification notes" className="md:col-span-2" hint="How was this verified? Required before marking Verified.">
          {(fid, d) => <TextArea id={fid} aria-describedby={d} value={req.verificationNotes} onChange={(e) => set({ verificationNotes: e.target.value })} />}
        </Field>
        <Field label="Notes" className="md:col-span-2">
          {(fid) => <TextArea id={fid} value={req.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </Panel>

      <Panel title="Traceability" bodyClassName="flex flex-col gap-4">
        {(['argument', 'calculation', 'asset'] as const).map((t) => (
          <div key={t} className="flex flex-col gap-2">
            <LinkManager source={source} targetType={t} />
            <Field label={`Not applicable — justification (${t === 'asset' ? 'drawings / assets' : t === 'argument' ? 'engineering arguments' : 'calculations'})`} hint="Fill in only if no link of this type applies.">
              {(fid, d) => (
                <TextInput id={fid} aria-describedby={d} value={req.notApplicableLinks[t]} maxLength={300} onChange={(e) => setNa(t, e.target.value)} />
              )}
            </Field>
          </div>
        ))}
        <LinkManager source={source} targetType="evidence" />
        <LinkManager source={source} targetType="risk" />
      </Panel>

      <p className="flex items-center gap-1.5 pb-4 text-2xs text-dim">
        <DynamicIcon name={cls.icon} size={11} /> {cls.label} · Created {new Date(req.createdAt).toLocaleDateString('en-CA')}
      </p>
    </div>
  );
}
