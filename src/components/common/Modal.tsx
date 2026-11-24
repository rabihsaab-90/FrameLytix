import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { Button, IconButton, cx } from './ui';
import { useUiStore } from '@/stores/uiStore';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible modal dialog with focus trap, Escape to close and focus restoration. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'md',
  dismissible = true
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;
  const widthCls = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[width];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6" onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('flex max-h-[90vh] w-full flex-col rounded-lg border border-gunmetal bg-carbon shadow-2xl shadow-black/60', widthCls)}
      >
        <div className="flex items-center justify-between border-b border-gunmetal px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-white">
            {title}
          </h2>
          {dismissible ? <IconButton icon={X} label="Close dialog" size="sm" onClick={onClose} /> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 text-[13px] text-silver">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-gunmetal px-4 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/** Renders the queued confirm() requests from the UI store. */
export function ConfirmHost() {
  const queue = useUiStore((s) => s.confirmQueue);
  const resolve = useUiStore((s) => s.resolveConfirm);
  const req = queue[0];
  if (!req) return null;
  return (
    <Modal
      open
      title={req.title}
      onClose={() => resolve(req.id, 'cancel')}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => resolve(req.id, 'cancel')}>
            {req.cancelLabel ?? 'Cancel'}
          </Button>
          {req.alternateLabel ? (
            <Button variant="outline" onClick={() => resolve(req.id, 'alternate')}>
              {req.alternateLabel}
            </Button>
          ) : null}
          <Button variant={req.danger ? 'danger' : 'primary'} data-autofocus onClick={() => resolve(req.id, 'confirm')}>
            {req.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {req.danger ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-crimson-hover" aria-hidden="true" /> : null}
        <p className="whitespace-pre-line">{req.message}</p>
      </div>
    </Modal>
  );
}
