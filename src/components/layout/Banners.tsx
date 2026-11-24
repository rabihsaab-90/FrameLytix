import { FlaskConical, RotateCcw, FolderInput, FileDown, GitMerge, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/common/ui';
import { useProjectStore } from '@/stores/projectStore';
import { navigate, notify, confirmDialog } from '@/stores/uiStore';
import { handleOpenResult, resetDemo, saveDemoAsNewProject } from '@/lib/projectActions';
import { api } from '@/lib/api';

export function DemoBanner() {
  const isDemo = useProjectStore((s) => s.session?.isDemo ?? false);
  if (!isDemo) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber/30 bg-amber/10 px-4 py-1.5 text-xs" role="region" aria-label="Demo mode">
      <FlaskConical size={14} className="text-amber" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[#fde68a]">
        <strong className="font-semibold">Demo mode</strong> — you are exploring a temporary copy of the educational sample. Values are illustrative and not for construction. Changes are discarded unless saved as a new project.
      </p>
      <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => void resetDemo()}>
        Reset Demo
      </Button>
      <Button size="xs" variant="outline" icon={FolderInput} onClick={() => void saveDemoAsNewProject()}>
        Save as New Project
      </Button>
      <Button size="xs" variant="outline" icon={FileDown} onClick={() => navigate({ view: 'report' })}>
        Export Sample Report
      </Button>
    </div>
  );
}

/** Shown when the manifest changed on disk outside FrameLytix, or a save hit a conflict. */
export function ConflictBanner() {
  const pending = useProjectStore((s) => s.externalChangePending);
  const saveState = useProjectStore((s) => s.saveState);
  const setPending = useProjectStore((s) => s.setExternalChangePending);
  if (!pending && saveState !== 'conflict') return null;

  const reload = async () => {
    const choice = await confirmDialog({
      title: 'Reload from disk?',
      message: 'Your unsaved changes in FrameLytix will be discarded and the version on disk will be loaded.',
      confirmLabel: 'Reload',
      danger: true
    });
    if (choice !== 'confirm') return;
    const result = await api().project.reload();
    if (handleOpenResult(result)) notify({ tone: 'success', message: 'Project reloaded from disk' });
  };
  const keepMine = async () => {
    const ok = await useProjectStore.getState().save(true, true);
    setPending(false);
    if (ok) notify({ tone: 'success', message: 'Saved your version', detail: 'The externally modified file was preserved in .framelytix/backups.' });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-crimson/40 bg-crimson/10 px-4 py-1.5 text-xs" role="alert">
      <GitMerge size={14} className="text-crimson-hover" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[#fecaca]">
        <strong className="font-semibold">The project file was changed outside FrameLytix.</strong> Choose which version to keep. Nothing will be overwritten silently.
      </p>
      <Button size="xs" variant="outline" onClick={() => void reload()}>
        Reload from disk
      </Button>
      <Button size="xs" variant="primary" onClick={() => void keepMine()}>
        Keep my version (back up theirs)
      </Button>
    </div>
  );
}

export function WarningsBanner() {
  const warnings = useProjectStore((s) => s.warnings);
  const dismiss = useProjectStore((s) => s.dismissWarning);
  if (warnings.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-amber/30 bg-amber/5 px-4 py-1.5 text-xs">
      {warnings.slice(0, 3).map((w, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-[#fde68a]">
          <AlertTriangle size={12} className="shrink-0 text-amber" aria-hidden="true" />
          <span className="min-w-0 flex-1">{w}</span>
          <button type="button" aria-label="Dismiss warning" className="text-dim hover:text-white" onClick={() => dismiss(i)}>
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      ))}
      {warnings.length > 3 ? <p className="pl-5 text-2xs text-dim">+{warnings.length - 3} more</p> : null}
    </div>
  );
}
