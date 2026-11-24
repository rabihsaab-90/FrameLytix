import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Calculator, CircleAlert, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import type { CalcVariable, Calculation, EntityRef } from '@shared/schemas/project';
import { evaluateCalculation } from '@shared/utilities/expression';
import { removeLinksFor } from '@shared/utilities/traceability';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { confirmDialog, navigate } from '@/stores/uiStore';
import { Badge, Button, Callout, Code, Field, IconButton, Panel, TextArea, TextInput } from '@/components/common/ui';
import { LinkManager } from '@/components/traceability/LinkManager';
import { Equation } from './Equation';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Up to 6 significant digits, no trailing zeros. */
export function formatResult(n: number): string {
  return String(Number(n.toPrecision(6)));
}

export function CalculationEditor({ id }: { id: string }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const [evalError, setEvalError] = useState<string | null>(null);
  const calc = manifest.calculations.find((c) => c.id === id);
  const source: EntityRef = useMemo(() => ({ type: 'calculation', id }), [id]);

  const current = useMemo(() => (calc && calc.resultSource === 'evaluated' ? evaluateCalculation(calc) : null), [calc]);

  if (!calc) {
    return (
      <div className="p-6">
        <Callout tone="amber" icon={TriangleAlert} title="Calculation not found">
          This calculation no longer exists. Select another one from the list.
        </Callout>
      </div>
    );
  }

  const set = (patch: Partial<Calculation>) =>
    update((d) => {
      const c = d.calculations.find((x) => x.id === id);
      if (!c) return;
      Object.assign(c, patch);
      c.modifiedAt = new Date().toISOString();
    });
  const setVar = (i: number, patch: Partial<CalcVariable>) =>
    update((d) => {
      const c = d.calculations.find((x) => x.id === id);
      if (!c || !c.variables[i]) return;
      Object.assign(c.variables[i], patch);
      c.modifiedAt = new Date().toISOString();
    });
  const addVar = () => set({ variables: [...calc.variables, { symbol: '', description: '', value: '', unit: '' }] });
  const removeVar = (i: number) => set({ variables: calc.variables.filter((_, j) => j !== i) });

  const counts = new Map<string, number>();
  for (const v of calc.variables) counts.set(v.symbol, (counts.get(v.symbol) ?? 0) + 1);
  const symbolError = (v: CalcVariable): string | null => {
    if (v.symbol === '') return 'Symbol required';
    if (!IDENTIFIER.test(v.symbol)) return 'Use letters, digits and _ (not starting with a digit)';
    if ((counts.get(v.symbol) ?? 0) > 1) return 'Duplicate symbol';
    return null;
  };

  const evaluate = () => {
    const res = evaluateCalculation(calc);
    if (res.ok) {
      setEvalError(null);
      set({ resultValue: formatResult(res.value), resultSource: 'evaluated' });
    } else {
      setEvalError(res.error);
    }
  };

  const outOfDate = calc.resultSource === 'evaluated' && current?.ok === true && formatResult(current.value) !== calc.resultValue.trim();

  const remove = async () => {
    const choice = await confirmDialog({
      title: `Delete ${calc.code}?`,
      message: 'This permanently deletes the calculation and removes its links to requirements, arguments and files. The linked records themselves are kept. Consider archiving instead.',
      confirmLabel: 'Delete calculation',
      danger: true
    });
    if (choice !== 'confirm') return;
    update((d) => {
      d.calculations = d.calculations.filter((c) => c.id !== id);
      d.links = removeLinksFor(d as never, source).links as never;
    });
    navigate({ view: 'calculations' });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Code className="text-sm text-crimson-hover">{calc.code}</Code>
          {calc.archived ? <Badge tone="amber">Archived</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" icon={calc.archived ? ArchiveRestore : Archive} onClick={() => set({ archived: !calc.archived })}>
            {calc.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </div>

      <Panel title="Definition" bodyClassName="flex flex-col gap-3">
        <Field label="Title" required>
          {(fid) => <TextInput id={fid} value={calc.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} />}
        </Field>
        <Field label="Purpose">
          {(fid) => <TextArea id={fid} minRows={2} value={calc.purpose} onChange={(e) => set({ purpose: e.target.value })} />}
        </Field>
        <Field label="Equation (LaTeX)">
          {(fid) => <TextArea id={fid} mono minRows={2} maxLength={5000} spellCheck={false} value={calc.equation} onChange={(e) => set({ equation: e.target.value })} />}
        </Field>
        <div className="rounded-md border border-gunmetal bg-obsidian px-3 py-2" aria-live="polite">
          <p className="mb-1 text-2xs font-medium tracking-wide text-dim uppercase">Preview</p>
          <Equation latex={calc.equation} />
        </div>
      </Panel>

      <Panel
        title="Variables"
        actions={
          <Button size="xs" icon={Plus} onClick={addVar}>
            Add variable
          </Button>
        }
        bodyClassName="p-0"
      >
        {calc.variables.length === 0 ? (
          <p className="p-4 text-xs text-silver">No variables yet. Add one for each symbol used in the expression.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-2xs tracking-wide text-silver uppercase">
                  <th className="px-3 py-2 font-semibold">Symbol</th>
                  <th className="px-3 py-2 font-semibold">Description</th>
                  <th className="px-3 py-2 font-semibold">Value</th>
                  <th className="px-3 py-2 font-semibold">Unit</th>
                  <th className="w-8 px-1 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {calc.variables.map((v, i) => {
                  const err = symbolError(v);
                  return (
                    <tr key={i} className="border-t border-gunmetal align-top">
                      <td className="w-28 px-3 py-1.5">
                        <TextInput mono aria-label={`Symbol, row ${i + 1}`} aria-invalid={err ? true : undefined} value={v.symbol} maxLength={40} onChange={(e) => setVar(i, { symbol: e.target.value })} />
                        {err ? (
                          <p role="alert" className="mt-0.5 flex items-center gap-1 text-2xs text-[#fca5a5]">
                            <CircleAlert size={10} aria-hidden="true" />
                            {err}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5">
                        <TextInput aria-label={`Description, row ${i + 1}`} value={v.description} maxLength={300} onChange={(e) => setVar(i, { description: e.target.value })} />
                      </td>
                      <td className="w-28 px-3 py-1.5">
                        <TextInput mono aria-label={`Value, row ${i + 1}`} value={v.value} maxLength={100} inputMode="decimal" onChange={(e) => setVar(i, { value: e.target.value })} />
                      </td>
                      <td className="w-24 px-3 py-1.5">
                        <TextInput mono aria-label={`Unit, row ${i + 1}`} value={v.unit} maxLength={40} onChange={(e) => setVar(i, { unit: e.target.value })} />
                      </td>
                      <td className="px-1 py-1.5">
                        <IconButton icon={X} size="sm" tone="danger" label={`Remove variable ${v.symbol || i + 1}`} onClick={() => removeVar(i)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Expression and result" bodyClassName="flex flex-col gap-3">
        <Field
          label="Expression"
          hint="Optional. Restricted arithmetic only (+ − × ÷ ^, parentheses, sqrt, sin, cos, tan, ln, log10, exp, min, max, abs, pi). No code is executed. Units are NOT converted — enter values in consistent units."
        >
          {(fid, d) => (
            <div className="flex items-start gap-2">
              <TextInput id={fid} aria-describedby={d} mono maxLength={1000} spellCheck={false} placeholder="e.g. w*L^2/8" value={calc.expression} onChange={(e) => set({ expression: e.target.value })} />
              <Button icon={Calculator} onClick={evaluate} disabled={calc.expression.trim() === ''}>
                Evaluate
              </Button>
            </div>
          )}
        </Field>
        {evalError ? (
          <Callout tone="crimson" icon={CircleAlert} title="Could not evaluate">
            <span className="font-mono">{evalError}</span>
          </Callout>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Result value">
            {(fid) => <TextInput id={fid} mono value={calc.resultValue} maxLength={100} onChange={(e) => set({ resultValue: e.target.value, resultSource: 'manual' })} />}
          </Field>
          <Field label="Result unit">
            {(fid) => <TextInput id={fid} mono value={calc.resultUnit} maxLength={40} onChange={(e) => set({ resultUnit: e.target.value })} />}
          </Field>
        </div>
        {calc.resultValue.trim() !== '' || calc.resultSource === 'evaluated' ? (
          <div>
            {calc.resultSource === 'evaluated' ? (
              <Badge tone="info">Evaluated (restricted parser, no unit conversion)</Badge>
            ) : (
              <Badge>Manually entered</Badge>
            )}
          </div>
        ) : null}
        {outOfDate ? (
          <Callout tone="amber" icon={TriangleAlert} title="Result is out of date — re-evaluate">
            The expression or variables now give <span className="font-mono">{current?.ok ? formatResult(current.value) : ''}</span>, which differs from the stored result.
          </Callout>
        ) : null}
      </Panel>

      <Panel title="Documentation" bodyClassName="flex flex-col gap-3">
        <Field label="Method">
          {(fid) => <TextArea id={fid} value={calc.method} onChange={(e) => set({ method: e.target.value })} />}
        </Field>
        <Field label="Assumptions">
          {(fid) => <TextArea id={fid} value={calc.assumptions} onChange={(e) => set({ assumptions: e.target.value })} />}
        </Field>
        <Field label="Reference">
          {(fid) => <TextArea id={fid} minRows={2} value={calc.reference} onChange={(e) => set({ reference: e.target.value })} />}
        </Field>
        <Field label="Verification notes">
          {(fid) => <TextArea id={fid} value={calc.verificationNotes} onChange={(e) => set({ verificationNotes: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Revision">
            {(fid) => <TextInput id={fid} mono maxLength={20} value={calc.revision} onChange={(e) => set({ revision: e.target.value })} />}
          </Field>
          <Field label="Author">
            {(fid) => <TextInput id={fid} maxLength={300} value={calc.author} onChange={(e) => set({ author: e.target.value })} />}
          </Field>
        </div>
      </Panel>

      <Panel title="Traceability" bodyClassName="flex flex-col gap-4">
        <LinkManager source={source} targetType="requirement" />
        <LinkManager source={source} targetType="argument" />
        <LinkManager source={source} targetType="asset" label="Supporting files (MATLAB, CSV, PDF…)" />
      </Panel>

      <p className="pb-4 text-2xs text-dim">FrameLytix documents calculations; it is not a certified engineering solver.</p>
    </div>
  );
}
