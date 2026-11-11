import React from 'react';
import { useAppStore } from '../store';
import { engineIsActive } from '../engine-status';
import { settingsSession } from '../settings-session';
import { useI18n } from '../hooks/useI18n';
import { useLocalModel, type LocalModelController } from '../hooks/useLocalModel';
import type { TranslationKey } from '../../shared/i18n';
import ModelTestView from './ModelTestView';
import Kbd from './Kbd';
import { CheckIcon, DownloadIcon, PlayIcon, SnipIcon } from './Icons';

const steps: TranslationKey[] = ['Choose a model', 'Download', 'Try it'];

/**
 * First-run guide on the start page, shown while no engine works: choose a local model,
 * download it with visible progress, then recognize a sample formula and snip.
 */
export default function GetStarted() {
  const { t } = useI18n();
  const { settings, engineStatuses, mfrStatus, textellerStatus } = useAppStore();
  const mfr = useLocalModel('mfr');
  const texteller = useLocalModel('texteller');
  const models = [mfr, texteller];
  const ready =
    !!settings &&
    engineIsActive(settings.ocrEngine, settings, engineStatuses, mfrStatus, textellerStatus);
  const preparing = models.find(
    (model) =>
      model.operation === 'download' ||
      model.operation === 'select' ||
      (!!model.status && ['downloading', 'validating', 'loading'].includes(model.status.state)),
  );
  const step = ready ? 3 : preparing ? 2 : 1;
  const active = models.find((model) => model.engine === settings?.ocrEngine);

  const openSettings = () => {
    useAppStore.getState().setSettingsTab('recognition');
    useAppStore.getState().setCurrentPage('settings');
  };

  const choose = async (model: LocalModelController) => {
    useAppStore.getState().setGuideActive(true);
    // Nothing works yet, so choosing the engine applies at once; finish that before
    // the download starts, so the two model operations never overlap.
    settingsSession.edit('ocrEngine', model.engine, true);
    await settingsSession.flushAndWait();
    if (!model.ready) await model.configure('download', { quiet: true });
  };

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      <div className="mx-auto max-w-xl">
        <h2 className="text-lg font-semibold">{t('Welcome to OpenMathpix')}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {t('Set up offline formula recognition. Your screenshots never leave this computer.')}
        </p>
        <ol className="mt-5 flex items-center gap-2 text-xs" aria-label={t('Setup steps')}>
          {steps.map((label, index) => {
            const number = index + 1;
            const done = number < step || (number === 3 && !!active?.testResult);
            return (
              <li key={label} className="flex items-center gap-2">
                {index > 0 && <span className="h-px w-6 bg-gray-300 dark:bg-gray-600" />}
                <span
                  aria-current={number === step ? 'step' : undefined}
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                    done
                      ? 'bg-green-600 text-white'
                      : number === step
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {done ? <CheckIcon className="h-3 w-3" /> : number}
                </span>
                <span
                  className={
                    number === step
                      ? 'font-medium text-gray-900 dark:text-gray-100'
                      : 'text-gray-500'
                  }
                >
                  {t(label)}
                </span>
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Choice
                model={mfr}
                badge={t('Recommended')}
                description={t('Fast and small. Handles most everyday formulas.')}
                onChoose={() => void choose(mfr)}
              />
              <Choice
                model={texteller}
                badge={t('Most accurate')}
                description={t('Best for long, multi-line and complex formulas.')}
                onChoose={() => void choose(texteller)}
              />
            </div>
            <p className="mt-4 text-xs text-gray-500">
              {t('Already have the model files, or prefer the PaddleOCR cloud API?')}{' '}
              <button
                type="button"
                onClick={openSettings}
                className="text-blue-600 underline dark:text-blue-400"
              >
                {t('Open Settings')}
              </button>
            </p>
          </>
        )}

        {step === 2 && preparing && <Progress model={preparing} />}

        {step === 3 && (
          <TryIt model={active} onDone={() => useAppStore.getState().setGuideActive(false)} />
        )}
      </div>
    </div>
  );
}

function Choice({
  model,
  badge,
  description,
  onChoose,
}: {
  model: LocalModelController;
  badge: string;
  description: string;
  onChoose: () => void;
}) {
  const { t, message } = useI18n();
  const name = model.info.name;
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <p className="text-sm font-semibold">
        {name}
        <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {badge}
        </span>
      </p>
      <p className="mt-1 flex-1 text-xs text-gray-600 dark:text-gray-300">{description}</p>
      <p className="mt-2 text-xs text-gray-400">
        {model.ready ? t('Installed') : t('About {size} MB download', { size: model.info.sizeMb })}
      </p>
      {model.error && (
        <p role="alert" className="mt-2 break-words text-xs text-red-600 dark:text-red-400">
          {message(model.error)}
        </p>
      )}
      <button
        type="button"
        onClick={onChoose}
        disabled={model.disabled}
        className="btn-primary mt-3 justify-center"
      >
        {!model.ready && <DownloadIcon className="h-3.5 w-3.5" />}
        {model.ready
          ? t('Use {model}', { model: name })
          : model.resumable
            ? t('Resume {model} download', { model: name })
            : t('Download {model}', { model: name })}
      </button>
    </div>
  );
}

function Progress({ model }: { model: LocalModelController }) {
  const { t } = useI18n();
  const { status, progress, info } = model;
  const downloading = status?.state === 'downloading';
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
    >
      <p className="text-sm font-medium">
        {downloading
          ? t('Downloading {model}...', { model: info.name })
          : t('Checking and loading {model}...', { model: info.name })}
      </p>
      {downloading ? (
        <>
          <progress
            aria-label={t('{model} model download', { model: info.name })}
            max={100}
            value={progress}
            className="mt-3 block h-2 w-full accent-blue-600"
          />
          <p className="mt-1 text-xs text-gray-500">
            {progress !== undefined && status
              ? `${(status.downloadedBytes / 1_000_000).toFixed(1)} / ${(status.totalBytes / 1_000_000).toFixed(1)} MB (${Math.floor(progress)}%)`
              : t('Preparing download...')}
          </p>
        </>
      ) : (
        <div className="mt-3 h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {t('This continues in the background; you can switch to other apps.')}
        </p>
        {downloading && (
          <button type="button" onClick={model.cancelDownload} className="btn-secondary !text-xs">
            {t('Cancel Download')}
          </button>
        )}
      </div>
    </div>
  );
}

function TryIt({ model, onDone }: { model?: LocalModelController; onDone: () => void }) {
  const { t, message } = useI18n();
  const hotkey = useAppStore((state) => state.settings?.snipHotkey) ?? 'CommandOrControl+Shift+S';
  const showToast = useAppStore((state) => state.showToast);
  return (
    <div className="mt-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <p className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
        <CheckIcon className="h-4 w-4" />
        {model ? t('{model} is ready', { model: model.info.name }) : t('Ready')}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {t('Try it on a sample formula, then snip your own from any app.')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {model && (
          <button
            type="button"
            onClick={() => void model.test()}
            disabled={model.operation === 'test'}
            className="btn-secondary disabled:opacity-50"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            {t('Recognize a sample formula')}
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            window.api.startSnip().catch(() => showToast('Could not start screen capture.'))
          }
          className="btn-primary"
        >
          <SnipIcon />
          {t('Snip a formula')}
        </button>
      </div>
      {model?.operation === 'test' && (
        <p role="status" className="mt-2 text-xs text-gray-500">
          {t('Recognizing the sample formula...')}
        </p>
      )}
      {model?.testResult && <ModelTestView result={model.testResult} />}
      {model?.error && (
        <p role="alert" className="mt-2 break-words text-xs text-red-600 dark:text-red-400">
          {message(model.error)}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          {t('Snip from any app')}
          <Kbd accelerator={hotkey} />
        </span>
        <button
          type="button"
          onClick={onDone}
          className="text-blue-600 underline dark:text-blue-400"
        >
          {t('Done')}
        </button>
      </div>
    </div>
  );
}
