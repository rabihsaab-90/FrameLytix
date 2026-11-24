# Security policy

## Supported versions

FrameLytix is in **pre-release** development. Only the latest `0.1.x` version receives security
fixes.

| Version | Supported |
| --- | --- |
| 0.1.x (pre-release) | Yes |
| Earlier versions | No |

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do **not** open a public issue, pull request or
discussion for a security problem.

Use GitHub's private vulnerability reporting:

1. Open the repository on GitHub and select the **Security** tab.
2. Select **Report a vulnerability** and describe the problem.

> **Note for the repository owner:** private vulnerability reporting must be enabled in the
> repository settings (**Settings → Code security → Private vulnerability reporting**) before the
> repository is published. Until it is enabled, the **Report a vulnerability** option is not
> available. No email address is published for security reports.

When you report a problem, please include:

- the FrameLytix version and your operating system (for example Windows 11);
- the steps needed to reproduce the problem, using a minimal test project with invented data;
- the expected and actual impact, such as file access outside the project folder or code execution;
- whether the issue is already public anywhere else.

**Do not post exploitable details publicly** (proof-of-concept code, exact payloads or step-by-step
attack instructions) until a fix has been released or the maintainer has agreed to a disclosure
date. Do not include private project data, personal information or credentials in a report.

We will acknowledge reports as soon as we reasonably can, keep you informed of progress, and credit
you in the release notes if you wish.

## Security architecture

FrameLytix is a local-first desktop application. The design aims to keep project data on the user's
computer and to limit what the renderer can do.

**Offline operation**

- The application needs no network access at runtime. Network requests are blocked in production
  builds.
- There are no accounts, no cloud services, and no telemetry.

**Electron hardening**

- `contextIsolation` is enabled and `nodeIntegration` is disabled in every renderer.
- Renderers run in the Electron `sandbox`.
- A Content Security Policy restricts what the renderer can load and execute. Code evaluation
  (`eval`, `new Function`) is not used.
- Navigation is restricted to the application. New windows are not opened for arbitrary URLs.
- Permission requests from web content are denied.
- `webSecurity` is never disabled.

**Typed, validated IPC**

- The renderer reaches the main process only through a narrow, typed preload API
  (`window.framelytix`). Raw `ipcRenderer` access is not exposed.
- The main process checks the sender frame of every IPC call and validates every argument with a
  Zod schema before acting on it.

**File access**

- The main process owns the project root. Renderer requests cannot choose arbitrary paths.
- Paths are resolved to canonical form and checked for containment within the project root. This
  blocks path traversal, symbolic-link escapes and Windows reserved names.
- Executable file types are blocked when files are imported or opened.
- Imported scripts (for example MATLAB `.m` files) are stored and displayed as data. They are never
  executed.

**Previews and rendering**

- Local previews are served through a restricted custom protocol with its own Content Security
  Policy.
- SVG files are rendered only through an `<img>` element, so embedded scripts do not run.
- Report previews are shown in a sandboxed iframe.
- Mathematical equations are rendered with KaTeX with `trust` disabled.
- User content is never inserted with `dangerouslySetInnerHTML`.

**Exports and data integrity**

- CSV exports are protected against spreadsheet formula injection.
- Project saves are atomic (written to a temporary file and then moved into place), with bounded
  backups. A project lock and external-change detection reduce the risk of data loss or silent
  overwrites.
- Projects written by a newer manifest schema are rejected rather than partly read.

## Unsigned builds

The Windows installer and the macOS disk image are **not code-signed** during pre-release
development. Your operating system may show a warning when you run them.

- Download installers only from the official release page of this repository.
- Verify the SHA-256 checksum of the downloaded file against the `.sha256` file attached to the
  release before you run it. For example, in PowerShell:

  ```powershell
  Get-FileHash -Algorithm SHA256 .\FrameLytix-Setup-0.1.0-x64.exe
  ```

- If the checksum does not match, do not run the file. Report it using the process above.

## Scope

Security reports are welcome for FrameLytix itself, including the build and release scripts in this
repository. Problems in third-party packages should be reported to their maintainers, although we
would still like to hear about them if they affect FrameLytix.

FrameLytix is an educational documentation and decision-support tool. It is not certified
engineering software. Security reports about the accuracy of engineering results are handled as
normal defects through the bug report form, not as security issues.
