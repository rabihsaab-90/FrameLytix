/**
 * Real-project lifecycle: onboarding -> folders on disk -> edit -> save -> close -> reopen (after a
 * full app restart) -> import with collisions -> HTML and PDF report export.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { toFolderName } from '../../shared/utilities/paths';
import { getTemplate } from '../../src/templates/templates';
import {
  confirmIfPrompted,
  explorer,
  h1,
  hashTree,
  launchApp,
  makePng,
  makeTempDir,
  nav,
  removeDir,
  SAMPLE_DIR,
  shutdown,
  stubOpenDialog,
  stubSaveDialog,
  type Launched
} from './fixtures';

test.describe.configure({ mode: 'serial' });

const TITLE = 'E2E Robotics Cell';
const REQ_TITLE = 'E2E persisted requirement';

let L: Launched;
let userData: string;
let parentDir: string;
let scratch: string;
let projectDir: string;
let sampleHashBefore: Record<string, string>;
const manifestPath = () => path.join(projectDir, 'framelytix-project.json');
const readManifest = () => JSON.parse(fs.readFileSync(manifestPath(), 'utf8')) as {
  project: { title: string; author: string; defaultAssetFolder?: string };
  settings: { defaultAssetFolder?: string };
  requirements: { code: string; title: string }[];
  assets: { relativePath: string }[];
};
const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function findFile(dir: string, name: string): string[] {
  const hits: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === name) hits.push(p);
    }
  };
  walk(dir);
  return hits;
}

test.beforeAll(() => {
  sampleHashBefore = hashTree(SAMPLE_DIR);
  userData = makeTempDir('life-ud');
  parentDir = makeTempDir('life-projects');
  scratch = makeTempDir('life-scratch');
});

test.afterAll(async () => {
  await shutdown(L);
  removeDir(userData);
  removeDir(parentDir);
  removeDir(scratch);
});

test('13. creates a Mechanical / Robotics System project through onboarding', async () => {
  L = await launchApp(userData);
  const { page, app } = L;
  await expect(page.getByRole('button', { name: /Load Sample Civil Bridge Project/ })).toBeVisible();
  await expect(page.getByText('No recent projects')).toBeVisible();

  await stubOpenDialog(app, [parentDir]);
  await page.getByRole('button', { name: /Create New Project/ }).click();
  await expect(page.getByRole('heading', { name: 'New Project' })).toBeVisible();

  await page.getByRole('radio', { name: /Mechanical/ }).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Robotics System/ }).click();
  await page.getByLabel('Project title').fill(TITLE);
  await page.getByLabel('Author or team').fill('E2E Tester');
  await page.getByRole('button', { name: /Choose/ }).click();
  await expect(page.getByLabel('Parent folder')).toHaveValue(parentDir);
  await expect(page.getByText('Ready.')).toBeVisible();

  const create = page.getByRole('button', { name: 'Create Project' });
  await expect(create).toBeEnabled();
  await create.click();

  await expect(page.getByRole('navigation', { name: 'Project explorer' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' }).getByText(TITLE)).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect(page.getByText('Demo — temporary copy')).toHaveCount(0);
});

test('14. physical project folders exist on disk', async () => {
  const entries = fs.readdirSync(parentDir);
  expect(entries).toEqual([toFolderName(TITLE)]);
  projectDir = path.join(parentDir, entries[0]!);
  expect(fs.statSync(projectDir).isDirectory()).toBe(true);
  expect(fs.statSync(manifestPath()).isFile()).toBe(true);
  expect(fs.statSync(path.join(projectDir, '.framelytix', 'backups')).isDirectory()).toBe(true);

  const template = getTemplate('mech-robotics');
  expect(template, 'template mech-robotics').toBeDefined();
  expect(template!.folders.length).toBeGreaterThan(4);
  for (const f of template!.folders) {
    expect(fs.statSync(path.join(projectDir, ...f.split('/'))).isDirectory(), `folder ${f}`).toBe(true);
  }
  const m = readManifest();
  expect(m.project.title).toBe(TITLE);
  expect(m.project.author).toBe('E2E Tester');
});

test('15-16. creates a requirement, edits its title and saves with Ctrl+S', async () => {
  const { page } = L;
  await nav(page, /^All requirements/);
  await page.getByRole('button', { name: 'New requirement' }).first().click();
  const title = page.getByRole('textbox', { name: /^Title/ });
  await expect(title).toHaveValue('New requirement');
  await title.fill(REQ_TITLE);
  await page.keyboard.press('Control+S');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect.poll(() => readManifest().requirements.map((r) => r.title)).toContain(REQ_TITLE);
});

test('17. Home closes the project and returns to the welcome screen', async () => {
  const { page } = L;
  await page.getByRole('button', { name: 'Home' }).click();
  await confirmIfPrompted(page, /^Save$/, () => page.getByRole('button', { name: /Load Sample Civil Bridge Project/ }).waitFor());
  await expect(page.getByRole('button', { name: /Load Sample Civil Bridge Project/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Demo mode' })).toHaveCount(0);
});

test('18. reopens from Recent Projects after restarting the app; the title persisted', async () => {
  await L.app.close();
  L = await launchApp(userData);
  const { page } = L;
  const recent = page.getByRole('list', { name: 'Recent projects' });
  await expect(recent.getByText(TITLE)).toBeVisible();
  await page.getByRole('button', { name: `Open ${TITLE}` }).click();
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' }).getByText(TITLE)).toBeVisible();
  await nav(page, /^All requirements/);
  await expect(page.getByRole('region', { name: 'Requirements list' })).toContainText(REQ_TITLE);
  const m = readManifest();
  expect(m.requirements.some((r) => r.title === REQ_TITLE)).toBe(true);
});

test('19. imports an asset, then handles a name collision with the default Skip', async () => {
  const { page, app } = L;
  const srcA = path.join(scratch, 'a', 'e2e-import.png');
  const srcB = path.join(scratch, 'b', 'e2e-import.png');
  fs.mkdirSync(path.dirname(srcA), { recursive: true });
  fs.mkdirSync(path.dirname(srcB), { recursive: true });
  fs.writeFileSync(srcA, makePng([255, 0, 0], 4));
  fs.writeFileSync(srcB, makePng([0, 0, 255], 4));
  const hashA = sha(srcA);
  expect(hashA).not.toBe(sha(srcB));

  // First import (Phase 3 import button).
  await stubOpenDialog(app, [srcA]);
  await explorer(page).getByRole('button', { name: 'Import files', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import files into project' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Files to import' })).toContainText('e2e-import.png');
  await expect(dialog.getByText('New', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import 1 file' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('1 file imported')).toBeVisible();

  const copies = findFile(projectDir, 'e2e-import.png');
  expect(copies).toHaveLength(1);
  const imported = copies[0]!;
  expect(sha(imported)).toBe(hashA);
  expect(path.relative(projectDir, imported).startsWith('03-')).toBe(true);
  const rel = path.relative(projectDir, imported).split(path.sep).join('/');

  await nav(page, /^Technical asset register/);
  await expect(page.getByRole('button', { name: 'e2e-import.png', exact: true })).toBeVisible();
  await page.keyboard.press('Control+S');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect.poll(() => readManifest().assets.map((a) => a.relativePath)).toContain(rel);

  // Second import: same file name, different content -> collision, default choice is Skip.
  await stubOpenDialog(app, [srcB]);
  await page.getByRole('button', { name: 'Import files…' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Name exists')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Skip' })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /Keep both/ })).not.toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Replace existing' })).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Nothing to import' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(findFile(projectDir, 'e2e-import.png')).toEqual([imported]);
  expect(sha(imported)).toBe(hashA);

  // Re-importing the identical file is reported as identical, and is skipped by default.
  await stubOpenDialog(app, [srcA]);
  await page.getByRole('button', { name: 'Import files…' }).click();
  await expect(dialog.getByText('Identical file already in project.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Nothing to import' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(findFile(projectDir, 'e2e-import.png')).toEqual([imported]);
});

test('20-22. exports HTML and PDF reports to disk', async () => {
  const { page, app } = L;
  await nav(page, /^Report Preview/);
  await expect(h1(page, 'Report Preview & Export')).toBeVisible();
  await expect(page.getByTitle('Report preview')).toBeVisible();

  const htmlOut = path.join(scratch, 'exports', 'e2e-report.html');
  const pdfOut = path.join(scratch, 'exports', 'e2e-report.pdf');
  fs.mkdirSync(path.dirname(htmlOut), { recursive: true });

  await stubSaveDialog(app, htmlOut);
  await page.getByRole('button', { name: 'Export HTML' }).click();
  await expect(page.getByText(htmlOut).first()).toBeVisible();
  const html = fs.readFileSync(htmlOut, 'utf8');
  expect(html).toContain(TITLE);
  expect(html.toLowerCase()).not.toContain('<script');

  await stubSaveDialog(app, pdfOut);
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page.getByText(pdfOut).first()).toBeVisible({ timeout: 45_000 });
  const pdf = fs.readFileSync(pdfOut);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10 * 1024);
});

test('bundled sample is untouched, no remote requests, no renderer errors', async () => {
  expect(hashTree(SAMPLE_DIR)).toEqual(sampleHashBefore);
  expect(L.requests.filter((u) => /^https?:/i.test(u))).toEqual([]);
  expect(L.pageErrors).toEqual([]);
});

