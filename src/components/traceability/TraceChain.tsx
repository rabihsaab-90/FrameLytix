/**
 * "Trace a requirement" panel: the chain Requirement → arguments → calculations → drawings/models →
 * evidence (and risks). Every node is a clickable EntityChip; gaps and broken links are called out in text.
 */
import { ArrowDown, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TraceabilityRow, ResolvedRef } from '@shared/utilities/traceability';
import { navigate } from '@/stores/uiStore';
import { ENTITY_LABEL } from '@/lib/entities';
import { CLASSIFICATION, REQUIREMENT_STATUS } from '@/lib/labels';
import { Badge, Button, Code, DynamicIcon, IconButton, StatusPill, cx } from '@/components/common/ui';
import { EntityChip } from './LinkManager';

export const EVIDENCE_STATUS_LABEL = {
  'has-evidence': { label: 'Evidence linked', tone: 'emerald', icon: 'BadgeCheck' },
  'notes-only': { label: 'Verification notes only', tone: 'amber', icon: 'NotebookPen' },
  missing: { label: 'No evidence', tone: 'crimson', icon: 'CircleAlert' }
} as const;

function Stage({ type, title, refs, missingIds, naNote, optional, children }: { type: keyof typeof ENTITY_LABEL; title: string; refs: ResolvedRef[]; missingIds?: Set<string>; naNote?: string; optional?: boolean; children?: ReactNode }) {
  const empty = refs.length === 0;
  const justified = empty && !!naNote && naNote.trim() !== '';
  return (
    <div
      className={cx(
        'rounded-md border p-2.5',
        empty && !justified && !optional ? 'border-dashed border-crimson/50 bg-crimson/5' : 'border-gunmetal bg-matte/50'
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white">
        <DynamicIcon name={ENTITY_LABEL[type].icon} size={13} className="text-silver" />
        {title}
        <span className="font-mono text-2xs text-dim">{refs.length}</span>
      </div>
      {empty ? (
        justified ? (
          <p className="text-xs text-silver">
            <Badge tone="neutral">Not applicable</Badge> <span className="ml-1">{naNote}</span>
          </p>
        ) : optional ? (
          <p className="text-xs text-dim">None linked.</p>
        ) : (
          <p className="text-xs text-[#fca5a5]">Gap: nothing linked at this step.</p>
        )
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {refs.map((r) => (
            <EntityChip key={r.ref.id} entity={r.ref} missing={missingIds?.has(r.ref.id)} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

const Arrow = () => (
  <div className="flex justify-center py-1 text-dim" aria-hidden="true">
    <ArrowDown size={14} />
  </div>
);

export function TraceChain({ row, onClose }: { row: TraceabilityRow; onClose: () => void }) {
  const r = row.requirement;
  const missingIds = new Set(row.missingAssets.map((m) => m.ref.id));
  const ev = EVIDENCE_STATUS_LABEL[row.evidenceStatus];
  return (
    <aside aria-label={`Trace of ${r.code}`} className="flex min-h-0 w-full flex-col border-l border-gunmetal bg-carbon lg:w-[380px] lg:shrink-0">
      <div className="flex items-center justify-between gap-2 border-b border-gunmetal px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-white">Trace a requirement</h2>
        <IconButton icon={X} label="Close trace panel" size="sm" onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="rounded-md border border-crimson/40 bg-crimson/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Code className="text-crimson-hover">{r.code}</Code>
            <StatusPill meta={CLASSIFICATION[r.classification]} />
            <StatusPill meta={REQUIREMENT_STATUS[r.status]} />
          </div>
          <p className="mt-1 text-[13px] font-medium text-white">{r.title}</p>
          {r.acceptanceCriterion ? <p className="mt-1 text-xs text-silver">Acceptance: {r.acceptanceCriterion}</p> : null}
          {r.targetValue ? (
            <p className="mt-0.5 font-mono text-xs text-silver">
              Target: {r.targetValue} {r.unit}
            </p>
          ) : null}
          <Button size="xs" variant="ghost" className="mt-1.5 -ml-1" onClick={() => navigate({ view: 'requirements', id: r.id })}>
            Open requirement
          </Button>
        </div>
        <Arrow />
        <Stage type="argument" title="Engineering arguments" refs={row.arguments} naNote={r.notApplicableLinks.argument} />
        <Arrow />
        <Stage type="calculation" title="Calculations" refs={row.calculations} naNote={r.notApplicableLinks.calculation} />
        <Arrow />
        <Stage type="asset" title="Drawings and models" refs={row.assets} missingIds={missingIds} naNote={r.notApplicableLinks.asset} />
        <Arrow />
        <Stage type="evidence" title="Verification evidence" refs={row.evidence}>
          <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-silver">
            <DynamicIcon name={ev.icon} size={11} /> {ev.label}
          </p>
          {r.verificationNotes.trim() ? <p className="mt-1 text-xs whitespace-pre-line text-silver">Verification notes: {r.verificationNotes}</p> : null}
        </Stage>
        <div className="mt-3 border-t border-gunmetal pt-3">
          <Stage type="risk" title="Related risks" refs={row.risks} optional />
        </div>
        {row.brokenLinks.length > 0 ? (
          <p className="mt-3 text-xs text-[#fca5a5]" role="alert">
            {row.brokenLinks.length} broken link{row.brokenLinks.length === 1 ? '' : 's'} (deleted or archived records): {row.brokenLinks.map((b) => (b.exists ? b.code : 'deleted record')).join(', ')}.
          </p>
        ) : null}
        <p className="mt-4 text-2xs text-dim">Links show documentation relationships only. They do not demonstrate that a requirement is met.</p>
      </div>
    </aside>
  );
}
