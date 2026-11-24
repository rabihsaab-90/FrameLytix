/// <reference lib="dom" />
/**
 * Demo (sample bridge) workflow: navigation, decision matrix, constraints, traceability, viewers,
 * offline behaviour, demo reset and bundled-sample immutability.
 */
import { expect, test } from '@playwright/test';
import { confirmIfPrompted, explorer, h1, hashTree, launchApp, listEntries, makeTempDir, nav, removeDir, SAMPLE_DIR, shutdown, type Launched } from './fixtures';

test.describe.configure({ mode: 'serial' });

let L: Launched;
let userData: string;
let sampleHashBefore: Record<string, string>;
let sampleEntriesBefore: string[];

const matrixTable = () => L.page.getByRole('table', { name: 'Decision matrix' });
/** Cells of a tfoot row of the decision matrix (one per alternative: Pratt, Warren, Howe). */
const footRow = (name: RegExp) => matrixTable().getByRole('row', { name }).getByRole('cell');

test.beforeAll(async () => {
  sampleHashBefore = hashTree(SAMPLE_DIR);
  sampleEntriesBefore = listEntries(SAMPLE_DIR);
  userData = makeTempDir('demo-ud');
  L = await launchApp(userData);
});

test.afterAll(async () => {
  await shutdown(L);
  removeDir(userData);
});

test('1. launches and shows the welcome screen', async () => {
  const { page } = L;
  await expect(page.getByRole('heading', { level: 1, name: 'FrameLytix' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Load Sample Civil Bridge Project/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent Projects', exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/FrameLytix/);
});

test('2. loads the sample bridge project with one click', async () => {
  const { page } = L;
  await page.getByRole('button', { name: /Load Sample Civil Bridge Project/ }).click();
  await expect(explorer(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Demo mode' })).toBeVisible();
  await expect(page.getByText('Demo — temporary copy')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Main toolbar' }).getByText(/Pedestrian Truss Bridge/)).toBeVisible();
});

test('3. navigates every phase through the project explorer', async () => {
  const { page } = L;
  await nav(page, /^Design Criteria/);
  await expect(h1(page, 'Design Criteria')).toBeVisible();

  await nav(page, /^ARG-001/);
  await expect(page.getByRole('textbox', { name: 'Argument title' })).toHaveValue(/truss/i);

  await nav(page, /^Supporting calculations/);
  await expect(h1(page, 'Calculations')).toBeVisible();

  await nav(page, /^Technical asset register/);
  await expect(h1(page, 'Technical asset register')).toBeVisible();

  await nav(page, /^Requirements Traceability/);
  await expect(h1(page, 'Requirements Traceability Matrix')).toBeVisible();

  await nav(page, /^Risk Register/);
  await expect(h1(page, 'Risk Register')).toBeVisible();

  await nav(page, /^Review Checklist/);
  await expect(h1(page, 'Design Review')).toBeVisible();

  await nav(page, /^Report Preview/);
  await expect(h1(page, 'Report Preview & Export')).toBeVisible();
  await expect(page.getByTitle('Report preview')).toBeVisible();
});

test('4. opens ARG-001', async () => {
  const { page } = L;
  await nav(page, /^ARG-001/);
  await expect(page.getByRole('textbox', { name: 'Argument title' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Decision matrix' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Mandatory constraint evaluation' })).toBeVisible();
});

test('5-6. changing a score updates the weighted total to the arithmetic value', async () => {
  const { page } = L;
  // Sample: Howe scores Cost 3, Safety or Strength 3, Feasibility 3 with weights 30/40/30 => 3.00.
  await expect(footRow(/^Weighted total/).nth(2)).toHaveText('3.00');
  // Baseline totals for the other alternatives: Pratt (3,4,4) = 3.70; Warren (5,4,4) = 4.30.
  await expect(footRow(/^Weighted total/).nth(0)).toHaveText('3.70');
  await expect(footRow(/^Weighted total/).nth(1)).toHaveText('4.30');

  await page.getByLabel('Score for Howe truss on Cost', { exact: true }).selectOption('5');
  // (5*30 + 3*40 + 3*30) / 100 = 3.60
  await expect(footRow(/^Weighted total/).nth(2)).toHaveText('3.60');
  // The other totals are untouched.
  await expect(footRow(/^Weighted total/).nth(0)).toHaveText('3.70');
  await expect(footRow(/^Weighted total/).nth(1)).toHaveText('4.30');
  await expect(page.getByText(/Unsaved changes|All changes saved/)).toBeVisible();
});

test('7. failed mandatory constraint makes Warren ineligible; recommendation follows the constraint', async () => {
  const { page } = L;
  // Warren fails REQ-004 in the sample: ineligible, despite the highest raw score.
  await expect(footRow(/^Eligibility/).nth(1)).toContainText('Ineligible');
  await expect(footRow(/^Eligibility/).nth(1)).toContainText('REQ-004');
  await expect(footRow(/^Eligibility/).nth(0)).toContainText('Provisional');

  const highest = page.getByTestId('summary-highest');
  await expect(highest).toContainText('Warren truss');
  await expect(highest).toContainText('4.30');
  const recommended = page.getByTestId('summary-recommended');
  await expect(recommended).toContainText('Pratt truss');
  await expect(recommended).not.toContainText('Warren truss');
  await expect(recommended).toContainText('Provisional');
  await expect(footRow(/^Ranking/).nth(0)).toContainText('Recommended (provisional)');

  // Warren passes REQ-004 -> eligible-but-provisional (REQ-006 still unverified) and now the recommendation.
  const warrenReq4 = page.getByLabel('Constraint result for Warren truss against REQ-004', { exact: true });
  await warrenReq4.selectOption('pass');
  await expect(footRow(/^Eligibility/).nth(1)).toContainText('Provisional');
  await expect(footRow(/^Eligibility/).nth(1)).toContainText('Unverified: REQ-006');
  await expect(recommended).toContainText('Warren truss');
  await expect(recommended).toContainText('4.30');
  await expect(recommended).toContainText('Provisional');
  await expect(footRow(/^Ranking/).nth(1)).toContainText('Recommended (provisional)');
  await expect(footRow(/^Ranking/).nth(0)).not.toContainText('Recommended');

  // Revert: Warren fails again, Pratt is the recommendation again.
  await warrenReq4.selectOption('fail');
  await expect(footRow(/^Eligibility/).nth(1)).toContainText('Ineligible');
  await expect(recommended).toContainText('Pratt truss');
  await expect(footRow(/^Ranking/).nth(0)).toContainText('Recommended (provisional)');
  // Revert the score edit too.
  await page.getByLabel('Score for Howe truss on Cost', { exact: true }).selectOption('3');
  await expect(footRow(/^Weighted total/).nth(2)).toHaveText('3.00');
});

test('8. opens a linked requirement via its chip', async () => {
  const { page } = L;
  const chip = page.getByRole('button', { name: /REQ-004/ }).first();
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue('Maximum floor-beam spacing of 4.0 m');
  await expect(page.getByRole('region', { name: 'Requirements list' })).toContainText('REQ-004');
});

test('9. traceability: trace chain for REQ-001 and click-through', async () => {
  const { page } = L;
  await nav(page, /^Requirements Traceability/);
  await page.getByRole('button', { name: 'REQ-001', exact: true }).click();
  const chain = page.getByRole('complementary', { name: 'Trace of REQ-001' });
  await expect(chain).toBeVisible();
  await expect(chain.getByRole('button', { name: /ARG-001/ })).toBeVisible();
  await expect(chain.getByRole('button', { name: /CALC-002/ })).toBeVisible();
  await expect(chain.getByRole('button', { name: /DRW-001/ })).toBeVisible();
  // Drawing ID of the linked general arrangement appears in the asset record title / chain.
  await expect(chain).toContainText(/PTB-GA-001|General Arrangement/);

  await chain.getByRole('button', { name: /ARG-001/ }).click();
  await expect(page.getByRole('textbox', { name: 'Argument title' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Decision matrix' })).toBeVisible();
});

test('10. image viewer loads the PNG', async () => {
  const { page } = L;
  await nav(page, /^Technical asset register/);
  await page.getByRole('main').getByRole('button', { name: 'site-plan-sketch.png', exact: true }).click();
  await expect(h1(page, 'site-plan-sketch.png')).toBeVisible();
  const img = page.getByRole('img', { name: 'Preview of site-plan-sketch.png' });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { message: 'image naturalWidth' }).toBeGreaterThan(0);
});

test('11. PDF viewer renders a canvas and reports one page', async () => {
  const { page } = L;
  await nav(page, /^Technical asset register/);
  await page.getByRole('main').getByRole('button', { name: 'PTB-GA-001_General-Arrangement.pdf', exact: true }).click();
  await expect(h1(page, 'PTB-GA-001_General-Arrangement.pdf')).toBeVisible();
  const canvas = page.getByRole('img', { name: 'PDF page 1 of 1' });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const size = await canvas.evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }));
  expect(size.w).toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  await expect(page.getByTitle('Total pages')).toHaveText(/\/\s*1$/);
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('1');
});

test('12. STL viewer shows 684 triangles (or the documented WebGL fallback)', async () => {
  const { page } = L;
  const webgl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  await nav(page, /^Technical asset register/);
  await page.getByRole('main').getByRole('button', { name: 'PTB-Pratt-Truss-Concept.stl', exact: true }).click();
  await expect(h1(page, 'PTB-Pratt-Truss-Concept.stl')).toBeVisible();
  if (webgl) {
    await expect(page.getByRole('region', { name: /3D model preview/ })).toBeVisible({ timeout: 30_000 });
    const dt = page.getByText('Triangles', { exact: true });
    await expect(dt).toBeVisible({ timeout: 30_000 });
    await expect(dt.locator('xpath=following-sibling::dd[1]')).toHaveText('684');
  } else {
    await expect(page.getByText('3D preview requires WebGL, which is not available on this system')).toBeVisible();
  }
});

test('offline: no http(s) requests and bundled fonts are loaded', async () => {
  const { page, requests } = L;
  const remote = requests.filter((u) => /^https?:/i.test(u));
  expect(remote, 'http(s) requests issued by the renderer').toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return { inter: document.fonts.check('12px Inter'), mono: document.fonts.check('12px "JetBrains Mono"') };
  });
  expect(fonts.inter).toBe(true);
  expect(fonts.mono).toBe(true);
  // The Inter face must be an actual loaded file, not a system fallback.
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  expect(loaded.join(',')).toMatch(/Inter/);
});

test('23. Reset Demo discards a change', async () => {
  const { page } = L;
  // Re-open a fresh demo so the test is independent of earlier edits.
  await page.getByRole('button', { name: 'Home' }).click();
  await confirmIfPrompted(page, /Leave demo/, () => page.getByRole('button', { name: /Load Sample Civil Bridge Project/ }).waitFor());
  await page.getByRole('button', { name: /Load Sample Civil Bridge Project/ }).click();
  await expect(page.getByRole('region', { name: 'Demo mode' })).toBeVisible();

  await nav(page, /^Design Criteria/);
  await page.getByRole('button', { name: /REQ-001/ }).first().click();
  const title = page.getByRole('textbox', { name: /^Title/ });
  await expect(title).toHaveValue('Minimum clear span of 24.0 m');
  await title.fill('E2E temporary edit');
  await expect(page.getByRole('region', { name: 'Requirements list' })).toContainText('E2E temporary edit');

  await page.getByRole('button', { name: 'Reset Demo' }).click();
  await page.getByRole('dialog', { name: 'Reset demo project?' }).getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByText('Demo project reset to the original sample')).toBeVisible();

  await nav(page, /^Design Criteria/);
  await expect(page.getByRole('region', { name: 'Requirements list' })).toContainText('Minimum clear span of 24.0 m');
  await expect(page.getByRole('region', { name: 'Requirements list' })).not.toContainText('E2E temporary edit');
});

test('24. the bundled sample is unchanged, and no renderer errors occurred', async () => {
  expect(hashTree(SAMPLE_DIR)).toEqual(sampleHashBefore);
  expect(listEntries(SAMPLE_DIR)).toEqual(sampleEntriesBefore);
  expect(L.pageErrors).toEqual([]);
  expect(L.requests.filter((u) => /^https?:/i.test(u))).toEqual([]);
});

