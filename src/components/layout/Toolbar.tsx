import { Home, FilePlus2, FolderOpen, Save, FileDown, Settings, PanelLeft } from 'lucide-react';
import { IconButton, Kbd } from '@/components/common/ui';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore, navigate } from '@/stores/uiStore';
import { goHome, openProjectDialog, saveNow, startNewProject } from '@/lib/projectActions';
import logoMark from '@/assets/logo-mark.svg';

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export function Toolbar() {
  const manifest = useProjectStore((s) => s.manifest);
  const saveState = useProjectStore((s) => s.saveState);
  const collapsed = useUiStore((s) => s.settings?.sidebarCollapsed ?? false);
  const updateSettings = useUiStore((s) => s.updateSettings);
  const setScreen = useUiStore((s) => s.setScreen);

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-gunmetal bg-carbon px-2" role="toolbar" aria-label="Main toolbar">
      <div className="mr-2 flex items-center gap-2 pl-1">
        <img src={logoMark} alt="" className="h-5 w-5" />
        <span className="text-[13px] font-semibold tracking-tight text-white">FrameLytix</span>
      </div>
      <div className="mx-1 h-5 w-px bg-gunmetal" aria-hidden="true" />
      <IconButton icon={PanelLeft} label={`Toggle sidebar (${MOD}+B)`} active={!collapsed} onClick={() => void updateSettings({ sidebarCollapsed: !collapsed })} />
      <IconButton icon={Home} label="Home" onClick={() => void goHome()} />
      <IconButton icon={FilePlus2} label={`New project (${MOD}+N)`} onClick={() => void startNewProject()} />
      <IconButton icon={FolderOpen} label={`Open project (${MOD}+O)`} onClick={() => void openProjectDialog()} />
      <IconButton icon={Save} label={`Save (${MOD}+S)`} disabled={!manifest || saveState === 'saving'} onClick={() => void saveNow()} />
      <IconButton icon={FileDown} label="Export report" disabled={!manifest} onClick={() => navigate({ view: 'report' })} />
      <div className="flex-1" />
      {manifest ? (
        <span className="hidden truncate text-xs text-silver md:block" title={manifest.project.title}>
          {manifest.project.title}
        </span>
      ) : null}
      <div className="flex-1" />
      <span className="hidden items-center gap-1 text-2xs text-dim lg:flex">
        <Kbd>{MOD}</Kbd>
        <Kbd>S</Kbd> save
      </span>
      <IconButton icon={Settings} label="Settings" onClick={() => setScreen('settings')} />
    </div>
  );
}
