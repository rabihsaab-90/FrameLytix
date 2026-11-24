/**
 * Shared UI primitives. Feature components should compose these rather than
 * inventing new styles, so the design system stays consistent.
 */
import {
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react';
import { icons, ChevronDown, ChevronRight, Loader2, Search, type LucideIcon } from 'lucide-react';
import type { EnumMeta, Tone } from '@/lib/labels';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Resolve a lucide icon by name (used for template/enum metadata). */
export function DynamicIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Cmp = (icons as Record<string, LucideIcon>)[name] ?? icons.Circle;
  return <Cmp size={size} className={className} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-crimson text-white hover:bg-crimson-hover active:bg-crimson-active border border-crimson',
  secondary: 'bg-matte text-white border border-gunmetal hover:border-steel hover:bg-raised',
  outline: 'bg-transparent text-white border border-gunmetal hover:border-steel hover:bg-matte',
  ghost: 'bg-transparent text-silver border border-transparent hover:text-white hover:bg-matte',
  danger: 'bg-transparent text-crimson-hover border border-crimson/50 hover:bg-crimson/10 hover:border-crimson'
};
const SIZE = {
  xs: 'h-6 px-2 text-2xs gap-1',
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
  lg: 'h-10 px-4 text-sm gap-2'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, type, ...rest },
  ref
) {
  const iconSize = size === 'lg' ? 16 : size === 'xs' ? 12 : 14;
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" /> : Icon ? <Icon size={iconSize} aria-hidden="true" /> : null}
      {children}
      {IconRight ? <IconRight size={iconSize} aria-hidden="true" /> : null}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Required: used for aria-label and tooltip. */
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
  tone?: 'default' | 'danger';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', active, tone = 'default', className, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
        active
          ? 'border-crimson/60 bg-crimson/15 text-white'
          : tone === 'danger'
            ? 'border-transparent text-silver hover:border-crimson/50 hover:text-crimson-hover'
            : 'border-transparent text-silver hover:bg-matte hover:text-white',
        className
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 13 : 16} aria-hidden="true" />
    </button>
  );
});

// ---------------------------------------------------------------------------
// Badges / status
// ---------------------------------------------------------------------------

const TONE: Record<Tone, string> = {
  neutral: 'border-gunmetal bg-matte text-silver',
  crimson: 'border-crimson/40 bg-crimson/10 text-[#fca5a5]',
  amber: 'border-amber/40 bg-amber/10 text-[#fcd34d]',
  emerald: 'border-emerald/40 bg-emerald/10 text-[#6ee7b7]',
  info: 'border-info/40 bg-info/10 text-[#93c5fd]'
};

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx('inline-flex h-5 items-center gap-1 rounded border px-1.5 text-2xs font-medium whitespace-nowrap', TONE[tone], className)}
    >
      {children}
    </span>
  );
}

/** Status pill: icon + text, never colour alone. */
export function StatusPill({ meta, className, showIcon = true }: { meta: EnumMeta; className?: string; showIcon?: boolean }) {
  return (
    <Badge tone={meta.tone} className={className} title={meta.description ?? meta.label}>
      {showIcon ? <DynamicIcon name={meta.icon} size={11} /> : null}
      {meta.label}
    </Badge>
  );
}

export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('shrink-0 font-mono text-[12px] whitespace-nowrap text-silver selectable', className)}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-gunmetal bg-matte px-1 py-px font-mono text-2xs text-silver">{children}</kbd>
  );
}

export function Spinner({ label = 'Loading…', size = 16 }: { label?: string; size?: number }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-silver">
      <Loader2 size={size} className="animate-spin" aria-hidden="true" />
      <span className="text-xs">{label}</span>
    </span>
  );
}

/** Simple meter (0..1). Always pair with a text value. */
export function Meter({ ratio, tone = 'crimson', label }: { ratio: number | null; tone?: Tone; label: string }) {
  const pct = ratio === null ? 0 : Math.max(0, Math.min(1, ratio)) * 100;
  const bar = tone === 'emerald' ? 'bg-emerald' : tone === 'amber' ? 'bg-amber' : tone === 'info' ? 'bg-info' : tone === 'neutral' ? 'bg-silver' : 'bg-crimson';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gunmetal" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className={cx('h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

/** Default to full width unless the caller supplies its own width class. */
function widthOr(className: string | undefined): string {
  return className && /(^|\s)w-/.test(className) ? '' : 'w-full';
}

const CONTROL =
  'rounded-md border border-gunmetal bg-obsidian px-2.5 text-[13px] text-white placeholder:text-dim ' +
  'hover:border-steel focus:border-crimson focus:outline-none focus-visible:outline-none disabled:opacity-50 aria-[invalid=true]:border-crimson';

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
  /** Tooltip explaining an unfamiliar technical field. */
  help?: string;
}

export function Field({ label, hint, error, required, children, className, help }: FieldProps) {
  const id = useId();
  const hintId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-silver">
        {label}
        {required ? <span className="text-crimson-hover" aria-hidden="true">*</span> : null}
        {help ? (
          <span className="cursor-help text-dim" title={help} aria-label={help}>
            ⓘ
          </span>
        ) : null}
      </label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} className="text-2xs text-[#fca5a5]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-2xs text-dim">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(function TextInput(
  { className, mono, ...rest },
  ref
) {
  return <input ref={ref} className={cx(CONTROL, widthOr(className), 'h-8', mono && 'font-mono text-[12px]', className)} {...rest} />;
});

/** Auto-growing textarea. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean; minRows?: number }>(
  function TextArea({ className, mono, minRows = 3, value, ...rest }, ref) {
    const inner = useRef<HTMLTextAreaElement | null>(null);
    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight + 2, 600)}px`;
    }, [value]);
    return (
      <textarea
        ref={(el) => {
          inner.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        rows={minRows}
        value={value}
        className={cx(CONTROL, widthOr(className), 'resize-y py-1.5 leading-relaxed', mono && 'font-mono text-[12px]', className)}
        {...rest}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(CONTROL, widthOr(className), 'h-8 cursor-pointer pr-7', className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[#dc2626]"
      />
      <label htmlFor={id} className="cursor-pointer text-[13px] text-white">
        {label}
        {description ? <span className="block text-2xs text-dim">{description}</span> : null}
      </label>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', inputRef, className }: { value: string; onChange: (v: string) => void; placeholder?: string; inputRef?: React.Ref<HTMLInputElement>; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-dim" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cx(CONTROL, 'h-8 w-full pl-8')}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function PageHeader({ title, code, subtitle, actions, badges }: { title: ReactNode; code?: string; subtitle?: ReactNode; actions?: ReactNode; badges?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gunmetal px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {code ? <Code className="text-crimson-hover">{code}</Code> : null}
          <h1 className="truncate text-lg font-semibold tracking-tight text-white">{title}</h1>
          {badges}
        </div>
        {subtitle ? <p className="mt-0.5 text-xs text-silver">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, actions, children, className, bodyClassName, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={cx('rounded-lg border border-gunmetal bg-carbon', className)}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-2 border-b border-gunmetal px-4 py-2.5">
          {title ? <h2 className="text-[13px] font-semibold text-white">{title}</h2> : <span />}
          {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Collapsible section for long documents (engineering arguments). */
export function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  children,
  actions,
  status,
  id
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <section id={id} className="rounded-lg border border-gunmetal bg-carbon">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left"
        >
          {open ? <ChevronDown size={14} className="text-silver" aria-hidden="true" /> : <ChevronRight size={14} className="text-silver" aria-hidden="true" />}
          <span className="text-[13px] font-semibold text-white">{title}</span>
          {status}
          {description && !open ? <span className="truncate text-2xs text-dim">{description}</span> : null}
        </button>
        {actions}
      </div>
      {open ? (
        <div id={contentId} className="border-t border-gunmetal p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, message, action }: { icon: LucideIcon; title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gunmetal px-6 py-10 text-center">
      <Icon size={28} className="text-dim" aria-hidden="true" />
      <h3 className="text-[13px] font-semibold text-white">{title}</h3>
      {message ? <p className="max-w-md text-xs text-silver">{message}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Callout({ tone = 'info', icon: Icon, title, children }: { tone?: Tone; icon?: LucideIcon; title?: string; children: ReactNode }) {
  return (
    <div className={cx('flex gap-2.5 rounded-md border px-3 py-2 text-xs', TONE[tone])} role={tone === 'crimson' ? 'alert' : 'note'}>
      {Icon ? <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="text-silver [&_strong]:text-white">{children}</div>
      </div>
    </div>
  );
}

/** Scrollable page body with consistent padding. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('min-h-0 flex-1 overflow-auto px-6 py-5', className)}>{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-gunmetal">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors',
            value === t.id ? 'border-crimson text-white' : 'border-transparent text-silver hover:text-white'
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1.5 font-mono text-2xs text-dim">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Table helpers with consistent styling. */
export const th = 'border-b border-gunmetal bg-matte px-3 py-2 text-left text-2xs font-semibold tracking-wide text-silver uppercase whitespace-nowrap';
export const td = 'border-b border-gunmetal px-3 py-2 align-top text-[13px]';
