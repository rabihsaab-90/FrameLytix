/**
 * Hierarchical project explorer (VS Code / Notion style). Phases 1, 2 and 4 are
 * record-based navigation; Phase 3 mirrors the actual CAD folders on disk.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  Scale,
  Sigma,
  Plus,
  FolderTree,
  Folder,
  FolderOpen,
  File,
  FileText,
  FileImage,
  Box,
  FileSpreadsheet,
  FileCode2,
  PenTool,
  RefreshCw,
  Upload,
  FolderPlus,
  ExternalLink,
  GitBranch,
  TriangleAlert,
  ClipboardCheck,
  FileOutput,
  History,
  BadgeCheck,
  Search
} from 'lucide-react';
import type { FileNode } from '@shared/types/ipc';
import { assetKind, extensionOf } from '@shared/utilities/paths';
import { nextCode, newId } from '@shared/utilities/ids';
import { DEFAULT_CRITERIA } from '@shared/utilities/projectFactory';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore, navigate, notify } from '@/stores/uiStore';
import { useImportStore } from '@/stores/importStore';
import { api } from '@/lib/api';
import { PHASE_LABELS, type WorkspaceRoute } from '@/lib/navigation';
import { IconButton, cx } from '@/components/common/ui';
import { Modal } from '@/components/common/Modal';
import { Button, Field, TextInput } from '@/components/common/ui';
import { validateFileName } from '@shared/utilities/paths';

const PHASE3_ROOT = '03-CAD-and-Technical-Drawings';

function fileIcon(name: string) {
  const kind = assetKind(extensionOf(name));
  switch (kind) {
    case 'image':
    case 'svg':
      return FileImage;
    case 'pdf':
      return FileText;
    case 'stl':
      return Box;
    case 'native-cad':
      return PenTool;
    case 'spreadsheet':
      return FileSpreadsheet;
    case 'matlab':
    case 'text':
      return FileCode2;
    default:
      return File;
  }
}

function NavItem({
  icon: Icon,
  label,
  route,
  depth = 0,
  count,
  badge
}: {
  icon: typeof File;
  label: string;
  route: WorkspaceRoute;
  depth?: number;
  count?: number;
  badge?: ReactNode;
}) {
  const current = useUiStore((s) => s.route);
  const screen = useUiStore((s) => s.screen);
  const active = screen === 'workspace' && JSON.stringify(current) === JSON.stringify(route);
  return (
    <button
      type="button"
      onClick={() => navigate(route)}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] transition-colors',
        active ? 'bg-crimson/15 text-white' : 'text-silver hover:bg-matte hover:text-white'
      )}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      {active ? <span className="absolute left-0 h-5 w-0.5 rounded-r bg-crimson" aria-hidden="true" /> : null}
      <Icon size={14} className={cx('shrink-0', active ? 'text-crimson-hover' : 'text-dim group-hover:text-silver')} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge}
      {count !== undefined ? <span className="font-mono text-2xs text-dim">{count}</span> : null}
    </button>
  );
}

function Group({ label, children, defaultOpen = true, actions }: { label: string; children: ReactNode; defaultOpen?: boolean; actions?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2">
      <div className="group flex items-center pr-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-1 text-left text-2xs font-semibold tracking-wide text-dim uppercase hover:text-silver"
        >
          {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
          <span className="truncate">{label}</span>
        </button>
        {actions}
      </div>
      {open ? <div className="relative flex flex-col gap-px">{children}</div> : null}
    </div>
  );
}

function TreeNode({ node, depth, filter, onCreateFolder }: { node: FileNode; depth: number; filter: string; onCreateFolder: (parent: string) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const current = useUiStore((s) => s.route);
  const missing = useProjectStore((s) => s.missingAssets);
  const requestImport = useImportStore((s) => s.requestImport);

  if (node.kind === 'file') {
    if (filter && !node.name.toLowerCase().includes(filter)) return null;
    const Icon = fileIcon(node.name);
    const active = current.view === 'file' && current.path === node.relativePath;
    return (
      <button
        type="button"
        onClick={() => navigate({ view: 'file', path: node.relativePath })}
        aria-current={active ? 'page' : undefined}
        title={node.relativePath}
        className={cx('flex h-6 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs', active ? 'bg-crimson/15 text-white' : 'text-silver hover:bg-matte hover:text-white')}
        style={{ paddingLeft: 10 + depth * 12 }}
      >
        <Icon size={13} className="shrink-0 text-dim" aria-hidden="true" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }
  const children = node.children ?? [];
  const visible = filter ? hasMatch(node, filter) : true;
  if (!visible) return null;
  const isOpen = open || !!filter;
  const hasMissingInside = missing.some((m) => m.startsWith(node.relativePath + '/'));
  return (
    <div>
      <div className="group flex items-center pr-1" style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setOpen((o) => !o)}
          className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded-md pl-1 text-left text-xs text-silver hover:bg-matte hover:text-white"
        >
          {isOpen ? <ChevronDown size={12} aria-hidden="true" className="shrink-0" /> : <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
          {isOpen ? <FolderOpen size={13} className="shrink-0 text-dim" aria-hidden="true" /> : <Folder size={13} className="shrink-0 text-dim" aria-hidden="true" />}
          <span className="truncate">{node.name.replace(/-/g, ' ')}</span>
          {hasMissingInside ? <TriangleAlert size={11} className="shrink-0 text-amber" aria-label="Contains missing references" /> : null}
        </button>
        <span className="hidden items-center group-focus-within:flex group-hover:flex">
          <IconButton icon={Upload} label={`Import files into ${node.name}`} size="sm" onClick={() => requestImport(node.relativePath)} />
          <IconButton icon={FolderPlus} label={`New folder in ${node.name}`} size="sm" onClick={() => onCreateFolder(node.relativePath)} />
          <IconButton
            icon={ExternalLink}
            label="Reveal in file manager"
            size="sm"
            onClick={() => void api().files.reveal(node.relativePath).then((r) => !r.ok && notify({ tone: 'error', message: 'Could not reveal folder', detail: r.message }))}
          />
        </span>
      </div>
      {isOpen ? (
        <div>
          {children.length === 0 ? (
            <p className="py-0.5 text-2xs text-dim" style={{ paddingLeft: 26 + depth * 12 }}>
              Empty folder
            </p>
          ) : (
            children.map((c) => <TreeNode key={c.relativePath} node={c} depth={depth + 1} filter={filter} onCreateFolder={onCreateFolder} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

function hasMatch(node: FileNode, filter: string): boolean {
  if (node.kind === 'file') return node.name.toLowerCase().includes(filter);
  return (node.children ?? []).some((c) => hasMatch(c, filter));
}

function CreateFolderDialog({ parent, onClose }: { parent: string | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const error = name ? validateFileName(name) : null;
  const refresh = useProjectStore((s) => s.refreshFiles);
  const submit = async () => {
    if (!parent || error || !name.trim()) return;
    setBusy(true);
    const r = await api().files.createFolder(parent, name.trim());
    setBusy(false);
    if (r.ok) {
      notify({ tone: 'success', message: `Folder created: ${r.relativePath}` });
      await refresh();
      onClose();
    } else notify({ tone: 'error', message: 'Could not create folder', detail: r.message });
  };
  return (
    <Modal
      open={parent !== null}
      onClose={onClose}
      title="New folder"
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim() || !!error} onClick={() => void submit()}>
            Create folder
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Folder name" error={error} hint={<span className="font-mono">{parent}/{name || '…'}</span>}>
          {(id, d) => <TextInput id={id} aria-describedby={d} value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Connection-Details" />}
        </Field>
      </form>
    </Modal>
  );
}

export function ProjectExplorer() {
  const manifest = useProjectStore((s) => s.manifest);
  const tree = useProjectStore((s) => s.fileTree);
  const refresh = useProjectStore((s) => s.refreshFiles);
  const update = useProjectStore((s) => s.update);
  const requestImport = useImportStore((s) => s.requestImport);
  const [filter, setFilter] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);

  const cadNode = useMemo(() => tree?.children?.find((c) => c.kind === 'directory' && c.name === PHASE3_ROOT) ?? null, [tree]);

  if (!manifest) return null;
  const f = filter.trim().toLowerCase();
  const reqs = manifest.requirements.filter((r) => !r.archived);
  const args = manifest.arguments.filter((a) => !a.archived);
  const labels = manifest.project.sectionLabels;
  const matches = (s: string) => !f || s.toLowerCase().includes(f);

  const createArgument = () => {
    const id = newId();
    const now = new Date().toISOString();
    update((d) => {
      d.arguments.push({
        id,
        code: nextCode('ARG', d.arguments.map((a) => a.code)),
        title: 'New engineering argument',
        problemStatement: '',
        objective: '',
        alternatives: [],
        matrix: { scaleMin: 1, scaleMax: 5, criteria: DEFAULT_CRITERIA.map((c) => ({ id: newId(), name: c.name, weight: c.weight, description: c.description ?? '' })), scores: [] },
        constraintEvaluations: [],
        assumptions: [],
        evidenceSummary: '',
        selectedAlternativeId: null,
        selectionRationale: '',
        justification: '',
        risksAndLimitations: '',
        references: [],
        author: manifest.project.author,
        reviewer: '',
        revision: 'REV-A',
        status: 'draft',
        archived: false,
        createdAt: now,
        modifiedAt: now,
        revisions: []
      });
    });
    navigate({ view: 'argument', id });
  };

  return (
    <nav aria-label="Project explorer" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gunmetal p-2">
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-dim" aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter explorer…"
            aria-label="Filter project explorer"
            className="h-7 w-full rounded-md border border-gunmetal bg-obsidian pr-2 pl-7 text-xs text-white placeholder:text-dim focus:border-crimson focus:outline-none"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="mt-2">
          <NavItem icon={LayoutDashboard} label="Project Overview" route={{ view: 'overview' }} />
        </div>

        <Group label={PHASE_LABELS.phase1}>
          {matches(labels.criteria) && <NavItem icon={ListChecks} label={labels.criteria} route={{ view: 'requirements', section: 'criteria' }} count={reqs.filter((r) => r.section === 'criteria').length} />}
          {matches(labels.constraints) && <NavItem icon={ListChecks} label={labels.constraints} route={{ view: 'requirements', section: 'constraints' }} count={reqs.filter((r) => r.section === 'constraints').length} />}
          {matches(labels.environment) && <NavItem icon={ListChecks} label={labels.environment} route={{ view: 'requirements', section: 'environment' }} count={reqs.filter((r) => r.section === 'environment').length} />}
          {matches('All requirements') && <NavItem icon={ListChecks} label="All requirements" route={{ view: 'requirements' }} count={reqs.length} />}
        </Group>

        <Group
          label={PHASE_LABELS.phase2}
          actions={<IconButton icon={Plus} label="Create new argument" size="sm" onClick={createArgument} />}
        >
          {args
            .filter((a) => matches(`${a.code} ${a.title}`))
            .map((a) => (
              <NavItem key={a.id} icon={Scale} label={`${a.code} ${a.title}`} route={{ view: 'argument', id: a.id }} />
            ))}
          {matches('All arguments') && <NavItem icon={Scale} label="All arguments" route={{ view: 'arguments' }} count={args.length} />}
          {matches('Supporting calculations') && <NavItem icon={Sigma} label="Supporting calculations" route={{ view: 'calculations' }} count={manifest.calculations.filter((c) => !c.archived).length} />}
          {matches('Verification evidence') && <NavItem icon={BadgeCheck} label="Verification evidence" route={{ view: 'evidence' }} count={manifest.evidence.length} />}
          {!f && (
            <button type="button" onClick={createArgument} className="flex h-7 items-center gap-2 rounded-md pl-2 text-left text-[13px] text-dim hover:bg-matte hover:text-white">
              <Plus size={14} aria-hidden="true" /> Create New Argument
            </button>
          )}
        </Group>

        <Group
          label={PHASE_LABELS.phase3}
          actions={
            <span className="flex">
              <IconButton icon={Upload} label="Import files" size="sm" onClick={() => requestImport(manifest.settings.defaultAssetFolder || PHASE3_ROOT)} />
              <IconButton icon={RefreshCw} label="Refresh folders from disk" size="sm" onClick={() => void refresh()} />
            </span>
          }
        >
          <NavItem icon={FolderTree} label="Technical asset register" route={{ view: 'assets' }} count={manifest.assets.length} />
          {cadNode ? (
            (cadNode.children ?? []).map((c) => <TreeNode key={c.relativePath} node={c} depth={0} filter={f} onCreateFolder={setNewFolderParent} />)
          ) : (
            <p className="px-2 py-1 text-2xs text-dim">{tree ? `Folder "${PHASE3_ROOT}" not found on disk.` : 'Loading folders…'}</p>
          )}
        </Group>

        <Group label={PHASE_LABELS.phase4}>
          {matches('Requirements Traceability') && <NavItem icon={GitBranch} label="Requirements Traceability" route={{ view: 'traceability' }} />}
          {matches('Risk Register') && <NavItem icon={TriangleAlert} label="Risk Register" route={{ view: 'risks' }} count={manifest.risks.filter((r) => !r.archived).length} />}
          {matches('Review Checklist') && <NavItem icon={ClipboardCheck} label="Review Checklist" route={{ view: 'review' }} />}
          {matches('Report Preview') && <NavItem icon={FileOutput} label="Report Preview" route={{ view: 'report' }} />}
          {matches('Export History') && <NavItem icon={History} label="Export History" route={{ view: 'exports' }} count={manifest.exportHistory.length} />}
        </Group>
      </div>
      <CreateFolderDialog parent={newFolderParent} onClose={() => setNewFolderParent(null)} />
    </nav>
  );
}
