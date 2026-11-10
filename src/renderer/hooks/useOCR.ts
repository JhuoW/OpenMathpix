import { useEffect } from 'react';
import { useAppStore } from '../store';
import { createRecognizer } from '../recognition';
import { clipboardText } from '../copy';
import { localizeError, translate } from '../../shared/i18n';

export const recognizeImage = createRecognizer({
  getState: useAppStore.getState,
  setState: useAppStore.setState,
  recognize: (image) => window.api.recognize(image),
  copyText: (text) => window.api.copyText(text),
  copyFor: (result, format) => clipboardText(result, format),
  showToast: (message) => useAppStore.getState().showToast(message),
  // The main process shows a notification only when the window is hidden or unfocused.
  notify: (outcome) => {
    const language = useAppStore.getState().settings?.language ?? 'en';
    const [title, body] =
      'copied' in outcome
        ? [translate(language, 'Copied to clipboard'), outcome.copied]
        : [translate(language, 'Recognition failed'), localizeError(language, outcome.error)];
    void window.api.notify(title, body).catch(() => undefined);
  },
});

// Mount only in App: consumers can import recognizeImage without adding listeners.
export function useOCR() {
  useEffect(() => window.api.onSnipCaptured(recognizeImage), []);

  useEffect(
    () =>
      window.api.onSnipError((message) => {
        const state = useAppStore.getState();
        if (state.isRecognizing) {
          state.showToast(message);
          return;
        }
        useAppStore.setState({
          currentImage: null,
          ocrResult: null,
          baseline: null,
          error: message,
          currentPage: 'result',
        });
      }),
    [],
  );

  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      // Pasting into settings/search fields must retain normal text editing.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input, textarea, select') || target.isContentEditable)
      )
        return;
      const hasImage = Array.from(event.clipboardData?.items ?? []).some((item) =>
        item.type.startsWith('image/'),
      );
      if (!hasImage) return;
      event.preventDefault();
      if (useAppStore.getState().isRecognizing) {
        useAppStore.getState().showToast('Recognition in progress. Please wait.');
        return;
      }
      void window.api
        .pasteImage()
        .then((image) => {
          if (image) return recognizeImage(image);
          useAppStore.getState().showToast('No image found in the clipboard.');
        })
        .catch(() => {
          useAppStore.getState().showToast('Could not read the clipboard image.');
        });
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, []);

  return { recognizeImage };
}
