/**
 * FrameLytix engineering template catalogue.
 *
 * HOW TO ADD A NEW ARCHETYPE
 * 1. Append a new object to TEMPLATES (below) with a NEW, unique, kebab-case `id`
 *    (convention: "<discipline-prefix>-<archetype>", e.g. "civil-tunnel-lining").
 * 2. Fill every field of ProjectTemplate (see ./types.ts) with content that is specific to the
 *    archetype: its own folders, requirement categories, suggested requirements, decisions,
 *    textbook calculations, deliverables, risks and review checklist. Do not copy another
 *    archetype and rename it; tests/unit/templates.test.ts rejects duplicated requirement lists.
 * 3. Never change an existing `id` once it has shipped. Projects store the id and version.
 * 4. When you change the content of an existing template, bump its `version` (semver).
 * 5. Existing projects are never modified by template updates: a project copies the template
 *    content (folders, requirements, review items, ...) at creation time and owns that copy.
 * 6. Acceptance criteria are editable prompts. Do not invent numeric limits, standard clause
 *    numbers or compliance claims; ask the team to identify the governing code and enter values.
 * 7. Run `npx vitest run tests/unit/templates.test.ts` before committing.
 *
 * This file is pure data: no React, no Node.js imports.
 */
import type { Discipline, ReviewCategory } from '../../shared/schemas/project';
import type {
  DisciplineInfo,
  ProjectTemplate,
  TemplateArgument,
  TemplateCriterion,
  TemplateRequirement,
  TemplateReviewItem
} from './types';

// ---------------------------------------------------------------------------
// Disciplines
// ---------------------------------------------------------------------------

export const DISCIPLINES: DisciplineInfo[] = [
  {
    id: 'civil',
    name: 'Civil Engineering',
    description: 'Structures, foundations, water systems and transportation infrastructure designed for site, load and service-life demands.',
    icon: 'Landmark'
  },
  {
    id: 'mechanical',
    name: 'Mechanical Engineering',
    description: 'Machines, mechanisms, thermal systems and pressure equipment designed around loads, motion, energy and manufacturability.',
    icon: 'Cog'
  },
  {
    id: 'aerospace',
    name: 'Aerospace Engineering',
    description: 'Aircraft, uncrewed vehicles, propulsion and spacecraft structures balancing performance, mass and flight or launch environments.',
    icon: 'Plane'
  },
  {
    id: 'electrical',
    name: 'Electrical Engineering',
    description: 'Power, control, embedded and circuit-level systems designed for electrical performance, protection and testability.',
    icon: 'Zap'
  },
  {
    id: 'custom',
    name: 'Custom Discipline',
    description: 'A flexible starting point for engineering work that does not fit a predefined discipline.',
    icon: 'Shapes'
  }
];

// ---------------------------------------------------------------------------
// Authoring helpers (keep the catalogue below readable)
// ---------------------------------------------------------------------------

const SEC = { c: 'criteria', k: 'constraints', e: 'environment' } as const;
const CLS = { M: 'mandatory', O: 'objective', P: 'preference' } as const;
const PRI = { H: 'high', M: 'medium', L: 'low' } as const;
const VER = {
  calc: 'calculation',
  insp: 'inspection',
  ana: 'analysis',
  test: 'physical-test',
  sim: 'simulation',
  doc: 'document-review',
  other: 'other'
} as const;

function rq(
  section: keyof typeof SEC,
  category: string,
  title: string,
  description: string,
  classification: keyof typeof CLS,
  priority: keyof typeof PRI,
  verification: keyof typeof VER,
  acceptanceCriterion: string,
  unit?: string
): TemplateRequirement {
  const r: TemplateRequirement = {
    section: SEC[section],
    category,
    title,
    description,
    classification: CLS[classification],
    priority: PRI[priority],
    verificationMethod: VER[verification],
    acceptanceCriterion
  };
  if (unit) r.unit = unit;
  return r;
}

const CRITERION_DESCRIPTIONS: Record<string, string> = {
  Cost: 'Capital and lifecycle cost; higher score = more favourable (lower) cost.',
  'Safety or Strength': 'Margin against failure and consequence of failure.',
  Feasibility: 'Practicality of design, procurement and delivery with available resources.',
  Durability: 'Ability to retain performance over the intended service life.',
  Maintainability: 'Ease and cost of inspection, repair and replacement.',
  'Environmental impact': 'Embodied and operating environmental burden; higher score = lower impact.',
  'Energy efficiency': 'Energy consumed per unit of useful output.',
  'Manufacturing complexity': 'Difficulty of fabrication and assembly; higher score = simpler.',
  Performance: 'Ability to meet the functional performance targets.'
};

/** Build criteria; weights must total 100 (checked by tests). */
function crit(list: Array<[string, number] | [string, number, string]>): TemplateCriterion[] {
  return list.map(([name, weight, description]) => ({
    name,
    weight,
    description: description ?? CRITERION_DESCRIPTIONS[name] ?? ''
  }));
}

const CRIT_STRUCT = crit([['Cost', 20], ['Safety or Strength', 30], ['Feasibility', 20], ['Durability', 20], ['Maintainability', 10]]);
const CRIT_MECH = crit([['Cost', 20], ['Performance', 25], ['Safety or Strength', 25], ['Manufacturing complexity', 15], ['Maintainability', 15]]);
const CRIT_ENERGY = crit([['Cost', 20], ['Energy efficiency', 30], ['Performance', 20], ['Maintainability', 15], ['Environmental impact', 15]]);
const CRIT_AERO = crit([['Performance', 30], ['Safety or Strength', 25], ['Cost', 15], ['Manufacturing complexity', 15], ['Feasibility', 15]]);
const CRIT_ELEC = crit([['Cost', 20], ['Performance', 25], ['Safety or Strength', 25], ['Feasibility', 15], ['Manufacturing complexity', 15]]);

function arg(
  title: string,
  problemStatement: string,
  objective: string,
  alternatives: string[],
  criteria?: TemplateCriterion[]
): TemplateArgument {
  const a: TemplateArgument = { title, problemStatement, objective, alternatives };
  if (criteria) a.criteria = criteria;
  return a;
}

function ri(category: ReviewCategory, text: string): TemplateReviewItem {
  return { category, text };
}

/** Review items every archetype shares; archetype-specific items are appended per template. */
function review(extra: TemplateReviewItem[]): TemplateReviewItem[] {
  return [
    ri('scope', 'The scope statement defines what is included, what is excluded and who the design is for.'),
    ri('decisions', 'Every major design decision has an engineering argument with alternatives, a selection and a rationale.'),
    ri('assumptions', 'Assumptions are listed, justified and traceable to a source or flagged for validation.'),
    ri('risks', 'Risks have an owner, a mitigation and a residual rating, and open risks are visible to reviewers.'),
    ri('references', 'References (codes, standards, datasheets, textbooks) are recorded with edition or revision.'),
    ri('reporting', 'The exported report has been previewed and reflects the current state of the project.'),
    ...extra
  ];
}

/**
 * Build the folder list. `req`, `args` and `cad` are subfolder names within phases 1 to 3;
 * phase 4 always has Review-Documents and Reports.
 */
function folderSet(req: string[], args: string[], cad: string[]): string[] {
  const p1 = '01-Scope-and-Requirements';
  const p2 = '02-Engineering-Arguments';
  const p3 = '03-CAD-and-Technical-Drawings';
  const p4 = '04-Design-Review-and-Export';
  return [
    p1, ...req.map((n) => `${p1}/${n}`),
    p2, ...args.map((n) => `${p2}/${n}`),
    p3, ...cad.map((n) => `${p3}/${n}`),
    p4, `${p4}/Review-Documents`, `${p4}/Reports`
  ];
}

const P3 = '03-CAD-and-Technical-Drawings';

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const CIVIL: ProjectTemplate[] = [
  {
    id: 'civil-bridge',
    discipline: 'civil',
    archetype: 'Bridge Design',
    description: 'Concept and preliminary design of a bridge superstructure, including truss configuration, deck, connections and durability.',
    version: '1.0.0',
    icon: 'Landmark',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Load and Safety Constraints', environment: 'Site and Environment Data' },
    folders: folderSet(
      ['Design-Criteria', 'Load-and-Safety-Constraints', 'Site-and-Environment'],
      ['Material-Selection', 'Truss-Configuration', 'Supporting-Calculations'],
      ['AutoCAD-2D', '3D-Models', 'Diagrams-and-Schematics']
    ),
    defaultAssetFolder: `${P3}/AutoCAD-2D`,
    requirementCategories: [
      'Span Requirements', 'Loading Assumptions', 'Environmental Exposure', 'Material Selection',
      'Truss Configuration', 'Deck Design', 'Connections', 'Constructability', 'Durability'
    ],
    suggestedRequirements: [
      rq('c', 'Span Requirements', 'Clear span and vertical clearance', 'The crossing geometry that the structure must satisfy.', 'M', 'H', 'doc', 'Clear span, number of spans and vertical clearance match the values established from the site survey (enter target values).', 'm'),
      rq('c', 'Deck Design', 'Deck width and traffic provision', 'Lanes, shoulders and any pedestrian or cyclist provision on the deck.', 'M', 'M', 'doc', 'Deck width accommodates the lanes and active-transportation provision confirmed with the owner (enter target value).', 'm'),
      rq('c', 'Truss Configuration', 'Efficient member layout', 'Choose a truss layout that keeps member forces and panel lengths manageable.', 'O', 'M', 'ana', 'Selected configuration is justified against at least two alternatives in an engineering argument.'),
      rq('k', 'Loading Assumptions', 'Governing load cases and combinations', 'Dead, live, traffic, wind, thermal and any seismic or ice load cases applied in analysis.', 'M', 'H', 'calc', 'Identify the governing bridge design code for the project jurisdiction and apply its load cases and combinations (record the edition).'),
      rq('k', 'Connections', 'Connection capacity exceeds member demand', 'Gusset plates, bolts or welds must carry the member forces with margin.', 'M', 'H', 'calc', 'Connection capacity is calculated for each governing member force and exceeds the demand (enter margin target).', 'kN'),
      rq('k', 'Material Selection', 'Material grades suited to service', 'Structural material grades, toughness and weldability for the service temperature.', 'M', 'M', 'doc', 'Material grades are specified, traceable to a standard designation and checked for suitability in cold service.'),
      rq('e', 'Environmental Exposure', 'Climatic and hydraulic exposure recorded', 'Temperature range, de-icing salt exposure, flood levels, scour and ice effects at the site.', 'M', 'M', 'doc', 'Site climate and hydrology data are documented with their sources (enter values).'),
      rq('e', 'Durability', 'Design service life and corrosion protection', 'Protection system and inspection strategy to reach the intended service life.', 'O', 'M', 'ana', 'Corrosion protection strategy and inspection interval support the intended service life (enter target).', 'years'),
      rq('e', 'Constructability', 'Erection access and sequencing', 'Crane access, temporary works and traffic management during erection.', 'P', 'L', 'insp', 'Erection sequence is described and access constraints are identified on the site plan.')
    ],
    suggestedArguments: [
      arg('Truss Configuration Selection', 'The span and loading must be carried by a truss whose layout affects member forces, fabrication and appearance.', 'Select the truss configuration that best balances structural efficiency, constructability and cost.', ['Pratt truss', 'Warren truss', 'Howe truss'], CRIT_STRUCT),
      arg('Deck System Selection', 'The deck influences dead load, durability, construction speed and maintenance.', 'Choose a deck system compatible with the supporting truss and traffic requirements.', ['Cast-in-place reinforced concrete deck', 'Precast concrete deck panels', 'Orthotropic steel deck'], CRIT_STRUCT),
      arg('Primary Structural Material', 'The truss material governs weight, fabrication method and lifecycle maintenance.', 'Select the primary material for the truss members.', ['Weathering steel', 'Painted structural steel', 'Glued-laminated timber'])
    ],
    calculationTypes: [
      { title: 'Maximum Bending Moment (Simply Supported, Uniform Load)', purpose: 'Estimate the midspan moment of a girder or deck element.', equation: 'M_{\\max} = \\frac{wL^2}{8}' },
      { title: 'Axial Stress in a Member', purpose: 'Check normal stress in a truss member under axial force.', equation: '\\sigma = \\frac{F}{A}' },
      { title: 'Maximum Deflection (Simply Supported, Uniform Load)', purpose: 'Check serviceability deflection against the project limit.', equation: '\\delta_{\\max} = \\frac{5wL^4}{384EI}' }
    ],
    deliverables: ['Design criteria and load basis memo', 'Truss configuration comparison', 'General arrangement drawings', 'Preliminary member and connection calculations', 'Design review package'],
    riskCategories: ['Structural Capacity', 'Foundation and Scour', 'Fabrication and Erection', 'Durability and Corrosion', 'Regulatory Approval'],
    designConsiderations: [
      'Fatigue-sensitive details in tension members and connections',
      'Redundancy and load-path alternatives after the loss of a member',
      'Bearings and expansion joints for thermal movement',
      'Inspection access to critical details over the service life',
      'Drainage of the deck and truss joints to avoid water traps',
      'Erection stability before the structure is complete'
    ],
    reviewChecklist: review([
      ri('constraints', 'Governing load cases and the design code edition are identified and applied consistently.'),
      ri('calculations', 'Member force, stress and deflection calculations state units, inputs and sources.'),
      ri('evidence', 'Analysis model checks (equilibrium, hand-check of a typical member) are recorded as evidence.'),
      ri('drawings', 'General arrangement and connection drawings agree with the selected truss configuration.'),
      ri('decisions', 'The truss configuration argument shows why the rejected alternatives were not selected.')
    ])
  },
  {
    id: 'civil-foundation',
    discipline: 'civil',
    archetype: 'Structural Foundation',
    description: 'Foundation design from geotechnical data and structural loads: bearing, settlement, foundation type and groundwater.',
    version: '1.0.0',
    icon: 'Layers',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Geotechnical and Safety Constraints', environment: 'Subsurface and Site Data' },
    folders: folderSet(
      ['Design-Criteria', 'Geotechnical-Constraints', 'Subsurface-and-Site-Data'],
      ['Foundation-Type', 'Groundwater-Control', 'Supporting-Calculations'],
      ['Foundation-Plans', 'Reinforcement-Details', 'Diagrams-and-Sections']
    ),
    defaultAssetFolder: `${P3}/Foundation-Plans`,
    requirementCategories: ['Structural Loads', 'Soil Conditions', 'Bearing Capacity', 'Settlement', 'Foundation Type', 'Groundwater', 'Reinforcement', 'Construction Sequence'],
    suggestedRequirements: [
      rq('c', 'Structural Loads', 'Column and wall load schedule', 'Service and factored loads delivered by the superstructure at each support.', 'M', 'H', 'doc', 'A load schedule from the structural team lists dead, live and lateral reactions at every support (enter values).', 'kN'),
      rq('c', 'Foundation Type', 'Foundation type suited to soil and load', 'Shallow or deep foundations chosen from the geotechnical profile.', 'O', 'M', 'ana', 'Selected foundation type is justified against alternatives using the geotechnical report.'),
      rq('c', 'Reinforcement', 'Constructible reinforcement layout', 'Bar sizes and spacing that can be placed and consolidated on site.', 'P', 'L', 'insp', 'Reinforcement details are checked for congestion at column starter bars and laps.'),
      rq('k', 'Bearing Capacity', 'Bearing pressure within allowable', 'Applied soil pressure must remain below the allowable value with an appropriate factor of safety.', 'M', 'H', 'calc', 'Applied bearing pressure is below the allowable bearing resistance recommended by the geotechnical engineer (enter value).', 'kPa'),
      rq('k', 'Settlement', 'Total and differential settlement limits', 'Settlement must stay within what the structure and finishes can tolerate.', 'M', 'H', 'calc', 'Predicted total and differential settlement are below the tolerances agreed with the structural engineer (enter values).', 'mm'),
      rq('k', 'Construction Sequence', 'Excavation stability and neighbouring structures', 'Temporary support and protection of adjacent structures and services.', 'M', 'M', 'ana', 'Excavation support concept is documented and checked against nearby structures and utilities.'),
      rq('e', 'Soil Conditions', 'Subsurface profile and soil parameters', 'Borehole logs, strength and compressibility parameters used in design.', 'M', 'H', 'doc', 'Geotechnical investigation report is on file and design parameters are referenced to it.'),
      rq('e', 'Groundwater', 'Groundwater level and seasonal variation', 'Water table depth, perched water and dewatering implications.', 'M', 'M', 'doc', 'Design groundwater level is stated with its source and seasonal range (enter values).', 'm'),
      rq('e', 'Soil Conditions', 'Frost depth and ground movement', 'Frost penetration, swelling or collapsible soils at the site.', 'O', 'M', 'doc', 'Footing depth or insulation strategy addresses the frost depth identified for the site (enter value).', 'm')
    ],
    suggestedArguments: [
      arg('Foundation Type Selection', 'Soil strength, settlement tolerance and column loads determine whether shallow or deep foundations are appropriate.', 'Select a foundation system that satisfies bearing and settlement requirements at reasonable cost.', ['Spread footings', 'Mat (raft) foundation', 'Driven or drilled piles'], CRIT_STRUCT),
      arg('Groundwater Control Approach', 'Groundwater above the founding level complicates excavation and concrete placement.', 'Choose a control method that keeps excavations stable and dry without harming neighbours.', ['Sump pumping from open excavation', 'Wellpoint dewatering', 'Sheet pile cut-off wall']),
      arg('Foundation Concrete and Reinforcement Strategy', 'Concrete exposure, cover and bar detailing affect durability and speed of construction.', 'Select a reinforcement and concrete approach suitable for the exposure and soil chemistry.', ['Conventional deformed reinforcing bars', 'Welded wire reinforcement mats', 'Post-tensioned slab'])
    ],
    calculationTypes: [
      { title: 'Average Bearing Pressure', purpose: 'Compare the pressure under a footing with the allowable value.', equation: 'q = \\frac{P}{A}' },
      { title: 'Ultimate Bearing Capacity of a Strip Footing', purpose: 'Terzaghi-form check of ultimate capacity from soil parameters.', equation: 'q_{u} = cN_c + qN_q + \\tfrac{1}{2}\\gamma B N_\\gamma' },
      { title: 'Factor of Safety Against Bearing Failure', purpose: 'Express the margin between ultimate capacity and applied pressure.', equation: 'FS = \\frac{q_{u}}{q}' },
      { title: 'Cantilever Moment at Column Face', purpose: 'Estimate footing bending moment for reinforcement design.', equation: 'M = \\frac{qL^2}{2}' }
    ],
    deliverables: ['Geotechnical data summary', 'Foundation type comparison', 'Foundation plan and sections', 'Bearing and settlement calculations'],
    riskCategories: ['Subsurface Uncertainty', 'Excess Settlement', 'Groundwater and Dewatering', 'Adjacent Structures', 'Construction Quality'],
    designConsiderations: [
      'Variability of soils between boreholes and the need for confirmation at excavation',
      'Uplift, sliding and overturning checks for lateral loads',
      'Construction joints and waterproofing below the water table',
      'Frost protection of shallow footings',
      'Sulphate or chloride exposure of buried concrete',
      'Interaction between neighbouring footings'
    ],
    reviewChecklist: review([
      ri('constraints', 'Bearing and settlement limits are traceable to the geotechnical recommendations.'),
      ri('calculations', 'Soil parameters used in the calculations match the geotechnical report.'),
      ri('evidence', 'Geotechnical report and load schedule are attached or referenced as evidence.'),
      ri('drawings', 'Foundation plan, sections and reinforcement details agree with the calculations.'),
      ri('assumptions', 'Assumed groundwater level and soil properties are flagged for confirmation on site.')
    ])
  },
  {
    id: 'civil-water-drainage',
    discipline: 'civil',
    archetype: 'Water and Drainage System',
    description: 'Stormwater and drainage design: design flows, conveyance, storage, outfall and maintenance.',
    version: '1.0.0',
    icon: 'Droplets',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Hydraulic and Safety Constraints', environment: 'Catchment and Climate Data' },
    folders: folderSet(
      ['Design-Criteria', 'Hydraulic-Constraints', 'Catchment-and-Climate-Data'],
      ['Conveyance-Selection', 'Stormwater-Storage', 'Supporting-Calculations'],
      ['Drainage-Plans', 'Profiles-and-Sections', 'Catchment-Maps']
    ),
    defaultAssetFolder: `${P3}/Drainage-Plans`,
    requirementCategories: ['Design Flow', 'Pipe Sizing', 'Hydraulic Grade', 'Inlet Capacity', 'Stormwater Storage', 'Water Quality', 'Maintenance Access', 'Outfall'],
    suggestedRequirements: [
      rq('c', 'Design Flow', 'Design storm and peak flow', 'The storm return period and resulting peak flow used to size the system.', 'M', 'H', 'calc', 'Design return period is set by the governing municipal or regional guideline and peak flow is calculated for each sub-catchment (enter values).', 'L/s'),
      rq('c', 'Stormwater Storage', 'Peak flow attenuation', 'Detention or retention storage that limits discharge to the receiving system.', 'O', 'M', 'sim', 'Post-development peak discharge does not exceed the allowable release rate set by the approving authority (enter value).', 'L/s'),
      rq('c', 'Water Quality', 'Treatment of runoff before discharge', 'Removal of suspended solids, oils or nutrients as required.', 'P', 'L', 'doc', 'A treatment approach is identified and its performance basis is referenced.'),
      rq('k', 'Pipe Sizing', 'Pipe capacity and velocity limits', 'Pipes must carry the design flow within velocity limits that avoid deposition and scour.', 'M', 'H', 'calc', 'Each pipe run carries its design flow within the velocity range specified by the governing guideline (enter limits).', 'm/s'),
      rq('k', 'Hydraulic Grade', 'Hydraulic grade line below surface', 'The hydraulic grade line must stay below manhole and inlet rim elevations in the design storm.', 'M', 'H', 'calc', 'Computed hydraulic grade line is below rim elevations at all structures with the margin specified by the team (enter value).', 'm'),
      rq('k', 'Inlet Capacity', 'Inlet and catch basin capacity', 'Surface inlets intercept the design flow without excessive ponding.', 'M', 'M', 'calc', 'Inlet capacity exceeds the inflow at each inlet, or bypass flow is routed to a downstream inlet.'),
      rq('e', 'Design Flow', 'Rainfall intensity and catchment data', 'Intensity-duration-frequency data, catchment areas and runoff coefficients.', 'M', 'M', 'doc', 'Rainfall data source, catchment areas and runoff coefficients are recorded with references.'),
      rq('e', 'Outfall', 'Receiving water level and outfall conditions', 'Tailwater, erosion potential and environmental constraints at the outfall.', 'M', 'M', 'doc', 'Receiving water levels and outfall protection needs are documented (enter values).', 'm'),
      rq('e', 'Maintenance Access', 'Access for cleaning and inspection', 'Manhole spacing and access for vacuum trucks or crews.', 'P', 'L', 'insp', 'Maintenance access points are shown on the plan and reachable from public right-of-way.')
    ],
    suggestedArguments: [
      arg('Conveyance System Selection', 'Runoff must be collected and moved to an outfall within site grading and right-of-way limits.', 'Select the conveyance concept that meets capacity at acceptable cost and maintenance burden.', ['Gravity storm sewer', 'Grassed swales and ditches', 'Combined swale and storm sewer'], CRIT_STRUCT),
      arg('Stormwater Storage Approach', 'Post-development runoff may exceed what the receiving system can accept.', 'Choose a storage facility that attenuates peak flow within the available land.', ['Dry detention pond', 'Underground storage tanks', 'Infiltration trench'], crit([['Cost', 25], ['Performance', 25], ['Maintainability', 20], ['Environmental impact', 20], ['Feasibility', 10]])),
      arg('Pipe Material Selection', 'Pipe material affects roughness, strength, service life and installed cost.', 'Select a pipe material suited to depth, soils and flow conditions.', ['Reinforced concrete pipe', 'High-density polyethylene pipe', 'PVC pipe'])
    ],
    calculationTypes: [
      { title: 'Rational Method Peak Flow', purpose: 'Estimate peak runoff from a small catchment (apply unit-consistent coefficient).', equation: 'Q = C\\, i\\, A' },
      { title: 'Manning Velocity', purpose: 'Estimate full-flow velocity in a pipe or channel.', equation: 'V = \\frac{1}{n} R^{2/3} S^{1/2}' },
      { title: 'Continuity', purpose: 'Relate flow, velocity and flow area.', equation: 'Q = V A' },
      { title: 'Darcy-Weisbach Head Loss', purpose: 'Estimate friction head loss in a pressurized pipe or forcemain.', equation: 'h_f = f \\frac{L}{D} \\frac{V^2}{2g}' }
    ],
    deliverables: ['Catchment and design flow summary', 'Storm sewer design table', 'Drainage plan and profiles', 'Storage facility sizing note', 'Design review package'],
    riskCategories: ['Flooding and Surcharge', 'Erosion and Scour', 'Water Quality Compliance', 'Maintenance Neglect', 'Climate Change Uncertainty'],
    designConsiderations: [
      'Major-storm overland flow route when the minor system is exceeded',
      'Tailwater effects from the receiving watercourse',
      'Sediment deposition at low velocities',
      'Climate change allowance on rainfall intensity as directed by the authority',
      'Utility conflicts and minimum cover',
      'Safety of open storage facilities and inlets'
    ],
    reviewChecklist: review([
      ri('constraints', 'Design storm, release rate and velocity limits are traceable to the governing guideline.'),
      ri('calculations', 'Flow calculations state catchment areas, coefficients and units for every run.'),
      ri('evidence', 'Hydraulic model output or hand calculation tables are retained as evidence.'),
      ri('drawings', 'Plan and profile drawings match pipe sizes, slopes and invert elevations in the design table.'),
      ri('assumptions', 'Rainfall, runoff coefficient and tailwater assumptions are justified.')
    ])
  },
  {
    id: 'civil-roadway',
    discipline: 'civil',
    archetype: 'Roadway Design',
    description: 'Geometric and pavement design for a roadway segment: alignment, sight distance, pavement structure, drainage and safety.',
    version: '1.0.0',
    icon: 'Route',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Geometric and Safety Constraints', environment: 'Corridor and Traffic Data' },
    folders: folderSet(
      ['Design-Criteria', 'Geometric-and-Safety-Constraints', 'Corridor-and-Traffic-Data'],
      ['Alignment-Options', 'Pavement-Structure', 'Supporting-Calculations'],
      ['Plan-and-Profile', 'Typical-Sections', 'Intersection-Layouts']
    ),
    defaultAssetFolder: `${P3}/Plan-and-Profile`,
    requirementCategories: ['Design Speed', 'Geometric Design', 'Sight Distance', 'Pavement Structure', 'Drainage', 'Traffic Volume', 'Intersections', 'Safety Features'],
    suggestedRequirements: [
      rq('c', 'Design Speed', 'Design speed and functional class', 'Road classification and the design speed that governs geometry.', 'M', 'H', 'doc', 'Functional classification and design speed are confirmed with the road authority (enter values).', 'km/h'),
      rq('c', 'Traffic Volume', 'Design traffic and growth', 'Current traffic, heavy-vehicle share and growth over the design period.', 'M', 'M', 'doc', 'Design traffic volumes and heavy-vehicle counts are recorded with their source (enter values).', 'veh/day'),
      rq('c', 'Intersections', 'Intersection operational performance', 'Control type and geometry that deliver acceptable delay and safety.', 'O', 'M', 'sim', 'Intersection layout performs acceptably in a traffic operations analysis against the authority criteria (enter targets).'),
      rq('k', 'Sight Distance', 'Stopping sight distance provided', 'Horizontal and vertical geometry must provide adequate stopping sight distance.', 'M', 'H', 'calc', 'Provided stopping sight distance meets or exceeds the required value for the design speed at every curve and crest (enter values).', 'm'),
      rq('k', 'Geometric Design', 'Horizontal curve radius and superelevation', 'Curves must be consistent with design speed, side-friction and superelevation limits.', 'M', 'H', 'calc', 'Each curve satisfies the minimum radius and superelevation criteria from the governing geometric design guide (record edition).', 'm'),
      rq('k', 'Safety Features', 'Roadside hazards and clear zone', 'Treatment of fixed objects, slopes and barriers beside the travelled way.', 'M', 'M', 'insp', 'Roadside hazards within the clear zone are identified and removed, shielded or justified.'),
      rq('e', 'Pavement Structure', 'Subgrade strength and frost conditions', 'Subgrade support, frost susceptibility and seasonal weakening.', 'M', 'M', 'test', 'Subgrade strength values from testing are recorded and used in the pavement design (enter values).'),
      rq('e', 'Drainage', 'Roadside and cross drainage', 'Ditches, culverts and surface drainage that protect the pavement structure.', 'O', 'M', 'calc', 'Roadside drainage and culverts are sized for the design storm set by the road authority (enter value).'),
      rq('e', 'Geometric Design', 'Right-of-way and environmental boundaries', 'Property, utilities and sensitive areas that constrain the corridor.', 'P', 'L', 'doc', 'Corridor limits and constraints are shown on the plan.')
    ],
    suggestedArguments: [
      arg('Pavement Type Selection', 'Traffic loading, subgrade strength and lifecycle cost determine the pavement structure.', 'Choose a pavement type that meets structural demands with acceptable lifecycle cost.', ['Flexible asphalt pavement', 'Rigid concrete pavement', 'Composite pavement'], CRIT_STRUCT),
      arg('Intersection Control Selection', 'The intersection must move traffic safely at the forecast volumes.', 'Select the control type with the best balance of safety, delay and footprint.', ['Signalized intersection', 'Single-lane roundabout', 'Stop-controlled intersection'], crit([['Safety or Strength', 35], ['Performance', 25], ['Cost', 20], ['Feasibility', 20]])),
      arg('Alignment Option Selection', 'Several corridors may satisfy the connection; each differs in earthworks, property and environment.', 'Pick the alignment that best satisfies geometry with the least impact.', ['Existing corridor widening', 'Offset alignment on new right-of-way'])
    ],
    calculationTypes: [
      { title: 'Stopping Sight Distance', purpose: 'Reaction plus braking distance, with speed in km/h and grade as a fraction.', equation: 'd = 0.278\\, V\\, t + \\frac{V^2}{254\\,(f + G)}' },
      { title: 'Minimum Horizontal Curve Radius', purpose: 'Relate speed, superelevation and side friction.', equation: 'R = \\frac{V^2}{127\\,(e + f)}' },
      { title: 'Crest Vertical Curve Length', purpose: 'Length from the K-value and algebraic grade difference.', equation: 'L = K\\,A' }
    ],
    deliverables: ['Design criteria memo', 'Plan and profile drawings', 'Typical cross-sections', 'Pavement design summary', 'Drainage design summary'],
    riskCategories: ['Safety Performance', 'Pavement Failure', 'Property and Utilities', 'Environmental Permitting', 'Construction Staging'],
    designConsiderations: [
      'Consistency of successive curves and design speed',
      'Pedestrian and cyclist provision',
      'Winter maintenance and snow storage',
      'Drainage at superelevation transitions',
      'Access management along the corridor',
      'Staged construction and traffic detours'
    ],
    reviewChecklist: review([
      ri('constraints', 'Geometric criteria cite the governing design guide and its edition.'),
      ri('calculations', 'Sight distance and curve calculations list design speed, grade and friction inputs.'),
      ri('evidence', 'Traffic counts and subgrade test results are filed as evidence.'),
      ri('drawings', 'Plan, profile and typical sections are consistent with each other.'),
      ri('decisions', 'Pavement and alignment choices include lifecycle considerations, not only first cost.')
    ])
  },
  {
    id: 'civil-building-structure',
    discipline: 'civil',
    archetype: 'Building Structural System',
    description: 'Preliminary structural system for a building: gravity load path, lateral system, floors, columns and serviceability.',
    version: '1.0.0',
    icon: 'Building',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Load and Safety Constraints', environment: 'Site and Climate Data' },
    folders: folderSet(
      ['Design-Criteria', 'Load-and-Safety-Constraints', 'Site-and-Climate-Data'],
      ['Lateral-System', 'Floor-System', 'Supporting-Calculations'],
      ['Structural-Plans', 'Framing-Details', '3D-Models']
    ),
    defaultAssetFolder: `${P3}/Structural-Plans`,
    requirementCategories: ['Gravity Load Path', 'Lateral System', 'Floor System', 'Column Layout', 'Fire Resistance', 'Serviceability', 'Wind and Seismic Demand', 'Foundation Interface'],
    suggestedRequirements: [
      rq('c', 'Column Layout', 'Column grid compatible with architecture', 'Grid spacing that respects planning, parking and mechanical routing.', 'O', 'M', 'doc', 'Column grid is coordinated with the architectural plans and agreed by the team (enter grid dimensions).', 'm'),
      rq('c', 'Floor System', 'Floor system depth and span capability', 'Structural depth within the floor-to-floor height allowance.', 'M', 'M', 'calc', 'Selected floor system spans the typical bay within the available structural depth (enter value).', 'mm'),
      rq('c', 'Gravity Load Path', 'Continuous load path to foundations', 'Every gravity load must travel to the foundation through identified elements.', 'M', 'H', 'ana', 'Load path diagram shows each floor load reaching the foundation without discontinuity, or transfers are designed.'),
      rq('k', 'Wind and Seismic Demand', 'Lateral loads identified and resisted', 'Wind and, where applicable, seismic loads and the system that resists them.', 'M', 'H', 'calc', 'Identify the governing building code and apply its wind and seismic provisions for the site (record edition and parameters).'),
      rq('k', 'Serviceability', 'Floor vibration and drift limits', 'Occupant comfort and non-structural damage limit the deflection and drift.', 'M', 'M', 'calc', 'Computed deflection, drift and vibration response are within the limits agreed for the occupancy (enter values).'),
      rq('k', 'Fire Resistance', 'Fire resistance rating of structural members', 'Required ratings for the occupancy and construction type.', 'M', 'M', 'doc', 'Required fire resistance is identified from the building code and protection method is stated for each member type.'),
      rq('e', 'Wind and Seismic Demand', 'Site wind, snow and seismic hazard', 'Climatic and seismic hazard values for the building location.', 'M', 'H', 'doc', 'Site hazard values are recorded with their source (enter values).'),
      rq('e', 'Foundation Interface', 'Soil and foundation reactions', 'Coordination of column reactions with the foundation design.', 'O', 'M', 'doc', 'Column reactions are transmitted to the foundation designer and soil parameters are recorded.', 'kN'),
      rq('e', 'Gravity Load Path', 'Embodied carbon awareness', 'Material choices influence embodied carbon of the structure.', 'P', 'L', 'ana', 'An estimate of embodied carbon for the main structural options is recorded where data is available.')
    ],
    suggestedArguments: [
      arg('Lateral Force-Resisting System', 'Wind and seismic forces must reach the foundation without excessive drift.', 'Select the lateral system that controls drift economically while keeping the plan open.', ['Steel moment frame', 'Concentrically braced frame', 'Reinforced concrete shear walls'], CRIT_STRUCT),
      arg('Floor System Selection', 'The floor system governs structural depth, mass, speed of construction and vibration performance.', 'Choose a floor system for the typical bay.', ['Composite steel deck with steel beams', 'Cast-in-place flat plate', 'Precast hollow-core planks']),
      arg('Primary Structural Material', 'The structural material drives fire protection, construction schedule and embodied carbon.', 'Select the primary structural material for the superstructure.', ['Structural steel', 'Reinforced concrete', 'Mass timber'], crit([['Cost', 20], ['Safety or Strength', 25], ['Feasibility', 20], ['Environmental impact', 20], ['Durability', 15]]))
    ],
    calculationTypes: [
      { title: 'Beam Midspan Moment', purpose: 'Preliminary flexural demand on a floor beam under uniform load.', equation: 'M = \\frac{wL^2}{8}' },
      { title: 'Euler Critical Buckling Load', purpose: 'Screen column slenderness before detailed design.', equation: 'P_{cr} = \\frac{\\pi^2 E I}{(K L)^2}' },
      { title: 'Axial Stress', purpose: 'Check a column or brace under axial load.', equation: '\\sigma = \\frac{P}{A}' },
      { title: 'Interstorey Drift Ratio', purpose: 'Compare relative storey displacement with storey height.', equation: '\\theta = \\frac{\\Delta}{h}' }
    ],
    deliverables: ['Structural design basis', 'Framing plans and load path diagram', 'Lateral system comparison', 'Preliminary member sizing calculations', 'Design review package'],
    riskCategories: ['Lateral Performance', 'Constructability', 'Coordination with Other Trades', 'Fire Protection', 'Schedule and Cost'],
    designConsiderations: [
      'Transfer elements and discontinuities in the load path',
      'Torsion from asymmetric stiffness',
      'Diaphragm action and collector forces',
      'Floor vibration under walking',
      'Progressive collapse resilience of key elements',
      'Openings for mechanical and elevator shafts'
    ],
    reviewChecklist: review([
      ri('constraints', 'Applicable building code and edition are stated and wind and seismic inputs are recorded.'),
      ri('calculations', 'Preliminary member sizing is documented with load tributary areas and combinations.'),
      ri('evidence', 'Hand checks of any computer model results are filed as evidence.'),
      ri('drawings', 'Framing plans, elevations and details are consistent with the lateral system choice.'),
      ri('decisions', 'The lateral system argument considers architectural and construction impacts.')
    ])
  }
];

const MECHANICAL: ProjectTemplate[] = [
  {
    id: 'mech-robotics',
    discipline: 'mechanical',
    archetype: 'Robotics System',
    description: 'Robot arm or mobile manipulator design: kinematics, actuators, power, control, sensing and safety.',
    version: '1.0.0',
    icon: 'Bot',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Motion and Safety Constraints', environment: 'Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Motion-and-Safety-Constraints', 'Operating-Environment'],
      ['Actuator-Selection', 'Kinematic-Architecture', 'Supporting-Calculations'],
      ['Mechanical-Drawings', 'CAD-Assemblies', 'Wiring-and-Control-Diagrams']
    ),
    defaultAssetFolder: `${P3}/Mechanical-Drawings`,
    requirementCategories: ['Degrees of Freedom', 'Payload', 'Actuator Selection', 'Power Requirements', 'Control System', 'Sensor Integration', 'Mechanical Tolerances', 'Safety'],
    suggestedRequirements: [
      rq('c', 'Degrees of Freedom', 'Degrees of freedom match the task', 'The number and arrangement of joints needed to reach required poses.', 'M', 'H', 'ana', 'Kinematic analysis shows the end effector can reach every required pose and orientation (enter task poses).'),
      rq('c', 'Payload', 'Rated payload at full reach', 'Maximum mass the robot must handle at maximum extension.', 'M', 'H', 'calc', 'Joint torque at full reach with the rated payload is within actuator capability with margin (enter payload).', 'kg'),
      rq('c', 'Control System', 'Repeatable positioning', 'Positioning accuracy and repeatability the task requires.', 'O', 'M', 'test', 'Measured repeatability meets the task tolerance agreed with the stakeholder (enter value).', 'mm'),
      rq('k', 'Safety', 'Emergency stop and safe-state behaviour', 'The system must reach a safe state when the stop is activated or power is lost.', 'M', 'H', 'test', 'Emergency stop removes drive power and brakes engage; behaviour is demonstrated in testing.'),
      rq('k', 'Power Requirements', 'Peak and continuous power within supply', 'Supply and wiring must handle simultaneous joint peaks.', 'M', 'M', 'calc', 'Peak electrical demand is calculated and is below the supply and cable ratings (enter values).', 'W'),
      rq('k', 'Mechanical Tolerances', 'Joint stiffness and backlash', 'Structural deflection and gear backlash that degrade accuracy.', 'O', 'M', 'ana', 'Deflection at the end effector under rated payload is within the positioning budget (enter value).', 'mm'),
      rq('e', 'Safety', 'Workspace and human interaction', 'Whether people share the workspace and what guarding or speed limiting is needed.', 'M', 'H', 'doc', 'Identify the applicable machinery and robot safety standards and record the risk assessment outcome for the work cell.'),
      rq('e', 'Sensor Integration', 'Sensing for the task environment', 'Position, force and vision sensing needed in the operating conditions.', 'O', 'M', 'test', 'Sensor selection is justified against lighting, dust and vibration at the site.'),
      rq('e', 'Power Requirements', 'Operating temperature and ingress conditions', 'Ambient range and cleanliness affecting motors, electronics and seals.', 'P', 'L', 'doc', 'Ambient temperature range and ingress protection level are specified (enter values).', '°C')
    ],
    suggestedArguments: [
      arg('Actuator Selection', 'Joint actuators must provide torque, speed and control bandwidth within mass and cost limits.', 'Select the joint actuator type that meets torque and accuracy needs.', ['Brushless DC motor with gearbox', 'Stepper motor', 'Servo motor'], CRIT_MECH),
      arg('Kinematic Architecture', 'The arm layout determines reach, stiffness, singularities and complexity.', 'Choose the kinematic structure suited to the workspace and payload.', ['Serial articulated arm', 'SCARA arm', 'Delta (parallel) robot'], CRIT_MECH),
      arg('Controller Platform', 'The controller must run motion control loops and safety logic reliably.', 'Select the controller platform for real-time motion control.', ['Microcontroller with motor drivers', 'Single-board computer with real-time co-processor', 'Industrial motion controller'], CRIT_ELEC)
    ],
    calculationTypes: [
      { title: 'Joint Torque from Load', purpose: 'Static torque at a joint from a force at a lever arm.', equation: '\\tau = F\\,r' },
      { title: 'Motor Torque Through a Gearbox', purpose: 'Reflect load torque to the motor with ratio and efficiency.', equation: '\\tau_{m} = \\frac{\\tau_{L}}{N\\,\\eta}' },
      { title: 'Mechanical Power', purpose: 'Power demanded from an actuator.', equation: 'P = \\tau\\,\\omega' },
      { title: 'Velocity Kinematics', purpose: 'Relate joint rates to end-effector velocity via the Jacobian.', equation: 'v = J(q)\\,\\dot{q}' }
    ],
    deliverables: ['Kinematic and workspace analysis', 'Actuator sizing sheet', 'CAD assembly and drawing package', 'Control and wiring diagrams', 'Safety risk assessment record'],
    riskCategories: ['Mechanical Failure', 'Control Instability', 'Operator Safety', 'Integration', 'Schedule and Supply'],
    designConsiderations: [
      'Gravity compensation and holding brakes on vertical axes',
      'Cable routing through moving joints',
      'Singularities within the workspace',
      'Thermal limits of motors during duty cycles',
      'Calibration procedure and drift',
      'Serviceability of joints and encoders'
    ],
    reviewChecklist: review([
      ri('constraints', 'Safety constraints identify the applicable standards and the stop and guarding strategy.'),
      ri('calculations', 'Torque and power calculations cover worst-case poses and acceleration, with units.'),
      ri('evidence', 'Test evidence for repeatability, payload and stop behaviour is attached where tested.'),
      ri('drawings', 'Assembly drawings show interfaces, cable paths and mounting for each joint.'),
      ri('decisions', 'The actuator argument compares torque density, control bandwidth and cost.')
    ])
  },
  {
    id: 'mech-hvac',
    discipline: 'mechanical',
    archetype: 'HVAC System',
    description: 'Heating, ventilation and cooling design: thermal loads, ventilation, equipment, air distribution and maintainability.',
    version: '1.0.0',
    icon: 'Wind',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Load and Safety Constraints', environment: 'Building and Climate Data' },
    folders: folderSet(
      ['Design-Criteria', 'Load-and-Safety-Constraints', 'Building-and-Climate-Data'],
      ['Equipment-Selection', 'Air-Distribution', 'Supporting-Calculations'],
      ['Mechanical-Plans', 'Duct-and-Piping-Layouts', 'Schematics-and-Controls']
    ),
    defaultAssetFolder: `${P3}/Mechanical-Plans`,
    requirementCategories: ['Thermal Load', 'Ventilation', 'Energy Consumption', 'Equipment Selection', 'Duct Routing', 'Maintenance Accessibility'],
    suggestedRequirements: [
      rq('c', 'Thermal Load', 'Peak heating and cooling loads', 'Calculated design loads for each zone and for the building.', 'M', 'H', 'calc', 'Heating and cooling loads are calculated for each zone using the design conditions chosen by the team (enter values).', 'kW'),
      rq('c', 'Energy Consumption', 'Seasonal energy performance', 'Annual energy use of the selected system relative to alternatives.', 'O', 'M', 'sim', 'Estimated annual energy use is compared across alternatives and meets the project energy target (enter target).', 'kWh/year'),
      rq('c', 'Equipment Selection', 'Right-sized equipment', 'Equipment capacity matched to calculated loads without gross oversizing.', 'O', 'M', 'calc', 'Selected equipment capacity covers the calculated load with the sizing margin agreed by the team (enter value).'),
      rq('k', 'Ventilation', 'Outdoor air for occupants', 'Fresh air delivered to each space for the occupancy and use.', 'M', 'H', 'calc', 'Identify the governing ventilation standard for the jurisdiction and demonstrate the required outdoor air per space (enter values).', 'L/s'),
      rq('k', 'Duct Routing', 'Duct velocity and pressure drop', 'Ducts sized to limit noise and fan energy.', 'M', 'M', 'calc', 'Duct velocities and total external static pressure are within the limits selected for noise and the fan duty (enter values).', 'Pa'),
      rq('k', 'Equipment Selection', 'Combustion and refrigerant safety', 'Safe venting, clearances and refrigerant handling for the chosen equipment.', 'M', 'H', 'doc', 'Manufacturer clearances and applicable fuel-gas and refrigerant safety requirements are identified and reflected in the layout.'),
      rq('e', 'Thermal Load', 'Design weather conditions', 'Outdoor design temperatures and humidity for the location.', 'M', 'M', 'doc', 'Design weather data are recorded with their source (enter values).', '°C'),
      rq('e', 'Duct Routing', 'Building envelope and ceiling space', 'Envelope performance and available plenum and shaft space.', 'M', 'M', 'doc', 'Envelope U-values, air tightness assumptions and routing space are documented.'),
      rq('e', 'Maintenance Accessibility', 'Service access to equipment and filters', 'Clearance and access for inspection, filter changes and replacement.', 'P', 'L', 'insp', 'Service clearances are shown on the layout for each major piece of equipment.')
    ],
    suggestedArguments: [
      arg('Primary Heating and Cooling Equipment', 'The heating and cooling source sets energy use, emissions and first cost.', 'Select the primary equipment that satisfies the loads at acceptable lifecycle cost.', ['Air-source heat pump', 'Gas furnace with split air conditioner', 'Ground-source heat pump'], CRIT_ENERGY),
      arg('Air Distribution Strategy', 'Distribution affects comfort, fan energy and ceiling space.', 'Choose the air distribution approach for the occupancy and zoning.', ['Ducted variable air volume', 'Constant volume ducted system', 'Dedicated outdoor air with terminal units'], CRIT_ENERGY),
      arg('Ventilation Heat Recovery', 'Ventilation air carries a large share of the load in cold or humid climates.', 'Decide whether and how to recover energy from exhaust air.', ['Energy recovery ventilator', 'Heat recovery ventilator', 'Exhaust-only ventilation'])
    ],
    calculationTypes: [
      { title: 'Sensible Heat Transfer in an Air or Water Stream', purpose: 'Heat carried by a flow for a given temperature change.', equation: 'Q = \\dot{m}\\, c_p\\, \\Delta T' },
      { title: 'Conduction Through the Envelope', purpose: 'Envelope heat loss or gain for a component.', equation: 'Q = U\\,A\\,\\Delta T' },
      { title: 'Required Airflow for a Sensible Load', purpose: 'Supply airflow to remove a sensible load at a chosen temperature difference.', equation: '\\dot{V} = \\frac{Q}{\\rho\\, c_p\\, \\Delta T}' },
      { title: 'Coefficient of Performance', purpose: 'Compare heat pump or chiller efficiency.', equation: 'COP = \\frac{Q_{out}}{W_{in}}' }
    ],
    deliverables: ['Load calculation summary', 'Equipment selection report', 'Duct and piping layout drawings', 'Control sequence of operations', 'Commissioning and maintenance notes'],
    riskCategories: ['Undersized or Oversized Equipment', 'Indoor Air Quality', 'Noise and Vibration', 'Energy Performance Gap', 'Installation Coordination'],
    designConsiderations: [
      'Part-load operation and turndown of equipment',
      'Humidity control, not only temperature',
      'Acoustic treatment of fans and ducts',
      'Condensate drainage and freeze protection',
      'Zoning and control strategy for varied occupancy',
      'Refrigerant choice and future phase-down'
    ],
    reviewChecklist: review([
      ri('constraints', 'The governing ventilation and energy standards are identified for the jurisdiction.'),
      ri('calculations', 'Load, airflow and pressure drop calculations list inputs, units and design conditions.'),
      ri('evidence', 'Manufacturer selection data and any energy simulation output are recorded as evidence.'),
      ri('drawings', 'Layouts show equipment clearances, duct sizes and coordination with other trades.'),
      ri('decisions', 'The equipment argument considers lifecycle cost and operating energy, not only first cost.')
    ])
  },
  {
    id: 'mech-pressure-vessel',
    discipline: 'mechanical',
    archetype: 'Pressure Vessel',
    description: 'Preliminary design of a pressure-containing vessel: shell and head geometry, materials, openings, welds and inspection.',
    version: '1.0.0',
    icon: 'Gauge',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Pressure and Safety Constraints', environment: 'Service and Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Pressure-and-Safety-Constraints', 'Service-Conditions'],
      ['Head-Geometry', 'Material-Selection', 'Supporting-Calculations'],
      ['Vessel-General-Arrangement', 'Nozzle-and-Weld-Details', '3D-Models']
    ),
    defaultAssetFolder: `${P3}/Vessel-General-Arrangement`,
    requirementCategories: ['Design Pressure and Temperature', 'Shell Thickness', 'Head Geometry', 'Material Selection', 'Nozzles and Openings', 'Weld Joints', 'Corrosion Allowance', 'Inspection and Testing'],
    suggestedRequirements: [
      rq('c', 'Design Pressure and Temperature', 'Design pressure and temperature', 'Maximum allowable working conditions with an allowance above normal operation.', 'M', 'H', 'doc', 'Design pressure and temperature are stated with the basis relative to operating and relief conditions (enter values).', 'kPa'),
      rq('c', 'Shell Thickness', 'Minimum required shell thickness', 'Thickness calculated from stress and corrosion allowance.', 'M', 'H', 'calc', 'Selected shell thickness exceeds the calculated required thickness plus corrosion allowance (enter values).', 'mm'),
      rq('c', 'Head Geometry', 'Efficient head form', 'Head shape balancing thickness, depth and fabrication cost.', 'O', 'M', 'ana', 'Head geometry is selected by comparing thickness, volume and forming cost.'),
      rq('k', 'Design Pressure and Temperature', 'Overpressure protection', 'A pressure relief strategy that prevents exceeding the maximum allowable pressure.', 'M', 'H', 'doc', 'Relief device type, set point and capacity basis are documented by a competent person.'),
      rq('k', 'Weld Joints', 'Weld joint category and examination', 'Weld types and the extent of non-destructive examination.', 'M', 'M', 'doc', 'Identify the governing pressure vessel code and record joint types and examination extent.'),
      rq('k', 'Nozzles and Openings', 'Reinforcement of openings', 'Openings weaken the shell and must be compensated.', 'M', 'M', 'calc', 'Each opening is checked for reinforcement using the method required by the governing code.'),
      rq('e', 'Material Selection', 'Fluid compatibility and temperature range', 'Corrosion, embrittlement and creep concerns for the contents and temperatures.', 'M', 'H', 'doc', 'Material is shown to be compatible with the contents and temperature range using a referenced source.'),
      rq('e', 'Corrosion Allowance', 'Corrosion and erosion rate', 'Expected material loss over the design life.', 'O', 'M', 'ana', 'Corrosion allowance is based on a documented corrosion rate and design life (enter values).', 'mm'),
      rq('e', 'Inspection and Testing', 'Access for inspection and pressure test', 'Manways, drains and lifting points that allow inspection and hydrostatic testing.', 'P', 'L', 'insp', 'Inspection openings and test connections are shown on the general arrangement.')
    ],
    suggestedArguments: [
      arg('Head Geometry Selection', 'The head form affects wall thickness, volume and fabrication complexity.', 'Select a head geometry for the design pressure and space envelope.', ['2:1 semi-ellipsoidal head', 'Torispherical head', 'Hemispherical head'], CRIT_MECH),
      arg('Shell Material Selection', 'The shell material affects allowable stress, corrosion resistance and weldability.', 'Select a material suited to the contents, temperature and cost.', ['Carbon steel', 'Austenitic stainless steel', 'Carbon steel with corrosion-resistant liner'], CRIT_MECH),
      arg('Vessel Support Configuration', 'Supports transmit weight and external loads to the foundation without overstressing the shell.', 'Select the support arrangement for the orientation and site.', ['Saddle supports (horizontal vessel)', 'Skirt support (vertical vessel)', 'Leg supports'])
    ],
    calculationTypes: [
      { title: 'Hoop (Circumferential) Stress in a Thin Cylinder', purpose: 'Screen shell stress from internal pressure.', equation: '\\sigma_h = \\frac{p\\,r}{t}' },
      { title: 'Longitudinal Stress in a Thin Cylinder', purpose: 'Axial stress from internal pressure on closed ends.', equation: '\\sigma_l = \\frac{p\\,r}{2t}' },
      { title: 'Stress in a Thin Spherical Shell', purpose: 'Membrane stress in a hemispherical head.', equation: '\\sigma = \\frac{p\\,r}{2t}' },
      { title: 'Factor of Safety on Yield', purpose: 'Compare a stress with yield strength.', equation: 'n = \\frac{S_y}{\\sigma}' }
    ],
    deliverables: ['Design basis and service conditions', 'Thickness and opening calculations', 'General arrangement drawing', 'Material and weld specification summary', 'Inspection and test plan'],
    riskCategories: ['Overpressure', 'Corrosion and Fatigue', 'Fabrication Quality', 'Fitness for Service', 'Regulatory Registration'],
    designConsiderations: [
      'Thin-wall formulae apply only when the wall is thin relative to the radius',
      'Local stresses at nozzles, supports and attachments',
      'Cyclic pressure and thermal transients causing fatigue',
      'Vacuum and external pressure buckling',
      'Brittle fracture at low temperature',
      'Registration and third-party inspection requirements'
    ],
    reviewChecklist: review([
      ri('constraints', 'The governing pressure equipment code and edition are identified and cited in the design basis.'),
      ri('calculations', 'Thickness and opening calculations are checked against the code method, not only thin-wall screening.'),
      ri('evidence', 'Material test reports and weld procedure records are tracked as evidence.'),
      ri('drawings', 'The general arrangement shows design conditions, nozzle schedule and inspection openings.'),
      ri('decisions', 'The material argument considers corrosion allowance and lifecycle inspection cost.')
    ])
  },
  {
    id: 'mech-transmission',
    discipline: 'mechanical',
    archetype: 'Mechanical Transmission',
    description: 'Power transmission design: ratio, gears or belts, shafts, bearings, lubrication and efficiency.',
    version: '1.0.0',
    icon: 'Settings2',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Load and Safety Constraints', environment: 'Duty and Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Load-and-Safety-Constraints', 'Duty-and-Environment'],
      ['Transmission-Type', 'Bearing-and-Lubrication', 'Supporting-Calculations'],
      ['Gearbox-Assembly-Drawings', 'Shaft-and-Gear-Details', '3D-Models']
    ),
    defaultAssetFolder: `${P3}/Gearbox-Assembly-Drawings`,
    requirementCategories: ['Power and Speed', 'Gear Ratio', 'Shaft Design', 'Bearing Selection', 'Lubrication', 'Efficiency', 'Noise and Vibration', 'Service Life'],
    suggestedRequirements: [
      rq('c', 'Power and Speed', 'Input power and speed range', 'Prime-mover power and speed the transmission must accept.', 'M', 'H', 'doc', 'Input power, speed range and duty cycle are specified by the driving and driven equipment (enter values).', 'kW'),
      rq('c', 'Gear Ratio', 'Overall ratio and output speed', 'Reduction that delivers the required output speed and torque.', 'M', 'H', 'calc', 'Overall ratio delivers the required output speed within the tolerance agreed (enter target).'),
      rq('c', 'Efficiency', 'Transmission efficiency', 'Power lost in meshing, bearings and seals.', 'O', 'M', 'ana', 'Estimated efficiency is calculated and compared with alternatives (enter target).', '%'),
      rq('k', 'Shaft Design', 'Shaft strength and deflection', 'Shafts must resist combined torsion and bending without excessive deflection.', 'M', 'H', 'calc', 'Shaft stress and deflection at gear and bearing locations are within the limits chosen by the team (enter values).', 'MPa'),
      rq('k', 'Bearing Selection', 'Bearing life for the duty cycle', 'Bearings sized for the loads and the required life.', 'M', 'H', 'calc', 'Calculated bearing life meets or exceeds the required service life for the duty cycle (enter hours).', 'h'),
      rq('k', 'Service Life', 'Guarding of rotating parts', 'Couplings, belts and chains need guards to protect people.', 'M', 'M', 'insp', 'All exposed rotating parts are enclosed or guarded in accordance with the applicable machinery safety requirements.'),
      rq('e', 'Lubrication', 'Operating temperature and lubricant', 'Ambient and oil temperature affecting lubricant selection and seals.', 'M', 'M', 'doc', 'Lubricant type, viscosity grade and temperature range are selected from the manufacturer data (enter values).', '°C'),
      rq('e', 'Noise and Vibration', 'Acceptable noise and vibration', 'Gear mesh and bearing excitation that affect the installation.', 'O', 'L', 'test', 'Measured noise and vibration satisfy the limits agreed with the equipment owner (enter values).', 'dB'),
      rq('e', 'Service Life', 'Contamination and maintenance interval', 'Dust, moisture and the planned lubricant and bearing change interval.', 'P', 'L', 'doc', 'Maintenance interval and breather or seal strategy are recorded.')
    ],
    suggestedArguments: [
      arg('Transmission Type Selection', 'Different transmission elements trade efficiency, cost, noise and layout flexibility.', 'Select the transmission type for the ratio and power.', ['Helical gear train', 'Synchronous belt drive', 'Roller chain drive'], CRIT_MECH),
      arg('Bearing Type Selection', 'Bearing type determines load capacity, stiffness and speed capability.', 'Choose the bearing type for each shaft based on load direction and speed.', ['Deep-groove ball bearings', 'Tapered roller bearings', 'Cylindrical roller bearings']),
      arg('Lubrication Method', 'Lubrication affects cooling, wear and maintenance.', 'Select a lubrication method suited to the speed and duty.', ['Oil bath (splash) lubrication', 'Grease lubrication', 'Forced circulation lubrication'], crit([['Performance', 30], ['Maintainability', 25], ['Cost', 20], ['Durability', 25]]))
    ],
    calculationTypes: [
      { title: 'Gear Ratio from Tooth Counts', purpose: 'Ratio between driving and driven gears.', equation: 'i = \\frac{z_2}{z_1} = \\frac{N_1}{N_2}' },
      { title: 'Power from Torque and Speed', purpose: 'Link the transmitted torque to power and speed.', equation: 'P = T\\,\\omega' },
      { title: 'Torsional Shear Stress in a Solid Shaft', purpose: 'Shear stress due to torque.', equation: '\\tau = \\frac{16\\,T}{\\pi d^3}' },
      { title: 'Basic Bearing Rating Life', purpose: 'Life in millions of revolutions from dynamic rating and equivalent load.', equation: 'L_{10} = \\left(\\frac{C}{P}\\right)^{p}' }
    ],
    deliverables: ['Duty cycle and ratio calculation', 'Shaft and bearing calculation sheet', 'Assembly and detail drawings', 'Lubrication and maintenance plan'],
    riskCategories: ['Gear Tooth or Shaft Failure', 'Lubrication Failure', 'Misalignment', 'Noise Complaints', 'Supply of Specialised Parts'],
    designConsiderations: [
      'Shock and overload factors on the nominal duty',
      'Shaft alignment and housing stiffness',
      'Thermal growth and bearing preload',
      'Sealing against leakage and contamination',
      'Backlash and efficiency trade-offs',
      'Access for assembly and disassembly of the gearbox'
    ],
    reviewChecklist: review([
      ri('constraints', 'Duty cycle, shock factors and guarding requirements are recorded and referenced.'),
      ri('calculations', 'Shaft, gear and bearing calculations use consistent torque, speed and load assumptions.'),
      ri('evidence', 'Supplier catalogue data and any test results are kept as evidence.'),
      ri('drawings', 'Assembly drawings show fits, seals, breathers and lubricant fill and drain points.'),
      ri('decisions', 'The transmission type argument compares efficiency, noise, size and maintenance.')
    ])
  },
  {
    id: 'mech-machine-component',
    discipline: 'mechanical',
    archetype: 'Machine Component Design',
    description: 'Design of a single loaded machine element: functional loads, strength and fatigue, material, tolerances and manufacture.',
    version: '1.0.0',
    icon: 'Wrench',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Strength and Safety Constraints', environment: 'Service and Manufacturing Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Strength-and-Safety-Constraints', 'Service-and-Manufacturing-Environment'],
      ['Material-Selection', 'Manufacturing-Process', 'Supporting-Calculations'],
      ['Part-Drawings', 'CAD-Models', 'Tolerance-Stack-Ups']
    ),
    defaultAssetFolder: `${P3}/Part-Drawings`,
    requirementCategories: ['Functional Loads', 'Fatigue Life', 'Material Selection', 'Tolerances and Fits', 'Manufacturing Process', 'Surface Finish', 'Assembly and Maintenance', 'Safety Factor'],
    suggestedRequirements: [
      rq('c', 'Functional Loads', 'Load cases including peak and cyclic', 'Static, peak and cyclic loads the part sees in service.', 'M', 'H', 'doc', 'Load cases are listed with magnitude, direction and number of cycles from the system-level analysis (enter values).', 'N'),
      rq('c', 'Tolerances and Fits', 'Functional tolerances and fits', 'Dimensions and fits that control function and assembly.', 'M', 'M', 'ana', 'Critical dimensions carry tolerances supported by a tolerance stack-up (enter values).', 'mm'),
      rq('c', 'Manufacturing Process', 'Manufacturable with available processes', 'Geometry that suits the chosen process and quantity.', 'O', 'M', 'doc', 'Manufacturing process is selected and design-for-manufacture feedback is recorded.'),
      rq('k', 'Safety Factor', 'Static strength margin', 'Peak stress below yield with the factor of safety the team selects.', 'M', 'H', 'calc', 'Computed peak stress is below allowable yield stress with the design factor of safety (enter value).', 'MPa'),
      rq('k', 'Fatigue Life', 'Fatigue life for cyclic loading', 'Endurance against the expected load history including stress concentrations.', 'M', 'H', 'calc', 'Fatigue analysis shows the part reaches the required life using a documented method (enter life).', 'cycles'),
      rq('k', 'Assembly and Maintenance', 'Failure mode does not create hazard', 'The component should fail in a way that does not endanger people.', 'O', 'M', 'ana', 'Foreseeable failure modes and their consequences are reviewed and recorded.'),
      rq('e', 'Material Selection', 'Corrosion and temperature exposure', 'Operating temperature and corrosive media that affect the material.', 'M', 'M', 'doc', 'Material is compatible with the service environment based on a referenced source (enter conditions).', '°C'),
      rq('e', 'Surface Finish', 'Surface finish and treatment', 'Roughness, coating or heat treatment needed for function and fatigue.', 'O', 'L', 'insp', 'Surface finish and treatment are specified on the drawing with inspection method.'),
      rq('e', 'Assembly and Maintenance', 'Serviceability and replacement', 'How the part is inspected, replaced and handled.', 'P', 'L', 'doc', 'Replacement procedure and spare part strategy are described.')
    ],
    suggestedArguments: [
      arg('Material Selection', 'Material determines strength, mass, corrosion behaviour and machinability.', 'Select a material that meets strength and fatigue needs within cost and mass limits.', ['Aluminium alloy 6061-T6', 'Medium-carbon steel (quenched and tempered)', 'Austenitic stainless steel'], CRIT_MECH),
      arg('Manufacturing Process Selection', 'The process affects tolerances, strength, lead time and unit cost at the planned volume.', 'Choose a process for the planned quantity.', ['CNC machining from billet', 'Casting with finish machining', 'Metal additive manufacturing'], CRIT_MECH),
      arg('Fatigue Improvement Strategy', 'Stress concentrations limit life at fillets, holes and keyways.', 'Decide how to meet the fatigue life requirement.', ['Increase fillet radii and section', 'Shot peening of critical surfaces', 'Higher-strength material'])
    ],
    calculationTypes: [
      { title: 'Axial Stress', purpose: 'Direct stress in a member under axial load.', equation: '\\sigma = \\frac{F}{A}' },
      { title: 'Bending Stress', purpose: 'Flexural stress at a distance from the neutral axis.', equation: '\\sigma = \\frac{M\\,y}{I}' },
      { title: 'Modified Goodman Fatigue Criterion', purpose: 'Combine alternating and mean stress with endurance and ultimate strength.', equation: '\\frac{\\sigma_a}{S_e} + \\frac{\\sigma_m}{S_{ut}} = \\frac{1}{n}' },
      { title: 'Static Factor of Safety', purpose: 'Margin against yielding.', equation: 'n = \\frac{S_y}{\\sigma}' }
    ],
    deliverables: ['Load case definition', 'Strength and fatigue calculation sheet', 'Fully dimensioned part drawing', 'Manufacturing and inspection notes'],
    riskCategories: ['Fatigue Failure', 'Manufacturing Variation', 'Material Supply', 'Assembly Error', 'Unanticipated Load'],
    designConsiderations: [
      'Stress concentration at geometric discontinuities',
      'Residual stress from machining, welding or heat treatment',
      'Datum scheme and tolerance accumulation',
      'Galvanic corrosion with mating materials',
      'Inspection of critical features',
      'Fastener preload and joint behaviour'
    ],
    reviewChecklist: review([
      ri('constraints', 'Load cases and factors of safety are stated and approved by the design lead.'),
      ri('calculations', 'Stress and fatigue calculations list stress concentration factors and sources.'),
      ri('evidence', 'Any coupon, prototype or finite element results are filed with their conditions.'),
      ri('drawings', 'The part drawing shows datums, tolerances, material and finish.'),
      ri('decisions', 'The material and process arguments are consistent with each other.')
    ])
  }
];

const AEROSPACE: ProjectTemplate[] = [
  {
    id: 'aero-wing',
    discipline: 'aerospace',
    archetype: 'Aircraft Wing Concept',
    description: 'Conceptual wing design: planform, aerodynamic performance, structural layout, weight and systems integration.',
    version: '1.0.0',
    icon: 'PlaneTakeoff',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Flight Load and Safety Constraints', environment: 'Flight Envelope and Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Flight-Load-and-Safety-Constraints', 'Flight-Envelope'],
      ['Planform-Selection', 'Structural-Layout', 'Supporting-Calculations'],
      ['Wing-Layout-Drawings', 'CAD-and-3D-Models', 'Airfoil-and-Aerodynamic-Data']
    ),
    defaultAssetFolder: `${P3}/Wing-Layout-Drawings`,
    requirementCategories: ['Aerodynamic Performance', 'Wing Geometry', 'Structural Layout', 'Weight Budget', 'Control Surfaces', 'Fuel and Systems Integration', 'Materials', 'Flight Loads'],
    suggestedRequirements: [
      rq('c', 'Aerodynamic Performance', 'Lift capability at required speeds', 'Wing must generate lift for cruise and for the slowest operating speed.', 'M', 'H', 'calc', 'Wing area and lift coefficient provide the required lift at cruise and at the minimum operating speed (enter values).', 'm²'),
      rq('c', 'Wing Geometry', 'Aspect ratio and span within limits', 'Aspect ratio trades induced drag with structure mass and span limits.', 'O', 'M', 'ana', 'Aspect ratio and span are justified against drag, mass and hangar or airport span limits (enter values).', 'm'),
      rq('c', 'Control Surfaces', 'Adequate roll and high-lift control', 'Aileron and flap sizing for handling and takeoff and landing performance.', 'O', 'M', 'ana', 'Control surface sizing is checked against handling quality objectives selected by the team.'),
      rq('k', 'Flight Loads', 'Limit and ultimate load factors', 'Manoeuvre and gust load factors the structure must carry.', 'M', 'H', 'calc', 'Identify the governing airworthiness requirements and record the limit load factors used (enter values).'),
      rq('k', 'Structural Layout', 'Structure carries bending, shear and torsion', 'Spars, ribs and skins must carry wing loads with adequate margin.', 'M', 'H', 'calc', 'Margins of safety are computed for spar caps, webs and skins at the critical sections (enter minimum margin).'),
      rq('k', 'Weight Budget', 'Wing mass within allocation', 'Wing mass must fit the aircraft mass budget.', 'M', 'M', 'ana', 'Estimated wing mass is within the allocation from the aircraft weight budget (enter value).', 'kg'),
      rq('e', 'Flight Loads', 'Operating altitude and speed envelope', 'Flight envelope used for aerodynamic and loads analysis.', 'M', 'M', 'doc', 'Altitude, speed and temperature envelope are documented (enter values).', 'm/s'),
      rq('e', 'Fuel and Systems Integration', 'Space for fuel, wiring and actuators', 'Volume in the wing box for fuel, control linkages and systems.', 'O', 'M', 'ana', 'Wing box volume satisfies fuel and systems installation requirements (enter values).', 'L'),
      rq('e', 'Materials', 'Environmental exposure of structure', 'Moisture, lightning and temperature affecting the materials.', 'P', 'L', 'doc', 'Material protection against moisture, corrosion and lightning is addressed.')
    ],
    suggestedArguments: [
      arg('Wing Planform Selection', 'Planform shapes the lift distribution, stall behaviour and structural efficiency.', 'Select the planform that balances aerodynamic efficiency and structure.', ['Rectangular wing', 'Tapered wing', 'Tapered wing with sweep'], CRIT_AERO),
      arg('Primary Wing Structure', 'The structural concept sets mass, stiffness, fabrication and inspection access.', 'Choose the primary load-carrying structure.', ['Multi-spar wing box', 'Single main spar with auxiliary spar', 'Semi-monocoque ribs and stringers'], CRIT_AERO),
      arg('Wing Material System', 'Material choice affects mass, cost, fatigue and repairability.', 'Select a material system for the wing structure.', ['Aluminium alloy sheet and extrusions', 'Carbon fibre composite', 'Hybrid metal and composite'], CRIT_AERO)
    ],
    calculationTypes: [
      { title: 'Lift Force', purpose: 'Lift generated by the wing.', equation: 'L = \\tfrac{1}{2}\\,\\rho\\,V^2\\,S\\,C_L' },
      { title: 'Aspect Ratio', purpose: 'Relate span and wing area.', equation: 'AR = \\frac{b^2}{S}' },
      { title: 'Wing Loading', purpose: 'Weight carried per unit wing area.', equation: '\\frac{W}{S}' },
      { title: 'Induced Drag Coefficient', purpose: 'Estimate induced drag from lift and aspect ratio.', equation: 'C_{D,i} = \\frac{C_L^2}{\\pi\\, e\\, AR}' }
    ],
    deliverables: ['Wing sizing summary', 'Planform and structural layout drawings', 'Preliminary loads and margin estimate', 'Weight estimate', 'Design review package'],
    riskCategories: ['Aerodynamic Shortfall', 'Structural Margin', 'Weight Growth', 'Manufacturing Feasibility', 'Certification Basis'],
    designConsiderations: [
      'Stall progression and wingtip behaviour',
      'Aeroelastic effects such as flutter and divergence',
      'Fuel slosh and load alleviation',
      'Access for inspection of spars and fasteners',
      'Fatigue of lower skin and attachment fittings',
      'Integration of high-lift devices and wiring routes'
    ],
    reviewChecklist: review([
      ri('constraints', 'The applicable airworthiness basis and load factors are identified, not assumed.'),
      ri('calculations', 'Lift, drag and structural calculations state flight condition, units and sources.'),
      ri('evidence', 'Airfoil data, wind tunnel or simulation results are recorded with their conditions.'),
      ri('drawings', 'Layout drawings show spar and rib positions, control surfaces and fuel volume.'),
      ri('decisions', 'The structure and planform arguments are consistent with the mass budget.')
    ])
  },
  {
    id: 'aero-uav',
    discipline: 'aerospace',
    archetype: 'UAV Design',
    description: 'Uncrewed aerial vehicle design: mission, configuration, propulsion, endurance, flight control and safety.',
    version: '1.0.0',
    icon: 'Drone',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Flight and Safety Constraints', environment: 'Mission and Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Flight-and-Safety-Constraints', 'Mission-and-Environment'],
      ['Configuration-Selection', 'Power-and-Propulsion', 'Supporting-Calculations'],
      ['Airframe-Drawings', '3D-Models', 'Avionics-and-Wiring-Diagrams']
    ),
    defaultAssetFolder: `${P3}/Airframe-Drawings`,
    requirementCategories: ['Mission Profile', 'Payload', 'Endurance and Range', 'Propulsion', 'Flight Control', 'Airframe Structure', 'Communications', 'Operational Safety'],
    suggestedRequirements: [
      rq('c', 'Mission Profile', 'Mission range and endurance', 'Distance, loiter time and altitude needed for the mission.', 'M', 'H', 'calc', 'Energy budget shows the vehicle completes the mission with the reserve chosen by the team (enter values).', 'min'),
      rq('c', 'Payload', 'Payload mass and accommodation', 'Mass, volume and power of the mission payload.', 'M', 'H', 'doc', 'Payload mass, volume, power and field of view needs are specified (enter values).', 'kg'),
      rq('c', 'Flight Control', 'Stable and controllable flight', 'Stability margins and controller tuning that give predictable handling.', 'O', 'M', 'sim', 'Simulation shows stable response across the mass and centre-of-gravity range (enter limits).'),
      rq('k', 'Operational Safety', 'Failsafe and flight termination behaviour', 'Behaviour on loss of link, low battery or sensor failure.', 'M', 'H', 'test', 'Failsafe actions for link loss, low battery and GPS loss are defined and demonstrated in testing.'),
      rq('k', 'Operational Safety', 'Regulatory operating rules', 'Rules for the aircraft class, airspace and operator.', 'M', 'H', 'doc', 'Identify the regulations applicable in the operating jurisdiction and record the compliance approach for the team to confirm.'),
      rq('k', 'Airframe Structure', 'Structural margin at limit manoeuvre', 'The airframe must carry flight loads and landing loads.', 'M', 'M', 'calc', 'Wing, boom and fuselage carry the design load factor with margin (enter values).'),
      rq('e', 'Mission Profile', 'Wind, temperature and altitude', 'Weather and density altitude that affect performance.', 'M', 'M', 'doc', 'Maximum wind, temperature range and operating altitude are specified (enter values).', 'm/s'),
      rq('e', 'Communications', 'Command link and navigation reliability', 'Link range and robustness against interference.', 'O', 'M', 'test', 'Link range test demonstrates reliable command and telemetry at the mission distance (enter value).', 'km'),
      rq('e', 'Propulsion', 'Rain, dust and handling environment', 'Ingress protection and transport conditions.', 'P', 'L', 'doc', 'Weather tolerance and field transport limitations are described.')
    ],
    suggestedArguments: [
      arg('Vehicle Configuration', 'Configuration drives efficiency, deployment method and mission fit.', 'Select the configuration that satisfies the mission endurance and operating site.', ['Fixed-wing aircraft', 'Multirotor', 'VTOL fixed-wing hybrid'], CRIT_AERO),
      arg('Energy Source', 'Energy storage dominates mass and endurance.', 'Choose an energy source for the endurance and operating conditions.', ['Lithium-ion battery', 'Lithium-polymer battery', 'Hybrid gasoline-electric'], CRIT_AERO),
      arg('Flight Controller Platform', 'The autopilot affects development effort, reliability and certification options.', 'Select the flight controller platform.', ['Open-source autopilot', 'Commercial off-the-shelf autopilot', 'Custom flight computer'], CRIT_ELEC)
    ],
    calculationTypes: [
      { title: 'Lift Force', purpose: 'Lift in steady level flight for fixed-wing configurations.', equation: 'L = \\tfrac{1}{2}\\,\\rho\\,V^2\\,S\\,C_L' },
      { title: 'Drag Force', purpose: 'Drag at a given speed.', equation: 'D = \\tfrac{1}{2}\\,\\rho\\,V^2\\,S\\,C_D' },
      { title: 'Battery Endurance', purpose: 'Estimate flight time from usable energy and average power.', equation: 't = \\frac{E_{b}\\,\\eta}{P_{avg}}' },
      { title: 'Thrust-to-Weight Ratio', purpose: 'Check hover or climb capability.', equation: '\\frac{T}{W}' }
    ],
    deliverables: ['Mission and requirements definition', 'Configuration trade study', 'Power and endurance budget', 'Airframe CAD and drawings', 'Flight test plan'],
    riskCategories: ['Loss of Control', 'Battery Safety', 'Communications Loss', 'Regulatory Compliance', 'Payload Integration'],
    designConsiderations: [
      'Centre of gravity range as payload changes',
      'Battery thermal management and storage safety',
      'Vibration isolation for sensors',
      'Electromagnetic compatibility between radios and avionics',
      'Redundancy of critical components',
      'Launch and recovery method'
    ],
    reviewChecklist: review([
      ri('constraints', 'Operating rules for the jurisdiction are identified and failsafe behaviour is defined.'),
      ri('calculations', 'Endurance and performance calculations show inputs, efficiencies and reserves.'),
      ri('evidence', 'Bench, ground and flight test records are linked to the requirements they verify.'),
      ri('drawings', 'Airframe, wiring and payload interface drawings agree with the mass properties.'),
      ri('decisions', 'The configuration argument weighs endurance against operational simplicity.')
    ])
  },
  {
    id: 'aero-propulsion',
    discipline: 'aerospace',
    archetype: 'Propulsion System Concept',
    description: 'Concept-level propulsion study: thrust and delta-v requirements, propulsion type, propellants, feed system and safety.',
    version: '1.0.0',
    icon: 'Rocket',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Performance and Safety Constraints', environment: 'Mission and Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Performance-and-Safety-Constraints', 'Mission-and-Environment'],
      ['Propulsion-Type', 'Propellant-Selection', 'Supporting-Calculations'],
      ['Engine-Layout-Drawings', 'Feed-System-Schematics', '3D-Models']
    ),
    defaultAssetFolder: `${P3}/Engine-Layout-Drawings`,
    requirementCategories: ['Thrust Requirement', 'Delta-v and Impulse', 'Propellant', 'Feed System', 'Thermal Management', 'Structural Mass', 'Test and Safety'],
    suggestedRequirements: [
      rq('c', 'Thrust Requirement', 'Required thrust and burn duration', 'Thrust level and duration derived from the mission or vehicle.', 'M', 'H', 'calc', 'Thrust and burn time are derived from vehicle mass and mission delta-v (enter values).', 'N'),
      rq('c', 'Delta-v and Impulse', 'Total impulse or delta-v capability', 'Propulsion capability required for the mission manoeuvres.', 'M', 'H', 'calc', 'Propellant mass delivers the mission delta-v with a margin chosen by the team (enter values).', 'm/s'),
      rq('c', 'Propellant', 'Specific impulse objective', 'Efficiency of propellant use; higher reduces propellant mass.', 'O', 'M', 'ana', 'Estimated specific impulse is documented with its source and operating assumptions (enter value).', 's'),
      rq('k', 'Test and Safety', 'Propellant handling and test safety', 'Hazard control for toxic, cryogenic, energetic or pressurized materials.', 'M', 'H', 'doc', 'A hazard analysis identifies handling and test hazards and their controls before any hardware test.'),
      rq('k', 'Feed System', 'Pressure and flow control', 'Feed system that delivers propellant at required pressure and flow.', 'M', 'M', 'calc', 'Feed pressure drop and flow rates are calculated and consistent with the chamber pressure target (enter values).', 'kPa'),
      rq('k', 'Structural Mass', 'Propulsion system mass allocation', 'Mass of tanks, plumbing and thrust structure.', 'O', 'M', 'ana', 'Estimated dry mass is within the vehicle mass allocation (enter value).', 'kg'),
      rq('e', 'Thermal Management', 'Thermal loads on chamber and structure', 'Heat flux, cooling approach and thermal soak.', 'M', 'M', 'ana', 'Thermal analysis shows the chamber and surrounding structure stay within material limits (enter values).', '°C'),
      rq('e', 'Delta-v and Impulse', 'Operating environment (vacuum or atmosphere)', 'Ambient pressure influences nozzle design and performance.', 'M', 'M', 'doc', 'Operating pressure range and nozzle expansion basis are recorded.', 'kPa'),
      rq('e', 'Propellant', 'Storage temperature and compatibility', 'Long-term storage and material compatibility of propellants.', 'P', 'L', 'doc', 'Propellant storage conditions and compatible materials are documented.')
    ],
    suggestedArguments: [
      arg('Propulsion Type Selection', 'The mission impulse and complexity limits determine the type of propulsion.', 'Select the propulsion concept to carry forward.', ['Pressure-fed liquid bipropellant', 'Solid rocket motor', 'Electric propulsion'], CRIT_AERO),
      arg('Propellant Combination', 'Propellant choice governs performance, storability, hazards and handling.', 'Choose a propellant combination for the mission.', ['Storable hypergolic bipropellant', 'Cryogenic liquid oxygen with methane', 'Green monopropellant'], CRIT_AERO),
      arg('Tank Pressurization Method', 'Pressurization affects mass, complexity and failure modes.', 'Select the method of delivering propellant to the chamber.', ['Regulated high-pressure gas', 'Blow-down', 'Turbopump feed'])
    ],
    calculationTypes: [
      { title: 'Tsiolkovsky Rocket Equation', purpose: 'Relate delta-v, exhaust velocity and mass ratio.', equation: '\\Delta v = I_{sp}\\, g_0 \\ln\\frac{m_0}{m_f}' },
      { title: 'Thrust Equation', purpose: 'Momentum and pressure thrust.', equation: 'F = \\dot{m}\\,v_e + (p_e - p_a)\\,A_e' },
      { title: 'Specific Impulse', purpose: 'Thrust per unit weight flow of propellant.', equation: 'I_{sp} = \\frac{F}{\\dot{m}\\, g_0}' }
    ],
    deliverables: ['Propulsion requirements derivation', 'Concept trade study', 'Propellant budget', 'Feed system schematic', 'Hazard analysis summary'],
    riskCategories: ['Combustion Instability', 'Propellant Handling Hazards', 'Thermal Failure', 'Leakage', 'Test Facility Availability'],
    designConsiderations: [
      'Mixture ratio and its effect on temperature and impulse',
      'Injector design and combustion stability',
      'Thermal protection and regenerative cooling options',
      'Propellant tank geometry and slosh',
      'Valve response and sequencing',
      'Safety distances and remote operation for testing'
    ],
    reviewChecklist: review([
      ri('constraints', 'Safety constraints include a documented hazard analysis for propellants and testing.'),
      ri('calculations', 'Performance estimates identify assumptions such as ideal expansion and efficiencies.'),
      ri('evidence', 'Reference data for propellant properties and engine performance is cited.'),
      ri('drawings', 'Schematics show valves, relief paths, instrumentation and isolation points.'),
      ri('decisions', 'The propulsion type argument compares total mission mass, not only specific impulse.')
    ])
  },
  {
    id: 'aero-satellite-structure',
    discipline: 'aerospace',
    archetype: 'Satellite Structure',
    description: 'Spacecraft primary structure: launch loads, stiffness, mass budget, thermal environment, materials and interfaces.',
    version: '1.0.0',
    icon: 'Satellite',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Launch Load and Safety Constraints', environment: 'Launch and Space Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Launch-Load-and-Safety-Constraints', 'Launch-and-Space-Environment'],
      ['Structural-Concept', 'Material-Selection', 'Supporting-Calculations'],
      ['Structure-Drawings', 'CAD-Assemblies', 'Interface-Control-Drawings']
    ),
    defaultAssetFolder: `${P3}/Structure-Drawings`,
    requirementCategories: ['Launch Loads', 'Natural Frequency', 'Mass Budget', 'Thermal Environment', 'Material Selection', 'Mounting and Interfaces', 'Deployables', 'Radiation Exposure'],
    suggestedRequirements: [
      rq('c', 'Mass Budget', 'Structure mass allocation', 'Structure mass must fit the spacecraft mass budget.', 'M', 'H', 'ana', 'Estimated structure mass is within the allocation from the system mass budget (enter value).', 'kg'),
      rq('c', 'Mounting and Interfaces', 'Payload and subsystem mounting', 'Mounting provisions, access and alignment for internal units.', 'M', 'M', 'doc', 'Mounting interfaces for every unit are defined in an interface list.'),
      rq('c', 'Deployables', 'Deployable mechanism envelope', 'Volume, release and load paths for panels and antennas.', 'O', 'M', 'ana', 'Stowed and deployed envelopes are defined and checked against the launch fairing (enter values).'),
      rq('k', 'Launch Loads', 'Quasi-static and random vibration loads', 'Structure must survive the launch environment given in the launcher user guide.', 'M', 'H', 'ana', 'Structure survives the load factors and vibration spectra from the launch provider user guide (record document and revision).'),
      rq('k', 'Natural Frequency', 'Minimum first natural frequency', 'Avoid coupling with launcher modes by providing sufficient stiffness.', 'M', 'H', 'sim', 'First fundamental frequencies exceed the launch provider requirement in both axes (enter values).', 'Hz'),
      rq('k', 'Mounting and Interfaces', 'Separation system interface compatibility', 'Interface to the launch adapter must match geometry and stiffness.', 'M', 'M', 'doc', 'Interface geometry and bolt pattern are consistent with the launcher interface document.'),
      rq('e', 'Thermal Environment', 'Orbital temperature extremes and cycling', 'Hot and cold cases plus eclipse cycling.', 'M', 'M', 'ana', 'Thermal analysis gives structure temperatures and gradients for hot and cold cases (enter values).', '°C'),
      rq('e', 'Radiation Exposure', 'Space environment on materials', 'Outgassing, atomic oxygen and radiation effects.', 'O', 'M', 'doc', 'Materials are screened for outgassing and radiation suitability against the mission orbit.'),
      rq('e', 'Material Selection', 'Handling and cleanliness', 'Contamination control during integration and testing.', 'P', 'L', 'doc', 'Cleanliness and handling requirements are recorded.')
    ],
    suggestedArguments: [
      arg('Primary Structure Concept', 'The structure must be stiff, light and accessible for integration.', 'Select the structure concept for the spacecraft class.', ['Honeycomb sandwich panel box', 'Central cylinder with shear panels', 'Truss frame with panels'], CRIT_AERO),
      arg('Structural Material', 'Materials define specific stiffness, thermal behaviour and manufacturing route.', 'Choose the material for primary structure.', ['Aluminium alloy with aluminium honeycomb', 'Carbon fibre composite sandwich', 'Magnesium alloy frame'], CRIT_AERO),
      arg('Panel Fastening Approach', 'Joints carry loads between panels and affect assembly and mass.', 'Select the joint approach for panel-to-frame attachment.', ['Bolted brackets', 'Insert and bolted joints', 'Bonded joints'])
    ],
    calculationTypes: [
      { title: 'Natural Frequency of a Single Degree of Freedom System', purpose: 'First-order stiffness check before finite element modelling.', equation: 'f_n = \\frac{1}{2\\pi}\\sqrt{\\frac{k}{m}}' },
      { title: 'Quasi-static Inertial Load', purpose: 'Load from a launch acceleration factor.', equation: 'F = m\\, n\\, g_0' },
      { title: 'Thermal Expansion', purpose: 'Differential growth between parts at different temperatures.', equation: '\\delta = \\alpha\\, L\\, \\Delta T' },
      { title: 'Margin of Safety', purpose: 'Strength margin against the applied stress including factors.', equation: 'MS = \\frac{\\sigma_{allow}}{\\sigma_{applied}} - 1' }
    ],
    deliverables: ['Load and environment definition', 'Structure concept trade study', 'Mass and stiffness estimate', 'Structure drawings and ICD', 'Test plan summary'],
    riskCategories: ['Launch Load Failure', 'Mass Growth', 'Thermal Distortion', 'Integration Interfaces', 'Material Supply and Qualification'],
    designConsiderations: [
      'Stiffness margin to avoid coupling with launcher modes',
      'Load path from payload units into primary structure',
      'Insert pull-out and bonded joint failure modes',
      'Thermal distortion affecting optical or antenna alignment',
      'Access for integration and harness routing',
      'Deployment mechanism shock loads'
    ],
    reviewChecklist: review([
      ri('constraints', 'Launch loads and test levels are taken from a named, current launch provider document.'),
      ri('calculations', 'Frequency, stress and thermal calculations use consistent mass properties.'),
      ri('evidence', 'Finite element verification and any test data are linked to the stiffness and strength requirements.'),
      ri('drawings', 'Structure drawings and interface control drawings match the CAD assembly.'),
      ri('decisions', 'The structure concept argument shows mass, stiffness and manufacturing trade-offs.')
    ])
  }
];

const ELECTRICAL: ProjectTemplate[] = [
  {
    id: 'elec-power-distribution',
    discipline: 'electrical',
    archetype: 'Power Distribution System',
    description: 'Facility power distribution: load demand, topology, cable and protection coordination, grounding and power quality.',
    version: '1.0.0',
    icon: 'Cable',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Electrical and Safety Constraints', environment: 'Site and Utility Data' },
    folders: folderSet(
      ['Design-Criteria', 'Electrical-and-Safety-Constraints', 'Site-and-Utility-Data'],
      ['Distribution-Topology', 'Protection-Coordination', 'Supporting-Calculations'],
      ['Single-Line-Diagrams', 'Panel-and-Equipment-Layouts', 'Cable-and-Conduit-Schedules']
    ),
    defaultAssetFolder: `${P3}/Single-Line-Diagrams`,
    requirementCategories: ['Load Demand', 'Voltage Level', 'Protection Coordination', 'Cable Sizing', 'Grounding', 'Power Quality', 'Redundancy', 'Metering'],
    suggestedRequirements: [
      rq('c', 'Load Demand', 'Connected and demand load', 'Load schedule with demand factors and future growth allowance.', 'M', 'H', 'calc', 'A load schedule lists connected and demand loads for every panel with the growth allowance chosen by the team (enter values).', 'kW'),
      rq('c', 'Voltage Level', 'Distribution voltage and phasing', 'Supply and utilization voltages for equipment.', 'M', 'M', 'doc', 'Service and utilization voltages are confirmed with the utility and equipment suppliers (enter values).', 'V'),
      rq('c', 'Redundancy', 'Continuity of supply for critical loads', 'Backup supply or redundancy for essential services.', 'O', 'M', 'ana', 'Critical loads are identified and a supply continuity approach is documented.'),
      rq('k', 'Protection Coordination', 'Protective devices coordinated', 'Devices must clear faults selectively and within equipment ratings.', 'M', 'H', 'ana', 'A coordination study shows upstream devices do not trip before downstream ones for faults (record study basis).'),
      rq('k', 'Cable Sizing', 'Cable ampacity and voltage drop', 'Conductors carry load current within thermal and voltage-drop limits.', 'M', 'H', 'calc', 'Each feeder meets ampacity requirements of the applicable electrical code and voltage drop target (enter limit).', '%'),
      rq('k', 'Grounding', 'Grounding and bonding for safety', 'Grounding system that limits touch voltage and carries fault current.', 'M', 'H', 'doc', 'Identify the electrical safety code governing grounding and record the grounding design basis.'),
      rq('e', 'Voltage Level', 'Available utility fault level', 'Short-circuit contribution at the service entrance.', 'M', 'M', 'doc', 'Available fault current at the service is obtained from the utility (enter value).', 'kA'),
      rq('e', 'Power Quality', 'Harmonics and voltage variation', 'Non-linear loads and sensitive equipment.', 'O', 'L', 'ana', 'Harmonic sources are listed and a mitigation approach is chosen if needed.'),
      rq('e', 'Metering', 'Metering and monitoring', 'Sub-metering for energy management.', 'P', 'L', 'doc', 'Metering points are chosen to support energy reporting needs.')
    ],
    suggestedArguments: [
      arg('Distribution Topology', 'The topology sets reliability, cost and maintainability of power distribution.', 'Select a topology that satisfies availability needs of the facility.', ['Radial distribution', 'Ring (loop) distribution', 'Primary-selective distribution'], CRIT_ELEC),
      arg('Main Protective Device Type', 'Device type affects interrupting rating, coordination flexibility and maintenance.', 'Select the protective device type for main and feeder protection.', ['Moulded-case breakers with electronic trip', 'Fused switches', 'Air circuit breakers']),
      arg('Standby Power Source', 'Standby supply keeps critical loads running during utility outages.', 'Select standby generation or storage.', ['Diesel generator set', 'Battery energy storage with inverter', 'Natural gas generator'], CRIT_ENERGY)
    ],
    calculationTypes: [
      { title: 'Three-Phase Real Power', purpose: 'Real power from line voltage, current and power factor.', equation: 'P = \\sqrt{3}\\,V_{LL}\\,I\\,\\cos\\varphi' },
      { title: 'Three-Phase Voltage Drop', purpose: 'Approximate feeder voltage drop.', equation: '\\Delta V = \\sqrt{3}\\, I\\,(R\\cos\\varphi + X\\sin\\varphi)' },
      { title: 'Symmetrical Fault Current', purpose: 'Bolted three-phase fault current at a point with source impedance.', equation: 'I_{sc} = \\frac{V_{LL}}{\\sqrt{3}\\,Z}' },
      { title: 'Conductor Resistive Loss', purpose: 'Joule heating in a conductor.', equation: 'P = I^2 R' }
    ],
    deliverables: ['Load schedule', 'Single-line diagram', 'Short-circuit and coordination study summary', 'Cable and conduit schedule', 'Equipment layout drawings'],
    riskCategories: ['Arc Flash and Shock', 'Overload and Fault Damage', 'Supply Interruption', 'Utility Coordination', 'Future Expansion'],
    designConsiderations: [
      'Selective coordination of protection',
      'Arc flash labelling and work procedures',
      'Derating for ambient temperature and grouped cables',
      'Spare capacity and space for future breakers',
      'Harmonics and neutral conductor loading',
      'Equipment clearances for safe operation and maintenance'
    ],
    reviewChecklist: review([
      ri('constraints', 'The electrical code and utility requirements for the jurisdiction are identified.'),
      ri('calculations', 'Load, voltage drop and fault calculations are repeatable and list their inputs.'),
      ri('evidence', 'Utility data and any coordination study output are recorded as evidence.'),
      ri('drawings', 'Single-line diagram and layouts agree with the cable and device schedules.'),
      ri('decisions', 'The topology argument documents the availability requirement it is based on.')
    ])
  },
  {
    id: 'elec-embedded-control',
    discipline: 'electrical',
    archetype: 'Embedded Control System',
    description: 'Microcontroller-based control design: processing, I/O, real-time timing, firmware architecture, power and fault handling.',
    version: '1.0.0',
    icon: 'Cpu',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Timing and Safety Constraints', environment: 'Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Timing-and-Safety-Constraints', 'Operating-Environment'],
      ['Platform-Selection', 'Firmware-Architecture', 'Supporting-Calculations'],
      ['System-Block-Diagrams', 'Schematics', 'Firmware-Design-Diagrams']
    ),
    defaultAssetFolder: `${P3}/System-Block-Diagrams`,
    requirementCategories: ['Processing Requirements', 'Peripherals and I/O', 'Real-Time Timing', 'Power Budget', 'Firmware Architecture', 'Communication Interfaces', 'Fault Handling', 'Test and Debug'],
    suggestedRequirements: [
      rq('c', 'Peripherals and I/O', 'Required inputs and outputs', 'Analogue, digital and communication channels with signal levels.', 'M', 'H', 'doc', 'An I/O list defines every channel, signal type and voltage level (enter list).'),
      rq('c', 'Processing Requirements', 'Processing headroom', 'CPU and memory capacity for the control tasks with margin.', 'O', 'M', 'ana', 'Worst-case CPU load and memory use are estimated with a margin chosen by the team (enter targets).', '%'),
      rq('c', 'Communication Interfaces', 'Communication protocol support', 'Buses and protocols for host and peer devices.', 'M', 'M', 'doc', 'Required bus types, speeds and protocol layers are defined for each interface (enter values).', 'kbit/s'),
      rq('k', 'Real-Time Timing', 'Control loop period and jitter', 'Control loops must execute deterministically.', 'M', 'H', 'test', 'Measured loop period and jitter on target hardware are within the limits for control stability (enter values).', 'ms'),
      rq('k', 'Fault Handling', 'Safe state on fault or watchdog reset', 'Outputs must go to a defined safe state during faults.', 'M', 'H', 'test', 'Outputs enter their defined safe state on watchdog reset, brown-out and sensor failure, demonstrated by test.'),
      rq('k', 'Power Budget', 'Supply current within regulator capacity', 'Maximum current draw across operating modes.', 'M', 'M', 'calc', 'Worst-case current draw is below the regulator and supply capability with margin (enter values).', 'mA'),
      rq('e', 'Power Budget', 'Supply voltage range and battery life', 'Input voltage range and expected energy source behaviour.', 'O', 'M', 'calc', 'Operation is specified over the full input voltage range, and battery life is estimated if battery powered (enter values).', 'V'),
      rq('e', 'Test and Debug', 'Operating temperature and electromagnetic environment', 'Temperature and EMI conditions affecting reliability.', 'M', 'M', 'doc', 'Operating temperature range and EMC environment are stated, and components are chosen accordingly (enter values).', '°C'),
      rq('e', 'Firmware Architecture', 'Firmware update and diagnostics', 'Way to update, log and debug in the field.', 'P', 'L', 'doc', 'Update mechanism and diagnostic interface are defined.')
    ],
    suggestedArguments: [
      arg('Microcontroller Platform', 'The platform fixes performance, peripherals, toolchain and supply risk.', 'Select the controller that meets I/O and timing needs with acceptable availability.', ['ARM Cortex-M microcontroller', 'RISC-V microcontroller', 'ESP32-class wireless microcontroller'], CRIT_ELEC),
      arg('Firmware Architecture', 'The firmware structure determines determinism and maintainability.', 'Choose the execution model for the control tasks.', ['Bare-metal super-loop with interrupts', 'Real-time operating system with tasks', 'Time-triggered cooperative scheduler'], crit([['Performance', 30], ['Maintainability', 25], ['Feasibility', 20], ['Safety or Strength', 25]])),
      arg('Field Communication Bus', 'The bus choice influences noise immunity, wiring and available tools.', 'Select the main communication interface.', ['CAN bus', 'RS-485 with Modbus RTU', 'Ethernet'])
    ],
    calculationTypes: [
      { title: 'Nyquist Sampling Condition', purpose: 'Minimum sample rate for a signal of bandwidth f_max.', equation: 'f_s \\geq 2\\,f_{max}' },
      { title: 'ADC Resolution (One LSB)', purpose: 'Voltage step of an n-bit converter.', equation: 'LSB = \\frac{V_{ref}}{2^{n}}' },
      { title: 'PWM Duty Cycle', purpose: 'Ratio of on-time to period.', equation: 'D = \\frac{t_{on}}{T}' },
      { title: 'Battery Runtime Estimate', purpose: 'Run time from capacity and average current.', equation: 't = \\frac{C}{I_{avg}}' }
    ],
    deliverables: ['I/O and requirements specification', 'Hardware block diagram and schematics', 'Firmware architecture description', 'Timing and power budget', 'Test plan and results log'],
    riskCategories: ['Timing Violations', 'Firmware Defects', 'Component Obsolescence', 'EMC Failures', 'Field Update Failure'],
    designConsiderations: [
      'Watchdog and brown-out strategy',
      'Interrupt priorities and shared data protection',
      'Debounce, filtering and sensor calibration',
      'Memory margin for future features',
      'Bootloader and secure update',
      'Observability through logging and test points'
    ],
    reviewChecklist: review([
      ri('constraints', 'Safe-state behaviour and timing requirements are defined and testable.'),
      ri('calculations', 'Power, timing and resolution calculations include worst-case operating modes.'),
      ri('evidence', 'Test results on target hardware are recorded and linked to requirements.'),
      ri('drawings', 'Block diagram, schematics and firmware diagrams are consistent with the I/O list.'),
      ri('decisions', 'The platform argument considers toolchain, long-term supply and team experience.')
    ])
  },
  {
    id: 'elec-pcb',
    discipline: 'electrical',
    archetype: 'PCB Design',
    description: 'Printed circuit board design: supply, current, components, thermal behaviour, signal integrity, isolation and test.',
    version: '1.0.0',
    icon: 'CircuitBoard',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Electrical and Safety Constraints', environment: 'Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Electrical-and-Safety-Constraints', 'Operating-Environment'],
      ['Component-Selection', 'Layer-Stack-up', 'Supporting-Calculations'],
      ['Schematics', 'PCB-Layout', 'Enclosure-3D-Models']
    ),
    defaultAssetFolder: `${P3}/Schematics`,
    requirementCategories: ['Supply Voltage', 'Current Requirements', 'Component Selection', 'Thermal Considerations', 'Signal Integrity', 'Electrical Isolation', 'Testing and Verification'],
    suggestedRequirements: [
      rq('c', 'Supply Voltage', 'Input supply range and rails', 'Supply input voltage range and the regulated rails required.', 'M', 'H', 'doc', 'Input voltage range and every regulated rail with tolerance are listed (enter values).', 'V'),
      rq('c', 'Current Requirements', 'Rail current budget', 'Maximum and typical currents drawn on each rail.', 'M', 'H', 'calc', 'Per-rail current budget is calculated from component datasheets with a margin chosen by the team (enter values).', 'A'),
      rq('c', 'Component Selection', 'Available and second-sourceable parts', 'Parts with reliable supply and acceptable lifecycle status.', 'O', 'M', 'doc', 'Critical components have a stated lifecycle status and an alternate source where practical.'),
      rq('k', 'Electrical Isolation', 'Isolation and creepage for mains or high voltage', 'Spacing between hazardous and accessible conductors.', 'M', 'H', 'insp', 'Identify the applicable product safety standard and verify spacing and isolation against its requirements.'),
      rq('k', 'Signal Integrity', 'Controlled impedance and return paths', 'High-speed signals need defined impedance and continuous return paths.', 'O', 'M', 'sim', 'Impedance targets and return path strategy are recorded for high-speed interfaces (enter values).', 'Ω'),
      rq('k', 'Thermal Considerations', 'Component junction temperatures', 'Dissipation and temperature rise of regulators and power devices.', 'M', 'M', 'calc', 'Estimated junction temperature of each power component is below its datasheet limit at maximum ambient (enter value).', '°C'),
      rq('e', 'Testing and Verification', 'Test access and programming', 'Test points, programming headers and boundary scan.', 'M', 'M', 'insp', 'Test points are provided for each supply rail and key signal, and the programming interface is accessible.'),
      rq('e', 'Thermal Considerations', 'Ambient temperature and enclosure', 'Ambient range and enclosure airflow.', 'M', 'M', 'doc', 'Ambient temperature range and enclosure conditions are specified (enter values).', '°C'),
      rq('e', 'Testing and Verification', 'Manufacturing and assembly capability', 'Fabricator capabilities such as minimum trace, via and layer count.', 'P', 'L', 'doc', 'Board design rules are checked against the chosen fabricator capabilities.')
    ],
    suggestedArguments: [
      arg('Layer Stack-up Selection', 'Layer count affects routing density, signal integrity, EMI and fabrication cost.', 'Select the stack-up for the density and noise requirements.', ['2-layer board', '4-layer board'], CRIT_ELEC),
      arg('Power Regulation Approach', 'The regulator type sets efficiency, noise and thermal behaviour.', 'Select the regulator topology for each rail.', ['Linear low-dropout regulator', 'Switching buck converter', 'Buck converter followed by LDO'], crit([['Energy efficiency', 25], ['Performance', 25], ['Cost', 20], ['Manufacturing complexity', 15], ['Safety or Strength', 15]])),
      arg('Component Package Strategy', 'Package choice affects assembly yield, rework and board size.', 'Select the dominant package family.', ['Through-hole components', 'Standard surface-mount packages', 'Fine-pitch and BGA packages'])
    ],
    calculationTypes: [
      { title: 'Ohm\'s Law', purpose: 'Relate voltage, current and resistance.', equation: 'V = I\\,R' },
      { title: 'Resistive Power Dissipation', purpose: 'Power lost in a resistor or trace.', equation: 'P = I^2 R' },
      { title: 'Voltage Divider', purpose: 'Output of a two-resistor divider.', equation: 'V_{out} = V_{in}\\,\\frac{R_2}{R_1 + R_2}' },
      { title: 'Junction Temperature Estimate', purpose: 'Junction temperature from ambient, power and thermal resistance.', equation: 'T_j = T_a + P\\,\\theta_{JA}' }
    ],
    deliverables: ['Requirements and power budget', 'Schematic set', 'PCB layout and fabrication outputs', 'Bill of materials', 'Bring-up and test report'],
    riskCategories: ['Electrical Safety', 'Signal Integrity and EMC', 'Component Availability', 'Thermal Failure', 'Manufacturing Yield'],
    designConsiderations: [
      'Ground and power plane strategy',
      'Decoupling capacitor placement',
      'Trace width for current and temperature rise',
      'Creepage and clearance at connectors and isolation barriers',
      'Design for test and rework',
      'ESD and surge protection at external interfaces'
    ],
    reviewChecklist: review([
      ri('constraints', 'Safety and isolation constraints reference the applicable product standard.'),
      ri('calculations', 'Current, power and thermal calculations are shown for every rail and power device.'),
      ri('evidence', 'Simulation, bring-up and measurement results are recorded as evidence.'),
      ri('drawings', 'Schematics, layout and bill of materials are consistent in reference designators and values.'),
      ri('decisions', 'The stack-up argument documents routing density and EMI considerations.')
    ])
  },
  {
    id: 'elec-renewable',
    discipline: 'electrical',
    archetype: 'Renewable Energy System',
    description: 'Solar, wind or hybrid generation with storage: resource, capacity, conversion, interconnection, losses and monitoring.',
    version: '1.0.0',
    icon: 'Sun',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Electrical and Safety Constraints', environment: 'Resource and Site Data' },
    folders: folderSet(
      ['Design-Criteria', 'Electrical-and-Safety-Constraints', 'Resource-and-Site-Data'],
      ['Generation-Technology', 'Energy-Storage', 'Supporting-Calculations'],
      ['Single-Line-Diagrams', 'Site-and-Array-Layouts', 'Equipment-Schematics']
    ),
    defaultAssetFolder: `${P3}/Single-Line-Diagrams`,
    requirementCategories: ['Resource Assessment', 'Generation Capacity', 'Energy Storage', 'Power Conversion', 'Grid Interconnection', 'System Losses', 'Protection', 'Monitoring'],
    suggestedRequirements: [
      rq('c', 'Generation Capacity', 'Annual energy target', 'Energy the system must deliver relative to site consumption.', 'M', 'H', 'calc', 'Estimated annual generation meets the energy target derived from load data (enter value).', 'kWh/year'),
      rq('c', 'Energy Storage', 'Storage capacity and autonomy', 'Usable storage to cover critical loads or time shifting.', 'O', 'M', 'calc', 'Usable storage capacity covers the selected autonomy period at the critical load (enter values).', 'kWh'),
      rq('c', 'Monitoring', 'Performance monitoring', 'Data to compare expected and actual production.', 'P', 'L', 'doc', 'Monitoring points and data logging approach are defined.'),
      rq('k', 'Grid Interconnection', 'Utility interconnection requirements', 'Technical requirements to connect to the grid.', 'M', 'H', 'doc', 'Obtain the utility interconnection requirements and record how the design addresses each of them.'),
      rq('k', 'Protection', 'Overcurrent, anti-islanding and rapid shutdown', 'Protection that makes the system safe for people and the grid.', 'M', 'H', 'doc', 'Identify the electrical code protection requirements and show devices on the single-line diagram.'),
      rq('k', 'Power Conversion', 'Inverter and DC voltage window', 'String voltage must stay within inverter limits across temperature.', 'M', 'M', 'calc', 'Maximum and minimum string voltage at site temperature extremes are within the inverter operating window (enter values).', 'V'),
      rq('e', 'Resource Assessment', 'Solar or wind resource data', 'Irradiance or wind speed data with source and uncertainty.', 'M', 'H', 'doc', 'Resource dataset and its source are recorded with uncertainty (enter values).', 'kWh/m²'),
      rq('e', 'System Losses', 'Shading, soiling, temperature and losses', 'Derating factors between nominal and delivered energy.', 'O', 'M', 'ana', 'A loss budget lists shading, temperature, soiling and wiring losses with sources (enter values).', '%'),
      rq('e', 'Resource Assessment', 'Site constraints and structural mounting', 'Roof or ground conditions, snow, wind and access.', 'P', 'L', 'doc', 'Mounting structure loads and site access are assessed.')
    ],
    suggestedArguments: [
      arg('Generation Technology', 'The local resource and site constraints determine the best generation source.', 'Select the generation technology for the site.', ['Solar photovoltaic', 'Small wind turbine', 'Hybrid solar and wind'], CRIT_ENERGY),
      arg('Energy Storage Chemistry', 'Storage chemistry affects life, safety, size and cost.', 'Select the storage technology if storage is required.', ['Lithium iron phosphate battery', 'Lead-acid battery', 'No storage (grid-tied)'], CRIT_ENERGY),
      arg('Inverter Architecture', 'Inverter topology affects shading tolerance, monitoring and reliability.', 'Select the power conversion architecture.', ['String inverter', 'Microinverters', 'Central inverter'])
    ],
    calculationTypes: [
      { title: 'Annual PV Energy Estimate', purpose: 'Energy from array area, efficiency, irradiation and performance ratio.', equation: 'E = A\\, r\\, H\\, PR' },
      { title: 'Wind Power Available to a Turbine', purpose: 'Power extracted from the wind stream.', equation: 'P = \\tfrac{1}{2}\\,\\rho\\, A\\, v^3\\, C_p' },
      { title: 'Battery Bank Sizing', purpose: 'Nominal capacity from energy, voltage and depth of discharge.', equation: 'C = \\frac{E}{V\\, DoD}' },
      { title: 'Capacity Factor', purpose: 'Compare actual energy with continuous nameplate output.', equation: 'CF = \\frac{E_{annual}}{P_{rated}\\times 8760}' }
    ],
    deliverables: ['Resource and load assessment', 'Generation and storage sizing report', 'Single-line diagram', 'Site and array layout', 'Interconnection application support notes'],
    riskCategories: ['Resource Variability', 'Interconnection Delay', 'Battery Safety', 'Equipment Reliability', 'Regulatory and Incentive Change'],
    designConsiderations: [
      'Temperature effect on PV voltage and output',
      'Inverter clipping and DC-to-AC ratio',
      'Battery thermal management and fire safety',
      'Cable losses and voltage drop on DC and AC runs',
      'Snow and wind loading on mounting structures',
      'Degradation over the system life'
    ],
    reviewChecklist: review([
      ri('constraints', 'Utility and electrical code requirements are identified and mapped to design decisions.'),
      ri('calculations', 'Energy estimates state resource data, losses and assumptions used.'),
      ri('evidence', 'Resource data, equipment datasheets and interconnection correspondence are filed.'),
      ri('drawings', 'Single-line diagram and layouts agree on strings, protection and disconnects.'),
      ri('decisions', 'The technology argument uses lifecycle cost and energy yield, not nameplate alone.')
    ])
  },
  {
    id: 'elec-motor-control',
    discipline: 'electrical',
    archetype: 'Motor Control System',
    description: 'Motor drive and control design: motor type, torque-speed demand, power stage, control algorithm, feedback and protection.',
    version: '1.0.0',
    icon: 'Activity',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Electrical and Safety Constraints', environment: 'Duty and Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Electrical-and-Safety-Constraints', 'Duty-and-Environment'],
      ['Motor-Selection', 'Control-Strategy', 'Supporting-Calculations'],
      ['Power-Stage-Schematics', 'Control-Block-Diagrams', 'Drive-Enclosure-3D-Models']
    ),
    defaultAssetFolder: `${P3}/Power-Stage-Schematics`,
    requirementCategories: ['Motor Type', 'Torque-Speed Requirement', 'Drive Topology', 'Control Algorithm', 'Feedback Sensing', 'Protection', 'Thermal Management', 'Electromagnetic Compatibility'],
    suggestedRequirements: [
      rq('c', 'Torque-Speed Requirement', 'Continuous and peak torque at speed', 'Load torque-speed profile including acceleration.', 'M', 'H', 'calc', 'Motor and drive provide the continuous and peak torque over the required speed range with margin (enter values).', 'N·m'),
      rq('c', 'Control Algorithm', 'Speed or position regulation accuracy', 'Steady-state and dynamic performance of the control loop.', 'O', 'M', 'sim', 'Closed-loop response meets the settling time and steady-state error targets (enter values).', 'rpm'),
      rq('c', 'Motor Type', 'Efficiency and acoustic performance', 'Efficiency and noise that matter for the application.', 'P', 'L', 'test', 'Measured efficiency and audible noise are recorded at the main operating points.'),
      rq('k', 'Protection', 'Overcurrent, overvoltage and stall protection', 'Protection of motor, power stage and supply.', 'M', 'H', 'test', 'Overcurrent, overvoltage and stall conditions trip the drive safely in testing.'),
      rq('k', 'Drive Topology', 'Bus voltage and current ratings', 'Power devices and DC bus rated for the motor and regenerative energy.', 'M', 'H', 'calc', 'Drive current and bus voltage ratings exceed the maximum motor demand, including regeneration (enter values).', 'A'),
      rq('k', 'Protection', 'Safe torque off', 'A hardware path to remove torque independently of software.', 'M', 'M', 'doc', 'Identify applicable functional safety requirements and document how torque removal is achieved.'),
      rq('e', 'Thermal Management', 'Ambient temperature and cooling', 'Thermal limits for motor windings and power electronics.', 'M', 'M', 'ana', 'Estimated winding and heat sink temperatures are within limits at the maximum ambient (enter value).', '°C'),
      rq('e', 'Electromagnetic Compatibility', 'Switching noise and EMC', 'Conducted and radiated emissions from the drive.', 'O', 'M', 'test', 'Emissions are screened against the applicable EMC standard and filtering is applied if required.'),
      rq('e', 'Feedback Sensing', 'Vibration and contamination', 'Environmental stress on sensors and connectors.', 'P', 'L', 'doc', 'Sensor and connector ratings are selected for vibration and contamination at the site.')
    ],
    suggestedArguments: [
      arg('Motor Type Selection', 'Motor technology determines efficiency, controllability, cost and maintenance.', 'Select the motor for the torque-speed profile.', ['Brushless DC motor', 'Permanent magnet synchronous motor', 'Induction motor with variable frequency drive'], CRIT_ELEC),
      arg('Control Strategy Selection', 'The algorithm affects dynamic performance, computation and tuning effort.', 'Choose a control scheme suited to performance and processor limits.', ['Six-step trapezoidal commutation', 'Field-oriented control', 'Scalar V/f control'], CRIT_ELEC),
      arg('Position Feedback Method', 'Feedback determines accuracy, cost and robustness.', 'Choose the rotor position sensing method.', ['Hall-effect sensors', 'Incremental encoder', 'Sensorless back-EMF estimation'])
    ],
    calculationTypes: [
      { title: 'Mechanical Power', purpose: 'Power delivered at the shaft.', equation: 'P = \\tau\\,\\omega' },
      { title: 'Torque Constant Relation', purpose: 'Torque from current in a DC or BLDC machine.', equation: '\\tau = k_t\\, I' },
      { title: 'Back-EMF', purpose: 'Voltage induced by rotation.', equation: 'E = k_e\\,\\omega' },
      { title: 'DC Motor Voltage Equation', purpose: 'Supply voltage required for a given current and speed.', equation: 'V = I R + k_e\\,\\omega' }
    ],
    deliverables: ['Duty cycle and torque-speed analysis', 'Power stage schematic', 'Control block diagram and tuning plan', 'Thermal estimate', 'Test report'],
    riskCategories: ['Overheating', 'Control Instability', 'Power Device Failure', 'EMC Non-compliance', 'Functional Safety'],
    designConsiderations: [
      'Regenerative energy and DC bus overvoltage',
      'Dead time and shoot-through protection',
      'Current sensing accuracy and offsets',
      'Startup and low-speed behaviour',
      'Cable length and motor insulation stress',
      'Brake resistor or braking strategy'
    ],
    reviewChecklist: review([
      ri('constraints', 'Protection and functional safety requirements are identified and testable.'),
      ri('calculations', 'Torque, speed, current and thermal calculations cover peak and continuous duty.'),
      ri('evidence', 'Dynamometer, thermal and fault test results are recorded as evidence.'),
      ri('drawings', 'Power stage schematic and control diagrams agree on signals and ratings.'),
      ri('decisions', 'The control strategy argument compares performance with processor and tuning effort.')
    ])
  }
];

const CUSTOM: ProjectTemplate[] = [
  {
    id: 'custom-generic',
    discipline: 'custom',
    archetype: 'Generic Engineering Design',
    description: 'A discipline-neutral workflow for any engineering design: define the need, evaluate options, verify and document.',
    version: '1.0.0',
    icon: 'Shapes',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Constraints and Safety', environment: 'Operating Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Constraints-and-Safety', 'Operating-Environment'],
      ['Concept-Alternatives', 'Supporting-Calculations'],
      ['Drawings', '3D-Models', 'Diagrams-and-Schematics']
    ),
    defaultAssetFolder: `${P3}/Drawings`,
    requirementCategories: ['Functional Performance', 'Safety', 'Interfaces', 'Cost and Schedule', 'Manufacturability', 'Operating Environment', 'Maintainability', 'Verification'],
    suggestedRequirements: [
      rq('c', 'Functional Performance', 'Primary function and performance target', 'What the design must do and how well, in measurable terms.', 'M', 'H', 'doc', 'The primary function is stated with a measurable performance target agreed with the stakeholder (enter target value).'),
      rq('c', 'Cost and Schedule', 'Budget and schedule envelope', 'Cost and delivery limits for the design effort or product.', 'O', 'M', 'doc', 'Budget and schedule limits are recorded with an owner (enter values).'),
      rq('c', 'Interfaces', 'Interfaces with other systems', 'Mechanical, electrical, data or human interfaces to be respected.', 'M', 'M', 'doc', 'Every interface is listed with its owner and applicable specification.'),
      rq('k', 'Safety', 'Hazards identified and controlled', 'Foreseeable hazards to people, property or the environment.', 'M', 'H', 'doc', 'A hazard list is prepared and each hazard has a control or a documented acceptance.'),
      rq('k', 'Maintainability', 'Serviceability and repair', 'How the design will be inspected, maintained and repaired.', 'O', 'L', 'insp', 'Service tasks and access needs are described.'),
      rq('k', 'Verification', 'Requirements are verifiable', 'Each requirement should have a way to check it.', 'M', 'M', 'doc', 'Every mandatory requirement has a verification method and an acceptance criterion.'),
      rq('e', 'Operating Environment', 'Conditions of use', 'Temperature, humidity, vibration, contamination and user population.', 'M', 'M', 'doc', 'Environmental conditions of use are specified (enter ranges).'),
      rq('e', 'Manufacturability', 'Available manufacturing or construction methods', 'Processes, skills and materials available to realize the design.', 'P', 'L', 'doc', 'Manufacturing or construction approach is noted and constraints are recorded.'),
      rq('e', 'Operating Environment', 'Regulatory and standards context', 'Laws, codes and standards that may apply.', 'M', 'M', 'doc', 'Identify the regulations and standards applicable to the design and record how the team will confirm them.')
    ],
    suggestedArguments: [
      arg('Concept Selection', 'Several concepts could satisfy the primary function with different trade-offs.', 'Select the concept to develop further.', ['Concept A', 'Concept B', 'Concept C']),
      arg('Material or Technology Selection', 'The main material or enabling technology influences performance, cost and risk.', 'Select the material or technology for the critical function.', ['Baseline approach', 'Alternative approach'], CRIT_MECH)
    ],
    calculationTypes: [
      { title: 'Weighted Decision Score', purpose: 'Combine criterion weights and scores for an alternative.', equation: 'S_j = \\sum_{i} w_i\\, s_{ij}' },
      { title: 'Design Margin Ratio', purpose: 'Compare capacity with demand for any limiting parameter.', equation: 'n = \\frac{R}{S}' },
      { title: 'Stress from Force and Area', purpose: 'A general strength check.', equation: '\\sigma = \\frac{F}{A}' }
    ],
    deliverables: ['Scope and requirements record', 'Concept comparison', 'Supporting calculations', 'Drawings and models', 'Design review package'],
    riskCategories: ['Technical Feasibility', 'Safety', 'Schedule', 'Cost', 'Requirements Change'],
    designConsiderations: [
      'Requirements that conflict with each other',
      'Assumptions that need validation',
      'Interfaces owned by other teams',
      'Evidence needed before decisions are accepted',
      'Lifecycle cost beyond first cost'
    ],
    reviewChecklist: review([
      ri('constraints', 'Mandatory constraints are identified and each has a verification method.'),
      ri('calculations', 'Calculations state their inputs, units and sources.'),
      ri('evidence', 'Verification evidence is recorded and linked to requirements.'),
      ri('drawings', 'Drawings and models reflect the selected concept.')
    ])
  },
  {
    id: 'custom-user-defined',
    discipline: 'custom',
    archetype: 'User-defined Project Type',
    description: 'A lightly structured project for a design type you define yourself, with prompts to set your own categories and criteria.',
    version: '1.0.0',
    icon: 'Compass',
    sectionLabels: { criteria: 'Design Criteria', constraints: 'Constraints', environment: 'Context and Environment' },
    folders: folderSet(
      ['Design-Criteria', 'Constraints', 'Context-and-Environment'],
      ['Decisions', 'Calculations'],
      ['Drawings', 'Models', 'Reference-Material']
    ),
    defaultAssetFolder: `${P3}/Drawings`,
    requirementCategories: ['Project Definition', 'Performance', 'Constraints', 'Context', 'Verification'],
    suggestedRequirements: [
      rq('c', 'Project Definition', 'Define the project type and goal', 'Describe what you are designing and what success means.', 'M', 'H', 'doc', 'The project goal and success criteria are written so that another engineer could review them.'),
      rq('c', 'Performance', 'Measurable performance measures', 'Choose the quantities that will describe how well the design works.', 'O', 'M', 'doc', 'Each performance measure has a name, a unit and a target (enter values).'),
      rq('k', 'Constraints', 'Non-negotiable constraints', 'List the hard limits the design cannot violate.', 'M', 'H', 'doc', 'Each hard limit is written as a testable statement with its source.'),
      rq('k', 'Verification', 'Verification approach for each constraint', 'Decide how each constraint will be checked.', 'M', 'M', 'doc', 'A verification method is assigned to every mandatory constraint.'),
      rq('e', 'Context', 'Context of use', 'Who uses the design and under what conditions.', 'O', 'M', 'doc', 'Users, operating conditions and external dependencies are described.'),
      rq('e', 'Context', 'Applicable references', 'Codes, standards and prior work that apply to this project type.', 'P', 'L', 'doc', 'Identified references are listed so the team can confirm applicability.')
    ],
    suggestedArguments: [
      arg('Key Design Decision', 'Identify the first significant decision that must be justified.', 'Compare realistic alternatives and record the rationale.', ['Option 1', 'Option 2']),
      arg('Approach and Method Selection', 'The method used to design or analyse the system affects effort and confidence.', 'Choose a design and analysis approach appropriate to the maturity of the concept.', ['Hand calculation and simple models', 'Numerical simulation', 'Prototype and test'])
    ],
    calculationTypes: [
      { title: 'Weighted Decision Score', purpose: 'Combine criterion weights and scores for an alternative.', equation: 'S_j = \\sum_{i} w_i\\, s_{ij}' },
      { title: 'Capacity-to-Demand Margin', purpose: 'A generic margin check; replace symbols with your own quantities.', equation: 'MS = \\frac{C}{D} - 1' }
    ],
    deliverables: ['Project definition', 'Decision record', 'Supporting calculations', 'Review package'],
    riskCategories: ['Unclear Requirements', 'Technical Uncertainty', 'Schedule', 'Safety'],
    designConsiderations: [
      'Define your own project categories early',
      'Record assumptions as soon as they are made',
      'Link every decision to a requirement',
      'Plan how each constraint will be verified'
    ],
    reviewChecklist: review([
      ri('constraints', 'Constraints are testable and have a verification method.'),
      ri('calculations', 'Any calculation used in a decision is documented with inputs and units.')
    ])
  }
];

export const TEMPLATES: ProjectTemplate[] = [...CIVIL, ...MECHANICAL, ...AEROSPACE, ...ELECTRICAL, ...CUSTOM];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getTemplatesForDiscipline(d: Discipline): ProjectTemplate[] {
  return TEMPLATES.filter((t) => t.discipline === d);
}

export function getTemplate(id: string): ProjectTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getDiscipline(id: string): DisciplineInfo | undefined {
  return DISCIPLINES.find((d) => d.id === id);
}
