import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { dialog } from 'electron';
import { z } from 'zod';
import { ProjectManifestSchema, UnitSystemSchema } from '../../shared/schemas/project';
import { IPC_CHANNELS, type OpenResult, type SaveResult, type TargetCheck } from '../../shared/types/ipc';
import { newId } from '../../shared/utilities/ids';
import { BRANDING } from '../../src/config/branding';
import { getDiscipline, getTemplate } from '../../src/templates/templates';
import type { AppState } from '../appState';
import { samePath } from '../security/paths';
import { DEMO_FOLDER_NAME } from '../services/demoService';
import { listBackups } from '../services/recoveryService';
import { AbsPath, handle, Str, UserFacingError } from './handle';

const CreateProjectInputSchema = z
  .object({
    parentDirectory: AbsPath,
    folderName: Str(255),
    templateId: Str(80),
    title: z.string().min(1).max(200),
    description: Str(50_000),
    identifier: Str(40),
    author: Str(300),
    organization: Str(300),
    unitSystem: UnitSystemSchema,
    customArchetypeName: Str(300).optional(),
    writeGitignore: z.boolean()
  })
  .strict();

const SaveOptionsSchema = z.object({ manual: z.boolean(), force: z.boolean().optional() }).strict();

function notAuthorised(message: string): OpenResult {
  return { ok: false, code: 'not-authorised', message };
}

export function registerProjectIpc(state: AppState): void {
  const win = () => state.mainWindow ?? undefined;

  async function isAuthorisedParent(parent: string): Promise<boolean> {
    if (!path.isAbsolute(parent)) return false;
    if (state.isGrantedDirectory(parent)) return true;
    if (samePath(parent, state.defaultProjectsDir)) {
      await mkdir(state.defaultProjectsDir, { recursive: true });
      return true;
    }
    const configured = (await state.settings.get()).defaultProjectLocation;
    return configured !== '' && samePath(configured, parent);
  }

  handle(state, IPC_CHANNELS.dialogChooseDirectory, z.tuple([Str(200)]), async (title) => {
    const w = win();
    const opts: Electron.OpenDialogOptions = { title: title || 'Choose a Folder', properties: ['openDirectory', 'createDirectory'] };
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    const picked = res.canceled ? undefined : res.filePaths[0];
    if (!picked) return null;
    state.grantDirectory(picked);
    return picked;
  });

  handle(state, IPC_CHANNELS.projectCheckTarget, z.tuple([AbsPath, Str(300)]), async (parent, folderName): Promise<TargetCheck> => {
    if (!(await isAuthorisedParent(parent))) {
      return { ok: false, targetPath: path.join(parent, folderName), message: 'Choose the parent folder with the folder picker.' };
    }
    return state.projects.checkTarget(parent, folderName);
  });

  handle(state, IPC_CHANNELS.projectCreate, z.tuple([CreateProjectInputSchema]), async (input): Promise<OpenResult> => {
    if (!(await isAuthorisedParent(input.parentDirectory))) return notAuthorised('Choose the parent folder with the folder picker.');
    const template = getTemplate(input.templateId);
    if (!template) return { ok: false, code: 'error', message: 'The selected project template is not available.' };
    const result = await state.projects.createProject(input, template, {
      now: new Date().toISOString(),
      newId,
      appVersion: BRANDING.version,
      disciplineLabel: getDiscipline(template.discipline)?.name ?? template.discipline
    });
    return state.activate(result);
  });

  handle(state, IPC_CHANNELS.projectOpenDialog, z.tuple([]), async (): Promise<OpenResult> => {
    const w = win();
    const opts: Electron.OpenDialogOptions = {
      title: 'Open FrameLytix Project',
      buttonLabel: 'Open Project',
      properties: process.platform === 'darwin' ? ['openDirectory', 'openFile'] : ['openDirectory'],
      filters: process.platform === 'darwin' ? [{ name: 'FrameLytix Project', extensions: ['json'] }] : undefined
    };
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    const picked = res.canceled ? undefined : res.filePaths[0];
    if (!picked) return { ok: false, code: 'cancelled', message: 'Cancelled.' };
    return state.activate(await state.projects.openProject(picked), picked);
  });

  handle(state, IPC_CHANNELS.projectOpenRecent, z.tuple([AbsPath]), async (p): Promise<OpenResult> => {
    const entry = await state.settings.findRecent(p);
    if (!entry) return notAuthorised('That project is not in the recent projects list.');
    return state.activate(await state.projects.openProject(entry.path), entry.path);
  });

  handle(state, IPC_CHANNELS.projectSave, z.tuple([z.unknown(), SaveOptionsSchema]), async (raw, options): Promise<SaveResult> => {
    const session = state.session;
    if (!session || session.closed) return { ok: false, code: 'no-project', message: 'No project is open.' };
    const parsed = ProjectManifestSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, code: 'invalid', message: `The project data is not valid and was not saved. ${first ? `${first.path.join('.')}: ${first.message}` : ''}` };
    }
    return state.projects.saveManifest(session, parsed.data, options);
  });

  handle(state, IPC_CHANNELS.projectReload, z.tuple([]), async (): Promise<OpenResult> => {
    const session = state.session;
    if (!session) return { ok: false, code: 'not-found', message: 'No project is open.' };
    const result = await state.projects.reload(session);
    if (!result.ok) return result;
    return state.activate(result);
  });

  handle(state, IPC_CHANNELS.projectClose, z.tuple([]), async () => {
    await state.closeSession();
    state.dirty = false;
  });

  handle(state, IPC_CHANNELS.projectListBackups, z.tuple([]), async () => {
    const root = state.rootPath;
    if (!root) return [];
    return listBackups(root);
  });

  handle(state, IPC_CHANNELS.projectRecover, z.tuple([AbsPath, Str(255)]), async (projectPath, backupFileName): Promise<OpenResult> => {
    const current = state.session;
    const isCurrent = !!current && samePath(current.rootPath, projectPath);
    const isFailed = !!state.lastFailedOpenPath && samePath(state.lastFailedOpenPath, projectPath);
    if (!isCurrent && !isFailed) return notAuthorised('Backups can only be restored for the current project.');
    const wasDemo = isCurrent && current.isDemo;
    if (isCurrent) {
      // Close without disposing a demo copy: the recovery happens in that same folder.
      state.stopWatcher();
      await state.projects.closeSession(current);
      state.session = null;
    }
    const result = await state.projects.recover(projectPath, backupFileName, { isDemo: wasDemo });
    if (!result.ok && isCurrent) {
      // Restore the previous session so the user is not left without a project.
      const reopened = await state.projects.openProject(projectPath, { isDemo: wasDemo });
      if (reopened.ok) await state.activate(reopened);
      return result;
    }
    return state.activate(result, projectPath);
  });

  handle(state, IPC_CHANNELS.projectSaveAsNew, z.tuple([ProjectManifestSchema]), async (manifest): Promise<OpenResult> => {
    const session = state.session;
    if (!session || session.closed) return { ok: false, code: 'not-found', message: 'No project is open.' };
    if (manifest.project.id !== session.projectId) throw new UserFacingError('The data belongs to a different project.');
    const w = win();
    const defaultName = session.isDemo ? DEMO_FOLDER_NAME : `${session.folderName}-Copy`;
    await mkdir(state.defaultProjectsDir, { recursive: true }).catch(() => undefined);
    const opts: Electron.SaveDialogOptions = {
      title: 'Save as New Project',
      buttonLabel: 'Create Project',
      defaultPath: path.join(state.defaultProjectsDir, defaultName),
      properties: ['createDirectory', 'showOverwriteConfirmation']
    };
    const res = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return { ok: false, code: 'cancelled', message: 'Cancelled.' };
    state.stopWatcher();
    const result = await state.demo.saveAsNew(session, manifest, res.filePath);
    if (!result.ok) {
      if (!session.closed && state.session === session) state.resumeWatcher();
      return result;
    }
    return state.activate(result);
  });

  handle(state, IPC_CHANNELS.projectWriteGitignore, z.tuple([]), async () => {
    const root = state.rootPath;
    if (!root) return { ok: false, message: 'No project is open.' };
    return state.projects.writeGitignore(root);
  });

  handle(state, IPC_CHANNELS.demoOpen, z.tuple([]), async (): Promise<OpenResult> => state.activate(await state.demo.openDemo()));

  handle(state, IPC_CHANNELS.demoReset, z.tuple([]), async (): Promise<OpenResult> => {
    const s = state.session;
    if (s?.isDemo) await state.closeSession(); // disposes the current demo copy
    return state.activate(await state.demo.resetDemo());
  });
}
