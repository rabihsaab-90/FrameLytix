import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeManifest, type ProjectManifest } from '../../shared/schemas/project';
import { createManifestFromTemplate } from '../../shared/utilities/projectFactory';
import { isInside } from '../../electron/security/paths';
import { DemoService } from '../../electron/services/demoService';
import { collectReportImages, ExportTracker, suggestReportFileName } from '../../electron/services/exportService';
import { ProjectService, type ProjectSession } from '../../electron/services/projectService';
import { FIXTURE_TEMPLATE, fixtureContext, hashTree, makeTempDir, removeTempDir } from './helpers';

let tmp: string;
let samplesDir: string;
let sampleSrc: string;
let projects: ProjectService;
let demo: DemoService;
const open: ProjectSession[] = [];

beforeEach(async () => {
  tmp = await makeTempDir();
  samplesDir = path.join(tmp, 'samples');
  sampleSrc = path.join(samplesDir, 'pedestrian-truss-bridge');
  await mkdir(path.join(sampleSrc, '03-CAD-and-Technical-Drawings'), { recursive: true });
  const m = createManifestFromTemplate(
    FIXTURE_TEMPLATE,
    { title: 'Pedestrian Truss Bridge', description: '', identifier: 'PTB-2026', author: 'Demo', organization: '', unitSystem: 'SI' },
    fixtureContext()
  );
  m.project.isSample = true;
  m.assets.push({
    id: 'a1',
    drawingId: 'DRW-001',
    title: 'Elevation',
    relativePath: '03-CAD-and-Technical-Drawings/elevation.svg',
    description: '',
    revision: 'A',
    modelUnit: '',
    sizeBytes: 0,
    fileModifiedAt: null,
    importedAt: '2026-11-24T12:00:00.000Z'
  });
  await writeFile(path.join(sampleSrc, 'framelytix-project.json'), serializeManifest(m));
  await writeFile(path.join(sampleSrc, '03-CAD-and-Technical-Drawings', 'elevation.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  projects = new ProjectService({ instanceId: 'demo-test' });
  demo = new DemoService({ samplesDir, tempRoot: path.join(tmp, 'temp'), projects });
});

afterEach(async () => {
  for (const s of open.splice(0)) await projects.closeSession(s).catch(() => undefined);
  await removeTempDir(tmp);
});

describe('demo', () => {
  it('opens a temp copy; editing, reset and saveAsNew never modify the bundled sample', async () => {
    const before = await hashTree(sampleSrc);
    const r = await demo.openDemo();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    open.push(r.session);
    expect(r.session.isDemo).toBe(true);
    expect(isInside(demo.base, r.session.rootPath)).toBe(true);
    expect(path.basename(r.session.rootPath)).toBe('Pedestrian-Truss-Bridge');

    const edited: ProjectManifest = structuredClone(r.manifest);
    edited.project.summary = 'Edited in demo';
    expect((await projects.saveManifest(r.session, edited, { manual: true })).ok).toBe(true);
    expect(await hashTree(sampleSrc)).toBe(before);

    const firstCopy = demo.currentCopy!;
    await projects.closeSession(r.session);
    const reset = await demo.resetDemo();
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    open.push(reset.session);
    expect(reset.manifest.project.summary).toBe('');
    await expect(access(firstCopy)).rejects.toThrow();
    expect(await hashTree(sampleSrc)).toBe(before);

    const dest = path.join(tmp, 'My Projects', 'Bridge-Copy');
    await mkdir(path.dirname(dest));
    const demoCopy = demo.currentCopy!;
    const saved = await demo.saveAsNew(reset.session, edited, dest);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    open.push(saved.session);
    expect(saved.session.isDemo).toBe(false);
    expect(saved.manifest.project.id).not.toBe(r.manifest.project.id);
    expect(saved.manifest.project.isSample).toBe(false);
    expect(saved.manifest.project.summary).toBe('Edited in demo');
    expect(await readFile(path.join(dest, '03-CAD-and-Technical-Drawings', 'elevation.svg'), 'utf8')).toContain('<svg');
    const meta = await readdir(path.join(dest, '.framelytix'));
    expect(meta).toContain('lock.json'); // the new project's own lock
    expect(await readdir(path.join(dest, '.framelytix', 'backups'))).toEqual([]);
    await expect(access(demoCopy)).rejects.toThrow();
    expect(await hashTree(sampleSrc)).toBe(before);

    // Destination must not exist.
    const again = await demo.saveAsNew(saved.session, saved.manifest, dest);
    expect(again.ok).toBe(false);
  });

  it('cleans up only demo copies inside its base', async () => {
    const stale = path.join(demo.base, '11111111-2222-4333-8444-555555555555');
    const other = path.join(demo.base, 'not-a-uuid');
    await mkdir(stale, { recursive: true });
    await mkdir(other, { recursive: true });
    await demo.cleanupOld();
    await expect(access(stale)).rejects.toThrow();
    await access(other);
  });
});

describe('export helpers', () => {
  it('suggests a dated, folder-safe report name', () => {
    const m = { project: { title: 'Pedestrian Truss Bridge — Concept!' } } as ProjectManifest;
    expect(suggestReportFileName(m, 'pdf', new Date(2026, 10, 4))).toBe('Pedestrian-Truss-Bridge-Concept-Design-Report-2026-11-04.pdf');
  });

  it('collects bounded image data URIs and reports missing files', async () => {
    const r = await demo.openDemo();
    if (!r.ok) throw new Error(r.message);
    open.push(r.session);
    const m = structuredClone(r.manifest);
    m.assets.push({ ...m.assets[0]!, id: 'a2', relativePath: 'missing.png' });
    const { images, missingAssetPaths } = await collectReportImages(r.session.rootPath, m);
    expect(images['03-CAD-and-Technical-Drawings/elevation.svg']).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(missingAssetPaths).toEqual(['missing.png']);
  });

  it('tracks exported paths only', () => {
    const t = new ExportTracker();
    const p = path.join(tmp, 'report.pdf');
    t.add(p);
    expect(t.has(p)).toBe(true);
    expect(t.has(path.join(tmp, 'other.pdf'))).toBe(false);
    expect(t.has('relative.pdf')).toBe(false);
  });
});
