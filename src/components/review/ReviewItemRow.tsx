import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { ReviewItem, ReviewItemStatus } from '@shared/schemas/project';
import { useProjectStore } from '@/stores/projectStore';
import { confirmDialog } from '@/stores/uiStore';
import { REVIEW_STATUS } from '@/lib/labels';
import { Badge, DynamicIcon, IconButton, TextArea, TextInput, cx } from '@/components/common/ui';

const STATUSES: ReviewItemStatus[] = ['open', 'complete', 'not-applicable'];

export function ReviewItemRow({ item }: { item: ReviewItem }) {
  const update = useProjectStore((s) => s.update);
  const [expanded, setExpanded] = useState(false);
  const needsJustification = item.status === 'not-applicable' && item.naJustification.trim() === '';

  const patch = (recipe: (i: ReviewItem) => void) =>
    update((m) => {
      const it = m.reviewItems.find((x) => x.id === item.id);
      if (!it) return;
      recipe(it as ReviewItem);
      it.modifiedAt = new Date().toISOString();
    });

  const remove = async () => {
    const choice = await confirmDialog({
      title: 'Delete checklist item?',
      message:
        item.source === 'template'
          ? `“${item.text}” comes from the project template. Deleting it removes it from this project only. Marking it Not applicable (with a justification) keeps a record instead.`
          : `“${item.text}” will be permanently deleted.`,
      confirmLabel: 'Delete item',
      danger: true
    });
    if (choice === 'confirm') update((m) => void (m.reviewItems = m.reviewItems.filter((x) => x.id !== item.id)));
  };

  return (
    <li className="border-b border-gunmetal px-3 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[13px] text-white">{item.text}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={item.source === 'template' ? 'neutral' : 'info'}>{item.source === 'template' ? 'Template' : 'Custom'}</Badge>
            {item.notes.trim() !== '' && !expanded ? <span className="text-2xs text-dim">Has notes</span> : null}
            {needsJustification ? (
              <span className="inline-flex items-center gap-1 text-2xs text-amber" role="alert">
                <AlertTriangle size={11} aria-hidden="true" /> Not applicable needs a justification
              </span>
            ) : null}
          </div>
        </div>
        <div role="radiogroup" aria-label={`Status of: ${item.text}`} className="flex shrink-0 overflow-hidden rounded-md border border-gunmetal">
          {STATUSES.map((s) => {
            const meta = REVIEW_STATUS[s];
            const on = item.status === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => patch((i) => void (i.status = s))}
                className={cx(
                  'flex h-7 items-center gap-1 border-r border-gunmetal px-2 text-2xs font-medium last:border-r-0',
                  on ? 'bg-matte text-white ring-1 ring-inset ring-crimson/60' : 'text-silver hover:bg-matte hover:text-white'
                )}
              >
                <DynamicIcon name={meta.icon} size={12} />
                {meta.label}
              </button>
            );
          })}
        </div>
        <TextInput
          aria-label="Reviewer name"
          placeholder="Reviewer"
          value={item.reviewer}
          onChange={(e) => patch((i) => void (i.reviewer = e.target.value))}
          className="h-7 w-36 text-xs"
        />
        <div className="flex items-center">
          <IconButton icon={expanded ? ChevronDown : ChevronRight} label={expanded ? 'Hide notes' : 'Show notes'} size="sm" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} />
          <IconButton icon={Trash2} label="Delete item" size="sm" tone="danger" onClick={() => void remove()} />
        </div>
      </div>
      {item.status === 'not-applicable' ? (
        <div className="mt-2">
          <TextArea
            aria-label="Justification for not applicable"
            aria-invalid={needsJustification}
            minRows={2}
            placeholder="Why is this item not applicable to this project?"
            value={item.naJustification}
            onChange={(e) => patch((i) => void (i.naJustification = e.target.value))}
          />
        </div>
      ) : null}
      {expanded ? (
        <div className="mt-2">
          <TextArea aria-label="Notes" minRows={2} placeholder="Notes" value={item.notes} onChange={(e) => patch((i) => void (i.notes = e.target.value))} />
        </div>
      ) : null}
    </li>
  );
}
