/**
 * Reusable trace-link editor: shows the records of `targetType` linked to `source`,
 * lets the user add/remove links and navigate to a linked record.
 * All relationships are stored once in manifest.links (undirected).
 */
import { useMemo, useState } from 'react';
import { Link2, Plus, X, ArrowUpRight, AlertTriangle } from 'lucide-react';
import type { EntityRef, EntityType } from '@shared/schemas/project';
import { addLink, linkedRefs, removeLink, resolveRef } from '@shared/utilities/traceability';
import { newId } from '@shared/utilities/ids';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { navigate } from '@/stores/uiStore';
import { ENTITY_LABEL, linkableRecords, routeForEntity } from '@/lib/entities';
import { Button, Code, DynamicIcon, Select, cx } from '@/components/common/ui';

export function EntityChip({ entity, onRemove, missing }: { entity: EntityRef; onRemove?: () => void; missing?: boolean }) {
  const manifest = useManifest();
  const resolved = resolveRef(manifest, entity);
  const route = routeForEntity(manifest, entity);
  const broken = !resolved.exists || resolved.archived || missing;
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs',
        broken ? 'border-crimson/50 bg-crimson/10' : 'border-gunmetal bg-matte'
      )}
    >
      <DynamicIcon name={ENTITY_LABEL[entity.type].icon} size={11} className="shrink-0 text-dim" />
      <button
        type="button"
        disabled={!route || !resolved.exists}
        onClick={() => route && navigate(route)}
        className="flex min-w-0 items-center gap-1.5 text-left hover:text-white disabled:cursor-default"
        title={resolved.exists ? `Open ${resolved.code} — ${resolved.title}` : 'This linked record no longer exists'}
      >
        <Code className="text-crimson-hover">{resolved.exists ? resolved.code : 'Deleted'}</Code>
        <span className="truncate text-silver">{resolved.exists ? resolved.title : entity.id.slice(0, 8)}</span>
        {resolved.archived ? <span className="text-2xs text-amber">(archived)</span> : null}
        {missing ? (
          <span className="inline-flex items-center gap-0.5 text-2xs text-[#fca5a5]">
            <AlertTriangle size={10} aria-hidden="true" /> file missing
          </span>
        ) : null}
        {route && resolved.exists ? <ArrowUpRight size={11} className="shrink-0 text-dim" aria-hidden="true" /> : null}
      </button>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove link to ${resolved.code}`} title="Remove link" className="text-dim hover:text-crimson-hover">
          <X size={11} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

export function LinkManager({
  source,
  targetType,
  label,
  emptyText,
  readOnly
}: {
  source: EntityRef;
  targetType: EntityType;
  label?: string;
  emptyText?: string;
  readOnly?: boolean;
}) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const missingAssets = useProjectStore((s) => s.missingAssets);
  const [adding, setAdding] = useState(false);
  const [choice, setChoice] = useState('');

  const linked = useMemo(() => linkedRefs(manifest, source, targetType), [manifest, source, targetType]);
  const candidates = useMemo(
    () => linkableRecords(manifest, targetType).filter((r) => !linked.some((l) => l.id === r.id) && !(r.id === source.id && targetType === source.type)),
    [manifest, targetType, linked, source]
  );

  const assetMissing = (ref: EntityRef) => {
    if (ref.type !== 'asset') return false;
    const a = manifest.assets.find((x) => x.id === ref.id);
    return !!a && missingAssets.includes(a.relativePath);
  };

  const add = () => {
    if (!choice) return;
    const now = new Date().toISOString();
    update((draft) => {
      const next = addLink(draft as never, source, { type: targetType, id: choice }, { id: newId(), now });
      draft.links = next.links as never;
    });
    setChoice('');
    setAdding(false);
  };
  const remove = (target: EntityRef) => {
    update((draft) => {
      const next = removeLink(draft as never, source, target);
      draft.links = next.links as never;
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-silver">
          <Link2 size={12} aria-hidden="true" />
          {label ?? `Linked ${ENTITY_LABEL[targetType].plural.toLowerCase()}`}
          <span className="font-mono text-2xs text-dim">{linked.length}</span>
        </span>
        {!readOnly && !adding ? (
          <Button size="xs" variant="ghost" icon={Plus} onClick={() => setAdding(true)} disabled={candidates.length === 0} title={candidates.length === 0 ? 'Nothing available to link' : undefined}>
            Link
          </Button>
        ) : null}
      </div>
      {adding ? (
        <div className="flex items-center gap-1.5">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={`Choose ${ENTITY_LABEL[targetType].singular.toLowerCase()} to link`} autoFocus>
            <option value="">Select {ENTITY_LABEL[targetType].singular.toLowerCase()}…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="primary" onClick={add} disabled={!choice}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
      {linked.length === 0 ? (
        <p className="text-2xs text-dim">{emptyText ?? 'No links yet.'}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {linked.map((ref) => (
            <EntityChip key={ref.id} entity={ref} missing={assetMissing(ref)} onRemove={readOnly ? undefined : () => remove(ref)} />
          ))}
        </div>
      )}
    </div>
  );
}
