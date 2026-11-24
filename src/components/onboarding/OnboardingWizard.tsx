import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, FolderOpen, Loader2, Rocket } from 'lucide-react';
import type { Discipline, UnitSystem } from '@shared/schemas/project';
import type { CreateProjectInput } from '@shared/types/ipc';
import { toFolderName, validateFileName, validateProjectIdentifier } from '@shared/utilities/paths';
import { DISCIPLINES, getTemplate, getTemplatesForDiscipline } from '@/templates/templates';
import { api } from '@/lib/api';
import { handleOpenResult } from '@/lib/projectActions';
import { useUiStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { Badge, Button, Checkbox, DynamicIcon, Field, Select, TextArea, TextInput, cx } from '@/components/common/ui';
import { RadioCards } from './RadioCards';
import { buildTreeLines, suggestIdentifier } from './helpers';

const CUSTOM_TEMPLATE_ID = 'custom-user-defined';

type TargetState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; message: string; path: string }
  | { status: 'error'; message: string };

function StepIndicator({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1, label: 'Discipline' },
    { n: 2, label: 'Project type & details' }
  ] as const;
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Progress">
      {steps.map((s, i) => {
        const done = step > s.n;
        const current = step === s.n;
        return (
          <li key={s.n} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 ? <span className="h-px w-6 bg-gunmetal" aria-hidden="true" /> : null}
            <span
              className={cx(
                'flex h-5 w-5 items-center justify-center rounded-full border font-mono text-2xs',
                current ? 'border-crimson bg-crimson text-white' : done ? 'border-emerald/60 text-[#6ee7b7]' : 'border-gunmetal text-dim'
              )}
            >
              {done ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : s.n}
            </span>
            <span className={current ? 'font-medium text-white' : 'text-silver'}>
              {s.label}
              <span className="sr-only">{done ? ' (completed)' : current ? ' (current step)' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OnboardingWizard() {
  const settings = useUiStore((s) => s.settings);
  const appInfo = useUiStore((s) => s.appInfo);
  const setScreen = useUiStore((s) => s.setScreen);

  const [step, setStep] = useState<1 | 2>(1);
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [organization, setOrganization] = useState('');
  const [identifierEdit, setIdentifierEdit] = useState<string | null>(null);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(settings?.defaultUnitSystem ?? 'SI');
  const [parentEdit, setParentEdit] = useState<string | null>(null);
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const [gitignore, setGitignore] = useState(true);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [target, setTarget] = useState<TargetState>({ status: 'idle' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const parent = parentEdit ?? (settings?.defaultProjectLocation || appInfo?.defaultProjectsDir || '');
  const identifier = identifierEdit ?? suggestIdentifier(title);
  const folderName = folderEdit ?? (title.trim() ? toFolderName(title) : '');
  const template = templateId ? getTemplate(templateId) : undefined;
  const isCustomType = templateId === CUSTOM_TEMPLATE_ID;
  const templates = useMemo(() => (discipline ? getTemplatesForDiscipline(discipline) : []), [discipline]);
  const disciplineInfo = DISCIPLINES.find((d) => d.id === discipline);

  const touch = (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));

  // Move focus to the step heading when the step changes (not on first render).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // Debounced live check of the target folder. Nothing is written by this check.
  useEffect(() => {
    if (step !== 2) return;
    if (!parent || !folderName || validateFileName(folderName)) {
      setTarget({ status: 'idle' });
      return;
    }
    setTarget({ status: 'checking' });
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api()
        .project.checkTarget(parent, folderName)
        .then((r) => {
          if (cancelled) return;
          setTarget(r.ok ? { status: 'ok', message: r.message, path: r.targetPath } : { status: 'error', message: r.message });
        })
        .catch((err: unknown) => {
          if (!cancelled) setTarget({ status: 'error', message: err instanceof Error ? err.message : 'The location could not be checked.' });
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step, parent, folderName]);

  const errors = {
    custom: isCustomType && customName.trim() === '' ? 'Enter a name for your project type.' : null,
    title: title.trim() === '' ? 'Enter a project title.' : null,
    author: author.trim() === '' ? 'Enter an author or team name.' : null,
    identifier: validateProjectIdentifier(identifier),
    folder: folderName === '' ? 'Enter a folder name.' : validateFileName(folderName),
    parent: parent === '' ? 'Choose where to create the project.' : null
  };
  const targetBlocker =
    target.status === 'error' ? target.message : target.status === 'checking' ? 'Checking the destination…' : target.status === 'idle' ? 'Choose a valid destination.' : null;
  const blocker = errors.custom ?? errors.title ?? errors.author ?? errors.identifier ?? errors.parent ?? errors.folder ?? targetBlocker;
  const canCreate = !blocker && !creating && !!template;

  const cancel = () => {
    const prev = useUiStore.getState().previousScreen;
    const hasProject = !!useProjectStore.getState().manifest;
    setScreen(prev === 'workspace' && hasProject ? 'workspace' : 'welcome');
  };

  const chooseDiscipline = (id: string) => {
    const d = id as Discipline;
    if (d === discipline) return;
    setDiscipline(d);
    setTemplateId(getTemplatesForDiscipline(d)[0]?.id ?? null);
  };

  const chooseFolder = async () => {
    try {
      const dir = await api().dialog.chooseDirectory('Choose where to create the project');
      if (dir) setParentEdit(dir);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'The folder picker could not be opened.');
    }
  };

  const create = async () => {
    if (!canCreate || !template) return;
    setCreating(true);
    setCreateError(null);
    const input: CreateProjectInput = {
      parentDirectory: parent,
      folderName,
      templateId: template.id,
      title: title.trim(),
      description: description.trim(),
      identifier: identifier.trim(),
      author: author.trim(),
      organization: organization.trim(),
      unitSystem,
      customArchetypeName: isCustomType ? customName.trim() : undefined,
      writeGitignore: gitignore
    };
    try {
      const result = await api().project.create(input);
      if (result.ok) {
        handleOpenResult(result);
        return;
      }
      setCreateError(result.message || 'The project could not be created.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'The project could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const treeLines = useMemo(() => (template && folderName ? buildTreeLines(folderName, template.folders) : []), [template, folderName]);

  return (
    <div className="flex h-full flex-col bg-obsidian">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gunmetal bg-carbon px-6 py-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-white">New Project</h1>
          <p className="text-2xs text-dim">Nothing is created until you select Create Project.</p>
        </div>
        <StepIndicator step={step} />
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {step === 1 ? (
          <div className="mx-auto max-w-5xl px-6 py-5">
            <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-white outline-none">
              Choose a discipline
            </h2>
            <p className="mt-0.5 mb-4 text-xs text-silver">This selects the set of project types, folders and starting suggestions you can choose from next.</p>
            <RadioCards
              label="Engineering discipline"
              items={DISCIPLINES}
              value={discipline}
              onChange={chooseDiscipline}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              cardClassName="flex h-full flex-col gap-1.5 pr-8"
              renderItem={(d) => (
                <>
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gunmetal bg-matte text-silver">
                      <DynamicIcon name={d.icon} size={16} />
                    </span>
                    <span className="text-[13px] font-semibold text-white">{d.name}</span>
                  </span>
                  <span className="text-xs leading-relaxed text-silver">{d.description}</span>
                  <span className="mt-auto pt-1 font-mono text-2xs text-dim">{getTemplatesForDiscipline(d.id).length} project types</span>
                </>
              )}
            />
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl gap-5 px-6 py-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Left: project type */}
            <section aria-labelledby="type-heading" className="min-w-0">
              <h2 id="type-heading" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-white outline-none">
                Project type
              </h2>
              <p className="mt-0.5 mb-3 flex items-center gap-1.5 text-xs text-silver">
                {disciplineInfo ? <DynamicIcon name={disciplineInfo.icon} size={13} /> : null}
                {disciplineInfo?.name}
              </p>
              <RadioCards
                label="Project type"
                items={templates}
                value={templateId}
                onChange={setTemplateId}
                className="flex flex-col gap-2"
                cardClassName="flex flex-col gap-1.5 pr-8"
                renderItem={(t) => (
                  <>
                    <span className="flex items-center gap-2">
                      <DynamicIcon name={t.icon} size={15} className="shrink-0 text-silver" />
                      <span className="text-[13px] font-semibold text-white">{t.archetype}</span>
                    </span>
                    <span className="text-xs leading-relaxed text-silver">{t.description}</span>
                    {t.requirementCategories.length > 0 ? (
                      <span className="flex flex-wrap gap-1" aria-label="Requirement categories">
                        {t.requirementCategories.slice(0, 3).map((c) => (
                          <Badge key={c}>{c}</Badge>
                        ))}
                      </span>
                    ) : null}
                    {t.suggestedArguments.length > 0 ? (
                      <span className="text-2xs text-dim">
                        Suggested arguments: {t.suggestedArguments.slice(0, 2).map((a) => a.title).join('; ')}
                        {t.suggestedArguments.length > 2 ? '…' : ''}
                      </span>
                    ) : null}
                  </>
                )}
              />
              {isCustomType ? (
                <Field label="Project type name" required error={touched.custom ? errors.custom : null} hint="For example, “Wave energy buoy”. Shown in the project and reports." className="mt-3">
                  {(id, d) => (
                    <TextInput
                      id={id}
                      aria-describedby={d}
                      aria-invalid={!!(touched.custom && errors.custom)}
                      value={customName}
                      maxLength={80}
                      onChange={(e) => setCustomName(e.target.value)}
                      onBlur={() => touch('custom')}
                    />
                  )}
                </Field>
              ) : null}
            </section>

            {/* Right: details */}
            <div className="flex min-w-0 flex-col gap-4">
              <section aria-labelledby="details-heading" className="rounded-lg border border-gunmetal bg-carbon">
                <h2 id="details-heading" className="border-b border-gunmetal px-4 py-2.5 text-[13px] font-semibold text-white">
                  Project details
                </h2>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <Field label="Project title" required error={touched.title ? errors.title : null} className="sm:col-span-2">
                    {(id, d) => (
                      <TextInput
                        id={id}
                        aria-describedby={d}
                        aria-invalid={!!(touched.title && errors.title)}
                        value={title}
                        maxLength={200}
                        autoFocus
                        placeholder="e.g. Pedestrian Truss Bridge"
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={() => touch('title')}
                      />
                    )}
                  </Field>
                  <Field label="Description" hint="Optional. A short statement of the design problem." className="sm:col-span-2">
                    {(id, d) => <TextArea id={id} aria-describedby={d} value={description} minRows={2} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />}
                  </Field>
                  <Field label="Author or team" required error={touched.author ? errors.author : null}>
                    {(id, d) => (
                      <TextInput
                        id={id}
                        aria-describedby={d}
                        aria-invalid={!!(touched.author && errors.author)}
                        value={author}
                        maxLength={200}
                        onChange={(e) => setAuthor(e.target.value)}
                        onBlur={() => touch('author')}
                      />
                    )}
                  </Field>
                  <Field label="Course or organization" hint="Optional.">
                    {(id, d) => <TextInput id={id} aria-describedby={d} value={organization} maxLength={200} onChange={(e) => setOrganization(e.target.value)} />}
                  </Field>
                  <Field
                    label="Project identifier"
                    required
                    error={touched.identifier || identifierEdit !== null ? errors.identifier : null}
                    hint={identifierEdit === null ? 'Suggested from the title and year. Edit to override.' : 'Letters, digits, dashes, underscores and dots.'}
                  >
                    {(id, d) => (
                      <TextInput
                        id={id}
                        mono
                        aria-describedby={d}
                        aria-invalid={!!((touched.identifier || identifierEdit !== null) && errors.identifier)}
                        value={identifier}
                        maxLength={40}
                        onChange={(e) => setIdentifierEdit(e.target.value)}
                        onBlur={() => touch('identifier')}
                      />
                    )}
                  </Field>
                  <Field label="Unit system">
                    {(id) => (
                      <Select id={id} value={unitSystem} onChange={(e) => setUnitSystem(e.target.value as UnitSystem)}>
                        <option value="SI">SI (metric)</option>
                        <option value="Imperial">Imperial</option>
                      </Select>
                    )}
                  </Field>
                </div>
              </section>

              <section aria-labelledby="dest-heading" className="rounded-lg border border-gunmetal bg-carbon">
                <h2 id="dest-heading" className="border-b border-gunmetal px-4 py-2.5 text-[13px] font-semibold text-white">
                  Destination
                </h2>
                <div className="flex flex-col gap-3 p-4">
                  <Field label="Parent folder" required error={touched.parent ? errors.parent : null}>
                    {(id, d) => (
                      <div className="flex gap-2">
                        <TextInput id={id} mono readOnly aria-describedby={d} value={parent} placeholder="No folder chosen" title={parent} />
                        <Button variant="secondary" icon={FolderOpen} onClick={() => void chooseFolder()}>
                          Choose…
                        </Button>
                      </div>
                    )}
                  </Field>
                  <Field label="Folder name" required error={touched.folder || folderEdit !== null ? errors.folder : null} hint="A new folder with this name is created inside the parent folder.">
                    {(id, d) => (
                      <TextInput
                        id={id}
                        mono
                        aria-describedby={d}
                        aria-invalid={!!((touched.folder || folderEdit !== null) && errors.folder)}
                        value={folderName}
                        maxLength={120}
                        onChange={(e) => setFolderEdit(e.target.value)}
                        onBlur={() => touch('folder')}
                      />
                    )}
                  </Field>
                  <div aria-live="polite" className="min-h-5 text-xs">
                    {target.status === 'checking' ? (
                      <span className="inline-flex items-center gap-1.5 text-silver">
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        Checking destination…
                      </span>
                    ) : target.status === 'ok' ? (
                      <span className="inline-flex items-start gap-1.5 text-[#6ee7b7]">
                        <CircleCheck size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="font-medium">Ready.</span> <span className="text-silver">{target.message}</span>
                          <span className="block font-mono text-2xs break-all text-dim">{target.path}</span>
                        </span>
                      </span>
                    ) : target.status === 'error' ? (
                      <span className="inline-flex items-start gap-1.5 text-[#fca5a5]" role="alert">
                        <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>
                          <span className="font-medium">Cannot use this destination.</span> {target.message}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <Checkbox checked={gitignore} onChange={setGitignore} label="Add a project .gitignore (excludes local backups and temporary files)" />
                </div>
              </section>

              {template ? (
                <section aria-labelledby="preview-heading" className="rounded-lg border border-gunmetal bg-carbon">
                  <h2 id="preview-heading" className="border-b border-gunmetal px-4 py-2.5 text-[13px] font-semibold text-white">
                    What will be created
                  </h2>
                  <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
                    <pre
                      tabIndex={0}
                      aria-label="Directory preview"
                      className="selectable max-h-72 overflow-auto rounded-md border border-gunmetal bg-obsidian p-3 font-mono text-[12px] leading-5 text-silver"
                    >
                      {treeLines.length > 0 ? treeLines.join('\n') : 'Enter a project title to preview the folder structure.'}
                    </pre>
                    <div className="flex flex-col gap-2 text-xs text-silver">
                      <p className="font-medium text-white">Starting content</p>
                      <ul className="flex flex-col gap-1.5">
                        <li>
                          <span className="font-mono text-white">{template.suggestedRequirements.length}</span> suggested requirements
                        </li>
                        <li>
                          <span className="font-mono text-white">{template.suggestedArguments.length}</span> suggested engineering arguments
                        </li>
                        <li>
                          <span className="font-mono text-white">{template.reviewChecklist.length}</span> design review items
                        </li>
                      </ul>
                      <p className="text-2xs text-dim">Everything is a starting point. You can edit, replace or delete any of it after the project is created.</p>
                    </div>
                  </div>
                </section>
              ) : null}

              {createError ? (
                <div role="alert" className="flex gap-2 rounded-md border border-crimson/40 bg-crimson/10 px-3 py-2 text-xs text-[#fca5a5]">
                  <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">The project could not be created</p>
                    <p className="text-silver">{createError}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gunmetal bg-carbon px-6 py-2.5">
        <Button variant="ghost" onClick={cancel} disabled={creating}>
          Cancel
        </Button>
        <div className="flex min-w-0 items-center gap-3">
          {step === 2 && blocker && !creating ? (
            <span className="hidden min-w-0 truncate text-2xs text-dim md:inline" id="create-blocker" title={blocker}>
              {blocker}
            </span>
          ) : null}
          {step === 2 ? (
            <>
              <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(1)} disabled={creating}>
                Back
              </Button>
              <Button variant="primary" icon={Rocket} loading={creating} disabled={!canCreate} aria-describedby={blocker ? 'create-blocker' : undefined} onClick={() => void create()}>
                {creating ? 'Creating…' : 'Create Project'}
              </Button>
            </>
          ) : (
            <Button variant="primary" iconRight={ArrowRight} disabled={!discipline} onClick={() => setStep(2)}>
              Continue
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
