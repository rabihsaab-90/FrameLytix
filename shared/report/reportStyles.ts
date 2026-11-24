/**
 * Inline stylesheet for the FrameLytix engineering report.
 * White, print-friendly, near-black text, restrained crimson accent. No web fonts, no external URLs.
 */
export const REPORT_FONT_STACK = '"Inter", "Segoe UI", Arial, sans-serif';
export const REPORT_MONO_STACK = '"JetBrains Mono", Consolas, monospace';

const BASE_CSS = `
:root { --ink: #18181b; --muted: #555555; --rule: #d4d4d8; --soft: #f4f4f5; --crimson: #DC2626; --crimson-dark: #991B1B; --amber-bg: #fffbeb; --amber-ink: #92400e; --red-bg: #fef2f2; --green-bg: #f0fdf4; --green-ink: #166534; }
* { box-sizing: border-box; }
html { background: #ffffff; }
body { margin: 0; background: #ffffff; color: var(--ink); font-family: ${REPORT_FONT_STACK}; font-size: 10pt; line-height: 1.45; }
h1 { font-size: 22pt; line-height: 1.15; margin: 0 0 6pt; }
h2 { font-size: 15pt; margin: 22pt 0 8pt; padding-top: 6pt; border-top: 2px solid var(--crimson); }
h3 { font-size: 12pt; margin: 14pt 0 5pt; }
h4 { font-size: 10pt; margin: 10pt 0 4pt; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
p { margin: 0 0 6pt; }
ul, ol { margin: 0 0 6pt; padding-left: 18pt; }
.muted, .meta { color: var(--muted); }
.small { font-size: 8.5pt; }
.mono, code { font-family: ${REPORT_MONO_STACK}; font-size: 0.92em; }
.wordmark { font-weight: 700; letter-spacing: 0.06em; color: var(--crimson); font-size: 11pt; text-transform: uppercase; }
.tagline { color: var(--muted); font-size: 9pt; }
.cover { padding-top: 40pt; border-top: 6px solid var(--crimson); margin-top: 0; }
.cover .subtitle { font-size: 13pt; color: var(--muted); margin-bottom: 18pt; }
.cover dl { margin: 12pt 0; }
.notice { border: 1px solid var(--rule); border-left: 4px solid var(--crimson); background: var(--soft); padding: 8pt 10pt; margin: 10pt 0; break-inside: avoid; }
.notice.strong { font-weight: 700; font-size: 11pt; }
.banner { border: 2px solid var(--amber-ink); background: var(--amber-bg); color: var(--amber-ink); padding: 8pt 10pt; margin: 10pt 0; font-weight: 700; break-inside: avoid; }
.warn { background: var(--amber-bg); color: var(--amber-ink); border: 1px solid #fcd34d; padding: 4pt 8pt; margin: 4pt 0; break-inside: avoid; }
.danger { background: var(--red-bg); color: var(--crimson-dark); border: 1px solid #fca5a5; padding: 4pt 8pt; margin: 4pt 0; break-inside: avoid; }
.toc ol { list-style: none; padding-left: 0; }
.toc li { padding: 2pt 0; border-bottom: 1px dotted var(--rule); }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; table-layout: fixed; }
th, td { border: 1px solid var(--rule); padding: 3pt 5pt; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
th { background: var(--soft); font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tfoot td, tr.total td, tr.total th { font-weight: 700; background: #fafafa; }
table.auto { table-layout: auto; }
dl.kv { display: grid; grid-template-columns: 11em 1fr; gap: 2pt 10pt; margin: 4pt 0 8pt; }
dl.kv dt { color: var(--muted); font-weight: 600; }
dl.kv dd { margin: 0; overflow-wrap: anywhere; }
.badge { display: inline-block; padding: 0 5pt; border: 1px solid currentColor; border-radius: 3pt; font-size: 8.5pt; font-weight: 600; white-space: nowrap; }
.badge-eligible, .badge-pass, .badge-complete, .badge-verified { color: var(--green-ink); }
.badge-provisional, .badge-unverified, .badge-warning, .badge-open { color: var(--amber-ink); }
.badge-ineligible, .badge-fail, .badge-critical, .badge-missing { color: var(--crimson-dark); }
.badge-na, .badge-info, .badge-neutral { color: var(--muted); }
.incomplete { color: var(--crimson-dark); font-style: italic; }
.marker { color: var(--crimson-dark); font-weight: 600; }
.mandatory-list li { border-left: 3px solid var(--crimson); padding-left: 6pt; margin-bottom: 3pt; list-style: none; background: var(--red-bg); }
.mandatory-list { padding-left: 0; }
.equation { margin: 6pt 0; padding: 6pt 8pt; border: 1px solid var(--rule); background: #fff; break-inside: avoid; overflow-x: auto; }
.equation .latex-src { font-family: ${REPORT_MONO_STACK}; font-size: 8pt; color: var(--muted); margin-top: 4pt; overflow-wrap: anywhere; white-space: pre-wrap; }
.equation-error { font-family: ${REPORT_MONO_STACK}; font-size: 9pt; white-space: pre-wrap; overflow-wrap: anywhere; }
.figure-grid { display: flex; flex-wrap: wrap; gap: 10pt; }
figure.thumb { margin: 0; max-width: 45%; break-inside: avoid; }
figure.thumb img { display: block; max-width: 100%; max-height: 6cm; object-fit: contain; border: 1px solid var(--rule); }
figure.thumb figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 2pt; overflow-wrap: anywhere; }
article.argument, article.calculation { margin-bottom: 16pt; }
footer.report-footer { margin-top: 24pt; border-top: 1px solid var(--rule); padding-top: 6pt; color: var(--muted); font-size: 8.5pt; }
@media print {
  thead { display: table-header-group; }
  tr, .avoid-break { break-inside: avoid; }
  h2, h3, h4 { break-after: avoid; }
  section.page-break, article.page-break { break-before: page; page-break-before: always; }
  .cover { break-after: page; page-break-after: always; }
  a { color: inherit; text-decoration: none; }
}
`;

const PREVIEW_CSS = `
html { background: #e4e4e7; }
body.mode-preview { background: #e4e4e7; padding: 24px 12px; }
body.mode-preview .sheet { max-width: 900px; margin: 0 auto; background: #ffffff; padding: 40px 48px; box-shadow: 0 1px 6px rgba(0,0,0,0.25); }
@media print {
  html { background: #ffffff; }
  body.mode-preview { background: #ffffff; padding: 0; }
  body.mode-preview .sheet { max-width: none; padding: 0; box-shadow: none; }
}
`;

const EXPORT_CSS = `
body.mode-export .sheet { margin: 0; padding: 0; }
`;

export function reportCss(mode: 'preview' | 'export'): string {
  return BASE_CSS + (mode === 'preview' ? PREVIEW_CSS : EXPORT_CSS);
}
