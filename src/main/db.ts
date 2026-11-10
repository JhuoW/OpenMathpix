import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { HistoryItem, HistoryUpdate } from '../shared/types';

interface HistoryData {
  nextId: number;
  items: HistoryItem[];
}

const MAX_RESULT_LENGTH = 1_000_000;

function isHistoryData(value: unknown): value is HistoryData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<HistoryData>;
  return Number.isInteger(data.nextId) && Array.isArray(data.items);
}

/** A JSON history file that is replaced atomically and never silently discarded. */
export function createHistoryStore(storePath: string) {
  let data: HistoryData = { nextId: 1, items: [] };

  if (fs.existsSync(storePath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      if (!isHistoryData(parsed)) throw new Error('Unexpected history format');
      data = parsed;
    } catch (error) {
      // Keep the unreadable file for recovery instead of overwriting it on the next save.
      const backup = storePath.replace(/\.json$/, '') + `.corrupt-${Date.now()}.json`;
      try {
        fs.renameSync(storePath, backup);
        console.warn(`History file was unreadable and has been kept at ${backup}:`, error);
      } catch (renameError) {
        console.warn('Could not back up the unreadable history file:', renameError);
      }
    }
  }

  function save(): void {
    // Write a sibling file, then rename: a crash cannot leave a half-written history.
    const temporary = `${storePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(data), 'utf-8');
      fs.renameSync(temporary, storePath);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  return {
    add(
      pipeline: HistoryItem['pipeline'],
      imageThumbnail: string,
      latex: string,
      markdown: string,
      text: string,
    ): number {
      const id = data.nextId++;
      data.items.push({
        id,
        timestamp: new Date().toISOString(),
        pipeline,
        imageThumbnail,
        resultLatex: latex,
        resultMarkdown: markdown,
        resultText: text,
      });
      save();
      return id;
    },

    list(limit = 50, offset = 0): HistoryItem[] {
      return [...data.items].reverse().slice(offset, offset + limit);
    },

    search(query: string): HistoryItem[] {
      const q = query.toLowerCase();
      return [...data.items]
        .reverse()
        .filter(
          (item) =>
            item.resultLatex.toLowerCase().includes(q) ||
            item.resultMarkdown.toLowerCase().includes(q) ||
            item.resultText.toLowerCase().includes(q),
        )
        .slice(0, 100);
    },

    /** Store the user's corrections; returns false when the entry no longer exists. */
    update(id: number, updates: HistoryUpdate): boolean {
      const item = data.items.find((entry) => entry.id === id);
      if (!item) return false;
      for (const key of ['resultLatex', 'resultMarkdown', 'resultText'] as const) {
        const value = updates[key];
        if (value === undefined) continue;
        if (typeof value !== 'string' || value.length > MAX_RESULT_LENGTH) {
          throw new Error('Invalid history update.');
        }
        item[key] = value;
      }
      save();
      return true;
    },

    remove(id: number): void {
      data.items = data.items.filter((item) => item.id !== id);
      save();
    },

    clear(): void {
      data.items = [];
      save();
    },

    trim(maxItems: number): void {
      if (data.items.length > maxItems) {
        data.items = data.items.slice(-maxItems);
        save();
      }
    },
  };
}

type HistoryStore = ReturnType<typeof createHistoryStore>;
let store: HistoryStore | undefined;

function history(): HistoryStore {
  if (!store) throw new Error('History is not initialized.');
  return store;
}

export function initDb(): void {
  store = createHistoryStore(path.join(app.getPath('userData'), 'history.json'));
}

export const addHistoryItem: HistoryStore['add'] = (...args) => history().add(...args);
export const getHistory: HistoryStore['list'] = (...args) => history().list(...args);
export const searchHistory: HistoryStore['search'] = (...args) => history().search(...args);
export const updateHistoryItem: HistoryStore['update'] = (...args) => history().update(...args);
export const deleteHistoryItem: HistoryStore['remove'] = (...args) => history().remove(...args);
export const clearHistory: HistoryStore['clear'] = () => history().clear();
export const trimHistory: HistoryStore['trim'] = (...args) => history().trim(...args);
