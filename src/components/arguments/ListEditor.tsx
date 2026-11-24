import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, TextArea } from '@/components/common/ui';

/** Editable list of strings (assumptions, references). */
export function ListEditor({
  label,
  items,
  onChange,
  addLabel,
  placeholder,
  emptyText
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  placeholder?: string;
  emptyText: string;
}) {
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? <p className="text-xs text-dim">{emptyText}</p> : null}
      <ol className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-2 w-6 shrink-0 text-right font-mono text-2xs text-dim">{i + 1}.</span>
            <TextArea
              minRows={1}
              aria-label={`${label} ${i + 1}`}
              placeholder={placeholder}
              autoFocus={focusIndex === i}
              value={item}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <IconButton icon={Trash2} tone="danger" label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ol>
      <div>
        <Button
          size="sm"
          variant="outline"
          icon={Plus}
          onClick={() => {
            setFocusIndex(items.length);
            onChange([...items, '']);
          }}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
