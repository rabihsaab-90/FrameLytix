/**
 * Builds samples/pedestrian-truss-bridge/framelytix-project.json for the bundled
 * educational sample. Run AFTER scripts/generate-sample-assets.mjs (asset sizes are
 * read from disk).
 *
 * Deterministic: UUIDs are derived from a namespace string via SHA-1 (v5-style) and
 * all timestamps are fixed (November 2026). Keys are emitted in the exact order of the
 * Zod schema in shared/schemas/project.ts so the app's re-serialisation produces no diff.
 *
 * Illustrative assumptions (fictional project, NOT FOR CONSTRUCTION):
 *   q = 4.0 kPa, b = 2.5 m -> w = 10.0 kN/m;  L = 24.0 m -> Mmax = wL^2/8 = 720 kN.m;
 *   R = wL/2 = 120 kN;  h = 3.0 m -> F = M/h = 240 kN;  sigma = 150 MPa -> A = 1600 mm^2.
 *
 * Run: node scripts/build-sample-manifest.mjs
 */
import { createHash } from 'node:crypto';
import { stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = join(root, 'samples', 'pedestrian-truss-bridge');

// ---------------------------------------------------------------------------
// Deterministic ids and timestamps
// ---------------------------------------------------------------------------
const NAMESPACE = 'framelytix.sample.pedestrian-truss-bridge.v1';
function uuid(name) {
  const h = createHash('sha1').update(`${NAMESPACE}:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
const T0 = '2026-11-10T09:00:00.000Z'; // project created
const T1 = '2026-11-14T10:30:00.000Z';
const T2 = '2026-11-18T14:00:00.000Z';
const T3 = '2026-11-21T09:00:00.000Z';
const T4 = '2026-11-24T09:30:00.000Z'; // latest modification
const AUTHOR = 'FrameLytix Sample Team';
const REVIEWER = 'Sample Reviewer';

const rid = (code) => uuid(`requirement:${code}`);
const aid = (code) => uuid(`argument:${code}`);
const cid = (code) => uuid(`calculation:${code}`);
const eid = (code) => uuid(`evidence:${code}`);
const kid = (code) => uuid(`risk:${code}`);
const sid = (code) => uuid(`asset:${code}`);

// ---------------------------------------------------------------------------
// Ordered builders (schema key order, defaults filled)
// ---------------------------------------------------------------------------
function pick(keys, defaults, o) {
  const out = {};
  for (const k of keys) out[k] = k in o ? o[k] : defaults[k];
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Error(`Unknown key ${k}`);
  return out;
}

const REQ_KEYS = ['id', 'code', 'title', 'description', 'section', 'category', 'priority', 'classification', 'acceptanceCriterion', 'targetValue', 'unit', 'source', 'verificationMethod', 'status', 'verificationNotes', 'notes', 'notApplicableLinks', 'archived', 'createdAt', 'modifiedAt'];
const REQ_DEF = { description: '', category: '', priority: 'medium', acceptanceCriterion: '', targetValue: '', unit: '', source: 'Project brief (fictional)', verificationMethod: 'document-review', status: 'not-started', verificationNotes: '', notes: '', notApplicableLinks: { argument: '', calculation: '', asset: '' }, archived: false, createdAt: T0, modifiedAt: T4 };
const req = (o) => pick(REQ_KEYS, REQ_DEF, { ...o, id: rid(o.code) });

const ARG_KEYS = ['id', 'code', 'title', 'problemStatement', 'objective', 'alternatives', 'matrix', 'constraintEvaluations', 'assumptions', 'evidenceSummary', 'selectedAlternativeId', 'selectionRationale', 'justification', 'risksAndLimitations', 'references', 'author', 'reviewer', 'revision', 'status', 'archived', 'createdAt', 'modifiedAt'];
const ARG_DEF = { problemStatement: '', objective: '', alternatives: [], matrix: { scaleMin: 1, scaleMax: 5, criteria: [], scores: [] }, constraintEvaluations: [], assumptions: [], evidenceSummary: '', selectedAlternativeId: null, selectionRationale: '', justification: '', risksAndLimitations: '', references: [], author: AUTHOR, reviewer: '', revision: 'REV-A', status: 'draft', archived: false, createdAt: T0, modifiedAt: T4 };

/**
 * Build an argument. alts: [name, description]; criteria: [name, weight, description];
 * scores: { altIndex: [[score|null, rationale], ...per criterion] }.
 */
function argument({ code, alts, criteria, scores, evals = [], selected = null, revisions = [], ...rest }) {
  const alternatives = alts.map(([name, description], i) => ({ id: uuid(`alt:${code}:${i}`), name, description }));
  const crit = criteria.map(([name, weight, description], i) => ({ id: uuid(`crit:${code}:${i}`), name, weight, description: description ?? '' }));
  const scoreEntries = [];
  alternatives.forEach((alt, ai) => {
    (scores[ai] ?? []).forEach((s, ci) => {
      if (s) scoreEntries.push({ alternativeId: alt.id, criterionId: crit[ci].id, score: s[0], rationale: s[1] });
    });
  });
  const constraintEvaluations = evals.map(([ai, reqCode, result, justification]) => ({ alternativeId: alternatives[ai].id, requirementId: rid(reqCode), result, justification }));
  const content = pick(ARG_KEYS, ARG_DEF, {
    ...rest,
    id: aid(code),
    code,
    alternatives,
    matrix: { scaleMin: 1, scaleMax: 5, criteria: crit, scores: scoreEntries },
    constraintEvaluations,
    selectedAlternativeId: selected === null ? null : alternatives[selected].id
  });
  return { ...content, revisions };
}

const CALC_KEYS = ['id', 'code', 'title', 'purpose', 'equation', 'variables', 'expression', 'method', 'assumptions', 'resultValue', 'resultUnit', 'resultSource', 'reference', 'verificationNotes', 'revision', 'author', 'archived', 'createdAt', 'modifiedAt'];
const STAT_REF = 'Standard statics relation for a simply supported span — see any introductory structural analysis text';
const calc = (o) =>
  pick(CALC_KEYS, { resultSource: 'evaluated', reference: STAT_REF, revision: 'REV-A', author: AUTHOR, archived: false, createdAt: T1, modifiedAt: T4 }, { ...o, id: cid(o.code) });
const v = (symbol, description, value, unit) => ({ symbol, description, value, unit });

const ASSET_KEYS = ['id', 'drawingId', 'title', 'relativePath', 'description', 'revision', 'modelUnit', 'sizeBytes', 'fileModifiedAt', 'importedAt'];
const EVID_KEYS = ['id', 'code', 'title', 'method', 'summary', 'outcome', 'recordedBy', 'date', 'createdAt', 'modifiedAt'];
const RISK_KEYS = ['id', 'code', 'title', 'description', 'category', 'likelihood', 'impact', 'residualLikelihood', 'residualImpact', 'mitigation', 'owner', 'status', 'notes', 'archived', 'createdAt', 'modifiedAt'];

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------
const requirements = [
  req({ code: 'REQ-001', title: 'Minimum clear span of 24.0 m', description: 'The bridge shall provide a clear span of at least 24.0 m between abutment faces to cross the creek channel.', section: 'criteria', category: 'Geometry', priority: 'high', classification: 'mandatory', acceptanceCriterion: 'Clear span measured between abutment faces is not less than 24.0 m.', targetValue: '24.0', unit: 'm', source: 'Site sketch (fictional)', verificationMethod: 'document-review', status: 'verified', verificationNotes: 'Span of 24.0 m measured from the illustrative site sketch (IMG-001) and confirmed against the general arrangement drawing DRW-001 REV-B.', createdAt: T0, modifiedAt: T2 }),
  req({ code: 'REQ-002', title: 'Pedestrian live-load capacity', description: 'Design for an illustrative uniformly distributed pedestrian live load of 4.0 kPa. This value is an ASSUMPTION for the educational study and is not taken from any code.', section: 'constraints', category: 'Loads', priority: 'high', classification: 'mandatory', acceptanceCriterion: 'Members sized so that the conceptual chord force check passes under 4.0 kPa (illustrative). Governing code loads to be confirmed.', targetValue: '4.0', unit: 'kPa', source: 'Team assumption (illustrative)', verificationMethod: 'calculation', status: 'in-progress', notes: 'Load assumption not yet confirmed against the governing code; see RSK-001.', createdAt: T0, modifiedAt: T3 }),
  req({ code: 'REQ-003', title: 'Clear deck width of at least 2.5 m', description: 'The walking surface shall provide at least 2.5 m clear width between truss inner faces.', section: 'criteria', category: 'Geometry', priority: 'high', classification: 'mandatory', acceptanceCriterion: 'Clear deck width is not less than 2.5 m.', targetValue: '2.5', unit: 'm', verificationMethod: 'inspection', status: 'verified', verificationNotes: 'Clear width of 2.5 m between curbs confirmed on the cross-section of DRW-001 REV-B (trusses at 2.9 m centres).', createdAt: T0, modifiedAt: T2 }),
  req({ code: 'REQ-004', title: 'Maximum floor-beam spacing of 4.0 m', description: 'Floor-beam spacing shall not exceed 4.0 m to suit the selected deck panel span.', section: 'constraints', category: 'Structure', priority: 'high', classification: 'mandatory', acceptanceCriterion: 'Floor beams at every panel point with spacing not greater than 4.0 m.', targetValue: '4.0', unit: 'm', source: 'Deck panel capacity (assumed)', verificationMethod: 'inspection', status: 'verified', verificationNotes: 'Inspection of DRW-001 REV-B shows 6 panels at 4.0 m with a floor beam at each panel point (VER-003).', createdAt: T0, modifiedAt: T2 }),
  req({ code: 'REQ-005', title: 'Corrosion protection for de-icing-salt exposure', description: 'The structure shall have corrosion protection suitable for an environment exposed to de-icing salts.', section: 'environment', category: 'Durability', priority: 'high', classification: 'mandatory', acceptanceCriterion: 'Selected material and protection system judged suitable for de-icing-salt exposure by the team; to be confirmed by a qualified engineer.', verificationMethod: 'analysis', status: 'in-progress', notes: 'Material selection (ARG-002) done; protection strategy (ARG-005) needs revision.', createdAt: T0, modifiedAt: T3 }),
  req({ code: 'REQ-006', title: 'Serviceability deflection limit (to be confirmed)', description: 'Mid-span deflection under pedestrian load shall be limited. The limit is to be confirmed against the governing code; no value is assumed here.', section: 'constraints', category: 'Serviceability', priority: 'high', classification: 'mandatory', acceptanceCriterion: 'Limit to be confirmed against the governing code.', verificationMethod: 'analysis', status: 'not-started', notes: 'UNVERIFIED mandatory constraint. Deflection and vibration have not been checked.', createdAt: T0, modifiedAt: T1 }),
  req({ code: 'REQ-007', title: 'Minimize life-cycle maintenance', description: 'Prefer solutions that reduce inspection and repainting effort over the service life.', section: 'criteria', category: 'Durability', priority: 'medium', classification: 'objective', acceptanceCriterion: 'Maintenance burden compared qualitatively between alternatives.', verificationMethod: 'document-review', createdAt: T0, modifiedAt: T1 }),
  req({ code: 'REQ-008', title: 'Prefer road-transportable prefabricated modules', description: 'Prefabricated truss modules that can be moved by road are preferred to reduce on-site work.', section: 'criteria', category: 'Construction', priority: 'low', classification: 'preference', acceptanceCriterion: 'Modules fit within typical road transport envelopes (to be confirmed).', verificationMethod: 'document-review', createdAt: T0, modifiedAt: T1 }),
  req({ code: 'REQ-009', title: 'Accessible approach slopes', description: 'Approach paths at both abutments should provide gentle slopes suitable for wheelchair and stroller use.', section: 'environment', category: 'Accessibility', priority: 'medium', classification: 'objective', acceptanceCriterion: 'Approach slopes to be set against the governing accessibility guidance (to be confirmed).', verificationMethod: 'document-review', status: 'in-progress', createdAt: T0, modifiedAt: T2 }),
  req({ code: 'REQ-010', title: 'Aesthetic integration with park setting', description: 'The structure should sit comfortably in the surrounding park landscape.', section: 'environment', category: 'Aesthetics', priority: 'low', classification: 'preference', acceptanceCriterion: 'Qualitative review of finish and colour with the park owner.', verificationMethod: 'other', createdAt: T0, modifiedAt: T1 })
];

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------
const calculations = [
  calc({ code: 'CALC-001', title: 'Line load (w = q b)', purpose: 'Convert the illustrative pedestrian pressure into a line load per metre of span.', equation: 'w = q \\cdot b', variables: [v('q', 'Pedestrian live load (illustrative assumption)', '4.0', 'kPa'), v('b', 'Clear deck width', '2.5', 'm')], expression: 'q*b', method: 'Multiply the pressure by the loaded width; 1 kPa x 1 m = 1 kN/m.', assumptions: 'Uniform pressure over the full clear deck width. 4.0 kPa is an illustrative assumption, not from a code.', resultValue: '10', resultUnit: 'kN/m', verificationNotes: 'Hand-checked by a second team member: 4.0 x 2.5 = 10.0.', createdAt: T1 }),
  calc({ code: 'CALC-002', title: 'Midspan moment (M_max = wL²/8)', purpose: 'Maximum bending moment of a simply supported span under a uniform load.', equation: 'M_{\\max} = \\frac{wL^2}{8}', variables: [v('w', 'Line load from CALC-001', '10', 'kN/m'), v('L', 'Clear span', '24.0', 'm')], expression: 'w*L^2/8', method: 'Closed-form statics for a simply supported beam; truss treated as an equivalent beam.', assumptions: 'Simply supported; uniform load over the whole span; self-weight not included at this stage.', resultValue: '720', resultUnit: 'kN·m', verificationNotes: 'Hand check by second team member (VER-002): 10 x 24^2 / 8 = 720. Load input still unconfirmed.', createdAt: T1 }),
  calc({ code: 'CALC-003', title: 'Support reaction (R = wL/2)', purpose: 'Vertical reaction at each support under the uniform load.', equation: 'R = \\frac{wL}{2}', variables: [v('w', 'Line load from CALC-001', '10', 'kN/m'), v('L', 'Clear span', '24.0', 'm')], expression: 'w*L/2', method: 'Symmetry of a simply supported span under a uniform load.', assumptions: 'Same as CALC-002. Reactions are per bridge (both trusses combined).', resultValue: '120', resultUnit: 'kN', verificationNotes: 'Cross-checked against the load diagram DIA-002.', createdAt: T1 }),
  calc({ code: 'CALC-004', title: 'Chord force (F = M/h)', purpose: 'Conceptual chord force from the moment couple across the truss depth.', equation: 'F = \\frac{M}{h}', variables: [v('M', 'Midspan moment from CALC-002', '720', 'kN·m'), v('h', 'Truss depth', '3.0', 'm')], expression: 'M/h', method: 'Resolve the moment into a force couple acting at the top and bottom chord centroids.', assumptions: 'Whole-bridge moment resolved into one chord couple; split between the two trusses and secondary effects are not considered.', resultValue: '240', resultUnit: 'kN', verificationNotes: 'Reproduced in conceptual-load-check.m (CALC-SUP-001).', createdAt: T2 }),
  calc({ code: 'CALC-005', title: 'Required chord area (A_req = F/σ_allow)', purpose: 'Order-of-magnitude chord area needed at an illustrative allowable stress.', equation: 'A_{req} = \\frac{F}{\\sigma_{allow}}', variables: [v('F', 'Chord force from CALC-004 (240 kN = 240000 N)', '240000', 'N'), v('sigma', 'Illustrative allowable stress', '150', 'N/mm²')], expression: 'F/sigma', method: 'Axial stress check: area = force / allowable stress, with force in newtons and stress in N/mm².', assumptions: 'Illustrative allowable stress of 150 MPa; no buckling, connection, fatigue or load-factor effects considered. NOT a design check.', resultValue: '1600', resultUnit: 'mm²', verificationNotes: 'Unit check: 240000 N / 150 N/mm² = 1600 mm².', createdAt: T2 })
];

// ---------------------------------------------------------------------------
// Assets (sizes read from disk)
// ---------------------------------------------------------------------------
const MTIME = '2026-11-20T10:00:00.000Z';
const assetDefs = [
  ['DRW-001', 'General Arrangement', '03-CAD-and-Technical-Drawings/AutoCAD-2D/PTB-GA-001_General-Arrangement.pdf', 'Elevation, plan and cross-section of the conceptual Pratt truss with dimensions and general notes. Conceptual only - NOT FOR CONSTRUCTION.', 'REV-B', ''],
  ['MOD-001', 'Pratt truss concept model', '03-CAD-and-Technical-Drawings/3D-Models/PTB-Pratt-Truss-Concept.stl', 'Binary STL of the conceptual Pratt truss (chords, verticals, diagonals, floor beams, deck, bracing, abutments). Placeholder cross-sections.', 'REV-A', 'm'],
  ['DIA-001', 'Truss configurations comparison', '03-CAD-and-Technical-Drawings/Diagrams-and-Schematics/truss-configurations.svg', 'Schematic elevations of Pratt, Warren and Howe trusses compared in ARG-001.', 'REV-A', ''],
  ['DIA-002', 'Load diagram', '03-CAD-and-Technical-Drawings/Diagrams-and-Schematics/load-diagram.svg', 'Simply supported span with w = 10.0 kN/m, reactions of 120 kN and parabolic moment peaking at 720 kN·m.', 'REV-A', ''],
  ['IMG-001', 'Site plan sketch', '01-Scope-and-Requirements/Site-and-Environment/site-plan-sketch.png', 'Illustrative site sketch of a fictional creek crossing showing banks, abutments and the 24.0 m span.', 'REV-A', ''],
  ['CALC-SUP-001', 'Conceptual load check (MATLAB script)', '02-Engineering-Arguments/Supporting-Calculations/conceptual-load-check.m', 'Readable MATLAB script reproducing CALC-001 to CALC-005. Never executed by FrameLytix.', 'REV-A', ''],
  ['CALC-SUP-002', 'Chord force summary (CSV)', '02-Engineering-Arguments/Supporting-Calculations/chord-force-summary.csv', 'Tabulated results of the conceptual load check.', 'REV-A', '']
];
const assets = [];
for (const [drawingId, title, relativePath, description, revision, modelUnit] of assetDefs) {
  const { size } = await stat(join(S, ...relativePath.split('/')));
  assets.push(pick(ASSET_KEYS, {}, { id: sid(drawingId), drawingId, title, relativePath, description, revision, modelUnit, sizeBytes: size, fileModifiedAt: MTIME, importedAt: T3 }));
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
const evidence = [
  pick(EVID_KEYS, {}, { id: eid('VER-001'), code: 'VER-001', title: 'Span measurement from site sketch', method: 'document-review', summary: 'The 24.0 m clear span was measured between the abutment faces on the illustrative site sketch (IMG-001) and agrees with DRW-001 REV-B. Supports REQ-001.', outcome: 'supports', recordedBy: AUTHOR, date: '2026-11-18', createdAt: T2, modifiedAt: T2 }),
  pick(EVID_KEYS, {}, { id: eid('VER-002'), code: 'VER-002', title: 'Hand check of midspan moment (CALC-002)', method: 'calculation', summary: 'A second team member reproduced 720 kN·m by hand. The arithmetic is correct, but the 4.0 kPa live-load input is an unconfirmed assumption, so this only partially supports REQ-002.', outcome: 'inconclusive', recordedBy: REVIEWER, date: '2026-11-21', createdAt: T3, modifiedAt: T3 }),
  pick(EVID_KEYS, {}, { id: eid('VER-003'), code: 'VER-003', title: 'Inspection of DRW-001: floor-beam spacing', method: 'inspection', summary: 'Inspection of DRW-001 REV-B shows a floor beam at each of the 7 panel points with 4.0 m spacing, meeting the maximum spacing of REQ-004.', outcome: 'supports', recordedBy: AUTHOR, date: '2026-11-24', createdAt: T4, modifiedAt: T4 })
];

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const CRIT_DEFAULT = [['Cost', 30, 'Initial cost; higher score = lower cost'], ['Safety or Strength', 40, 'Structural robustness and safety margin'], ['Feasibility', 30, 'Constructability, fabrication and transport']];

const arg001Common = {
  code: 'ARG-001',
  title: 'Truss Configuration Selection',
  problemStatement: 'Select a truss configuration for a 24.0 m pedestrian through-truss that works with 4.0 m deck panels.',
  objective: 'Choose the configuration that best balances cost, strength and feasibility while meeting all mandatory constraints.',
  alts: [
    ['Pratt truss', 'Verticals in compression, diagonals in tension sloping toward midspan; 6 panels at 4.0 m.'],
    ['Warren truss', 'No verticals, alternating diagonals; 4 panels at 6.0 m.'],
    ['Howe truss', 'Diagonals in compression sloping away from midspan; verticals in tension; 6 panels at 4.0 m.']
  ],
  criteria: CRIT_DEFAULT,
  scores: {
    0: [[3, 'More members than a Warren truss, so somewhat higher fabrication cost.'], [4, 'Slender tension diagonals; short compression verticals; well-understood load path.'], [4, 'Panel points match the 4.0 m deck panel module; modular shop fabrication.']],
    1: [[5, 'Fewest members and joints, so lowest cost.'], [4, 'Efficient load path, but longer unbraced members.'], [4, 'Simple to fabricate, but 6.0 m panels do not suit the deck module.']],
    2: [[3, 'Similar member count to Pratt.'], [3, 'Long diagonals in compression need buckling attention.'], [3, 'Less common for steel; less familiar detailing.']]
  },
  assumptions: ['Truss depth is fixed at 3.0 m for all alternatives.', 'Deck sits at the bottom chord (through truss) with floor beams at panel points.', 'Scores are team judgements on a 1 to 5 scale; higher is always more favourable (including cost).'],
  evidenceSummary: 'See CALC-004 for the chord force, DIA-001 for the configurations and MOD-001 for the concept model. No structural analysis of the alternatives has been performed.',
  references: ['Course notes — introductory structural analysis', 'Manufacturer literature (to be obtained)'],
  author: AUTHOR,
  reviewer: REVIEWER,
  createdAt: T1
};
const arg001 = argument({
  ...arg001Common,
  evals: [
    [0, 'REQ-001', 'pass', 'Spans 24.0 m by geometry.'],
    [0, 'REQ-004', 'pass', 'Floor beams at 4.0 m panel points (see DRW-001).'],
    [0, 'REQ-006', 'unverified', 'Deflection limit not yet defined or checked.'],
    [1, 'REQ-001', 'pass', 'Spans 24.0 m by geometry.'],
    [1, 'REQ-004', 'fail', '6.0 m panels exceed the 4.0 m floor-beam spacing needed by the deck.'],
    [1, 'REQ-006', 'unverified', 'Deflection limit not yet defined or checked.'],
    [2, 'REQ-001', 'pass', 'Spans 24.0 m by geometry.'],
    [2, 'REQ-004', 'pass', 'Floor beams at 4.0 m panel points.'],
    [2, 'REQ-006', 'unverified', 'Deflection limit not yet defined or checked.']
  ],
  selected: 0,
  selectionRationale: 'Warren has the highest weighted score (4.3) but fails mandatory REQ-004 and is therefore ineligible. Pratt (3.7) is the highest-scoring eligible alternative, provisionally, because REQ-006 is still unverified.',
  justification: 'Warren scores highest numerically (4.3 versus 3.7 for Pratt and 3.0 for Howe), mainly on cost. However its 6.0 m panels exceed the 4.0 m floor-beam spacing required by the deck (REQ-004), which is a mandatory constraint, so it is ineligible regardless of score. Pratt and Howe both meet REQ-001 and REQ-004; Pratt scores higher. The selection is provisional: the serviceability deflection limit (REQ-006) has not been confirmed or verified for any alternative.',
  risksAndLimitations: 'Scores are subjective team judgements. No analysis of deflection, vibration or member buckling has been done. A change to the deck module could reopen this decision.',
  revision: 'REV-B',
  status: 'under-review',
  modifiedAt: T4
});
// REV-A snapshot: Warren initially preferred, before constraint evaluation was added.
const arg001SnapshotSrc = argument({
  ...arg001Common,
  evals: [],
  selected: 1,
  selectionRationale: '',
  justification: 'Warren has the highest weighted score and is the cheapest option, so it is preferred at this stage.',
  risksAndLimitations: 'Mandatory constraints have not yet been evaluated against the alternatives.',
  revision: 'REV-A',
  status: 'draft',
  createdAt: T1,
  modifiedAt: T2
});
const arg001Snapshot = { ...arg001SnapshotSrc };
delete arg001Snapshot.revisions;
arg001.revisions = [
  {
    id: uuid('revision:ARG-001:REV-A'),
    code: 'REV-A',
    timestamp: T2,
    author: AUTHOR,
    summary: 'Added mandatory constraint evaluations; Warren found to fail REQ-004; selection changed to Pratt',
    snapshot: arg001Snapshot
  }
];

const arg002 = argument({
  code: 'ARG-002',
  title: 'Structural Material Selection',
  problemStatement: 'Select the primary structural material for the truss in a de-icing-salt environment.',
  objective: 'Pick a material that balances cost, strength, durability and maintainability while meeting corrosion protection needs (REQ-005).',
  alts: [
    ['Galvanized structural steel', 'Hot-dip galvanized rolled and welded steel sections.'],
    ['Weathering steel', 'Atmospheric corrosion-resistant steel that forms a protective patina.'],
    ['Glued-laminated timber', 'Engineered timber members with protective detailing.']
  ],
  criteria: [['Cost', 25, ''], ['Safety or Strength', 30, ''], ['Durability', 25, ''], ['Maintainability', 20, '']],
  scores: {
    0: [[3, 'Galvanizing adds cost over bare steel.'], [4, 'Well-known strength and ductility.'], [4, 'Zinc coating gives long protection in most exposures.'], [4, 'Low maintenance with periodic inspection.']],
    1: [[4, 'No coating cost.'], [4, 'Comparable strength to other structural steels.'], [4, 'Good in many atmospheres, but see REQ-005 evaluation.'], [5, 'Little repainting if the patina is stable.']],
    2: [[3, 'Moderate cost; specialist supply.'], [3, 'Lower strength-to-size ratio; connections more demanding.'], [3, 'Needs careful moisture protection detailing.'], [2, 'Regular inspection and re-treatment likely.']]
  },
  evals: [
    [0, 'REQ-005', 'pass', 'Hot-dip galvanizing is judged suitable for de-icing-salt exposure (illustrative team judgement, to be confirmed by a qualified engineer).'],
    [1, 'REQ-005', 'fail', 'Weathering steel is generally not recommended where de-icing salts cause persistent wet or salt exposure (illustrative team judgement, to be confirmed by a qualified engineer).'],
    [2, 'REQ-005', 'unverified', 'Suitability for salt exposure not yet established.']
  ],
  selected: 0,
  selectionRationale: 'Weathering steel scores highest numerically (4.2) but fails REQ-005 and is ineligible. Galvanized steel is the highest-scoring eligible alternative.',
  justification: 'Galvanized structural steel satisfies the corrosion mandate in REQ-005 and scores 3.75. Weathering steel scores higher but is ruled out by the salt-exposure constraint. Glulam remains unverified for REQ-005.',
  assumptions: ['De-icing salts will be used on approach paths and may reach the structure.', 'Judgements on suitability are illustrative team opinions, not code-based findings.'],
  evidenceSummary: 'No test data. Judgements are based on general course knowledge; manufacturer literature is still to be obtained.',
  risksAndLimitations: 'The REQ-005 evaluation is an illustrative judgement and must be confirmed by a qualified engineer. Galvanized finish details are not developed.',
  references: ['Course notes — introductory structural analysis', 'Manufacturer literature (to be obtained)'],
  author: AUTHOR,
  reviewer: REVIEWER,
  revision: 'REV-A',
  status: 'approved',
  createdAt: T1,
  modifiedAt: T3
});

const arg003 = argument({
  code: 'ARG-003',
  title: 'Deck System Selection',
  problemStatement: 'Select a deck system that spans 4.0 m between floor beams and provides a 2.5 m clear walking width.',
  objective: 'Choose a deck that is light, durable and compatible with the floor-beam spacing.',
  alts: [
    ['Precast concrete deck panels', 'Prefabricated concrete panels spanning between floor beams.'],
    ['FRP deck panels', 'Fibre-reinforced polymer panels; light and corrosion resistant.'],
    ['Timber deck boards', 'Treated timber boards on stringers.']
  ],
  criteria: CRIT_DEFAULT,
  scores: {
    0: [[4, 'Low material cost, but heavy to lift.'], [4, 'Robust and stiff.'], [3, 'Needs crane access; heavier supporting beams.']],
    1: [[2, 'Highest material cost.'], [4, 'Light with adequate stiffness.'], [null, 'Supplier availability and panel spans not yet confirmed.']],
    2: [[5, 'Lowest initial cost.'], [3, 'Needs closely spaced framing.'], [4, 'Easy to install and replace.']]
  },
  assumptions: ['Deck panels span 4.0 m between floor beams.', 'Clear walking width of 2.5 m.'],
  evidenceSummary: 'Incomplete. FRP feasibility has not been scored; no supplier data collected.',
  risksAndLimitations: 'The matrix is incomplete, so no recommendation can be made yet.',
  references: ['Manufacturer literature (to be obtained)'],
  author: AUTHOR,
  status: 'draft',
  createdAt: T2,
  modifiedAt: T3
});
const arg004 = argument({
  code: 'ARG-004',
  title: 'Connection Method Selection',
  problemStatement: 'Choose how truss members are connected to suit shop prefabrication and road transport of modules.',
  objective: 'Balance fabrication quality, site effort and inspection access.',
  alts: [['Shop-welded / field-bolted', 'Modules welded in the shop and bolted together on site.'], ['Fully bolted', 'All connections bolted with gusset plates.'], ['Pinned connections', 'Pin-connected joints at panel points.']],
  criteria: CRIT_DEFAULT,
  scores: {
    0: [[4, 'Efficient shop welding.'], [4, 'Continuous shop welds are well controlled.'], [4, 'Suits road-transportable modules.']],
    1: [[3, 'More plates and bolts.'], null, null],
    2: [null, null, null]
  },
  assumptions: ['Prefabricated modules are preferred (REQ-008).'],
  evidenceSummary: 'Only partly scored; no evidence collected yet.',
  risksAndLimitations: 'Work in progress. Fatigue and detailing are not considered.',
  references: ['Course notes — introductory structural analysis'],
  author: AUTHOR,
  status: 'draft',
  createdAt: T3,
  modifiedAt: T3
});
const arg005 = argument({
  code: 'ARG-005',
  title: 'Durability and Maintenance Strategy',
  problemStatement: 'Define how the galvanized steel structure will be protected and maintained over its service life.',
  objective: 'Minimise life-cycle maintenance while protecting against de-icing-salt corrosion.',
  alts: [['Hot-dip galvanizing with 5-year inspections', 'Galvanizing only, with periodic inspection.'], ['Multi-coat paint system', 'Painted steel with scheduled repainting.'], ['Duplex (galvanizing + paint)', 'Galvanizing topped with a paint system.']],
  criteria: [['Durability', 40, ''], ['Cost', 30, ''], ['Maintainability', 30, '']],
  scores: {
    0: [[3, 'Adequate in most exposures, but salt may shorten life.'], [4, 'Moderate cost.'], [4, 'Simple inspection routine.']],
    1: [[3, 'Depends on repainting discipline.'], [3, 'Lower first cost, higher life-cycle cost.'], [2, 'Frequent repainting.']],
    2: [[5, 'Synergistic protection in aggressive exposure.'], [2, 'Highest first cost.'], [4, 'Long intervals between maintenance.']]
  },
  assumptions: ['Service life and inspection intervals are placeholders.'],
  evidenceSummary: 'Review found that the inspection interval and its basis are not justified.',
  risksAndLimitations: 'Needs revision: 5-year inspection interval is a placeholder and no life-cycle cost estimate exists.',
  references: ['Manufacturer literature (to be obtained)'],
  author: AUTHOR,
  reviewer: REVIEWER,
  status: 'needs-revision',
  createdAt: T3,
  modifiedAt: T4
});
const argumentsList = [arg001, arg002, arg003, arg004, arg005];

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------
const risk = (o) => pick(RISK_KEYS, { description: '', category: '', residualLikelihood: null, residualImpact: null, mitigation: '', owner: AUTHOR, status: 'open', notes: '', archived: false, createdAt: T2, modifiedAt: T4 }, { ...o, id: kid(o.code) });
const risks = [
  risk({ code: 'RSK-001', title: 'Live-load assumption not confirmed against governing code', description: 'The 4.0 kPa pedestrian load is an illustrative assumption. The governing code may require a different load or additional cases.', category: 'Loads', likelihood: 4, impact: 5, mitigation: 'Identify the governing code and confirm loads with a qualified engineer before any further design.', owner: AUTHOR, status: 'open', notes: 'Highest unresolved risk.' }),
  risk({ code: 'RSK-002', title: 'Corrosion from de-icing salts', description: 'Salt spray and run-off may accelerate corrosion of steel members and connections.', category: 'Durability', likelihood: 4, impact: 4, residualLikelihood: 2, residualImpact: 4, mitigation: 'Galvanized steel (ARG-002) with a durability strategy (ARG-005, under revision).', status: 'mitigating' }),
  risk({ code: 'RSK-003', title: 'Deflection and vibration serviceability not yet checked', description: 'Light pedestrian trusses can be lively; no limit has been set and no check performed.', category: 'Serviceability', likelihood: 3, impact: 4, mitigation: 'Confirm limits (REQ-006), then run a deflection and natural-frequency check.', status: 'open' }),
  risk({ code: 'RSK-004', title: 'Transport of prefabricated truss segments', description: 'Modules may exceed road transport limits for width, height or mass.', category: 'Construction', likelihood: 2, impact: 3, residualLikelihood: 2, residualImpact: 3, mitigation: 'Split the truss into modules sized for road transport; confirm with a fabricator.', status: 'accepted', notes: 'Accepted for this conceptual stage.' }),
  risk({ code: 'RSK-005', title: 'Scour at abutments', description: 'Creek flows could erode abutment foundations.', category: 'Site', likelihood: 2, impact: 5, mitigation: 'Obtain hydrology and geotechnical information; set foundation depth accordingly.', status: 'open' })
];

// ---------------------------------------------------------------------------
// Review items
// ---------------------------------------------------------------------------
const ri = (n, category, text, status, extra = {}) => ({ id: uuid(`review:${n}`), category, text, source: extra.source ?? 'template', status, naJustification: extra.na ?? '', reviewer: extra.reviewer ?? (status === 'open' ? '' : REVIEWER), notes: extra.notes ?? '', modifiedAt: T4 });
const reviewItems = [
  ri(1, 'scope', 'The project scope states what is being designed and its limits.', 'complete', { notes: 'Scope states the study is educational and conceptual.' }),
  ri(2, 'decisions', 'Every engineering argument has a selected alternative with justification.', 'open', { notes: 'ARG-003, ARG-004 and ARG-005 are incomplete.' }),
  ri(3, 'constraints', 'Mandatory requirements are evaluated against every alternative.', 'open', { notes: 'REQ-006 is unverified for all truss alternatives.' }),
  ri(4, 'assumptions', 'Assumptions are stated with units and marked as illustrative where applicable.', 'complete'),
  ri(5, 'calculations', 'Calculation inputs are confirmed against the governing code.', 'open', { source: 'custom', notes: 'Blocked by RSK-001.' }),
  ri(6, 'calculations', 'Calculation results include units and have been hand checked.', 'complete'),
  ri(7, 'evidence', 'Every requirement marked verified has verification notes or evidence.', 'complete'),
  ri(8, 'evidence', 'Physical test results are referenced where tests were performed.', 'not-applicable', { na: 'Conceptual study; no physical testing is in scope.' }),
  ri(9, 'drawings', 'Drawings carry an identifier, revision and a not-for-construction notice.', 'complete'),
  ri(10, 'risks', 'High and unresolved risks have been reviewed and have an owner.', 'open', { notes: 'RSK-001 remains unresolved.' }),
  ri(11, 'references', 'Manufacturer data sheets are attached for selected products.', 'not-applicable', { na: 'No manufacturer products are selected at this conceptual stage.' }),
  ri(12, 'reporting', 'The exported report has been reviewed for accuracy and disclaimers.', 'open', { source: 'custom' })
];

// ---------------------------------------------------------------------------
// Links (undirected; stored once)
// ---------------------------------------------------------------------------
const REF = {
  requirement: rid, argument: aid, calculation: cid, evidence: eid, risk: kid, asset: sid
};
const typeOf = (code) => (code.startsWith('REQ-') ? 'requirement' : code.startsWith('ARG-') ? 'argument' : code.startsWith('CALC-SUP') ? 'asset' : code.startsWith('CALC-') ? 'calculation' : code.startsWith('VER-') ? 'evidence' : code.startsWith('RSK-') ? 'risk' : 'asset');
const ref = (code) => ({ type: typeOf(code), id: REF[typeOf(code)](code) });
const linkDefs = [
  ['REQ-001', 'ARG-001', 'Span requirement is mandatory for the truss configuration decision.'],
  ['REQ-001', 'CALC-002', 'The 24.0 m span is the input L to the midspan moment.'],
  ['REQ-001', 'DRW-001', 'Span shown on the general arrangement.'],
  ['REQ-001', 'VER-001', 'Span verified by document review.'],
  ['REQ-001', 'IMG-001', 'Span measured on the site sketch.'],
  ['REQ-002', 'CALC-001', 'Line load from the illustrative live load.'],
  ['REQ-002', 'CALC-002', 'Midspan moment under the live load.'],
  ['REQ-002', 'CALC-004', 'Chord force derived from the moment.'],
  ['REQ-002', 'CALC-005', 'Required chord area at the illustrative stress.'],
  ['REQ-002', 'VER-002', 'Hand check (inconclusive: load unconfirmed).'],
  ['REQ-002', 'RSK-001', 'Live-load assumption risk.'],
  ['REQ-003', 'DRW-001', 'Clear width shown on the cross-section.'],
  ['REQ-003', 'ARG-003', 'Deck system must provide the clear width.'],
  ['REQ-004', 'ARG-001', 'Floor-beam spacing is a mandatory constraint; Warren fails it.'],
  ['REQ-004', 'ARG-003', 'Deck panels set the spacing limit.'],
  ['REQ-004', 'VER-003', 'Inspection of the GA drawing.'],
  ['REQ-004', 'DRW-001', 'Floor-beam spacing shown on the elevation and plan.'],
  ['REQ-005', 'ARG-002', 'Material selection under corrosion constraint.'],
  ['REQ-005', 'ARG-005', 'Durability and maintenance strategy.'],
  ['REQ-005', 'RSK-002', 'Corrosion risk.'],
  ['REQ-006', 'ARG-001', 'Deflection limit is an unverified mandatory constraint.'],
  ['REQ-006', 'RSK-003', 'Serviceability risk.'],
  ['REQ-007', 'ARG-005', 'Maintenance objective addressed by the durability strategy.'],
  ['REQ-008', 'RSK-004', 'Transport of prefabricated modules.'],
  ['REQ-009', 'IMG-001', 'Approach paths shown on the site sketch.'],
  ['ARG-001', 'CALC-004', 'Chord force informs the configuration decision.'],
  ['ARG-001', 'MOD-001', 'Concept model of the selected configuration.'],
  ['ARG-001', 'DIA-001', 'Comparison of configurations.'],
  ['ARG-002', 'CALC-005', 'Required chord area for the material.'],
  ['ARG-004', 'REQ-008', 'Connections must suit prefabricated modules.'],
  ['CALC-002', 'DIA-002', 'Moment diagram.'],
  ['CALC-003', 'DIA-002', 'Reactions shown on the load diagram.'],
  ['CALC-002', 'CALC-SUP-001', 'Reproduced in the MATLAB script.'],
  ['CALC-004', 'CALC-SUP-002', 'Tabulated in the chord force summary.'],
  ['RSK-005', 'IMG-001', 'Creek and abutment locations.']
];
const links = linkDefs.map(([a, b, note], i) => ({ id: uuid(`link:${i + 1}:${a}:${b}`), a: ref(a), b: ref(b), note, createdAt: T3 }));

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
const REPORT_SECTIONS = ['cover', 'metadata', 'summary', 'scope', 'criteria', 'requirements', 'arguments', 'calculations', 'traceability', 'risks', 'revisions', 'drawings', 'review', 'outstanding', 'references', 'disclaimer'];

const manifest = {
  schemaVersion: 1,
  appVersion: '0.1.0',
  project: {
    id: uuid('project'),
    title: 'Pedestrian Truss Bridge — Conceptual Design Study',
    description: 'Fictional educational sample bundled with FrameLytix: a conceptual Pratt through-truss footbridge, 24.0 m clear span, used to demonstrate requirements, decision matrices, calculations and traceability.',
    identifier: 'PTB-2026',
    discipline: 'civil',
    disciplineLabel: 'Civil Engineering',
    templateId: 'civil-bridge',
    archetypeName: 'Bridge Design',
    templateVersion: '1.0.0',
    author: AUTHOR,
    organization: 'Educational sample (fictional project)',
    unitSystem: 'SI',
    scope: 'This is an educational conceptual study of a fictional 24.0 m pedestrian through-truss bridge. It demonstrates how FrameLytix records requirements, compares alternatives, documents calculations and traces evidence. All loads, limits and stresses are illustrative assumptions. It is not a professional design, has not been checked against any code and is NOT construction-ready.',
    summary: 'A fictional Pratt truss footbridge (6 panels x 4.0 m, 3.0 m deep, 2.5 m clear width) is used as a worked example. Under an illustrative 4.0 kPa load the line load is 10.0 kN/m, the midspan moment 720 kN·m, each reaction 120 kN and the conceptual chord force 240 kN. Warren scores highest in the truss decision matrix but fails a mandatory constraint, so Pratt is provisionally recommended. Several items remain open on purpose. This sample is not a professional design, is not checked against any code and is NOT FOR CONSTRUCTION.',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Load and Safety Constraints', environment: 'Site and Environment Data' },
    isSample: true,
    createdAt: T0,
    modifiedAt: T4
  },
  folders: [
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
    '04-Design-Review-and-Export/Reports'
  ],
  requirements,
  arguments: argumentsList,
  calculations,
  assets,
  evidence,
  risks,
  reviewItems,
  links,
  exportHistory: [],
  settings: { reportSections: REPORT_SECTIONS, defaultAssetFolder: '03-CAD-and-Technical-Drawings/AutoCAD-2D' }
};

await writeFile(join(S, 'framelytix-project.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Manifest written:', requirements.length, 'requirements,', argumentsList.length, 'arguments,', links.length, 'links');
