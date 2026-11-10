import React from 'react';
import type { LatexCopyStyle } from '../../shared/types';
import { LATEX_COPY_LABELS, LATEX_COPY_STYLES } from '../../shared/latex-copy';
import { copyResult } from '../copy';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';
import type { TranslationKey } from '../../shared/i18n';

export const COPY_STYLE_DESCRIPTIONS: Record<LatexCopyStyle, TranslationKey> = {
  plain: 'Plain LaTeX source',
  inline: 'Inline math for Markdown and LaTeX documents',
  display: 'Display math for Markdown and LaTeX documents',
  bracket: 'LaTeX display math',
  equation: 'Numbered LaTeX equation environment',
  mathml: 'MathML, pastes as an editable equation in Microsoft Word',
};

/** One-click copying of the LaTeX result in every supported wrapper. */
export default function CopyStyleBar({ latex }: { latex: string }) {
  const { t } = useI18n();
  const preferred = useAppStore((state) => state.settings?.latexCopyStyle ?? 'plain');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-500 mr-1">{t('Copy as')}</span>
      {LATEX_COPY_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          title={t(COPY_STYLE_DESCRIPTIONS[style])}
          onClick={() => void copyResult({ latex, markdown: '', text: '' }, 'latex', style)}
          className={`chip ${style === preferred ? 'chip-active' : ''}`}
        >
          <span className={style === 'mathml' || style === 'equation' ? '' : 'font-mono'}>
            {LATEX_COPY_LABELS[style]}
          </span>
        </button>
      ))}
    </div>
  );
}
