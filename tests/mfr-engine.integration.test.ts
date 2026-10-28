import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createMfrEngine } from '../src/services/mfr-engine';

// Real weights are deliberately external to the repository and are never
// downloaded by tests. Enable with OPENMATHPIX_MFR_MODEL_DIR=/path/to/model.
test(
  'real MFR inference rejects incomplete output and survives timeouts and concurrent requests',
  { skip: !process.env.OPENMATHPIX_MFR_MODEL_DIR },
  async () => {
    const engine = await createMfrEngine(process.env.OPENMATHPIX_MFR_MODEL_DIR ?? '');
    const image = await readFile(join(process.cwd(), 'tests/fixtures/mfr/quadratic.png'));
    try {
      await assert.rejects(engine.recognize(image, { maxTokens: 1 }), /超过 1 个 token/);
      await assert.rejects(engine.recognize(image, { timeoutMs: 1 }), /超时/);
      for (const maxTokens of [0, 1.5, 1025, NaN]) {
        await assert.rejects(engine.recognize(image, { maxTokens }), /maxTokens/);
      }
      for (const timeoutMs of [0, 300001, NaN]) {
        await assert.rejects(engine.recognize(image, { timeoutMs }), /timeoutMs/);
      }
      const pending = engine.recognize(image);
      await assert.rejects(engine.recognize(image), /正在识别另一张/);
      // Shutdown must wait for an active recognition before releasing sessions.
      const releasing = engine.dispose();
      const result = await pending;
      assert.equal(result.latex.replace(/\s/g, ''), 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}');
      assert.ok(result.tokenCount > 1);
      assert.ok(result.elapsedMs > 0);
      await releasing;
      await assert.rejects(engine.recognize(image), /已关闭/);
    } finally {
      await engine.dispose();
    }
  },
);
