import { createSettingsAutosave } from './settings-autosave';
import { useAppStore } from './store';

export const settingsSession = createSettingsAutosave(
  (updates) => window.api.setSettings(updates),
  (settings) => useAppStore.getState().setSettings(settings),
);

// This subscription outlives the Settings page, including model import/download operations.
useAppStore.subscribe((state, previous) => {
  if (state.settings && state.settings !== previous.settings)
    settingsSession.accept(state.settings);
});
