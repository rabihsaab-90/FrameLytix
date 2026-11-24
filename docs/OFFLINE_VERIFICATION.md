# Offline Verification

FrameLytix is designed to work with no network connection. This page gives (1) a manual procedure you can repeat on the packaged app, (2) a description of the automated controls, and (3) a table to record your results.

Nothing here has been recorded as passed. The results table is blank for you to fill in.

## 1. Manual procedure for the packaged app

**What you need:** the installed FrameLytix (from `npm run dist:win` or a release), a Windows 10/11 computer, and a few sample files to import (any small PNG, a PDF and an STL; the bundled sample project contains examples).

**Going offline.** Disconnect from the network in whatever way you prefer: turn on Windows **Airplane mode**, disconnect Wi-Fi, or unplug the network cable. This is your own choice; you do not need to change firewall settings. Confirm you are offline by trying to open a web page in a browser; it should fail.

Then work through the checks below. Tick each one only when you see the described result. Note anything surprising.

| # | Check | How | Expected result |
| --- | --- | --- | --- |
| 1 | Launch | Start FrameLytix from the Start menu or desktop shortcut. | The welcome screen appears, with the footer "Offline-first — runs entirely on this computer". No error dialog. |
| 2 | Fonts | Look at the welcome screen and the sample project. | Text appears in the Inter typeface; IDs, numbers and paths use a monospaced typeface (JetBrains Mono). Nothing falls back to an obviously different default font. |
| 3 | Demo project | Select **Load Sample Civil Bridge Project**. | The sample opens with the amber Demo mode banner; the explorer shows all four phases. |
| 4 | Icons | Look at the toolbar, explorer and status bar. | All icons draw (no empty squares or missing glyphs). |
| 5 | Equation rendering | Open **Supporting calculations** and select CALC-002. | The equation is typeset (fraction, superscript), not shown as raw LaTeX text. |
| 6 | Image viewing | Open `site-plan-sketch.png` (Phase 3 or the asset register). | The image displays and zooms. |
| 7 | PDF viewing | Open `PTB-GA-001_General-Arrangement.pdf`. | The drawing renders; page controls and zoom work. |
| 8 | STL viewing | Open `PTB-Pratt-Truss-Concept.stl`. | The 3D bridge appears and can be orbited. (If your system has no WebGL you will see a message instead; note it.) |
| 9 | Project creation | Press Ctrl+N, complete the wizard, and **Create Project** into a folder you choose. | The project opens; the folder contains `framelytix-project.json` and the four phase folders. |
| 10 | Saving | Edit a requirement title, wait for "All changes saved" (or press Ctrl+S), then close and reopen the project. | The edit is still there. A file appears in `.framelytix/backups/` after a manual save that changed data. |
| 11 | Import | Import a PNG into Phase 3. | The import dialog works, the file is copied, and it appears in the asset register. |
| 12 | Report export | Open **Report Preview**; select **Export PDF** and **Export HTML**. | Preview displays; both files are written, open correctly, and the PDF shows the report with page numbers in the footer. |
| 13 | CSV export | Export the traceability matrix CSV. | A `.csv` file is written. |
| 14 | Settings persistence | Open **Settings**, change something (for example "Reduce motion"), close FrameLytix completely, reopen. | The setting is still changed. |
| 15 | Recent projects | Return to the welcome screen. | The project you created is listed as Available. |

When finished, reconnect to your network and record the result in the table at the end of this page.

## 2. Automated controls (what the code does)

These are design features, described from the source code. Whether they work in your build is what the manual check and the test suite are for.

**Requests are cancelled in the main process.** `electron/security/hardening.ts` installs a handler on every web request made by any Electron window. Requests to `http:`, `https:`, `ws:`, `wss:` and `ftp:` addresses are cancelled before they leave the computer. The only exception is the local development server when running `npm run dev`; a packaged build has no exception. Requests for `file:` addresses are also cancelled, except for the hidden window used for PDF export. Permission requests from page content (camera, location and so on) are denied.

**Content Security Policy.** The interface is served from the app's own `app://framelytix` scheme, and the policy (`electron/security/csp.ts`) restricts scripts, styles, images, fonts and connections to the app itself, `data:`/`blob:` where needed, and the `framelytix-asset:` preview scheme. There is no allowance for remote hosts. The same policy is injected into the built `index.html`.

**Navigation and windows.** The app cannot navigate to an outside address, open new windows or embed `<webview>` content.

**Everything the interface needs is bundled:**
- Fonts: Inter and JetBrains Mono packages (`@fontsource/*`), bundled into the app and loaded from `font-src 'self' data:`.
- PDF viewer: the pdf.js worker is part of the build and loaded from the app (`worker-src 'self' blob:`).
- Equations: KaTeX is bundled; the report uses MathML output, so no remote stylesheet or font is needed.
- Icons: the `lucide-react` icons are compiled into the app as SVG.
- 3D: three.js is bundled and loaded on demand.

**No telemetry or accounts.** A search of the first-party source (`src/`, `electron/`, `shared/`) finds no sign-in, updater or analytics code; the only `fetch()` calls (STL and text previews) load local files through the `framelytix-asset://` scheme. `SECURITY.md` states the same design. Third-party packages are not covered by that search.

**Automated end-to-end assertions:** see `tests/e2e` (`demo-workflow.spec.ts` and `project-lifecycle.spec.ts`). They contain checks that the app issues no `http(s)` requests and that bundled fonts load. This page does not state whether they pass; run `npm run test:e2e` and record the result yourself.

**Honest limits of these checks.** They show that the *application window* makes no network requests. They do not prove anything about the operating system, the installer download, or other software on the computer. Opening an exported HTML report in a browser, or sharing files through a sync service, are your actions outside FrameLytix.

## 3. Results

Fill in one row each time you run the manual procedure.

| Date | Build (for example version and installer name) | Result |
| --- | --- | --- |
| | | |
| | | |
| | | |

Automated E2E offline assertions: see tests/e2e
