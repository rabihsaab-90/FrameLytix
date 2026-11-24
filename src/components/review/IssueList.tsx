import { AlertOctagon, AlertTriangle, ArrowUpRight, Info, type LucideIcon } from 'lucide-react';
import type { Issue, IssueSeverity } from '@shared/utilities/issues';
import type { ProjectManifest } from '@shared/schemas/project';
import { routeForIssue } from '@/lib/issueRoutes';
import { REVIEW_CATEGORY } from '@/lib/labels';
import { navigate } from '@/stores/uiStore';
import { Badge, cx } from '@/components/common/ui';
import type { Tone } from '@/lib/labels';

export const SEVERITY_META: Record<IssueSeverity, { label: string; tone: Tone; icon: LucideIcon }> = {
  critical: { label: 'Critical', tone: 'crimson', icon: AlertOctagon },
  warning: { label: 'Warning', tone: 'amber', icon: AlertTriangle },
  info: { label: 'Info', tone: 'info', icon: Info }
};

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const m = SEVERITY_META[severity];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone}>
      <Icon size={11} aria-hidden="true" />
      {m.label}
    </Badge>
  );
}

/** Clickable list of detected issues. Each row navigates to the record that needs attention. */
export function IssueList({ issues, manifest, showSeverity = true, className }: { issues: Issue[]; manifest: ProjectManifest; showSeverity?: boolean; className?: string }) {
  return (
    <ul className={cx('divide-y divide-gunmetal', className)}>
      {issues.map((issue) => {
        const route = routeForIssue(issue, manifest);
        const body = (
          <>
            {showSeverity ? <SeverityBadge severity={issue.severity} /> : null}
            <span className="min-w-0 flex-1 text-[13px] text-white">{issue.message}</span>
            <span className="hidden shrink-0 text-2xs text-dim sm:inline">{REVIEW_CATEGORY[issue.category]}</span>
            {route ? <ArrowUpRight size={13} className="shrink-0 text-dim" aria-hidden="true" /> : null}
          </>
        );
        return (
          <li key={issue.id}>
            {route ? (
              <button type="button" onClick={() => navigate(route)} className="flex w-full items-center gap-2.5 px-1 py-2 text-left hover:bg-matte" title="Open the related record">
                {body}
              </button>
            ) : (
              <div className="flex w-full items-center gap-2.5 px-1 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export const COMPLETENESS_NOTE =
  'These figures measure how complete the documentation is. They do not indicate that the design is safe, verified or compliant.';
