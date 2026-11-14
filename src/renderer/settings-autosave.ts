import type { AppSettings, OCREngine } from '../shared/types';
import { validateSettingsUpdates } from '../shared/settings';

export type EditableSetting = Exclude<
  keyof AppSettings,
  | 'mfrModelPath'
  | 'mfrDownloadDirectory'
  | 'mfrModelEnabled'
  | 'textellerModelPath'
  | 'textellerDownloadDirectory'
  | 'textellerModelEnabled'
>;
export type SettingsGroup =
  | 'recognition'
  | 'snipHotkey'
  | 'defaultOutputFormat'
  | 'historyLimit'
  | 'theme'
  | 'language'
  | 'afterSnip'
  | 'latexCopyStyle'
  | 'cleanLatex'
  | 'modelSource'
  | 'launchAtLogin'
  | 'autoCheckUpdates';

const recognitionKeys = ['ocrEngine', 'apiUrl', 'accessToken', 'pipeline'] as const;
const groupFor = (key: EditableSetting): SettingsGroup =>
  recognitionKeys.includes(key as (typeof recognitionKeys)[number])
    ? 'recognition'
    : (key as SettingsGroup);

export interface AutosaveSnapshot {
  draft: AppSettings | null;
  applied: AppSettings | null;
  saving: SettingsGroup | null;
  pending: boolean;
  errors: Partial<Record<SettingsGroup, string>>;
}

/** A page-independent queue keeps edits alive when Settings is unmounted. */
export function createSettingsAutosave(
  save: (updates: Partial<AppSettings>) => Promise<AppSettings>,
  onApplied: (settings: AppSettings) => void,
  delayMs = 450,
  connectEngine: (updates: Partial<AppSettings>) => Promise<AppSettings> = save,
  /**
   * Engines that must be set up before choosing them takes effect. The cloud engine waits
   * for Connect & Use; a local engine without an installed model is only previewed, so the
   * engine in use keeps working until the new model has been downloaded or imported.
   */
  needsSetup: (engine: OCREngine) => boolean = (engine) => engine === 'paddleocr',
) {
  let applied: AppSettings | null = null;
  let draft: AppSettings | null = null;
  const savingGroups = new Set<SettingsGroup>();
  const dirty = new Set<EditableSetting>();
  const due = new Map<SettingsGroup, number>();
  const versions = new Map<SettingsGroup, number>();
  const errors: Partial<Record<SettingsGroup, string>> = {};
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let snapshot: AutosaveSnapshot = {
    draft,
    applied,
    saving: null,
    pending: false,
    errors: {},
  };

  // Previewing a local engine that still needs a model is not an unsaved change.
  const previewOnly = (key: EditableSetting) =>
    key === 'ocrEngine' &&
    !!draft &&
    draft.ocrEngine !== 'paddleocr' &&
    needsSetup(draft.ocrEngine);

  function emit() {
    const saving = savingGroups.has('recognition')
      ? 'recognition'
      : (savingGroups.values().next().value ?? null);
    snapshot = {
      draft,
      applied,
      saving,
      pending: due.size > 0 || [...dirty].some((key) => !previewOnly(key)),
      errors: { ...errors },
    };
    for (const listener of listeners) listener();
  }

  function accept(settings: AppSettings) {
    applied = { ...settings };
    const next = { ...settings };
    if (draft) {
      for (const key of dirty) Object.assign(next, { [key]: draft[key] });
    }
    draft = next;
    emit();
  }

  function schedule() {
    clearTimeout(timer);
    timer = undefined;
    const waiting = [...due].filter(([group]) => !savingGroups.has(group));
    if (!waiting.length) return;
    const next = Math.min(...waiting.map(([, time]) => time));
    timer = setTimeout(processDue, Math.max(0, next - Date.now()));
  }

  function processDue() {
    for (const [group, time] of due) {
      if (!savingGroups.has(group) && time <= Date.now()) void processGroup(group);
    }
    schedule();
  }

  async function processGroup(group: SettingsGroup, connecting = false) {
    if (!draft || !applied) return;
    due.delete(group);
    if (group === 'recognition' && needsSetup(draft.ocrEngine) && !connecting) {
      emit();
      return;
    }
    const version = versions.get(group);
    const keys = [...dirty].filter((key) => groupFor(key) === group);
    const submitted = { ...draft };
    const updates = Object.fromEntries(
      keys.filter((key) => submitted[key] !== applied![key]).map((key) => [key, submitted[key]]),
    ) as Partial<AppSettings>;
    if (connecting) updates.ocrEngine = submitted.ocrEngine;
    if (!Object.keys(updates).length) {
      for (const key of keys) dirty.delete(key);
      delete errors[group];
      emit();
      schedule();
      return;
    }
    savingGroups.add(group);
    emit();
    try {
      const result = await (connecting ? connectEngine : save)(validateSettingsUpdates(updates));
      // A response for an earlier edit must never erase text typed while it was in flight.
      for (const key of keys) {
        if (draft[key] === submitted[key]) dirty.delete(key);
      }
      // Other groups and model import may have committed while this request was running.
      // Only this request's keys belong to its response; broadcasts own the full snapshot.
      const committed = { ...applied };
      for (const key of Object.keys(updates) as EditableSetting[]) {
        Object.assign(committed, { [key]: result[key] });
      }
      accept(committed);
      onApplied(committed);
      if (versions.get(group) === version) delete errors[group];
    } catch (error) {
      if (versions.get(group) === version) {
        errors[group] = cleanSettingsError(error);
      }
    } finally {
      savingGroups.delete(group);
      emit();
      schedule();
    }
  }

  function edit<K extends EditableSetting>(key: K, value: AppSettings[K], immediate = false) {
    if (!draft || !applied) return;
    const group = groupFor(key);
    // A hidden draft for another provider must not block the newly selected engine.
    if (key === 'ocrEngine') {
      const irrelevantKeys: EditableSetting[] = [
        ...(value !== 'paddleocr' ? (['apiUrl', 'accessToken', 'pipeline'] as const) : []),
      ];
      for (const cloudKey of irrelevantKeys) {
        draft = { ...draft, [cloudKey]: applied[cloudKey] };
        dirty.delete(cloudKey);
      }
    }
    draft = { ...draft, [key]: value };
    // Keep a reversal while a write is in flight: its eventual result may differ
    // from the current applied snapshot. Otherwise an unchanged draft is clean.
    if (!savingGroups.has(group) && value === applied[key]) dirty.delete(key);
    else dirty.add(key);
    delete errors[group];
    versions.set(group, (versions.get(group) ?? 0) + 1);
    if (
      (group === 'recognition' && needsSetup(draft.ocrEngine)) ||
      ![...dirty].some((candidate) => groupFor(candidate) === group)
    )
      due.delete(group);
    else due.set(group, Date.now() + (immediate ? 0 : delayMs));
    emit();
    schedule();
  }

  function flush(group?: SettingsGroup) {
    for (const pending of due.keys()) {
      if (!group || pending === group) due.set(pending, Date.now());
    }
    schedule();
  }

  async function flushAndWait(): Promise<boolean> {
    flush();
    if (due.size || savingGroups.size) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (due.size || savingGroups.size) return;
          listeners.delete(check);
          resolve();
        };
        listeners.add(check);
        check();
      });
    }
    return [...dirty].every(previewOnly) && Object.keys(errors).length === 0;
  }

  return {
    accept,
    edit,
    flush,
    flushAndWait,
    async connect(): Promise<boolean> {
      if (!draft || savingGroups.has('recognition')) return false;
      await processGroup('recognition', true);
      return !errors.recognition && ![...dirty].some((key) => groupFor(key) === 'recognition');
    },
    resetRecognition(): void {
      if (!draft || !applied || savingGroups.has('recognition')) return;
      for (const key of recognitionKeys) {
        Object.assign(draft, { [key]: applied[key] });
        dirty.delete(key);
      }
      draft = { ...draft };
      due.delete('recognition');
      delete errors.recognition;
      emit();
      schedule();
    },
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function cleanSettingsError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Could not apply this setting.';
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
}
