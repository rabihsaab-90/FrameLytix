import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cx } from '@/components/common/ui';

/**
 * Accessible radiogroup of selectable cards: roving tabindex, arrow keys move and select,
 * Enter/Space select. Selection is shown by border, tick and aria-checked (never colour alone).
 */
export function RadioCards<T extends { id: string }>({
  label,
  items,
  value,
  onChange,
  renderItem,
  className,
  cardClassName
}: {
  label: string;
  items: T[];
  value: string | null;
  onChange: (id: string) => void;
  renderItem: (item: T, selected: boolean) => ReactNode;
  className?: string;
  cardClassName?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = items.findIndex((i) => i.id === value);

  const move = (from: number, delta: number) => {
    if (items.length === 0) return;
    const next = (from + delta + items.length) % items.length;
    const item = items[next];
    if (!item) return;
    onChange(item.id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(index, -1);
        break;
      case 'Home':
        e.preventDefault();
        move(-1, 1);
        break;
      case 'End':
        e.preventDefault();
        move(items.length, -1);
        break;
      default:
    }
  };

  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {items.map((item, index) => {
        const selected = item.id === value;
        const tabbable = selected || (selectedIndex < 0 && index === 0);
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cx(
              'relative rounded-lg border p-3 text-left transition-colors',
              selected ? 'border-crimson bg-crimson/10' : 'border-gunmetal bg-carbon hover:border-steel hover:bg-matte',
              cardClassName
            )}
          >
            {renderItem(item, selected)}
            {selected ? (
              <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-crimson text-white" aria-hidden="true">
                <Check size={11} strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
