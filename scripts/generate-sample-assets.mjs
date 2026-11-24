/**
 * Generates the files of the bundled educational sample project
 * samples/pedestrian-truss-bridge/ (everything except framelytix-project.json, which
 * is produced by scripts/build-sample-manifest.mjs AFTER this script runs).
 *
 * Geometry used consistently everywhere: Pratt through-truss, clear span L = 24.0 m,
 * 6 panels x 4.0 m, depth h = 3.0 m, two trusses at 2.9 m centres, clear deck width 2.5 m.
 * Fictional, conceptual, NOT FOR CONSTRUCTION. Output is deterministic.
 *
 * Run: node scripts/generate-sample-assets.mjs
 */
import { mkdir, writeFile, readdir, utimes } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = join(root, 'samples', 'pedestrian-truss-bridge');
const p = (...s) => join(S, ...s);
const FIXED_MTIME = new Date('2026-11-20T10:00:00.000Z');

const FOLDERS = [
  '01-Scope-and-Requirements/Design-Criteria',
  '01-Scope-and-Requirements/Load-and-Safety-Constraints',
  '01-Scope-and-Requirements/Site-and-Environment',
  '02-Engineering-Arguments/Material-Selection',
  '02-Engineering-Arguments/Truss-Configuration',
  '02-Engineering-Arguments/Supporting-Calculations',
  '03-CAD-and-Technical-Drawings/AutoCAD-2D',
  '03-CAD-and-Technical-Drawings/3D-Models',
  '03-CAD-and-Technical-Drawings/Diagrams-and-Schematics',
  '04-Design-Review-and-Export/Review-Documents',
  '04-Design-Review-and-Export/Reports',
  '.framelytix/backups'
];
for (const f of FOLDERS) await mkdir(p(f), { recursive: true });

const written = [];
async function put(rel, data) {
  await writeFile(p(rel), data);
  written.push(rel);
}

// ---------------------------------------------------------------------------
// Concept constants
// ---------------------------------------------------------------------------
const L = 24.0, NP = 6, PW = 4.0, H = 3.0, GAUGE = 2.9, DECK_W = 2.5;
const Q = 4.0; // kPa, illustrative
const W = Q * DECK_W; // kN/m
const MMAX = (W * L * L) / 8;
const R = (W * L) / 2;
const F = MMAX / H;
const SIGMA = 150; // MPa, illustrative
const AREQ = (F * 1000) / SIGMA; // mm2

// ---------------------------------------------------------------------------
// 1. Binary STL
// ---------------------------------------------------------------------------
const tris = [];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => mul(a, 1 / Math.hypot(...a));

/** Rectangular box along p0->p1 with cross-section wu (about u) x wv (about v). */
function box(p0, p1, wu, wv, uHint = [0, 1, 0]) {
  const d = norm(sub(p1, p0));
  let u = uHint;
  if (Math.abs(dot(d, u)) > 0.99) u = [1, 0, 0];
  u = norm(sub(u, mul(d, dot(u, d)))); // orthogonalise
  const v = norm(cross(d, u));
  const ends = [p0, p1];
  const c = (a, i, j) => add(add(ends[a], mul(u, (i ? 0.5 : -0.5) * wu)), mul(v, (j ? 0.5 : -0.5) * wv));
  const centre = mul(add(p0, p1), 0.5);
  const quads = [];
  for (const a of [0, 1]) quads.push([c(a, 0, 0), c(a, 1, 0), c(a, 1, 1), c(a, 0, 1)]);
  for (const i of [0, 1]) quads.push([c(0, i, 0), c(1, i, 0), c(1, i, 1), c(0, i, 1)]);
  for (const j of [0, 1]) quads.push([c(0, 0, j), c(1, 0, j), c(1, 1, j), c(0, 1, j)]);
  for (const q of quads) {
    const fc = mul(add(add(q[0], q[1]), add(q[2], q[3])), 0.25);
    const n = cross(sub(q[1], q[0]), sub(q[2], q[0]));
    const flip = dot(n, sub(fc, centre)) < 0;
    const [a, b, cc, dd] = flip ? [q[0], q[3], q[2], q[1]] : q;
    tris.push([a, b, cc], [a, cc, dd]);
  }
}

const px = (i) => i * PW;
const yTr = [-GAUGE / 2, GAUGE / 2];
for (const y of yTr) {
  const P = (x, z) => [x, y, z];
  for (let i = 0; i < NP; i++) box(P(px(i), 0), P(px(i + 1), 0), 0.3, 0.3); // bottom chord
  for (let i = 1; i < NP - 1; i++) box(P(px(i), H), P(px(i + 1), H), 0.3, 0.3); // top chord (panels 2..5)
  for (let i = 1; i <= NP - 1; i++) box(P(px(i), 0), P(px(i), H), 0.2, 0.2); // verticals
  box(P(px(0), 0), P(px(1), H), 0.25, 0.25); // end posts
  box(P(px(6), 0), P(px(5), H), 0.25, 0.25);
  // Pratt tension diagonals slope down toward midspan
  box(P(px(1), H), P(px(2), 0), 0.15, 0.15);
  box(P(px(2), H), P(px(3), 0), 0.15, 0.15);
  box(P(px(5), H), P(px(4), 0), 0.15, 0.15);
  box(P(px(4), H), P(px(3), 0), 0.15, 0.15);
}
for (let i = 0; i <= NP; i++) box([px(i), -1.6, -0.325], [px(i), 1.6, -0.325], 0.2, 0.35, [1, 0, 0]); // floor beams
box([0, 0, -0.075], [L, 0, -0.075], DECK_W, 0.15); // deck slab
for (let i = 1; i <= NP - 1; i++) box([px(i), -GAUGE / 2, H], [px(i), GAUGE / 2, H], 0.15, 0.15, [1, 0, 0]); // top lateral struts
box([-0.5, -2.2, -1.75], [-0.5, 2.2, -1.75], 2.0, 2.5, [1, 0, 0]); // west abutment (2.0 x 4.4 x 2.5)
box([L + 0.5, -2.2, -1.75], [L + 0.5, 2.2, -1.75], 2.0, 2.5, [1, 0, 0]);

const stl = Buffer.alloc(84 + 50 * tris.length);
stl.write('FrameLytix sample - Pratt truss concept - units: metres - NOT FOR CONSTRUCTION', 0, 'latin1');
stl.writeUInt32LE(tris.length, 80);
tris.forEach((t, k) => {
  const n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
  const o = 84 + 50 * k;
  [...n, ...t[0], ...t[1], ...t[2]].forEach((val, idx) => stl.writeFloatLE(val, o + idx * 4));
  stl.writeUInt16LE(0, o + 48);
});
await put('03-CAD-and-Technical-Drawings/3D-Models/PTB-Pratt-Truss-Concept.stl', stl);
console.log('STL triangles:', tris.length);

// ---------------------------------------------------------------------------
// 2. General arrangement PDF (ANSI B landscape, 17 x 11 in = 1224 x 792 pt)
// ---------------------------------------------------------------------------
{
  const doc = await PDFDocument.create();
  doc.setTitle('PTB-GA-001 General Arrangement - Pedestrian Truss Bridge (educational sample)');
  doc.setAuthor('FrameLytix Sample Team');
  doc.setProducer('FrameLytix sample generator');
  doc.setCreator('FrameLytix sample generator');
  doc.setCreationDate(new Date('2026-11-24T09:00:00.000Z'));
  doc.setModificationDate(new Date('2026-11-24T09:00:00.000Z'));
  const page = doc.addPage([1224, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.1);
  const grey = rgb(0.45, 0.45, 0.48);
  const red = rgb(0.75, 0.1, 0.1);
  const line = (x1, y1, x2, y2, t = 0.8, c = ink, dash) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color: c, dashArray: dash });
  const text = (s, x, y, size = 9, f = font, c = ink) => page.drawText(s, { x, y, size, font: f, color: c });
  const ctext = (s, cx, y, size = 9, f = font, c = ink) => text(s, cx - f.widthOfTextAtSize(s, size) / 2, y, size, f, c);
  const rect = (x, y, w, h, t = 0.8, fill) =>
    page.drawRectangle({ x, y, width: w, height: h, borderWidth: t, borderColor: ink, color: fill });

  // border
  rect(18, 18, 1188, 756, 2);
  rect(24, 24, 1176, 744, 0.6);
  // notice
  rect(60, 728, 1104, 32, 1.5, rgb(1, 0.93, 0.93));
  ctext('CONCEPTUAL - EDUCATIONAL SAMPLE - NOT FOR CONSTRUCTION', 612, 738, 18, bold, red);

  // dimension helper (horizontal)
  const dimH = (x1, x2, y, label) => {
    line(x1, y - 4, x2, y - 4, 0.6);
    line(x1, y - 8, x1, y + 6, 0.6);
    line(x2, y - 8, x2, y + 6, 0.6);
    ctext(label, (x1 + x2) / 2, y - 3 + 3, 8, font);
  };

  // ---- Elevation ----
  const sc = 28, x0 = 80, yb = 590;
  const X = (m) => x0 + m * sc;
  const Z = (m) => yb + m * sc;
  text('ELEVATION (one truss shown, Pratt through truss)', 80, 702, 11, bold);
  text('SCALE: NTS', 80, 690, 8, font, grey);
  // chords
  line(X(0), Z(0), X(24), Z(0), 3);
  line(X(4), Z(3), X(20), Z(3), 3);
  // end posts
  line(X(0), Z(0), X(4), Z(3), 2.2);
  line(X(24), Z(0), X(20), Z(3), 2.2);
  // verticals
  for (let i = 1; i <= 5; i++) line(X(i * 4), Z(0), X(i * 4), Z(3), 1.6);
  // diagonals (slope toward midspan)
  line(X(4), Z(3), X(8), Z(0), 1.2);
  line(X(8), Z(3), X(12), Z(0), 1.2);
  line(X(20), Z(3), X(16), Z(0), 1.2);
  line(X(16), Z(3), X(12), Z(0), 1.2);
  // nodes
  for (let i = 0; i <= 6; i++) page.drawCircle({ x: X(i * 4), y: Z(0), size: 3.2, color: ink });
  for (let i = 1; i <= 5; i++) page.drawCircle({ x: X(i * 4), y: Z(3), size: 3.2, color: ink });
  // supports
  for (const m of [0, 24]) {
    page.drawSvgPath(`M 0 0 L -9 14 L 9 14 Z`, { x: X(m), y: Z(0) - 3, borderWidth: 0.8, borderColor: ink, scale: 1 });
  }
  // panel labels
  for (let i = 0; i <= 6; i++) ctext(String(i), X(i * 4), Z(0) - 28, 8, font, grey);
  // dims
  for (let i = 0; i < 6; i++) dimH(X(i * 4), X(i * 4 + 4), yb - 50, '4.0 m');
  ctext('6 @ 4.0 m', X(12), yb - 40 - 0, 8, font, grey);
  dimH(X(0), X(24), yb - 72, 'CLEAR SPAN L = 24.0 m');
  // depth dim
  line(X(24) + 26, Z(0), X(24) + 26, Z(3), 0.6);
  line(X(24) + 20, Z(0), X(24) + 32, Z(0), 0.6);
  line(X(24) + 20, Z(3), X(24) + 32, Z(3), 0.6);
  text('h = 3.0 m', X(24) + 36, Z(1.5) - 3, 8);
  text('TOP CHORD', X(10) - 18, Z(3) + 6, 7, font, grey);
  text('BOTTOM CHORD / DECK LEVEL', X(8) - 10, Z(0) - 18 + 0, 7, font, grey);

  // ---- Plan ----
  const py = 360; // centreline
  const half = (GAUGE / 2) * sc;
  text('PLAN (deck at bottom chord; top lateral bracing shown dashed)', 80, 458, 11, bold);
  text('SCALE: NTS', 80, 446, 8, font, grey);
  line(X(0), py + half, X(24), py + half, 3);
  line(X(0), py - half, X(24), py - half, 3);
  const dw = (DECK_W / 2) * sc;
  rect(X(0), py - dw, 24 * sc, 2 * dw, 0.6, rgb(0.93, 0.93, 0.95));
  for (let i = 0; i <= 6; i++) line(X(i * 4), py + half + 6, X(i * 4), py - half - 6, 1.4); // floor beams
  for (let i = 1; i < 5; i++) {
    line(X(i * 4), py + half, X(i * 4 + 4), py - half, 0.7, grey, [4, 3]);
    line(X(i * 4), py - half, X(i * 4 + 4), py + half, 0.7, grey, [4, 3]);
  }
  for (let i = 1; i <= 5; i++) line(X(i * 4), py + half, X(i * 4), py - half, 1, grey, [4, 3]); // top struts
  rect(X(0) - 30, py - 50, 30, 100, 0.8, rgb(0.85, 0.85, 0.87));
  rect(X(24), py - 50, 30, 100, 0.8, rgb(0.85, 0.85, 0.87));
  text('ABUT.', X(0) - 28, py - 4, 7, font, grey);
  text('ABUT.', X(24) + 3, py - 4, 7, font, grey);
  // plan dims
  line(X(24) + 40, py + half, X(24) + 40, py - half, 0.6);
  line(X(24) + 34, py + half, X(24) + 46, py + half, 0.6);
  line(X(24) + 34, py - half, X(24) + 46, py - half, 0.6);
  text('2.9 m', X(24) + 50, py - 3, 8);
  ctext('Floor beam at each panel point (spacing 4.0 m)', X(12), py - half - 22, 8, font, grey);
  // section cut marks
  text('A', X(12) - 3, py + half + 14, 10, bold, red);
  text('A', X(12) - 3, py - half - 36, 10, bold, red);
  line(X(12), py + half + 8, X(12), py + half + 12, 1.2, red);

  // ---- Cross-section ----
  const cx = 1000, cb = 520, cs = 42;
  const CX = (m) => cx + m * cs, CZ = (m) => cb + m * cs;
  text('SECTION A-A (through truss, looking along span)', 780, 702, 11, bold);
  text('SCALE: NTS', 780, 690, 8, font, grey);
  for (const s of [-1, 1]) {
    const xx = CX((s * GAUGE) / 2);
    line(xx, CZ(0), xx, CZ(3), 2);
    page.drawRectangle({ x: xx - 5, y: CZ(0) - 5, width: 10, height: 10, color: ink });
    page.drawRectangle({ x: xx - 5, y: CZ(3) - 5, width: 10, height: 10, color: ink });
  }
  line(CX(-GAUGE / 2), CZ(3), CX(GAUGE / 2), CZ(3), 1.4); // top strut
  line(CX(-1.6), CZ(-0.325), CX(1.6), CZ(-0.325), 3); // floor beam
  rect(CX(-DECK_W / 2), CZ(-0.15) + 0, DECK_W * cs, 7, 0.8, rgb(0.8, 0.8, 0.84)); // deck
  // clear width dim
  const dy = CZ(0) + 34;
  line(CX(-1.25), dy, CX(1.25), dy, 0.6);
  line(CX(-1.25), dy - 6, CX(-1.25), dy + 6, 0.6);
  line(CX(1.25), dy - 6, CX(1.25), dy + 6, 0.6);
  ctext('CLEAR DECK WIDTH 2.5 m', cx, dy + 8, 8);
  const dy2 = CZ(-0.325) - 40;
  line(CX(-1.45), dy2, CX(1.45), dy2, 0.6);
  line(CX(-1.45), dy2 - 6, CX(-1.45), dy2 + 6, 0.6);
  line(CX(1.45), dy2 - 6, CX(1.45), dy2 + 6, 0.6);
  ctext('TRUSS CENTRES 2.9 m', cx, dy2 - 14, 8);
  ctext('Top lateral bracing', cx, CZ(3) + 12, 7, font, grey);
  ctext('Floor beam', cx, CZ(-0.325) - 16, 7, font, grey);
  ctext('Deck (through truss, at bottom chord)', cx, CZ(0) + 48, 7, font, grey);

  // ---- Notes ----
  text('GENERAL NOTES', 80, 262, 11, bold);
  const notes = [
    '1. This drawing is a FICTIONAL, CONCEPTUAL, EDUCATIONAL SAMPLE produced to demonstrate FrameLytix. It is not a real project.',
    '2. NOT FOR CONSTRUCTION. Not designed, checked or sealed by a qualified engineer. No code compliance is claimed.',
    '3. All dimensions are in metres unless noted. Dimensions shown are conceptual and illustrative.',
    '4. Illustrative assumption: pedestrian live load q = 4.0 kPa, over 2.5 m clear width gives w = 10.0 kN/m. This value is NOT taken from any code.',
    '5. The governing design code, load combinations and serviceability (deflection / vibration) limits are to be confirmed by a qualified engineer.',
    '6. Illustrative allowable stress 150 MPa used only for the conceptual chord sizing check (see CALC-001 to CALC-005).',
    '7. Member sizes are not shown. The 3D concept model (MOD-001) uses placeholder cross-sections only.',
    '8. Corrosion protection, bearings, connections and foundations are not developed at this stage.'
  ];
  notes.forEach((n, i) => text(n, 80, 244 - i * 15, 8.5));

  // ---- Title block ----
  const tx = 800, ty = 36, tw = 392, th = 190;
  rect(tx, ty, tw, th, 1.5);
  const rows = [
    ['PROJECT', 'Pedestrian Truss Bridge - Conceptual Design Study'],
    ['DRAWING', 'General Arrangement'],
    ['DRAWING NO.', 'DRW-001 (PTB-GA-001)'],
    ['REVISION', 'REV-B'],
    ['SCALE', 'NTS'],
    ['DATE', '2026-11-24'],
    ['DRAWN BY', 'FrameLytix Sample Team'],
    ['STATUS', 'CONCEPTUAL - NOT FOR CONSTRUCTION']
  ];
  const rh = th / rows.length;
  rows.forEach(([k, v], i) => {
    const yy = ty + th - (i + 1) * rh;
    if (i > 0) line(tx, yy + rh, tx + tw, yy + rh, 0.6);
    text(k, tx + 8, yy + 7, 7, font, grey);
    text(v, tx + 100, yy + 7, i === 0 ? 10 : 11, bold);
  });
  line(tx + 92, ty, tx + 92, ty + th, 0.6);
  text('Educational sample generated by FrameLytix. Fictional project.', tx, ty - 0 + th + 6, 7, font, grey);

  const bytes = await doc.save({ useObjectStreams: false });
  await put('03-CAD-and-Technical-Drawings/AutoCAD-2D/PTB-GA-001_General-Arrangement.pdf', Buffer.from(bytes));
}

// ---------------------------------------------------------------------------
// 3. SVG diagrams (static, no scripts, no external references)
// ---------------------------------------------------------------------------
const FONT = `font-family="Arial, Helvetica, sans-serif"`;
{
  const sc = 28; // px/m
  const ox = 120;
  const ln = (x1, y1, x2, y2, w = 2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#18181B" stroke-width="${w}" stroke-linecap="round"/>`;
  const nodes = (pts) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#18181B"/>`).join('');
  function frame(title, sub, yTop, build) {
    const yb = yTop + 84;
    const parts = [`<text x="${ox}" y="${yTop - 42}" ${FONT} font-size="17" font-weight="700" fill="#18181B">${title}</text>`,
      `<text x="${ox}" y="${yTop - 26}" ${FONT} font-size="12" fill="#52525B">${sub}</text>`];
    parts.push(...build(yTop, yb));
    return parts.join('\n');
  }
  const X = (m) => ox + m * sc;
  const pratt = frame('Pratt truss', 'Diagonals slope down toward midspan (tension); verticals in compression. Panels 6 @ 4.0 m.', 70, (yt, yb) => {
    const o = [ln(X(0), yb, X(24), yb, 3), ln(X(4), yt, X(20), yt, 3), ln(X(0), yb, X(4), yt, 2.5), ln(X(24), yb, X(20), yt, 2.5)];
    for (let i = 1; i <= 5; i++) o.push(ln(X(i * 4), yt, X(i * 4), yb, 1.8));
    o.push(ln(X(4), yt, X(8), yb), ln(X(8), yt, X(12), yb), ln(X(20), yt, X(16), yb), ln(X(16), yt, X(12), yb));
    o.push(nodes([...[0, 4, 8, 12, 16, 20, 24].map((m) => [X(m), yb]), ...[4, 8, 12, 16, 20].map((m) => [X(m), yt])]));
    o.push(`<text x="${X(24) + 20}" y="${(yt + yb) / 2 + 4}" ${FONT} font-size="12" fill="#52525B">h = 3.0 m</text>`);
    return o;
  });
  const warren = frame('Warren truss', 'Alternating diagonals, no verticals. Panels 4 @ 6.0 m (as assessed in ARG-001).', 250, (yt, yb) => {
    const o = [ln(X(0), yb, X(24), yb, 3), ln(X(3), yt, X(21), yt, 3)];
    const bot = [0, 6, 12, 18, 24], top = [3, 9, 15, 21];
    for (let i = 0; i < 4; i++) o.push(ln(X(bot[i]), yb, X(top[i]), yt), ln(X(top[i]), yt, X(bot[i + 1]), yb));
    o.push(nodes([...bot.map((m) => [X(m), yb]), ...top.map((m) => [X(m), yt])]));
    o.push(`<text x="${X(24) + 20}" y="${(yt + yb) / 2 + 4}" ${FONT} font-size="12" fill="#52525B">h = 3.0 m</text>`);
    return o;
  });
  const howe = frame('Howe truss', 'Diagonals slope up toward midspan (compression); verticals in tension. Panels 6 @ 4.0 m.', 430, (yt, yb) => {
    const o = [ln(X(0), yb, X(24), yb, 3), ln(X(4), yt, X(20), yt, 3), ln(X(0), yb, X(4), yt, 2.5), ln(X(24), yb, X(20), yt, 2.5)];
    for (let i = 1; i <= 5; i++) o.push(ln(X(i * 4), yt, X(i * 4), yb, 1.8));
    o.push(ln(X(4), yb, X(8), yt), ln(X(8), yb, X(12), yt), ln(X(20), yb, X(16), yt), ln(X(16), yb, X(12), yt));
    o.push(nodes([...[0, 4, 8, 12, 16, 20, 24].map((m) => [X(m), yb]), ...[4, 8, 12, 16, 20].map((m) => [X(m), yt])]));
    o.push(`<text x="${X(24) + 20}" y="${(yt + yb) / 2 + 4}" ${FONT} font-size="12" fill="#52525B">h = 3.0 m</text>`);
    return o;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="960" height="600">
<title>Truss configurations compared: Pratt, Warren, Howe</title>
<rect width="960" height="600" fill="#FFFFFF"/>
${pratt}
${warren}
${howe}
<text x="${ox}" y="580" ${FONT} font-size="11" fill="#71717A">Schematic elevations, not to scale for member sizes. Educational sample - NOT FOR CONSTRUCTION.</text>
</svg>
`;
  await put('03-CAD-and-Technical-Drawings/Diagrams-and-Schematics/truss-configurations.svg', svg);
}
{
  const bx = 100, bw = 760, by = 190; // beam from x=100..860 at y=190
  const bendBase = 360;
  const peak = 130; // px for 720 kN.m
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    pts.push(`${(bx + t * bw).toFixed(2)},${(bendBase + 4 * t * (1 - t) * peak).toFixed(2)}`);
  }
  let arrows = '';
  for (let i = 0; i <= 12; i++) {
    const x = bx + (i / 12) * bw;
    arrows += `<line x1="${x}" y1="108" x2="${x}" y2="${by - 8}" stroke="#B91C1C" stroke-width="1.6"/><polygon points="${x - 4},${by - 14} ${x + 4},${by - 14} ${x},${by - 4}" fill="#B91C1C"/>\n`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="960" height="600">
<title>Simply supported beam load diagram: w = 10.0 kN/m, L = 24.0 m</title>
<rect width="960" height="600" fill="#FFFFFF"/>
<text x="100" y="40" ${FONT} font-size="18" font-weight="700" fill="#18181B">Load diagram - simply supported span (conceptual)</text>
<text x="100" y="60" ${FONT} font-size="12" fill="#52525B">Illustrative values: q = 4.0 kPa x b = 2.5 m gives w = 10.0 kN/m. Not taken from any code.</text>
<line x1="${bx}" y1="108" x2="${bx + bw}" y2="108" stroke="#B91C1C" stroke-width="1.6"/>
${arrows}<text x="${bx + bw / 2}" y="98" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="#B91C1C">w = 10.0 kN/m (UDL)</text>
<line x1="${bx}" y1="${by}" x2="${bx + bw}" y2="${by}" stroke="#18181B" stroke-width="5"/>
<polygon points="${bx},${by + 3} ${bx - 14},${by + 28} ${bx + 14},${by + 28}" fill="none" stroke="#18181B" stroke-width="2"/>
<circle cx="${bx + bw}" cy="${by + 17}" r="10" fill="none" stroke="#18181B" stroke-width="2"/>
<line x1="${bx + bw - 14}" y1="${by + 29}" x2="${bx + bw + 14}" y2="${by + 29}" stroke="#18181B" stroke-width="2"/>
<line x1="${bx}" y1="${by + 70}" x2="${bx}" y2="${by + 36}" stroke="#047857" stroke-width="2.5"/><polygon points="${bx - 5},${by + 44} ${bx + 5},${by + 44} ${bx},${by + 34}" fill="#047857"/>
<line x1="${bx + bw}" y1="${by + 70}" x2="${bx + bw}" y2="${by + 36}" stroke="#047857" stroke-width="2.5"/><polygon points="${bx + bw - 5},${by + 44} ${bx + bw + 5},${by + 44} ${bx + bw},${by + 34}" fill="#047857"/>
<text x="${bx + 10}" y="${by + 62}" ${FONT} font-size="13" font-weight="700" fill="#047857">R = 120 kN</text>
<text x="${bx + bw - 10}" y="${by + 62}" text-anchor="end" ${FONT} font-size="13" font-weight="700" fill="#047857">R = 120 kN</text>
<line x1="${bx}" y1="${by + 88}" x2="${bx + bw}" y2="${by + 88}" stroke="#52525B" stroke-width="1"/>
<line x1="${bx}" y1="${by + 82}" x2="${bx}" y2="${by + 94}" stroke="#52525B" stroke-width="1"/>
<line x1="${bx + bw}" y1="${by + 82}" x2="${bx + bw}" y2="${by + 94}" stroke="#52525B" stroke-width="1"/>
<text x="${bx + bw / 2}" y="${by + 82}" text-anchor="middle" ${FONT} font-size="13" fill="#18181B">L = 24.0 m</text>
<text x="100" y="${bendBase - 34}" ${FONT} font-size="14" font-weight="700" fill="#18181B">Bending moment diagram (parabolic, sagging plotted downward)</text>
<line x1="${bx}" y1="${bendBase}" x2="${bx + bw}" y2="${bendBase}" stroke="#18181B" stroke-width="1.5"/>
<polygon points="${bx},${bendBase} ${pts.join(' ')}" fill="#FEE2E2" fill-opacity="0.7" stroke="none"/>
<polyline points="${pts.join(' ')}" fill="none" stroke="#B91C1C" stroke-width="2.5"/>
<line x1="${bx + bw / 2}" y1="${bendBase}" x2="${bx + bw / 2}" y2="${bendBase + peak}" stroke="#18181B" stroke-width="1" stroke-dasharray="4 3"/>
<text x="${bx + bw / 2 + 10}" y="${bendBase + peak + 24}" ${FONT} font-size="13" font-weight="700" fill="#18181B">M_max = wL^2/8 = 720 kN.m (midspan)</text>
<text x="${bx}" y="${bendBase - 6}" ${FONT} font-size="12" fill="#52525B">M = 0</text>
<text x="${bx + bw}" y="${bendBase - 6}" text-anchor="end" ${FONT} font-size="12" fill="#52525B">M = 0</text>
<text x="100" y="${bendBase + peak + 56}" ${FONT} font-size="11.5" fill="#18181B">Chord force F = M_max / h = 720 / 3.0 = 240 kN   |   Required area A = F / sigma = 240000 N / 150 N/mm^2 = 1600 mm^2 (sigma = 150 MPa illustrative)</text>
<text x="100" y="${bendBase + peak + 76}" ${FONT} font-size="11" fill="#71717A">Educational sample - illustrative assumptions - NOT FOR CONSTRUCTION.</text>
</svg>
`;
  await put('03-CAD-and-Technical-Drawings/Diagrams-and-Schematics/load-diagram.svg', svg);
}

// ---------------------------------------------------------------------------
// 4. Site plan PNG (1600 x 1000)
// ---------------------------------------------------------------------------
{
  const creek = 'M -20 470 C 250 400, 450 560, 800 500 S 1350 430, 1620 520 L 1620 640 C 1350 550, 1100 630, 800 620 S 250 520, -20 590 Z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
<rect width="1600" height="1000" fill="#F4F4F0"/>
<g stroke="#E0E0DA" stroke-width="1">${Array.from({ length: 31 }, (_, i) => `<line x1="${i * 50 + 50}" y1="0" x2="${i * 50 + 50}" y2="1000"/>`).join('')}${Array.from({ length: 19 }, (_, i) => `<line x1="0" y1="${i * 50 + 50}" x2="1600" y2="${i * 50 + 50}"/>`).join('')}</g>
<path d="${creek}" fill="#BFD7E8" stroke="#6B93B0" stroke-width="3"/>
<path d="M 100 520 C 300 480, 500 560, 800 545 S 1300 490, 1500 550" stroke="#8FB4CC" stroke-width="2" fill="none" stroke-dasharray="14 10"/>
<text x="1260" y="500" text-anchor="middle" ${FONT} font-size="22" font-style="italic" fill="#3B6A8A">Creek channel (flow to the east)</text>
<text x="200" y="330" ${FONT} font-size="24" font-weight="700" fill="#3F3F46">NORTH BANK - park lawn</text>
<text x="200" y="860" ${FONT} font-size="24" font-weight="700" fill="#3F3F46">SOUTH BANK - parking and trailhead</text>
<path d="M 800 80 L 800 400" stroke="#A1A1AA" stroke-width="30" opacity="0.35"/>
<path d="M 800 660 L 800 940" stroke="#A1A1AA" stroke-width="30" opacity="0.35"/>
<text x="830" y="240" ${FONT} font-size="18" fill="#52525B">Existing path (approach)</text>
<text x="830" y="800" ${FONT} font-size="18" fill="#52525B">Existing path (approach)</text>
<rect x="780" y="404" width="40" height="70" fill="#52525B"/>
<rect x="780" y="620" width="40" height="70" fill="#52525B"/>
<text x="840" y="440" ${FONT} font-size="20" font-weight="700" fill="#18181B">North abutment (A1)</text>
<text x="840" y="660" ${FONT} font-size="20" font-weight="700" fill="#18181B">South abutment (A2)</text>
<line x1="800" y1="474" x2="800" y2="620" stroke="#B91C1C" stroke-width="6"/>
<rect x="788" y="520" width="24" height="52" fill="#DC2626" opacity="0.85"/>
<text x="840" y="740" ${FONT} font-size="20" font-weight="700" fill="#B91C1C">Truss bridge axis (span across creek)</text>
<line x1="740" y1="474" x2="740" y2="620" stroke="#18181B" stroke-width="1.5"/><line x1="730" y1="474" x2="750" y2="474" stroke="#18181B" stroke-width="1.5"/><line x1="730" y1="620" x2="750" y2="620" stroke="#18181B" stroke-width="1.5"/>
<text x="728" y="553" text-anchor="end" ${FONT} font-size="20" font-weight="700" fill="#18181B">24.0 m clear span (measured abutment to abutment)</text>
<g transform="translate(1440 140)"><circle r="52" fill="#FFFFFF" stroke="#18181B" stroke-width="2"/><polygon points="0,-44 14,10 0,0 -14,10" fill="#18181B"/><text y="40" text-anchor="middle" ${FONT} font-size="26" font-weight="700" fill="#18181B">N</text></g>
<rect x="30" y="30" width="700" height="80" fill="#FFFFFF" stroke="#18181B" stroke-width="2"/>
<text x="50" y="66" ${FONT} font-size="26" font-weight="700" fill="#18181B">Site plan sketch - Pedestrian Truss Bridge</text>
<text x="50" y="98" ${FONT} font-size="20" fill="#B91C1C">Illustrative site sketch - fictional location</text>
</svg>`;
  await put('01-Scope-and-Requirements/Site-and-Environment/site-plan-sketch.png', await sharp(Buffer.from(svg), { density: 96 }).resize(1600, 1000).png({ compressionLevel: 9 }).toBuffer());
}

// ---------------------------------------------------------------------------
// 5. MATLAB script + CSV
// ---------------------------------------------------------------------------
const mScript = `% conceptual-load-check.m
% FrameLytix educational sample - Pedestrian Truss Bridge (fictional project)
%
% NOTE: FrameLytix never executes this file. It is stored as a supporting document
% so that the hand calculations CALC-001 to CALC-005 can be reproduced in MATLAB or
% GNU Octave by the reader.
%
% ALL VALUES ARE ILLUSTRATIVE ASSUMPTIONS. NOT FOR CONSTRUCTION.
% The 4.0 kPa live load and 150 MPa allowable stress are NOT taken from any code.
% The governing code and limits must be confirmed by a qualified engineer.

clear; clc;

% ---- Inputs ---------------------------------------------------------------
q     = 4.0;      % kPa (kN/m^2)  illustrative pedestrian live load
b     = 2.5;      % m             clear deck width
L     = 24.0;     % m             clear span (6 panels x 4.0 m)
h     = 3.0;      % m             truss depth
sigma = 150;      % MPa (N/mm^2)  illustrative allowable stress

% ---- CALC-001: line load --------------------------------------------------
w = q * b;                 % kN/m

% ---- CALC-002: midspan moment (simply supported, UDL) ----------------------
Mmax = w * L^2 / 8;        % kN.m

% ---- CALC-003: support reaction -------------------------------------------
R = w * L / 2;             % kN

% ---- CALC-004: chord force from the moment couple --------------------------
% Simplification: whole-bridge moment resolved into one chord couple. The split
% between the two trusses is not considered in this conceptual check.
F = Mmax / h;              % kN

% ---- CALC-005: required chord area -----------------------------------------
Areq = (F * 1000) / sigma; % mm^2  (kN -> N, then N / (N/mm^2))

% ---- Report -----------------------------------------------------------------
fprintf('w      = %8.2f kN/m\\n', w);
fprintf('Mmax   = %8.2f kN.m\\n', Mmax);
fprintf('R      = %8.2f kN\\n', R);
fprintf('F      = %8.2f kN\\n', F);
fprintf('Areq   = %8.2f mm^2\\n', Areq);
`;
await put('02-Engineering-Arguments/Supporting-Calculations/conceptual-load-check.m', mScript);
const csv = [
  'quantity,symbol,expression,value,unit,note',
  `Line load,w,q*b,${W.toFixed(1)},kN/m,q = 4.0 kPa (illustrative); b = 2.5 m`,
  `Midspan moment,M_max,w*L^2/8,${MMAX.toFixed(1)},kN.m,L = 24.0 m simply supported`,
  `Support reaction (each end),R,w*L/2,${R.toFixed(1)},kN,Equal at both supports`,
  `Chord force,F,M_max/h,${F.toFixed(1)},kN,h = 3.0 m; whole-bridge couple (simplified)`,
  `Allowable stress,sigma_allow,assumed,${SIGMA.toFixed(1)},MPa,Illustrative assumption`,
  `Required chord area,A_req,F*1000/sigma_allow,${AREQ.toFixed(1)},mm2,Conceptual only`
].join('\r\n') + '\r\n';
await put('02-Engineering-Arguments/Supporting-Calculations/chord-force-summary.csv', csv);

// ---------------------------------------------------------------------------
// 6. Review notes
// ---------------------------------------------------------------------------
const notes = `PEDESTRIAN TRUSS BRIDGE - INTERNAL DESIGN REVIEW NOTES (EDUCATIONAL SAMPLE)
Date: 2026-11-24    Reviewer: Sample Reviewer    Drawing reviewed: DRW-001 REV-B

This is a fictional sample. Nothing here is professional engineering advice.

1. Geometry in the GA drawing, STL concept model and calculations is consistent:
   Pratt truss, L = 24.0 m, 6 x 4.0 m panels, h = 3.0 m, trusses at 2.9 m centres.
2. The 4.0 kPa live load is an illustrative assumption. It has NOT been confirmed
   against any governing code (see RSK-001). This is the largest open item.
3. Warren scored highest numerically in ARG-001 but fails mandatory REQ-004
   (6.0 m panels exceed 4.0 m floor-beam spacing). Pratt is retained, provisionally.
4. Deflection and vibration limits (REQ-006) are not yet defined or checked.
5. Deck system (ARG-003) and connection method (ARG-004) are incomplete.
6. Next actions: confirm governing code and loads; define serviceability limits;
   complete ARG-003 scoring; resolve REQ-010 traceability.
`;
await put('04-Design-Review-and-Export/Review-Documents/design-review-notes.txt', notes);

// ---------------------------------------------------------------------------
// .gitkeep in empty folders; fixed mtimes
// ---------------------------------------------------------------------------
for (const f of FOLDERS) {
  if ((await readdir(p(f))).length === 0) await writeFile(p(f, '.gitkeep'), '');
}
for (const rel of written) await utimes(p(rel), FIXED_MTIME, FIXED_MTIME);
console.log('Sample assets generated:', written.length, 'files');
