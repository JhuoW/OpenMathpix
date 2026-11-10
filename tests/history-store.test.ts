import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHistoryStore } from '../src/main/db';

function withDirectory(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'openmathpix-history-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('history persists through a reload and leaves no temporary files', () => {
  withDirectory((directory) => {
    const path = join(directory, 'history.json');
    const store = createHistoryStore(path);
    const first = store.add('MFR-1.5', 'thumb', 'x', '$$\nx\n$$', 'x');
    store.add('PP-OCRv5', 'thumb', '', 'text', 'text');
    assert.deepEqual(readdirSync(directory), ['history.json']);

    const reloaded = createHistoryStore(path);
    assert.deepEqual(
      reloaded.list().map((item) => item.id),
      [first + 1, first],
    );
  });
});

test('a corrupt history file is kept as a backup instead of being overwritten', () => {
  withDirectory((directory) => {
    const path = join(directory, 'history.json');
    writeFileSync(path, '{"nextId": 3, "items": [', 'utf8');
    const store = createHistoryStore(path);
    assert.deepEqual(store.list(), []);
    const backups = readdirSync(directory).filter((name) => name.includes('.corrupt-'));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(directory, backups[0]), 'utf8'), '{"nextId": 3, "items": [');
    store.add('MFR-1.5', 'thumb', 'y', 'y', 'y');
    assert.equal(createHistoryStore(path).list()[0].resultLatex, 'y');
  });
});

test('corrections update only the edited fields of an existing entry', () => {
  withDirectory((directory) => {
    const path = join(directory, 'history.json');
    const store = createHistoryStore(path);
    const id = store.add('MFR-1.5', 'thumb', 'x', '$$\nx\n$$', 'x');
    assert.equal(store.update(id, { resultLatex: 'x+1' }), true);
    const [item] = createHistoryStore(path).list();
    assert.equal(item.resultLatex, 'x+1');
    assert.equal(item.resultMarkdown, '$$\nx\n$$');
    assert.equal(store.update(id + 100, { resultLatex: 'z' }), false);
    assert.throws(() => store.update(id, { resultLatex: 42 as unknown as string }));
  });
});
