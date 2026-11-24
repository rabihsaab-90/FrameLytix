/**
 * UI store: screens, workspace routing, preferences, toasts and confirm dialogs.
 */
import { create } from 'zustand';
import type { AppInfo } from '@shared/types/ipc';
import type { AppSettings, AppSettingsPatch } from '@shared/schemas/settings';
import type { Screen, WorkspaceRoute } from '@/lib/navigation';
import { api } from '@/lib/api';

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
  detail?: string;
  actions?: { label: string; run: () => void }[];
}

export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional third choice, e.g. "Don't save". */
  alternateLabel?: string;
  danger?: boolean;
  resolve: (choice: 'confirm' | 'cancel' | 'alternate') => void;
}

interface UiState {
  screen: Screen;
  /** Screen to return to when leaving settings. */
  previousScreen: Screen;
  route: WorkspaceRoute;
  history: WorkspaceRoute[];
  settings: AppSettings | null;
  appInfo: AppInfo | null;
  toasts: Toast[];
  confirmQueue: ConfirmRequest[];
  /** Optional right-hand context panel. */
  contextPanelOpen: boolean;
  searchFocusToken: number;

  setScreen(screen: Screen): void;
  navigate(route: WorkspaceRoute): void;
  back(): void;
  setSettings(settings: AppSettings): void;
  updateSettings(patch: AppSettingsPatch): Promise<void>;
  setAppInfo(info: AppInfo): void;
  notify(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  confirm(req: Omit<ConfirmRequest, 'id' | 'resolve'>): Promise<'confirm' | 'cancel' | 'alternate'>;
  resolveConfirm(id: number, choice: 'confirm' | 'cancel' | 'alternate'): void;
  toggleContextPanel(): void;
  requestSearchFocus(): void;
}

let nextId = 1;

export const useUiStore = create<UiState>()((set, get) => ({
  screen: 'welcome',
  previousScreen: 'welcome',
  route: { view: 'overview' },
  history: [],
  settings: null,
  appInfo: null,
  toasts: [],
  confirmQueue: [],
  contextPanelOpen: false,
  searchFocusToken: 0,

  setScreen(screen) {
    set((s) => ({ previousScreen: s.screen === 'settings' ? s.previousScreen : s.screen, screen }));
  },
  navigate(route) {
    set((s) => ({ route, history: [...s.history.slice(-49), s.route], screen: 'workspace' }));
  },
  back() {
    const h = get().history;
    const prev = h[h.length - 1];
    if (prev) set({ route: prev, history: h.slice(0, -1) });
  },
  setSettings(settings) {
    set({ settings });
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
  },
  async updateSettings(patch) {
    const updated = await api().settings.update(patch);
    get().setSettings(updated);
  },
  setAppInfo(info) {
    set({ appInfo: info });
  },
  notify(toast) {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id }] }));
    if (toast.tone !== 'error' && !toast.actions) {
      window.setTimeout(() => get().dismissToast(id), 5000);
    }
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  confirm(req) {
    return new Promise((resolve) => {
      const id = nextId++;
      set((s) => ({ confirmQueue: [...s.confirmQueue, { ...req, id, resolve }] }));
    });
  },
  resolveConfirm(id, choice) {
    const req = get().confirmQueue.find((r) => r.id === id);
    set((s) => ({ confirmQueue: s.confirmQueue.filter((r) => r.id !== id) }));
    req?.resolve(choice);
  },
  toggleContextPanel() {
    set((s) => ({ contextPanelOpen: !s.contextPanelOpen }));
  },
  requestSearchFocus() {
    set((s) => ({ searchFocusToken: s.searchFocusToken + 1 }));
  }
}));

export const notify = (t: Omit<Toast, 'id'>): void => useUiStore.getState().notify(t);
export const confirmDialog = (req: Omit<ConfirmRequest, 'id' | 'resolve'>) => useUiStore.getState().confirm(req);
export const navigate = (route: WorkspaceRoute): void => useUiStore.getState().navigate(route);
