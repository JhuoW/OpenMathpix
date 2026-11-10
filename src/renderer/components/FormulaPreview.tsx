import React from 'react';
import katex from 'katex';
import { latexFormulas } from '../../shared/latex-copy';
import { useI18n } from '../hooks/useI18n';

interface RenderedFormula {
  source: string;
  html: string | null;
  error: string | null;
}

function render(latex: string, displayMode: boolean): RenderedFormula[] {
  return latexFormulas(latex).map((source) => {
    try {
      return {
        source,
        html: katex.renderToString(source, { displayMode, throwOnError: true, output: 'html' }),
        error: null,
      };
    } catch (error) {
      return {
        source,
        html: null,
        error: error instanceof Error ? error.message : 'Invalid LaTeX',
      };
    }
  });
}

/** Render each `$$…$$` block, or a bare formula, and explain LaTeX errors in place. */
export default function FormulaPreview({ latex }: { latex: string }) {
  const { t, message } = useI18n();
  const formulas = React.useMemo(() => render(latex, true), [latex]);
  if (!formulas.length) {
    return <p className="text-sm text-gray-400 text-center py-4">{t('Nothing to preview.')}</p>;
  }
  return (
    <div className="space-y-4">
      {formulas.map((formula, index) => (
        <div key={index} className="overflow-x-auto">
          {formula.html !== null ? (
            <div className="text-center" dangerouslySetInnerHTML={{ __html: formula.html }} />
          ) : (
            <p className="text-red-500 text-xs font-mono break-words">
              {t('Parse error: {message}', { message: message(formula.error ?? '') })}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** A compact, single-line formula for lists such as history. */
export const InlineFormula = React.memo(function InlineFormula({ latex }: { latex: string }) {
  const html = React.useMemo(() => {
    const [first] = latexFormulas(latex);
    if (!first) return null;
    try {
      return katex.renderToString(first, { displayMode: false, throwOnError: true });
    } catch {
      return null;
    }
  }, [latex]);
  if (html === null) {
    return <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{latex}</span>;
  }
  return <span className="inline-formula" dangerouslySetInnerHTML={{ __html: html }} />;
});
