/**
 * Process-wide hardening: no new windows, no navigation away from the app, no <webview>,
 * no permissions, and no network or file: requests from renderers (offline-first app).
 */
import { app, session, type WebContents } from 'electron';
import { APP_HOST, APP_SCHEME } from './protocols';

export interface HardeningOptions {
  /** Vite dev server origin in development, else null. */
  devOrigin: string | null;
  /** WebContents ids allowed to load file: URLs (the hidden PDF export window). */
  fileAllowedWebContents: Set<number>;
  log?: (message: string) => void;
}

export function isAppUrl(raw: string, devOrigin: string | null): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST) return true;
    return devOrigin !== null && u.origin === devOrigin;
  } catch {
    return false;
  }
}

const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:', 'ftp:']);

function devSocketOrigin(devOrigin: string): string {
  return devOrigin.replace(/^http/, 'ws');
}

export function applyHardening(opts: HardeningOptions): void {
  const { devOrigin } = opts;

  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const guard = (event: { preventDefault(): void }, url: string): void => {
      if (!isAppUrl(url, devOrigin)) {
        event.preventDefault();
        if (devOrigin) opts.log?.(`Blocked navigation to ${url}`);
      }
    };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);

  ses.webRequest.onBeforeRequest((details, callback) => {
    let u: URL;
    try {
      u = new URL(details.url);
    } catch {
      callback({ cancel: true });
      return;
    }
    const protocolName = u.protocol;
    const origin = u.origin;
    if (NETWORK_PROTOCOLS.has(protocolName)) {
      const allowed =
        devOrigin !== null &&
        (origin === devOrigin || (protocolName.startsWith('ws') && origin === devSocketOrigin(devOrigin)));
      if (!allowed) {
        if (devOrigin) opts.log?.(`Blocked request to ${details.url}`);
        callback({ cancel: true });
        return;
      }
    } else if (protocolName === 'file:') {
      const id = details.webContentsId;
      if (id === undefined || !opts.fileAllowedWebContents.has(id)) {
        if (devOrigin) opts.log?.(`Blocked file request ${details.url}`);
        callback({ cancel: true });
        return;
      }
    }
    callback({});
  });
}
