import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, FilePlus2, FolderSearch, Link2Off, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { FileStat } from '@shared/types/ipc';
import { assetKind, extensionOf, fileNameOf } from '@shared/utilities/paths';
import { api } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/labels';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { navigate, notify } from '@/stores/uiStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Badge, Button, Callout, Code, Field, IconButton, Select, Spinner, TextArea, TextInput } from '@/components/common/ui';
import { LinkManager } from '@/components/traceability/LinkManager';
import ImageViewer from '@/components/viewers/ImageViewer';
import TextPreview from '@/components/viewers/TextPreview';
import { NoPreview } from '@/components/viewers/NoPreview';
import { upsertAssetForFile } from '@/components/viewers/assetRecords';

const PdfViewer = lazy(() => import('@/components/viewers/PdfViewer'));
const StlViewer = lazy(() => import('@/components/viewers/StlViewer'));

const MODEL_UNITS: { value: string; label: string }[] = [
  { value: '', label: 'Model units (not declared)' },
  { value: 'mm', label: 'Millimetres (mm)' },
  { value: 'cm', label: 'Centimetres (cm)' },
  { value: 'm', label: 'Metres (m)' },
  { value: 'in', label: 'Inches (in)' },
  { value: 'ft', label: 'Feet (ft)' }
];

const NATIVE_CAD = new Set(['dwg', 'dxf', 'step', 'stp', 'iges', 'igs', 'sldprt', 'sldasm']);

function Loading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export default function FilePage({ path }: { path: string }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const fileEpoch = useProjectStore((s) => s.fileEpoch);
  const refreshFiles = useProjectStore((s) => s.refreshFiles);
  const [stat, setStat] = useState<FileStat | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [openError, setOpenError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const asset = manifest.assets.find((a) => a.relativePath === path);
  const ext = extensionOf(path);
  const kind = assetKind(ext);
  const name = fileNameOf(path);

  useEffect(() => {
    let cancelled = false;
    setStat(null);
    setOpenError(null);
    setActionError(null);
    api()
      .files.statMany([path])
      .then(
        (res) => {
          if (!cancelled) setStat(res[path] ?? { exists: false, isFile: false, sizeBytes: 0, modifiedAt: null });
        },
        () => {
          if (!cancelled) setStat({ exists: false, isFile: false, sizeBytes: 0, modifiedAt: null });
        }
      );
    return () => {
      cancelled = true;
    };
  }, [path, fileEpoch]);

  const missing = stat !== null && (!stat.exists || !stat.isFile);
  const size = stat?.exists ? stat.sizeBytes : (asset?.sizeBytes ?? 0);
  const modified = stat?.exists ? stat.modifiedAt : (asset?.fileModifiedAt ?? null);

  const setField = useCallback(
    (field: 'drawingId' | 'title' | 'revision' | 'description' | 'modelUnit', value: string) => {
      if (!asset) return;
      update((d) => {
        const a = d.assets.find((x) => x.id === asset.id);
        if (a) a[field] = value;
      });
    },
    [asset, update]
  );

  const openExternal = async () => {
    setOpenError(null);
    try {
      const r = await api().files.openExternal(path);
      if (!r.ok) setOpenError(r.message ?? 'No application is associated with this file type on this computer.');
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'The file could not be opened.');
    }
  };

  const reveal = async () => {
    setActionError(null);
    try {
      const r = await api().files.reveal(path);
      if (!r.ok) setActionError(r.message ?? 'The file could not be shown in the file manager.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The file could not be shown in the file manager.');
    }
  };

  const addToRegister = () => {
    update((d) => {
      upsertAssetForFile(d, path, size, modified, new Date().toISOString());
    });
    notify({ tone: 'success', message: `${name} added to the technical asset register.` });
  };

  const relink = async () => {
    if (!asset) return;
    setActionError(null);
    try {
      const picked = await api().files.pickRelink();
      if (!picked) return;
      const stats = await api().files.statMany([picked]);
      const st = stats[picked];
      update((d) => {
        const a = d.assets.find((x) => x.id === asset.id);
        if (!a) return;
        a.relativePath = picked;
        if (st?.exists) {
          a.sizeBytes = st.sizeBytes;
          a.fileModifiedAt = st.modifiedAt;
        }
      });
      await refreshFiles();
      notify({ tone: 'success', message: `Register entry relinked to ${picked}.` });
      navigate({ view: 'file', path: picked });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The file could not be relinked.');
    }
  };

  const viewer = useMemo(() => {
    if (!stat || missing) return null;
    const epoch = fileEpoch;
    switch (kind) {
      case 'image':
        return (
          <ErrorBoundary area="image viewer" resetKey={path} compact>
            <ImageViewer path={path} epoch={epoch} />
          </ErrorBoundary>
        );
      case 'svg':
        return (
          <ErrorBoundary area="image viewer" resetKey={path} compact>
            <ImageViewer path={path} epoch={epoch} vector />
          </ErrorBoundary>
        );
      case 'pdf':
        return (
          <ErrorBoundary area="PDF viewer" resetKey={path} compact>
            <Suspense fallback={<Loading label="Loading PDF viewer…" />}>
              <PdfViewer path={path} epoch={epoch} />
            </Suspense>
          </ErrorBoundary>
        );
      case 'stl':
        return (
          <ErrorBoundary area="3D viewer" resetKey={path} compact>
            <Suspense fallback={<Loading label="Loading 3D viewer…" />}>
              <StlViewer path={path} epoch={epoch} sizeBytes={stat.sizeBytes} modelUnit={asset?.modelUnit ?? ''} />
            </Suspense>
          </ErrorBoundary>
        );
      case 'text':
      case 'matlab':
      case 'spreadsheet':
        if (kind === 'text' || ext === 'csv' || ext === 'm') {
          return (
            <ErrorBoundary area="text viewer" resetKey={path} compact>
              <TextPreview path={path} epoch={epoch} />
            </ErrorBoundary>
          );
        }
        return <NoPreview ext={ext} nativeCad={false} onOpenExternal={() => void openExternal()} openError={openError} />;
      default:
        return <NoPreview ext={ext} nativeCad={kind === 'native-cad' || NATIVE_CAD.has(ext)} onOpenExternal={() => void openExternal()} openError={openError} />;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stat, missing, kind, ext, path, fileEpoch, asset?.modelUnit, openError]);

  const isPlatformMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const revealLabel = isPlatformMac ? 'Reveal in Finder' : 'Reveal in File Explorer';
  const inlineOpenError = viewer && (kind === 'pdf' || kind === 'stl' || kind === 'image' || kind === 'svg' || kind === 'text') ? openError : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gunmetal px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold text-white" title={name}>
              {name}
            </h1>
            {ext ? <Badge>.{ext}</Badge> : null}
            {asset ? null : (
              <Badge tone="amber" title="This file has no record in the technical asset register">
                Not registered
              </Badge>
            )}
          </div>
          <Code className="block truncate" >{path}</Code>
        </div>
        <Button size="sm" variant="outline" icon={ExternalLink} onClick={() => void openExternal()} disabled={missing}>
          Open in native application
        </Button>
        <Button size="sm" variant="outline" icon={FolderSearch} onClick={() => void reveal()} disabled={missing}>
          {revealLabel}
        </Button>
        <IconButton
          icon={panelOpen ? PanelRightClose : PanelRightOpen}
          label={panelOpen ? 'Hide details panel' : 'Show details panel'}
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
        />
      </header>

      {missing ? (
        <div className="border-b border-gunmetal px-4 py-3">
          <Callout tone="crimson" icon={AlertTriangle} title="This file is missing from the project folder">
            <p>
              <span className="font-mono">{path}</span> could not be found. It may have been moved, renamed or deleted outside FrameLytix.
              {asset ? ' The register entry and its links are kept so nothing is lost.' : ''}
            </p>
            {asset ? (
              <div className="mt-2">
                <Button size="sm" variant="secondary" icon={Link2Off} onClick={() => void relink()}>
                  Relink…
                </Button>
              </div>
            ) : null}
          </Callout>
        </div>
      ) : null}
      {inlineOpenError ? (
        <div className="border-b border-gunmetal px-4 py-2">
          <Callout tone="amber" icon={AlertTriangle} title="The file could not be opened">
            {inlineOpenError}
          </Callout>
        </div>
      ) : null}
      {actionError ? (
        <div className="border-b border-gunmetal px-4 py-2">
          <Callout tone="crimson" icon={AlertTriangle}>
            {actionError}
          </Callout>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 bg-obsidian">{stat === null ? <Loading label="Checking file…" /> : missing ? null : viewer}</div>
        {panelOpen ? (
          <aside aria-label="File details" className="w-[300px] shrink-0 overflow-y-auto border-l border-gunmetal bg-carbon">
            <div className="flex flex-col gap-4 p-4">
              <section aria-label="File properties">
                <h2 className="mb-2 text-2xs font-semibold tracking-wide text-silver uppercase">File</h2>
                <dl className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1.5 text-xs">
                  <dt className="text-dim">Name</dt>
                  <dd className="break-all text-white selectable">{name}</dd>
                  <dt className="text-dim">Kind</dt>
                  <dd className="text-white">{kindLabel(kind, ext)}</dd>
                  <dt className="text-dim">Size</dt>
                  <dd className="font-mono text-white">{missing ? '—' : formatBytes(size)}</dd>
                  <dt className="text-dim">Modified</dt>
                  <dd className="text-white">{missing ? '—' : formatDateTime(modified)}</dd>
                  <dt className="text-dim">Path</dt>
                  <dd className="font-mono text-[11px] break-all text-silver selectable">{path}</dd>
                </dl>
              </section>

              {asset ? (
                <>
                  <section aria-label="Register entry" className="flex flex-col gap-3">
                    <h2 className="text-2xs font-semibold tracking-wide text-silver uppercase">Register entry</h2>
                    <Field label="Drawing ID">
                      {(id) => <TextInput id={id} mono value={asset.drawingId} maxLength={40} placeholder="e.g. DRW-001" onChange={(e) => setField('drawingId', e.target.value)} />}
                    </Field>
                    <Field label="Title">
                      {(id) => <TextInput id={id} value={asset.title} maxLength={300} onChange={(e) => setField('title', e.target.value)} />}
                    </Field>
                    <Field label="Revision">
                      {(id) => <TextInput id={id} mono value={asset.revision} maxLength={20} placeholder="e.g. REV-A" onChange={(e) => setField('revision', e.target.value)} />}
                    </Field>
                    <Field label="Description">
                      {(id) => <TextArea id={id} minRows={3} value={asset.description} onChange={(e) => setField('description', e.target.value)} />}
                    </Field>
                    {kind === 'stl' ? (
                      <Field
                        label="Model units"
                        hint="STL files do not store units. Declare the unit used when the model was exported so dimensions are labelled correctly. This does not rescale the model."
                      >
                        {(id, describedBy) => (
                          <Select id={id} aria-describedby={describedBy} value={asset.modelUnit} onChange={(e) => setField('modelUnit', e.target.value)}>
                            {MODEL_UNITS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    ) : null}
                  </section>
                  <section aria-label="Traceability links" className="flex flex-col gap-3 border-t border-gunmetal pt-3">
                    <h2 className="text-2xs font-semibold tracking-wide text-silver uppercase">Traceability</h2>
                    <LinkManager source={{ type: 'asset', id: asset.id }} targetType="requirement" emptyText="Not linked to any requirement." />
                    <LinkManager source={{ type: 'asset', id: asset.id }} targetType="argument" emptyText="Not linked to any engineering argument." />
                    <LinkManager source={{ type: 'asset', id: asset.id }} targetType="calculation" emptyText="Not linked to any calculation." />
                    <LinkManager source={{ type: 'asset', id: asset.id }} targetType="evidence" emptyText="Not linked to any evidence record." />
                  </section>
                </>
              ) : (
                <Callout tone="info" title="Not in the asset register">
                  <p>Add this file to the register to give it a drawing ID, revision and notes, and to link it to requirements, arguments, calculations and evidence.</p>
                  <div className="mt-2">
                    <Button size="sm" variant="primary" icon={FilePlus2} onClick={addToRegister} disabled={missing}>
                      Add to register
                    </Button>
                  </div>
                </Callout>
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function kindLabel(kind: ReturnType<typeof assetKind>, ext: string): string {
  const e = ext ? ` (.${ext})` : '';
  switch (kind) {
    case 'image':
      return `Image${e}`;
    case 'svg':
      return `Vector drawing${e}`;
    case 'pdf':
      return `PDF document${e}`;
    case 'stl':
      return `3D model, STL${e}`;
    case 'native-cad':
      return `Native CAD${e}`;
    case 'text':
      return `Text${e}`;
    case 'spreadsheet':
      return `Spreadsheet / data${e}`;
    case 'matlab':
      return `MATLAB${e}`;
    default:
      return `File${e}`;
  }
}
