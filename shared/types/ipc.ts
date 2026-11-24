/**
 * Typed IPC contract between the renderer and the Electron main process.
 *
 * The preload script exposes exactly `FramelytixApi` as `window.framelytix`.
 * Every invoke channel is listed in `IPC_CHANNELS`; the main process validates the
 * sender frame and every argument (Zod) before acting. The renderer never receives
 * raw Node.js, filesystem or ipcRenderer access.
 *
 * Security model: the main process owns the "current project root". Renderer calls
 * that touch project files pass project-RELATIVE paths only; the main process
 * resolves and canonicalises them inside the authorised root.
 */
import type { ProjectManifest, ReportSectionKey, UnitSystem } from '../schemas/project';
import type { AppSettings, AppSettingsPatch, RecentProject } from '../schemas/settings';

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  appSetDirty: 'app:set-dirty',
  appCloseNow: 'app:close-now',
  appGetNotices: 'app:get-notices',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',
  recentList: 'recent:list',
  recentRemove: 'recent:remove',
  dialogChooseDirectory: 'dialog:choose-directory',
  projectCreate: 'project:create',
  projectCheckTarget: 'project:check-target',
  projectOpenDialog: 'project:open-dialog',
  projectOpenRecent: 'project:open-recent',
  projectSave: 'project:save',
  projectReload: 'project:reload',
  projectClose: 'project:close',
  projectListBackups: 'project:list-backups',
  projectRecover: 'project:recover',
  projectSaveAsNew: 'project:save-as-new',
  projectWriteGitignore: 'project:write-gitignore',
  demoOpen: 'demo:open',
  demoReset: 'demo:reset',
  filesTree: 'files:tree',
  filesStatMany: 'files:stat-many',
  filesPickImport: 'files:pick-import',
  filesPrepareDroppedImport: 'files:prepare-dropped-import',
  filesCommitImport: 'files:commit-import',
  filesPickRelink: 'files:pick-relink',
  filesCreateFolder: 'files:create-folder',
  filesReveal: 'files:reveal',
  filesOpenExternal: 'files:open-external',
  exportPreviewReport: 'export:preview-report',
  exportReport: 'export:report',
  exportCsv: 'export:csv',
  exportOpen: 'export:open',
  exportReveal: 'export:reveal'
} as const;

/** Main → renderer push events. */
export const IPC_EVENTS = {
  filesChanged: 'event:files-changed',
  manifestChangedExternally: 'event:manifest-changed-externally',
  closeRequested: 'event:close-requested',
  menuCommand: 'event:menu-command'
} as const;

/** Commands sent by the application menu. The renderer owns the keyboard shortcuts. */
export type MenuCommand = 'new' | 'open' | 'save' | 'export' | 'about';

/** Custom protocol used to preview project assets. Serves files inside the current project only. */
export const ASSET_PROTOCOL = 'framelytix-asset';

export function assetUrl(relativePath: string, cacheBust?: string | number): string {
  const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${ASSET_PROTOCOL}://project/${encoded}${cacheBust !== undefined ? `?v=${encodeURIComponent(String(cacheBust))}` : ''}`;
}

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface AppInfo {
  version: string;
  platform: string;
  isPackaged: boolean;
  /** Suggested default parent folder for new projects (e.g. Documents/FrameLytix Projects). */
  defaultProjectsDir: string;
}

export interface ProjectSessionInfo {
  /** Absolute path of the project folder — for display only; never sent back as an authority. */
  rootPath: string;
  folderName: string;
  isDemo: boolean;
}

export interface BackupInfo {
  fileName: string;
  createdAt: string;
  sizeBytes: number;
  /** True when the backup parses as a valid manifest. */
  valid: boolean;
  projectTitle: string;
}

export type OpenErrorCode =
  | 'cancelled'
  | 'not-found'
  | 'not-a-project'
  | 'invalid'
  | 'future-version'
  | 'locked'
  | 'not-authorised'
  | 'error';

export type OpenResult =
  | {
      ok: true;
      session: ProjectSessionInfo;
      manifest: ProjectManifest;
      /** Recoverable warnings, e.g. missing asset files or a stale lock that was cleared. */
      warnings: string[];
    }
  | {
      ok: false;
      code: OpenErrorCode;
      message: string;
      /** Present when the manifest is damaged and backups exist that could be restored. */
      recovery?: { projectPath: string; backups: BackupInfo[] };
    };

export interface CreateProjectInput {
  /** Must be a folder returned by chooseDirectory or the default projects folder. */
  parentDirectory: string;
  folderName: string;
  templateId: string;
  title: string;
  description: string;
  identifier: string;
  author: string;
  organization: string;
  unitSystem: UnitSystem;
  /** For the "User-defined Project Type" archetype. */
  customArchetypeName?: string;
  writeGitignore: boolean;
}

export interface TargetCheck {
  ok: boolean;
  /** Absolute path that would be created. */
  targetPath: string;
  message: string;
}

export type SaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; code: 'conflict' | 'invalid' | 'no-project' | 'error'; message: string };

export interface SaveOptions {
  /** Manual saves create a backup; autosaves create one at most every few minutes. */
  manual: boolean;
  /** Overwrite after an external-modification conflict (the external version is backed up first). */
  force?: boolean;
}

export interface FileNode {
  name: string;
  /** Project-relative POSIX path ('' for the root). */
  relativePath: string;
  kind: 'file' | 'directory';
  sizeBytes?: number;
  modifiedAt?: string;
  extension?: string;
  children?: FileNode[];
}

export interface FileStat {
  exists: boolean;
  isFile: boolean;
  sizeBytes: number;
  modifiedAt: string | null;
}

export interface ImportPlanItem {
  index: number;
  sourceName: string;
  /** Absolute source path, display only. */
  sourcePath: string;
  sizeBytes: number;
  /** Proposed project-relative destination. */
  targetRelativePath: string;
  /** A file already exists at the destination. */
  collision: boolean;
  /** The existing file has byte-identical content. */
  identical: boolean;
  /** Blocked types (executables, scripts that could auto-run) are rejected. */
  rejected: boolean;
  rejectReason?: string;
}

export interface ImportPlan {
  token: string;
  destRelativeDir: string;
  items: ImportPlanItem[];
}

export type ImportDecision = 'keep-both' | 'replace' | 'skip';

export interface ImportedFile {
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface ImportResult {
  imported: ImportedFile[];
  skipped: string[];
  errors: { sourceName: string; message: string }[];
}

export interface ReportOptions {
  sections: ReportSectionKey[];
}

export type ExportResult =
  | { ok: true; filePath: string; fileName: string }
  | { ok: false; cancelled: boolean; message: string };

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export interface FilesChangedEvent {
  /** Relative paths reported by the watcher (may be truncated). */
  paths: string[];
}

// ---------------------------------------------------------------------------
// The API exposed on window.framelytix
// ---------------------------------------------------------------------------

export interface FramelytixApi {
  app: {
    getInfo(): Promise<AppInfo>;
    setDirty(dirty: boolean): Promise<void>;
    /** Close the window after the renderer has handled unsaved changes. */
    closeNow(): Promise<void>;
    getThirdPartyNotices(): Promise<string>;
    onCloseRequested(listener: () => void): () => void;
    onMenuCommand(listener: (command: MenuCommand) => void): () => void;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: AppSettingsPatch): Promise<AppSettings>;
    reset(): Promise<AppSettings>;
  };
  recent: {
    list(): Promise<(RecentProject & { available: boolean })[]>;
    remove(path: string): Promise<void>;
  };
  dialog: {
    chooseDirectory(title: string): Promise<string | null>;
  };
  project: {
    checkTarget(parentDirectory: string, folderName: string): Promise<TargetCheck>;
    create(input: CreateProjectInput): Promise<OpenResult>;
    openDialog(): Promise<OpenResult>;
    openRecent(path: string): Promise<OpenResult>;
    save(manifest: ProjectManifest, options: SaveOptions): Promise<SaveResult>;
    reload(): Promise<OpenResult>;
    close(): Promise<void>;
    listBackups(): Promise<BackupInfo[]>;
    /** Restore a backup for the current project or for the project that just failed to open. */
    recover(projectPath: string, backupFileName: string): Promise<OpenResult>;
    /** Copy the current (typically demo) project to a new user-selected folder with a new UUID. */
    saveAsNew(manifest: ProjectManifest): Promise<OpenResult>;
    writeGitignore(): Promise<ActionResult>;
  };
  demo: {
    open(): Promise<OpenResult>;
    reset(): Promise<OpenResult>;
  };
  files: {
    tree(): Promise<FileNode | null>;
    statMany(relativePaths: string[]): Promise<Record<string, FileStat>>;
    pickImport(destRelativeDir: string): Promise<ImportPlan | null>;
    /** Files dropped onto the window. Paths come from webUtils.getPathForFile in the preload. */
    prepareDroppedImport(files: File[], destRelativeDir: string): Promise<ImportPlan | null>;
    commitImport(token: string, decisions: Record<number, ImportDecision>): Promise<ImportResult>;
    /** Pick an existing file inside the project to relink a missing asset reference. */
    pickRelink(): Promise<string | null>;
    createFolder(parentRelativeDir: string, name: string): Promise<{ ok: true; relativePath: string } | { ok: false; message: string }>;
    reveal(relativePath: string): Promise<ActionResult>;
    openExternal(relativePath: string): Promise<ActionResult>;
    onChanged(listener: (event: FilesChangedEvent) => void): () => void;
    onManifestChangedExternally(listener: () => void): () => void;
  };
  export: {
    previewReport(manifest: ProjectManifest, options: ReportOptions): Promise<string>;
    report(manifest: ProjectManifest, format: 'pdf' | 'html', options: ReportOptions): Promise<ExportResult>;
    csv(content: string, suggestedFileName: string): Promise<ExportResult>;
    open(filePath: string): Promise<ActionResult>;
    reveal(filePath: string): Promise<ActionResult>;
  };
}
