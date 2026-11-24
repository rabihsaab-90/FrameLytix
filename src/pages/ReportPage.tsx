import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, FileCode2, FileDown, FolderOpen, Table2 } from 'lucide-react';
import type { ProjectManifest, ReportSectionKey } from '@shared/schemas/project';
import { decisionMatrixCsv, requirementsCsv, risksCsv, traceabilityCsv } from '@shared/utilities/csv';
import { mandatoryRequirementsForArgument } from '@shared/utilities/decisionMatrix';
import { detectProjectIssues } from '@shared/utilities/completeness';
import { api } from '@/lib/api';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { navigate, notify } from '@/stores/uiStore';
import { formatDateTime } from '@/lib/labels';
import { Badge, Button, Callout, Checkbox, Code, PageHeader, Panel, Select, Spinner } from '@/components/common/ui';
import { REPORT_SECTION_KEYS, REPORT_SECTION_LABELS } from '@/components/review/reportSections';
import { exportCsvFile, reportExportOutcome, type LastExport } from '@/components/review/exportHelpers';

/** Remembered for the session so the "Last export" panel survives navigating away and back. */
let lastExportMemory: LastExport | null = null;

const snapshotOf = (m: ProjectManifest): ProjectManifest => JSON.parse(JSON.stringify(m)) as ProjectManifest;
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export default function ReportPage() {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const missingAssets = useProjectStore((s) => s.missingAssets);

  const sections = useMemo(() => REPORT_SECTION_KEYS.filter((k) => manifest.settings.reportSections.includes(k)), [manifest.settings.reportSections]);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState<'pdf' | 'html' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<LastExport | null>(lastExportMemory);
  const [matrixArg, setMatrixArg] = useState('');
  const requestSeq = useRef(0);

  const issues = useMemo(() => detectProjectIssues(manifest, new Set(missingAssets)), [manifest, missingAssets]);
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  const matrixArgs = manifest.arguments.filter((a) => !a.archived);

  const setSections = (next: ReportSectionKey[]) => update((m) => void (m.settings.reportSections = REPORT_SECTION_KEYS.filter((k) => next.includes(k))));
  const toggle = (k: ReportSectionKey, on: boolean) => setSections(on ? [...sections, k] : sections.filter((x) => x !== k));

  // Debounced preview of a snapshot of the manifest. Stale responses are ignored.
  useEffect(() => {
    if (sections.length === 0) {
      setHtml(null);
      setPreviewError(null);
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      let call: Promise<string>;
      try {
        call = api().export.previewReport(snapshotOf(manifest), { sections });
      } catch (err) {
        call = Promise.reject(err);
      }
      call
        .then((out) => {
          if (seq !== requestSeq.current) return;
          setHtml(out);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          if (seq !== requestSeq.current) return;
          setPreviewError(errorText(err));
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [manifest, sections]);

  const exportReport = async (format: 'pdf' | 'html') => {
    setExporting(format);
    setExportError(null);
    try {
      const result = await api().export.report(snapshotOf(manifest), format, { sections });
      const done = reportExportOutcome(result, format, `${sections.length} sections`, 'Open report');
      if (done) {
        lastExportMemory = done;
        setLastExport(done);
      } else if (!result.ok && !result.cancelled) {
        setExportError(result.message);
      }
    } catch (err) {
      setExportError(errorText(err));
    } finally {
      setExporting(null);
    }
  };

  const csv = async (content: string, name: string, description: string) => {
    const done = await exportCsvFile(content, name, description);
    if (done) {
      lastExportMemory = done;
      setLastExport(done);
    }
  };

  const actOnFile = (kind: 'open' | 'reveal', path: string) =>
    void api()
      .export[kind](path)
      .then((r) => !r.ok && notify({ tone: 'error', message: r.message ?? 'The file could not be opened.' }))
      .catch((e: unknown) => notify({ tone: 'error', message: errorText(e) }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Report Preview & Export"
        subtitle="Choose the sections to include, check the preview, then export."
        actions={
          <>
            <Button variant="primary" icon={FileDown} loading={exporting === 'pdf'} disabled={exporting !== null || sections.length === 0} onClick={() => void exportReport('pdf')}>
              Export PDF
            </Button>
            <Button icon={FileCode2} loading={exporting === 'html'} disabled={exporting !== null || sections.length === 0} onClick={() => void exportReport('html')}>
              Export HTML
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 w-full flex-col gap-4 overflow-auto border-b border-gunmetal p-4 lg:w-[340px] lg:shrink-0 lg:border-r lg:border-b-0">
          {exportError ? (
            <Callout tone="crimson" icon={AlertTriangle} title="Export failed">
              <span className="selectable break-words">{exportError}</span>
            </Callout>
          ) : null}

          <Panel
            title="Report sections"
            actions={
              <>
                <Button size="xs" variant="ghost" onClick={() => setSections(REPORT_SECTION_KEYS)}>
                  Select all
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setSections([])}>
                  None
                </Button>
              </>
            }
            bodyClassName="flex flex-col gap-1.5"
          >
            {REPORT_SECTION_KEYS.map((k) => (
              <Checkbox key={k} checked={sections.includes(k)} onChange={(on) => toggle(k, on)} label={REPORT_SECTION_LABELS[k]} />
            ))}
            <p className="mt-1 text-2xs text-dim">
              {sections.length} of {REPORT_SECTION_KEYS.length} sections selected. Your choice is saved with the project.
            </p>
          </Panel>

          <Panel title="Outstanding items">
            <p className="text-xs text-silver">
              <span className="font-mono text-white">{issues.length}</span> documentation issue{issues.length === 1 ? '' : 's'} detected (<span className="font-mono text-white">{counts.critical}</span> critical,{' '}
              <span className="font-mono text-white">{counts.warning}</span> warnings, <span className="font-mono text-white">{counts.info}</span> info).
            </p>
            <p className="mt-1.5 text-2xs text-dim">Incomplete projects can still be exported. Outstanding items are listed in the report when the “Outstanding items” section is included.</p>
            <Button size="xs" variant="ghost" className="mt-1.5 -ml-1" onClick={() => navigate({ view: 'review' })}>
              Open design review
            </Button>
          </Panel>

          <Panel title="CSV exports" bodyClassName="flex flex-col gap-2">
            <Button icon={Table2} onClick={() => void csv(requirementsCsv(manifest), 'requirements.csv', 'Requirements')}>
              Requirements
            </Button>
            <Button icon={Table2} onClick={() => void csv(traceabilityCsv(manifest, new Set(missingAssets)), 'traceability-matrix.csv', 'Traceability matrix')}>
              Traceability matrix
            </Button>
            <Button icon={Table2} onClick={() => void csv(risksCsv(manifest), 'risk-register.csv', 'Risk register')}>
              Risk register
            </Button>
            <div className="flex items-center gap-1.5">
              <Select value={matrixArg} onChange={(e) => setMatrixArg(e.target.value)} aria-label="Argument for the decision matrix CSV" disabled={matrixArgs.length === 0}>
                <option value="">{matrixArgs.length === 0 ? 'No arguments yet' : 'Decision matrix of…'}</option>
                {matrixArgs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.title}
                  </option>
                ))}
              </Select>
              <Button
                icon={Table2}
                disabled={!matrixArg}
                onClick={() => {
                  const arg = matrixArgs.find((a) => a.id === matrixArg);
                  if (arg) void csv(decisionMatrixCsv(arg, mandatoryRequirementsForArgument(manifest, arg.id)), `decision-matrix-${arg.code}.csv`, `Decision matrix ${arg.code}`);
                }}
              >
                CSV
              </Button>
            </div>
          </Panel>

          <Panel title="Last export">
            {lastExport ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Badge tone="emerald">{lastExport.format.toUpperCase()}</Badge>
                  <span className="text-2xs text-dim">{formatDateTime(lastExport.at)}</span>
                </div>
                <Code className="block break-all text-white">{lastExport.filePath}</Code>
                <div className="flex gap-1.5">
                  <Button size="xs" icon={ExternalLink} onClick={() => actOnFile('open', lastExport.filePath)}>
                    Open report
                  </Button>
                  <Button size="xs" icon={FolderOpen} onClick={() => actOnFile('reveal', lastExport.filePath)}>
                    Reveal file
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-dim">Nothing exported in this session yet.</p>
            )}
            <Button size="xs" variant="ghost" className="mt-2 -ml-1" onClick={() => navigate({ view: 'exports' })}>
              View export history
            </Button>
          </Panel>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-obsidian">
          <div className="flex items-center gap-3 border-b border-gunmetal px-4 py-2">
            <span className="text-xs font-medium text-silver">Preview</span>
            {loading ? <Spinner label="Updating preview…" size={13} /> : null}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-silver">
              Zoom
              <Select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Preview zoom" className="h-7 w-24 text-xs">
                <option value={0.75}>75%</option>
                <option value={1}>100%</option>
                <option value={1.25}>125%</option>
                <option value={1.5}>150%</option>
              </Select>
            </label>
          </div>
          {previewError ? (
            <div className="p-4">
              <Callout tone="crimson" icon={AlertTriangle} title="The preview could not be generated">
                <span className="selectable break-words">{previewError}</span>
              </Callout>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {sections.length === 0 ? (
              <p className="py-10 text-center text-xs text-silver">Select at least one section to preview and export the report.</p>
            ) : html === null ? (
              loading ? null : !previewError ? <p className="py-10 text-center text-xs text-silver">No preview yet.</p> : null
            ) : (
              <div style={{ width: `${zoom * 100}%`, minWidth: 0 }} className="mx-auto h-full min-h-[600px] max-w-none">
                <iframe sandbox="" srcDoc={html} title="Report preview" className="h-full w-full rounded-sm border-0 bg-white shadow-lg shadow-black/50" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
