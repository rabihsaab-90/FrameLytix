## Summary

<!-- What does this pull request change, and why? Keep it focused on one change. -->

## Related issue

<!-- For example: Closes #123. Write "None" if there is no related issue. -->

## Tests performed

<!-- Tick what you ran locally. Explain any item you did not run. -->

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run test:e2e`
- [ ] Added or adjusted tests for this change (no failing tests were skipped or disabled)
- [ ] Tested manually on Windows
- [ ] Tested manually on macOS (if applicable)

## Screenshots

<!-- Required for visual changes: before and after screenshots, or a short recording. Remove personal data and project contents first. Write "Not applicable" otherwise. -->

## Security or data-format implications

<!-- Answer each item. Write "None" where the answer is no. -->

- Manifest schema changes (`shared/schemas/project.ts`), and any migration or compatibility note:
- IPC contract changes (`shared/types/ipc.ts`), and any change to Zod validation or sender checks:
- File access, path containment or executable-type handling changes:
- New network access, dependencies or bundled assets (with licence information):

## Checklist

- [ ] The change stays within the product scope in `PROJECT_SPEC.md` (offline, no telemetry, no accounts)
- [ ] Renderer still reaches main only through `window.framelytix`, and no new `eval`, `new Function` or `dangerouslySetInnerHTML` with user content
- [ ] User-facing text and documentation use Canadian English
- [ ] No private project data, personal information, credentials or generated installers are included
- [ ] Documentation (CONTRIBUTING.md, CHANGELOG.md under Unreleased) is updated where needed
- [ ] I have reviewed and understand every line of this change
