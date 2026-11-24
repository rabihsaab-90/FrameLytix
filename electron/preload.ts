/**
 * Sandboxed preload (bundled as CJS). Exposes exactly `FramelytixApi` as window.framelytix.
 * Each method is a thin ipcRenderer.invoke; listeners never receive the raw IPC event.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS as C, IPC_EVENTS as E, type FramelytixApi, type MenuCommand } from '../shared/types/ipc';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const invoke = ipcRenderer.invoke.bind(ipcRenderer);

const api: FramelytixApi = {
  app: {
    getInfo: () => invoke(C.appGetInfo),
    setDirty: (dirty) => invoke(C.appSetDirty, dirty),
    closeNow: () => invoke(C.appCloseNow),
    getThirdPartyNotices: () => invoke(C.appGetNotices),
    onCloseRequested: (listener) => subscribe<void>(E.closeRequested, () => listener()),
    onMenuCommand: (listener) => subscribe<MenuCommand>(E.menuCommand, (command) => listener(command))
  },
  settings: {
    get: () => invoke(C.settingsGet),
    update: (patch) => invoke(C.settingsUpdate, patch),
    reset: () => invoke(C.settingsReset)
  },
  recent: {
    list: () => invoke(C.recentList),
    remove: (path) => invoke(C.recentRemove, path)
  },
  dialog: {
    chooseDirectory: (title) => invoke(C.dialogChooseDirectory, title)
  },
  project: {
    checkTarget: (parentDirectory, folderName) => invoke(C.projectCheckTarget, parentDirectory, folderName),
    create: (input) => invoke(C.projectCreate, input),
    openDialog: () => invoke(C.projectOpenDialog),
    openRecent: (path) => invoke(C.projectOpenRecent, path),
    save: (manifest, options) => invoke(C.projectSave, manifest, options),
    reload: () => invoke(C.projectReload),
    close: () => invoke(C.projectClose),
    listBackups: () => invoke(C.projectListBackups),
    recover: (projectPath, backupFileName) => invoke(C.projectRecover, projectPath, backupFileName),
    saveAsNew: (manifest) => invoke(C.projectSaveAsNew, manifest),
    writeGitignore: () => invoke(C.projectWriteGitignore)
  },
  demo: {
    open: () => invoke(C.demoOpen),
    reset: () => invoke(C.demoReset)
  },
  files: {
    tree: () => invoke(C.filesTree),
    statMany: (relativePaths) => invoke(C.filesStatMany, relativePaths),
    pickImport: (destRelativeDir) => invoke(C.filesPickImport, destRelativeDir),
    prepareDroppedImport: (files, destRelativeDir) => {
      const paths = Array.from(files)
        .map((f) => {
          try {
            return webUtils.getPathForFile(f);
          } catch {
            return '';
          }
        })
        .filter((p) => p !== '');
      return invoke(C.filesPrepareDroppedImport, paths, destRelativeDir);
    },
    commitImport: (token, decisions) => invoke(C.filesCommitImport, token, decisions),
    pickRelink: () => invoke(C.filesPickRelink),
    createFolder: (parentRelativeDir, name) => invoke(C.filesCreateFolder, parentRelativeDir, name),
    reveal: (relativePath) => invoke(C.filesReveal, relativePath),
    openExternal: (relativePath) => invoke(C.filesOpenExternal, relativePath),
    onChanged: (listener) => subscribe(E.filesChanged, listener),
    onManifestChangedExternally: (listener) => subscribe<void>(E.manifestChangedExternally, () => listener())
  },
  export: {
    previewReport: (manifest, options) => invoke(C.exportPreviewReport, manifest, options),
    report: (manifest, format, options) => invoke(C.exportReport, manifest, format, options),
    csv: (content, suggestedFileName) => invoke(C.exportCsv, content, suggestedFileName),
    open: (filePath) => invoke(C.exportOpen, filePath),
    reveal: (filePath) => invoke(C.exportReveal, filePath)
  }
};

contextBridge.exposeInMainWorld('framelytix', api);
