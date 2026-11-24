/**
 * Shared master-detail layout: list pane (about 40% on wide windows) and an editor pane that scroll
 * independently. Below 1280px the panes stack (list on top) so nothing needs horizontal page scrolling.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useUiStore } from '@/stores/uiStore';

export function MasterDetail({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
      <div className="flex min-h-0 min-w-0 basis-2/5 flex-col border-b border-gunmetal xl:w-[40%] xl:max-w-[560px] xl:min-w-[340px] xl:basis-auto xl:border-r xl:border-b-0">
        {list}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{detail}</div>
    </div>
  );
}

/** Focuses the given input whenever the global "focus search" token increments. */
export function useSearchFocus() {
  const ref = useRef<HTMLInputElement>(null);
  const token = useUiStore((s) => s.searchFocusToken);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
    ref.current?.select();
  }, [token]);
  return ref;
}

/** Scrolls the list row with data-row-id === id into view when the selection changes. */
export function useScrollSelectedIntoView(id: string | undefined, container: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!id || !container.current) return;
    const el = Array.from(container.current.querySelectorAll<HTMLElement>('[data-row-id]')).find((n) => n.dataset.rowId === id);
    el?.scrollIntoView({ block: 'nearest' });
  }, [id, container]);
}
