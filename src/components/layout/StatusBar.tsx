import { Check, CircleDot, Loader2, AlertTriangle, WifiOff, FlaskConical, GitMerge } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import { formatDateTime } from '@/lib/labels';
import { BRANDING } from '@/config/branding';

function SaveIndicator() {
  const saveState = useProjectStore((s) => s.saveState);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const saveError = useProjectStore((s) => s.saveError);
  const autosave = useUiStore((s) => s.settings?.autosaveEnabled ?? true);
  switch (saveState) {
    case 'saving':
      return (
        <span className="flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" aria-hidden="true" /> Saving…
        </span>
      );
    case 'dirty':
      return (
        <span className="flex items-center gap-1 text-amber">
          <CircleDot size={11} aria-hidden="true" /> Unsaved changes{autosave ? ' — autosave pending' : ''}
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-[#fca5a5]" title={saveError ?? undefined}>
          <AlertTriangle size={11} aria-hidden="true" /> Save failed
        </span>
      );
    case 'conflict':
      return (
        <span className="flex items-center gap-1 text-[#fca5a5]">
          <GitMerge size={11} aria-hidden="true" /> Changed outside FrameLytix
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-emerald" title={lastSavedAt ? `Last saved ${formatDateTime(lastSavedAt)}` : undefined}>
          <Check size={11} aria-hidden="true" /> All changes saved
        </span>
      );
  }
}

export function StatusBar() {
  const manifest = useProjectStore((s) => s.manifest);
  const session = useProjectStore((s) => s.session);
  const version = useUiStore((s) => s.appInfo?.version ?? BRANDING.version);
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-gunmetal bg-carbon px-3 text-2xs text-silver" aria-label="Status bar">
      {manifest ? (
        <>
          <span className="max-w-[32ch] truncate font-medium text-white" title={session?.rootPath}>
            {manifest.project.title}
          </span>
          <span role="status" aria-live="polite">
            <SaveIndicator />
          </span>
          <span className="font-mono">Units: {manifest.project.unitSystem}</span>
          {session?.isDemo ? (
            <span className="flex items-center gap-1 text-amber">
              <FlaskConical size={11} aria-hidden="true" /> Demo — temporary copy
            </span>
          ) : null}
        </>
      ) : (
        <span>No project open</span>
      )}
      <span className="flex-1" />
      <span className="flex items-center gap-1" title="FrameLytix runs entirely on this computer. No network connection is used.">
        <WifiOff size={11} aria-hidden="true" /> Offline-first
      </span>
      <span className="font-mono">v{version}</span>
    </footer>
  );
}
