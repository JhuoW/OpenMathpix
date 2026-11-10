import katex from 'katex';

/**
 * Presentation MathML for pasting into Word and similar editors. The TeX annotation
 * and `semantics` wrapper are removed: some editors would otherwise paste the source.
 */
export function latexToMathML(formula: string): string {
  const html = katex.renderToString(formula, {
    displayMode: true,
    output: 'mathml',
    throwOnError: true,
  });
  const math = html.match(/<math[\s\S]*<\/math>/)?.[0];
  if (!math) throw new Error('Could not convert the formula to MathML.');
  return math.replace(/<annotation[\s\S]*?<\/annotation>/g, '').replace(/<\/?semantics>/g, '');
}
