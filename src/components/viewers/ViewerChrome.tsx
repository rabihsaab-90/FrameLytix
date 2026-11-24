import type { ReactNode } from 'react';
import { cx } from '@/components/common/ui';

/** Thin toolbar shared by all viewers. */
export function ViewerToolbar({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div role="toolbar" aria-label={label} className={cx('flex min-h-9 flex-wrap items-center gap-1 border-b border-gunmetal bg-carbon px-2 py-1', className)}>
      {children}
    </div>
  );
}

export function ToolbarDivider() {
  return <span className="mx-1 h-4 w-px bg-gunmetal" aria-hidden="true" />;
}

/** Mono read-out used in toolbars (zoom %, page counts, dimensions). */
export function Readout({ children, title, className }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx('px-1.5 font-mono text-xs whitespace-nowrap text-silver', className)}>
      {children}
    </span>
  );
}

/** Centred message used for errors / loading inside a viewer area. */
export function ViewerMessage({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-8 text-center" role="status">
      {icon}
      <h3 className="text-[13px] font-semibold text-white">{title}</h3>
      {children ? <div className="max-w-md text-xs text-silver">{children}</div> : null}
    </div>
  );
}

/** Dark, subtly checkered backdrop so transparent images and white drawings stay legible. */
export const CHECKER_STYLE = {
  backgroundColor: '#0d0d10',
  backgroundImage:
    'linear-gradient(45deg, #15151a 25%, transparent 25%), linear-gradient(-45deg, #15151a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #15151a 75%), linear-gradient(-45deg, transparent 75%, #15151a 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
} as const;
