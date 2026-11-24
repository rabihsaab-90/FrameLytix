import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import {
  bboxDimensions,
  cameraPositionForView,
  clampPage,
  fitDistance,
  fitScale,
  formatDimensions,
  looksBinary,
  niceGridStep,
  stepZoom,
  type Vec3
} from '../../src/components/viewers/viewerMath';

const SAMPLE = resolve(__dirname, '../../samples/pedestrian-truss-bridge/03-CAD-and-Technical-Drawings/3D-Models/PTB-Pratt-Truss-Concept.stl');

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('sample STL parsing', () => {
  const geometry = new STLLoader().parse(toArrayBuffer(readFileSync(SAMPLE)));
  it('has 684 triangles', () => {
    expect(geometry.getAttribute('position').count / 3).toBe(684);
  });
  it('spans about 27 m along X (24 m truss span plus end overhang), 4.4 m wide, 6.2 m high (metres)', () => {
    geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    const dims = bboxDimensions([b.min.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.max.z]);
    expect(dims[0]).toBeGreaterThan(24);
    expect(dims[0]).toBeLessThan(30);
    expect(dims[1]).toBeCloseTo(4.4, 1);
    expect(dims[2]).toBeCloseTo(6.15, 1);
    expect(dims.every((d) => Number.isFinite(d))).toBe(true);
  });
  it('parses an ASCII STL; an empty file cannot be parsed (viewer reports "no geometry")', () => {
    const ascii = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n';
    expect(new STLLoader().parse(ascii).getAttribute('position').count).toBe(3);
    const emptyAscii = () => new STLLoader().parse('solid empty\nendsolid empty\n').getAttribute('position').count;
    try {
      expect(emptyAscii()).toBe(0);
    } catch (err) {
      expect(err).toBeInstanceOf(RangeError);
    }
  });
});

describe('viewerMath', () => {
  it('formats dimensions with model units unless a unit is declared', () => {
    const d: Vec3 = [24, 2.5, 3.1];
    expect(formatDimensions(d, '')).toBe('24.00 × 2.50 × 3.10 model units');
    expect(formatDimensions(d, 'm')).toBe('24.00 × 2.50 × 3.10 m');
  });
  it('places cameras for Z-up models in three.js Y-up world space', () => {
    expect(cameraPositionForView('front', 10)).toEqual([0, 0, 10]);
    expect(cameraPositionForView('right', 10)).toEqual([10, 0, 0]);
    const top = cameraPositionForView('top', 10);
    expect(top[1]).toBe(10);
    expect(Math.abs(top[0])).toBe(0);
    expect(Math.abs(top[2])).toBeLessThan(0.1);
    const iso = cameraPositionForView('iso', 10);
    expect(Math.hypot(...iso)).toBeGreaterThan(9);
    expect(iso.every((c) => c > 0)).toBe(true);
  });
  it('fits a bounding sphere inside the view frustum', () => {
    const dist = fitDistance(5, 45);
    expect(dist * Math.sin((45 * Math.PI) / 360)).toBeGreaterThanOrEqual(5);
    expect(fitDistance(0, 45)).toBeGreaterThan(0);
  });
  it('computes nice grid steps', () => {
    expect(niceGridStep(24)).toBe(2);
    expect(niceGridStep(100)).toBe(10);
    expect(niceGridStep(0)).toBe(1);
  });
  it('fits, steps and clamps zoom and pages', () => {
    expect(fitScale(100, 50, 224, 1000, 24)).toBeCloseTo(2);
    expect(fitScale(0, 50, 224, 100)).toBe(1);
    expect(stepZoom(1, 1)).toBeCloseTo(1.25);
    expect(stepZoom(16, 1)).toBe(16);
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(Number.NaN, 5)).toBe(1);
  });
  it('detects binary buffers', () => {
    expect(looksBinary(new Uint8Array([72, 105, 0]))).toBe(true);
    expect(looksBinary(new TextEncoder().encode('plain text'))).toBe(false);
  });
});
