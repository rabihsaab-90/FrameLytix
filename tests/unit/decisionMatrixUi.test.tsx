// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ArgumentContent } from '@shared/schemas/project';
import { DecisionMatrix } from '@/components/arguments/DecisionMatrix';
import { DecisionSummary } from '@/components/arguments/DecisionSummary';
import type { EditFn } from '@/components/arguments/argumentOps';
import { makeArgument, makeRequirement } from './fixtures/manifestFixture';

afterEach(cleanup);

const req = makeRequirement({ id: 'req-1', code: 'REQ-004', title: 'Span' });

function Harness({ initial }: { initial: ArgumentContent }) {
  const [arg, setArg] = useState(initial);
  const onEdit: EditFn = (recipe) =>
    setArg((prev) => {
      const next = structuredClone(prev);
      recipe(next);
      return next;
    });
  return (
    <>
      <DecisionMatrix argument={arg} mandatory={[req]} onEdit={onEdit} />
      <DecisionSummary argument={arg} mandatory={[req]} onEdit={onEdit} />
    </>
  );
}

const scores = (a: number, b: number) => [
  { alternativeId: 'alt-a', criterionId: 'crit-1', score: a, rationale: '' },
  { alternativeId: 'alt-a', criterionId: 'crit-2', score: a, rationale: '' },
  { alternativeId: 'alt-b', criterionId: 'crit-1', score: b, rationale: '' },
  { alternativeId: 'alt-b', criterionId: 'crit-2', score: b, rationale: '' }
];

describe('decision matrix UI', () => {
  it('shows Incomplete (never 0) for a missing score', () => {
    const arg = makeArgument();
    arg.matrix.scores = scores(5, 3).filter((s) => !(s.alternativeId === 'alt-b' && s.criterionId === 'crit-2'));
    render(<Harness initial={arg} />);
    const total = screen.getByTestId('total-alt-b');
    expect(total.textContent).toMatch(/Incomplete — 1 score missing/);
    expect(total.textContent).not.toMatch(/0\.00/);
    expect(screen.getByTestId('total-alt-a').textContent).toBe('5.00');
  });

  it('updates the weighted total when a score changes', () => {
    const arg = makeArgument();
    arg.matrix.scores = scores(5, 3);
    render(<Harness initial={arg} />);
    expect(screen.getByTestId('total-alt-b').textContent).toBe('3.00');
    // Cost weight 40, Safety 60: changing Cost 3 -> 1 gives (1*40 + 3*60) / 100 = 2.20
    fireEvent.change(screen.getByLabelText('Score for Pratt truss on Cost'), { target: { value: '1' } });
    expect(screen.getByTestId('total-alt-b').textContent).toBe('2.20');
  });

  it('marks a failing top alternative Ineligible and moves Recommended to the next eligible one', () => {
    const arg = makeArgument();
    arg.matrix.scores = scores(5, 3);
    arg.constraintEvaluations = [
      { alternativeId: 'alt-a', requirementId: 'req-1', result: 'fail', justification: '' },
      { alternativeId: 'alt-b', requirementId: 'req-1', result: 'pass', justification: '' }
    ];
    arg.selectedAlternativeId = 'alt-a';
    render(<Harness initial={arg} />);

    expect(within(screen.getByTestId('elig-alt-a')).getByText('Ineligible')).toBeTruthy();
    expect(screen.getByTestId('elig-alt-a').textContent).toMatch(/Fails REQ-004/);
    const rankA = screen.getByTestId('rank-alt-a');
    const rankB = screen.getByTestId('rank-alt-b');
    expect(rankA.textContent).toMatch(/Highest score/);
    expect(rankA.textContent).not.toMatch(/Recommended/);
    expect(rankB.textContent).toMatch(/Recommended/);

    // Summary keeps highest score and recommendation separate, and warns about the selection.
    expect(screen.getByTestId('summary-highest').textContent).toMatch(/Warren truss/);
    expect(screen.getByTestId('summary-recommended').textContent).toMatch(/Pratt truss/);
    expect(screen.getByText(/cannot be presented as the preferred valid design/)).toBeTruthy();
  });
});
