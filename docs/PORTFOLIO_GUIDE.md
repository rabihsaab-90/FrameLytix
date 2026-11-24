# FrameLytix Portfolio Guide

A private-ish guide for the project owner: how to explain FrameLytix in an interview, what to demonstrate, and how to describe your role honestly. Replace anything below that does not match what you actually did or know. **Only claim what you can explain and defend.**

## 1. Motivation (suggested wording, edit to be true for you)

Engineering design work is documented in many disconnected places: requirements in one file, scoring in a spreadsheet, calculations in MATLAB, drawings in CAD folders, and reasons in people's heads. When something changes, it is hard to see what it affects, and design decisions are hard to defend later. FrameLytix is an attempt to give those pieces one structure that a student or small team can actually use, on their own computer, with no accounts or cloud.

## 2. How requirements are organised

- Each requirement has a **classification**: *mandatory constraint* (must be met), *design objective* (should be achieved) or *preference* (nice to have).
- It also has a priority, acceptance criterion, target value and unit, verification method, status and verification notes.
- Requirements are grouped into three Phase 1 sections (by default Design Criteria, Load and Safety Constraints, Site and Environment Data).
- "Verified" is only what the user records: it needs verification notes or linked evidence. The app never verifies anything itself.

## 3. Why traceability matters

Traceability answers "why is this design the way it is, and what supports it?". If requirement R depends on decision D, which relies on calculation C and drawing X, then a change to R tells you exactly what to re-check. Missing links are where documentation gaps hide, so FrameLytix shows a matrix and two coverage figures, and lists specific issues (for example "Mandatory requirement REQ-002 is not linked to an engineering argument").

Links are stored once, undirected, in `manifest.links`, so there is only one place to keep consistent.

## 4. How weighted matrices work

Scores run from **1 to 5, and higher is always better** (for cost, 5 means cheapest). Each criterion has a percentage weight.

```
weighted score = Σ(score × weight) ÷ Σ(weight)
```

Worked example from the sample, argument **ARG-001 Truss Configuration Selection**, criteria Cost 30 %, Safety or Strength 40 %, Feasibility 30 % (checked against `samples/pedestrian-truss-bridge/framelytix-project.json`):

| Alternative | Cost (30) | Safety (40) | Feasibility (30) | Calculation | Weighted score |
| --- | --- | --- | --- | --- | --- |
| Pratt truss | 3 | 4 | 4 | 0.3×3 + 0.4×4 + 0.3×4 = 0.9 + 1.6 + 1.2 | **3.70** |
| Warren truss | 5 | 4 | 4 | 1.5 + 1.6 + 1.2 | **4.30** |
| Howe truss | 3 | 3 | 3 | 0.9 + 1.2 + 0.9 | **3.00** |

Details worth knowing:
- A **missing** score is stored as `null` and the alternative is "incomplete"; it never silently counts as zero.
- Weights that do not total 100 still compute (dividing by the actual total) but show a notice; a **Normalize weights** button rescales them. Negative or all-zero weights are errors.
- The score is calculated on demand from the stored data, not saved, so it cannot go out of date.
- A **sensitivity analysis** lets you change weights temporarily to see whether the recommendation holds.
- The score is subjective input made to look orderly. The app says so ("Weighted scoring depends on subjective inputs and is not an independent engineering safety assessment").

## 5. Why mandatory constraints are separate from scoring

Averaging can hide a deal-breaker: a design that is cheap and strong on average but violates a hard limit would still win on points. So pass/fail constraints decide **eligibility** first, and scores rank only what remains.

In the sample:
- **Warren truss** has the highest score (4.30) but **fails REQ-004** (maximum floor-beam spacing of 4.0 m; its 6.0 m panels exceed it), so it is **ineligible**.
- **Pratt truss** (3.70) is the highest-scoring option that has not failed anything, so it is **recommended**. But **REQ-006** (serviceability deflection limit) is still unverified, so the recommendation is labelled **provisional**.
- Howe (3.00) is also provisional, for the same reason.
- The author's selection of Pratt carries a written rationale explaining exactly this. If you choose something other than the recommendation, a rationale is required.

Eligibility rules (from `shared/utilities/decisionMatrix.ts`): any **fail** gives *ineligible*; otherwise any **unverified** (or missing, or "not applicable" without a justification) gives *provisional*; otherwise *eligible*.

## 6. Assumptions

Each argument has a list of key assumptions, and the review flags arguments with none. Calculations have their own assumptions field. The sample is explicit that all its loads and limits are illustrative assumptions.

## 7. Revision history

"Issue revision" stores a full snapshot of the argument and moves to the next code (REV-A, REV-B, ... REV-Z, REV-AA). Restoring an old revision first snapshots the current state, so history only grows. Materially editing an *Approved* argument drops it back to *Under Review*. ARG-001 in the sample is at REV-B with one issued revision. Be honest about the limit: this is **not tamper-proof**; the file is plain JSON that anyone can edit.

## 8. Drawings and decisions

Drawings, models and files are registered as assets (drawing ID, revision, description) and can be linked to requirements, arguments and calculations. That lets you answer "which drawing shows the floor-beam spacing?" (in the sample: DRW-001; evidence record VER-003 is an inspection of that drawing) and see which decisions rely on a file that has gone missing. Missing files are detected on open and listed as critical issues.

## 9. How completeness is measured (exact definitions)

From `shared/utilities/traceability.ts` and `completeness.ts`:

- **Traceability coverage** = requirements linked to at least one *existing, non-archived* argument, calculation, asset or evidence record ÷ **active requirements** (not archived, status not "Not applicable").
- **Evidence coverage** = active requirements linked to at least one evidence record *or* having non-empty verification notes ÷ the same denominator.
- **Documentation completeness** = review-checklist items marked **Complete** ÷ items that are **not** "Not applicable".
- **Requirement completion ratio** (used in project statistics) = (Verified + Not applicable) ÷ active requirements.

If a denominator is zero the figure shows as unavailable instead of 100 %. The app and reports state clearly that these measure *documentation*, not engineering validity. In the sample's screenshot, 9 of 10 requirements have traceability links (90 %) and 4 of 10 have evidence (40 %); the sample leaves gaps on purpose.

## 10. Why local storage, Electron and JSON

- **Local, offline-first:** engineering projects can be confidential, and students often work on laptops without reliable internet. No server means nothing to host, secure or pay for, and no data leaves the machine.
- **Electron:** one TypeScript codebase for the interface and the file access, a mature way to build a Windows desktop app, and built-in tools for PDF output and native file dialogs. The trade-off is a larger download than a native app.
- **A folder plus one JSON file:** easy to back up, zip, copy and put in Git; readable without FrameLytix; diff-friendly because the output is deterministic. The trade-off is that the whole manifest is loaded and rewritten on every save, which suits project-sized data but would not suit very large datasets.

## 11. Native CAD integration

FrameLytix does not parse DWG or STEP. It hands the file to whatever application the operating system associates with it, using Electron's `shell.openPath` (no command string is ever assembled, so no shell injection). Executable and script types are refused. If no app is registered the user gets a clear message. That is a deliberate scope limit: FrameLytix organises and links CAD files; it is not a CAD tool.

## 12. STL visualization

The STL viewer uses three.js through React Three Fiber (loaded only when needed). It renders **on demand**: the scene draws only when the camera or a setting changes, instead of 60 times a second, which saves battery. It handles both ASCII and binary STL, has standard views, a grid, axes and wireframe, shows triangle count and extents, and degrades with a message if WebGL is unavailable or the file is too large. **Caveat:** STL has no units, so dimensions are labelled "model units" unless the user declares a unit, and declaring one does not rescale the model.

## 13. PDF generation

The report is built as HTML, then rendered to PDF using Electron's `printToPDF` in a hidden window that is sandboxed, has JavaScript disabled, and may load only the one temporary file, which is deleted afterwards. The output is checked to begin with `%PDF`. Using HTML for the report means preview, HTML export and PDF export share one source.

## 14. File protection

- **Atomic writes:** write to a temp file, flush, rename over the target; retried on Windows for antivirus/sync locks.
- **Backups** before changing saves; recovery dialog if the manifest is damaged (the broken file is preserved).
- **Project lock** (`lock.json`) to discourage opening one project twice; stale locks handled.
- **Conflict detection:** a SHA-256 hash of the file as last read; if it differs at save time, the user chooses and the other version is backed up.
- **Path containment:** the renderer only sends relative paths; the main process resolves them with `realpath` and refuses anything outside the project (including symlinks/junctions, drive letters, UNC paths, `..`, NTFS streams).
- **Imports copy only**, never overwrite silently, and block executables.

## 15. Limitations to state up front

Not certified engineering software; no structural analysis or code checking; no unit conversion; no preview of native CAD files; revision history not tamper-proof; single-user local app; unsigned installer; macOS configured but untested; CI configured but not yet run (until the repository is published). Saying these plainly is a strength in an interview.

---

## Two-minute recruiter demo script

Prepare: start FrameLytix (sample is a temporary copy, so you can experiment freely). Timings are a rehearsal guide, not measurements.

| # | Time | Action | What to say |
| --- | --- | --- | --- |
| 1 | 0:00 | Launch and select **Load Sample Civil Bridge Project**. | "Fully offline, runs on my laptop. This loads a temporary copy of a fictional footbridge study." |
| 2 | 0:15 | Open **All requirements**. | "Requirements are classified: mandatory constraints, objectives, preferences. 'Verified' only means I recorded evidence." |
| 3 | 0:30 | Open **ARG-001 Truss Configuration Selection**, show the decision matrix. | "Three truss types, weighted criteria 30/40/30, scores 1 to 5, higher is better." |
| 4 | 0:45 | Open **Sensitivity analysis**, change a weight. | "I can test whether the answer is robust. These changes are temporary and not saved." |
| 5 | 1:00 | Show **Mandatory constraint evaluation** and the results summary. | "Warren scores highest at 4.30 but fails the floor-beam spacing requirement, so it is ineligible. Pratt is recommended, but only provisionally because deflection (REQ-006) is unverified." |
| 6 | 1:15 | Open **Supporting calculations**, select CALC-002 (midspan moment). | "Equation typeset, variables, and a restricted evaluator, no code execution. Result is 720 kN·m, no unit conversion, and I say so." |
| 7 | 1:25 | Open **Requirements Traceability**. | "Every requirement against decisions, calculations and drawings, with coverage figures and a list of gaps." |
| 8 | 1:35 | Open the STL model in the explorer. | "Built-in 3D viewer, rendered on demand. STL has no units, so the app makes that explicit." |
| 9 | 1:45 | Open the **GA drawing PDF**. | "Drawings are linked to requirements and evidence." |
| 10 | 1:50 | Open **Report Preview**, select **Export PDF**. | "One click to a design report, with an honest outstanding-items section and a disclaimer." |

Have a backup plan: if the 3D view fails (no WebGL), say so and use the screenshots in `docs/screenshots/`.

## Likely interview questions

**1. What problem does it solve?**
Design information is scattered, so decisions are hard to trace and defend. FrameLytix links requirements, decisions, calculations, drawings and evidence in one local project and shows where the gaps are.

**2. Why not just use Excel and folders?**
You can, and many people do. Excel does not know that a failed mandatory constraint should override a high score, cannot show which requirements lack evidence, and cannot keep a decision's revisions and rationale together with its inputs. The trade-off is that FrameLytix is more structured and less flexible than a spreadsheet.

**3. How does the decision matrix work?**
Weighted sum: Σ(score × weight) ÷ Σ(weight), with 1 to 5 scores where higher is better. For the sample, Pratt is 3.70, Warren 4.30, Howe 3.00. Missing scores stay incomplete rather than becoming zero.

**4. Why keep mandatory constraints out of the score?**
Because a weighted average can compensate a violation with strengths elsewhere. Hard limits should be gates, not points. A failing alternative is ineligible, an unverified one is provisional.

**5. Is it safe to use for real design decisions?**
No. It is educational documentation software, not certified, and it does no structural analysis. A high score or "Approved" status is an internal label. Professional validation stays with qualified people.

**6. Which parts did you write?**
Answer truthfully. A suggested honest answer: "I defined the requirements, the engineering rules (constraints, eligibility, coverage definitions) and the workflow, directed an AI coding assistant to implement them, reviewed the behaviour, and I'm able to explain how each part works. The code itself was largely written by AI." Then be ready to explain the pieces above.

**7. How did you check that it works?**
Describe only what you did: running the app and the sample, checking the matrix arithmetic by hand (for example 3.70 for Pratt), and the automated tests that exist (unit, integration, e2e). Do not cite pass rates or coverage numbers unless you have the results in front of you. Note that CI has not run yet.

**8. Why Electron? Wouldn't a web app be easier?**
It needs to work offline, read and write real folders, open CAD files in other programs and keep confidential data local. Electron provides all of that in one TypeScript codebase. The cost is download size and a need to harden the app, which is why renderers are sandboxed and requests blocked.

**9. How do you protect against losing data?**
Atomic saves, backups before changes, a recovery dialog, a lock against double-opening, and hash-based detection of outside changes. Limits: it is a single-user tool, and backups are not a substitute for copying the project folder.

**10. How would you know it is really offline?**
Network requests from the app window are cancelled in the main process, a content security policy restricts loading, and fonts, the PDF worker and equation rendering are bundled. There is a manual procedure in `docs/OFFLINE_VERIFICATION.md`, and the Playwright tests assert that no http(s) requests occur. (State whether you have actually run the manual check.)

**11. What would you do next?**
Honest candidates: run CI on the first push and fix what it finds, build and test on macOS, code-sign the installer, add unit-aware calculations, add formal migration for future schema versions, and gather feedback from real students. Pick ones you would genuinely pursue.

**12. What are the weaknesses?**
Not certified; no native CAD preview; no unit conversion; the revision history is not tamper-proof; the weighted scoring depends on subjective inputs; the whole manifest is rewritten on every save; unsigned installer; macOS untested; CI unverified until publication; and the code has not had an independent security review.

## Suggested resume bullets

Pick only what is true for you, and adapt the verbs to what you did.

- Designed and directed development of FrameLytix, an offline-first Windows desktop application (Electron, React, TypeScript) for documenting engineering design decisions, using AI-assisted coding.
- Specified the decision logic: weighted decision matrices (scores 1 to 5) with mandatory-constraint eligibility, provisional recommendations and sensitivity analysis.
- Defined a requirements-to-evidence traceability model (requirements, arguments, calculations, drawings, evidence, risks) with measurable documentation-coverage definitions.
- Specified a portable project format (a folder plus a versioned JSON manifest with a Zod schema) with atomic saves, backups, project locking and external-change detection.
- Built-in viewers for PDF, STL 3D models and images; report export to PDF, HTML and CSV; a bundled sample project that opens as a temporary copy.
- Applied Electron security practices: context isolation, sandboxing, typed validated IPC, content security policy, path containment and blocked network requests.
- Wrote documentation and test plans; the repository includes unit, integration and end-to-end test suites. *(Add results only after you have run them.)*

**Disclosure.** State plainly, in the README (already included), on your resume or in interviews, that the code was written with AI assistance while you defined the requirements, engineering logic, validation approach and design decisions. Claim only what you genuinely did and can explain: if you did not run or review something, do not describe it as done. Avoid invented numbers (users, performance, test counts) and do not describe the app as certified, signed, macOS-tested or CI-verified until that is true.
