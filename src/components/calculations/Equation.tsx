import { useMemo } from 'react';
import katex from 'katex';

/** Upper bound on LaTeX input rendered live (the schema already caps at 5000 characters). */
const MAX_LATEX_LENGTH = 5000;

type Rendered = { ok: true; html: string } | { ok: false; message: string };

export function renderLatex(latex: string): Rendered {
  try {
    const html = katex.renderToString(latex.slice(0, MAX_LATEX_LENGTH), {
      throwOnError: true,
      trust: false,
      strict: 'warn',
      displayMode: true,
      maxSize: 20,
      maxExpand: 500,
      output: 'htmlAndMathml'
    });
    return { ok: true, html };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, message: raw };
  }
}

/**
 * Live KaTeX preview of a LaTeX equation.
 *
 * This is the ONE place in the app that uses dangerouslySetInnerHTML. It is acceptable
 * because the markup comes exclusively from katex.renderToString with `trust: false`
 * (so \href, \url, \includegraphics, \htmlClass etc. are refused and never emitted as
 * live links or attributes), the input length is bounded, and `maxSize`/`maxExpand`
 * limit resource use. Never pass anything other than KaTeX output to it.
 */
export function Equation({ latex, className }: { latex: string; className?: string }) {
  const result = useMemo(() => (latex.trim() === '' ? null : renderLatex(latex)), [latex]);

  if (!result) {
    return <p className="text-xs text-dim">Enter a LaTeX equation to see a preview.</p>;
  }
  if (!result.ok) {
    return (
      <p role="alert" className="font-mono text-[12px] break-words text-[#fca5a5]">
        Equation could not be rendered: {result.message}
      </p>
    );
  }
  return (
    <div
      className={className ?? 'overflow-x-auto py-1 text-white'}
      aria-label="Equation preview"
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}
