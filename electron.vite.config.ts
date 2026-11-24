import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const alias = {
  '@shared': resolve(__dirname, 'shared'),
  '@': resolve(__dirname, 'src')
};

/**
 * Production Content Security Policy. Injected only into production builds because
 * the Vite dev server needs an inline React refresh preamble. The app protocol handler
 * in electron/security also sends this policy as a response header.
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

function cspPlugin(): Plugin {
  return {
    name: 'framelytix-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- CSP -->',
        `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`
      );
    }
  };
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: resolve(__dirname, 'electron/main.ts') } }
    }
  },
  preload: {
    resolve: { alias },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: 'src',
    resolve: { alias },
    plugins: [react(), tailwindcss(), cspPlugin()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: { index: resolve(__dirname, 'src/index.html') } }
    }
  }
});
