# Privacy

_Effective: 24 November 2026 (FrameLytix 0.1.0)_

FrameLytix is a desktop application that runs entirely on your computer. This notice describes what it stores and where. It applies to the application as distributed from this repository.

## What FrameLytix does not do

- It does not collect, send or sell any personal information or project data.
- It has no accounts, no sign-in, no analytics, no telemetry, no crash reporting, no advertising and no automatic updates.
- The application blocks its own network requests (`http`, `https`, `ws`, `wss`, `ftp`), so project content cannot be sent anywhere by the app.
- The author does not receive any information about who uses FrameLytix or how.

## What FrameLytix stores on your computer

| What | Where | Contents |
|---|---|---|
| Your projects | The folders you choose | The project file `framelytix-project.json`, files you import, and a hidden `.framelytix` folder with a lock file and rolling backups of the project file |
| Settings | `%APPDATA%\FrameLytix\settings.json` (Windows) or `~/Library/Application Support/FrameLytix/settings.json` (macOS) | Your preferences and a list of up to 20 recently opened projects (folder path, title, identifier and date opened) |
| Diagnostic log | `logs\main.log` in the same folder (about 1 MB, plus one older file) | Error and warning messages. These can include file and folder paths, but never project contents |
| Browser engine data | The same folder | Cache and storage folders created by Electron/Chromium, which FrameLytix does not use for personal data |
| Temporary files | Your system temporary folder (`FrameLytix-Demo`, `FrameLytix-Export`) | The demo project copy (removed when you leave the demo or the next time FrameLytix starts) and report files while a PDF is being produced (removed afterwards) |
| Exported reports | Wherever you save them | PDF, HTML and CSV files you choose to export |

All of this stays on your computer unless you copy or share it yourself. If your project folder is inside a synced folder (such as OneDrive, Dropbox or iCloud Drive), that service's own terms apply to the synced copy.

## Your control

- **Delete a project:** delete its folder.
- **Clear the recent projects list and settings:** close FrameLytix and delete `settings.json`.
- **Remove everything after uninstalling:** the Windows uninstaller removes the program but keeps your settings folder. Delete `%APPDATA%\FrameLytix` to remove settings, the log and engine data. Your project folders are never deleted by the uninstaller.

## Sharing projects and reports

Project files and exported reports contain whatever you entered, which may include names of reviewers or authors. Review them before sharing.

## Changes and contact

Changes to this notice are recorded in the repository history and [CHANGELOG.md](CHANGELOG.md). Questions can be raised through the repository's GitHub Issues. Report security problems privately as described in [SECURITY.md](SECURITY.md).
