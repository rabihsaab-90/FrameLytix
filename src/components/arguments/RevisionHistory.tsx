/** Revision history list, issue-revision dialog and revision viewer (before/after diff). */
import { useState } from 'react';
import { Eye, History, RotateCcw } from 'lucide-react';
import type { EngineeringArgument, Revision } from '@shared/schemas/project';
import { diffArguments } from '@shared/utilities/revisions';
import { Button, Callout, Code, Field, StatusPill, TextInput, TextArea, th, td } from '@/components/common/ui';
import { Modal } from '@/components/common/Modal';
import { ARGUMENT_STATUS, formatDateTime } from '@/lib/labels';
import { confirmDialog } from '@/stores/uiStore';

export function IssueRevisionModal({
  open,
  onClose,
  defaultAuthor,
  currentCode,
  onIssue
}: {
  open: boolean;
  onClose: () => void;
  defaultAuthor: string;
  currentCode: string;
  onIssue: (author: string, summary: string) => void;
}) {
  const [author, setAuthor] = useState(defaultAuthor);
  const [summary, setSummary] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = author.trim() !== '' && summary.trim() !== '';
  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onIssue(author.trim(), summary.trim());
    setSummary('');
    setTouched(false);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Issue revision"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Issue revision
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs">
          Records the current state as <Code>{currentCode}</Code> and moves the argument to the next revision code. Autosave never creates revisions.
        </p>
        <Field label="Author" required error={touched && author.trim() === '' ? 'Author is required.' : null}>
          {(id, d) => <TextInput id={id} aria-describedby={d} data-autofocus value={author} onChange={(e) => setAuthor(e.target.value)} />}
        </Field>
        <Field label="Summary of changes" required error={touched && summary.trim() === '' ? 'A summary of changes is required.' : null}>
          {(id, d) => <TextArea id={id} aria-describedby={d} minRows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function RevisionViewer({ revision, argument, onClose }: { revision: Revision | null; argument: EngineeringArgument; onClose: () => void }) {
  if (!revision) return null;
  const snap = revision.snapshot;
  const diff = diffArguments(snap, argument);
  const selectedName = snap.alternatives.find((a) => a.id === snap.selectedAlternativeId)?.name ?? '(none)';
  return (
    <Modal open onClose={onClose} title={`Revision ${revision.code}`} width="xl" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-dim">Issued</dt>
          <dd className="text-white">{formatDateTime(revision.timestamp)}</dd>
          <dt className="text-dim">Author</dt>
          <dd className="text-white">{revision.author || '—'}</dd>
          <dt className="text-dim">Summary</dt>
          <dd className="whitespace-pre-line text-white">{revision.summary || '—'}</dd>
          <dt className="text-dim">Title</dt>
          <dd className="text-white">{snap.title}</dd>
          <dt className="text-dim">Status then</dt>
          <dd>
            <StatusPill meta={ARGUMENT_STATUS[snap.status]} />
          </dd>
          <dt className="text-dim">Selected alternative</dt>
          <dd className="text-white">{selectedName}</dd>
          <dt className="text-dim">Alternatives / criteria</dt>
          <dd className="text-white">
            {snap.alternatives.length} / {snap.matrix.criteria.length}
          </dd>
        </dl>
        <h3 className="text-xs font-semibold text-white">Changes since this revision (before → now)</h3>
        {diff.length === 0 ? (
          <p className="text-xs text-dim">No material differences from the current state.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-gunmetal">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>Field</th>
                  <th className={th}>Before ({revision.code})</th>
                  <th className={th}>After (current)</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((d) => (
                  <tr key={d.field}>
                    <td className={`${td} whitespace-nowrap text-white`}>{d.label}</td>
                    <td className={`${td} whitespace-pre-line text-silver`}>{d.before}</td>
                    <td className={`${td} whitespace-pre-line text-white`}>{d.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function RevisionHistory({
  argument,
  onRequestIssue,
  onRestore
}: {
  argument: EngineeringArgument;
  onRequestIssue: () => void;
  onRestore: (revisionId: string) => void;
}) {
  const [viewing, setViewing] = useState<Revision | null>(null);
  const revisions = [...argument.revisions].reverse();

  const restore = async (rev: Revision) => {
    const choice = await confirmDialog({
      title: `Restore ${rev.code}?`,
      message: `The current state will be recorded as a new revision first; history is preserved. The restored content is set to Draft.`,
      confirmLabel: 'Restore',
      danger: true
    });
    if (choice === 'confirm') onRestore(rev.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-silver">
          Current revision <Code className="text-white">{argument.revision}</Code> · {argument.revisions.length} issued
        </p>
        <Button size="sm" icon={History} onClick={onRequestIssue}>
          Issue revision
        </Button>
      </div>
      {revisions.length === 0 ? (
        <p className="text-xs text-dim">No revisions have been issued yet.</p>
      ) : (
        <ul className="divide-y divide-gunmetal rounded-md border border-gunmetal">
          {revisions.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 px-3 py-2">
              <Code className="w-16 shrink-0 text-white">{r.code}</Code>
              <span className="w-40 shrink-0 font-mono text-2xs text-dim">{formatDateTime(r.timestamp)}</span>
              <span className="w-28 shrink-0 text-xs text-silver">{r.author || '—'}</span>
              <span className="min-w-[200px] flex-1 text-xs text-white">{r.summary || '—'}</span>
              <span className="flex gap-1">
                <Button size="xs" variant="ghost" icon={Eye} aria-label={`View revision ${r.code}`} onClick={() => setViewing(r)}>
                  View
                </Button>
                <Button size="xs" variant="ghost" icon={RotateCcw} aria-label={`Restore revision ${r.code}`} onClick={() => void restore(r)}>
                  Restore
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Callout tone="neutral">Revision history is a documentation aid and is not tamper-proof document control.</Callout>
      <RevisionViewer revision={viewing} argument={argument} onClose={() => setViewing(null)} />
    </div>
  );
}
