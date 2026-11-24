import { lazy, Suspense, useCallback, useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useImportStore } from '@/stores/importStore';
import { routeKey } from '@/lib/navigation';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Spinner } from '@/components/common/ui';
import { ProjectExplorer } from './ProjectExplorer';
import { Breadcrumbs } from './Breadcrumbs';
import { DemoBanner, ConflictBanner, WarningsBanner } from './Banners';

const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
const RequirementsPage = lazy(() => import('@/pages/RequirementsPage'));
const ArgumentsPage = lazy(() => import('@/pages/ArgumentsPage'));
const ArgumentPage = lazy(() => import('@/pages/ArgumentPage'));
const CalculationsPage = lazy(() => import('@/pages/CalculationsPage'));
const EvidencePage = lazy(() => import('@/pages/EvidencePage'));
const AssetsPage = lazy(() => import('@/pages/AssetsPage'));
const FilePage = lazy(() => import('@/pages/FilePage'));
const TraceabilityPage = lazy(() => import('@/pages/TraceabilityPage'));
const RisksPage = lazy(() => import('@/pages/RisksPage'));
const ReviewPage = lazy(() => import('@/pages/ReviewPage'));
const ReportPage = lazy(() => import('@/pages/ReportPage'));
const ExportsPage = lazy(() => import('@/pages/ExportsPage'));

function RouteView() {
  const route = useUiStore((s) => s.route);
  switch (route.view) {
    case 'overview':
      return <OverviewPage />;
    case 'requirements':
      return <RequirementsPage section={route.section} selectedId={route.id} />;
    case 'arguments':
      return <ArgumentsPage />;
    case 'argument':
      return <ArgumentPage id={route.id} />;
    case 'calculations':
      return <CalculationsPage selectedId={route.id} />;
    case 'evidence':
      return <EvidencePage selectedId={route.id} />;
    case 'assets':
      return <AssetsPage />;
    case 'file':
      return <FilePage path={route.path} />;
    case 'traceability':
      return <TraceabilityPage />;
    case 'risks':
      return <RisksPage selectedId={route.id} />;
    case 'review':
      return <ReviewPage />;
    case 'report':
      return <ReportPage />;
    case 'exports':
      return <ExportsPage />;
  }
}

export function Workspace() {
  const route = useUiStore((s) => s.route);
  const collapsed = useUiStore((s) => s.settings?.sidebarCollapsed ?? false);
  const savedWidth = useUiStore((s) => s.settings?.sidebarWidth ?? 280);
  const updateSettings = useUiStore((s) => s.updateSettings);
  const manifest = useProjectStore((s) => s.manifest);
  const requestImport = useImportStore((s) => s.requestImport);
  const [width, setWidth] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const effectiveWidth = width ?? savedWidth;

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = effectiveWidth;
      let latest = startW;
      const move = (ev: PointerEvent) => {
        latest = Math.max(200, Math.min(520, startW + ev.clientX - startX));
        setWidth(latest);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        void updateSettings({ sidebarWidth: Math.round(latest) }).then(() => setWidth(null));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [effectiveWidth, updateSettings]
  );

  const onResizeKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = Math.max(200, Math.min(520, effectiveWidth + (e.key === 'ArrowLeft' ? -16 : 16)));
    void updateSettings({ sidebarWidth: next });
  };

  // Drag-and-drop import of files from the OS (copied into the project after confirmation).
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDragOver = (e: DragEvent) => {
    if (hasFiles(e)) e.preventDefault();
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0 || !manifest) return;
    const dest =
      route.view === 'file'
        ? route.path.split('/').slice(0, -1).join('/')
        : manifest.settings.defaultAssetFolder || '03-CAD-and-Technical-Drawings';
    requestImport(dest, files);
  };

  return (
    <div className="flex min-h-0 flex-1" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      {!collapsed ? (
        <>
          <aside className="shrink-0 border-r border-gunmetal bg-carbon" style={{ width: effectiveWidth }}>
            <ProjectExplorer />
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuenow={effectiveWidth}
            aria-valuemin={200}
            aria-valuemax={520}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={onResizeKey}
            className="-ml-px w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-crimson/50 focus-visible:bg-crimson/60"
          />
        </>
      ) : null}
      <main className="relative flex min-w-0 flex-1 flex-col bg-obsidian">
        <DemoBanner />
        <ConflictBanner />
        <WarningsBanner />
        <Breadcrumbs />
        <div className="flex min-h-0 flex-1 flex-col">
          <ErrorBoundary area="page" resetKey={routeKey(route)}>
            <Suspense
              fallback={
                <div className="p-6">
                  <Spinner />
                </div>
              }
            >
              <RouteView />
            </Suspense>
          </ErrorBoundary>
        </div>
        {dragOver ? (
          <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-crimson bg-obsidian/85">
            <div className="flex flex-col items-center gap-2 text-white">
              <Upload size={28} className="text-crimson-hover" aria-hidden="true" />
              <p className="text-sm font-medium">Drop files to import a copy into the project</p>
              <p className="text-xs text-silver">You will be able to review names and collisions before anything is copied.</p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
