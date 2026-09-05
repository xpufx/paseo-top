import { useSyncExternalStore } from "react";

export interface PillSettings {
  showCpuRam: boolean;
  showWorktree: boolean;
  showAgent: boolean;
  showLoad: boolean;
  showUptime: boolean;
  intervalSeconds: number;
}

export const DEFAULT_PILL_SETTINGS: PillSettings = {
  showCpuRam: true,
  showWorktree: true,
  showAgent: false,
  showLoad: false,
  showUptime: false,
  intervalSeconds: 4,
};

let currentSettings: PillSettings = { ...DEFAULT_PILL_SETTINGS };
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function getPillSettings(): PillSettings {
  return currentSettings;
}

export function updatePillSettings(partial: Partial<PillSettings>) {
  currentSettings = { ...currentSettings, ...partial };
  // Ensure at least one item remains active
  const anyActive =
    currentSettings.showCpuRam ||
    currentSettings.showWorktree ||
    currentSettings.showAgent ||
    currentSettings.showLoad ||
    currentSettings.showUptime;

  if (!anyActive) {
    currentSettings.showCpuRam = true;
  }

  notify();
}

export function usePillSettings(): [PillSettings, typeof updatePillSettings] {
  const settings = useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => currentSettings,
  );
  return [settings, updatePillSettings];
}
