/**
 * Pure helpers for the file viewers (no DOM / WebGL dependency, unit-tested).
 *
 * Coordinate convention for the STL viewer: engineering models are Z-up. three.js is Y-up,
 * so the model mesh is rotated -90 degrees about X. After that rotation:
 *   model +X -> world +X,  model +Z -> world +Y (up),  model +Y -> world -Z.
 * All camera positions below are expressed in WORLD (three.js) coordinates relative to the
 * model centre (the geometry is translated so its bounding-box centre is the origin).
 */

export type Vec3 = [number, number, number];

export type StlView = 'front' | 'top' | 'right' | 'iso';

export const STL_MAX_BYTES = 200 * 1024 * 1024;
export const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 16;
export const ZOOM_STEP = 1.25;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function stepZoom(current: number, direction: 1 | -1): number {
  return clamp(direction === 1 ? current * ZOOM_STEP : current / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
}

/** Scale that makes (contentW x contentH) fit inside (viewW x viewH) with padding; 1 when degenerate. */
export function fitScale(contentW: number, contentH: number, viewW: number, viewH: number, padding = 24, maxScale = ZOOM_MAX): number {
  if (!(contentW > 0) || !(contentH > 0) || !(viewW > 0) || !(viewH > 0)) return 1;
  const s = Math.min((viewW - padding) / contentW, (viewH - padding) / contentH);
  return clamp(Number.isFinite(s) && s > 0 ? s : ZOOM_MIN, ZOOM_MIN, maxScale);
}

export function fitWidthScale(contentW: number, viewW: number, padding = 24): number {
  if (!(contentW > 0) || !(viewW > 0)) return 1;
  return clamp((viewW - padding) / contentW, ZOOM_MIN, ZOOM_MAX);
}

export function formatZoom(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

export function clampPage(page: number, numPages: number): number {
  if (!Number.isFinite(page)) return 1;
  return clamp(Math.round(page), 1, Math.max(1, numPages));
}

/** Axis-aligned bounding box -> [dx, dy, dz] in model axes. */
export function bboxDimensions(min: Vec3, max: Vec3): Vec3 {
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs === 0) return '0';
  if (abs >= 1000) return n.toLocaleString('en-CA', { maximumFractionDigits: 1 });
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  return n.toPrecision(3);
}

/** "24.00 × 2.50 × 3.10 m" or "… model units" when the unit is not declared. */
export function formatDimensions(dims: Vec3, unit: string): string {
  const u = unit.trim() === '' ? 'model units' : unit.trim();
  return `${formatNumber(dims[0])} × ${formatNumber(dims[1])} × ${formatNumber(dims[2])} ${u}`;
}

/** Distance at which a sphere of `radius` fits in a perspective camera of vertical `fovDeg`. */
export function fitDistance(radius: number, fovDeg: number, margin = 1.15): number {
  const r = radius > 0 && Number.isFinite(radius) ? radius : 1;
  const half = (clamp(fovDeg, 10, 120) * Math.PI) / 360;
  return (r / Math.sin(half)) * margin;
}

/**
 * Camera position (world coordinates, relative to the model centre) for a named view of a
 * Z-up model. Front looks along model +Y (camera on the model -Y side), Top looks down -Z,
 * Right looks along model -X (camera on the +X side). Top is nudged slightly off-axis so that
 * the orbit controls' up-vector never becomes degenerate.
 */
export function cameraPositionForView(view: StlView, distance: number): Vec3 {
  switch (view) {
    case 'front':
      return [0, 0, distance];
    case 'top':
      return [0, distance, distance * 0.001];
    case 'right':
      return [distance, 0, 0];
    case 'iso': {
      const k = distance / Math.sqrt(3);
      return [k, k * 0.9, k];
    }
  }
}

/** A "nice" grid cell size (1, 2 or 5 x 10^n) for a model span. */
export function niceGridStep(span: number, targetCells = 10): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / targetCells;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return nice * pow;
}

/** Heuristic for a text buffer that is really binary (contains NUL bytes). */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}
