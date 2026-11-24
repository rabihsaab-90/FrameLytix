import { useState } from 'react';
import { LifeBuoy, CheckCircle2, XCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button, Callout, cx } from './ui';
import { useRecoveryStore, handleOpenResult } from '@/lib/projectActions';
import { api } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/labels';
import { notify } from '@/stores/uiStore';

/** Offered when a project manifest is damaged but backups exist. */
export function RecoveryDialog() {
  const req = useRecoveryStore((s) => s.request);
  const clear = useRecoveryStore((s) => s.set);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  const valid = req.backups.filter((b) => b.valid);
  const choice = selected ?? valid[0]?.fileName ?? null;

  const restore = async () => {
    if (!choice) return;
    setBusy(true);
    const result = await api().project.recover(req.projectPath, choice);
    setBusy(false);
    if (handleOpenResult(result)) {
      clear(null);
      notify({ tone: 'success', message: `Restored from backup ${choice}`, detail: 'The damaged manifest was preserved in .framelytix/backups as corrupted-….json.' });
    }
  };

  return (
    <Modal
      open
      onClose={() => clear(null)}
      title="Project file is damaged"
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => clear(null)}>
            Cancel
          </Button>
          <Button variant="primary" icon={LifeBuoy} disabled={!choice} loading={busy} onClick={() => void restore()}>
            Restore selected backup
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Callout tone="crimson" title="The project manifest could not be read">
          <span className="font-mono text-2xs break-words">{req.message}</span>
        </Callout>
        <p>
          FrameLytix found {req.backups.length} backup{req.backups.length === 1 ? '' : 's'} in <span className="font-mono text-2xs">.framelytix/backups</span>. Restoring keeps a copy of
          the damaged file first, so nothing is lost.
        </p>
        <ul className="flex flex-col gap-1" role="radiogroup" aria-label="Available backups">
          {req.backups.map((b) => (
            <li key={b.fileName}>
              <button
                type="button"
                role="radio"
                aria-checked={choice === b.fileName}
                disabled={!b.valid}
                onClick={() => setSelected(b.fileName)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left',
                  choice === b.fileName ? 'border-crimson bg-crimson/10' : 'border-gunmetal hover:border-steel',
                  !b.valid && 'cursor-not-allowed opacity-50'
                )}
              >
                {b.valid ? <CheckCircle2 size={14} className="text-emerald" aria-label="Valid backup" /> : <XCircle size={14} className="text-crimson-hover" aria-label="Invalid backup" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs text-white">{b.fileName}</span>
                  <span className="block text-2xs text-dim">
                    {formatDateTime(b.createdAt)} · {formatBytes(b.sizeBytes)} · {b.valid ? b.projectTitle : 'not a valid manifest'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
