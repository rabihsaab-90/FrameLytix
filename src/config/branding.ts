/**
 * Central branding and identity constants. Imported by the Electron main process,
 * the renderer and the report generator. Keep this file free of React/Node imports.
 */
export const BRANDING = {
  appName: 'FrameLytix',
  tagline: 'Design. Analyse. Justify.',
  category: 'Engineering Design Workspace',
  appId: 'io.github.framelytix.desktop',
  /** Keep in sync with package.json "version". A unit test enforces this. */
  version: '0.1.0',
  manifestFileName: 'framelytix-project.json',
  metadataDirName: '.framelytix',
  backupsDirName: 'backups',
  lockFileName: 'lock.json',
  sampleProjectFolder: 'pedestrian-truss-bridge',
  disclaimer:
    'FrameLytix is an educational engineering documentation and decision-support workspace. ' +
    'It is not certified engineering design software, a structural analysis solver or a ' +
    'regulatory compliance engine. Documentation completeness, weighted scores and internal ' +
    'approval statuses do not establish that a design is safe, compliant or fit for ' +
    'construction. Responsibility for engineering validation remains with appropriately ' +
    'qualified individuals.'
} as const;

export const COLOURS = {
  obsidian: '#09090B',
  carbon: '#121215',
  matte: '#1A1A1F',
  crimson: '#DC2626',
  crimsonHover: '#EF4444',
  crimsonActive: '#991B1B',
  gunmetal: '#27272A',
  white: '#FAFAFA',
  silver: '#A1A1AA',
  amber: '#F59E0B',
  emerald: '#10B981'
} as const;
