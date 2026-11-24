/**
 * Sensitivity analysis: temporary weight adjustments held in local state only.
 * Saved data changes only after the user confirms "Apply these weights…".
 */
import { useMemo, useState } from 'react';
import { RotateCcw, ArrowRightLeft } from 'lucide-react';
import type { ArgumentContent, Requirement } from '@shared/schemas/project';
import { computeMatrix, formatScore } from '@shared/utilities/decisionMatrix';
import { Button, Callout, StatusPill, th, td } from '@/components/common/ui';
import { ELIGIBILITY } from '@/lib/labels';
import { confirmDialog } from '@/stores/uiStore';
import { WeightInput } from './WeightInput';
import type { EditFn } from './argumentOps';

export function SensitivityPanel({
  argument,
  mandatory,
  onEdit
}: {
  argument: ArgumentContent;
  mandatory: Requirement[];
  onEdit: EditFn;
}) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const current = useMemo(() => computeMatrix(argument, mandatory), [argument, mandatory]);
  const adjusted = useMemo(() => computeMatrix(argument, mandatory, overrides), [argument, mandatory, overrides]);
  const changedIds = argument.matrix.criteria.filter((c) => overrides[c.id] !== undefined && overrides[c.id] !== c.weight).map((c) => c.id);
  const dirty = changedIds.length > 0;
  const adjTotal = argument.matrix.criteria.reduce((s, c) => s + (overrides[c.id] ?? c.weight), 0);

  const names = (ids: string[]) => argument.alternatives.filter((a) => ids.includes(a.id)).map((a) => a.name).join(' and ') || 'none';
  const sameRec = current.recommendedIds.join('|') === adjusted.recommendedIds.join('|');

  const apply = async () => {
    const choice = await confirmDialog({
      title: 'Apply adjusted weights?',
      message: 'This overwrites the saved criterion weights with the adjusted values. This is a material change to the decision matrix and may return an approved argument to Under Review.',
      confirmLabel: 'Apply weights',
      danger: true
    });
    if (choice !== 'confirm') return;
    const snapshot = { ...overrides };
    onEdit((d) => {
      for (const c of d.matrix.criteria) {
        const v = snapshot[c.id];
        if (v !== undefined) c.weight = v;
      }
    });
    setOverrides({});
  };

  if (argument.matrix.criteria.length === 0 || argument.alternatives.length === 0) {
    return <p className="text-xs text-dim">Add alternatives and criteria to explore how sensitive the result is to the weights.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-silver">
        Adjust weights to test how robust the recommendation is. Changes here are temporary and are <strong className="text-white">not saved</strong> unless you apply them.
      </p>
      <div className="overflow-x-auto rounded-md border border-gunmetal">
        <table className="w-full border-separate border-spacing-0" aria-label="Sensitivity weights">
          <thead>
            <tr>
              <th className={th}>Criterion</th>
              <th className={th}>Saved (%)</th>
              <th className={th}>Adjusted (%)</th>
              <th className={th}>Slider</th>
            </tr>
          </thead>
          <tbody>
            {argument.matrix.criteria.map((c) => {
              const value = overrides[c.id] ?? c.weight;
              return (
                <tr key={c.id}>
                  <td className={td}>{c.name}</td>
                  <td className={`${td} font-mono text-silver`}>{c.weight}</td>
                  <td className={td}>
                    <WeightInput label={`Adjusted weight for ${c.name}`} value={value} onCommit={(v) => setOverrides((o) => ({ ...o, [c.id]: v }))} />
                  </td>
                  <td className={td}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      aria-label={`Adjusted weight slider for ${c.name}`}
                      value={Math.min(100, Math.max(0, value))}
                      onChange={(e) => setOverrides((o) => ({ ...o, [c.id]: Number(e.target.value) }))}
                      className="w-40 accent-[#dc2626]"
                    />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className={`${td} text-xs font-semibold text-silver`}>Total</td>
              <td className={`${td} font-mono`}>{Math.round(current.weightTotal * 1000) / 1000}</td>
              <td className={`${td} font-mono`} colSpan={2}>
                {Math.round(adjTotal * 1000) / 1000}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-md border border-gunmetal">
        <table className="w-full border-separate border-spacing-0" aria-label="Sensitivity results">
          <thead>
            <tr>
              <th className={th}>Alternative</th>
              <th className={th}>Saved score</th>
              <th className={th}>Adjusted score</th>
              <th className={th}>Eligibility</th>
            </tr>
          </thead>
          <tbody>
            {adjusted.alternatives.map((a) => {
              const cur = current.alternatives.find((x) => x.alternativeId === a.alternativeId);
              return (
                <tr key={a.alternativeId}>
                  <td className={td}>
                    {a.name}
                    {a.isRecommended ? <span className="ml-2 text-2xs text-[#6ee7b7]">recommended when adjusted</span> : null}
                  </td>
                  <td className={`${td} font-mono`}>{cur?.weightedScore != null ? formatScore(cur.weightedScore) : 'Incomplete'}</td>
                  <td className={`${td} font-mono`}>{a.weightedScore !== null ? formatScore(a.weightedScore) : 'Incomplete'}</td>
                  <td className={td}>
                    <StatusPill meta={ELIGIBILITY[a.eligibility]} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-1 gap-1 text-xs md:grid-cols-[180px_1fr]">
        <dt className="text-silver">Current recommendation</dt>
        <dd className="text-white">
          {names(current.recommendedIds)}
          {current.recommendedIsProvisional && current.recommendedIds.length > 0 ? ' (provisional)' : ''}
        </dd>
        <dt className="text-silver">Adjusted recommendation</dt>
        <dd className="text-white">
          {names(adjusted.recommendedIds)}
          {adjusted.recommendedIsProvisional && adjusted.recommendedIds.length > 0 ? ' (provisional)' : ''}
        </dd>
      </dl>
      {dirty && !sameRec ? (
        <Callout tone="amber" icon={ArrowRightLeft} title="The recommendation changes">
          With these weights the recommended alternative changes from {names(current.recommendedIds)} to {names(adjusted.recommendedIds)}. The decision is sensitive to the weighting.
        </Callout>
      ) : dirty ? (
        <Callout tone="info">The recommended alternative does not change with these weights.</Callout>
      ) : null}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" icon={RotateCcw} disabled={!dirty} onClick={() => setOverrides({})}>
          Reset
        </Button>
        <Button size="sm" variant="primary" disabled={!dirty} onClick={() => void apply()}>
          Apply these weights…
        </Button>
      </div>
    </div>
  );
}
