import React, { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  AfterSnipAction,
  Language,
  OCREngine,
  Pipeline,
  OutputFormat,
  Theme,
} from '../../shared/types';
import { localModelInstalled, settingsSession } from '../settings-session';
import { useAppStore, type SettingsTab } from '../store';
import LocalModels from '../components/LocalModels';
import { TrashIcon } from '../components/Icons';
import HotkeyInput from '../components/HotkeyInput';
import { COPY_STYLE_DESCRIPTIONS } from '../components/CopyStyleBar';
import { useI18n } from '../hooks/useI18n';
import { LATEX_COPY_LABELS, LATEX_COPY_STYLES } from '../../shared/latex-copy';
import type { TranslationKey } from '../../shared/i18n';
import { engineIsActive } from '../engine-status';

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
// Local engines first, so the two offline models can be compared side by side.
const engines: { value: OCREngine; label: TranslationKey; desc: TranslationKey }[] = [
  {
    value: 'mfr',
    label: 'Local MFR-1.5',
    desc: 'Fast offline formula recognition on your CPU',
  },
  {
    value: 'texteller',
    label: 'Local TexTeller',
    desc: 'Most accurate offline model for long and complex formulas',
  },
  {
    value: 'paddleocr',
    label: 'PaddleOCR API',
    desc: 'Cloud or self-hosted service that also reads text, tables and documents',
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

const settingsTabs: { value: SettingsTab; label: TranslationKey }[] = [
  { value: 'recognition', label: 'Recognition' },
  { value: 'snipping', label: 'Snipping' },
  { value: 'output', label: 'Output' },
  { value: 'general', label: 'General' },
];
// Language names are shown in their own language, whatever the interface language is.
const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
];

function FieldError({ message: error }: { message?: string }) {
  const { message } = useI18n();
  return error ? (
    <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
      {message(error)}
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
  const hotkeyStatus = useAppStore((state) => state.hotkeyStatus);
  const [retryingHotkey, setRetryingHotkey] = useState(false);
  const { engineStatuses, mfrStatus, textellerStatus } = useAppStore();
  const tab = useAppStore((state) => state.settingsTab);
  const setTab = useAppStore((state) => state.setSettingsTab);
  const [clearingHistory, setClearingHistory] = useState(false);
  useEffect(() => setShowToken(false), [local?.ocrEngine]);

  // The queue is independent of this page: navigating away cannot discard a pending edit.
  useEffect(() => () => settingsSession.flush(), []);

  if (!local || !applied) return null;
  const localEngine = local.ocrEngine !== 'paddleocr';
  const modelStatus = local.ocrEngine === 'texteller' ? textellerStatus : mfrStatus;
  const hasErrors = Object.keys(errors).length > 0;
  const activeEngine = engineIsActive(
    local.ocrEngine,
    applied,
    engineStatuses,
    mfrStatus,
    textellerStatus,
  );
  const cloudDraftDirty =
    local.ocrEngine !== applied.ocrEngine ||
    local.apiUrl !== applied.apiUrl ||
    local.accessToken !== applied.accessToken ||
    local.pipeline !== applied.pipeline;
  const canConnect = !!local.apiUrl.trim();
  const connecting = saving === 'recognition';
  // Green "Active" is reserved for the engine actually in use. An engine that could be
  // switched to right away says so in grey; anything not set up is grey "Inactive".
  const engineBadge = (engine: OCREngine): { text: string; className: string } => {
    const model =
      engine === 'mfr' ? mfrStatus : engine === 'texteller' ? textellerStatus : undefined;
    if (engineIsActive(engine, applied, engineStatuses, mfrStatus, textellerStatus))
      return { text: t('Active'), className: 'text-green-600 dark:text-green-400' };
    if (model?.state === 'downloading')
      return { text: t('Downloading...'), className: 'text-blue-600 dark:text-blue-400' };
    if (
      engineStatuses?.[engine].state === 'checking' ||
      (connecting && local.ocrEngine === engine) ||
      (model && ['validating', 'loading', 'clearing'].includes(model.state))
    )
      return { text: t('Checking...'), className: 'text-gray-500 dark:text-gray-400' };
    if (
      engine !== applied.ocrEngine &&
      (engine === 'paddleocr'
        ? engineStatuses?.paddleocr.state === 'ready'
        : localModelInstalled(engine))
    )
      return {
        text: t(engine === 'paddleocr' ? 'Configured' : 'Installed'),
        className: 'text-gray-600 dark:text-gray-300',
      };
    return { text: t('Inactive'), className: 'text-gray-400 dark:text-gray-500' };
  };
  // Choosing a local engine without a model previews its setup while the working engine stays.
  const appliedLabel = engines.find((engine) => engine.value === applied.ocrEngine)?.label;
  const engineInUse =
    localEngine &&
    local.ocrEngine !== applied.ocrEngine &&
    !localModelInstalled(local.ocrEngine as 'mfr' | 'texteller') &&
    appliedLabel &&
    engineIsActive(applied.ocrEngine, applied, engineStatuses, mfrStatus, textellerStatus)
      ? t(appliedLabel)
      : undefined;
  // The saved hotkey could not be registered, e.g. at startup while another app owns it.
  const hotkeyBlocked =
    hotkeyStatus !== null &&
    !hotkeyStatus.registered &&
    hotkeyStatus.accelerator === applied.snipHotkey &&
    local.snipHotkey === applied.snipHotkey &&
    !errors.snipHotkey;
  // A dot on a tab points to a problem that is not on screen.
  const tabAlert: Record<SettingsTab, boolean> = {
    recognition: !!errors.recognition || !!errors.modelSource,
    snipping: !!errors.snipHotkey || !!errors.afterSnip || hotkeyBlocked,
    output: !!errors.defaultOutputFormat || !!errors.latexCopyStyle || !!errors.cleanLatex,
    general: !!errors.theme || !!errors.historyLimit || !!errors.language || !!errors.launchAtLogin,
  };
  const clearHistory = async () => {
    if (clearingHistory || useAppStore.getState().isRecognizing) return;
    if (!confirm(t('Clear all history?'))) return;
    setClearingHistory(true);
    try {
      await window.api.clearHistory();
      useAppStore.getState().forgetHistory();
      useAppStore.getState().showToast('History cleared.');
    } catch {
      useAppStore.getState().showToast('Could not clear history.');
    } finally {
      setClearingHistory(false);
    }
  };
  const retryHotkey = () => {
    setRetryingHotkey(true);
    window.api
      .getHotkeyStatus(true)
      .then((status) => useAppStore.getState().setHotkeyStatus(status))
      .catch(() => undefined)
      .finally(() => setRetryingHotkey(false));
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        settingsSession.flush();
      }}
      className="max-w-lg mx-auto px-6 pb-6 pt-4 space-y-6"
    >
      <div role="status" aria-live="polite" className="text-sm text-gray-500">
        {saving === 'recognition'
          ? t('Checking and applying recognition settings...')
          : saving
            ? t('Applying changes...')
            : hasErrors
              ? t('Some changes could not be applied. Correct the fields below to try again.')
              : !localEngine && cloudDraftDirty
                ? t(
                    'Click Connect & Use to apply this engine. Other preferences save automatically.',
                  )
                : pending
                  ? t('Changes will apply automatically when you finish typing.')
                  : t('Changes are saved and applied automatically.')}
      </div>

      <div
        role="tablist"
        aria-label={t('Settings sections')}
        className="sticky top-0 z-10 -mx-2 flex gap-1 border-b border-gray-200 bg-white px-2 pt-1 dark:border-gray-700 dark:bg-gray-900"
      >
        {settingsTabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`settings-tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls="settings-panel"
            onClick={() => setTab(item.value)}
            className={`relative -mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === item.value
                ? 'border-blue-600 font-medium text-blue-700 dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            {t(item.label)}
            {tabAlert[item.value] && tab !== item.value && (
              <span
                aria-label={t('Needs attention')}
                className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500"
              />
            )}
          </button>
        ))}
      </div>

      <div
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab}`}
        className="space-y-8"
      >
        {tab === 'recognition' && (
          <>
            <section>
              <h2 className="text-lg font-semibold mb-2">{t('Recognition Engine')}</h2>
              <p className="text-xs text-gray-500 mb-4">
                {t('Choose an engine and complete its setup below.')}
              </p>
              <div className="space-y-2">
                {engines.map((engine) => (
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
                        {t(engine.label)}
                        {engine.value === 'mfr' && (
                          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            {t('Recommended')}
                          </span>
                        )}
                        <span className={`ml-2 text-xs ${engineBadge(engine.value).className}`}>
                          {engineBadge(engine.value).text}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">{t(engine.desc)}</div>
                    </div>
                  </label>
                ))}
              </div>
              <FieldError
                message={
                  localEngine
                    ? errors.recognition !== modelStatus?.error
                      ? errors.recognition
                      : undefined
                    : errors.recognition || engineStatuses?.[local.ocrEngine].error
                }
              />
            </section>

            {!localEngine && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t('API Configuration')}</h2>
                <label className="block">
                  <span className="text-sm font-medium">{t('API URL')}</span>
                  <input
                    type="text"
                    value={local.apiUrl}
                    placeholder="https://xxxxx.aistudio-hub.baidu.com"
                    spellCheck={false}
                    onChange={(event) => settingsSession.edit('apiUrl', event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">{t('Access Token')}</span>
                  <div className="flex gap-2 mt-1">
                    <input
                      type={showToken ? 'text' : 'password'}
                      aria-label={t('Access Token')}
                      value={local.accessToken}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => settingsSession.edit('accessToken', event.target.value)}
                      className="min-w-0 flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="btn-secondary"
                    >
                      {showToken ? t('Hide') : t('Show')}
                    </button>
                  </div>
                  <span className="block mt-1 text-xs text-gray-500">
                    {t('Leave blank if your self-hosted server does not require authentication.')}
                  </span>
                </label>
                <label className="block">
                  <span className="text-sm font-medium">{t('Pipeline')}</span>
                  <select
                    value={local.pipeline}
                    onChange={(event) =>
                      settingsSession.edit('pipeline', event.target.value as Pipeline)
                    }
                    className={inputClass}
                  >
                    {pipelines.map((pipeline) => (
                      <option key={pipeline.value} value={pipeline.value}>
                        {pipeline.label}
                      </option>
                    ))}
                  </select>
                  <span className="block mt-1 text-xs text-gray-500">
                    {message(
                      pipelines.find((pipeline) => pipeline.value === local.pipeline)?.desc ?? '',
                    )}
                  </span>
                </label>
                {(!activeEngine || cloudDraftDirty) && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void settingsSession.connect()}
                        disabled={!canConnect || connecting}
                        className="btn-primary disabled:opacity-50"
                      >
                        {connecting ? t('Connecting...') : t('Connect & Use')}
                      </button>
                      {cloudDraftDirty && (
                        <button
                          type="button"
                          onClick={() => settingsSession.resetRecognition()}
                          disabled={connecting}
                          className="btn-secondary disabled:opacity-50"
                        >
                          {t('Cancel')}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {t(
                        'Connect runs one test recognition request and enables this engine after success.',
                      )}
                    </p>
                  </div>
                )}
              </section>
            )}
            <LocalModels
              selected={localEngine ? (local.ocrEngine as 'mfr' | 'texteller') : null}
              engineInUse={engineInUse}
            />
          </>
        )}

        {tab === 'snipping' && (
          <section>
            <div className="mb-4">
              <span className="text-sm font-medium">{t('Snip Hotkey')}</span>
              <HotkeyInput
                value={local.snipHotkey}
                onChange={(accelerator) => settingsSession.edit('snipHotkey', accelerator, true)}
              />
              <FieldError message={errors.snipHotkey} />
              {hotkeyBlocked && (
                <div role="alert" className="mt-2 flex items-start gap-3">
                  <p className="flex-1 text-sm text-red-600 dark:text-red-400">
                    {t(
                      'This shortcut is used by another application, so it does not work. Choose a different shortcut, or close that application and retry.',
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={retryHotkey}
                    disabled={retryingHotkey}
                    className="btn-secondary !py-1"
                  >
                    {t('Retry')}
                  </button>
                </div>
              )}
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
        )}

        {tab === 'output' && (
          <section>
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
        )}

        {tab === 'general' && (
          <section>
            <label className="mb-4 flex items-start gap-3">
              <input
                type="checkbox"
                checked={local.launchAtLogin}
                onChange={(event) =>
                  settingsSession.edit('launchAtLogin', event.target.checked, true)
                }
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium">
                  {t('Start OpenMathpix when I sign in')}
                </span>
                <span className="block text-xs text-gray-500">
                  {t('It starts in the notification area, so the snip hotkey works right away.')}
                </span>
              </span>
            </label>
            <FieldError message={errors.launchAtLogin} />
            <fieldset className="mb-4">
              <legend className="text-sm font-medium">{t('Language')}</legend>
              <div className="flex gap-4 mt-2">
                {languages.map((item) => (
                  <label key={item.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="language"
                      checked={local.language === item.value}
                      onChange={() => settingsSession.edit('language', item.value, true)}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t('Also available from the View → Language menu.')}
              </p>
              <FieldError message={errors.language} />
            </fieldset>
            <fieldset className="mb-4">
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
                onChange={(event) =>
                  settingsSession.edit('historyLimit', event.target.valueAsNumber)
                }
                onBlur={() => settingsSession.flush('historyLimit')}
                className={`${inputClass} !w-24`}
              />
              <FieldError message={errors.historyLimit} />
            </label>
            <div className="mt-4 flex items-center justify-between gap-3 rounded border border-gray-200 p-3 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium">{t('Recognition history')}</p>
                <p className="text-xs text-gray-500">
                  {t('Deletes every saved snip and its result. Settings and models are kept.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void clearHistory()}
                disabled={clearingHistory}
                className="btn-secondary shrink-0 text-red-600 disabled:opacity-50 dark:text-red-400"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                {t('Clear History...')}
              </button>
            </div>
          </section>
        )}
      </div>
    </form>
  );
}
