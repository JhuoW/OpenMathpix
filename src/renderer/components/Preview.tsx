import React from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useAppStore } from '../store';
import { useI18n } from '../hooks/useI18n';
import { isEdited } from '../result-edit';
import type { OCRResult } from '../../shared/types';
import FormulaPreview from './FormulaPreview';
import GetStarted from './GetStarted';
import { engineIsActive } from '../engine-status';
import SourceEditor from './SourceEditor';
import CopyStyleBar from './CopyStyleBar';
import Kbd from './Kbd';
import { ChevronIcon, DropIcon, SnipIcon, UndoIcon, WarningIcon } from './Icons';

/** Below this probability for any chosen token, ask the user to check the formula. */
const UNCERTAIN_TOKEN_PROBABILITY = 0.4;

export const imageSource = (image: string) =>
  // History thumbnails are JPEG; Chromium sniffs the actual format from the data.
  `data:image/png;base64,${image}`;

export default function Preview() {
  const {
    ocrResult,
    activeTab,
    currentImage,
    settings,
    mfrStatus,
    textellerStatus,
    engineStatuses,
    guideActive,
  } = useAppStore();

  // Without a result the format tabs are hidden, so the start page must not stay on Image.
  if (activeTab === 'image' && (ocrResult || currentImage))
    return <ImageView image={currentImage} />;
  if (!ocrResult) {
    if (!settings) return <EmptyState />;
    // Until an engine works, the start page guides setup; it also stays for its last step.
    if (guideActive) return <GetStarted />;
    if (engineIsActive(settings.ocrEngine, settings, engineStatuses, mfrStatus, textellerStatus))
      return <EmptyState />;
    if (!engineStatuses || engineStatuses[settings.ocrEngine].state === 'checking')
      return <Preparing />;
    return <GetStarted />;
  }
  if (activeTab === 'latex') return <LatexView result={ocrResult} />;
  if (activeTab === 'markdown') return <MarkdownView result={ocrResult} />;
  return <TextView result={ocrResult} />;
}

/** The saved engine is starting up, e.g. a local model loading after launch. */
function Preparing() {
  const { t } = useI18n();
  const engine = useAppStore((state) => state.settings?.ocrEngine);
  const name =
    engine === 'mfr' ? 'MFR-1.5' : engine === 'texteller' ? 'TexTeller' : 'PaddleOCR API';
  return (
    <div className="flex-1 flex items-center justify-center px-8 text-center">
      <div role="status" className="max-w-sm space-y-3">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-sm font-medium">{t('Loading {model}...', { model: name })}</p>
        <p className="text-sm text-gray-500">
          {t('The model will be available when verification and initialization finish.')}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useI18n();
  const { settings, showToast } = useAppStore();
  const hotkey = settings?.snipHotkey ?? 'CommandOrControl+Shift+S';
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
          <SnipIcon className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold">{t('Snip a formula to get LaTeX')}</h2>
        <ul className="mt-5 space-y-2.5 text-left text-sm text-gray-600 dark:text-gray-300">
          <li className="flex items-center justify-between gap-4">
            <span>{t('Snip from any app')}</span>
            <Kbd accelerator={hotkey} />
          </li>
          <li className="flex items-center justify-between gap-4">
            <span>{t('Paste an image')}</span>
            <Kbd accelerator="CommandOrControl+V" />
          </li>
          <li className="flex items-center justify-between gap-4">
            <span>{t('Drop an image file here')}</span>
            <DropIcon className="w-4 h-4 text-gray-400" />
          </li>
        </ul>
        <button
          onClick={() =>
            window.api.startSnip().catch(() => showToast('Could not start screen capture.'))
          }
          className="btn-primary mt-6 w-full justify-center"
        >
          <SnipIcon />
          {t('New Snip')}
        </button>
      </div>
    </div>
  );
}

function ImageView({ image }: { image: string | null }) {
  const { t } = useI18n();
  if (!image) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        {t('No image captured.')}
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
      <img
        src={imageSource(image)}
        alt={t('Captured')}
        className="max-w-full rounded border border-gray-200 dark:border-gray-700 bg-white"
      />
    </div>
  );
}

function SnipThumbnail() {
  const { t } = useI18n();
  const { currentImage, setActiveTab } = useAppStore();
  if (!currentImage) return null;
  return (
    <button
      type="button"
      onClick={() => setActiveTab('image')}
      title={t('Show the captured image')}
      className="block mx-auto rounded border border-gray-200 dark:border-gray-700 bg-white p-1 hover:border-blue-400 transition-colors"
    >
      <img src={imageSource(currentImage)} alt={t('Captured')} className="max-h-20 max-w-full" />
    </button>
  );
}

function EditedNotice() {
  const { t } = useI18n();
  const { ocrResult, baseline, resetEdits } = useAppStore();
  if (!isEdited(ocrResult, baseline)) return null;
  return (
    <span className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
      {t('Edited')}
      <button
        type="button"
        onClick={resetEdits}
        className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
      >
        <UndoIcon className="w-3.5 h-3.5" />
        {t('Reset')}
      </button>
    </span>
  );
}

function ConfidenceNotice({ result }: { result: OCRResult }) {
  const { t } = useI18n();
  const { baseline } = useAppStore();
  const confidence = result.confidence;
  // Confidence describes the model output, not text the user has since corrected.
  if (!confidence || isEdited(result, baseline)) return null;
  const uncertain = confidence.lowest < UNCERTAIN_TOKEN_PROBABILITY;
  if (!uncertain) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
    >
      <WarningIcon className="mt-0.5 w-3.5 h-3.5 shrink-0" />
      {t('The model was unsure about at least one symbol. Please check the result.')}
    </div>
  );
}

function LatexView({ result }: { result: OCRResult }) {
  const { t } = useI18n();
  const { settings, editResult } = useAppStore();
  const latex = result.latex;
  if (!latex && result.kind !== 'formula') {
    return (
      <div className="flex-1 p-4 text-gray-400 text-sm">
        {settings?.ocrEngine === 'mfr'
          ? t('No LaTeX formula found. Try a clearer snip containing a single formula.')
          : t('No LaTeX formulas found. Try PP-StructureV3 or PaddleOCR-VL pipeline.')}
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <SnipThumbnail />
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-5 shadow-sm">
          <FormulaPreview latex={latex} />
        </div>
        <ConfidenceNotice result={result} />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">{t('LaTeX source')}</span>
            <EditedNotice />
          </div>
          <SourceEditor
            label={t('LaTeX source')}
            value={latex}
            onChange={(value) => editResult('latex', value)}
          />
          <p className="text-[11px] text-gray-400">
            {t('Edit the source to correct the result; copies and history use your changes.')}
          </p>
        </div>
        <CopyStyleBar latex={latex} />
      </div>
    </div>
  );
}

function MarkdownView({ result }: { result: OCRResult }) {
  const { t } = useI18n();
  const { editResult } = useAppStore();
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="markdown-body rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4 shadow-sm">
          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {result.markdown}
          </Markdown>
        </div>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <span className="flex items-center gap-1">
              <ChevronIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              {t('Markdown source')}
            </span>
            <EditedNotice />
          </summary>
          <div className="mt-2">
            <SourceEditor
              label={t('Markdown source')}
              value={result.markdown}
              minRows={4}
              onChange={(value) => editResult('markdown', value)}
            />
          </div>
        </details>
      </div>
    </div>
  );
}

function TextView({ result }: { result: OCRResult }) {
  const { t } = useI18n();
  const { editResult } = useAppStore();
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-1.5 p-4">
        <div className="flex items-center justify-end">
          <EditedNotice />
        </div>
        <SourceEditor
          label={t('Text')}
          value={result.text}
          minRows={6}
          onChange={(value) => editResult('text', value)}
        />
      </div>
    </div>
  );
}
