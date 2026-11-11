import type { AppSettings, OCRResult, OutputFormat } from '../shared/types';

interface RecognitionState {
  currentImage: string | null;
  ocrResult: OCRResult | null;
  baseline?: OCRResult | null;
  isRecognizing: boolean;
  error: string | null;
  activeTab: OutputFormat | 'image';
  currentPage: 'result' | 'settings' | 'history';
  settings: AppSettings | null;
}

interface RecognitionDependencies {
  getState: () => RecognitionState;
  setState: (state: Partial<RecognitionState>) => void;
  recognize: (image: string) => Promise<OCRResult>;
  copyText: (text: string) => Promise<void>;
  showToast: (message: string) => void;
  /** Clipboard text for a format; may apply a LaTeX copy style such as MathML. */
  copyFor?: (result: OCRResult, format: OutputFormat) => string;
  /**
   * Report the outcome outside the window, e.g. as a system notification. `source` is the
   * tab's text before a copy style such as MathML was applied.
   */
  notify?: (outcome: CopiedOutcome | { error: string }) => void;
}

export interface CopiedOutcome {
  copied: string;
  source: string;
}

/** MathML markup is unreadable in a notification; show the formula it encodes instead. */
export function describeCopy(outcome: CopiedOutcome): { mathml: boolean; body: string } {
  const mathml = /^\s*<math\b/.test(outcome.copied);
  return { mathml, body: mathml ? outcome.source : outcome.copied };
}

const stripRemotePrefix = (message: string) =>
  message.replace(/^Error invoking remote method 'ocr:recognize': (?:Error: )?/, '');

// All input paths (capture, paste, drop and retry) share the same lifecycle.
export function createRecognizer(deps: RecognitionDependencies) {
  return async (imageBase64: string): Promise<void> => {
    if (deps.getState().isRecognizing) {
      deps.showToast('Recognition in progress. Please wait.');
      return;
    }
    const format = deps.getState().settings?.defaultOutputFormat ?? 'latex';
    deps.setState({
      currentImage: imageBase64,
      ocrResult: null,
      baseline: null,
      error: null,
      isRecognizing: true,
      currentPage: 'result',
    });

    try {
      const result = await deps.recognize(imageBase64);
      deps.setState({ ocrResult: result, baseline: result, activeTab: format });
      const notifications: string[] = [];
      let text = result[format];
      try {
        if (deps.copyFor) text = deps.copyFor(result, format);
      } catch {
        // e.g. LaTeX that KaTeX cannot convert to MathML: plain LaTeX is still useful.
        notifications.push('Could not apply the copy style; copied plain LaTeX instead.');
      }
      let copied = '';
      if (text) {
        try {
          await deps.copyText(text);
          copied = text;
          notifications.unshift('Copied!');
        } catch {
          // Clipboard access can fail independently of a successful OCR request.
          notifications.push('Recognized successfully. Copy failed; use the Copy button to retry.');
        }
      }
      if (result.warning) notifications.push(result.warning);
      if (notifications.length) deps.showToast(notifications.join(' '));
      if (copied) deps.notify?.({ copied, source: result[format] });
    } catch (error) {
      const message = stripRemotePrefix(
        error instanceof Error ? error.message : 'Recognition failed',
      );
      deps.setState({ error: message });
      deps.notify?.({ error: message });
    } finally {
      deps.setState({ isRecognizing: false });
    }
  };
}
