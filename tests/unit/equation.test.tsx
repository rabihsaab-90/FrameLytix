// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Equation } from '@/components/calculations/Equation';

describe('Equation', () => {
  it('renders KaTeX for valid LaTeX', () => {
    const { container } = render(<Equation latex="\sigma = \frac{F}{A}" />);
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('shows a clear message for invalid LaTeX', () => {
    const { getByRole, container } = render(<Equation latex="\frac{1}{" />);
    expect(getByRole('alert').textContent).toMatch(/^Equation could not be rendered: /);
    expect(container.querySelector('.katex')).toBeNull();
  });

  it('does not emit javascript: anchors (trust is disabled)', () => {
    const { container } = render(<Equation latex="\href{javascript:alert(1)}{x}" />);
    const anchors = Array.from(container.querySelectorAll('a'));
    expect(anchors.some((a) => (a.getAttribute('href') ?? '').toLowerCase().startsWith('javascript:'))).toBe(false);
    expect(container.innerHTML.toLowerCase()).not.toContain('href="javascript:');
  });
});
