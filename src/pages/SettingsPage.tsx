import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, FileText, FolderOpen, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { AppSettingsPatch } from '@shared/schemas/settings';
import type { UnitSystem } from '@shared/schemas/project';
import logo from '@/assets/logo-mark.svg';
import { BRANDING } from '@/config/branding';
import { api } from '@/lib/api';
import { confirmDialog, notify, useUiStore } from '@/stores/uiStore';
import { Button, Callout, Checkbox, Code, Field, Select, Spinner, TextInput } from '@/components/common/ui';

const AUTOSAVE_DELAYS: { ms: number; label: string }[] = [
  { ms: 1000, label: '1 second' },
  { ms: 1500, label: '1.5 seconds' },
  { ms: 3000, label: '3 seconds' },
  { ms: 5000, label: '5 seconds' },
  { ms: 10000, label: '10 seconds' }
];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-gunmetal bg-carbon">
      <div className="border-b border-gunmetal px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-white">{title}</h2>
        {description ? <p className="text-2xs text-dim">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const settings = useUiStore((s) => s.settings);
  const appInfo = useUiStore((s) => s.appInfo);
  const setScreen = useUiStore((s) => s.setScreen);
  const previousScreen = useUiStore((s) => s.previousScreen);

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<number | undefined>(undefined);
  const [retention, setRetention] = useState<string>(String(settings?.backupRetention ?? 10));
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [notices, setNotices] = useState<{ status: 'idle' | 'loading' | 'loaded' | 'error'; text: string }>({ status: 'idle', text: '' });

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);
  useEffect(() => {
    if (settings) setRetention(String(settings.backupRetention));
  }, [settings?.backupRetention]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading settings…" />
      </div>
    );
  }

  const apply = async (patch: AppSettingsPatch): Promise<boolean> => {
    try {
      await useUiStore.getState().updateSettings(patch);
      setError(null);
      setSaved(true);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (err) {
      setSaved(false);
      setError(err instanceof Error ? err.message : 'The setting could not be saved.');
      return false;
    }
  };

  const commitRetention = () => {
    const raw = retention.trim();
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < 3 || n > 50) {
      setRetentionError('Enter a whole number from 3 to 50.');
      return;
    }
    setRetentionError(null);
    if (n !== settings.backupRetention) void apply({ backupRetention: n });
  };

  const chooseLocation = async () => {
    try {
      const dir = await api().dialog.chooseDirectory('Choose the default folder for new projects');
      if (dir) await apply({ defaultProjectLocation: dir });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The folder picker could not be opened.');
    }
  };

  const loadNotices = async () => {
    setNotices({ status: 'loading', text: '' });
    try {
      const text = await api().app.getThirdPartyNotices();
      setNotices({ status: 'loaded', text: text.trim() === '' ? 'No third-party notices were found in this build.' : text });
    } catch (err) {
      setNotices({ status: 'error', text: err instanceof Error ? err.message : 'The notices could not be loaded.' });
    }
  };

  const resetPreferences = async () => {
    const choice = await confirmDialog({
      title: 'Reset preferences?',
      message:
        'All FrameLytix preferences return to their defaults. Your projects and the recent projects list are not changed, and no project files are modified.',
      confirmLabel: 'Reset preferences',
      danger: true
    });
    if (choice !== 'confirm') return;
    try {
      const fresh = await api().settings.reset();
      useUiStore.getState().setSettings(fresh);
      setRetentionError(null);
      setError(null);
      notify({ tone: 'success', message: 'Preferences reset to defaults' });
    } catch (err) {
      notify({ tone: 'error', message: 'Preferences could not be reset', detail: err instanceof Error ? err.message : String(err) });
    }
  };

  const delayKnown = AUTOSAVE_DELAYS.some((d) => d.ms === settings.autosaveDelayMs);
  const effectiveLocation = settings.defaultProjectLocation || appInfo?.defaultProjectsDir || '';

  return (
    <div className="flex h-full flex-col bg-obsidian">
      <header className="flex items-center justify-between gap-3 border-b border-gunmetal bg-carbon px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => setScreen(previousScreen)}>
            Back
          </Button>
          <h1 className="text-[15px] font-semibold tracking-tight text-white">Settings</h1>
        </div>
        <div aria-live="polite" className="min-h-5 text-xs">
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-[#6ee7b7]">
              <Check size={13} aria-hidden="true" />
              Saved
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="inline-flex items-center gap-1.5 text-[#fca5a5]">
              <TriangleAlert size={13} aria-hidden="true" />
              {error}
            </span>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Section title="Projects">
            <Field label="Default project location" hint="Where new projects are created by default. You can still choose a different folder for each project.">
              {(id, d) => (
                <div className="flex gap-2">
                  <TextInput
                    id={id}
                    mono
                    readOnly
                    aria-describedby={d}
                    value={settings.defaultProjectLocation}
                    placeholder={effectiveLocation ? `Not set (using ${effectiveLocation})` : 'Not set'}
                    title={effectiveLocation}
                  />
                  <Button variant="secondary" icon={FolderOpen} onClick={() => void chooseLocation()}>
                    Choose…
                  </Button>
                  <Button variant="ghost" disabled={!settings.defaultProjectLocation} onClick={() => void apply({ defaultProjectLocation: '' })}>
                    Clear
                  </Button>
                </div>
              )}
            </Field>
            <Field label="Default unit system" hint="Preselected when you create a new project. Each project keeps its own unit system.">
              {(id, d) => (
                <Select id={id} aria-describedby={d} className="sm:max-w-xs" value={settings.defaultUnitSystem} onChange={(e) => void apply({ defaultUnitSystem: e.target.value as UnitSystem })}>
                  <option value="SI">SI (metric)</option>
                  <option value="Imperial">Imperial</option>
                </Select>
              )}
            </Field>
          </Section>

          <Section title="Saving">
            <Checkbox
              checked={settings.autosaveEnabled}
              onChange={(v) => void apply({ autosaveEnabled: v })}
              label="Autosave changes"
              description="Saves your project automatically shortly after you stop editing. Demo projects are always temporary."
            />
            <Field label="Autosave delay" hint="How long to wait after your last edit before saving.">
              {(id, d) => (
                <Select
                  id={id}
                  aria-describedby={d}
                  className="sm:max-w-xs"
                  disabled={!settings.autosaveEnabled}
                  value={settings.autosaveDelayMs}
                  onChange={(e) => void apply({ autosaveDelayMs: Number(e.target.value) })}
                >
                  {AUTOSAVE_DELAYS.map((o) => (
                    <option key={o.ms} value={o.ms}>
                      {o.label}
                    </option>
                  ))}
                  {delayKnown ? null : <option value={settings.autosaveDelayMs}>{`${settings.autosaveDelayMs / 1000} seconds`}</option>}
                </Select>
              )}
            </Field>
            <Field label="Backup retention" error={retentionError} hint="Number of manifest backups kept in each project's .framelytix/backups folder (3 to 50).">
              {(id, d) => (
                <TextInput
                  id={id}
                  mono
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={50}
                  step={1}
                  aria-describedby={d}
                  aria-invalid={!!retentionError}
                  className="sm:max-w-[8rem]"
                  value={retention}
                  onChange={(e) => {
                    setRetention(e.target.value);
                    setRetentionError(null);
                  }}
                  onBlur={commitRetention}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRetention();
                  }}
                />
              )}
            </Field>
          </Section>

          <Section title="Interface">
            <Checkbox
              checked={settings.sidebarCollapsed}
              onChange={(v) => void apply({ sidebarCollapsed: v })}
              label="Collapse the project sidebar by default"
              description="Applies when a project is opened."
            />
            <Checkbox
              checked={settings.reducedMotion}
              onChange={(v) => void apply({ reducedMotion: v })}
              label="Reduce motion"
              description="Turns off animations and transitions. FrameLytix also follows your operating system setting."
            />
          </Section>

          <Section title="About FrameLytix">
            <div className="flex items-start gap-3">
              <img src={logo} alt="" width={40} height={40} className="h-10 w-10 rounded-lg" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {BRANDING.appName} <Code className="ml-1">v{appInfo?.version ?? BRANDING.version}</Code>
                </p>
                <p className="text-xs text-silver">{BRANDING.tagline}</p>
                <p className="text-xs text-dim">{BRANDING.category}</p>
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-silver">
              <ShieldCheck size={14} className="mt-px shrink-0 text-[#6ee7b7]" aria-hidden="true" />
              <span>Offline-first: no accounts, no telemetry, no network access. Your projects stay on this computer.</span>
            </p>
            {appInfo ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-dim">Platform</dt>
                <dd className="font-mono text-silver">{appInfo.platform}</dd>
                <dt className="text-dim">Build</dt>
                <dd className="text-silver">{appInfo.isPackaged ? 'Packaged' : 'Development'}</dd>
              </dl>
            ) : null}
          </Section>

          <Callout tone="amber" icon={TriangleAlert} title="Educational use only">
            {BRANDING.disclaimer}
          </Callout>

          <Section title="Third-party licences" description="Open-source components bundled with FrameLytix.">
            <div>
              <Button variant="secondary" icon={FileText} loading={notices.status === 'loading'} onClick={() => void loadNotices()}>
                {notices.status === 'loaded' ? 'Reload licence notices' : 'Show licence notices'}
              </Button>
            </div>
            {notices.status === 'error' ? (
              <p role="alert" className="text-xs text-[#fca5a5]">
                {notices.text}
              </p>
            ) : null}
            {notices.status === 'loaded' ? (
              <pre
                tabIndex={0}
                aria-label="Third-party licence notices"
                className="selectable max-h-72 overflow-auto rounded-md border border-gunmetal bg-obsidian p-3 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-silver"
              >
                {notices.text}
              </pre>
            ) : null}
          </Section>

          <Section title="Reset preferences">
            <p className="text-xs text-silver">
              Restores every setting on this page to its default. This does not modify your projects or the recent projects list.
            </p>
            <div>
              <Button variant="danger" icon={RotateCcw} onClick={() => void resetPreferences()}>
                Reset preferences…
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
