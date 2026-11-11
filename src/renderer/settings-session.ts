import { createSettingsAutosave } from './settings-autosave';
import { useAppStore } from './store';
import { engineIsActive } from './engine-status';

/** True when the local engine's model is installed and verified, i.e. it can be used now. */
export function localModelInstalled(engine: 'mfr' | 'texteller'): boolean {
  const { settings, mfrStatus, textellerStatus } = useAppStore.getState();
  const status = engine === 'mfr' ? mfrStatus : textellerStatus;
  const enabled = engine === 'mfr' ? settings?.mfrModelEnabled : settings?.textellerModelEnabled;
  return !!enabled && status?.state === 'ready';
}

export const settingsSession = createSettingsAutosave(
  (updates) => window.api.setSettings(updates),
  (settings) => useAppStore.getState().setSettings(settings),
  450,
  (updates) => window.api.connectEngine(updates),
  (engine) => engine === 'paddleocr' || (!localModelInstalled(engine) && engineInUseWorks()),
);

/**
 * Choosing a local engine whose model is not installed must not break a working setup:
 * the choice is previewed until the model is downloaded or imported. When the engine in
 * use does not work either, there is nothing to protect and the choice applies at once.
 */
export function engineInUseWorks(): boolean {
  const { settings, engineStatuses, mfrStatus, textellerStatus } = useAppStore.getState();
  return (
    !!settings &&
    engineIsActive(settings.ocrEngine, settings, engineStatuses, mfrStatus, textellerStatus)
  );
}

// This subscription outlives the Settings page, including model import/download operations.
useAppStore.subscribe((state, previous) => {
  if (state.settings && state.settings !== previous.settings)
    settingsSession.accept(state.settings);
});
