import { useMemo } from 'react';
import { Archive, ArchiveRestore, Trash2, X } from 'lucide-react';
import type { Risk, RiskStatus } from '@shared/schemas/project';
import { removeLinksFor } from '@shared/utilities/traceability';
import { IMPACT_LABELS, LIKELIHOOD_LABELS, RISK_SCORE_EXPLANATION, effectiveRiskScore, inherentRiskScore, riskLevel, riskScore } from '@shared/utilities/risk';
import { getTemplate } from '@/templates/templates';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { confirmDialog, navigate } from '@/stores/uiStore';
import { RISK_LEVEL, RISK_STATUS } from '@/lib/labels';
import { Button, Callout, Field, IconButton, Select, StatusPill, TextArea, TextInput } from '@/components/common/ui';
import { LinkManager } from '@/components/traceability/LinkManager';

const RATINGS = [1, 2, 3, 4, 5];

function RatingSelect({ id, value, onChange, labels, label }: { id?: string; value: number; onChange: (v: number) => void; labels: Record<number, string>; label?: string }) {
  return (
    <Select id={id} aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {RATINGS.map((n) => (
        <option key={n} value={n}>
          {n} — {labels[n]}
        </option>
      ))}
    </Select>
  );
}

export function RiskEditor({ risk }: { risk: Risk }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const template = getTemplate(manifest.project.templateId);
  const categories = useMemo(() => {
    const set = new Set<string>(template?.riskCategories ?? []);
    for (const r of manifest.risks) if (r.category.trim()) set.add(r.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'en-CA'));
  }, [manifest.risks, template]);

  const patch = (recipe: (r: Risk) => void) =>
    update((m) => {
      const r = m.risks.find((x) => x.id === risk.id);
      if (!r) return;
      recipe(r as Risk);
      r.modifiedAt = new Date().toISOString();
    });

  const inherent = inherentRiskScore(risk);
  const assessed = risk.residualLikelihood !== null && risk.residualImpact !== null;
  const residual = assessed ? riskScore(risk.residualLikelihood!, risk.residualImpact!) : null;

  const remove = async () => {
    const choice = await confirmDialog({
      title: `Delete ${risk.code}?`,
      message: `${risk.code} “${risk.title}” and its links to requirements and arguments will be permanently deleted. Archive it instead if you only want it out of the way.`,
      confirmLabel: 'Delete risk',
      danger: true
    });
    if (choice !== 'confirm') return;
    navigate({ view: 'risks' });
    update((m) => {
      m.risks = m.risks.filter((x) => x.id !== risk.id);
      m.links = removeLinksFor(m, { type: 'risk', id: risk.id }).links as typeof m.links;
    });
  };

  return (
    <aside aria-label={`Edit ${risk.code}`} className="flex min-h-0 w-full flex-col border-l border-gunmetal bg-carbon lg:w-[420px] lg:shrink-0">
      <div className="flex items-center justify-between gap-2 border-b border-gunmetal px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <span className="font-mono text-crimson-hover">{risk.code}</span>
          {risk.archived ? <span className="text-2xs text-amber">(archived)</span> : null}
        </h2>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="ghost" icon={risk.archived ? ArchiveRestore : Archive} onClick={() => patch((r) => void (r.archived = !r.archived))}>
            {risk.archived ? 'Restore' : 'Archive'}
          </Button>
          <Button size="xs" variant="danger" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
          <IconButton icon={X} label="Close editor" size="sm" onClick={() => navigate({ view: 'risks' })} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <Field label="Title" required>
          {(id) => <TextInput id={id} value={risk.title} onChange={(e) => patch((r) => void (r.title = e.target.value))} />}
        </Field>
        <Field label="Description">
          {(id) => <TextArea id={id} minRows={3} value={risk.description} onChange={(e) => patch((r) => void (r.description = e.target.value))} placeholder="What could go wrong, and why?" />}
        </Field>
        <Field label="Category" hint="Choose a suggestion for this project type or type your own.">
          {(id) => (
            <>
              <TextInput id={id} list={`${id}-cats`} value={risk.category} onChange={(e) => patch((r) => void (r.category = e.target.value))} />
              <datalist id={`${id}-cats`}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <fieldset className="flex flex-col gap-2 rounded-md border border-gunmetal p-3">
          <legend className="px-1 text-xs font-semibold text-white">Inherent risk (before mitigation)</legend>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Likelihood">{(id) => <RatingSelect id={id} value={risk.likelihood} onChange={(v) => patch((r) => void (r.likelihood = v))} labels={LIKELIHOOD_LABELS} />}</Field>
            <Field label="Impact">{(id) => <RatingSelect id={id} value={risk.impact} onChange={(v) => patch((r) => void (r.impact = v))} labels={IMPACT_LABELS} />}</Field>
          </div>
          <p className="font-mono text-xs text-white" aria-live="polite">
            {risk.likelihood} × {risk.impact} = {inherent} ({RISK_LEVEL[riskLevel(inherent)].label})
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-2 rounded-md border border-gunmetal p-3">
          <legend className="px-1 text-xs font-semibold text-white">Residual risk (after mitigation)</legend>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-white">
            <input
              type="checkbox"
              checked={assessed}
              className="h-3.5 w-3.5 accent-[#dc2626]"
              onChange={(e) =>
                patch((r) => {
                  r.residualLikelihood = e.target.checked ? r.likelihood : null;
                  r.residualImpact = e.target.checked ? r.impact : null;
                })
              }
            />
            Residual risk assessed
          </label>
          {assessed ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Residual likelihood">
                  {(id) => <RatingSelect id={id} value={risk.residualLikelihood!} onChange={(v) => patch((r) => void (r.residualLikelihood = v))} labels={LIKELIHOOD_LABELS} />}
                </Field>
                <Field label="Residual impact">
                  {(id) => <RatingSelect id={id} value={risk.residualImpact!} onChange={(v) => patch((r) => void (r.residualImpact = v))} labels={IMPACT_LABELS} />}
                </Field>
              </div>
              <p className="font-mono text-xs text-white" aria-live="polite">
                {risk.residualLikelihood} × {risk.residualImpact} = {residual} ({RISK_LEVEL[riskLevel(residual!)].label})
              </p>
            </>
          ) : (
            <p className="text-xs text-dim">Not assessed. The inherent score ({inherent}) is used for the risk level.</p>
          )}
        </fieldset>

        <div className="flex items-center gap-2 text-xs text-silver">
          Current level: <StatusPill meta={RISK_LEVEL[riskLevel(effectiveRiskScore(risk))]} />
          <span className="font-mono text-white">{effectiveRiskScore(risk)}</span>
        </div>

        <Field label="Mitigation">
          {(id) => <TextArea id={id} minRows={3} value={risk.mitigation} onChange={(e) => patch((r) => void (r.mitigation = e.target.value))} placeholder="Planned or implemented mitigation measures." />}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Owner" hint="Responsible person (optional)">
            {(id) => <TextInput id={id} value={risk.owner} onChange={(e) => patch((r) => void (r.owner = e.target.value))} />}
          </Field>
          <Field label="Status">
            {(id) => (
              <Select id={id} value={risk.status} onChange={(e) => patch((r) => void (r.status = e.target.value as RiskStatus))}>
                {(Object.keys(RISK_STATUS) as RiskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {RISK_STATUS[s].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Notes">{(id) => <TextArea id={id} minRows={2} value={risk.notes} onChange={(e) => patch((r) => void (r.notes = e.target.value))} />}</Field>

        <div className="flex flex-col gap-3 border-t border-gunmetal pt-3">
          <LinkManager source={{ type: 'risk', id: risk.id }} targetType="requirement" emptyText="Not linked to any requirement." />
          <LinkManager source={{ type: 'risk', id: risk.id }} targetType="argument" emptyText="Not linked to any engineering argument." />
        </div>

        <Callout tone="neutral" title="How scores work">
          {RISK_SCORE_EXPLANATION} Numerical risk scores do not establish engineering safety.
        </Callout>
      </div>
    </aside>
  );
}
