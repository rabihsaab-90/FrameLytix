/**
 * Project store — the renderer's single source of truth for the open project.
 *
 * Edits go through `update(recipe)` (Immer draft). Every edit bumps `editVersion`;
 * a save captures the version it wrote so later edits made while a save is in flight
 * are never incorrectly marked as saved. Saves are serialised (one at a time).
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { castDraft, type Draft } from 'immer';
import type { EngineeringArgument, ProjectManifest } from '@shared/schemas/project';
import type { FileNode, OpenResult, ProjectSessionInfo } from '@shared/types/ipc';
import { applyApprovalGuard } from '@shared/utilities/revisions';
import { api } from '@/lib/api';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

interface ProjectState {
  manifest: ProjectManifest | null;
  session: ProjectSessionInfo | null;
  warnings: string[];
  editVersion: number;
  savedVersion: number;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: string | null;
  fileTree: FileNode | null;
  /** Relative paths of asset records whose files are missing on disk. */
  missingAssets: string[];
  /** Incremented when files change on disk so viewers can cache-bust. */
  fileEpoch: number;
  externalChangePending: boolean;

  load(result: Extract<OpenResult, { ok: true }>): void;
  clear(): void;
  update(recipe: (draft: Draft<ProjectManifest>) => void): void;
  updateArgument(id: string, recipe: (draft: Draft<EngineeringArgument>) => void): void;
  save(manual: boolean, force?: boolean): Promise<boolean>;
  refreshFiles(): Promise<void>;
  setExternalChangePending(v: boolean): void;
  dismissWarning(index: number): void;
}

let saveChain: Promise<unknown> = Promise.resolve();

export const useProjectStore = create<ProjectState>()(
  immer((set, get) => ({
    manifest: null,
    session: null,
    warnings: [],
    editVersion: 0,
    savedVersion: 0,
    saveState: 'saved',
    saveError: null,
    lastSavedAt: null,
    fileTree: null,
    missingAssets: [],
    fileEpoch: 0,
    externalChangePending: false,

    load(result) {
      set((s) => {
        s.manifest = castDraft(result.manifest);
        s.session = result.session;
        s.warnings = result.warnings;
        s.editVersion = 0;
        s.savedVersion = 0;
        s.saveState = 'saved';
        s.saveError = null;
        s.lastSavedAt = null;
        s.fileTree = null;
        s.missingAssets = [];
        s.externalChangePending = false;
      });
      void get().refreshFiles();
    },

    clear() {
      set((s) => {
        s.manifest = null;
        s.session = null;
        s.warnings = [];
        s.editVersion = 0;
        s.savedVersion = 0;
        s.saveState = 'saved';
        s.saveError = null;
        s.fileTree = null;
        s.missingAssets = [];
        s.externalChangePending = false;
      });
    },

    update(recipe) {
      set((s) => {
        if (!s.manifest) return;
        recipe(s.manifest);
        s.manifest.project.modifiedAt = new Date().toISOString();
        s.editVersion += 1;
        if (s.saveState !== 'saving' && s.saveState !== 'conflict') s.saveState = 'dirty';
      });
    },

    updateArgument(id, recipe) {
      set((s) => {
        if (!s.manifest) return;
        const idx = s.manifest.arguments.findIndex((a) => a.id === id);
        if (idx < 0) return;
        const before = JSON.parse(JSON.stringify(s.manifest.arguments[idx])) as EngineeringArgument;
        const draft = s.manifest.arguments[idx]!;
        recipe(draft);
        const now = new Date().toISOString();
        draft.modifiedAt = now;
        const guarded = applyApprovalGuard(before, JSON.parse(JSON.stringify(draft)) as EngineeringArgument);
        draft.status = guarded.status;
        s.manifest.project.modifiedAt = now;
        s.editVersion += 1;
        if (s.saveState !== 'saving' && s.saveState !== 'conflict') s.saveState = 'dirty';
      });
    },

    save(manual, force = false) {
      const run = async (): Promise<boolean> => {
        const state = get();
        if (!state.manifest || !state.session) return false;
        if (!force && !manual && state.editVersion === state.savedVersion) return true;
        if (state.saveState === 'conflict' && !force) return false;
        const capturedVersion = state.editVersion;
        const snapshot = JSON.parse(JSON.stringify(state.manifest)) as ProjectManifest;
        set((s) => {
          s.saveState = 'saving';
        });
        try {
          const result = await api().project.save(snapshot, { manual, force });
          if (result.ok) {
            set((s) => {
              s.savedVersion = capturedVersion;
              s.lastSavedAt = result.savedAt;
              s.saveError = null;
              s.saveState = s.editVersion === capturedVersion ? 'saved' : 'dirty';
            });
            return true;
          }
          set((s) => {
            s.saveState = result.code === 'conflict' ? 'conflict' : 'error';
            s.saveError = result.message;
          });
          return false;
        } catch (err) {
          set((s) => {
            s.saveState = 'error';
            s.saveError = err instanceof Error ? err.message : String(err);
          });
          return false;
        }
      };
      const next = saveChain.then(run, run);
      saveChain = next.catch(() => undefined);
      return next;
    },

    async refreshFiles() {
      const { manifest, session } = get();
      if (!manifest || !session) return;
      try {
        const [tree, stats] = await Promise.all([
          api().files.tree(),
          api().files.statMany(manifest.assets.map((a) => a.relativePath))
        ]);
        set((s) => {
          s.fileTree = tree;
          s.missingAssets = Object.entries(stats)
            .filter(([, st]) => !st.exists || !st.isFile)
            .map(([p]) => p);
          s.fileEpoch += 1;
        });
      } catch {
        // The explorer shows a manual refresh button; failures here are non-fatal.
      }
    },

    setExternalChangePending(v) {
      set((s) => {
        s.externalChangePending = v;
      });
    },

    dismissWarning(index) {
      set((s) => {
        s.warnings.splice(index, 1);
      });
    }
  }))
);

export function isDirty(state: Pick<ProjectState, 'editVersion' | 'savedVersion'>): boolean {
  return state.editVersion !== state.savedVersion;
}

/** Convenience hook returning the manifest; components should only render under an open project. */
export function useManifest(): ProjectManifest {
  const manifest = useProjectStore((s) => s.manifest);
  if (!manifest) throw new Error('No project is open.');
  return manifest;
}
