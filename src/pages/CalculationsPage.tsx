import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Link2, MousePointerClick, Plus, Sigma } from 'lucide-react';
import { newId, nextCode } from '@shared/utilities/ids';
import { linkedRefs } from '@shared/utilities/traceability';
import { getTemplate } from '@/templates/templates';
import { useManifest, useProjectStore } from '@/stores/projectStore';
import { navigate } from '@/stores/uiStore';
import { Badge, Button, Checkbox, Code, EmptyState, PageHeader, SearchInput, cx } from '@/components/common/ui';
import { MasterDetail, useScrollSelectedIntoView, useSearchFocus } from '@/components/requirements/MasterDetail';
import { CalculationEditor } from '@/components/calculations/CalculationEditor';

export default function CalculationsPage({ selectedId }: { selectedId?: string }) {
  const manifest = useManifest();
  const update = useProjectStore((s) => s.update);
  const searchRef = useSearchFocus();
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const templates = getTemplate(manifest.project.templateId)?.calculationTypes ?? [];
  const selected = selectedId ? manifest.calculations.find((c) => c.id === selectedId) : undefined;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return manifest.calculations.filter((c) => {
      if (c.archived && !showArchived && c.id !== selectedId) return false;
      return !q || `${c.code} ${c.title} ${c.purpose}`.toLowerCase().includes(q);
    });
  }, [manifest.calculations, query, showArchived, selectedId]);

  useScrollSelectedIntoView(selectedId, listRef);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const create = (init?: { title: string; purpose: string; equation: string }) => {
    const id = newId();
    const now = new Date().toISOString();
    update((d) => {
      d.calculations.push({
        id,
        code: nextCode('CALC', d.calculations.map((c) => c.code)),
        title: init?.title ?? 'New calculation',
        purpose: init?.purpose ?? '',
        equation: init?.equation ?? '',
        variables: [],
        expression: '',
        method: '',
        assumptions: '',
        resultValue: '',
        resultUnit: '',
        resultSource: 'manual',
        reference: '',
        verificationNotes: '',
        revision: 'REV-A',
        author: manifest.project.author,
        archived: false,
        createdAt: now,
        modifiedAt: now
      });
    });
    setMenuOpen(false);
    setQuery('');
    navigate({ view: 'calculations', id });
  };

  const active = manifest.calculations.filter((c) => !c.archived).length;

  const list = (
    <>
      <div className="flex flex-col gap-2 border-b border-gunmetal p-3">
        <SearchInput inputRef={searchRef} value={query} onChange={setQuery} placeholder="Search code, title or purpose" />
        <Checkbox checked={showArchived} onChange={setShowArchived} label="Show archived" />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Calculations list">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Sigma}
              title={manifest.calculations.length === 0 ? 'No calculations yet' : 'No calculations match'}
              message={
                manifest.calculations.length === 0
                  ? 'Document hand calculations and link them to the requirements they support.'
                  : 'Clear the search or enable Show archived.'
              }
              action={
                manifest.calculations.length === 0 ? (
                  <Button variant="primary" icon={Plus} onClick={() => create()}>
                    New calculation
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          rows.map((c) => {
            const reqCount = linkedRefs(manifest, { type: 'calculation', id: c.id }, 'requirement').length;
            const sel = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                data-row-id={c.id}
                aria-current={sel ? 'true' : undefined}
                onClick={() => navigate({ view: 'calculations', id: c.id })}
                className={cx(
                  'flex w-full flex-col gap-1 border-b border-l-2 border-b-gunmetal px-3 py-2 text-left hover:bg-matte',
                  sel ? 'border-l-crimson bg-matte' : 'border-l-transparent',
                  c.archived && 'opacity-60'
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Code className="shrink-0 text-crimson-hover">{c.code}</Code>
                  <span className="truncate text-[13px] text-white">{c.title || '(untitled)'}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-2xs">
                  <span className="font-mono text-silver">{c.resultValue ? `${c.resultValue} ${c.resultUnit}`.trim() : 'No result'}</span>
                  <span className="inline-flex items-center gap-0.5 font-mono text-dim" title={`${reqCount} linked requirement${reqCount === 1 ? '' : 's'}`}>
                    <Link2 size={11} aria-hidden="true" />
                    {reqCount} req
                  </span>
                  {c.archived ? <Badge>Archived</Badge> : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  const detail = selected ? (
    <CalculationEditor key={selected.id} id={selected.id} />
  ) : (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={MousePointerClick}
        title={selectedId ? 'Calculation not found' : 'No calculation selected'}
        message={selectedId ? 'The selected calculation no longer exists.' : 'Select a calculation from the list, or create a new one.'}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Calculations"
        subtitle={<span className="font-mono">{active} active</span>}
        actions={
          <>
            {templates.length > 0 ? (
              <div className="relative" ref={menuRef}>
                <Button iconRight={ChevronDown} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
                  Add from template
                </Button>
                {menuOpen ? (
                  <div role="menu" aria-label="Calculation templates" className="absolute right-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-md border border-gunmetal bg-carbon py-1 shadow-lg">
                    {templates.map((t) => (
                      <button
                        key={t.title}
                        role="menuitem"
                        type="button"
                        onClick={() => create({ title: t.title, purpose: t.purpose, equation: t.equation })}
                        className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-matte focus-visible:bg-matte"
                      >
                        <span className="text-[13px] text-white">{t.title}</span>
                        <span className="truncate text-2xs text-dim">{t.purpose}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button variant="primary" icon={Plus} onClick={() => create()}>
              New calculation
            </Button>
          </>
        }
      />
      <MasterDetail list={list} detail={detail} />
    </div>
  );
}
