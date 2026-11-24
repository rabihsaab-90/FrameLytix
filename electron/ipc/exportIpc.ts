import { stat } from 'node:fs/promises';
import path from 'node:path';
import { app, dialog, shell } from 'electron';
import { z } from 'zod';
import { ProjectManifestSchema, ReportSectionKeySchema, type ProjectManifest } from '../../shared/schemas/project';
import { buildReportHtml } from '../../shared/report/buildReport';
import { IPC_CHANNELS, type ActionResult, type ExportResult } from '../../shared/types/ipc';
import { validateFileName } from '../../shared/utilities/paths';
import { PHASE_FOLDERS } from '../../src/templates/types';
import type { AppState } from '../appState';
import { collectReportImages, suggestReportFileName, writeCsv, writeHtmlReport } from '../services/exportService';
import { exportPdf } from '../windows/pdfExport';
import { AbsPath, handle, Str, UserFacingError } from './handle';

const ReportOptionsSchema = z.object({ sections: z.array(ReportSectionKeySchema).max(32) }).strict();
const MAX_CSV_CHARS = 50 * 1024 * 1024;

export function registerExportIpc(state: AppState): void {
  const win = () => state.mainWindow ?? undefined;

  async function images(manifest: ProjectManifest): Promise<{ images: Record<string, string>; missingAssetPaths: string[] }> {
    const root = state.rootPath;
    if (!root) return { images: {}, missingAssetPaths: manifest.assets.map((a) => a.relativePath) };
    return collectReportImages(root, manifest);
  }

  async function defaultExportDir(): Promise<string> {
    const root = state.rootPath;
    if (root && !state.session?.isDemo) {
      const dir = path.join(root, PHASE_FOLDERS[3]);
      const s = await stat(dir).catch(() => null);
      if (s?.isDirectory()) return dir;
      return root;
    }
    return app.getPath('documents');
  }

  async function askSavePath(title: string, defaultName: string, filter: Electron.FileFilter): Promise<string | null> {
    const w = win();
    const opts: Electron.SaveDialogOptions = {
      title,
      defaultPath: path.join(await defaultExportDir(), defaultName),
      filters: [filter],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    };
    const res = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return null;
    let p = res.filePath;
    const ext = filter.extensions[0] ?? '';
    if (ext && path.extname(p).toLowerCase() !== `.${ext}`) p += `.${ext}`;
    return p;
  }

  handle(state, IPC_CHANNELS.exportPreviewReport, z.tuple([ProjectManifestSchema, ReportOptionsSchema]), async (manifest, options) => {
    const img = await images(manifest);
    return buildReportHtml(manifest, { sections: options.sections, generatedAt: new Date().toISOString(), ...img, mode: 'preview' });
  });

  handle(
    state,
    IPC_CHANNELS.exportReport,
    z.tuple([ProjectManifestSchema, z.enum(['pdf', 'html']), ReportOptionsSchema]),
    async (manifest, format, options): Promise<ExportResult> => {
      const suggested = suggestReportFileName(manifest, format);
      const filter = format === 'pdf' ? { name: 'PDF Document', extensions: ['pdf'] } : { name: 'HTML Document', extensions: ['html'] };
      const target = await askSavePath(format === 'pdf' ? 'Export Report as PDF' : 'Export Report as HTML', suggested, filter);
      if (!target) return { ok: false, cancelled: true, message: 'Cancelled.' };
      const img = await images(manifest);
      const html = buildReportHtml(manifest, { sections: options.sections, generatedAt: new Date().toISOString(), ...img, mode: 'export' });
      try {
        if (format === 'html') {
          await writeHtmlReport(target, html);
        } else {
          await exportPdf({
            html,
            outPath: target,
            title: manifest.project.title,
            tempDir: state.exportTempDir,
            fileAllowedWebContents: state.fileAllowedWebContents
          });
        }
      } catch (err) {
        state.logger.error('export:report', err);
        return { ok: false, cancelled: false, message: 'The report could not be written. Check that the file is not open in another application and that the folder is writable.' };
      }
      state.exports.add(target);
      return { ok: true, filePath: target, fileName: path.basename(target) };
    }
  );

  handle(state, IPC_CHANNELS.exportCsv, z.tuple([z.string().max(MAX_CSV_CHARS), Str(255)]), async (content, suggestedFileName): Promise<ExportResult> => {
    let name = suggestedFileName.trim();
    if (!name.toLowerCase().endsWith('.csv')) name += '.csv';
    if (validateFileName(name)) name = 'FrameLytix-Export.csv';
    const target = await askSavePath('Export CSV', name, { name: 'CSV (Comma-separated values)', extensions: ['csv'] });
    if (!target) return { ok: false, cancelled: true, message: 'Cancelled.' };
    try {
      await writeCsv(target, content);
    } catch (err) {
      state.logger.error('export:csv', err);
      return { ok: false, cancelled: false, message: 'The CSV file could not be written. Check that it is not open in another application.' };
    }
    state.exports.add(target);
    return { ok: true, filePath: target, fileName: path.basename(target) };
  });

  handle(state, IPC_CHANNELS.exportOpen, z.tuple([AbsPath]), async (filePath): Promise<ActionResult> => {
    if (!state.exports.has(filePath)) throw new UserFacingError('Only files exported in this session can be opened from here.');
    const error = await shell.openPath(filePath);
    return error ? { ok: false, message: 'No application is associated with this file type on this computer.' } : { ok: true };
  });

  handle(state, IPC_CHANNELS.exportReveal, z.tuple([AbsPath]), async (filePath): Promise<ActionResult> => {
    if (!state.exports.has(filePath)) throw new UserFacingError('Only files exported in this session can be revealed from here.');
    shell.showItemInFolder(filePath);
    return { ok: true };
  });
}
