import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecognizer } from '../src/renderer/recognition';
import type { OCRResult } from '../src/shared/types';

type Dependencies = Parameters<typeof createRecognizer>[0];
const result: OCRResult = { latex: '$$x^2$$', markdown: '$x^2$', text: 'x^2', rawResponse: null };

function setup(overrides: Partial<Dependencies> = {}) {
  let state: ReturnType<Dependencies['getState']> = {
    currentImage: null,
    ocrResult: null,
    isRecognizing: false,
    error: 'old failure',
    activeTab: 'image',
    currentPage: 'history',
    settings: null,
  };
  const copies: string[] = [];
  const toasts: string[] = [];
  const deps: Dependencies = {
    getState: () => state,
    setState: (updates) => {
      state = { ...state, ...updates };
    },
    recognize: async () => result,
    copyText: async (text) => {
      copies.push(text);
    },
    showToast: (text) => {
      toasts.push(text);
    },
    ...overrides,
  };
  return { recognize: createRecognizer(deps), state: () => state, copies, toasts };
}

test('concurrent image input does not send a second request or overwrite the active image', async () => {
  let resolve!: (value: OCRResult) => void;
  const requests: string[] = [];
  const app = setup({
    recognize: (image) => {
      requests.push(image);
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  const first = app.recognize('image A');
  await app.recognize('image B');
  assert.deepEqual(requests, ['image A']);
  assert.equal(app.state().currentImage, 'image A');
  assert.equal(app.state().isRecognizing, true);
  resolve(result);
  await first;
  assert.equal(app.state().ocrResult, result);
  assert.equal(app.state().isRecognizing, false);
  assert.equal(app.state().error, null);
  assert.deepEqual(app.copies, [result.latex]);
});

test('clipboard failure preserves successful OCR and allows a subsequent recognition', async () => {
  const app = setup({
    copyText: async () => {
      throw new Error('Clipboard unavailable');
    },
  });
  await app.recognize('first');
  assert.equal(app.state().ocrResult, result);
  assert.equal(app.state().error, null);
  assert.equal(app.state().isRecognizing, false);
  assert.match(app.toasts[0], /Copy failed/);
  await app.recognize('next');
  assert.equal(app.state().currentImage, 'next');
});

test('retry clears the failed state and uses the normal copy and default format flow', async () => {
  let calls = 0;
  const app = setup({
    recognize: async () => {
      if (++calls === 1) throw new Error('Request timed out');
      return result;
    },
  });
  await app.recognize('same image');
  assert.equal(app.state().error, 'Request timed out');
  assert.equal(app.state().currentImage, 'same image');
  assert.equal(app.state().isRecognizing, false);
  await app.recognize(app.state().currentImage!);
  assert.equal(app.state().error, null);
  assert.equal(app.state().activeTab, 'latex');
  assert.equal(app.state().currentPage, 'result');
  assert.deepEqual(app.copies, [result.latex]);
});

test('history warning preserves recognized output and is combined with copy success in one toast', async () => {
  const warnedResult = { ...result, warning: 'Could not update recognition history.' };
  const app = setup({ recognize: async () => warnedResult });
  await app.recognize('image');
  assert.equal(app.state().ocrResult, warnedResult);
  assert.equal(app.state().error, null);
  assert.equal(app.state().isRecognizing, false);
  assert.deepEqual(app.copies, [result.latex]);
  assert.deepEqual(app.toasts, ['Copied! Could not update recognition history.']);
});

test('history and clipboard failures are both reported without hiding recognized output', async () => {
  const warnedResult = { ...result, warning: 'Could not update recognition history.' };
  const app = setup({
    recognize: async () => warnedResult,
    copyText: async () => {
      throw new Error('Clipboard unavailable');
    },
  });
  await app.recognize('image');
  assert.equal(app.state().ocrResult, warnedResult);
  assert.equal(app.state().error, null);
  assert.equal(app.toasts.length, 1);
  assert.match(app.toasts[0], /Copy failed/);
  assert.match(app.toasts[0], /Could not update recognition history/);
});

test('history warning is shown even if the preferred output format is empty', async () => {
  const warnedResult = { ...result, latex: '', warning: 'Could not update recognition history.' };
  const app = setup({ recognize: async () => warnedResult });
  await app.recognize('image');
  assert.equal(app.state().ocrResult, warnedResult);
  assert.deepEqual(app.copies, []);
  assert.deepEqual(app.toasts, [warnedResult.warning]);
});
