/**
 * Results & selection summary. Keeps four things visibly separate:
 * highest numerical score, recommended eligible alternative, user-selected alternative,
 * and documentation status.
 */
import { useMemo, type ReactNode } from 'react';
import { ShieldX, Info } from 'lucide-react';
import type { ArgumentContent, Requirement } from '@shared/schemas/project';
import { computeMatrix, formatScore } from '@shared/utilities/decisionMatrix';
import { Callout, Field, Select, StatusPill, TextArea } from '@/components/common/ui';
import { ARGUMENT_STATUS, ELIGIBILITY } from '@/lib/labels';
import type { EditFn } from './argumentOps';

function Row({ label, hint, children, testId }: { label: string; hint?: string; children: ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-gunmetal py-2.5 last:border-b-0 md:grid-cols-[220px_1fr] md:gap-4" data-testid={testId}>
      <dt>
        <span className="text-xs font-semibold text-white">{label}</span>
        {hint ? <span className="block text-2xs text-dim">{hint}</span> : null}
      </dt>
      <dd className="min-w-0 text-[13px] text-silver">{children}</dd>
    </div>
  );
}

export function DecisionSummary({
  argument,
  mandatory,
  onEdit
}: {
  argument: ArgumentContent;
  mandatory: Requirement[];
  onEdit: EditFn;
}) {
  const result = useMemo(() => computeMatrix(argument, mandatory), [argument, mandatory]);
  const reqCode = (id: string) => mandatory.find((r) => r.id === id)?.code ?? id;
  const highest = result.alternatives.filter((a) => a.isHighestScore);
  const recommended = result.alternatives.filter((a) => a.isRecommended);
  const selected = result.alternatives.find((a) => a.isSelected);
  const anyScored = result.alternatives.some((a) => a.weightedScore !== null);

  return (
    <div className="flex flex-col gap-3">
      <dl>
        <Row label="Highest numerical score" hint="Ignores mandatory constraints" testId="summary-highest">
          {highest.length === 0 ? (
            <span className="text-dim">No alternative has a complete set of scores yet.</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {highest.map((a) => (
                <li key={a.alternativeId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{a.name}</span>
                  <span className="font-mono text-white">{formatScore(a.weightedScore)}</span>
                  <StatusPill meta={ELIGIBILITY[a.eligibility]} />
                  {a.eligibility === 'ineligible' ? (
                    <span className="text-2xs text-[#fca5a5]">Fails {a.failedRequirementIds.map(reqCode).join(', ')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Row>

        <Row
          label="Recommended eligible alternative"
          hint="Highest score among alternatives that pass every mandatory constraint"
          testId="summary-recommended"
        >
          {recommended.length === 0 ? (
            <span className="text-dim">
              {anyScored ? 'None — no alternative is currently eligible for recommendation.' : 'None yet — complete the matrix to see a recommendation.'}
            </span>
          ) : (
            <ul className="flex flex-col gap-1">
              {recommended.map((a) => (
                <li key={a.alternativeId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{a.name}</span>
                  <span className="font-mono text-white">{formatScore(a.weightedScore)}</span>
                  <StatusPill meta={ELIGIBILITY[a.eligibility]} />
                  {result.recommendedIsProvisional ? <span className="text-2xs text-[#fcd34d]">Provisional — constraints still unverified</span> : null}
                </li>
              ))}
              {result.tie ? <li className="text-2xs text-[#fcd34d]">Tie — record a justification for your selection.</li> : null}
            </ul>
          )}
        </Row>

        <Row label="User-selected alternative" hint="The option you are putting forward" testId="summary-selected">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="w-64"
                aria-label="User-selected alternative"
                value={result.selectedId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onEdit((d) => void (d.selectedAlternativeId = v === '' ? null : v));
                }}
              >
                <option value="">— None selected —</option>
                {argument.alternatives.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || 'Unnamed alternative'}
                  </option>
                ))}
              </Select>
              {selected ? <StatusPill meta={ELIGIBILITY[selected.eligibility]} /> : null}
              {selected ? <span className="font-mono text-white">{formatScore(selected.weightedScore)}</span> : null}
            </div>
            {result.selectionIsIneligible && selected ? (
              <Callout tone="crimson" icon={ShieldX} title="Selected alternative is ineligible">
                This alternative fails mandatory constraint(s) {selected.failedRequirementIds.map(reqCode).join(', ')} and cannot be presented as the preferred valid design. You may still record it, but the warning remains.
              </Callout>
            ) : null}
            <Field
              label={result.selectionDiffersFromRecommendation ? 'Selection rationale' : 'Selection rationale (optional)'}
              required={result.selectionDiffersFromRecommendation}
              error={result.selectionNeedsRationale ? 'A selection rationale is required because the selected alternative is not the recommended one.' : null}
              hint={result.selectionNeedsRationale ? undefined : 'Explain why this option is selected, especially when it is not the highest-scoring eligible alternative.'}
            >
              {(id, describedBy) => (
                <TextArea
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={result.selectionNeedsRationale ? true : undefined}
                  minRows={2}
                  value={argument.selectionRationale}
                  onChange={(e) => {
                    const v = e.target.value;
                    onEdit((d) => void (d.selectionRationale = v));
                  }}
                />
              )}
            </Field>
          </div>
        </Row>

        <Row label="Documentation status" hint="Internal workflow status only" testId="summary-status">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill meta={ARGUMENT_STATUS[argument.status]} />
            <span className="text-2xs text-dim">Internal workflow status only — not certification or safety approval.</span>
          </div>
        </Row>
      </dl>

      {result.messages.length > 0 ? (
        <div className="rounded-md border border-gunmetal bg-obsidian px-3 py-2">
          <p className="mb-1 text-xs font-semibold text-white">Calculation notes</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-silver">
            {result.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Callout tone="neutral" icon={Info}>
        Weighted scoring depends on subjective inputs and is not an independent engineering safety assessment.
      </Callout>
    </div>
  );
}
