import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createByteLevelTokenizer } from '../src/services/mfr-tokenizer';

const tokenizer = {
  model: {
    type: 'BPE',
    vocab: { '<s>': 0, '</s>': 1, '\\frac': 2, '{': 3, x: 4, '}': 5, Ġ: 6, Ċ: 7, Î: 8, '±': 9 },
  },
  decoder: { type: 'ByteLevel' },
  added_tokens: [
    { id: 0, special: true },
    { id: 1, special: true },
  ],
};

test('MFR ByteLevel decoding preserves LaTeX, whitespace, and UTF-8 across token boundaries', () => {
  const decoder = createByteLevelTokenizer(tokenizer);
  assert.equal(decoder.decode([0, 2, 3, 4, 5, 6, 8, 9, 7, 1]), '\\frac{x} α\n');
  assert.equal(decoder.vocabularySize, 10);
});

test('MFR decoding rejects unknown generated IDs and unsupported model tokenizers', () => {
  assert.throws(() => createByteLevelTokenizer(tokenizer).decode([999]), /无效.*ID/);
  assert.throws(
    () => createByteLevelTokenizer({ ...tokenizer, decoder: { type: 'Metaspace' } }),
    /ByteLevel/,
  );
  assert.throws(() => createByteLevelTokenizer(null), /格式/);
});
