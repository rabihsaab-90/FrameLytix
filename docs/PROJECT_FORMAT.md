# FrameLytix Project Format

A FrameLytix project is an ordinary folder. All structured data is in one human-readable JSON file, `framelytix-project.json` (the *manifest*). Everything else (drawings, models, calculation files, exported reports) is normal files you can open with any program.

The authoritative definition is the Zod schema in `shared/schemas/project.ts`. This page describes schema version **1** (the current version) as written by FrameLytix 0.1.0.

## Folder structure

```
My-Project/
  framelytix-project.json          the manifest (all structured data)
  .gitignore                       optional, written at project creation
  .framelytix/                     local metadata, safe to delete or exclude
    backups/                       manifest-*.json, external-*.json, corrupted-*.json
    lock.json                      present only while the project is open
  01-Scope-and-Requirements/
  02-Engineering-Arguments/
  03-CAD-and-Technical-Drawings/
  04-Design-Review-and-Export/
```

The four numbered phase folders are created from the project template, with template-specific sub-folders. You can add your own folders and files; the explorer shows what is on disk. `.git` and `node_modules` folders are hidden from the explorer, and the root-level manifest and `.framelytix` folder are never listed as project files. Symbolic links are never followed or imported.

The sample project at `samples/pedestrian-truss-bridge/` is a complete example of this layout.

## IDs versus codes

Every record has two identifiers:

- **`id`**: a stable unique identifier (a UUID). It never changes and is what links use internally.
- **`code`**: a short human-readable label such as `REQ-001`, `ARG-001`, `CALC-001`, `VER-001`, `RSK-001`. It is what people see and what reports print.

Assets are the exception: they have an `id` and an optional user-set `drawingId` (for example `DRW-001`); if empty, the file name is shown instead. Records that are not shown by code (links, exports, review items) have only an `id`.

Because links use `id`, you can renumber a code without breaking any relationship.

## Top-level keys

| Key | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `1` | Format version. Must be exactly 1 for this app. |
| `appVersion` | string | FrameLytix version that last saved the file. Updated on each save. |
| `project` | object | Project information (below). |
| `folders` | array of relative paths | Folders created from the template. |
| `requirements` | array | Requirement records. |
| `arguments` | array | Engineering argument records (with revisions). |
| `calculations` | array | Calculation records. |
| `assets` | array | Register of drawings, models and files. |
| `evidence` | array | Verification evidence records. |
| `risks` | array | Risk records. |
| `reviewItems` | array | Design-review checklist items. |
| `links` | array | Relationships between records. |
| `exportHistory` | array | Log of exports (file name and date only). |
| `settings` | object | Per-project settings (report sections, default import folder). |

Array fields default to empty when absent. Text fields have maximum lengths (for example short text 300 characters, long text 50,000).

### `project`

| Field | Meaning |
| --- | --- |
| `id` | Project UUID. |
| `title`, `description` | Name and description. |
| `identifier` | Short project code such as `PTB-2026` (1 to 40 characters). |
| `discipline` | `civil`, `mechanical`, `aerospace`, `electrical` or `custom`. |
| `disciplineLabel` | Display label for the discipline. |
| `templateId`, `archetypeName`, `templateVersion` | The template the project was created from. Templates are *copied* at creation; later template updates never change existing projects. |
| `author`, `organization` | Free text. |
| `unitSystem` | `SI` or `Imperial`. A label only; no conversion is performed. |
| `scope` | Scope statement ("What problem are we solving?"). |
| `summary` | Executive summary used in reports. |
| `sectionLabels` | Names of the three Phase 1 groups: `criteria`, `constraints`, `environment`. |
| `isSample` | `true` only for the bundled educational sample. |
| `createdAt`, `modifiedAt` | ISO 8601 timestamps. |

### `requirements[]`

| Field | Meaning / allowed values |
| --- | --- |
| `id`, `code` | See above. |
| `title`, `description` | Text. |
| `section` | `criteria`, `constraints` or `environment` (which Phase 1 group it sits in). |
| `category` | Free text. |
| `priority` | `high`, `medium` (default), `low`. |
| `classification` | `mandatory` (hard constraint), `objective`, `preference`. |
| `acceptanceCriterion`, `targetValue`, `unit`, `source` | Text. |
| `verificationMethod` | `calculation`, `inspection`, `analysis`, `physical-test`, `simulation`, `document-review` (default), `other`. |
| `status` | `not-started` (default), `in-progress`, `verified`, `needs-revision`, `not-applicable`. |
| `verificationNotes` | How verification was done, as recorded by the user. |
| `notes` | Free text. |
| `notApplicableLinks` | `{argument, calculation, asset}`: a reason why that kind of link does not apply. |
| `archived` | Hidden from counts and matrices when `true`. |
| `createdAt`, `modifiedAt` | Timestamps. |

### `arguments[]`

| Field | Meaning |
| --- | --- |
| `id`, `code`, `title` | Identity. |
| `problemStatement`, `objective` | Text. |
| `alternatives[]` | `{id, name, description}`. |
| `matrix` | `{scaleMin (1), scaleMax (5), criteria[], scores[]}`. |
| `matrix.criteria[]` | `{id, name, weight, description}`. `weight` is a percentage (non-negative number); totals are *validated*, not forced to 100. |
| `matrix.scores[]` | `{alternativeId, criterionId, score, rationale}`. `score` is 1 to 5, or `null` for "not yet scored" (never 0). |
| `constraintEvaluations[]` | `{alternativeId, requirementId, result, justification}`; `result` is `pass`, `fail`, `unverified` or `not-applicable`. |
| `assumptions` | Array of strings. |
| `evidenceSummary` | Text. |
| `selectedAlternativeId` | The chosen alternative's `id`, or `null`. |
| `selectionRationale` | Required (by the review logic) when the selection differs from the recommendation. |
| `justification`, `risksAndLimitations` | Text. |
| `references` | Array of strings. |
| `author`, `reviewer` | Text. |
| `revision` | Current revision code, default `REV-A`. |
| `status` | `draft` (default), `under-review`, `approved`, `needs-revision`. Internal workflow only. |
| `revisions[]` | Issued revisions: `{id, code, timestamp, author, summary, snapshot}`, where `snapshot` is the argument's content at that time (without its own revisions). |
| `archived`, `createdAt`, `modifiedAt` | As above. |

The weighted score, eligibility and recommendation are **not stored**. They are computed every time from the data above, so they can never go stale.

### `calculations[]`

| Field | Meaning |
| --- | --- |
| `id`, `code`, `title`, `purpose` | Identity and description. |
| `equation` | LaTeX source, rendered with KaTeX. |
| `variables[]` | `{symbol, description, value, unit}`; `value` is text. |
| `expression` | Optional restricted arithmetic expression, e.g. `w*L^2/8`. |
| `method`, `assumptions`, `reference`, `verificationNotes` | Text. |
| `resultValue`, `resultUnit` | The recorded result (text). |
| `resultSource` | `manual` (typed) or `evaluated` (computed by the restricted parser). |
| `revision`, `author`, `archived`, `createdAt`, `modifiedAt` | As above. |

### `assets[]`

| Field | Meaning |
| --- | --- |
| `id` | UUID. |
| `drawingId` | Optional label such as `DRW-001`. |
| `title`, `description`, `revision` | Text. |
| `relativePath` | Project-relative path (see below). |
| `modelUnit` | For STL models, the user-declared unit; empty means "model units" (unknown). |
| `sizeBytes`, `fileModifiedAt`, `importedAt` | Size and timestamps recorded at import. |

### `evidence[]`

`{id, code, title, method, summary, outcome, recordedBy, date, createdAt, modifiedAt}`. `method` uses the same values as `verificationMethod`. `outcome` is `supports` (default), `inconclusive` or `does-not-support`.

### `risks[]`

`{id, code, title, description, category, likelihood, impact, residualLikelihood, residualImpact, mitigation, owner, status, notes, archived, createdAt, modifiedAt}`. Ratings are integers 1 to 5; the residual ratings may be `null`. `status` is `open` (default), `mitigating`, `accepted` or `closed`. The score (likelihood × impact) is computed, not stored.

### `reviewItems[]`

`{id, category, text, source, status, naJustification, reviewer, notes, modifiedAt}`.
- `category`: `scope`, `decisions`, `constraints`, `assumptions`, `calculations`, `evidence`, `drawings`, `risks`, `references`, `reporting`.
- `source`: `template` or `custom`.
- `status`: `open` (default), `complete`, `not-applicable`.

### `links[]` (the links model)

Relationships live **only** here, never duplicated on the records themselves. Each link is `{id, a, b, note, createdAt}`, where `a` and `b` are references `{type, id}` and `type` is one of `requirement`, `argument`, `calculation`, `asset`, `evidence`, `risk`.

Links are **undirected**: a link from requirement R to calculation C is the same link as C to R. It is stored once; the app treats a pair that already exists in either order as a duplicate, and a record cannot be linked to itself. Deleting a record removes its links. A link that points to a record that no longer exists is reported as a critical issue.

Traceability and the mandatory constraints shown for an argument are derived from these links: the mandatory requirements evaluated for an argument are the non-archived mandatory requirements linked to it.

### `exportHistory[]`

`{id, format, fileName, description, exportedAt}` with `format` of `pdf`, `html` or `csv`. Absolute paths are deliberately **not** stored, so the manifest contains nothing specific to one computer.

### `settings`

| Field | Meaning |
| --- | --- |
| `reportSections` | Which of the 16 report sections to include: `cover`, `metadata`, `summary`, `scope`, `criteria`, `requirements`, `arguments`, `calculations`, `traceability`, `risks`, `revisions`, `drawings`, `review`, `outstanding`, `references`, `disclaimer`. |
| `defaultAssetFolder` | Default import folder, relative to the root (empty means the CAD and drawings folder). |

## Relative paths

Every path in the manifest (`folders[]`, `assets[].relativePath`, `defaultAssetFolder`) is:

- relative to the project folder,
- written with forward slashes (`/`), even on Windows,
- free of `..` and empty segments, and never absolute or starting with a drive letter.

A file that breaks these rules makes the manifest invalid. This is what makes a project portable between computers and operating systems. Application settings and the recent-projects list (which do contain absolute paths) are stored separately in the app's own data folder, not in the project.

## Deterministic serialisation

FrameLytix writes the manifest with a fixed key order (the order of the schema), two-space indentation and a trailing newline. Saving an unchanged project produces byte-identical output, which keeps Git diffs small and meaningful. FrameLytix reads and writes UTF-8 and tolerates a leading byte-order mark when reading.

Keys that are not in the schema are ignored when reading and are **not written back** on the next save. Do not hand-add custom fields expecting them to survive.

## Schema versioning

`schemaVersion` is currently `1`. If a manifest has a *higher* number than the app supports, FrameLytix refuses to open it and says so, without modifying the file ("Update FrameLytix to open it"). Opening an older version is not an issue yet because only version 1 exists; future versions that change the format will need a migration step. A manifest that fails validation is reported with up to five specific problems and offers backup recovery when backups exist. The early prototype file name `structura-project.json` is not supported.

## Backups and lock files

- **`.framelytix/backups/manifest-<timestamp>.json`**: a copy of the previous manifest, made before a save that changes it (every manual save; autosave at most every 5 minutes). The newest 10 are kept by default (configurable from 3 to 50).
- **`external-<timestamp>.json`**: the version found on disk when you chose to overwrite a file changed outside FrameLytix.
- **`corrupted-<timestamp>.json`**: the damaged manifest, preserved before a restore replaced it.
- The `external-` and `corrupted-` groups are each capped at 20 files.
- **`.framelytix/lock.json`**: records the process, computer name, app version and time while the project is open. It prevents two windows editing the same project. It is removed on a clean close. Stale locks are cleared automatically (same computer with a dead process, or a lock from another computer older than 12 hours).

Backups and the lock file are local metadata and should not be committed to Git.

## Optional `.gitignore`

When enabled at project creation, FrameLytix writes (or extends) a `.gitignore` with:

```
.framelytix/backups/
.framelytix/lock.json
*.tmp
~$*
.DS_Store
Thumbs.db
*.bak
*.dwl
*.dwl2
*.sv$
```

## Moving, zipping and version-controlling projects

- **Move or rename the folder:** safe; paths are relative.
- **Zip and share:** close the project, then zip the folder. Excluding `.framelytix/` is fine.
- **Git:** commit `framelytix-project.json` and your drawing files; ignore the entries above. Because output is deterministic, diffs show real changes. If Git or a sync service changes the manifest while the project is open, FrameLytix detects the change (by comparing a SHA-256 hash) and asks what to do before saving.
- **Large files:** the manifest records file *metadata*, not file contents, so it stays small even for big drawings.

## Trimmed example

This is a shortened excerpt in the style of the bundled sample (several records and fields removed; IDs shortened for readability, real files use full UUIDs).

```json
{
  "schemaVersion": 1,
  "appVersion": "0.1.0",
  "project": {
    "id": "7bd88bf0-...",
    "title": "Pedestrian Truss Bridge — Conceptual Design Study",
    "identifier": "PTB-2026",
    "discipline": "civil",
    "templateId": "civil-bridge",
    "archetypeName": "Bridge Design",
    "unitSystem": "SI",
    "isSample": true
  },
  "folders": ["01-Scope-and-Requirements/Design-Criteria"],
  "requirements": [
    {
      "id": "561ff441-...",
      "code": "REQ-004",
      "title": "Maximum floor-beam spacing of 4.0 m",
      "section": "constraints",
      "classification": "mandatory",
      "status": "verified",
      "verificationMethod": "inspection"
    }
  ],
  "arguments": [
    {
      "id": "…",
      "code": "ARG-001",
      "title": "Truss Configuration Selection",
      "alternatives": [{ "id": "39959ba8-...", "name": "Pratt truss" }],
      "matrix": {
        "scaleMin": 1,
        "scaleMax": 5,
        "criteria": [{ "id": "3f6ce726-...", "name": "Cost", "weight": 30 }],
        "scores": [{ "alternativeId": "39959ba8-...", "criterionId": "3f6ce726-...", "score": 3 }]
      },
      "constraintEvaluations": [
        { "alternativeId": "e8e88152-...", "requirementId": "561ff441-...", "result": "fail" }
      ],
      "selectedAlternativeId": "39959ba8-...",
      "revision": "REV-B",
      "status": "under-review",
      "revisions": []
    }
  ],
  "assets": [
    {
      "id": "…",
      "drawingId": "MOD-001",
      "relativePath": "03-CAD-and-Technical-Drawings/3D-Models/PTB-Pratt-Truss-Concept.stl",
      "modelUnit": "m"
    }
  ],
  "links": [
    {
      "id": "…",
      "a": { "type": "requirement", "id": "561ff441-..." },
      "b": { "type": "argument", "id": "…" },
      "note": ""
    }
  ],
  "exportHistory": [],
  "settings": { "reportSections": ["cover", "summary", "requirements"], "defaultAssetFolder": "" }
}
```
