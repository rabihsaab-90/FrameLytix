import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { api, hasApi } from '@/lib/api';
import { useUiStore, notify } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useAutosave, useDirtyReporting, useProjectEvents, useShortcuts } from '@/hooks/useProjectLifecycle';
import { openProjectDialog, saveNow, startNewProject } from '@/lib/projectActions';
import { Toolbar } from '@/components/layout/Toolbar';
import { StatusBar } from '@/components/layout/StatusBar';
import { Workspace } from '@/components/layout/Workspace';
import { ConfirmHost } from '@/components/common/Modal';
import { Toasts } from '@/components/common/Toasts';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Spinner } from '@/components/common/ui';
import { RecoveryDialog } from '@/components/common/RecoveryDialog';
import { ImportDialogHost } from '@/components/viewers/ImportDialog';
import { WelcomePage } from '@/pages/WelcomePage';

const OnboardingWizard = lazy(() => import('@/components/onboarding/OnboardingWizard'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

function useMenuCommands() {
  const setScreen = useUiStore((s) => s.setScreen);
  useEffect(() => {
    if (!hasApi()) return;
    return api().app.onMenuCommand((cmd) => {
      switch (cmd) {
        case 'new':
          void startNewProject();
          break;
        case 'open':
          void openProjectDialog();
          break;
        case 'save':
          if (useProjectStore.getState().manifest) void saveNow();
          break;
        case 'export':
          if (useProjectStore.getState().manifest) useUiStore.getState().navigate({ view: 'report' });
          break;
        case 'about':
          setScreen('settings');
          break;
      }
    });
  }, [setScreen]);
}

export default function App() {
  const screen = useUiStore((s) => s.screen);
  const hasProject = useProjectStore((s) => !!s.manifest);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useAutosave();
  useDirtyReporting();
  useProjectEvents();
  useShortcuts();
  useMenuCommands();

  useEffect(() => {
    if (!hasApi()) {
      setBootError('The secure preload bridge is unavailable. FrameLytix must be started as a desktop application.');
      return;
    }
    Promise.all([api().settings.get(), api().app.getInfo()])
      .then(([settings, info]) => {
        useUiStore.getState().setSettings(settings);
        useUiStore.getState().setAppInfo(info);
        setReady(true);
      })
      .catch((err: unknown) => {
        setBootError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  // If the workspace screen is shown without a project (e.g. after closing), fall back to welcome.
  useEffect(() => {
    if (screen === 'workspace' && !hasProject) useUiStore.getState().setScreen('welcome');
  }, [screen, hasProject]);

  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      notify({ tone: 'error', message: 'An operation failed', detail: msg });
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, []);

  if (bootError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-crimson/40 bg-carbon p-6" role="alert">
          <div className="flex items-center gap-2 text-[#fca5a5]">
            <AlertOctagon size={18} aria-hidden="true" />
            <h1 className="text-sm font-semibold">FrameLytix could not start</h1>
          </div>
          <p className="mt-2 text-xs text-silver">{bootError}</p>
        </div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Starting FrameLytix…" />
      </div>
    );
  }

  const showWorkspaceChrome = screen === 'workspace' || (screen === 'settings' && hasProject);

  return (
    <div className="flex h-full flex-col">
      {showWorkspaceChrome ? <Toolbar /> : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <ErrorBoundary area="application" resetKey={screen}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            }
          >
            {screen === 'welcome' ? <WelcomePage /> : null}
            {screen === 'onboarding' ? <OnboardingWizard /> : null}
            {screen === 'settings' ? <SettingsPage /> : null}
            {screen === 'workspace' && hasProject ? <Workspace /> : null}
          </Suspense>
        </ErrorBoundary>
      </div>
      {showWorkspaceChrome ? <StatusBar /> : null}
      <ImportDialogHost />
      <RecoveryDialog />
      <ConfirmHost />
      <Toasts />
    </div>
  );
}
