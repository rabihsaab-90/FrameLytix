/**
 * Application menu (Canadian English). Shortcuts are owned by the renderer, so accelerators
 * are displayed but not registered (registerAccelerator: false) on Windows/Linux; menu clicks
 * send IPC_EVENTS.menuCommand.
 */
import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import { IPC_EVENTS, type MenuCommand } from '../shared/types/ipc';
import { BRANDING } from '../src/config/branding';
import type { AppState } from './appState';

export function buildMenu(state: AppState): void {
  const send = (command: MenuCommand) => () => state.send(IPC_EVENTS.menuCommand, command);
  const cmd = (label: string, command: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    click: send(command),
    ...(accelerator ? { accelerator, registerAccelerator: false } : {})
  });
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: BRANDING.appName,
            submenu: [
              cmd(`About ${BRANDING.appName}`, 'about'),
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit', label: `Quit ${BRANDING.appName}` }
            ] as MenuItemConstructorOptions[]
          }
        ]
      : []),
    {
      label: '&File',
      submenu: [
        cmd('New Project…', 'new', 'CmdOrCtrl+N'),
        cmd('Open Project…', 'open', 'CmdOrCtrl+O'),
        { type: 'separator' },
        cmd('Save', 'save', 'CmdOrCtrl+S'),
        cmd('Export Report…', 'export', 'CmdOrCtrl+E'),
        ...(isMac ? [] : ([{ type: 'separator' }, { role: 'quit', label: 'Exit' }] as MenuItemConstructorOptions[]))
      ]
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll', label: 'Select All' }
      ]
    },
    {
      label: '&View',
      submenu: [
        { role: 'togglefullscreen', label: 'Toggle Full Screen' },
        ...(!app.isPackaged
          ? ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools', label: 'Toggle Developer Tools' }] as MenuItemConstructorOptions[])
          : [])
      ]
    },
    {
      label: '&Help',
      submenu: [cmd(`About ${BRANDING.appName}`, 'about')]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
