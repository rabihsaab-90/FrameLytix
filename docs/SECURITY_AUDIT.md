# FrameLytix security, privacy and release audit

_Audit date: 24 November 2026 · Version 0.1.0 · Base commit 19efabd plus the changes listed below_

This is an evidence-based review by an AI assistant, using a 70-item launch checklist. It is not a penetration test, a professional code audit or legal advice, and no checklist guarantees immunity from attacks or legal claims.

## Overview

- **Product:** FrameLytix, an offline-first Electron desktop app (Windows primary, macOS secondary) for engineering design documentation. It has no accounts, servers, databases, payments, telemetry or AI features.
- **Stack:** Electron 45, React 19, TypeScript, Zod, electron-vite, electron-builder.
- **Inspected:** the full source tree (`electron/`, `src/`, `shared/`), build configuration, GitHub workflows, dependency tree (`npm audit`), git history, the packaged app bundle, and GitHub Actions run #2.
- **Not inspected:** the owner's GitHub account settings, a signed release, macOS behaviour, and a run of the NSIS install wizard. This PC's Smart App Control blocks newly built unsigned executables (see Readiness).
- **Threat model:** the main assets are the user's project files and their computer. The main entry points are files the user opens or imports (project manifests, CAD/PDF/STL/images), the renderer-to-main IPC bridge, and the release supply chain (npm and GitHub Actions). The attacker most worth considering is someone who hands the user a malicious project folder or file.
- **Highest risks found and fixed:** the packaged executable could be run as a plain Node runtime (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `--inspect`); some risky file types could be opened with their default handler; GitHub Actions used mutable tags; about 130 MB of unused `node_modules` (including native binaries) shipped in the installer.

## Security scorecard (all 70 checks)

**FAILED: 0 / 70**

| Measure | Count |
|---|---:|
| **FAIL (confirmed not passed)** | 0 |
| **UNKNOWN (not verified)** | 3 |
| **FAIL + UNKNOWN (not passed or unverified)** | 3 |
| PASS (verified) | 29 |
| NOT APPLICABLE (justified) | 38 |
| **TOTAL** | **70** |

**Equations:** 29 PASS + 0 FAIL + 3 UNKNOWN + 38 NOT APPLICABLE = 70; FAIL + UNKNOWN = 3.

Applicable-check pass rate: 29 / 32 = 91%. The three UNKNOWN items (38 supply-chain provenance, 50 no independent human review, 55 MFA on the owner's GitHub account) are unverified, not proven vulnerabilities.

Seven checks (10, 21, 36, 37, 52, 60, 62) had confirmed issues that were fixed and retested in this audit. They are recorded as PASS, with the original issue in the ledger's evidence column.

## All 70 checks

The full evidence, fix and verification for each item is in [`security-checks.csv`](../security-checks.csv).

| ID | Check | Status | Severity (original issue) |
|---|---|---|---|
| 01 | Exposed database credentials | NOT APPLICABLE | — |
| 02 | Public .env files | PASS | — |
| 03 | Hardcoded API keys or secrets | PASS | — |
| 04 | Weak or missing authentication | NOT APPLICABLE | — |
| 05 | Missing server-side authorization | PASS | — |
| 06 | Cross-user data access | NOT APPLICABLE | — |
| 07 | Open database permissions | NOT APPLICABLE | — |
| 08 | Misconfigured Firebase / Supabase / S3 | NOT APPLICABLE | — |
| 09 | Unprotected admin routes | NOT APPLICABLE | — |
| 10 | Production debug tools exposed | PASS | MEDIUM |
| 11 | Build logs leaking secrets | PASS | — |
| 12 | Verbose production errors | PASS | — |
| 13 | Secrets in Git history | PASS | — |
| 14 | Secrets shipped in frontend JavaScript | PASS | — |
| 15 | Client-side-only security checks | PASS | — |
| 16 | Missing input validation | PASS | — |
| 17 | SQL injection | NOT APPLICABLE | — |
| 18 | NoSQL injection | NOT APPLICABLE | — |
| 19 | Cross-site scripting (XSS) | PASS | — |
| 20 | Cross-site request forgery (CSRF) | NOT APPLICABLE | — |
| 21 | Insecure file uploads | PASS | MEDIUM |
| 22 | Path traversal | PASS | — |
| 23 | Server-side request forgery (SSRF) | NOT APPLICABLE | — |
| 24 | Broken password-reset flows | NOT APPLICABLE | — |
| 25 | Weak session management | NOT APPLICABLE | — |
| 26 | Weak or incorrectly validated JWTs | NOT APPLICABLE | — |
| 27 | Overly permissive CORS | NOT APPLICABLE | — |
| 28 | Missing rate limits | NOT APPLICABLE | — |
| 29 | Unprotected staging or test environments | NOT APPLICABLE | — |
| 30 | Default credentials left unchanged | NOT APPLICABLE | — |
| 31 | Webhook signatures not verified | NOT APPLICABLE | — |
| 32 | Frontend-only payment checks | NOT APPLICABLE | — |
| 33 | IDOR / BOLA | NOT APPLICABLE | — |
| 34 | APIs trusting user-controlled roles or IDs | NOT APPLICABLE | — |
| 35 | Sensitive data in logs | PASS | — |
| 36 | Sensitive source maps or build artifacts | PASS | LOW |
| 37 | Vulnerable or abandoned dependencies | PASS | LOW |
| 38 | Malicious or compromised packages | UNKNOWN | LOW |
| 39 | Prompt injection | NOT APPLICABLE | — |
| 40 | AI tools bypassing user permissions | NOT APPLICABLE | — |
| 41 | Excess database privileges | NOT APPLICABLE | — |
| 42 | Missing audit logs | NOT APPLICABLE | — |
| 43 | No security monitoring or alerts | NOT APPLICABLE | — |
| 44 | No tested backup / restore plan | PASS | — |
| 45 | Public internal dashboards | NOT APPLICABLE | — |
| 46 | Missing security headers | PASS | — |
| 47 | Unsafe cookie settings | NOT APPLICABLE | — |
| 48 | Sensitive data unprotected in transit / at rest | NOT APPLICABLE | — |
| 49 | Poor tenant isolation | NOT APPLICABLE | — |
| 50 | Over-trusting AI-generated code | UNKNOWN | MEDIUM |
| 51 | Mass assignment / over-posting | PASS | — |
| 52 | Command / OS injection | PASS | MEDIUM |
| 53 | Unsafe deserialization | PASS | — |
| 54 | Misconfigured OAuth / OIDC / social login | NOT APPLICABLE | — |
| 55 | No MFA on privileged accounts | UNKNOWN | MEDIUM |
| 56 | Account enumeration | NOT APPLICABLE | — |
| 57 | Business-logic abuse | NOT APPLICABLE | — |
| 58 | Race conditions | PASS | — |
| 59 | Webhook replay / duplicate processing | NOT APPLICABLE | — |
| 60 | Overpowered CI/CD credentials | PASS | LOW |
| 61 | Untrusted build actions or scripts | PASS | — |
| 62 | Unpinned build dependencies | PASS | LOW |
| 63 | Security checks fail open | PASS | — |
| 64 | Missing resource limits | PASS | — |
| 65 | AI sensitive-information disclosure | NOT APPLICABLE | — |
| 66 | Unsafe use of AI output | NOT APPLICABLE | — |
| 67 | AI agents have excessive agency | NOT APPLICABLE | — |
| 68 | Sensitive browser storage | PASS | — |
| 69 | Open redirects | PASS | — |
| 70 | Unsecured GraphQL / WebSocket / realtime endpoints | NOT APPLICABLE | — |

## Legal, privacy, accessibility, IP and platform review

These items are separate from, and not counted in, the 70 checks. Nothing here is legal advice; items marked for review need a qualified person.

| Topic | Status | Evidence and action |
|---|---|---|
| Privacy policy | PASS (added) | The app collects nothing, so no consent mechanism is needed. Added [PRIVACY.md](../PRIVACY.md), which describes local storage (settings, recent-projects list, log, temporary files), what the uninstaller leaves behind, and how to delete it. It is also shipped inside the package. Every statement was checked against the code. |
| Terms of use / EULA | PASS | The MIT [LICENSE](../LICENSE) grants the licence and disclaims warranties, which is adequate for a free open-source tool. No separate terms are needed. |
| Cookie policy and consent | NOT APPLICABLE | No cookies, analytics, trackers or embeds. |
| Refund policy | NOT APPLICABLE | Free, with no payments. |
| Form consent | NOT APPLICABLE | No forms send data anywhere. |
| Business transparency | PASS | The author is named in LICENSE, README and the package copyright (now "Copyright © 2026 Rabih Saab" instead of "FrameLytix contributors"). No address or email is published, and none is required for a free hobby project. Support goes through GitHub Issues and private vulnerability reporting. |
| Professional-engineering liability | PASS (strengthened) | Canadian provinces regulate engineering practice and the title "engineer". The in-app and report disclaimer, and the README, now state that FrameLytix does not replace the review, approval or seal of a licensed professional engineer. "Approved" remains an internal documentation status. The README describes the author as an engineering student. **Review:** before you call yourself an "engineer" in portfolio material, check your provincial regulator's title rules. |
| Third-party licences | PASS with note | [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) includes the full licence texts (MIT, ISC, Apache-2.0, BSD and OFL-1.1 for fonts). Electron's `LICENSE.electron.txt` and `LICENSES.chromium.html` ship with the app. Note: the notices list some optional packages (for example `@napi-rs/canvas-*`) that are not bundled. Listing too many is harmless. |
| Copyleft obligations | PASS | No GPL or LGPL runtime dependencies in the summary table. |
| Assets and fonts | PASS | Icons and sample drawings were generated by project scripts (`scripts/`); fonts are OFL-1.1; icons come from lucide (ISC). The sample bridge project is fictional. |
| Trademarks | UNKNOWN | No search has been done for "FrameLytix". The README now states this, and that third-party product names (AutoCAD, SolidWorks, MATLAB) are used only to describe compatibility. **Action:** search the Canadian Trademarks Database and the USPTO before promoting the name widely. |
| AI-generated code and copyright | PASS (disclosed) | The README discloses AI assistance. Copyright protection for AI-generated material is unsettled; the MIT licence is still effective for whatever the author holds. |
| Accessibility | UNKNOWN | Semantic roles and labels exist, and E2E tests use accessible names. No WCAG 2.2 audit, screen-reader test or contrast measurement was run in this audit. **Action:** do a manual keyboard and NVDA pass before claiming accessibility. |
| Desktop platform safeguards | PASS | Sandbox, context isolation, CSP, IPC sender checks, no remote content, no auto-update channel (so no update-hijack risk), per-user NSIS install with no admin rights, and fuses enabled. |
| Code signing | FAIL (owner decision) | Releases are unsigned. SmartScreen warns, and Windows 11 Smart App Control blocks the app outright. Signing costs money (or needs an open-source signing programme such as SignPath Foundation), so it is the owner's decision. Documented in the README. |

## Changes made

| File | Change | Why |
|---|---|---|
| `electron-builder.yml` | Added `electronFuses`, excluded `node_modules`, set the copyright to "Rabih Saab", shipped `PRIVACY.md`, added the portable zip artifact name | Binary hardening (check 10), smaller attack surface (check 36), legal accuracy |
| `electron.vite.config.ts` | `externalizeDeps: false` for main and preload | Bundles `zod` and `katex` into `out/main` so the package needs no `node_modules` |
| `electron/security/paths.ts` | Larger `BLOCKED_EXTENSIONS`; new `isBlockedForOpen` with open-only blocking of `.py`, `.pyw`, `.pyc`, `.pyo`, `.pyz`, `.pl` and `.rb` | Checks 21 and 52 |
| `electron/ipc/filesIpc.ts` | Open-in-application uses `isBlockedForOpen` | Check 52 |
| `tests/integration/paths.test.ts` | New blocked types, safe types and an import-but-not-open test | Regression protection |
| `package.json` | Scoped `overrides` for `minimatch` under electron-builder; `dist:win` also builds the portable zip | Check 37; release artifact |
| `.github/workflows/ci.yml`, `release.yml` | Actions pinned to commit SHAs (latest releases, Node 24), `persist-credentials: false`, release uploads the zip and its checksum | Checks 60 and 62; removes the Node 20 deprecation warning |
| `.github/dependabot.yml` | Monthly Actions and npm update pull requests | Checks 37 and 62 (keeping up to date) |
| `PRIVACY.md` | New | Privacy disclosure |
| `src/config/branding.ts`, `README.md` | Licensed-engineer disclaimer; Privacy and Trademarks sections; Smart App Control note; current test results | Legal and honest marketing |
| `CHANGELOG.md`, `DEVELOPMENT_STATUS.md` | Recorded the above | Traceability |
| `security-checks.csv`, `docs/SECURITY_AUDIT.md` | New | Audit record |

**Rollback:** each change is independent and can be reverted with git. The only behaviour change users will notice is that `.py`, `.pl` and `.rb` files can no longer be opened from inside FrameLytix ("Reveal in File Explorer" still works), along with the larger blocked import list.

## Tests actually run (Windows 11, 24 November 2026)

| Command | Result |
|---|---|
| `npm run lint` | Clean |
| `npm run typecheck` | Clean |
| `npx vitest run` | 376 passed, 0 failed (22 files) |
| `npm run test:e2e` | 22 passed, 0 failed |
| `npm audit` | 0 vulnerabilities (before the fix: 6 moderate) |
| `npx @electron/fuses read --app release/win-unpacked/FrameLytix.exe` | RunAsNode, NodeOptions and NodeCliInspect off; AsarIntegrity, OnlyLoadAppFromAsar and CookieEncryption on; GrantFileProtocolExtraPrivileges off |
| Bundle smoke test (packaged `app.asar` run with the official Electron binary) | Sample loads; PDF viewer, STL model (684 triangles), KaTeX and fonts work; PDF export 944 KB; 0 remote requests; 0 page errors |
| Packaged zip inspection | 112 entries, 0 `node_modules`, 0 `.map` files; includes the sample, icons, LICENSE, notices and PRIVACY.md |
| Secret scan of git history and tracked files | 0 matches |

**Could not run here:** the fused `FrameLytix.exe` itself and the NSIS installer build. Smart App Control blocks any newly built unsigned executable on this PC; this was confirmed with a build without fuses, which was blocked the same way. The skill's Python counter was not run because Python is not installed; an equivalent Node script confirmed the 70-row ledger. macOS was not tested.

## Outstanding actions for the owner

1. Turn on two-factor authentication for the GitHub account (check 55).
2. Turn on Private vulnerability reporting under the repository's Settings → Code security.
3. Decide on code signing (for example the SignPath Foundation programme for open-source projects).
4. Search for the "FrameLytix" trademark before promoting the name.
5. Optionally, get a human review of `electron/` (check 50) and do an accessibility pass.

## Readiness

**CONDITIONALLY READY** for a GitHub pre-release (0.1.0, marked as a pre-release).

- No confirmed open vulnerabilities in the 70-check scope.
- Conditions: releases are unsigned (blocked on Smart App Control PCs; SmartScreen warns elsewhere). The fused Windows executable has been verified by fuse inspection and a bundle smoke test, but has not been launched as a packaged exe on this PC. The NSIS installer must be built by the GitHub release workflow. macOS is unverified.
