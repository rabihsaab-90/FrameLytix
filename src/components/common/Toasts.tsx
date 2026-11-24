import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { cx } from './ui';

const ICON = { success: CheckCircle2, warning: AlertTriangle, info: Info, error: XCircle };
const TONE = {
  success: 'border-emerald/50 text-[#6ee7b7]',
  warning: 'border-amber/50 text-[#fcd34d]',
  info: 'border-gunmetal text-silver',
  error: 'border-crimson/60 text-[#fca5a5]'
};

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-10 z-[60] flex w-96 flex-col gap-2" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={cx('pointer-events-auto flex gap-2.5 rounded-lg border bg-carbon px-3 py-2.5 shadow-xl shadow-black/50', TONE[t.tone])}>
            <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white">{t.message}</p>
              {t.detail ? <p className="mt-0.5 font-mono text-2xs break-all text-silver selectable">{t.detail}</p> : null}
              {t.actions ? (
                <div className="mt-2 flex gap-2">
                  {t.actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      className="rounded border border-gunmetal px-2 py-0.5 text-2xs font-medium text-white hover:border-steel hover:bg-matte"
                      onClick={() => {
                        a.run();
                        dismiss(t.id);
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" aria-label="Dismiss notification" className="h-5 w-5 shrink-0 text-dim hover:text-white" onClick={() => dismiss(t.id)}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
