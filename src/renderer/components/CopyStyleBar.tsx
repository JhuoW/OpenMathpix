import React, { useState } from 'react';
import type { LatexCopyStyle } from '../../shared/types';
import { LATEX_COPY_LABELS, LATEX_COPY_STYLES } from '../../shared/latex-copy';
import { copyResult } from '../copy';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';
import type { TranslationKey } from '../../shared/i18n';
import { cleanSettingsError } from '../settings-autosave';

export const COPY_STYLE_DESCRIPTIONS: Record<LatexCopyStyle, TranslationKey> = {
  plain: 'Plain LaTeX source',
  inline: 'Inline math for Markdown and LaTeX documents',
  display: 'Display math for Markdown and LaTeX documents',
  bracket: 'LaTeX display math',
  equation: 'Numbered LaTeX equation environment',
  mathml: 'MathML, pastes as an editable equation in Microsoft Word',
};

/** One-click copying of the LaTeX result in every supported wrapper, or as an image. */
export default function CopyStyleBar({ latex }: { latex: string }) {
  const { t, message } = useI18n();
  const preferred = useAppStore((state) => state.settings?.latexCopyStyle ?? 'plain');
  const showToast = useAppStore((state) => state.showToast);
  const [busy, setBusy] = useState(false);

  const imageAction = async (action: 'copy' | 'save') => {
    if (busy) return;
    setBusy(true);
    try {
      if (action === 'copy') {
        await window.api.copyFormulaImage(latex);
        showToast('Copied as an image!');
      } else {
        const file = await window.api.saveFormulaImage(latex);
        if (file) showToast(t('Image saved: {file}', { file }), 5000);
      }
    } catch (error) {
      showToast(message(cleanSettingsError(error)), 5000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
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
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500 mr-1">{t('Image')}</span>
        <button
          type="button"
          disabled={busy}
          title={t('A picture of the formula, for slides and chat apps without LaTeX')}
          onClick={() => void imageAction('copy')}
          className="chip disabled:opacity-50"
        >
          {t('Copy Image')}
        </button>
        <button
          type="button"
          disabled={busy}
          title={t('Save as PNG, or as SVG for sharp scaling in slides and documents')}
          onClick={() => void imageAction('save')}
          className="chip disabled:opacity-50"
        >
          {t('Save Image...')}
        </button>
      </div>
    </div>
  );
}
