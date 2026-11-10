import type { LatexCopyStyle, OCRResult, OutputFormat } from './types';

/** Markdown for a single recognized formula. */
export function formulaMarkdown(latex: string): string {
  return `$$\n${latex}\n$$`;
}

/** Cloud results join formulas as `$$…$$` blocks; a local result is one bare formula. */
export function latexFormulas(latex: string): string[] {
  const blocks = Array.from(latex.matchAll(/\$\$([\s\S]*?)\$\$/g), (match) => match[1].trim());
  const formulas = blocks.length ? blocks : [latex.trim()];
  return formulas.filter(Boolean);
}

export const LATEX_COPY_STYLES: readonly LatexCopyStyle[] = [
  'plain',
  'inline',
  'display',
  'bracket',
  'equation',
  'mathml',
];

export const LATEX_COPY_LABELS: Record<LatexCopyStyle, string> = {
  plain: 'LaTeX',
  inline: '$ … $',
  display: '$$ … $$',
  bracket: '\\[ … \\]',
  equation: 'equation',
  mathml: 'MathML',
};

function wrap(formula: string, style: Exclude<LatexCopyStyle, 'mathml'>): string {
  switch (style) {
    case 'inline':
      return `$${formula}$`;
    case 'display':
      return `$$\n${formula}\n$$`;
    case 'bracket':
      return `\\[\n${formula}\n\\]`;
    case 'equation':
      return `\\begin{equation}\n${formula}\n\\end{equation}`;
    default:
      return formula;
  }
}

/**
 * Text placed on the clipboard for LaTeX. MathML conversion is injected because it
 * needs KaTeX, which only the renderer loads.
 */
export function formatLatexForCopy(
  latex: string,
  style: LatexCopyStyle,
  toMathML: (formula: string) => string,
): string {
  const formulas = latexFormulas(latex);
  if (!formulas.length) return '';
  if (style === 'mathml') return formulas.map(toMathML).join('\n');
  if (style === 'plain' && formulas.length === 1) return formulas[0];
  // Several bare formulas cannot be pasted meaningfully; keep them separated as blocks.
  const blockStyle = style === 'plain' ? 'display' : style;
  return formulas.map((formula) => wrap(formula, blockStyle)).join('\n\n');
}

/** The clipboard text for an output tab, honoring the LaTeX copy style. */
export function copyTextFor(
  result: Pick<OCRResult, 'latex' | 'markdown' | 'text'>,
  format: OutputFormat,
  style: LatexCopyStyle,
  toMathML: (formula: string) => string,
): string {
  if (format === 'latex') return formatLatexForCopy(result.latex, style, toMathML);
  return format === 'markdown' ? result.markdown : result.text;
}
