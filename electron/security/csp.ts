/**
 * Production Content Security Policy, sent as a response header by the app:// protocol.
 * MUST stay identical to PRODUCTION_CSP in electron.vite.config.ts (which injects the same
 * policy as a <meta> tag into the built index.html).
 */
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: framelytix-asset:",
  "font-src 'self' data:",
  "connect-src 'self' framelytix-asset:",
  "worker-src 'self' blob:",
  "frame-src 'self' about:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

/** Policy for project asset responses: an SVG opened directly cannot run script or fetch. */
export const ASSET_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
