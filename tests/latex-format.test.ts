import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import katex from 'katex';
import { cleanLatex } from '../src/shared/latex-format';

// HTML output only: the MathML part embeds the source text itself as an annotation.
const render = (latex: string) =>
  katex.renderToString(latex, { displayMode: true, throwOnError: true, output: 'html' });

// Recorded raw outputs of the production engine for the synthetic fixtures.
const recorded = JSON.parse(
  readFileSync(join(__dirname, '../../scripts/mfr/results/node-engine.json'), 'utf8'),
) as { cases: { id: string; latex?: string }[] };

test('tokenized model output becomes compact LaTeX', () => {
  assert.equal(
    cleanLatex('x = \\frac { - b \\pm \\sqrt { b ^ { 2 } - 4 a c } } { 2 a }'),
    'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}',
  );
  assert.equal(
    cleanLatex('a _ { i , j } ^ { ( k + 1 ) } = \\alpha a _ { i , j }'),
    'a_{i,j}^{(k+1)}=\\alpha a_{i,j}',
  );
});

test('a space that ends a control word is never removed', () => {
  // `\pm b` and `\pmb` are different commands.
  assert.equal(cleanLatex('a \\pm b'), 'a\\pm b');
  assert.equal(cleanLatex('\\lim _ { x \\to 0 }'), '\\lim_{x\\to 0}');
  assert.equal(cleanLatex('\\left ( x \\right )'), '\\left(x\\right)');
  assert.equal(cleanLatex('\\int f \\, d x'), '\\int f\\,dx');
  assert.equal(cleanLatex('a \\ b'), 'a\\ b');
});

test('text arguments keep their spacing', () => {
  assert.equal(cleanLatex('x = 1 \\text { if } y'), 'x=1\\text{ if }y');
  assert.equal(cleanLatex('\\mbox { a  b }'), '\\mbox{ a  b }');
});

test('matrix cells lose wrapper braces, trailing row breaks and gain matching environments', () => {
  assert.equal(
    cleanLatex(
      'A = \\left( \\begin{matrix} { a } & { b } \\\\ { c } & { d } \\\\ \\end{matrix} \\right)',
    ),
    'A=\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}',
  );
  assert.equal(
    cleanLatex('\\left[ \\begin{matrix} { 1 } \\end{matrix} \\right]'),
    '\\begin{bmatrix}1\\end{bmatrix}',
  );
  assert.equal(
    cleanLatex('\\left| \\begin{matrix} { 1 } \\end{matrix} \\right|'),
    '\\begin{vmatrix}1\\end{vmatrix}',
  );
  // Mismatched delimiters are not a standard matrix environment.
  assert.equal(
    cleanLatex('\\left( \\begin{matrix} { 1 } \\end{matrix} \\right]'),
    '\\left(\\begin{matrix}1\\end{matrix}\\right]',
  );
});

test('aligned relations keep the empty group that gives them correct spacing', () => {
  assert.equal(
    cleanLatex(
      '\\begin{aligned} { ( a + b ) ^ { 2 } } & { { } = a ^ { 2 } } \\\\ { x } & { { } = 1 } \\\\ \\end{aligned}',
    ),
    '\\begin{aligned}(a+b)^{2} & {}=a^{2} \\\\ x & {}=1\\end{aligned}',
  );
});

test('environment arguments and nested groups are preserved', () => {
  assert.equal(
    cleanLatex('\\begin{array} { l l } { 1 } & { 2 } \\end{array}'),
    '\\begin{array}{ll}1 & 2\\end{array}',
  );
  assert.equal(cleanLatex('x ^ { { 2 } }'), 'x^{2}');
  // A cell containing its own alignment break must keep its braces.
  assert.equal(
    cleanLatex('\\begin{matrix} { a \\\\ b } \\end{matrix}'),
    '\\begin{matrix}{a \\\\ b}\\end{matrix}',
  );
});

test('unbalanced or unsupported input is returned unchanged', () => {
  for (const source of [
    '\\frac { 1 } { 2',
    'x } + 1',
    'a % comment',
    '\\begin{matrix} a',
    'x \\',
  ]) {
    assert.equal(cleanLatex(source), source);
  }
  assert.equal(cleanLatex('  '), '');
});

test('spacing-only cleanup renders identically', () => {
  for (const source of [
    'x = \\frac { - b \\pm \\sqrt { b ^ { 2 } - 4 a c } } { 2 a }',
    '\\int _ { 0 } ^ { \\infty } e ^ { - x ^ { 2 } } \\, d x',
    '\\frac { d } { d x } \\left[ x ^ { n } \\right]',
  ]) {
    assert.equal(render(cleanLatex(source)), render(source));
  }
});

test('every recorded model output still renders after cleanup', () => {
  const outputs = recorded.cases.filter((item) => item.latex);
  assert.ok(outputs.length >= 10);
  for (const { id, latex } of outputs) {
    const cleaned = cleanLatex(latex!);
    assert.doesNotThrow(() => render(cleaned), id);
    assert.ok(cleaned.length <= latex!.length, id);
    assert.doesNotMatch(cleaned, / [_^] /, id);
  }
});
