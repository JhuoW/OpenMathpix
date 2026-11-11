import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import type { HistoryItem, HistoryUpdate } from '../shared/types';

interface HistoryData {
  nextId: number;
  items: HistoryItem[];
}

const MAX_RESULT_LENGTH = 1_000_000;
const MAX_THUMBNAIL_LENGTH = 5 * 1024 * 1024;
const RESULT_KEYS = ['resultLatex', 'resultMarkdown', 'resultText'] as const;
const PIPELINES = new Set<HistoryItem['pipeline']>([
  'MFR-1.5',
  'TexTeller',
  'PP-OCRv5',
  'PP-StructureV3',
  'PaddleOCR-VL',
  'PaddleOCR-VL-1.5',
]);

function isText(value: unknown, maxLength = MAX_RESULT_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function validId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isHistoryData(value: unknown): value is HistoryData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<HistoryData>;
  if (!validId(data.nextId) || !Array.isArray(data.items)) return false;
  const ids = new Set<number>();
  for (const item of data.items) {
    if (
      !item ||
      typeof item !== 'object' ||
      !validId(item.id) ||
      ids.has(item.id) ||
      item.id >= data.nextId ||
      typeof item.pipeline !== 'string' ||
      !item.pipeline ||
      !isText(item.timestamp, 100) ||
      !Number.isFinite(Date.parse(item.timestamp)) ||
      !isText(item.imageThumbnail, MAX_THUMBNAIL_LENGTH) ||
      !RESULT_KEYS.every((key) => isText(item[key]))
    )
      return false;
    ids.add(item.id);
  }
  return true;
}

function validateId(id: number): void {
  if (!validId(id)) throw new Error('Invalid history entry ID.');
}

function validateCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid history item count.');
}

/** A JSON history file that is replaced atomically and never silently discarded. */
export function createHistoryStore(storePath: string) {
  let data: HistoryData = { nextId: 1, items: [] };
  let protectedOriginal = false;

  if (fs.existsSync(storePath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      if (!isHistoryData(parsed)) throw new Error('Unexpected history format');
      data = parsed;
    } catch (error) {
      // A unique backup preserves even repeated failed launches in the same millisecond.
      const backup =
        storePath.replace(/\.json$/, '') + `.corrupt-${Date.now()}-${randomUUID()}.json`;
      try {
        fs.renameSync(storePath, backup);
        console.warn(`History file was unreadable and has been kept at ${backup}:`, error);
      } catch (renameError) {
        protectedOriginal = true;
        console.warn('Could not back up the unreadable history file:', renameError);
      }
    }
  }

  function ensureAvailable(): void {
    if (protectedOriginal) {
      throw new Error(
        'History is protected because its original file could not be backed up. Check file permissions and restart OpenMathpix.',
      );
    }
  }

  function commit(next: HistoryData): void {
    ensureAvailable();
    // A failed disk operation must leave both the disk file and in-memory snapshot intact.
    const temporary = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(next), {
        encoding: 'utf-8',
        flag: 'wx',
        flush: true,
      });
      fs.renameSync(temporary, storePath);
    } catch (error) {
      try {
        fs.rmSync(temporary, { force: true });
      } catch {
        /* Preserve the original write error. */
      }
      throw error;
    }
    data = next;
  }

  return {
    add(
      pipeline: HistoryItem['pipeline'],
      imageThumbnail: string,
      latex: string,
      markdown: string,
      text: string,
    ): number {
      ensureAvailable();
      if (
        !PIPELINES.has(pipeline) ||
        !isText(imageThumbnail, MAX_THUMBNAIL_LENGTH) ||
        ![latex, markdown, text].every((value) => isText(value))
      ) {
        throw new Error('Invalid history entry.');
      }
      if (data.nextId >= Number.MAX_SAFE_INTEGER)
        throw new Error('History entry IDs are exhausted.');
      const id = data.nextId;
      const item: HistoryItem = {
        id,
        timestamp: new Date().toISOString(),
        pipeline,
        imageThumbnail,
        resultLatex: latex,
        resultMarkdown: markdown,
        resultText: text,
      };
      commit({ nextId: id + 1, items: [...data.items, item] });
      return id;
    },

    list(limit = 50, offset = 0): HistoryItem[] {
      ensureAvailable();
      validateCount(limit);
      validateCount(offset);
      return [...data.items]
        .reverse()
        .slice(offset, offset + limit)
        .map((item) => ({ ...item }));
    },

    search(query: string): HistoryItem[] {
      ensureAvailable();
      if (!isText(query)) throw new Error('Invalid history search.');
      const q = query.toLowerCase();
      return [...data.items]
        .reverse()
        .filter((item) => RESULT_KEYS.some((key) => item[key].toLowerCase().includes(q)))
        .slice(0, 100)
        .map((item) => ({ ...item }));
    },

    /** Store the user's corrections; returns false when the entry no longer exists. */
    update(id: number, updates: HistoryUpdate): boolean {
      ensureAvailable();
      validateId(id);
      if (
        !updates ||
        typeof updates !== 'object' ||
        Array.isArray(updates) ||
        Object.keys(updates).some(
          (key) => !RESULT_KEYS.includes(key as (typeof RESULT_KEYS)[number]),
        )
      ) {
        throw new Error('Invalid history update.');
      }
      const patch: HistoryUpdate = {};
      // Validate the whole patch before changing any field, including absent-entry requests.
      for (const key of RESULT_KEYS) {
        const value = updates[key];
        if (value === undefined) continue;
        if (!isText(value)) throw new Error('Invalid history update.');
        patch[key] = value;
      }
      const index = data.items.findIndex((entry) => entry.id === id);
      if (index < 0) return false;
      if (!Object.keys(patch).length) return true;
      const items = [...data.items];
      items[index] = { ...items[index], ...patch };
      commit({ ...data, items });
      return true;
    },

    remove(id: number): void {
      ensureAvailable();
      validateId(id);
      const items = data.items.filter((item) => item.id !== id);
      if (items.length !== data.items.length) commit({ ...data, items });
    },

    clear(): void {
      ensureAvailable();
      if (data.items.length) commit({ ...data, items: [] });
    },

    trim(maxItems: number): void {
      ensureAvailable();
      validateCount(maxItems);
      if (data.items.length > maxItems) {
        commit({ ...data, items: maxItems === 0 ? [] : data.items.slice(-maxItems) });
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
