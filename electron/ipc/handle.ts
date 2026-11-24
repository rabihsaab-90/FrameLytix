/**
 * Every IPC handler goes through `handle()`, which:
 *  (a) accepts only the main window's main frame served from the app origin (or dev server),
 *  (b) validates the argument tuple with Zod,
 *  (c) converts unexpected errors into safe messages (details go to the bounded local log).
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { AppState } from '../appState';
import { isAppUrl } from '../security/hardening';
import { PathSecurityError } from '../security/paths';

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** Errors whose message is safe and useful to show to the user. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export const Str = (max = 4096): z.ZodString => z.string().max(max);
export const RelPath = z.string().max(1024);
export const AbsPath = z.string().min(1).max(4096);

export function isTrustedSender(state: AppState, event: IpcMainInvokeEvent): boolean {
  const win = state.mainWindow;
  if (!win || win.isDestroyed()) return false;
  if (event.sender.id !== win.webContents.id) return false;
  const frame = event.senderFrame;
  if (!frame) return false;
  const main = win.webContents.mainFrame;
  if (frame.processId !== main.processId || frame.routingId !== main.routingId || frame.parent !== null) return false;
  return isAppUrl(frame.url, state.devOrigin);
}

const registered = new Set<string>();

export function handle<A extends unknown[], R>(
  state: AppState,
  channel: IpcChannel,
  schema: z.ZodType<A>,
  fn: (...args: A) => Promise<R> | R
): void {
  if (registered.has(channel)) throw new Error(`Duplicate IPC handler: ${channel}`);
  registered.add(channel);
  ipcMain.handle(channel, async (event, ...rawArgs: unknown[]) => {
    if (!isTrustedSender(state, event)) {
      state.logger.write('warn', `Rejected IPC ${channel} from untrusted sender`);
      throw new Error('Request rejected.');
    }
    const parsed = schema.safeParse(rawArgs);
    if (!parsed.success) {
      state.logger.write('warn', `Invalid arguments for ${channel}: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`);
      throw new Error('Invalid request.');
    }
    try {
      return await fn(...parsed.data);
    } catch (err) {
      state.logger.error(channel, err);
      // Deliberately NOT attaching `cause`: only a safe message may cross to the renderer.
      /* eslint-disable preserve-caught-error */
      if (err instanceof UserFacingError || err instanceof PathSecurityError) throw new Error(err.message);
      throw new Error('An unexpected error occurred. Details were written to the FrameLytix log.');
      /* eslint-enable preserve-caught-error */
    }
  });
}

/** Every declared channel must have a handler — checked at startup. */
export function assertAllChannelsRegistered(): void {
  const missing = Object.values(IPC_CHANNELS).filter((c) => !registered.has(c));
  if (missing.length > 0) throw new Error(`IPC channels without handlers: ${missing.join(', ')}`);
}
