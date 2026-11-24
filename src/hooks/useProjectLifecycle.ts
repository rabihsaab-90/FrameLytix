/**
 * Global hooks: autosave, dirty-state reporting, file watcher events, close handling
 * and application keyboard shortcuts.
 */
import { useEffect } from 'react';
import { api, hasApi } from '@/lib/api';
import { isDirty, useProjectStore } from '@/stores/projectStore';
import { useUiStore, notify, confirmDialog } from '@/stores/uiStore';
import { openProjectDialog, saveNow, startNewProject } from '@/lib/projectActions';

export function useAutosave(): void {
  const editVersion = useProjectStore((s) => s.editVersion);
  const savedVersion = useProjectStore((s) => s.savedVersion);
  const saveState = useProjectStore((s) => s.saveState);
  const enabled = useUiStore((s) => s.settings?.autosaveEnabled ?? true);
  const delay = useUiStore((s) => s.settings?.autosaveDelayMs ?? 1500);

  useEffect(() => {
    if (!enabled || editVersion === savedVersion || saveState === 'conflict' || saveState === 'saving') return;
    const t = window.setTimeout(() => {
      void useProjectStore.getState().save(false);
    }, delay);
    return () => window.clearTimeout(t);
  }, [editVersion, savedVersion, saveState, enabled, delay]);
}

export function useDirtyReporting(): void {
  const dirty = useProjectStore((s) => isDirty(s) || s.saveState === 'saving');
  const isDemo = useProjectStore((s) => s.session?.isDemo ?? false);
  useEffect(() => {
    if (!hasApi()) return;
    void api().app.setDirty(dirty && !isDemo);
  }, [dirty, isDemo]);
}

export function useProjectEvents(): void {
  useEffect(() => {
    if (!hasApi()) return;
    let timer: number | undefined;
    const offFiles = api().files.onChanged(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void useProjectStore.getState().refreshFiles(), 250);
    });
    const offManifest = api().files.onManifestChangedExternally(() => {
      useProjectStore.getState().setExternalChangePending(true);
    });
    const offClose = api().app.onCloseRequested(async () => {
      const st = useProjectStore.getState();
      const choice = await confirmDialog({
        title: 'Unsaved changes',
        message: `Save changes to "${st.manifest?.project.title ?? 'this project'}" before closing FrameLytix?`,
        confirmLabel: 'Save and close',
        alternateLabel: "Close without saving",
        cancelLabel: 'Cancel'
      });
      if (choice === 'cancel') return;
      if (choice === 'confirm') {
        const ok = await st.save(true);
        if (!ok) {
          notify({ tone: 'error', message: 'Save failed — FrameLytix was not closed', detail: useProjectStore.getState().saveError ?? undefined });
          return;
        }
      }
      await api().app.closeNow();
    });
    return () => {
      offFiles();
      offManifest();
      offClose();
      window.clearTimeout(timer);
    };
  }, []);
}

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      const hasProject = !!useProjectStore.getState().manifest;
      // Ctrl+S works everywhere (including in text fields) — it never conflicts with editing.
      if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (hasProject) void saveNow();
        return;
      }
      if (key === 'n' && !e.shiftKey) {
        e.preventDefault();
        void startNewProject();
        return;
      }
      if (key === 'o' && !e.shiftKey) {
        e.preventDefault();
        void openProjectDialog();
        return;
      }
      // Leave Ctrl+B / Ctrl+F to text editing when typing in a field.
      if (isEditableTarget(e.target)) return;
      if (key === 'b' && hasProject) {
        e.preventDefault();
        const s = useUiStore.getState().settings;
        if (s) void useUiStore.getState().updateSettings({ sidebarCollapsed: !s.sidebarCollapsed });
        return;
      }
      if (key === 'f' && hasProject) {
        e.preventDefault();
        useUiStore.getState().requestSearchFocus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
