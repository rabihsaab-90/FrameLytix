/**
 * Render report HTML to PDF in a hidden, sandboxed, JavaScript-disabled window.
 * The HTML is written to a temp file (data: URLs can be very large) that only this window's
 * webContents is allowed to load (see hardening.ts `fileAllowedWebContents`).
 */
import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { escapeHtml } from '../../shared/utilities/html';

export interface PdfExportOptions {
  html: string;
  outPath: string;
  title: string;
  tempDir: string;
  fileAllowedWebContents: Set<number>;
  timeoutMs?: number;
}

export async function exportPdf(opts: PdfExportOptions): Promise<void> {
  await mkdir(opts.tempDir, { recursive: true });
  const tempFile = path.join(opts.tempDir, `report-${randomUUID()}.html`);
  await writeFile(tempFile, opts.html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 816,
    height: 1056,
    webPreferences: {
      sandbox: true,
      javascript: false,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: false,
      webSecurity: true,
      spellcheck: false
    }
  });
  const id = win.webContents.id;
  opts.fileAllowedWebContents.add(id);
  try {
    await withTimeout(win.loadFile(tempFile), opts.timeoutMs ?? 60_000, 'The report took too long to render.');
    const footer =
      '<div style="font-size:8px;width:100%;text-align:center;color:#555;font-family:Arial">' +
      escapeHtml(opts.title.slice(0, 200)) +
      ' — Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>';
    const pdf = await win.webContents.printToPDF({
      pageSize: 'Letter',
      printBackground: true,
      // Inches (Electron's printToPDF has no marginType; explicit values = custom margins).
      margins: { top: 0.6, bottom: 0.7, left: 0.6, right: 0.6 },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footer,
      generateTaggedPDF: true
    });
    if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw new Error('The PDF renderer produced an invalid file.');
    await writeFile(opts.outPath, pdf);
    // Verify what landed on disk.
    const fh = await open(opts.outPath, 'r');
    try {
      const head = Buffer.alloc(4);
      await fh.read(head, 0, 4, 0);
      if (head.toString('latin1') !== '%PDF') throw new Error('The written PDF could not be verified.');
    } finally {
      await fh.close();
    }
  } finally {
    opts.fileAllowedWebContents.delete(id);
    if (!win.isDestroyed()) win.destroy();
    await unlink(tempFile).catch(() => undefined);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
}
