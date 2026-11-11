import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, mock, test } from 'node:test';
import { createHistoryStore } from '../src/main/db';
import type { HistoryUpdate } from '../src/shared/types';

afterEach(() => mock.restoreAll());

function withDirectory(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'openmathpix-history-'));
  try {
    run(directory);
  } finally {
    assert.ok(directory.startsWith(join(tmpdir(), 'openmathpix-history-')));
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

test('failed atomic writes do not commit any in-memory mutation or consume the next ID', () => {
  withDirectory((directory) => {
    const path = join(directory, 'history.json');
    const store = createHistoryStore(path);
    const first = store.add('MFR-1.5', 'thumb', 'a', 'a', 'a');
    const second = store.add('TexTeller', 'thumb', 'b', 'b', 'b');
    const original = readFileSync(path, 'utf8');
    const snapshot = store.list();
    const replacement = mock.method(fs, 'renameSync', () => {
      throw new Error('Disk is unavailable');
    });
    for (const mutate of [
      () => store.add('MFR-1.5', 'thumb', 'new', 'new', 'new'),
      () => store.update(first, { resultLatex: 'changed' }),
      () => store.remove(first),
      () => store.clear(),
      () => store.trim(1),
    ]) {
      assert.throws(mutate, /Disk is unavailable/);
      assert.deepEqual(store.list(), snapshot);
      assert.equal(readFileSync(path, 'utf8'), original);
      assert.deepEqual(readdirSync(directory), ['history.json']);
    }
    replacement.mock.restore();
    assert.equal(store.add('MFR-1.5', 'thumb', 'next', 'next', 'next'), second + 1);
    assert.equal(createHistoryStore(path).list().length, 3);
  });
});

test('a complete update is validated before any field changes, including unknown fields', () => {
  withDirectory((directory) => {
    const path = join(directory, 'history.json');
    const store = createHistoryStore(path);
    const id = store.add('MFR-1.5', 'thumb', 'x', 'original', 'x');
    const original = readFileSync(path, 'utf8');
    for (const patch of [
      { resultLatex: 'changed', resultMarkdown: 42 },
      { resultLatex: 'changed', resultText: 'x'.repeat(1_000_001) },
      { resultLatex: 'changed', id: 99 },
      null,
      [],
    ])
      assert.throws(
        () => store.update(id, patch as unknown as HistoryUpdate),
        /Invalid history update/,
      );
    assert.equal(store.list()[0].resultLatex, 'x');
    assert.equal(readFileSync(path, 'utf8'), original);
    // A later valid write cannot accidentally include any part of the rejected patch.
    store.add('PP-OCRv5', 'thumb', '', 'new', 'new');
    assert.equal(createHistoryStore(path).list()[1].resultLatex, 'x');
  });
});

test('history read snapshots cannot mutate live entries without a validated durable update', () => {
  withDirectory((directory) => {
    const path = join(directory, 'history.json');
    const store = createHistoryStore(path);
    store.add('MFR-1.5', 'thumb', 'x', 'x', 'x');
    store.list()[0].resultLatex = 'not persisted';
    store.search('x')[0].resultText = 'not persisted';
    assert.equal(store.list()[0].resultLatex, 'x');
    assert.equal(store.list()[0].resultText, 'x');
    store.add('TexTeller', 'thumb', 'y', 'y', 'y');
    assert.equal(createHistoryStore(path).list()[1].resultText, 'x');
  });
});

test('a failed corrupt-file backup protects the original from all later mutations', () => {
  withDirectory((directory) => {
    const path = join(directory, 'history.json');
    const original = '{"items": [unreadable';
    writeFileSync(path, original, 'utf8');
    const rename = mock.method(fs, 'renameSync', () => {
      throw new Error('Access denied');
    });
    const store = createHistoryStore(path);
    rename.mock.restore(); // Even after access recovers, require restart to load/backup safely.
    for (const action of [
      () => store.add('MFR-1.5', 'thumb', 'x', 'x', 'x'),
      () => store.update(1, { resultLatex: 'x' }),
      () => store.remove(1),
      () => store.clear(),
      () => store.trim(0),
      () => store.list(),
      () => store.search('x'),
    ])
      assert.throws(action, /original file could not be backed up/);
    assert.equal(readFileSync(path, 'utf8'), original);
    assert.deepEqual(readdirSync(directory), ['history.json']);
    const restarted = createHistoryStore(path);
    restarted.add('MFR-1.5', 'thumb', 'recovered', 'recovered', 'recovered');
    const backup = readdirSync(directory).find((name) => name.includes('.corrupt-'))!;
    assert.equal(readFileSync(join(directory, backup), 'utf8'), original);
  });
});

test('invalid disk entries and duplicate IDs are backed up instead of crashing history search', () => {
  withDirectory((directory) => {
    const path = join(directory, 'history.json');
    const valid = {
      id: 1,
      timestamp: new Date().toISOString(),
      pipeline: 'MFR-1.5',
      imageThumbnail: 'thumb',
      resultLatex: 'x',
      resultMarkdown: 'x',
      resultText: 'x',
    };
    for (const items of [[{ ...valid, resultText: 42 }], [valid, valid]]) {
      const original = JSON.stringify({ nextId: 3, items });
      writeFileSync(path, original, 'utf8');
      const store = createHistoryStore(path);
      assert.deepEqual(store.search('x'), []);
      assert.ok(
        readdirSync(directory)
          .filter((name) => name.includes('.corrupt-'))
          .some((name) => readFileSync(join(directory, name), 'utf8') === original),
      );
    }
  });
});

test('all mutation and pagination parameters are validated and trimming zero clears entries', () => {
  withDirectory((directory) => {
    const store = createHistoryStore(join(directory, 'history.json'));
    const id = store.add('MFR-1.5', 'thumb', 'x', 'x', 'x');
    for (const invalid of [-1, NaN, Infinity, 1.5]) {
      assert.throws(() => store.list(invalid));
      assert.throws(() => store.list(10, invalid));
      assert.throws(() => store.trim(invalid));
      assert.throws(() => store.update(invalid, {}));
      assert.throws(() => store.remove(invalid));
    }
    assert.throws(() => store.update(0, {}));
    assert.throws(() => store.remove(0));
    assert.throws(() => store.search(null as unknown as string));
    assert.throws(() => store.add('unknown' as 'MFR-1.5', 'thumb', 'x', 'x', 'x'));
    assert.throws(() => store.add('MFR-1.5', 'thumb', 'x', 'x', 42 as unknown as string));
    assert.equal(store.list().length, 1);
    store.trim(0);
    assert.deepEqual(store.list(), []);
    assert.equal(store.add('TexTeller', 'thumb', 'next', 'next', 'next'), id + 1);
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
