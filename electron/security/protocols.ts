/**
 * Custom protocols:
 *  - app://framelytix/…            the production renderer bundle (out/renderer only)
 *  - framelytix-asset://project/…  preview of files inside the CURRENT project only
 *
 * `registerPrivilegedSchemes` must run before `app` is ready.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { ASSET_PROTOCOL } from '../../shared/types/ipc';
import { extensionOf } from '../../shared/utilities/paths';
import { ASSET_CSP, PRODUCTION_CSP } from './csp';
import { isInside, resolveInsideRoot } from './paths';

export const APP_SCHEME = 'app';
export const APP_HOST = 'framelytix';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

const APP_MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  wasm: 'application/wasm',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  bcmap: 'application/octet-stream',
  pfb: 'application/octet-stream'
};

export const ASSET_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  stl: 'model/stl',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8'
};

export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true }
    },
    {
      // corsEnabled so the renderer (a different origin) can fetch() PDFs/STL/text for previews;
      // responses only allow the app's own origin.
      scheme: ASSET_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
    }
  ]);
}

function textResponse(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...extra }
  });
}

function streamBody(file: string, range?: { start: number; end: number }): ReadableStream {
  const nodeStream = createReadStream(file, range ? { start: range.start, end: range.end } : undefined);
  return Readable.toWeb(nodeStream) as unknown as ReadableStream;
}

/** Parse a single `bytes=start-end` range. Returns null for absent/unsupported, 'invalid' for unsatisfiable. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a = '', b = ''] = m;
  let start: number;
  let end: number;
  if (a === '' && b === '') return null;
  if (a === '') {
    const suffix = Number(b);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid';
  return { start, end };
}

/** Serve the built renderer from `rendererDir` only. */
export function registerAppProtocol(rendererDir: string): void {
  const root = path.resolve(rendererDir);
  protocol.handle(APP_SCHEME, async (request) => {
    const security = { 'Content-Security-Policy': PRODUCTION_CSP, 'X-Content-Type-Options': 'nosniff' };
    try {
      const url = new URL(request.url);
      if (url.host !== APP_HOST) return textResponse(404, 'Not found', security);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.includes('\0')) return textResponse(404, 'Not found', security);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!isInside(root, file) || file === root) return textResponse(404, 'Not found', security);
      const s = await stat(file).catch(() => null);
      if (!s || !s.isFile()) return textResponse(404, 'Not found', security);
      const mime = APP_MIME[extensionOf(file)] ?? 'application/octet-stream';
      return new Response(streamBody(file), {
        status: 200,
        headers: { 'Content-Type': mime, 'Content-Length': String(s.size), ...security }
      });
    } catch {
      return textResponse(404, 'Not found', security);
    }
  });
}

/** Serve preview files from the current project. `getRoot` returns null when no project is open. */
export function registerAssetProtocol(getRoot: () => string | null, allowedOrigins: () => string[]): void {
  protocol.handle(ASSET_PROTOCOL, async (request) => {
    const origin = request.headers.get('origin');
    const cors: Record<string, string> =
      origin && allowedOrigins().includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const base = {
      'Content-Security-Policy': ASSET_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      ...cors
    };
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return textResponse(405, 'Method not allowed', base);
      const root = getRoot();
      if (!root) return textResponse(404, 'No project is open', base);
      const url = new URL(request.url);
      if (url.host !== 'project') return textResponse(404, 'Not found', base);
      const segments = url.pathname.split('/').filter((s) => s !== '').map((s) => decodeURIComponent(s));
      if (segments.length === 0 || segments.some((s) => s.includes('/') || s.includes('\\'))) {
        return textResponse(403, 'Forbidden', base);
      }
      const rel = segments.join('/');
      const ext = extensionOf(rel);
      const mime = ASSET_MIME[ext];
      if (!mime) return textResponse(403, 'This file type cannot be previewed', base);
      let abs: string;
      try {
        abs = await resolveInsideRoot(root, rel);
      } catch {
        return textResponse(403, 'Forbidden', base);
      }
      const s = await stat(abs).catch(() => null);
      if (!s || !s.isFile()) return textResponse(404, 'Not found', base);

      const headers: Record<string, string> = { ...base, 'Content-Type': mime, 'Accept-Ranges': 'bytes' };
      const range = parseRange(request.headers.get('range'), s.size);
      if (range === 'invalid') {
        return textResponse(416, 'Range not satisfiable', { ...base, 'Content-Range': `bytes */${s.size}` });
      }
      if (range) {
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${s.size}`;
        headers['Content-Length'] = String(range.end - range.start + 1);
        return new Response(request.method === 'HEAD' ? null : streamBody(abs, range), { status: 206, headers });
      }
      headers['Content-Length'] = String(s.size);
      return new Response(request.method === 'HEAD' || s.size === 0 ? null : streamBody(abs), { status: 200, headers });
    } catch {
      return textResponse(500, 'Error', base);
    }
  });
}
