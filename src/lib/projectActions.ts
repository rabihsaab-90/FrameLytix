/**
 * High-level project flows shared by the toolbar, welcome screen, menus and shortcuts.
 */
import { create } from 'zustand';
import type { BackupInfo, OpenResult } from '@shared/types/ipc';
import { api } from './api';
import { useProjectStore, isDirty } from '@/stores/projectStore';
import { confirmDialog, notify, useUiStore } from '@/stores/uiStore';

interface RecoveryState {
  request: { projectPath: string; backups: BackupInfo[]; message: string } | null;
  set(req: RecoveryState['request']): void;
}
export const useRecoveryStore = create<RecoveryState>()((set) => ({
  request: null,
  set: (request) => set({ request })
}));

/** Applies an OpenResult: loads the project or shows a meaningful error / recovery flow. */
export function handleOpenResult(result: OpenResult): boolean {
  if (result.ok) {
    useProjectStore.getState().load(result);
    useUiStore.setState({ history: [] });
    useUiStore.getState().navigate({ view: 'overview' });
    if (result.warnings.length > 0) {
      notify({ tone: 'warning', message: `Project opened with ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`, detail: result.warnings.slice(0, 3).join('\n') });
    }
    return true;
  }
  if (result.code === 'cancelled') return false;
  if (result.recovery && result.recovery.backups.length > 0) {
    useRecoveryStore.getState().set({ ...result.recovery, message: result.message });
    return false;
  }
  notify({ tone: 'error', message: openErrorTitle(result.code), detail: result.message });
  return false;
}

function openErrorTitle(code: string): string {
  switch (code) {
    case 'not-found':
      return 'Project folder not found';
    case 'not-a-project':
      return 'No FrameLytix project in that folder';
    case 'future-version':
      return 'Project requires a newer FrameLytix';
    case 'locked':
      return 'Project is open elsewhere';
    case 'invalid':
      return 'Project file could not be read';
    default:
      return 'Could not open project';
  }
}

/**
 * Before leaving the current project: if there are unsaved edits, ask to save.
 * Returns false when the user cancels.
 */
export async function ensureCanLeaveProject(): Promise<boolean> {
  const st = useProjectStore.getState();
  if (!st.manifest) return true;
  if (isDirty(st) || st.saveState === 'error') {
    const choice = await confirmDialog({
      title: 'Unsaved changes',
      message: st.session?.isDemo
        ? 'You have unsaved changes in the demo copy. Demo changes are temporary and are discarded when you leave unless you use "Save as New Project".'
        : `Save changes to "${st.manifest.project.title}" before continuing?`,
      confirmLabel: st.session?.isDemo ? 'Leave demo' : 'Save',
      alternateLabel: st.session?.isDemo ? undefined : "Don't save",
      cancelLabel: 'Cancel'
    });
    if (choice === 'cancel') return false;
    if (choice === 'confirm' && !st.session?.isDemo) {
      const ok = await st.save(true);
      if (!ok) {
        notify({ tone: 'error', message: 'Save failed — project not closed', detail: useProjectStore.getState().saveError ?? undefined });
        return false;
      }
    }
  } else if (st.editVersion > 0 && !st.session?.isDemo) {
    await st.save(false);
  }
  return true;
}

export async function closeProject(): Promise<boolean> {
  if (!(await ensureCanLeaveProject())) return false;
  await api().project.close();
  useProjectStore.getState().clear();
  await api().app.setDirty(false);
  useUiStore.getState().setScreen('welcome');
  return true;
}

export async function goHome(): Promise<void> {
  await closeProject();
}

export async function startNewProject(): Promise<void> {
  if (!(await ensureCanLeaveProject())) return;
  if (useProjectStore.getState().manifest) {
    await api().project.close();
    useProjectStore.getState().clear();
  }
  useUiStore.getState().setScreen('onboarding');
}

export async function openProjectDialog(): Promise<void> {
  if (!(await ensureCanLeaveProject())) return;
  const result = await api().project.openDialog();
  handleOpenResult(result);
}

export async function openRecentProject(path: string): Promise<void> {
  if (!(await ensureCanLeaveProject())) return;
  const result = await api().project.openRecent(path);
  handleOpenResult(result);
}

export async function openDemo(): Promise<void> {
  if (!(await ensureCanLeaveProject())) return;
  const result = await api().demo.open();
  handleOpenResult(result);
}

export async function resetDemo(): Promise<void> {
  const choice = await confirmDialog({
    title: 'Reset demo project?',
    message: 'All changes you made to the demo copy will be discarded and the original sample will be reloaded. The bundled sample itself is never modified.',
    confirmLabel: 'Reset demo',
    danger: true
  });
  if (choice !== 'confirm') return;
  const result = await api().demo.reset();
  if (handleOpenResult(result)) notify({ tone: 'success', message: 'Demo project reset to the original sample' });
}

export async function saveDemoAsNewProject(): Promise<void> {
  const manifest = useProjectStore.getState().manifest;
  if (!manifest) return;
  const result = await api().project.saveAsNew(JSON.parse(JSON.stringify(manifest)));
  if (handleOpenResult(result) && result.ok) {
    notify({ tone: 'success', message: 'Saved as a new project', detail: result.session.rootPath });
  }
}

export async function saveNow(): Promise<void> {
  const st = useProjectStore.getState();
  if (!st.manifest) return;
  const ok = await st.save(true);
  if (ok) notify({ tone: 'success', message: st.session?.isDemo ? 'Saved to the temporary demo copy' : 'Project saved' });
  else if (useProjectStore.getState().saveState !== 'conflict') {
    notify({ tone: 'error', message: 'Save failed', detail: useProjectStore.getState().saveError ?? undefined });
  }
}
