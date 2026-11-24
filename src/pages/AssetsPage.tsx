import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FilePlus2, FileStack, Link2Off, Trash2, Upload } from 'lucide-react';
import type { FileNode } from '@shared/types/ipc';
import type { Asset } from '@shared/schemas/project';
import { assetKind, extensionOf, fileNameOf } from '@shared/utilities/paths';
import { linkedRefs } from '@shared/utilities/traceability';
import { api } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/labels';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { useImportStore } from '@/stores/importStore';
import { confirmDialog, navigate, notify } from '@/stores/uiStore';
import { Badge, Button, Code, EmptyState, PageBody, PageHeader, SearchInput, Select, cx, td, th } from '@/components/common/ui';
import { flattenFiles, removeAssetRecord, upsertAssetForFile } from '@/components/viewers/assetRecords';

const DEFAULT_FOLDER = '03-CAD-and-Technical-Drawings';

type KindFilter = 'all' | 'cad2d' | 'model3d' | 'document' | 'image' | 'other';

const KIND_LABEL: Record<KindFilter, string> = {
  all: 'All kinds',
  cad2d: '2D CAD',
  model3d: '3D models',
  document: 'Documents',
  image: 'Images',
  other: 'Other'
};

function kindGroup(path: string): Exclude<KindFilter, 'all'> {
  const ext = extensionOf(path);
  if (ext === 'dwg' || ext === 'dxf') return 'cad2d';
  const k = assetKind(ext);
  if (k === 'stl' || (k === 'native-cad' && ext !== 'dwg' && ext !== 'dxf')) return 'model3d';
  if (k === 'pdf' || k === 'text' || k === 'spreadsheet') return 'document';
  if (k === 'image' || k === 'svg') return 'image';
  return 'other';
}

const HIDDEN_NAMES = new Set(['framelytix-project.json']);

export default function AssetsPage() {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const fileTree = useProjectStore((s) => s.fileTree);
  const missingAssets = useProjectStore((s) => s.missingAssets);
  const refreshFiles = useProjectStore((s) => s.refreshFiles);
  const requestImport = useImportStore((s) => s.requestImport);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [scope, setScope] = useState<'drawings' | 'project'>('drawings');
  const [busy, setBusy] = useState<string | null>(null);

  const missing = useMemo(() => new Set(missingAssets), [missingAssets]);
  const linkCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of manifest.assets) m.set(a.id, linkedRefs(manifest, { type: 'asset', id: a.id }).length);
    return m;
  }, [manifest]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return manifest.assets
      .filter((a) => (kind === 'all' ? true : kindGroup(a.relativePath) === kind))
      .filter((a) => {
        if (!q) return true;
        return [fileNameOf(a.relativePath), a.relativePath, a.drawingId, a.title, a.revision].some((s) => s.toLowerCase().includes(q));
      })
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en-CA', { numeric: true }));
  }, [manifest.assets, query, kind]);

  const unregistered = useMemo(() => {
    const known = new Set(manifest.assets.map((a) => a.relativePath));
    const dir = (manifest.settings.defaultAssetFolder || DEFAULT_FOLDER).replace(/\/+$/, '');
    return flattenFiles<FileNode>(fileTree)
      .filter((f) => !known.has(f.relativePath) && !f.name.startsWith('.') && !HIDDEN_NAMES.has(f.name))
      .filter((f) => scope === 'project' || f.relativePath === dir || f.relativePath.startsWith(`${dir}/`))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en-CA', { numeric: true }));
  }, [manifest.assets, manifest.settings.defaultAssetFolder, fileTree, scope]);

  const importFolder = manifest.settings.defaultAssetFolder || DEFAULT_FOLDER;
  const missingCount = manifest.assets.filter((a) => missing.has(a.relativePath)).length;

  const register = (files: FileNode[]) => {
    const now = new Date().toISOString();
    let added = 0;
    update((d) => {
      for (const f of files) if (upsertAssetForFile(d, f.relativePath, f.sizeBytes ?? 0, f.modifiedAt ?? null, now)) added++;
    });
    notify({ tone: 'success', message: `${added} file${added === 1 ? '' : 's'} added to the register.` });
  };

  const relink = async (asset: Asset) => {
    setBusy(asset.id);
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
      notify({ tone: 'success', message: `Relinked to ${picked}.` });
    } catch (err) {
      notify({ tone: 'error', message: 'The file could not be relinked.', detail: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const removeRecord = async (asset: Asset) => {
    const links = linkCounts.get(asset.id) ?? 0;
    const choice = await confirmDialog({
      title: 'Remove register entry?',
      message: `This removes the register entry for ${fileNameOf(asset.relativePath)}${links > 0 ? ` and its ${links} trace link${links === 1 ? '' : 's'}` : ''}. The file itself is not deleted and stays in the project folder.`,
      confirmLabel: 'Remove record',
      danger: true
    });
    if (choice !== 'confirm') return;
    update((d) => removeAssetRecord(d, asset.id));
    notify({ tone: 'info', message: 'Register entry removed. The file was not deleted.' });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Technical asset register"
        subtitle="Drawings, models and documents tracked with revision, size and traceability links."
        badges={missingCount > 0 ? <Badge tone="crimson"><AlertTriangle size={11} aria-hidden="true" /> {missingCount} missing</Badge> : undefined}
        actions={
          <Button variant="primary" icon={Upload} onClick={() => requestImport(importFolder)}>
            Import files…
          </Button>
        }
      />
      <PageBody className="flex flex-col gap-6">
        <section aria-label="Registered assets" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, drawing ID, title, path…" className="w-72 max-w-full" />
            <Select value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Filter by kind" className="w-40">
              {(Object.keys(KIND_LABEL) as KindFilter[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <span className="ml-auto font-mono text-2xs text-dim">
              {rows.length} of {manifest.assets.length}
            </span>
          </div>

          {manifest.assets.length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="No assets in the register yet"
              message="Import drawings, 3D models and documents. Files are copied into the project and tracked here with a revision and traceability links."
              action={
                <Button variant="primary" icon={Upload} onClick={() => requestImport(importFolder)}>
                  Import files…
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState icon={FileStack} title="No assets match" message="Try a different search or kind filter." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gunmetal">
              <table className="w-full min-w-[1000px] border-collapse">
                <caption className="sr-only">Technical asset register</caption>
                <thead>
                  <tr>
                    <th className={th}>File</th>
                    <th className={th}>Drawing ID</th>
                    <th className={th}>Title</th>
                    <th className={th}>Rev</th>
                    <th className={cx(th, 'text-right')}>Size</th>
                    <th className={th}>Modified</th>
                    <th className={th}>Path</th>
                    <th className={cx(th, 'text-right')}>Links</th>
                    <th className={th}>Status</th>
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const isMissing = missing.has(a.relativePath);
                    const ext = extensionOf(a.relativePath);
                    return (
                      <tr
                        key={a.id}
                        onClick={() => navigate({ view: 'file', path: a.relativePath })}
                        className={cx('cursor-pointer hover:bg-matte', isMissing && 'bg-crimson/10 hover:bg-crimson/15')}
                      >
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            {ext ? <Badge>{ext}</Badge> : null}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate({ view: 'file', path: a.relativePath });
                              }}
                              className="max-w-56 truncate text-left font-medium text-white hover:underline"
                              title={fileNameOf(a.relativePath)}
                            >
                              {fileNameOf(a.relativePath)}
                            </button>
                          </div>
                        </td>
                        <td className={td}>{a.drawingId ? <Code>{a.drawingId}</Code> : <span className="text-dim">—</span>}</td>
                        <td className={cx(td, 'max-w-56')}>
                          <span className="block truncate text-silver" title={a.title}>
                            {a.title || '—'}
                          </span>
                        </td>
                        <td className={td}>{a.revision ? <Code>{a.revision}</Code> : <span className="text-dim">—</span>}</td>
                        <td className={cx(td, 'text-right font-mono text-xs whitespace-nowrap text-silver')}>{isMissing ? '—' : formatBytes(a.sizeBytes)}</td>
                        <td className={cx(td, 'text-xs whitespace-nowrap text-silver')}>{formatDateTime(a.fileModifiedAt)}</td>
                        <td className={td}>
                          <span className="block max-w-56 truncate font-mono text-[11px] text-dim" title={a.relativePath}>
                            {a.relativePath}
                          </span>
                        </td>
                        <td className={cx(td, 'text-right font-mono text-xs text-silver')}>{linkCounts.get(a.id) ?? 0}</td>
                        <td className={td}>
                          {isMissing ? (
                            <Badge tone="crimson" title="The file is not in the project folder">
                              <AlertTriangle size={11} aria-hidden="true" /> Missing
                            </Badge>
                          ) : (
                            <Badge tone="emerald">
                              <CheckCircle2 size={11} aria-hidden="true" /> Present
                            </Badge>
                          )}
                        </td>
                        <td className={td} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {isMissing ? (
                              <>
                                <Button size="xs" variant="secondary" icon={Link2Off} loading={busy === a.id} onClick={() => void relink(a)}>
                                  Relink…
                                </Button>
                                <Button size="xs" variant="danger" icon={Trash2} onClick={() => void removeRecord(a)}>
                                  Remove record
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-label="Files not yet in the register" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-semibold text-white">Files not yet in the register</h2>
            <span className="font-mono text-2xs text-dim">{unregistered.length}</span>
            <Select value={scope} onChange={(e) => setScope(e.target.value as 'drawings' | 'project')} aria-label="Search scope" className="ml-auto w-60">
              <option value="drawings">Drawings folder ({importFolder})</option>
              <option value="project">Whole project</option>
            </Select>
            <Button size="sm" variant="outline" icon={FilePlus2} disabled={unregistered.length === 0} onClick={() => register(unregistered)}>
              Register all
            </Button>
          </div>
          {unregistered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gunmetal px-4 py-5 text-center text-xs text-dim">
              Every file {scope === 'drawings' ? 'in the drawings folder ' : ''}has a register entry.
            </p>
          ) : (
            <ul className="divide-y divide-gunmetal rounded-lg border border-gunmetal">
              {unregistered.slice(0, 200).map((f) => (
                <li key={f.relativePath} className="flex items-center gap-3 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'file', path: f.relativePath })}
                    className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-silver hover:text-white"
                    title={f.relativePath}
                  >
                    {f.relativePath}
                  </button>
                  <span className="font-mono text-2xs text-dim">{formatBytes(f.sizeBytes ?? 0)}</span>
                  <Button size="xs" variant="secondary" icon={FilePlus2} onClick={() => register([f])}>
                    Register
                  </Button>
                </li>
              ))}
              {unregistered.length > 200 ? <li className="px-3 py-1.5 text-2xs text-dim">Showing the first 200 files.</li> : null}
            </ul>
          )}
        </section>
      </PageBody>
    </div>
  );
}
