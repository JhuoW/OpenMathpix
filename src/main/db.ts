import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { HistoryItem, Pipeline } from '../shared/types';

interface HistoryStore {
  nextId: number;
  items: HistoryItem[];
}

let storePath: string;
let store: HistoryStore = { nextId: 1, items: [] };

export function initDb(): void {
  storePath = path.join(app.getPath('userData'), 'history.json');
  if (fs.existsSync(storePath)) {
    try {
      store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    } catch {
      store = { nextId: 1, items: [] };
    }
  }
}

function save(): void {
  fs.writeFileSync(storePath, JSON.stringify(store), 'utf-8');
}

export function addHistoryItem(
  pipeline: Pipeline,
  imageThumbnail: string,
  latex: string,
  markdown: string,
  text: string,
): number {
  const id = store.nextId++;
  store.items.push({
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
}

export function getHistory(limit = 50, offset = 0): HistoryItem[] {
  const sorted = [...store.items].reverse();
  return sorted.slice(offset, offset + limit);
}

export function searchHistory(query: string): HistoryItem[] {
  const q = query.toLowerCase();
  return [...store.items]
    .reverse()
    .filter(
      (item) =>
        item.resultLatex.toLowerCase().includes(q) ||
        item.resultMarkdown.toLowerCase().includes(q) ||
        item.resultText.toLowerCase().includes(q),
    )
    .slice(0, 100);
}

export function deleteHistoryItem(id: number): void {
  store.items = store.items.filter((item) => item.id !== id);
  save();
}

export function clearHistory(): void {
  store.items = [];
  save();
}

export function trimHistory(maxItems: number): void {
  if (store.items.length > maxItems) {
    store.items = store.items.slice(-maxItems);
    save();
  }
}
