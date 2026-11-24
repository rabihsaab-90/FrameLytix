# FrameLytix — Product Specification (durable requirements)

**FrameLytix — Design. Analyse. Justify.** An open-source, offline-first desktop
Engineering Design Workspace (Windows primary, macOS secondary) for engineering students,
design teams, capstone groups and competition teams. Canadian English throughout.

## Problem
Engineering projects fragment requirements (Word), calculations (spreadsheets/MATLAB),
drawings (CAD folders), informal option comparisons and justifications disconnected from
requirements. FrameLytix unifies them with structured reasoning and **traceability**.

## Workflow
1. Define the project → 2. Requirements & constraints → 3. Evaluate alternatives →
4. Calculations & assumptions → 5. Justify decisions → 6. Organize CAD/drawings →
7. Review completeness → 8. Export a professional design package.

## Non-negotiables
- Fully functional offline; no accounts, servers, cloud, paid/AI APIs, telemetry or hidden network traffic.
- Projects are portable local folders with `framelytix-project.json` (versioned, Zod-validated, relative paths, deterministic JSON).
- Real file operations and real exports (PDF, HTML, CSV). No fake buttons, fake downloads, fabricated metrics or fabricated verification.
- Populated, original demo project (Pedestrian Truss Bridge) opening in one click; bundled sample never modified.
- Installable Windows NSIS build; macOS DMG configured (unsigned).

## Core features
- Welcome screen (sample, new, open, recent projects with availability), two-step onboarding
  (5 disciplines, 21 discipline-specific archetypes in `src/templates/templates.ts`).
- Workspace: toolbar, collapsible/resizable explorer (4 phases; Phase 3 mirrors disk), breadcrumbs,
  status bar, shortcuts (Ctrl/Cmd+N/O/S/B/F), unsaved-change protection.
- Requirements (REQ-###): classification mandatory/objective/preference, verification method/status,
  evidence; Verified never automatic.
- Engineering arguments (ARG-###): problem, objective, alternatives, weighted decision matrix (1–5,
  higher = more favourable incl. cost; Σ(score×weight)/Σweights; missing ≠ 0; ties explicit),
  **mandatory constraint evaluation** (fail ⇒ ineligible, unverified ⇒ provisional), distinct
  highest-score / eligible / provisional / user-selected / documentation-status concepts,
  sensitivity analysis (temporary), assumptions, justification, references, revisions REV-A…Z, AA….
  Approved = internal documentation status only; material change returns to Under Review.
- Calculations (CALC-###) with KaTeX (trust off), variables, restricted arithmetic parser (no eval, no unit conversion).
- Traceability (single undirected link list), matrix, coverage with explicit denominator, gap detection.
- Risk register (L×I, inherent/residual), design review checklist + automatic documentation checks.
- Technical assets: import with collision handling (never silent overwrite), watcher + manual refresh,
  missing-file relink, open in native app via safe shell APIs, image/SVG/PDF.js/STL (R3F) viewers.
- Reports: print-friendly HTML and PDF (Electron printToPDF) with all sections, disclaimer, outstanding items; CSV exports with formula-injection protection.
- Persistence: debounced autosave, serialised saves, atomic write + bounded backups, external-change
  conflict handling, project lock, corrupted-manifest recovery, future-schema rejection.

## Security
contextIsolation, sandbox, no nodeIntegration, CSP, narrow typed preload API, IPC sender + Zod
validation, canonical path containment (traversal/symlink/reserved names), blocked executable
types, network requests blocked in production, no `dangerouslySetInnerHTML` for untrusted content.

## Disclaimer
Educational documentation and decision-support tool — not certified engineering software, not a
solver, not a compliance engine, not a substitute for qualified professional review.

## Out of scope
AI chat, cloud/multiplayer, auth, subscriptions, CAD editing/parametric modelling, FEA/structural
solvers, certification, mobile, web hosting, plugin marketplace.
