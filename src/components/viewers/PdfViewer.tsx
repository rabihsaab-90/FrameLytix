/**
 * PDF viewer (pdfjs-dist). Canvas-only: no text layer, annotation layer, forms, XFA or scripting.
 * Only the current page is rendered (on demand, debounced), at devicePixelRatio resolution.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, FileWarning, Maximize2, MoveHorizontal, Minus, Plus } from 'lucide-react';
import { assetUrl } from '@shared/types/ipc';
import { IconButton, Spinner } from '@/components/common/ui';
import { CHECKER_STYLE, Readout, ToolbarDivider, ViewerMessage, ViewerToolbar } from './ViewerChrome';
import { ZOOM_MAX, ZOOM_MIN, clamp, clampPage, fitScale, fitWidthScale, formatZoom, stepZoom } from './viewerMath';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type ZoomMode = 'fit-page' | 'fit-width' | 'manual';
/** Cap total canvas pixels so very large pages at high zoom cannot exhaust GPU/memory. */
const MAX_CANVAS_PIXELS = 36_000_000;

function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const name = (err as { name?: string }).name;
    const message = (err as { message?: string }).message ?? '';
    if (name === 'PasswordException') return 'This document is password-protected. Password-protected PDFs cannot be previewed; open it in your PDF reader instead.';
    if (name === 'InvalidPDFException') return 'The file is not a valid PDF or is corrupted.';
    if (name === 'MissingPDFException') return 'The file could not be found.';
    if (message) return message;
  }
  return 'Unknown error.';
}

export default function PdfViewer({ path, epoch }: { path: string; epoch: number }) {
  const url = assetUrl(path, epoch);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [pageProxy, setPageProxy] = useState<PDFPageProxy | null>(null);
  const [mode, setMode] = useState<ZoomMode>('fit-page');
  const [manual, setManual] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [rendering, setRendering] = useState(false);

  const numPages = doc?.numPages ?? 0;

  // Load the document; destroy the loading task (and with it the document and worker port) on cleanup.
  useEffect(() => {
    setDoc(null);
    setPageProxy(null);
    hostRef.current?.replaceChildren();
    setLoadError(null);
    setRenderError(null);
    setPage(1);
    setPageInput('1');
    setMode('fit-page');
    let cancelled = false;
    const task = pdfjs.getDocument({
      url,
      enableXfa: false,
      disableAutoFetch: true,
      disableStream: false,
      useSystemFonts: true,
      verbosity: pdfjs.VerbosityLevel.ERRORS
    });
    task.promise.then(
      (d) => {
        if (!cancelled) setDoc(d);
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(describeError(err));
      }
    );
    return () => {
      cancelled = true;
      void task.destroy().catch(() => undefined);
    };
  }, [url]);

  // Track the available area.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Fetch the current page proxy.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    doc.getPage(page).then(
      (p) => {
        if (!cancelled) setPageProxy(p);
      },
      (err: unknown) => {
        if (!cancelled) setRenderError(describeError(err));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [doc, page]);

  const base = pageProxy ? pageProxy.getViewport({ scale: 1 }) : null;
  const scale = base
    ? mode === 'fit-page'
      ? fitScale(base.width, base.height, box.w, box.h, 32)
      : mode === 'fit-width'
        ? fitWidthScale(base.width, box.w - (box.h > 0 ? 8 : 0), 32)
        : manual
    : 1;
  // Round so sub-pixel resize jitter does not retrigger renders.
  const renderScale = Math.round(scale * 1000) / 1000;

  // Render the current page to an off-screen canvas, then swap it in (no flicker, no canvas reuse).
  useEffect(() => {
    if (!pageProxy || !base || box.w === 0) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const viewport = pageProxy.getViewport({ scale: renderScale });
      let dpr = window.devicePixelRatio || 1;
      const pixels = viewport.width * viewport.height * dpr * dpr;
      if (pixels > MAX_CANVAS_PIXELS) dpr = Math.max(1, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.style.display = 'block';
      canvas.style.background = '#ffffff';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `PDF page ${page} of ${numPages}`);
      setRendering(true);
      setRenderError(null);
      task = pageProxy.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        annotationMode: pdfjs.AnnotationMode.DISABLE
      });
      task.promise.then(
        () => {
          if (cancelled) return;
          hostRef.current?.replaceChildren(canvas);
          setRendering(false);
        },
        (err: unknown) => {
          if (cancelled || (err as { name?: string })?.name === 'RenderingCancelledException') return;
          setRendering(false);
          setRenderError(describeError(err));
        }
      );
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      task?.cancel();
    };
    // `base` is derived from pageProxy; listing renderScale covers zoom changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageProxy, renderScale, box.w > 0]);

  const goTo = useCallback(
    (n: number) => {
      const target = clampPage(n, numPages);
      setPage(target);
      setPageInput(String(target));
      scrollRef.current?.scrollTo(0, 0);
    },
    [numPages]
  );

  const zoomTo = (next: number) => {
    setManual(clamp(next, ZOOM_MIN, ZOOM_MAX));
    setMode('manual');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        goTo(page - 1);
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        goTo(page + 1);
        break;
      case 'Home':
        e.preventDefault();
        goTo(1);
        break;
      case 'End':
        e.preventDefault();
        goTo(numPages);
        break;
      case '+':
      case '=':
        e.preventDefault();
        zoomTo(stepZoom(scale, 1));
        break;
      case '-':
      case '_':
        e.preventDefault();
        zoomTo(stepZoom(scale, -1));
        break;
      case '0':
        e.preventDefault();
        setMode('fit-page');
        break;
    }
  };

  if (loadError) {
    return (
      <ViewerMessage icon={<FileWarning size={28} className="text-crimson-hover" aria-hidden="true" />} title={`This PDF could not be opened: ${loadError}`}>
        The file in your project has not been changed. You can still open it in your default PDF application.
      </ViewerMessage>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar label="PDF viewer controls">
        <IconButton icon={ChevronLeft} label="Previous page (Page Up)" onClick={() => goTo(page - 1)} disabled={!doc || page <= 1} />
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number.parseInt(pageInput, 10);
            goTo(Number.isFinite(n) ? n : page);
          }}
        >
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => setPageInput(String(page))}
            inputMode="numeric"
            aria-label="Page number"
            disabled={!doc}
            className="h-7 w-11 rounded-md border border-gunmetal bg-obsidian text-center font-mono text-xs text-white focus:border-crimson focus:outline-none disabled:opacity-50"
          />
          <Readout title="Total pages">/ {doc ? numPages : '—'}</Readout>
        </form>
        <IconButton icon={ChevronRight} label="Next page (Page Down)" onClick={() => goTo(page + 1)} disabled={!doc || page >= numPages} />
        <ToolbarDivider />
        <IconButton icon={Minus} label="Zoom out (−)" onClick={() => zoomTo(stepZoom(scale, -1))} disabled={!pageProxy} />
        <Readout title="Zoom level">{pageProxy ? formatZoom(scale) : '—'}</Readout>
        <IconButton icon={Plus} label="Zoom in (+)" onClick={() => zoomTo(stepZoom(scale, 1))} disabled={!pageProxy} />
        <ToolbarDivider />
        <IconButton icon={Maximize2} label="Fit page (0)" onClick={() => setMode('fit-page')} active={mode === 'fit-page'} disabled={!pageProxy} />
        <IconButton icon={MoveHorizontal} label="Fit width" onClick={() => setMode('fit-width')} active={mode === 'fit-width'} disabled={!pageProxy} />
        <span className="flex-1" />
        {rendering ? <Spinner label="Rendering…" size={12} /> : null}
      </ViewerToolbar>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="PDF preview. Arrow left and right or Page Up and Page Down change page; plus and minus zoom; 0 fits the page."
          onKeyDown={onKeyDown}
          className="absolute inset-0 flex overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-crimson-hover"
          style={CHECKER_STYLE}
        >
          <div className="m-auto shrink-0 p-4">
            <div ref={hostRef} className="shadow-lg shadow-black/50" />
          </div>
        </div>
        {!doc ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner label="Opening PDF…" />
          </div>
        ) : null}
        {renderError ? (
          <div className="absolute inset-x-0 top-2 mx-auto w-fit max-w-md rounded-md border border-crimson/40 bg-carbon px-3 py-2 text-xs text-[#fca5a5]" role="alert">
            Page {page} could not be rendered: {renderError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
