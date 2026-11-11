import React from 'react';
import type { ModelTestResult } from '../../shared/types';
import { SAMPLE_FORMULA_IMAGE, SAMPLE_FORMULA_LATEX } from '../../shared/sample-formula';
import { useI18n } from '../hooks/useI18n';
import FormulaPreview from './FormulaPreview';
import { CheckIcon } from './Icons';

const compact = (latex: string) => latex.replace(/\s|\\[,;!]/g, '').replace(/\\left|\\right/g, '');

/** The bundled sample image next to what the model read from it, with timings. */
export default function ModelTestView({
  result,
  onClose,
}: {
  result: ModelTestResult;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const seconds = (ms: number) => (ms / 1000).toFixed(ms < 10_000 ? 2 : 1);
  const matches = compact(result.latex) === compact(SAMPLE_FORMULA_LATEX);
  return (
    <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-gray-700 dark:text-gray-200">{t('Sample formula test')}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label={t('Close')}
          >
            ×
          </button>
        )}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:items-center">
        <img
          src={`data:image/png;base64,${SAMPLE_FORMULA_IMAGE}`}
          alt={t('Sample formula image')}
          className="mx-auto max-h-16 rounded border border-gray-200 dark:border-gray-700 bg-white p-1"
        />
        <div className="text-gray-900 dark:text-gray-100">
          <FormulaPreview latex={result.latex} />
        </div>
      </div>
      <p className="mt-2 break-all font-mono text-gray-600 dark:text-gray-300 select-text">
        {result.latex}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-500">
        {matches && (
          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
            <CheckIcon className="w-3.5 h-3.5" />
            {t('Matches the original formula')}
          </span>
        )}
        <span>{t('Recognized in {seconds} s', { seconds: seconds(result.elapsedMs) })}</span>
        {result.loadMs !== undefined && result.loadMs >= 100 && (
          <span>{t('Model loaded in {seconds} s', { seconds: seconds(result.loadMs) })}</span>
        )}
      </p>
    </div>
  );
}
