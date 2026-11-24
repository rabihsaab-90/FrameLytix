import type { ExportRecord } from '@shared/schemas/project';
import type { ExportResult } from '@shared/types/ipc';
import { newId } from '@shared/utilities/ids';
import { api } from '@/lib/api';
import { useProjectStore } from '@/stores/projectStore';
import { notify } from '@/stores/uiStore';

export interface LastExport {
  filePath: string;
  fileName: string;
  format: ExportRecord['format'];
  at: string;
}

/** Appends an export record to the portable project (file paths are intentionally not stored). */
export function recordExport(format: ExportRecord['format'], fileName: string, description: string): void {
  useProjectStore.getState().update((m) => {
    m.exportHistory.push({ id: newId(), format, fileName, description, exportedAt: new Date().toISOString() });
  });
}

/** Reports the outcome of an export honestly: success only when `ok`, the real message otherwise. */
export function reportExportOutcome(result: ExportResult, format: ExportRecord['format'], description: string, openLabel = 'Open file'): LastExport | null {
  if (result.ok) {
    recordExport(format, result.fileName, description);
    notify({
      tone: 'success',
      message: `Exported ${result.fileName}`,
      detail: result.filePath,
      actions: [
        { label: openLabel, run: () => void api().export.open(result.filePath).then((r) => !r.ok && notify({ tone: 'error', message: r.message ?? 'Could not open the file.' })) },
        { label: 'Reveal file', run: () => void api().export.reveal(result.filePath).then((r) => !r.ok && notify({ tone: 'error', message: r.message ?? 'Could not reveal the file.' })) }
      ]
    });
    return { filePath: result.filePath, fileName: result.fileName, format, at: new Date().toISOString() };
  }
  if (!result.cancelled) notify({ tone: 'error', message: 'Export failed', detail: result.message });
  return null;
}

/** Saves CSV content through the main process save dialog and records it in the export history. */
export async function exportCsvFile(content: string, suggestedName: string, description: string): Promise<LastExport | null> {
  try {
    const result = await api().export.csv(content, suggestedName);
    return reportExportOutcome(result, 'csv', description);
  } catch (err) {
    notify({ tone: 'error', message: 'Export failed', detail: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
