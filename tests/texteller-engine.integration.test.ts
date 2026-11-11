import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createTextellerEngine } from '../src/services/texteller-engine';

const MODEL = process.env.OPENMATHPIX_TEXTELLER_MODEL_DIR;
const compact = (latex: string) => latex.replace(/\s/g, '');

// Downloads are explicit; normal unit tests never fetch large model files.
test(
  'real TexTeller reads fractions, matrices, cases and aligned equations in reference fixtures',
  { skip: !MODEL },
  async () => {
    const engine = await createTextellerEngine(MODEL!);
    const cases = [
      ['quadratic', String.raw`x=\frac{-b\pm\sqrt{b^{2}-4ac}}{2a}`],
      ['nested-fraction', String.raw`\frac{1}{1+\frac{1}{x}}`],
      ['gaussian-integral', String.raw`\int_{0}^{\infty}e^{-x^{2}}\,dx=\frac{\sqrt{\pi}}{2}`],
      ['matrix', String.raw`A=\begin{pmatrix}a&b\\c&d\end{pmatrix}`],
      ['piecewise', String.raw`f(x)=\begin{cases}x^{2},&x\geq0\\-x,&x<0\end{cases}`],
      [
        'aligned',
        String.raw`\begin{aligned}(a+b)^{2}&=a^{2}+2ab+b^{2}\\(a-b)^{2}&=a^{2}-2ab+b^{2}\end{aligned}`,
      ],
      ['dark-background', 'x=1'],
    ];
    try {
      for (const [name, expected] of cases) {
        const result = await engine.recognize(await readFile(`tests/fixtures/mfr/${name}.png`));
        assert.equal(compact(result.latex), compact(expected), name);
      }
    } finally {
      await engine.dispose();
    }
  },
);

test(
  'real TexTeller CPU inference rejects non-formulas and safely recovers from errors',
  { skip: !MODEL },
  async () => {
    const engine = await createTextellerEngine(MODEL!);
    const image = await readFile('tests/fixtures/mfr/simple.png');
    try {
      await assert.rejects(engine.recognize(image, { maxTokens: 1 }), /超过 1 个 token/);
      await assert.rejects(engine.recognize(image, { timeoutMs: 0.001 }), /超时/);
      for (const maxTokens of [0, 1025, NaN, 1.1])
        await assert.rejects(engine.recognize(image, { maxTokens }), /maxTokens/);
      for (const timeoutMs of [0, 300001, NaN])
        await assert.rejects(engine.recognize(image, { timeoutMs }), /timeoutMs/);
      await assert.rejects(
        engine.recognize(await readFile('tests/fixtures/mfr/blank.png')),
        /没有可辨认/,
      );
      await assert.rejects(
        engine.recognize(await readFile('tests/fixtures/mfr/code-snippet.png')),
        /没有可辨认/,
      );
      const pending = engine.recognize(image);
      await assert.rejects(engine.recognize(image), /正在识别另一张/);
      const disposing = engine.dispose();
      const result = await pending;
      assert.equal(result.latex, 'x=1');
      assert.ok(result.tokenCount > 0 && result.elapsedMs > 0);
      assert.ok(result.confidence > 0 && result.confidence <= 1);
      assert.ok(result.lowestTokenProbability > 0 && result.lowestTokenProbability <= 1);
      await disposing;
      await assert.rejects(engine.recognize(image), /已关闭/);
    } finally {
      await engine.dispose();
    }
  },
);
