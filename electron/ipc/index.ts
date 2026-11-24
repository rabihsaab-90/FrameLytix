import type { AppState } from '../appState';
import { registerAppIpc } from './appIpc';
import { registerExportIpc } from './exportIpc';
import { registerFilesIpc } from './filesIpc';
import { assertAllChannelsRegistered } from './handle';
import { registerProjectIpc } from './projectIpc';
import { registerSettingsIpc } from './settingsIpc';

export function registerIpc(state: AppState): void {
  registerAppIpc(state);
  registerSettingsIpc(state);
  registerProjectIpc(state);
  registerFilesIpc(state);
  registerExportIpc(state);
  assertAllChannelsRegistered();
}
