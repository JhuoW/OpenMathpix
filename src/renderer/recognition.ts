import type { AppSettings, OCRResult, OutputFormat } from '../shared/types';

interface RecognitionState {
  currentImage: string | null;
  ocrResult: OCRResult | null;
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
}

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
      error: null,
      isRecognizing: true,
      currentPage: 'result',
    });

    try {
      const result = await deps.recognize(imageBase64);
      deps.setState({ ocrResult: result, activeTab: format });
      const notifications: string[] = [];
      if (result[format]) {
        try {
          await deps.copyText(result[format]);
          notifications.push('Copied!');
        } catch {
          // Clipboard access can fail independently of a successful OCR request.
          notifications.push('Recognized successfully. Copy failed; use the Copy button to retry.');
        }
      }
      if (result.warning) notifications.push(result.warning);
      if (notifications.length) deps.showToast(notifications.join(' '));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recognition failed';
      deps.setState({
        error: message.replace(/^Error invoking remote method 'ocr:recognize': (?:Error: )?/, ''),
      });
    } finally {
      deps.setState({ isRecognizing: false });
    }
  };
}
