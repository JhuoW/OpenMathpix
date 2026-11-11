import type {} from '../src/preload/index.d.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useAppStore, historySaver } from '../src/renderer/store';
import type { OCRResult } from '../src/shared/types';

const result: OCRResult = {
  latex: 'x',
  markdown: '$$x$$',
  text: 'x',
  rawResponse: null,
  kind: 'formula',
  historyId: 201,
};

test('deleting the currently edited result cancels autosave and clears its editor baseline and image', async () => {
  useAppStore.getState().openResult(result, 'image', 'latex');
  useAppStore.getState().editResult('latex', 'x+1');
  useAppStore.getState().forgetHistory(201);
  assert.equal(useAppStore.getState().ocrResult, null);
  assert.equal(useAppStore.getState().baseline, null);
  assert.equal(useAppStore.getState().currentImage, null);
  assert.equal(await historySaver.flushAndWait(), true);
});

test('deleting another record preserves the current result; clearing preserves unsaved recognition output', () => {
  useAppStore.getState().openResult({ ...result, historyId: 202 }, 'keep-image', 'latex');
  useAppStore.getState().forgetHistory(203);
  assert.equal(useAppStore.getState().ocrResult?.historyId, 202);
  useAppStore.getState().forgetHistory();
  assert.equal(useAppStore.getState().ocrResult, null);

  const unsaved = { ...result, historyId: undefined };
  useAppStore.getState().openResult(unsaved, 'unsaved-image', 'latex');
  useAppStore.getState().forgetHistory();
  assert.equal(useAppStore.getState().ocrResult, unsaved);
  assert.equal(useAppStore.getState().currentImage, 'unsaved-image');
});
