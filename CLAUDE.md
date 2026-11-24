# FrameLytix — development instructions

Offline-first Electron desktop app: engineering design workspace (requirements, engineering
arguments, weighted decision matrices with mandatory constraints, calculations, traceability,
risks, review, report export). Canadian English in all UI text and docs. Full spec: PROJECT_SPEC.md.
Progress log: DEVELOPMENT_STATUS.md.

## Commands (Windows PowerShell; Node 26 LTS, npm 11)
- `npm run dev` — electron-vite dev (main + preload + renderer with HMR)
- `npm run typecheck` — tsc for node (electron/, shared/, src/templates, tests) and web (src/, shared/)
- `npm run lint` — ESLint flat config
- `npm test` — Vitest unit + integration (`tests/unit`, `tests/integration`)
- `npm run test:e2e` — builds then runs Playwright Electron tests (`tests/e2e`)
- `npm run check` — lint + typecheck + test + build
- `npm run dist:win` — NSIS installer in `release/` (never publishes)
- If `node` is not on PATH in a fresh shell: `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`

## Layout
- `shared/schemas/project.ts` — Zod manifest schema = the single authoritative data model. Records have UUID `id` + display `code` (REQ-001). Relationships live ONLY in `manifest.links` (undirected TraceLink a↔b).
- `shared/types/ipc.ts` — the typed IPC contract (`FramelytixApi`, channel names). Change contract here first.
- `shared/utilities/` — pure, tested logic (decision matrix, traceability, completeness, risk, revisions, ids, csv/html escaping, paths, expression parser, project factory).
- `shared/report/` — pure HTML report builder (used by main for preview/HTML/PDF).
- `src/templates/templates.ts` — engineering archetypes (pure data, typed by `src/templates/types.ts`).
- `src/config/branding.ts` — app name, version, manifest filename, colours, disclaimer.
- `electron/` — main process: `main.ts`, `preload.ts`, `ipc/`, `services/` (pure Node fs — no `electron` import, so they are integration-testable), `security/`.
- `src/` — React renderer. `stores/` (Zustand + Immer), `components/<area>/`, `pages/`, `hooks/`, `styles/`.

## Rules
- Security: contextIsolation on, nodeIntegration off, sandbox on, CSP, no `eval`/`new Function`, no `dangerouslySetInnerHTML` with user content (KaTeX output with `trust:false` is the single allowed exception, via `components/calculations/Equation.tsx`), no raw ipcRenderer exposure, validate every IPC argument with Zod and the sender frame, constrain file ops to the project root via `electron/security/paths.ts`. Never disable webSecurity.
- Renderer talks to main only through `window.framelytix` (see `src/lib/api.ts`).
- Never fabricate metrics, verification, approvals or code compliance. "Approved" = internal doc status only. Documentation completeness ≠ engineering validity.
- Decision matrix: scores 1–5, higher = more favourable (incl. cost). Missing scores stay incomplete (never 0). A failed mandatory constraint ⇒ ineligible; unverified ⇒ provisional.
- Design tokens (Tailwind theme in `src/styles/index.css`): obsidian #09090B bg, carbon #121215 panels, matte #1A1A1F elevated, crimson #DC2626 accent (hover #EF4444, active #991B1B), gunmetal #27272A borders, white #FAFAFA text, silver #A1A1AA secondary, amber #F59E0B draft, emerald #10B981 verified. Inter for UI; JetBrains Mono (`font-mono`) for IDs, paths, equations, numbers.
- Don't add dependencies without a clear reason; never edit package.json casually.
- Tests: deterministic fixtures, temp dirs only (`os.tmpdir()`), never touch real user projects. Never skip/disable failing tests to go green.
- Git: no global config changes, no invented identity, never force-push.
