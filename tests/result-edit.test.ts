import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type { HistoryUpdate, OCRResult } from '../src/shared/types';
import {
  applyEdit,
  createHistorySaver,
  historyChanges,
  isEdited,
} from '../src/renderer/result-edit';

const formula: OCRResult = {
  latex: 'x',
  markdown: '$$\nx\n$$',
  text: 'x',
  rawResponse: null,
  kind: 'formula',
  historyId: 4,
};

test('editing a formula keeps Markdown and text consistent with its LaTeX', () => {
  const edited = applyEdit(formula, 'latex', 'x+1');
  assert.equal(edited.markdown, '$$\nx+1\n$$');
  assert.equal(edited.text, 'x+1');
  assert.equal(edited.historyId, 4);
  assert.deepEqual(historyChanges(formula, edited), {
    resultLatex: 'x+1',
    resultMarkdown: '$$\nx+1\n$$',
    resultText: 'x+1',
  });
  assert.equal(isEdited(edited, formula), true);
  assert.equal(isEdited(formula, formula), false);
});

test('document formats are edited independently', () => {
  const document: OCRResult = { ...formula, kind: 'document', markdown: '# A', text: 'A' };
  const edited = applyEdit(document, 'markdown', '# B');
  assert.equal(edited.markdown, '# B');
  assert.equal(edited.text, 'A');
  assert.deepEqual(historyChanges(document, edited), { resultMarkdown: '# B' });
});

test('history receives only the newest edit after typing pauses', async () => {
  const saved: [number, HistoryUpdate][] = [];
  const saver = createHistorySaver(
    async (id, updates) => {
      saved.push([id, updates]);
    },
    () => assert.fail('no error expected'),
    20,
  );
  saver.schedule(1, { resultLatex: 'a' });
  saver.schedule(1, { resultLatex: 'ab', resultText: 'ab' });
  saver.schedule(2, { resultMarkdown: 'm' });
  assert.deepEqual(saved, []);
  saver.flushAll();
  assert.deepEqual(saved, [
    [1, { resultLatex: 'ab', resultText: 'ab' }],
    [2, { resultMarkdown: 'm' }],
  ]);
  saver.schedule(1, { resultLatex: 'abc' });
  await sleep(40);
  assert.deepEqual(saved.at(-1), [1, { resultLatex: 'abc' }]);
});
