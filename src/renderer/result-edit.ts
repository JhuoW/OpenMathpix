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
  const inFlight = new Map<number, Promise<void>>();
  const failed = new Map<number, HistoryUpdate>();
  const forgotten = new Set<number>();

  function flush(id: number): void {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    let updates = entry.updates;
    const previous = inFlight.get(id);
    // Serialize each entry so a slow earlier write cannot overwrite the last correction.
    const write = () => {
      if (forgotten.has(id)) return Promise.resolve();
      updates = { ...failed.get(id), ...updates };
      failed.delete(id);
      // IPC normally rejects asynchronously; keep a synchronous transport failure recoverable too.
      try {
        return save(id, updates);
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const task = (previous ? previous.then(write) : write())
      .then((saved) => {
        if (saved === false) throw new Error('History entry no longer exists.');
      })
      .catch(() => {
        if (forgotten.has(id)) return;
        failed.set(id, { ...failed.get(id), ...updates });
        onError();
      })
      .finally(() => {
        if (inFlight.get(id) === task) inFlight.delete(id);
      });
    inFlight.set(id, task);
  }

  return {
    schedule(id: number, updates: HistoryUpdate): void {
      if (forgotten.has(id)) return;
      const previous = pending.get(id);
      if (previous) clearTimeout(previous.timer);
      const merged = { ...previous?.updates, ...updates };
      pending.set(id, { updates: merged, timer: setTimeout(() => flush(id), delayMs) });
    },
    flushAll(): void {
      for (const id of [...pending.keys()]) flush(id);
    },
    /** After confirmed deletion, never retry edits or report failures for the removed records. */
    forget(id?: number): void {
      const ids =
        id === undefined
          ? new Set([...pending.keys(), ...inFlight.keys(), ...failed.keys()])
          : new Set([id]);
      for (const removed of ids) {
        forgotten.add(removed);
        clearTimeout(pending.get(removed)?.timer);
        pending.delete(removed);
        failed.delete(removed);
      }
    },
    async flushAndWait(): Promise<boolean> {
      // A previous failure is retried only on an explicit flush, never in a tight loop.
      for (const [id, updates] of failed) {
        const queued = pending.get(id);
        pending.set(id, {
          updates: { ...updates, ...queued?.updates },
          timer: queued?.timer ?? setTimeout(() => {}, 0),
        });
      }
      failed.clear();
      do {
        for (const id of [...pending.keys()]) flush(id);
        await Promise.all(inFlight.values());
      } while (pending.size || inFlight.size);
      return failed.size === 0;
    },
  };
}
