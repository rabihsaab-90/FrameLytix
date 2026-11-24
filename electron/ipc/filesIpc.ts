import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { dialog, shell } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS, type ActionResult, type ImportDecision, type ImportResult } from '../../shared/types/ipc';
import type { AppState } from '../appState';
import { effectiveExtension, isBlockedExtension, isInside, resolveInsideRoot, toRelativePosix } from '../security/paths';
import { buildTree, createFolder, MAX_IMPORT_FILES, MAX_STAT_PATHS, statMany } from '../services/fileService';
import { AbsPath, handle, RelPath, Str, UserFacingError } from './handle';

const DecisionSchema = z.enum(['keep-both', 'replace', 'skip']);

export function registerFilesIpc(state: AppState): void {
  const win = () => state.mainWindow ?? undefined;
  const requireRoot = (): string => {
    const root = state.rootPath;
    if (!root) throw new UserFacingError('No project is open.');
    return root;
  };

  handle(state, IPC_CHANNELS.filesTree, z.tuple([]), async () => {
    const root = state.rootPath;
    return root ? buildTree(root) : null;
  });

  handle(state, IPC_CHANNELS.filesStatMany, z.tuple([z.array(RelPath).max(MAX_STAT_PATHS)]), async (rels) => statMany(requireRoot(), rels));

  handle(state, IPC_CHANNELS.filesPickImport, z.tuple([RelPath]), async (destRel) => {
    const root = requireRoot();
    const w = win();
    const opts: Electron.OpenDialogOptions = { title: 'Import Files into Project', buttonLabel: 'Import', properties: ['openFile', 'multiSelections'] };
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || res.filePaths.length === 0) return null;
    return state.imports.planImport(root, res.filePaths, destRel);
  });

  // Dropped files: absolute paths come from webUtils.getPathForFile in the preload. The
  // operation is copy-only into the project, with the same checks as picked files.
  handle(state, IPC_CHANNELS.filesPrepareDroppedImport, z.tuple([z.array(AbsPath).max(MAX_IMPORT_FILES), RelPath]), async (paths, destRel) => {
    const root = requireRoot();
    const valid = paths.filter((p) => p !== '' && path.isAbsolute(p));
    if (valid.length === 0) return null;
    return state.imports.planImport(root, valid, destRel);
  });

  handle(
    state,
    IPC_CHANNELS.filesCommitImport,
    z.tuple([Str(64), z.record(z.string().regex(/^\d{1,4}$/), DecisionSchema)]),
    async (token, decisions): Promise<ImportResult> => {
      const root = requireRoot();
      const byIndex: Record<number, ImportDecision> = {};
      for (const [k, v] of Object.entries(decisions)) byIndex[Number(k)] = v;
      return state.imports.commitImport(root, token, byIndex);
    }
  );

  handle(state, IPC_CHANNELS.filesPickRelink, z.tuple([]), async () => {
    const root = requireRoot();
    const w = win();
    const opts: Electron.OpenDialogOptions = { title: 'Choose a File in the Project', defaultPath: root, properties: ['openFile'] };
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    const picked = res.canceled ? undefined : res.filePaths[0];
    if (!picked) return null;
    let canonical: string;
    try {
      canonical = await realpath(picked);
    } catch {
      return null;
    }
    const canonRoot = await realpath(root);
    const rel = isInside(canonRoot, canonical) ? toRelativePosix(canonRoot, canonical) : null;
    if (!rel) {
      const box: Electron.MessageBoxOptions = {
        type: 'warning',
        title: 'File Outside Project',
        message: 'Choose a file inside the project folder.',
        detail: 'To use a file from elsewhere, import it into the project first.'
      };
      if (w) await dialog.showMessageBox(w, box);
      else await dialog.showMessageBox(box);
      return null;
    }
    return rel;
  });

  handle(state, IPC_CHANNELS.filesCreateFolder, z.tuple([RelPath, Str(300)]), async (parentRel, name) =>
    createFolder(requireRoot(), parentRel, name)
  );

  handle(state, IPC_CHANNELS.filesReveal, z.tuple([RelPath]), async (rel): Promise<ActionResult> => {
    const root = requireRoot();
    const abs = await resolveInsideRoot(root, rel);
    const s = await stat(abs).catch(() => null);
    if (!s) return { ok: false, message: 'The file could not be found.' };
    shell.showItemInFolder(abs);
    return { ok: true };
  });

  handle(state, IPC_CHANNELS.filesOpenExternal, z.tuple([RelPath]), async (rel): Promise<ActionResult> => {
    const root = requireRoot();
    const abs = await resolveInsideRoot(root, rel);
    if (isBlockedExtension(abs)) {
      return { ok: false, message: `.${effectiveExtension(abs)} files can run code, so FrameLytix does not open them. Use Reveal in File Explorer instead.` };
    }
    const s = await stat(abs).catch(() => null);
    if (!s || !s.isFile()) return { ok: false, message: 'The file could not be found.' };
    // shell.openPath hands the file to its associated application; no command line is built.
    // (FrameLytix never executes files itself — e.g. MATLAB .m files open in the editor.)
    const error = await shell.openPath(abs);
    if (error) {
      const ext = effectiveExtension(abs);
      const label = ext ? `.${ext}` : 'these';
      return {
        ok: false,
        message: `No application is associated with ${label} files on this computer. Install a compatible application${
          ['dwg', 'dxf'].includes(ext) ? ' (e.g. AutoCAD, DWG TrueView or FreeCAD)' : ''
        } or use Reveal in File Explorer.`
      };
    }
    return { ok: true };
  });
}
