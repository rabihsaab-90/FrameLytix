import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ListChecks } from 'lucide-react';
import { cx } from '@/components/common/ui';
import type { ArgumentIssue, SectionId } from './validation';

export function ValidationSummary({ issues, onGo }: { issues: ArgumentIssue[]; onGo: (section: SectionId) => void }) {
  const [open, setOpen] = useState(true);
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald/40 bg-emerald/10 px-3 py-2 text-xs text-[#6ee7b7]" role="note">
        <CheckCircle2 size={14} aria-hidden="true" />
        No documentation gaps detected. This does not mean the design is valid or safe.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber/40 bg-amber/10 text-xs" role="note">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx('flex w-full items-center gap-2 px-3 py-2 text-left font-semibold text-[#fcd34d]')}
      >
        {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        <ListChecks size={14} aria-hidden="true" />
        {issues.length} documentation gap{issues.length === 1 ? '' : 's'} to resolve
      </button>
      {open ? (
        <ul className="flex flex-col gap-0.5 px-3 pb-2.5 pl-9">
          {issues.map((i) => (
            <li key={i.id} className="text-silver">
              <button type="button" className="text-left underline-offset-2 hover:text-white hover:underline" onClick={() => onGo(i.section)}>
                {i.message}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
