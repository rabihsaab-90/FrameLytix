import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, FilePlus2, FolderClock, FolderOpen, Lightbulb, Play, Settings, WifiOff, X } from 'lucide-react';
import type { RecentProject } from '@shared/schemas/settings';
import logo from '@/assets/logo-mark.svg';
import { BRANDING } from '@/config/branding';
import { api } from '@/lib/api';
import { DISCIPLINE_LABEL, formatDate } from '@/lib/labels';
import { openDemo, openProjectDialog, openRecentProject, startNewProject } from '@/lib/projectActions';
import { notify, useUiStore } from '@/stores/uiStore';
import { Badge, Button, EmptyState, IconButton, Spinner, cx } from '@/components/common/ui';

type RecentEntry = RecentProject & { available: boolean };

function RecentRow({ entry, busy, onOpen, onRemove }: { entry: RecentEntry; busy: boolean; onOpen: () => void; onRemove: () => void }) {
  const disciplineLabel = DISCIPLINE_LABEL[entry.discipline] ?? entry.discipline;
  return (
    <li className={cx('flex items-center gap-1 rounded-md border border-gunmetal bg-matte/50', entry.available ? 'hover:border-steel hover:bg-matte' : 'opacity-80')}>
      <button
        type="button"
        onClick={onOpen}
        disabled={!entry.available || busy}
        aria-label={entry.available ? `Open ${entry.title}` : `${entry.title} (unavailable)`}
        title={entry.available ? entry.path : `${entry.path} — folder not found or not accessible`}
        className={cx('flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-3 py-2 text-left', !entry.available && 'cursor-not-allowed')}
      >
        <span className="flex items-center gap-2">
          <span className={cx('min-w-0 flex-1 truncate text-[13px] font-medium', entry.available ? 'text-white' : 'text-silver')}>{entry.title || 'Untitled project'}</span>
          {busy ? (
            <Spinner label="Opening…" size={12} />
          ) : entry.available ? (
            <Badge tone="emerald">
              <CircleCheck size={11} aria-hidden="true" />
              Available
            </Badge>
          ) : (
            <Badge tone="amber">
              <CircleAlert size={11} aria-hidden="true" />
              Unavailable
            </Badge>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-2xs text-silver">
          <span>{disciplineLabel}</span>
          <span className="font-mono text-dim">{entry.identifier}</span>
          <span className="text-dim">Opened {formatDate(entry.lastOpened)}</span>
        </span>
        <span className="truncate font-mono text-2xs text-dim">{entry.path}</span>
      </button>
      <IconButton
        icon={X}
        size="sm"
        tone="danger"
        label={`Remove ${entry.title || 'project'} from the recent list (project files are not deleted)`}
        onClick={onRemove}
        className="mr-1.5"
      />
    </li>
  );
}

export function WelcomePage() {
  const appInfo = useUiStore((s) => s.appInfo);
  const setScreen = useUiStore((s) => s.setScreen);
  const [recent, setRecent] = useState<RecentEntry[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      setRecent(await api().recent.list());
      setRecentError(null);
    } catch (err) {
      setRecent([]);
      setRecentError(err instanceof Error ? err.message : 'The recent projects list could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const loadDemo = async () => {
    setDemoLoading(true);
    try {
      await openDemo();
    } catch (err) {
      notify({ tone: 'error', message: 'The sample project could not be opened', detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setDemoLoading(false);
    }
  };

  const openRecent = async (path: string) => {
    setBusyPath(path);
    try {
      await openRecentProject(path);
    } catch (err) {
      notify({ tone: 'error', message: 'The project could not be opened', detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyPath(null);
      void loadRecent();
    }
  };

  const removeRecent = async (entry: RecentEntry) => {
    try {
      await api().recent.remove(entry.path);
      setRecent((list) => (list ? list.filter((r) => r.path !== entry.path) : list));
      notify({ tone: 'info', message: 'Removed from the recent list', detail: 'The project files were not deleted.' });
    } catch (err) {
      notify({ tone: 'error', message: 'Could not update the recent list', detail: err instanceof Error ? err.message : String(err) });
    }
  };

  const guard = (fn: () => Promise<void>) => () => {
    fn().catch((err: unknown) => notify({ tone: 'error', message: 'The action failed', detail: err instanceof Error ? err.message : String(err) }));
  };

  return (
    <div className="flex h-full flex-col bg-obsidian">
      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        {/* Hero */}
        <main className="bg-tech-grid flex min-w-0 flex-1 items-center justify-center overflow-auto px-8 py-8 xl:px-14">
          <div className="w-full max-w-xl">
            <div className="flex items-center gap-3">
              <img src={logo} alt="" width={44} height={44} className="h-11 w-11 rounded-lg" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">{BRANDING.appName}</h1>
                <p className="text-[13px] font-medium text-crimson-hover">{BRANDING.tagline}</p>
              </div>
            </div>
            <p className="mt-4 max-w-md text-[13px] leading-relaxed text-silver">
              A local engineering design workspace for requirements, decisions, calculations, traceability and design reports.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                variant="primary"
                size="lg"
                icon={Play}
                loading={demoLoading}
                onClick={() => void loadDemo()}
                aria-busy={demoLoading}
                className="h-auto! w-full justify-start py-3.5 text-left"
              >
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-[15px] font-semibold">{demoLoading ? 'Opening sample project…' : 'Load Sample Civil Bridge Project'}</span>
                  <span className="text-xs font-normal whitespace-normal text-white/80">Pedestrian truss bridge — fully populated, opens instantly, no setup</span>
                </span>
              </Button>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Button variant="secondary" size="lg" icon={FilePlus2} onClick={guard(startNewProject)} disabled={demoLoading} className="h-auto! justify-start py-2.5">
                  <span className="flex flex-col items-start">
                    <span>Create New Project</span>
                    <span className="text-2xs font-normal text-silver">Start from an engineering template</span>
                  </span>
                </Button>
                <Button variant="secondary" size="lg" icon={FolderOpen} onClick={guard(openProjectDialog)} disabled={demoLoading} className="h-auto! justify-start py-2.5">
                  <span className="flex flex-col items-start">
                    <span>Open Existing Project</span>
                    <span className="text-2xs font-normal text-silver">Browse for a project folder</span>
                  </span>
                </Button>
              </div>
            </div>

            <p className="mt-5 flex items-start gap-2 text-xs text-silver">
              <Lightbulb size={14} className="mt-px shrink-0 text-amber" aria-hidden="true" />
              <span>New here? Load the sample to explore every feature in one click.</span>
            </p>
          </div>
        </main>

        {/* Recent projects */}
        <aside aria-labelledby="recent-heading" className="flex shrink-0 flex-col border-t border-gunmetal bg-carbon lg:min-h-0 lg:w-[400px] lg:border-t-0 lg:border-l xl:w-[440px]">
          <div className="flex items-center gap-2 border-b border-gunmetal px-4 py-2.5">
            <FolderClock size={14} className="text-silver" aria-hidden="true" />
            <h2 id="recent-heading" className="text-[13px] font-semibold text-white">
              Recent Projects
            </h2>
            {recent && recent.length > 0 ? <span className="font-mono text-2xs text-dim">{recent.length}</span> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {recent === null ? (
              <Spinner label="Loading recent projects…" />
            ) : recent.length === 0 ? (
              <EmptyState
                icon={FolderClock}
                title="No recent projects"
                message={recentError ?? 'Projects you create or open appear here so you can return to them quickly.'}
              />
            ) : (
              <ul className="flex flex-col gap-1.5" aria-label="Recent projects">
                {recent.map((entry) => (
                  <RecentRow key={entry.path} entry={entry} busy={busyPath === entry.path} onOpen={() => void openRecent(entry.path)} onRemove={() => void removeRecent(entry)} />
                ))}
              </ul>
            )}
          </div>
          <p className="border-t border-gunmetal px-4 py-2 text-2xs text-dim">Removing an entry only clears it from this list. Project files are never deleted.</p>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-gunmetal bg-carbon px-4 py-1.5 text-2xs text-silver">
        <div className="flex items-center gap-4">
          <span className="font-mono" aria-label="Version">
            v{appInfo?.version ?? BRANDING.version}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <WifiOff size={12} aria-hidden="true" />
            Offline-first — runs entirely on this computer
          </span>
        </div>
        <Button variant="ghost" size="sm" icon={Settings} onClick={() => setScreen('settings')}>
          Settings
        </Button>
      </footer>
    </div>
  );
}
