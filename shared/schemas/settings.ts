import { z } from 'zod';
import { DisciplineSchema, UnitSystemSchema } from './project';

export const RecentProjectSchema = z.object({
  /** Absolute path to the project directory (machine-specific; stored only in app settings). */
  path: z.string().min(1).max(4096),
  title: z.string().max(200),
  discipline: DisciplineSchema,
  identifier: z.string().max(40),
  lastOpened: z.string().max(40)
});
export type RecentProject = z.infer<typeof RecentProjectSchema>;

export const AppSettingsSchema = z.object({
  settingsVersion: z.literal(1).default(1),
  defaultProjectLocation: z.string().max(4096).default(''),
  defaultUnitSystem: UnitSystemSchema.default('SI'),
  autosaveEnabled: z.boolean().default(true),
  /** Debounce delay after the last edit before autosaving (ms). */
  autosaveDelayMs: z.number().int().min(500).max(60_000).default(1500),
  sidebarWidth: z.number().int().min(200).max(520).default(280),
  sidebarCollapsed: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  /** Number of manifest backups kept per project. */
  backupRetention: z.number().int().min(3).max(50).default(10),
  recentProjects: z.array(RecentProjectSchema).max(20).default([])
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

/** Fields the renderer may update. recentProjects is managed by the main process only. */
export const AppSettingsPatchSchema = AppSettingsSchema.omit({ settingsVersion: true, recentProjects: true })
  .partial()
  .strict();
export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>;
