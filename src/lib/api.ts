import type { FramelytixApi } from '@shared/types/ipc';

declare global {
  interface Window {
    framelytix?: FramelytixApi;
  }
}

/**
 * The only bridge to the main process. Exposed by electron/preload.ts via contextBridge.
 * Throws a clear error if the renderer is opened outside Electron (e.g. a plain browser).
 */
export function api(): FramelytixApi {
  const bridge = window.framelytix;
  if (!bridge) {
    throw new Error('FrameLytix must be run as a desktop application (the secure preload bridge is unavailable).');
  }
  return bridge;
}

export function hasApi(): boolean {
  return typeof window !== 'undefined' && !!window.framelytix;
}
