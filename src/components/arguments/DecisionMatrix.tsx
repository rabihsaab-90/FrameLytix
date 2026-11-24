/**
 * Weighted decision matrix editor. Presentational: takes the argument, its mandatory
 * requirements and an edit callback. All numbers come from computeMatrix().
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, MessageSquare, Plus, Trash2, Scale } from 'lucide-react';
import type { ArgumentContent, Requirement } from '@shared/schemas/project';
import { computeMatrix, formatScore, normaliseWeights, getScore } from '@shared/utilities/decisionMatrix';
import { OPTIONAL_CRITERIA } from '@shared/utilities/projectFactory';
import { newId } from '@shared/utilities/ids';
import { Badge, Button, Callout, IconButton, Select, StatusPill, TextArea, TextInput, cx } from '@/components/common/ui';
import { ELIGIBILITY } from '@/lib/labels';
import { confirmDialog } from '@/stores/uiStore';
import { WeightInput } from './WeightInput';
import { removeCriterion, upsertScore, type EditFn } from './argumentOps';

const cell = 'border-b border-gunmetal px-3 py-2 align-top text-[13px]';
const headCell = 'border-b border-gunmetal bg-matte px-3 py-2 text-left align-bottom text-xs font-semibold text-white';

export function DecisionMatrix({
  argument,
  mandatory,
  onEdit
}: {
  argument: ArgumentContent;
  mandatory: Requirement[];
  onEdit: EditFn;
}) {
  const result = useMemo(() => computeMatrix(argument, mandatory), [argument, mandatory]);
  const { matrix, alternatives } = argument;
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [addChoice, setAddChoice] = useState('');
  const reqCode = (id: string) => mandatory.find((r) => r.id === id)?.code ?? id;

  const scoreValues: number[] = [];
  for (let v = matrix.scaleMin; v <= matrix.scaleMax; v++) scoreValues.push(v);

  const toggleNote = (key: string) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addCriterion = (choice: string) => {
    if (!choice) return;
    const name = choice === '__custom' ? 'New criterion' : choice;
    onEdit((d) => {
      d.matrix.criteria.push({ id: newId(), name, weight: 0, description: '' });
    });
    setAddChoice('');
  };

  const removeCrit = async (id: string, name: string) => {
    const choice = await confirmDialog({
      title: 'Remove criterion?',
      message: `Remove “${name}” and every score entered against it? This changes the weighted totals.`,
      confirmLabel: 'Remove criterion',
      danger: true
    });
    if (choice === 'confirm') onEdit((d) => removeCriterion(d, id));
  };

  const weightStatus = (() => {
    const onlyNot100 = result.weightIssues.length > 0 && result.weightIssues.every((w) => w.kind === 'not-100');
    if (!result.weightsValid) return { icon: XCircle, tone: 'crimson' as const, text: 'Invalid weights', hint: result.weightIssues[0]?.message };
    if (onlyNot100) return { icon: AlertTriangle, tone: 'amber' as const, text: 'Not 100%', hint: result.weightIssues[0]?.message };
    return { icon: CheckCircle2, tone: 'emerald' as const, text: '100%', hint: undefined };
  })();
  const WIcon = weightStatus.icon;
  const unusedOptional = OPTIONAL_CRITERIA.filter((n) => !matrix.criteria.some((c) => c.name.toLowerCase() === n.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-silver">
        <p>
          Scale {matrix.scaleMin}–{matrix.scaleMax}. <strong className="text-white">Higher scores are always more favourable</strong> — for Cost, {matrix.scaleMax} = most favourable (lowest) cost.
        </p>
        <p className="font-mono text-2xs text-dim">Weighted score = Σ(score × weight) ÷ Σ(weights)</p>
      </div>

      <div className="overflow-x-auto rounded-md border border-gunmetal" tabIndex={-1}>
        <table className="w-full border-separate border-spacing-0 text-left" aria-label="Decision matrix">
          <thead>
            <tr>
              <th scope="col" className={cx(headCell, 'sticky left-0 z-10 min-w-[260px]')}>
                Criterion
              </th>
              <th scope="col" className={cx(headCell, 'w-[110px]')}>
                Weight (%)
              </th>
              {alternatives.map((alt) => {
                const r = result.alternatives.find((a) => a.alternativeId === alt.id);
                const ineligible = r?.eligibility === 'ineligible';
                return (
                  <th key={alt.id} scope="col" data-testid={`alt-col-${alt.id}`} className={cx(headCell, 'min-w-[190px]')}>
                    <span className={cx(ineligible && 'text-dim line-through decoration-crimson')}>{alt.name || 'Unnamed alternative'}</span>
                    {ineligible && r ? (
                      <span className="mt-0.5 block text-2xs font-medium text-[#fca5a5]">
                        Fails {r.failedRequirementIds.map(reqCode).join(', ')}
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.criteria.length === 0 ? (
              <tr>
                <td className={cell} colSpan={2 + alternatives.length}>
                  <span className="text-xs text-dim">No criteria yet. Add at least one weighted criterion below.</span>
                </td>
              </tr>
            ) : null}
            {matrix.criteria.map((c, ci) => (
              <tr key={c.id}>
                <th scope="row" className={cx(cell, 'sticky left-0 z-10 bg-carbon font-normal')}>
                  <div className="flex items-start gap-1.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <TextInput
                        aria-label={`Criterion ${ci + 1} name`}
                        value={c.name}
                        onChange={(e) => onEdit((d) => void (d.matrix.criteria[ci]!.name = e.target.value))}
                      />
                      <TextInput
                        className="h-7 text-xs text-silver"
                        aria-label={`Description of criterion ${c.name}`}
                        placeholder="Description (optional)"
                        value={c.description}
                        onChange={(e) => onEdit((d) => void (d.matrix.criteria[ci]!.description = e.target.value))}
                      />
                    </div>
                    <IconButton icon={Trash2} tone="danger" size="sm" label={`Remove criterion ${c.name}`} onClick={() => void removeCrit(c.id, c.name)} />
                  </div>
                </th>
                <td className={cell}>
                  <WeightInput
                    label={`Weight percentage for ${c.name}`}
                    value={c.weight}
                    onCommit={(v) => onEdit((d) => void (d.matrix.criteria[ci]!.weight = v))}
                  />
                </td>
                {alternatives.map((alt) => {
                  const score = getScore(matrix, alt.id, c.id);
                  const entry = matrix.scores.find((s) => s.alternativeId === alt.id && s.criterionId === c.id);
                  const key = `${alt.id}:${c.id}`;
                  const noteOpen = openNotes.has(key);
                  const outOfRange = score !== null && (score < matrix.scaleMin || score > matrix.scaleMax);
                  const r = result.alternatives.find((a) => a.alternativeId === alt.id);
                  const label = `${alt.name} on ${c.name}`;
                  return (
                    <td key={alt.id} className={cx(cell, r?.eligibility === 'ineligible' && 'opacity-70')}>
                      <div className="flex items-center gap-1">
                        <Select
                          className="w-[72px] font-mono"
                          aria-label={`Score for ${label}`}
                          value={score === null ? '' : String(score)}
                          onChange={(e) => {
                            const v = e.target.value;
                            onEdit((d) => upsertScore(d, alt.id, c.id, { score: v === '' ? null : Number(v) }));
                          }}
                        >
                          <option value="">—</option>
                          {outOfRange ? <option value={String(score)}>{score} (out of range)</option> : null}
                          {scoreValues.map((v) => (
                            <option key={v} value={String(v)}>
                              {v}
                            </option>
                          ))}
                        </Select>
                        <IconButton
                          icon={MessageSquare}
                          size="sm"
                          label={noteOpen ? `Hide score explanation for ${label}` : `Show score explanation for ${label}`}
                          aria-expanded={noteOpen}
                          active={noteOpen || (entry?.rationale ?? '') !== ''}
                          onClick={() => toggleNote(key)}
                        />
                        {score === null ? <span className="text-2xs text-dim">not scored</span> : null}
                      </div>
                      {noteOpen ? (
                        <TextArea
                          minRows={2}
                          className="mt-1.5 text-xs"
                          aria-label={`Score explanation for ${label}`}
                          placeholder="Why this score? Cite evidence or reasoning."
                          value={entry?.rationale ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            onEdit((d) => upsertScore(d, alt.id, c.id, { rationale: v }));
                          }}
                        />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={cx(cell, 'sticky left-0 z-10 bg-matte text-xs font-semibold text-silver')}>
                Weight total
              </th>
              <td className={cx(cell, 'bg-matte')} data-testid="weight-total">
                <span className="font-mono text-white">{Math.round(result.weightTotal * 1000) / 1000}%</span>
              </td>
              <td className={cx(cell, 'bg-matte')} colSpan={Math.max(1, alternatives.length)}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={weightStatus.tone} title={weightStatus.hint}>
                    <WIcon size={11} aria-hidden="true" />
                    {weightStatus.text}
                  </Badge>
                  {weightStatus.hint ? <span className="text-2xs text-silver">{weightStatus.hint}</span> : null}
                  <Button
                    size="xs"
                    variant="outline"
                    icon={Scale}
                    disabled={matrix.criteria.length === 0}
                    title="Scale all weights proportionally so they total 100%. Edit a weight to undo."
                    onClick={() => {
                      const next = normaliseWeights(matrix.criteria);
                      onEdit((d) => void (d.matrix.criteria = next));
                    }}
                  >
                    Normalize weights
                  </Button>
                </div>
              </td>
            </tr>
            <tr>
              <th scope="row" className={cx(cell, 'sticky left-0 z-10 bg-matte text-xs font-semibold text-white')} colSpan={2}>
                Weighted total
              </th>
              {alternatives.map((alt) => {
                const r = result.alternatives.find((a) => a.alternativeId === alt.id);
                return (
                  <td key={alt.id} className={cx(cell, 'bg-matte')} data-testid={`total-${alt.id}`}>
                    {r?.weightedScore !== null && r?.weightedScore !== undefined ? (
                      <span className="font-mono text-sm font-semibold text-white">{formatScore(r.weightedScore)}</span>
                    ) : (
                      <span className="text-xs text-[#fcd34d]">
                        {r && r.missingCount > 0
                          ? `Incomplete — ${r.missingCount} score${r.missingCount === 1 ? '' : 's'} missing`
                          : r && r.invalidCount > 0
                            ? `Incomplete — ${r.invalidCount} invalid score${r.invalidCount === 1 ? '' : 's'}`
                            : 'Incomplete — weights invalid'}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th scope="row" className={cx(cell, 'sticky left-0 z-10 bg-matte text-xs font-semibold text-white')} colSpan={2}>
                Eligibility
              </th>
              {alternatives.map((alt) => {
                const r = result.alternatives.find((a) => a.alternativeId === alt.id);
                return (
                  <td key={alt.id} className={cx(cell, 'bg-matte')} data-testid={`elig-${alt.id}`}>
                    {r ? (
                      <div className="flex flex-col items-start gap-1">
                        <StatusPill meta={ELIGIBILITY[r.eligibility]} />
                        {r.failedRequirementIds.length > 0 ? (
                          <span className="text-2xs text-[#fca5a5]">Fails {r.failedRequirementIds.map(reqCode).join(', ')}</span>
                        ) : null}
                        {r.unverifiedRequirementIds.length > 0 ? (
                          <span className="text-2xs text-[#fcd34d]">Unverified: {r.unverifiedRequirementIds.map(reqCode).join(', ')}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th scope="row" className={cx(cell, 'sticky left-0 z-10 bg-matte text-xs font-semibold text-white')} colSpan={2}>
                Ranking
              </th>
              {alternatives.map((alt) => {
                const r = result.alternatives.find((a) => a.alternativeId === alt.id);
                return (
                  <td
                    key={alt.id}
                    data-testid={`rank-${alt.id}`}
                    className={cx(cell, 'bg-matte', r?.isRecommended && 'outline-2 -outline-offset-2 outline-crimson')}
                  >
                    <div className="flex flex-col items-start gap-1">
                      {r?.isRecommended ? (
                        <Badge tone={result.recommendedIsProvisional ? 'amber' : 'emerald'}>
                          {result.recommendedIsProvisional ? 'Recommended (provisional)' : 'Recommended'}
                        </Badge>
                      ) : null}
                      {r?.isHighestScore ? <Badge tone="info">Highest score</Badge> : null}
                      {r?.isSelected ? <Badge tone="neutral">Selected</Badge> : null}
                      {r && !r.isRecommended && !r.isHighestScore && !r.isSelected ? <span className="text-2xs text-dim">—</span> : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {result.tie ? (
        <Callout tone="amber" icon={AlertTriangle} title="Tie">
          Tie — record a justification for your selection. {alternatives.filter((a) => result.recommendedIds.includes(a.id)).map((a) => a.name).join(' and ')} share the same highest score among the preferred eligibility tier.
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Add criterion" className="w-60" value={addChoice} onChange={(e) => addCriterion(e.target.value)}>
          <option value="">Add criterion…</option>
          {unusedOptional.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="__custom">Custom criterion</option>
        </Select>
        <span className="flex items-center gap-1 text-2xs text-dim">
          <Plus size={11} aria-hidden="true" />A new criterion starts at 0% weight so existing totals are unchanged.
        </span>
      </div>
    </div>
  );
}
