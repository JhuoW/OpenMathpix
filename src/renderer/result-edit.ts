import type { HistoryUpdate, OCRResult, OutputFormat } from '../shared/types';
import { formulaMarkdown } from '../shared/latex-copy';

const FIELDS: Record<OutputFormat, keyof HistoryUpdate> = {
  latex: 'resultLatex',
  markdown: 'resultMarkdown',
  text: 'resultText',
};

/**
 * Apply a user correction. For a single formula, Markdown and text are derived from the
 * LaTeX, so editing the LaTeX keeps every copy format consistent.
 */
export function applyEdit(result: OCRResult, format: OutputFormat, value: string): OCRResult {
  if (format === 'latex' && result.kind === 'formula') {
    return { ...result, latex: value, markdown: formulaMarkdown(value.trim()), text: value };
  }
  return { ...result, [format]: value };
}

/** The history fields that differ between two results. */
export function historyChanges(before: OCRResult, after: OCRResult): HistoryUpdate {
  const changes: HistoryUpdate = {};
  for (const format of Object.keys(FIELDS) as OutputFormat[]) {
    if (before[format] !== after[format]) changes[FIELDS[format]] = after[format];
  }
  return changes;
}

export function isEdited(result: OCRResult | null, baseline: OCRResult | null): boolean {
  return (
    !!result &&
    !!baseline &&
    (result.latex !== baseline.latex ||
      result.markdown !== baseline.markdown ||
      result.text !== baseline.text)
  );
}

/** Saves the newest edit of each history entry after typing pauses. */
export function createHistorySaver(
  save: (id: number, updates: HistoryUpdate) => Promise<unknown>,
  onError: () => void,
  delayMs = 600,
) {
  const pending = new Map<
    number,
    { updates: HistoryUpdate; timer: ReturnType<typeof setTimeout> }
  >();

  function flush(id: number): void {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    void save(id, entry.updates).catch(onError);
  }

  return {
    schedule(id: number, updates: HistoryUpdate): void {
      const previous = pending.get(id);
      if (previous) clearTimeout(previous.timer);
      const merged = { ...previous?.updates, ...updates };
      pending.set(id, { updates: merged, timer: setTimeout(() => flush(id), delayMs) });
    },
    flushAll(): void {
      for (const id of [...pending.keys()]) flush(id);
    },
  };
}
