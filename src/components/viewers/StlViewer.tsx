/**
 * STL viewer (three.js via @react-three/fiber). Lazy-loaded by FilePage so three.js only loads on demand.
 *
 * Orientation: engineering CAD is Z-up while three.js is Y-up. The mesh is rotated -90 degrees about X
 * so model +Z points up on screen (model +Y points away from the viewer in the Front view).
 * STL files store no unit; dimensions are shown in "model units" unless the asset declares a unit.
 * The scene renders on demand (frameloop="demand"): nothing draws until the camera or a setting changes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';
import { BufferGeometry, Vector3 } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { Box, Grid3x3, Home, Layers, Maximize, Minus, Plus, Axis3d, ScanLine, Square, ArrowUpFromLine, ArrowRightFromLine, AlertTriangle, BoxSelect } from 'lucide-react';
import { assetUrl } from '@shared/types/ipc';
import { formatBytes } from '@/lib/labels';
import { IconButton, Spinner } from '@/components/common/ui';
import { Readout, ToolbarDivider, ViewerMessage, ViewerToolbar } from './ViewerChrome';
import {
  STL_MAX_BYTES,
  bboxDimensions,
  cameraPositionForView,
  fitDistance,
  formatDimensions,
  niceGridStep,
  type StlView,
  type Vec3
} from './viewerMath';

interface StlModel {
  geometry: BufferGeometry;
  triangles: number;
  /** Original (pre-centring) bounding-box extents in model axes. */
  dims: Vec3;
  radius: number;
}

type CameraCommand = { kind: StlView | 'reset' | 'fit' | 'zoomIn' | 'zoomOut'; nonce: number };

const FOV = 45;

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function useStlModel(url: string, sizeBytes: number | undefined) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; model: StlModel }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    let geometry: BufferGeometry | null = null;
    setState({ status: 'loading' });
    const tooBig = () => new Error(`This STL is ${formatBytes(STL_MAX_BYTES)} or larger and is too large to preview. Open it in a CAD or mesh application instead.`);
    (async () => {
      if (sizeBytes !== undefined && sizeBytes > STL_MAX_BYTES) throw tooBig();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`The file could not be read (HTTP ${res.status}).`);
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > STL_MAX_BYTES) throw tooBig();
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > STL_MAX_BYTES) throw tooBig();
      if (cancelled) return;
      try {
        geometry = new STLLoader().parse(buffer); // handles both ASCII and binary STL
      } catch {
        // Truncated/empty files make the loader read past the end of the buffer.
        throw new Error('This STL contains no geometry or is corrupted.');
      }
      const position = geometry.getAttribute('position');
      if (!position || position.count < 3) throw new Error('This STL contains no geometry.');
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) {
        throw new Error('This STL contains invalid coordinates and cannot be displayed.');
      }
      const dims = bboxDimensions([box.min.x, box.min.y, box.min.z], [box.max.x, box.max.y, box.max.z]);
      const centre = box.getCenter(new Vector3());
      geometry.translate(-centre.x, -centre.y, -centre.z);
      geometry.computeVertexNormals(); // exporters often write zero normals; recompute facet normals
      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere?.radius ?? 1;
      if (cancelled) return;
      setState({ status: 'ready', model: { geometry, triangles: Math.floor(position.count / 3), dims, radius: radius > 0 ? radius : 1 } });
    })().catch((err: unknown) => {
      if (cancelled) return;
      geometry?.dispose();
      geometry = null;
      setState({ status: 'error', message: err instanceof Error ? err.message : 'The STL could not be loaded.' });
    });
    return () => {
      cancelled = true;
      geometry?.dispose();
    };
  }, [url, sizeBytes]);
  return state;
}

type ControlsLike = { target: Vector3; update(): void };

/** Applies camera commands (views, fit, zoom) and keeps the near/far planes matched to the model. */
function CameraController({ command, radius }: { command: CameraCommand; radius: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    camera.near = radius / 100;
    camera.far = radius * 200;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, radius, invalidate]);

  useEffect(() => {
    if (!controls) return;
    const dist = fitDistance(radius, FOV);
    const target = controls.target;
    if (command.kind === 'zoomIn' || command.kind === 'zoomOut') {
      const factor = command.kind === 'zoomIn' ? 0.8 : 1.25;
      const offset = camera.position.clone().sub(target).multiplyScalar(factor);
      camera.position.copy(target).add(offset);
    } else if (command.kind === 'fit') {
      const dir = camera.position.clone().sub(target);
      if (dir.lengthSq() === 0) dir.set(1, 0.9, 1);
      camera.position.copy(target).add(dir.normalize().multiplyScalar(dist));
    } else {
      const view: StlView = command.kind === 'reset' ? 'iso' : command.kind;
      const p = cameraPositionForView(view, dist);
      target.set(0, 0, 0);
      camera.up.set(0, 1, 0);
      camera.position.set(p[0], p[1], p[2]);
    }
    camera.lookAt(target);
    controls.update();
    invalidate();
    // Re-run only for a new command (or when the controls first become available).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command.nonce, controls]);

  return null;
}

function Scene({ model, wireframe, grid, axes, command }: { model: StlModel; wireframe: boolean; grid: boolean; axes: boolean; command: CameraCommand }) {
  const { dims, radius } = model;
  // After the -90° X rotation, model Z extent becomes world height; the model's base sits at -dims[2]/2.
  const gridSpan = Math.max(dims[0], dims[1], radius) * 2.2;
  const step = niceGridStep(gridSpan);
  const divisions = Math.max(2, Math.min(200, Math.round(gridSpan / step)));
  return (
    <>
      <color attach="background" args={['#0d0d10']} />
      <hemisphereLight args={['#ffffff', '#3b3b46', 1.1]} />
      <directionalLight position={[radius * 2, radius * 3, radius * 2]} intensity={2.2} />
      <directionalLight position={[-radius * 2, radius, -radius * 2]} intensity={0.7} />
      <mesh geometry={model.geometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#9ca3af" metalness={0.1} roughness={0.75} flatShading wireframe={wireframe} />
      </mesh>
      {grid ? <gridHelper args={[step * divisions, divisions, '#52525b', '#27272a']} position={[0, -dims[2] / 2, 0]} /> : null}
      <OrbitControls makeDefault enableDamping={false} enablePan enableZoom />
      <CameraController command={command} radius={radius} />
      {axes ? (
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          {/* World Y is model Z (up); world Z is model -Y. Labels follow the model's engineering axes. */}
          <GizmoViewport axisColors={['#ef4444', '#3b82f6', '#22c55e']} labels={['X', 'Z', '−Y']} labelColor="#fafafa" hideNegativeAxes />
        </GizmoHelper>
      ) : null}
    </>
  );
}

export default function StlViewer({ path, epoch, sizeBytes, modelUnit = '' }: { path: string; epoch: number; sizeBytes?: number; modelUnit?: string }) {
  const url = assetUrl(path, epoch);
  const webgl = useMemo(webglAvailable, []);
  const state = useStlModel(url, sizeBytes);
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(true);
  const [axes, setAxes] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [command, setCommand] = useState<CameraCommand>({ kind: 'reset', nonce: 0 });
  const nonce = useRef(0);
  const send = useCallback((kind: CameraCommand['kind']) => setCommand({ kind, nonce: ++nonce.current }), []);

  // New file: restore the default view.
  useEffect(() => {
    if (state.status === 'ready') send('reset');
  }, [state.status, url, send]);

  if (!webgl) {
    return (
      <ViewerMessage icon={<Box size={28} className="text-dim" aria-hidden="true" />} title="3D preview requires WebGL, which is not available on this system">
        Update your graphics drivers or enable hardware acceleration. You can still open the file in a CAD or mesh application.
      </ViewerMessage>
    );
  }
  if (state.status === 'error') {
    return (
      <ViewerMessage icon={<AlertTriangle size={28} className="text-crimson-hover" aria-hidden="true" />} title={state.message}>
        The file in your project has not been changed.
      </ViewerMessage>
    );
  }
  if (contextLost) {
    return (
      <ViewerMessage icon={<AlertTriangle size={28} className="text-amber" aria-hidden="true" />} title="The 3D graphics context was lost">
        Switch to another file and back to reload the preview.
      </ViewerMessage>
    );
  }

  const model = state.status === 'ready' ? state.model : null;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !model) return;
    if (e.key === '+' || e.key === '=') send('zoomIn');
    else if (e.key === '-' || e.key === '_') send('zoomOut');
    else if (e.key === '0') send('reset');
    else if (e.key === 'f' || e.key === 'F') send('fit');
    else if (e.key === 'g' || e.key === 'G') setGrid((v) => !v);
    else if (e.key === 'w' || e.key === 'W') setWireframe((v) => !v);
    else return;
    e.preventDefault();
  };

  const off = !model;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewerToolbar label="3D viewer controls">
        <IconButton icon={Minus} label="Zoom out (−)" onClick={() => send('zoomOut')} disabled={off} />
        <IconButton icon={Plus} label="Zoom in (+)" onClick={() => send('zoomIn')} disabled={off} />
        <IconButton icon={Home} label="Reset camera (0)" onClick={() => send('reset')} disabled={off} />
        <IconButton icon={Maximize} label="Fit model (F)" onClick={() => send('fit')} disabled={off} />
        <ToolbarDivider />
        <IconButton icon={Square} label="Front view" onClick={() => send('front')} disabled={off} />
        <IconButton icon={ArrowUpFromLine} label="Top view" onClick={() => send('top')} disabled={off} />
        <IconButton icon={ArrowRightFromLine} label="Right side view" onClick={() => send('right')} disabled={off} />
        <IconButton icon={BoxSelect} label="Isometric view" onClick={() => send('iso')} disabled={off} />
        <ToolbarDivider />
        <IconButton icon={Grid3x3} label="Toggle grid (G)" onClick={() => setGrid((v) => !v)} active={grid} aria-pressed={grid} />
        <IconButton icon={Axis3d} label="Toggle axis indicator" onClick={() => setAxes((v) => !v)} active={axes} aria-pressed={axes} />
        <IconButton icon={ScanLine} label="Toggle wireframe (W)" onClick={() => setWireframe((v) => !v)} active={wireframe} aria-pressed={wireframe} />
        <span className="flex-1" />
        <Readout title="Z is up. Drag to orbit, right-drag or Shift-drag to pan, wheel to zoom.">
          <Layers size={12} className="mr-1 inline" aria-hidden="true" />
          Z-up
        </Readout>
      </ViewerToolbar>
      <div
        className="relative min-h-0 flex-1 bg-[#0d0d10] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-crimson-hover"
        tabIndex={0}
        role="region"
        aria-label="3D model preview. Drag to orbit, plus and minus to zoom, 0 to reset the camera."
        onKeyDown={onKeyDown}
      >
        {model ? (
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ fov: FOV, near: 0.1, far: 1000, position: cameraPositionForView('iso', fitDistance(model.radius, FOV)) }}
            gl={{ antialias: true, powerPreference: 'default' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                setContextLost(true);
              });
            }}
          >
            <Scene model={model} wireframe={wireframe} grid={grid} axes={axes} command={command} />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Loading model…" />
          </div>
        )}
        {model ? (
          <dl className="pointer-events-none absolute bottom-2 left-2 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-md border border-gunmetal bg-carbon/90 px-2.5 py-1.5 font-mono text-2xs">
            <dt className="text-dim">Triangles</dt>
            <dd className="text-white">{model.triangles.toLocaleString('en-CA')}</dd>
            <dt className="text-dim">Extents X×Y×Z</dt>
            <dd className="text-white">{formatDimensions(model.dims, modelUnit)}</dd>
            {sizeBytes !== undefined ? (
              <>
                <dt className="text-dim">File size</dt>
                <dd className="text-white">{formatBytes(sizeBytes)}</dd>
              </>
            ) : null}
            {modelUnit.trim() === '' ? (
              <>
                <dt className="text-dim">Units</dt>
                <dd className="text-silver">not declared in STL</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
