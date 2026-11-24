import { useMemo } from 'react';
import { FileOutput, Trash2 } from 'lucide-react';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { confirmDialog, navigate } from '@/stores/uiStore';
import { formatDateTime } from '@/lib/labels';
import { Badge, Button, Callout, EmptyState, PageBody, PageHeader, cx, td, th } from '@/components/common/ui';

const FORMAT_TONE = { pdf: 'crimson', html: 'info', csv: 'emerald' } as const;

export default function ExportsPage() {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const records = useMemo(() => [...manifest.exportHistory].sort((a, b) => b.exportedAt.localeCompare(a.exportedAt)), [manifest.exportHistory]);

  const clear = async () => {
    const choice = await confirmDialog({
      title: 'Clear export history?',
      message: `This removes the ${records.length} history record${records.length === 1 ? '' : 's'} from the project. The exported files themselves are not deleted.`,
      confirmLabel: 'Clear history',
      danger: true
    });
    if (choice === 'confirm') update((m) => void (m.exportHistory = []));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Export History"
        subtitle="A record of reports and tables exported from this project."
        actions={
          <>
            <Button variant="primary" icon={FileOutput} onClick={() => navigate({ view: 'report' })}>
              Report Preview
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => void clear()} disabled={records.length === 0}>
              Clear history
            </Button>
          </>
        }
      />
      <PageBody className="flex flex-col gap-4">
        <Callout tone="info" title="Where are the files?">
          Exported files are stored where you chose to save them. File locations are not stored in the portable project, so this list shows names and dates only.
        </Callout>
        {records.length === 0 ? (
          <EmptyState
            icon={FileOutput}
            title="Nothing exported yet"
            message="Exports from the report page and CSV exports from the traceability and risk pages appear here."
            action={
              <Button variant="primary" onClick={() => navigate({ view: 'report' })}>
                Go to Report Preview
              </Button>
            }
          />
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-gunmetal">
            <table className="w-full min-w-[640px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={cx(th, 'sticky top-0 z-10')}>Date</th>
                  <th className={cx(th, 'sticky top-0 z-10')}>Format</th>
                  <th className={cx(th, 'sticky top-0 z-10')}>File name</th>
                  <th className={cx(th, 'sticky top-0 z-10')}>Description</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-matte/60">
                    <td className={cx(td, 'font-mono text-xs whitespace-nowrap text-silver')}>{formatDateTime(r.exportedAt)}</td>
                    <td className={td}>
                      <Badge tone={FORMAT_TONE[r.format]}>{r.format.toUpperCase()}</Badge>
                    </td>
                    <td className={cx(td, 'font-mono text-[12px] break-all text-white selectable')}>{r.fileName}</td>
                    <td className={cx(td, 'text-silver')}>{r.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </div>
  );
}
