/**
 * Import workflow host. Watches importStore.request, asks the main process for an import plan
 * (native picker or dropped files), lets the user decide how to handle collisions, then commits.
 * Files are COPIED into the project; originals are never modified and nothing is executed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileCheck2, FilePlus2, FileX2, FolderOpen, ShieldAlert } from 'lucide-react';
import type { ImportDecision, ImportPlan, ImportPlanItem } from '@shared/types/ipc';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/labels';
import { useImportStore } from '@/stores/importStore';
import { useProjectStore } from '@/stores/projectStore';
import { notify } from '@/stores/uiStore';
import { Modal } from '@/components/common/Modal';
import { Badge, Button, Callout, Checkbox, Code, Spinner, cx } from '@/components/common/ui';
import { upsertAssetForFile } from './assetRecords';

type Choice = ImportDecision;

function statusOf(item: ImportPlanItem): 'rejected' | 'identical' | 'collision' | 'new' {
  if (item.rejected) return 'rejected';
  if (item.identical) return 'identical';
  if (item.collision) return 'collision';
  return 'new';
}

export function ImportDialogHost() {
  const request = useImportStore((s) => s.request);
  const clear = useImportStore((s) => s.clear);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [confirmReplace, setConfirmReplace] = useState(false);
  const handledNonce = useRef<number | null>(null);

  useEffect(() => {
    if (!request || handledNonce.current === request.nonce) return;
    const nonce = request.nonce;
    handledNonce.current = nonce;
    // Liveness is tracked by nonce (not effect cleanup) so React StrictMode's double effect run
    // cannot open the native file picker twice.
    const isAlive = () => handledNonce.current === nonce;
    setPlan(null);
    setError(null);
    setChoices({});
    setConfirmReplace(false);
    setPreparing(true);
    const run = async () => {
      try {
        const p = request.droppedFiles
          ? await api().files.prepareDroppedImport(request.droppedFiles, request.destRelativeDir)
          : await api().files.pickImport(request.destRelativeDir);
        if (!isAlive()) return;
        if (!p || p.items.length === 0) {
          clear();
          return;
        }
        const initial: Record<number, Choice> = {};
        for (const it of p.items) initial[it.index] = it.collision || it.identical || it.rejected ? 'skip' : 'keep-both';
        setChoices(initial);
        setPlan(p);
      } catch (err) {
        if (isAlive()) setError(err instanceof Error ? err.message : 'The import could not be prepared.');
      } finally {
        if (isAlive()) setPreparing(false);
      }
    };
    void run();
  }, [request, clear]);

  const close = () => {
    if (committing) return;
    handledNonce.current = null;
    setPreparing(false);
    setPlan(null);
    setError(null);
    clear();
  };

  const summary = useMemo(() => {
    if (!plan) return { toCopy: 0, replaces: 0, skipped: 0 };
    let toCopy = 0;
    let replaces = 0;
    let skipped = 0;
    for (const it of plan.items) {
      if (it.rejected) continue;
      const c = choices[it.index] ?? 'skip';
      if (c === 'skip') skipped++;
      else {
        toCopy++;
        if (c === 'replace') replaces++;
      }
    }
    return { toCopy, replaces, skipped };
  }, [plan, choices]);

  const commit = async () => {
    if (!plan) return;
    setCommitting(true);
    try {
      const result = await api().files.commitImport(plan.token, choices);
      const now = new Date().toISOString();
      let added = 0;
      useProjectStore.getState().update((draft) => {
        for (const f of result.imported) {
          if (upsertAssetForFile(draft, f.relativePath, f.sizeBytes, f.modifiedAt, now)) added++;
        }
      });
      await useProjectStore.getState().refreshFiles();
      const n = result.imported.length;
      if (result.errors.length > 0) {
        notify({
          tone: 'warning',
          message: `${n} file${n === 1 ? '' : 's'} imported; ${result.errors.length} could not be imported.`,
          detail: result.errors.map((e) => `${e.sourceName}: ${e.message}`).join('\n')
        });
      } else if (n > 0) {
        notify({
          tone: 'success',
          message: `${n} file${n === 1 ? '' : 's'} imported into ${plan.destRelativeDir || 'the project root'}.`,
          detail: added > 0 ? `${added} new register entr${added === 1 ? 'y' : 'ies'} created.` : 'Existing register entries were updated.'
        });
      } else {
        notify({ tone: 'info', message: 'No files were imported.' });
      }
      setPlan(null);
      clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed.');
    } finally {
      setCommitting(false);
    }
  };

  const open = !!request && (preparing || !!plan || !!error);
  if (!open) return null;

  const needsConfirm = summary.replaces > 0;
  const canImport = !!plan && summary.toCopy > 0 && (!needsConfirm || confirmReplace) && !committing;

  return (
    <Modal
      open
      onClose={close}
      title="Import files into project"
      width="xl"
      dismissible={!committing}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={committing}>
            Cancel
          </Button>
          {plan ? (
            <Button variant="primary" onClick={() => void commit()} disabled={!canImport} loading={committing} icon={FilePlus2} data-autofocus>
              {summary.toCopy === 0 ? 'Nothing to import' : `Import ${summary.toCopy} file${summary.toCopy === 1 ? '' : 's'}`}
            </Button>
          ) : null}
        </>
      }
    >
      {preparing ? (
        <div className="py-8 text-center">
          <Spinner label="Checking files…" />
        </div>
      ) : error ? (
        <Callout tone="crimson" icon={AlertTriangle} title="The import could not continue">
          {error}
        </Callout>
      ) : plan ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <FolderOpen size={14} className="text-dim" aria-hidden="true" />
            <span className="text-silver">Destination folder</span>
            <Code className="text-white">{plan.destRelativeDir || '(project root)'}</Code>
            <span className="text-2xs text-dim">To use another folder, cancel and start the import from that folder in the explorer.</span>
          </div>
          <p className="text-xs text-silver">
            Files are copied into the project. Originals are not modified. Imported scripts are never executed.
          </p>
          <ul className="flex flex-col gap-2" aria-label="Files to import">
            {plan.items.map((item) => (
              <PlanRow
                key={item.index}
                item={item}
                choice={choices[item.index] ?? 'skip'}
                onChoice={(c) => setChoices((prev) => ({ ...prev, [item.index]: c }))}
              />
            ))}
          </ul>
          {needsConfirm ? (
            <Callout tone="amber" icon={AlertTriangle} title="Existing files will be replaced">
              <Checkbox checked={confirmReplace} onChange={setConfirmReplace} label="I understand the existing file will be replaced" />
            </Callout>
          ) : null}
          <p className="text-2xs text-dim" aria-live="polite">
            <span className="font-mono">{summary.toCopy}</span> to copy · <span className="font-mono">{summary.skipped}</span> skipped
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function PlanRow({ item, choice, onChoice }: { item: ImportPlanItem; choice: Choice; onChoice: (c: Choice) => void }) {
  const status = statusOf(item);
  const name = `import-choice-${item.index}`;
  return (
    <li className={cx('rounded-md border px-3 py-2', status === 'rejected' ? 'border-crimson/40 bg-crimson/5' : 'border-gunmetal bg-obsidian')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white" title={item.sourceName}>
          {item.sourceName}
        </span>
        <span className="font-mono text-2xs text-dim">{formatBytes(item.sizeBytes)}</span>
        {status === 'new' ? (
          <Badge tone="emerald">
            <FilePlus2 size={11} aria-hidden="true" /> New
          </Badge>
        ) : status === 'collision' ? (
          <Badge tone="amber">
            <AlertTriangle size={11} aria-hidden="true" /> Name exists
          </Badge>
        ) : status === 'identical' ? (
          <Badge tone="info">
            <FileCheck2 size={11} aria-hidden="true" /> Identical
          </Badge>
        ) : (
          <Badge tone="crimson">
            <FileX2 size={11} aria-hidden="true" /> Rejected
          </Badge>
        )}
      </div>
      {status !== 'rejected' ? (
        <div className="mt-0.5 truncate font-mono text-2xs text-silver selectable" title={item.targetRelativePath}>
          → {item.targetRelativePath}
        </div>
      ) : null}
      {status === 'rejected' ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-[#fca5a5]">
          <ShieldAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{item.rejectReason ?? 'This file type is never imported.'}</span>
        </p>
      ) : null}
      {status === 'new' ? (
        <div className="mt-1.5">
          <Checkbox checked={choice !== 'skip'} onChange={(v) => onChoice(v ? 'keep-both' : 'skip')} label="Import this file" />
        </div>
      ) : null}
      {status === 'identical' ? (
        <div className="mt-1.5 flex flex-col gap-1">
          <p className="text-xs text-silver">Identical file already in project.</p>
          <Checkbox checked={choice !== 'skip'} onChange={(v) => onChoice(v ? 'keep-both' : 'skip')} label="Import a second copy anyway (renamed automatically)" />
        </div>
      ) : null}
      {status === 'collision' ? (
        <fieldset className="mt-1.5">
          <legend className="text-xs text-silver">A file with this name already exists.</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {(
              [
                ['skip', 'Skip'],
                ['keep-both', 'Keep both (rename automatically)'],
                ['replace', 'Replace existing']
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-1.5 text-xs text-white">
                <input
                  type="radio"
                  name={name}
                  value={value}
                  checked={choice === value}
                  onChange={() => onChoice(value)}
                  className="h-3.5 w-3.5 accent-[#dc2626]"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </li>
  );
}
