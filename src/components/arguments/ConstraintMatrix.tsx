/** Mandatory constraint evaluation: requirements × alternatives, each cell Pass/Fail/Unverified/N/A. */
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import type { ArgumentContent, ConstraintResult, Requirement } from '@shared/schemas/project';
import { Button, Code, EmptyState, Select, StatusPill, TextArea, cx } from '@/components/common/ui';
import { CONSTRAINT_RESULT } from '@/lib/labels';
import { upsertEvaluation, type EditFn } from './argumentOps';

const RESULTS = Object.keys(CONSTRAINT_RESULT) as ConstraintResult[];
const cell = 'border-b border-gunmetal px-3 py-2 align-top text-[13px]';
const headCell = 'border-b border-gunmetal bg-matte px-3 py-2 text-left align-bottom text-xs font-semibold text-white';

export function ConstraintMatrix({
  argument,
  mandatory,
  onEdit,
  onGoToRequirements
}: {
  argument: ArgumentContent;
  mandatory: Requirement[];
  onEdit: EditFn;
  onGoToRequirements?: () => void;
}) {
  if (mandatory.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No mandatory requirements are linked"
        message="Link mandatory requirements to this argument (Related requirements). Each one becomes a pass/fail constraint that every alternative is evaluated against."
        action={
          onGoToRequirements ? (
            <Button size="sm" variant="outline" onClick={onGoToRequirements}>
              Go to Related requirements
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (argument.alternatives.length === 0) {
    return <p className="text-xs text-dim">Add alternatives to evaluate them against the mandatory constraints.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-silver">
        A <strong className="text-white">Fail</strong> makes an alternative ineligible regardless of its score. A missing evaluation counts as Unverified. “Not applicable” needs a justification.
      </p>
      <div className="overflow-x-auto rounded-md border border-gunmetal">
        <table className="w-full border-separate border-spacing-0" aria-label="Mandatory constraint evaluation">
          <thead>
            <tr>
              <th scope="col" className={cx(headCell, 'sticky left-0 z-10 min-w-[240px]')}>
                Mandatory requirement
              </th>
              {argument.alternatives.map((alt) => (
                <th key={alt.id} scope="col" className={cx(headCell, 'min-w-[230px]')}>
                  {alt.name || 'Unnamed alternative'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mandatory.map((req) => (
              <tr key={req.id}>
                <th scope="row" className={cx(cell, 'sticky left-0 z-10 bg-carbon font-normal')}>
                  <div className="flex items-start gap-1.5">
                    <ShieldAlert size={13} className="mt-0.5 shrink-0 text-crimson-hover" aria-hidden="true" />
                    <div>
                      <Code className="text-crimson-hover">{req.code}</Code>
                      <p className="text-xs text-white">{req.title}</p>
                      {req.acceptanceCriterion ? <p className="mt-0.5 text-2xs text-dim">{req.acceptanceCriterion}</p> : null}
                    </div>
                  </div>
                </th>
                {argument.alternatives.map((alt) => {
                  const ev = argument.constraintEvaluations.find((e) => e.alternativeId === alt.id && e.requirementId === req.id);
                  const result: ConstraintResult = ev?.result ?? 'unverified';
                  const justification = ev?.justification ?? '';
                  const naMissing = result === 'not-applicable' && justification.trim() === '';
                  const label = `${alt.name} against ${req.code}`;
                  return (
                    <td key={alt.id} className={cell}>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <Select
                            aria-label={`Constraint result for ${label}`}
                            className="min-w-[124px] flex-1"
                            value={result}
                            onChange={(e) => {
                              const v = e.target.value as ConstraintResult;
                              onEdit((d) => upsertEvaluation(d, alt.id, req.id, { result: v }));
                            }}
                          >
                            {RESULTS.map((r) => (
                              <option key={r} value={r}>
                                {CONSTRAINT_RESULT[r].label}
                              </option>
                            ))}
                          </Select>
                          <StatusPill meta={CONSTRAINT_RESULT[result]} showIcon className="shrink-0" />
                        </div>
                        <TextArea
                          minRows={1}
                          className="text-xs"
                          aria-label={`Justification for ${label}`}
                          aria-invalid={naMissing ? true : undefined}
                          placeholder={result === 'not-applicable' ? 'Justification (required)' : 'Justification / evidence (optional)'}
                          value={justification}
                          onChange={(e) => {
                            const v = e.target.value;
                            onEdit((d) => upsertEvaluation(d, alt.id, req.id, { justification: v }));
                          }}
                        />
                        {naMissing ? (
                          <p className="flex items-center gap-1 text-2xs text-[#fcd34d]" role="alert">
                            <AlertTriangle size={11} aria-hidden="true" /> Justification required — treated as unverified.
                          </p>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
