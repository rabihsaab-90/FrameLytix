# Contributing to FrameLytix

Thank you for helping improve FrameLytix. It is an offline-first desktop workspace for engineering
design: requirements, engineering arguments, decision matrices, calculations, traceability, risks
and reports. Please read the [Security policy](SECURITY.md) and the scope notes below before you
start a change.

## Ground rules

- FrameLytix is **offline-first**. Do not add accounts, servers, cloud sync, telemetry, paid or AI
  APIs, or any network traffic at runtime.
- Keep the scope within the product specification (`PROJECT_SPEC.md`). Out of scope: AI chat,
  cloud or multiplayer features, authentication, subscriptions, CAD editing or parametric
  modelling, FEA or structural solvers, certification features, mobile, web hosting and plugin
  marketplaces.
- FrameLytix is a documentation and decision-support tool. Never add code that fabricates metrics,
  verification, approvals or code compliance.
- Use Canadian English in all user-facing text and documentation (for example *licence*,
  *behaviour*, *colour*, *organise*).

## Development setup

Requirements:

- Node.js **26** (the version in `.nvmrc`), with npm 11.
- Windows 11 is the primary platform. macOS is a secondary validation platform.

```powershell
git clone <your fork or the repository URL>
cd FrameLytix
npm ci
npm run dev
```

Use `npm ci` rather than `npm install` so that the versions in `package-lock.json` are used.
If `node` is not found in a fresh PowerShell session, refresh the PATH first:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Electron app in development mode (main, preload and renderer with hot reload). |
| `npm run build` | Builds the main, preload and renderer bundles. |
| `npm run lint` | Runs ESLint with the flat configuration. |
| `npm run typecheck` | Runs TypeScript for the Node and web configurations. |
| `npm test` | Runs unit and integration tests with Vitest. |
| `npm run test:e2e` | Builds the app and runs the Playwright Electron tests. |
| `npm run check` | Runs lint, typecheck, tests and build. Run this before opening a pull request. |
| `npm run dist:win` | Builds the Windows NSIS installer into `release/`. It never publishes. |
| `npm run dist:mac` | Builds the macOS DMG (unsigned). It never publishes. |

## Project layout

- `shared/schemas/project.ts`: the Zod manifest schema. It is the single authoritative data model.
- `shared/types/ipc.ts`: the typed IPC contract (`FramelytixApi` and channel names). Change the
  contract here first.
- `shared/utilities/`: pure, tested logic (decision matrix, traceability, completeness, risk,
  revisions, identifiers, CSV and HTML escaping, paths, expression parser, project factory).
- `shared/report/`: the pure HTML report builder used for preview, HTML and PDF output.
- `src/templates/templates.ts`: the engineering project archetypes (pure data, typed by
  `src/templates/types.ts`).
- `src/config/branding.ts`: application name, version, manifest file name, colours and disclaimer.
- `electron/`: the main process. `main.ts`, `preload.ts`, `ipc/`, `services/` (Node file system
  logic with no `electron` import, so it can be tested), and `security/`.
- `src/`: the React renderer. `stores/` (Zustand with Immer), `components/<area>/`, `pages/`,
  `hooks/` and `styles/`.
- `tests/unit/`, `tests/integration/` and `tests/e2e/`: the test suites.

## Coding conventions

- **Strict TypeScript.** Do not use `any` to silence errors. Keep `npm run typecheck` clean.
- **Pure logic lives in `shared/utilities/`** and must have unit tests. Keep Electron and React
  imports out of pure modules.
- **The renderer talks to the main process only through `window.framelytix`** (see
  `src/lib/api.ts`). Do not expose `ipcRenderer` or Node.js APIs to the renderer.
- **Validate every IPC argument with Zod**, and check the sender frame in the main process.
- **Do not use `eval`, `new Function`, or `dangerouslySetInnerHTML` with user content.** The only
  exception is KaTeX output rendered with `trust: false` in `components/calculations/Equation.tsx`.
- **Constrain file operations to the project root** through `electron/security/paths.ts`. Never
  weaken `webSecurity`, the sandbox, the Content Security Policy or context isolation.
- **Use the design tokens** defined in the Tailwind theme (`src/styles/index.css`). Use the
  monospace font for identifiers, paths, equations and numbers.
- **Do not add dependencies** without a clear reason. Discuss new dependencies in the issue first.
- **Decision matrix rules:** scores are 1 to 5 with higher values more favourable (cost included).
  Missing scores remain incomplete and are never treated as 0.

## Testing requirements

- Add or adjust tests with every behaviour change. Bug fixes should include a test that fails
  without the fix.
- Never skip, disable or weaken a failing test to make the build pass. Fix the code or explain the
  problem in the pull request.
- Tests must be deterministic. Use fixtures and temporary directories created with `os.tmpdir()`.
  Tests must never read or modify real user projects.
- Before you open a pull request, run `npm run check`.

## How to add a project template

Templates are defined in `src/templates/templates.ts`. The header comment of that file contains the
full rules. In short:

1. Append a new `ProjectTemplate` object to the template list. Give it a **new, unique, kebab-case
   `id`**, for example `civil-tunnel-lining`.
2. Fill every field of `ProjectTemplate` (see `src/templates/types.ts`) with content specific to
   the archetype: the four phase folders, requirements across all three sections, decisions,
   calculations, deliverables, risks and review items.
3. Give each weighted criterion a weight. The weights in each decision matrix must **sum to 100**.
4. Do not copy another archetype and rename it. The test suite rejects duplicated requirement lists.
5. **Never change an existing `id`** once it has shipped. Projects store the id and version.
6. When you change the content of an existing template, **bump its `version`** (semantic
   versioning).
7. Do not invent numeric limits, standard clause numbers or compliance claims. Acceptance criteria
   are editable prompts that ask the team to identify the governing code and enter values.
8. Templates are copied into a project when it is created. Template updates never modify existing
   projects, so explain this in the pull request if your change affects user-visible content.
9. Run the template tests before committing:

   ```powershell
   npx vitest run tests/unit/templates.test.ts
   ```

## Pull requests

- Keep each pull request focused on one change, and link the related issue.
- Fill in the pull request template, including the tests you ran.
- Include screenshots or a short recording for visual changes.
- Call out any change to the manifest schema (`shared/schemas/project.ts`), the IPC contract
  (`shared/types/ipc.ts`) or other data formats. These changes need a migration or compatibility
  note.
- Do not commit local project data, generated installers (`release/`), or personal files.
- Respond to review comments in the pull request, and push fixes as new commits.

## Reporting defects

Report defects through [GitHub issues](../../issues) using the **Bug report** form. The form asks
for the application version, your operating system, steps to reproduce and relevant logs.

**Do not attach private project data.** Engineering projects can contain confidential designs,
client information and personal data. Create a minimal example with invented values instead, and
remove personal information from logs and screenshots before posting.

For security vulnerabilities, do **not** use public issues. Follow the [Security policy](SECURITY.md).

## AI-assisted development

FrameLytix was developed with AI assistance. We value transparency about this. If you use AI tools
to help prepare a contribution, you are responsible for the result. Review and understand every line
you submit, run the tests, and be able to explain the design choices in the pull request. Do not
submit code, text or data that you have not checked, and do not include confidential material in
prompts.

## Licence

By contributing, you agree that your contribution is licensed under the MIT License in
[LICENSE](LICENSE).
