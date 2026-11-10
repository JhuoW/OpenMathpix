import React, { useEffect, useState, useSyncExternalStore } from 'react';
import type { AfterSnipAction, Pipeline, OutputFormat, Theme } from '../../shared/types';
import { settingsSession } from '../settings-session';
import MfrModelSettings from '../components/MfrModelSettings';
import HotkeyInput from '../components/HotkeyInput';
import { COPY_STYLE_DESCRIPTIONS } from '../components/CopyStyleBar';
import { useI18n } from '../hooks/useI18n';
import { LATEX_COPY_LABELS, LATEX_COPY_STYLES } from '../../shared/latex-copy';
import type { TranslationKey } from '../../shared/i18n';

const pipelines: { value: Pipeline; label: string; desc: string }[] = [
  { value: 'PP-OCRv5', label: 'PP-OCRv5', desc: 'General text (CJK + English)' },
  {
    value: 'PP-StructureV3',
    label: 'PP-StructureV3',
    desc: 'Tables, formulas, charts, mixed layout',
  },
  { value: 'PaddleOCR-VL', label: 'PaddleOCR-VL', desc: 'Vision-language document parsing' },
  {
    value: 'PaddleOCR-VL-1.5',
    label: 'PaddleOCR-VL-1.5',
    desc: 'Upgraded vision-language document parsing',
  },
];
const afterSnipOptions: { value: AfterSnipAction; label: TranslationKey; desc: TranslationKey }[] =
  [
    {
      value: 'window',
      label: 'Show the result window',
      desc: 'Bring OpenMathpix to the front to review and edit the result.',
    },
    {
      value: 'notify',
      label: 'Copy in the background',
      desc: 'Stay in your current app. The result is copied and a notification appears.',
    },
  ];
const inputClass =
  'mt-1 block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500';

function FieldError({ message: error }: { message?: string }) {
  const { t, message } = useI18n();
  return error ? (
    <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
      {message(error)} {t('Previous settings remain active.')}
    </p>
  ) : null;
}

export default function Settings() {
  const { t, message } = useI18n();
  const {
    draft: local,
    applied,
    saving,
    pending,
    errors,
  } = useSyncExternalStore(settingsSession.subscribe, settingsSession.getSnapshot);
  const [showToken, setShowToken] = useState(false);

  // The queue is independent of this page: navigating away cannot discard a pending edit.
  useEffect(() => () => settingsSession.flush(), []);

  if (!local || !applied) return null;
  const localEngine = local.ocrEngine === 'mfr';
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        settingsSession.flush();
      }}
      className="max-w-lg mx-auto p-6 space-y-8"
    >
      <div role="status" aria-live="polite" className="text-sm text-gray-500">
        {saving === 'recognition'
          ? t('Checking and applying recognition settings...')
          : saving
            ? t('Applying changes...')
            : pending
              ? t('Changes will apply automatically when you finish typing.')
              : hasErrors
                ? t('Some changes could not be applied. Correct the fields below to try again.')
                : t('Changes are saved and applied automatically.')}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">{t('Recognition Engine')}</h2>
        <p className="text-xs text-gray-500 mb-4">
          {t('Active engine: {engine}.', {
            engine: t(applied.ocrEngine === 'mfr' ? 'Local MFR-1.5' : 'PaddleOCR API'),
          })}
          {local.ocrEngine !== applied.ocrEngine &&
            t('The selected engine will activate after validation.')}
        </p>
        <div className="space-y-2">
          {[
            {
              value: 'mfr' as const,
              label: 'Local MFR-1.5',
              desc: 'Offline formula recognition on your CPU',
            },
            {
              value: 'paddleocr' as const,
              label: 'PaddleOCR API',
              desc: 'Cloud or self-hosted recognition service',
            },
          ].map((engine) => (
            <label
              key={engine.value}
              className={`flex items-start gap-3 p-2 rounded border cursor-pointer ${
                local.ocrEngine === engine.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <input
                type="radio"
                name="ocrEngine"
                checked={local.ocrEngine === engine.value}
                onChange={() => settingsSession.edit('ocrEngine', engine.value, true)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">
                  {message(engine.label)}
                  {applied.ocrEngine === engine.value && (
                    <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                      {t('Active')}
                    </span>
                  )}
                  {local.ocrEngine === engine.value && applied.ocrEngine !== engine.value && (
                    <span className="ml-2 text-xs text-gray-500">{t('Pending validation')}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{message(engine.desc)}</div>
              </div>
            </label>
          ))}
        </div>
        <FieldError message={errors.recognition} />
      </section>

      {localEngine ? (
        <MfrModelSettings />
      ) : (
        <section
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              settingsSession.flush('recognition');
            }
          }}
        >
          <h2 className="text-lg font-semibold mb-4">{t('API Configuration')}</h2>
          <label className="block mb-3">
            <span className="text-sm font-medium">{t('API URL')}</span>
            <input
              type="text"
              value={local.apiUrl}
              onChange={(event) => settingsSession.edit('apiUrl', event.target.value)}
              placeholder="https://xxxxx.aistudio-hub.baidu.com"
              className={inputClass}
            />
          </label>
          <label className="block mb-3">
            <span className="text-sm font-medium">{t('Access Token')}</span>
            <div className="flex gap-2 mt-1">
              <input
                type={showToken ? 'text' : 'password'}
                aria-label={t('Access Token')}
                value={local.accessToken}
                autoComplete="off"
                onChange={(event) => settingsSession.edit('accessToken', event.target.value)}
                className="min-w-0 flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {showToken ? t('Hide') : t('Show')}
              </button>
            </div>
          </label>
          <p className="text-xs text-gray-500 mb-3">
            {t(
              'The connection is checked automatically before changes become active. For a self-hosted server without authentication, leave the Access Token empty.',
            )}
          </p>
          <fieldset>
            <legend className="text-sm font-medium">{t('Pipeline')}</legend>
            <div className="mt-2 space-y-2">
              {pipelines.map((pipeline) => (
                <label
                  key={pipeline.value}
                  className={`flex items-start gap-3 p-2 rounded border cursor-pointer ${
                    local.pipeline === pipeline.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="pipeline"
                    checked={local.pipeline === pipeline.value}
                    onChange={() => settingsSession.edit('pipeline', pipeline.value, true)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{pipeline.label}</div>
                    <div className="text-xs text-gray-500">{message(pipeline.desc)}</div>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-4">{t('Snipping')}</h2>
        <div className="mb-4">
          <span className="text-sm font-medium">{t('Snip Hotkey')}</span>
          <HotkeyInput
            value={local.snipHotkey}
            onChange={(accelerator) => settingsSession.edit('snipHotkey', accelerator, true)}
          />
          <FieldError message={errors.snipHotkey} />
        </div>
        <fieldset>
          <legend className="text-sm font-medium">{t('After a snip')}</legend>
          <div className="mt-2 space-y-2">
            {afterSnipOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-2 rounded border cursor-pointer ${
                  local.afterSnip === option.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="afterSnip"
                  checked={local.afterSnip === option.value}
                  onChange={() => settingsSession.edit('afterSnip', option.value, true)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{t(option.label)}</div>
                  <div className="text-xs text-gray-500">{t(option.desc)}</div>
                </div>
              </label>
            ))}
          </div>
          <FieldError message={errors.afterSnip} />
        </fieldset>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">{t('Output')}</h2>
        <fieldset className="mb-4">
          <legend className="text-sm font-medium">{t('Default Output Format')}</legend>
          <p className="text-xs text-gray-500">
            {t('Opened after recognition and copied automatically.')}
          </p>
          <div className="flex gap-4 mt-2">
            {(['latex', 'markdown', 'text'] as OutputFormat[]).map((format) => (
              <label key={format} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="outputFormat"
                  checked={local.defaultOutputFormat === format}
                  onChange={() => settingsSession.edit('defaultOutputFormat', format, true)}
                />
                {t(format === 'latex' ? 'LaTeX' : format === 'markdown' ? 'Markdown' : 'Text')}
              </label>
            ))}
          </div>
          <FieldError message={errors.defaultOutputFormat} />
        </fieldset>
        <label className="block mb-4">
          <span className="text-sm font-medium">{t('LaTeX copy style')}</span>
          <select
            value={local.latexCopyStyle}
            onChange={(event) =>
              settingsSession.edit(
                'latexCopyStyle',
                event.target.value as typeof local.latexCopyStyle,
                true,
              )
            }
            className={inputClass}
          >
            {LATEX_COPY_STYLES.map((style) => (
              <option key={style} value={style}>
                {LATEX_COPY_LABELS[style]} — {t(COPY_STYLE_DESCRIPTIONS[style])}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            {t('Used for automatic copying and the Copy button on the LaTeX tab.')}
          </span>
          <FieldError message={errors.latexCopyStyle} />
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={local.cleanLatex}
            onChange={(event) => settingsSession.edit('cleanLatex', event.target.checked, true)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium">{t('Tidy local model LaTeX')}</span>
            <span className="block text-xs text-gray-500">
              {t(
                'Removes extra spaces and redundant braces, e.g. b ^ { 2 } becomes b^{2}. The formula itself is unchanged. Applies to new recognitions.',
              )}
            </span>
          </span>
        </label>
        <FieldError message={errors.cleanLatex} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">{t('Appearance and History')}</h2>
        <p className="text-xs text-gray-500 mb-4">
          {t('Change the interface language in View → Language.')}
        </p>
        <fieldset className="mb-3">
          <legend className="text-sm font-medium">{t('Theme')}</legend>
          <div className="flex gap-4 mt-2">
            {(['light', 'dark', 'system'] as Theme[]).map((theme) => (
              <label key={theme} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="theme"
                  checked={local.theme === theme}
                  onChange={() => settingsSession.edit('theme', theme, true)}
                />
                {t(theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System')}
              </label>
            ))}
          </div>
          <FieldError message={errors.theme} />
        </fieldset>
        <label className="block mb-3">
          <span className="text-sm font-medium">{t('History Limit')}</span>
          <input
            type="number"
            aria-label={t('History Limit')}
            min={10}
            max={500}
            value={Number.isNaN(local.historyLimit) ? '' : local.historyLimit}
            onChange={(event) => settingsSession.edit('historyLimit', event.target.valueAsNumber)}
            onBlur={() => settingsSession.flush('historyLimit')}
            className={`${inputClass} !w-24`}
          />
          <FieldError message={errors.historyLimit} />
        </label>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">{t('About')}</h2>
        <p className="text-sm text-gray-500">OpenMathpix v0.1.0</p>
      </section>
    </form>
  );
}
