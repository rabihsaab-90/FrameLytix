/**
 * Raster / SVG viewer. SVG is rendered through <img> only, never injected as markup, so it can
 * neither run scripts nor fetch external resources.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImageOff, Maximize2, Minus, Plus, ScanSearch, RotateCcw } from 'lucide-react';
import { assetUrl } from '@shared/types/ipc';
import { IconButton, Spinner } from '@/components/common/ui';
import { CHECKER_STYLE, Readout, ToolbarDivider, ViewerMessage, ViewerToolbar } from './ViewerChrome';
import { ZOOM_MAX, ZOOM_MIN, clamp, fitScale, formatZoom, stepZoom } from './viewerMath';

type Mode = 'fit' | 'manual';

export default function ImageViewer({ path, epoch, vector = false }: { path: string; epoch: number; vector?: boolean }) {
  const url = assetUrl(path, epoch);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState<Mode>('fit');
  const [manual, setManual] = useState(1);
  const pivot = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Reset when the file (or its on-disk content) changes.
  useEffect(() => {
    setNatural(null);
    setFailed(false);
    setMode('fit');
  }, [url]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = natural ? fitScale(natural.w, natural.h, box.w, box.h, 32, vector ? ZOOM_MAX : 1) : 1;
  const zoom = mode === 'fit' ? fit : manual;

  const zoomTo = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      const sc = scrollRef.current;
      const content = contentRef.current;
      if (sc && content && natural) {
        const rect = sc.getBoundingClientRect();
        const cx = clientX !== undefined ? clientX - rect.left : sc.clientWidth / 2;
        const cy = clientY !== undefined ? clientY - rect.top : sc.clientHeight / 2;
        const w = content.offsetWidth || 1;
        const h = content.offsetHeight || 1;
        pivot.current = { fx: (sc.scrollLeft + cx - content.offsetLeft) / w, fy: (sc.scrollTop + cy - content.offsetTop) / h, cx, cy };
      }
      setManual(clamp(next, ZOOM_MIN, ZOOM_MAX));
      setMode('manual');
    },
    [natural]
  );

  // Keep the point under the cursor stable after a zoom change.
  useLayoutEffect(() => {
    const p = pivot.current;
    const sc = scrollRef.current;
    const content = contentRef.current;
    if (!p || !sc || !content) return;
    pivot.current = null;
    sc.scrollLeft = p.fx * content.offsetWidth + content.offsetLeft - p.cx;
    sc.scrollTop = p.fy * content.offsetHeight + content.offsetTop - p.cy;
  }, [manual]);

  // Ctrl+wheel zoom needs a non-passive listener to prevent page zoom.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomToRef = useRef(zoomTo);
  zoomToRef.current = zoomTo;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomToRef.current(stepZoom(zoomRef.current, e.deltaY < 0 ? 1 : -1), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const actualSize = () => zoomTo(1);
  const fitView = () => {
    setMode('fit');
    scrollRef.current?.scrollTo(0, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomTo(stepZoom(zoom, 1));
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomTo(stepZoom(zoom, -1));
    } else if (e.key === '0') {
      e.preventDefault();
      fitView();
    } else if (e.key === '1') {
      e.preventDefault();
      actualSize();
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const sc = scrollRef.current;
    if (!sc) return;
    sc.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, sl: sc.scrollLeft, st: sc.scrollTop };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const sc = scrollRef.current;
    if (!d || !sc) return;
    sc.scrollLeft = d.sl - (e.clientX - d.x);
    sc.scrollTop = d.st - (e.clientY - d.y);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current) scrollRef.current?.releasePointerCapture?.(e.pointerId);
    drag.current = null;
    setDragging(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar label="Image viewer controls">
        <IconButton icon={Minus} label="Zoom out (−)" onClick={() => zoomTo(stepZoom(zoom, -1))} disabled={!natural} />
        <Readout title="Zoom level">{natural ? formatZoom(zoom) : '—'}</Readout>
        <IconButton icon={Plus} label="Zoom in (+)" onClick={() => zoomTo(stepZoom(zoom, 1))} disabled={!natural} />
        <ToolbarDivider />
        <IconButton icon={Maximize2} label="Fit to viewport (0)" onClick={fitView} active={mode === 'fit'} disabled={!natural} />
        <IconButton icon={ScanSearch} label="Actual size, 100% (1)" onClick={actualSize} disabled={!natural} />
        <IconButton icon={RotateCcw} label="Reset view" onClick={fitView} disabled={!natural} />
        <span className="flex-1" />
        <Readout title="Natural size in pixels">{natural ? `${natural.w} × ${natural.h} px` : ''}</Readout>
      </ViewerToolbar>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="Image preview. Use plus and minus to zoom, 0 to fit, 1 for actual size."
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute inset-0 flex overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-crimson-hover"
          style={{ ...CHECKER_STYLE, cursor: dragging ? 'grabbing' : natural ? 'grab' : 'default', touchAction: 'none' }}
        >
          {!failed ? (
            <div ref={contentRef} className="m-auto shrink-0" style={natural ? { width: natural.w * zoom, height: natural.h * zoom } : undefined}>
              <img
                src={url}
                alt={`Preview of ${path.split('/').pop() ?? path}`}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  // SVGs without intrinsic size report 0; fall back to a sensible canvas.
                  setNatural({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 });
                }}
                onError={() => setFailed(true)}
                className="block select-none"
                style={natural ? { width: '100%', height: '100%', imageRendering: zoom > 2 ? 'pixelated' : 'auto' } : { opacity: 0 }}
              />
            </div>
          ) : null}
        </div>
        {!natural && !failed ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Spinner label="Loading image…" />
          </div>
        ) : null}
        {failed ? (
          <div className="absolute inset-0">
            <ViewerMessage icon={<ImageOff size={28} className="text-dim" aria-hidden="true" />} title="This image could not be decoded">
              The file may be corrupted or in an unsupported variant of its format. The file in your project has not been changed.
            </ViewerMessage>
          </div>
        ) : null}
      </div>
    </div>
  );
}
