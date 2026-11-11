import React, { useSyncExternalStore } from 'react';
import type { LocalOCREngine, ModelSource } from '../../shared/types';
import { useAppStore } from '../store';
import { settingsSession } from '../settings-session';
import { engineIsActive } from '../engine-status';
import { useI18n } from '../hooks/useI18n';
import { useLocalModel, type LocalModelController } from '../hooks/useLocalModel';
import ModelTestView from './ModelTestView';
import { FolderIcon, PlayIcon } from './Icons';

/** Keep the meaningful end of a long folder path, e.g. …\models\mfr-1.5\1cef9f0b… */
export function shortModelPath(path: string): string {
  if (path.length <= 48) return path;
  const separator = path.includes('\\') ? '\\' : '/';
  const tail = path
    .split(/[\\/]/)
    .filter(Boolean)
    .slice(-3)
    .map((part) => (/^[a-f0-9]{40}$/.test(part) ? `${part.slice(0, 8)}…` : part));
  return `…${separator}${tail.join(separator)}`;
}

const secondaryButton =
  'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors';
const smallButton =
  'inline-flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors';

/**
 * Every local model in one list: each can be downloaded, imported, tested, opened or removed
 * on its own, without changing the engine in use. The row of the selected local engine is
 * expanded with its setup steps.
 */
export default function LocalModels({
  selected,
  engineInUse,
}: {
  /** The local engine chosen under Recognition Engine, if any. */
  selected: LocalOCREngine | null;
  /** The engine that keeps working while the selected one is only being previewed. */
  engineInUse?: string;
}) {
  const { t } = useI18n();
  const mfr = useLocalModel('mfr');
  const texteller = useLocalModel('texteller');
  const models = [mfr, texteller];
  const selectedModel = models.find((model) => model.engine === selected);
  const settings = useAppStore((state) => state.settings);
  const modelSource =
    useSyncExternalStore(settingsSession.subscribe, settingsSession.getSnapshot).draft
      ?.modelSource ??
    settings?.modelSource ??
    'huggingface';
  const anyBusy = models.some((model) => model.busy);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t('Local Models')}</h2>
      <p className="text-xs text-gray-500 mb-3">
        {t('Download, test or remove each model here. This does not change the engine in use.')}
      </p>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
        {models.map((model) => (
          <ModelRow
            key={model.engine}
            model={model}
            expanded={model.engine === selected}
            engineInUse={model.engine === selected ? engineInUse : undefined}
          />
        ))}
      </div>

      <details className="mt-3 text-xs text-gray-500">
        <summary className="cursor-pointer font-medium">{t('Advanced model options')}</summary>
        <div className="mt-3 space-y-4">
          <div>
            <p className="font-medium text-gray-600 dark:text-gray-300">
              {t('Model storage location')}
            </p>
            {models.map((model) => (
              <div key={model.engine} className="flex items-start gap-2 mt-1">
                <p className="min-w-0 flex-1 break-all pt-2">
                  <span className="font-medium text-gray-600 dark:text-gray-300">
                    {model.info.name}:{' '}
                  </span>
                  {model.downloadDirectory || t('Application data folder (default)')}
                </p>
                <button
                  type="button"
                  onClick={() => void model.chooseLocation()}
                  disabled={model.disabled}
                  aria-label={t('Change {model} storage location', { model: model.info.name })}
                  className={secondaryButton}
                >
                  {t('Change...')}
                </button>
              </div>
            ))}
            <p className="mt-1">
              {t('Saved for future downloads. Existing model files stay where they are.')}
            </p>
          </div>
          <label className="block">
            <span className="font-medium text-gray-600 dark:text-gray-300">
              {t('Download source')}
            </span>
            <select
              value={modelSource}
              disabled={anyBusy}
              onChange={(event) =>
                settingsSession.edit('modelSource', event.target.value as ModelSource, true)
              }
              className="mt-1 block w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="huggingface">{t('Hugging Face (official)')}</option>
              <option value="hf-mirror">{t('hf-mirror.com (mirror)')}</option>
            </select>
            <span className="mt-1 block">
              {t('Use the mirror if the official download is slow or unavailable.')}
            </span>
          </label>
          {selectedModel?.ready && (
            <div>
              <p className="font-medium text-gray-600 dark:text-gray-300">
                {t('Use a different {model} folder', { model: selectedModel.info.name })}
              </p>
              <button
                type="button"
                onClick={() => void selectedModel.configure('select')}
                disabled={selectedModel.disabled}
                className={`${secondaryButton} mt-1`}
              >
                {t('Import Existing Model...')}
              </button>
            </div>
          )}
          <details className="space-y-2">
            <summary className="cursor-pointer">
              {t('Optional: download files in your browser')}
            </summary>
            <p>
              {t(
                'Use this only if automatic download is unavailable. Skip it if the model is already ready.',
              )}
            </p>
            <p>{t('Download these files into one folder, then choose Import Existing Model.')}</p>
            {models.map((model) => (
              <div key={model.engine}>
                <button
                  type="button"
                  onClick={() => void model.openPage()}
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  {t('{model} model files', { model: model.info.name })}
                </button>
                <ul className="mt-1 font-mono space-y-1">
                  {model.info.files.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        </div>
      </details>
    </section>
  );
}

function ModelRow({
  model,
  expanded,
  engineInUse,
}: {
  model: LocalModelController;
  expanded: boolean;
  engineInUse?: string;
}) {
  const { t, message } = useI18n();
  const { settings, engineStatuses, mfrStatus, textellerStatus } = useAppStore();
  const inUse =
    !!settings &&
    engineIsActive(model.engine, settings, engineStatuses, mfrStatus, textellerStatus);
  const { status, info } = model;
  const name = info.name;
  const badge = inUse
    ? { text: t('Active'), className: 'text-green-600 dark:text-green-400' }
    : status?.state === 'downloading'
      ? {
          text:
            model.progress !== undefined
              ? t('Downloading {percent}%', { percent: Math.floor(model.progress) })
              : t('Downloading...'),
          className: 'text-blue-600 dark:text-blue-400',
        }
      : model.checking || (status && ['validating', 'loading', 'clearing'].includes(status.state))
        ? { text: t('Checking...'), className: 'text-gray-500 dark:text-gray-400' }
        : model.resumable && status
          ? {
              text: t('Paused {percent}%', {
                percent: Math.floor(
                  (status.downloadedBytes / Math.max(status.totalBytes, 1)) * 100,
                ),
              }),
              className: 'text-amber-600 dark:text-amber-400',
            }
          : model.error && model.installed
            ? { text: t('Needs attention'), className: 'text-amber-600 dark:text-amber-400' }
            : model.ready
              ? { text: t('Installed'), className: 'text-gray-600 dark:text-gray-300' }
              : { text: t('Not installed'), className: 'text-gray-400 dark:text-gray-500' };

  return (
    <div className={`p-3 ${expanded ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {name}
            <span className={`ml-2 text-xs ${badge.className}`}>{badge.text}</span>
          </p>
          <p
            className="mt-0.5 text-xs text-gray-500 break-all"
            title={model.ready ? model.modelPath : undefined}
          >
            {t('About {size} MB', { size: info.sizeMb })}
            {model.ready && model.modelPath ? ` · ${shortModelPath(model.modelPath)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {status?.state === 'downloading' ? (
            <button
              type="button"
              onClick={model.cancelDownload}
              aria-label={t('Cancel {model} download', { model: name })}
              className={smallButton}
            >
              {t('Cancel')}
            </button>
          ) : model.installed ? (
            <>
              {model.resumable && !expanded && (
                <button
                  type="button"
                  onClick={() => void model.configure('download')}
                  disabled={model.disabled}
                  aria-label={t('Resume {model} download', { model: name })}
                  className={smallButton}
                >
                  {t('Resume')}
                </button>
              )}
              {model.ready && (
                <>
                  <button
                    type="button"
                    onClick={() => void model.test()}
                    disabled={model.disabled || model.operation === 'test'}
                    aria-label={t('Test {model}', { model: name })}
                    title={t('Recognize a sample formula with this model')}
                    className={smallButton}
                  >
                    <PlayIcon className="w-3 h-3" />
                    {t('Test')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void model.openFolder()}
                    aria-label={t('Open {model} folder', { model: name })}
                    title={t('Open the model folder')}
                    className={smallButton}
                  >
                    <FolderIcon className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => void model.remove()}
                disabled={model.disabled}
                aria-label={
                  model.imported
                    ? t('Disconnect {model}', { model: name })
                    : model.resumable
                      ? t('Discard {model} download', { model: name })
                      : t('Uninstall {model}', { model: name })
                }
                className={`${smallButton} text-red-600 dark:text-red-400`}
              >
                {model.imported ? t('Disconnect') : model.resumable ? t('Discard') : t('Uninstall')}
              </button>
            </>
          ) : (
            !expanded && (
              <>
                <button
                  type="button"
                  onClick={() => void model.configure('download')}
                  disabled={model.disabled}
                  aria-label={t('Download {model}', { model: name })}
                  className={smallButton}
                >
                  {t('Download')}
                </button>
                <button
                  type="button"
                  onClick={() => void model.configure('select')}
                  disabled={model.disabled}
                  aria-label={t('Import {model}...', { model: name })}
                  className={smallButton}
                >
                  {t('Import...')}
                </button>
              </>
            )
          )}
        </div>
      </div>

      {expanded ? (
        <SetupSteps model={model} inUse={inUse} engineInUse={engineInUse} />
      ) : (
        model.error && (
          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400 break-words">
            {message(model.error)}
          </p>
        )
      )}
      {model.operation === 'test' && (
        <p role="status" className="mt-2 text-xs text-gray-500">
          {t('Recognizing the sample formula...')}
        </p>
      )}
      {model.testResult && (
        <ModelTestView result={model.testResult} onClose={model.clearTestResult} />
      )}
    </div>
  );
}

/** What the selected local engine needs next: download or import, progress, or problems. */
function SetupSteps({
  model,
  inUse,
  engineInUse,
}: {
  model: LocalModelController;
  inUse: boolean;
  engineInUse?: string;
}) {
  const { t, message } = useI18n();
  const isRecognizing = useAppStore((state) => state.isRecognizing);
  const { status, operation, error, info } = model;
  const name = info.name;
  // "Repair" only makes sense for files this app downloaded; an imported folder or a failed
  // import is fixed by downloading (or importing) the model instead.
  const repairDownload = !!error && status?.managed !== false && (status?.downloadedBytes ?? 0) > 0;
  const brokenFolder = error && model.imported ? model.modelPath : undefined;

  return (
    <div className="mt-3 space-y-3">
      <div role="status" aria-live="polite">
        <p className="text-sm font-medium">
          {status?.state === 'clearing' || operation === 'clear'
            ? t('Removing model...')
            : status?.state === 'downloading'
              ? t('Downloading {model}...', { model: name })
              : status?.state === 'validating'
                ? t('Verifying local model files...')
                : status?.state === 'loading' || model.checking
                  ? t('Loading and testing local model...')
                  : operation === 'select'
                    ? t('Selecting and checking a model folder...')
                    : operation === 'download'
                      ? t('Preparing local model...')
                      : inUse
                        ? t('{model} is ready', { model: name })
                        : !status
                          ? t('Checking local model...')
                          : error
                            ? t('Model unavailable')
                            : model.installed
                              ? t('{model} is installed', { model: name })
                              : t('{model} is not installed', { model: name })}
        </p>
        <p
          className={`mt-1 text-xs ${inUse ? 'text-green-700 dark:text-green-400' : 'text-gray-500'}`}
        >
          {inUse
            ? t('Click New Snip in the top-right corner to start.')
            : t('Offline formula recognition, about {size} MB, no API account needed', {
                size: info.sizeMb,
              })}
        </p>
      </div>

      {engineInUse && !model.busy && (
        <div className="flex items-start gap-3 rounded bg-white/70 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <p className="flex-1 pt-1">
            {t('{engine} stays in use until this model is installed.', { engine: engineInUse })}
          </p>
          <button
            type="button"
            onClick={() => settingsSession.resetRecognition()}
            className="btn-secondary !py-1 !text-xs"
          >
            {t('Cancel')}
          </button>
        </div>
      )}

      {status?.state === 'downloading' && (
        <div>
          <progress
            aria-label={t('{model} model download', { model: name })}
            max={100}
            value={model.progress}
            className="block w-full h-2 accent-blue-600"
          />
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {model.progress !== undefined
                ? `${(status.downloadedBytes / 1_000_000).toFixed(1)} / ${(status.totalBytes / 1_000_000).toFixed(1)} MB (${Math.floor(model.progress)}%)`
                : t('Preparing download...')}
            </p>
            <button
              type="button"
              onClick={model.cancelDownload}
              className="btn-secondary !py-0.5 !text-xs"
            >
              {t('Cancel Download')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="text-sm text-red-600 dark:text-red-400">
          <p className="break-words">{message(error)}</p>
          {brokenFolder && !inUse && (
            <p className="mt-1 break-all text-xs">
              {t('Model folder: {path}', { path: brokenFolder })}
            </p>
          )}
          {inUse && <p className="mt-1">{t('Your previous model remains available.')}</p>}
        </div>
      )}

      {!inUse && (!model.ready || !!error) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void model.configure('download')}
              disabled={model.disabled || isRecognizing}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {repairDownload
                ? t('Repair Download')
                : model.resumable
                  ? t('Resume Download')
                  : t('Download Local Model')}
            </button>
            <span className="text-xs text-gray-400">{t('or')}</span>
            <button
              type="button"
              onClick={() => void model.configure('select')}
              disabled={model.disabled || isRecognizing}
              className={secondaryButton}
            >
              {t('Import Existing Model...')}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {t('Choose one. The model is checked and enabled automatically.')}
          </p>
        </div>
      )}
    </div>
  );
}
