import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDegenerationGuard } from '../src/services/mfr-engine';

const feed = (probabilities: number[]) => {
  const guard = createDegenerationGuard();
  return probabilities.findIndex((p) => guard.add(p));
};

test('confident formulas, including occasional uncertain symbols, are never stopped', () => {
  // A long formula decoded with near certainty and an unsure symbol every 20 tokens.
  const formula = Array.from({ length: 600 }, (_, i) => (i % 20 === 7 ? 0.3 : 0.99));
  assert.equal(feed(formula), -1);
  // Short output is never judged; it finishes quickly anyway.
  assert.equal(feed(Array(63).fill(0.05)), -1);
});

test('noise decoded from text or interface screenshots stops after one window', () => {
  // Measured degenerate runs average 0.42-0.70 per token; 0.75 is the mildest case.
  assert.equal(feed(Array(800).fill(0.75)), 63);
  // A formula that turns into repeated hallucinated terms stops once the window is noise.
  const drifting = [...Array(100).fill(0.999), ...Array(400).fill(0.55)];
  const stop = feed(drifting);
  assert.ok(stop > 100 && stop < 164, `stopped at ${stop}`);
});
