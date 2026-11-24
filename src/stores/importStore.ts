import { create } from 'zustand';

/** Requests to start the file-import workflow (handled by ImportDialogHost). */
interface ImportState {
  request: { destRelativeDir: string; droppedFiles?: File[]; nonce: number } | null;
  requestImport(destRelativeDir: string, droppedFiles?: File[]): void;
  clear(): void;
}

let nonce = 0;
export const useImportStore = create<ImportState>()((set) => ({
  request: null,
  requestImport: (destRelativeDir, droppedFiles) => set({ request: { destRelativeDir, droppedFiles, nonce: ++nonce } }),
  clear: () => set({ request: null })
}));
