import { z } from 'zod';
import { AppSettingsPatchSchema } from '../../shared/schemas/settings';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { AppState } from '../appState';
import { samePath } from '../security/paths';
import { AbsPath, handle, UserFacingError } from './handle';

export function registerSettingsIpc(state: AppState): void {
  handle(state, IPC_CHANNELS.settingsGet, z.tuple([]), () => state.settings.get());

  handle(state, IPC_CHANNELS.settingsUpdate, z.tuple([AppSettingsPatchSchema]), async (patch) => {
    // The default project location authorises project creation, so it may only be set to a
    // folder the user picked in a dialog this session (or cleared / left unchanged).
    if (patch.defaultProjectLocation !== undefined && patch.defaultProjectLocation !== '') {
      const current = (await state.settings.get()).defaultProjectLocation;
      const ok =
        (current !== '' && samePath(current, patch.defaultProjectLocation)) ||
        state.isGrantedDirectory(patch.defaultProjectLocation) ||
        samePath(state.defaultProjectsDir, patch.defaultProjectLocation);
      if (!ok) throw new UserFacingError('Choose the default project location with the folder picker.');
    }
    return state.settings.update(patch);
  });

  handle(state, IPC_CHANNELS.settingsReset, z.tuple([]), () => state.settings.reset());

  handle(state, IPC_CHANNELS.recentList, z.tuple([]), () => state.settings.listRecent());

  handle(state, IPC_CHANNELS.recentRemove, z.tuple([AbsPath]), async (p) => {
    await state.settings.removeRecent(p);
  });
}
