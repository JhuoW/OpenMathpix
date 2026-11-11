import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyTextFor, formatLatexForCopy, latexFormulas } from '../src/shared/latex-copy';
import { latexToMathML } from '../src/renderer/mathml';

const noMathML = () => {
  throw new Error('not expected');
};

test('a single formula is wrapped in the requested delimiters', () => {
  assert.equal(formatLatexForCopy('x^{2}', 'plain', noMathML), 'x^{2}');
  assert.equal(formatLatexForCopy('x^{2}', 'inline', noMathML), '$x^{2}$');
  assert.equal(formatLatexForCopy('x^{2}', 'display', noMathML), '$$\nx^{2}\n$$');
  assert.equal(formatLatexForCopy('x^{2}', 'bracket', noMathML), '\\[\nx^{2}\n\\]');
  assert.equal(
    formatLatexForCopy('x^{2}', 'equation', noMathML),
    '\\begin{equation}\nx^{2}\n\\end{equation}',
  );
});

test('several cloud formulas are wrapped individually and stay separated', () => {
  const latex = '$$a$$\n\n$$b$$';
  assert.deepEqual(latexFormulas(latex), ['a', 'b']);
  assert.equal(formatLatexForCopy(latex, 'inline', noMathML), '$a$\n\n$b$');
  // Bare formulas cannot be concatenated, so plain copying keeps display blocks.
  assert.equal(formatLatexForCopy(latex, 'plain', noMathML), '$$\na\n$$\n\n$$\nb\n$$');
  assert.equal(formatLatexForCopy('', 'inline', noMathML), '');
});

test('Markdown and text tabs are copied as shown', () => {
  const result = { latex: 'x', markdown: '# Title', text: 'Title' };
  assert.equal(copyTextFor(result, 'markdown', 'mathml', noMathML), '# Title');
  assert.equal(copyTextFor(result, 'text', 'inline', noMathML), 'Title');
  assert.equal(copyTextFor(result, 'latex', 'inline', noMathML), '$x$');
});

test('MathML for Word contains presentation markup without the TeX annotation', () => {
  const mathml = latexToMathML('\\frac{1}{2}');
  assert.match(mathml, /^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
  assert.match(mathml, /<mfrac>/);
  assert.doesNotMatch(mathml, /annotation|semantics/);
  assert.match(mathml, /<\/math>$/);
  assert.throws(() => latexToMathML('\\frac{1}{'));
});

test('several formulas copy as one MathML element, which Word pastes as one equation', () => {
  const single = formatLatexForCopy('x', 'mathml', latexToMathML);
  assert.equal(single, latexToMathML('x'));

  // Word pastes two adjacent <math> elements as literal XML text.
  const mathml = formatLatexForCopy('$$x=1$$\n\n$$\\frac{1}{2}$$', 'mathml', latexToMathML);
  assert.equal(mathml.match(/<math\b/g)?.length, 1);
  assert.equal(mathml.match(/<\/math>/g)?.length, 1);
  assert.match(mathml, /^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
  assert.equal(mathml.match(/<mtr><mtd>/g)?.length, 2);
  assert.match(mathml, /<mi>x<\/mi><mo>=<\/mo><mn>1<\/mn>/);
  assert.match(mathml, /<mfrac>/);
  assert.doesNotMatch(mathml, /\n/);
});
