# FrameLytix — Development Status

_Last updated: 2026-11-24_

## Current milestone
Milestone 9 (GitHub release preparation) — complete locally. Awaiting owner publication steps.

## Environment
Windows 11 · Node 26.13.1 · npm 11.20 · Electron 45.4.1 · electron-vite 6 · Vite 8 · React 19.3 · TypeScript 6.0 (TS 7 not yet supported by typescript-eslint) · Git 2.56 (no identity configured — repository initialised, **no commits made**).

## Completed (implemented and tested)
- Schema, typed IPC, secure main process (sandbox, CSP, sender + Zod validation, path containment, network blocking, custom protocols).
- Persistence: atomic saves, serialised autosave, bounded backups, lock, external-change conflicts, corrupted-manifest recovery, future-schema rejection.
- Welcome, two-step onboarding (21 archetypes), workspace shell, explorer synced with disk, settings.
- Requirements, engineering arguments (decision matrix, mandatory constraints, sensitivity, revisions), calculations (KaTeX + restricted parser), evidence, traceability, risks, review, report preview, PDF/HTML/CSV export, export history.
- Asset import with collision handling, relink, image/SVG/PDF/STL viewers, native-app opening.
- Demo: pedestrian truss bridge (temp copy, reset, save as new).
- Docs: README, USER_GUIDE, ARCHITECTURE, PROJECT_FORMAT, OFFLINE_VERIFICATION, CONTRIBUTING, SECURITY, CHANGELOG, THIRD_PARTY_NOTICES; issue/PR templates; CI + release workflows.

## Test results (local)
- `npm run lint`, `npm run typecheck`: clean.
- `npm test`: 375 passed (22 files: unit + integration).
- `npm run test:e2e`: 22 passed.
- `npm run dist:win`: `release/FrameLytix-Setup-0.1.0-x64.exe` (161 MB, unsigned). Packaged `win-unpacked` app smoke-tested: demo, PDF, STL, KaTeX, bundled fonts, zero remote requests.

## Security audit (2026-11-24)
- Ledger: `security-checks.csv` (70 checks); report: `docs/SECURITY_AUDIT.md`.
- Fixes: Electron fuses, `node_modules` no longer shipped (asar 136 MB → 11 MB), wider blocked-file list (+ open-only block for scripts), minimatch override (npm audit 0), Actions pinned to SHAs with `persist-credentials: false`, Dependabot, PRIVACY.md, licensed-engineer disclaimer.
- This PC has Windows Smart App Control ON: newly built unsigned executables cannot run here, so `npm run dist:win` fails at the NSIS uninstaller step (`spawn UNKNOWN`). Local release artifact = portable zip (`electron-builder --win zip --prepackaged release/win-unpacked`). The NSIS installer must be built by the GitHub release workflow.

## Not verified / blocked
- Installer not run through the NSIS install wizard by automation (unpacked build tested instead).
- macOS DMG: configured only; never built or tested (requires macOS).
- GitHub Actions CI: run #2 (commit 842d134) passed — lint/typecheck/test/build on windows-latest and macos-latest, plus Windows E2E. Release workflow not yet run. macOS DMG still never built or launched.
- Manual offline procedure in docs/OFFLINE_VERIFICATION.md not yet performed by the owner.

## Known limitations / deferred
- No native previews for DWG/STEP/IGES/SLDPRT (open externally).
- No UI to add a `.gitignore` to an existing project (wizard option only; IPC exists).
- Renderer `ui` chunk is large (~1.5 MB) because dynamic icon lookup imports the full lucide icon set.
- THIRD_PARTY_NOTICES generator may include optional platform packages (e.g. `@napi-rs/canvas-*`) — review before publishing.

## Publication
- Repository: https://github.com/rabihsaab-90/FrameLytix (Git identity set per-repository; LICENSE and README filled in).
- Owner to do: enable private vulnerability reporting on GitHub; check the first CI run.

## Decisions
- Relationships stored once in `manifest.links` (undirected).
- Main process owns the authorised project root; renderer sends relative paths only.
- Report HTML built in main from a validated manifest; KaTeX MathML output; preview in `sandbox=""` iframe; PDF via printToPDF in a JS-disabled hidden window.
- Demo opens as a temp copy; bundled sample is read-only.
